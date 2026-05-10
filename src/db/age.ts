/**
 * Apache AGE companion-pool helper (issue #75).
 *
 * Phase-2 deliverable. The Phase-1 scout (#78) provisioned the AGE container
 * and the `nexum_links` graph; this module is the runtime seam through which
 * the linker dual-writes typed edges into AGE.
 *
 * Design intent
 * -------------
 * - **Optional dependency.** If `AGE_DATABASE_URL` is unset OR the connection
 *   fails OR the AGE extension is unavailable on the target server, every
 *   helper here becomes a silent no-op. The linker keeps writing to the
 *   primary `links` table and the system stays healthy. This lets the same
 *   image run in environments where AGE is not yet provisioned (CI smoke
 *   tests, local pgvector-only setups) without raising errors.
 * - **Lazy.** The pool is created on first use, not at import time.
 * - **Pooled, not per-call.** `pg.Pool` reuse keeps Cypher latency in line
 *   with regular Postgres queries (single round-trip per `cypher(...)` call).
 * - **search_path is set per-connection** because AGE requires `ag_catalog`
 *   on the search path before any `cypher(...)` call.
 *
 * See `db/migrations/0001_age_shim.sql` for graph/label provisioning and
 * `docs/engineering.md` (Phase-1 Scout Seams) for the seam contract.
 */

import pg from 'pg'
import { config } from '../config.js'

let agePool: pg.Pool | null = null
let ageDisabled = false

export function resetAgePool(): void {
  agePool = null
  ageDisabled = false
}

/**
 * Returns a configured AGE pool, or `null` if AGE is not available.
 * The first call probes the server for the `age` extension; if missing,
 * subsequent calls short-circuit to `null`.
 */
export async function getAgePool(): Promise<pg.Pool | null> {
  if (ageDisabled) return null
  if (!config.AGE_DATABASE_URL) return null
  if (agePool) return agePool

  const candidate = new pg.Pool({ connectionString: config.AGE_DATABASE_URL })
  // Configure search_path on every fresh connection so cypher(...) resolves.
  candidate.on('connect', (client) => {
    client.query("LOAD 'age'; SET search_path = ag_catalog, \"$user\", public").catch(() => {
      // If LOAD fails the connection is unusable for AGE; subsequent queries
      // will surface the error. We don't tear down the whole pool here.
    })
  })

  try {
    const client = await candidate.connect()
    try {
      const { rows } = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'age'")
      if (rows.length === 0) {
        ageDisabled = true
        await candidate.end().catch(() => {})
        return null
      }
    } finally {
      client.release()
    }
  } catch {
    ageDisabled = true
    await candidate.end().catch(() => {})
    return null
  }

  agePool = candidate
  return agePool
}

/**
 * Dual-write a single edge into AGE. Idempotent: MERGEs both endpoint
 * vertices and the LINK edge keyed by (src, dst, layer, rel_type).
 *
 * On any failure, logs to stderr and returns false. The primary `links`
 * row is the source of truth; AGE is a parallel index during phase-2.
 */
export async function writeAgeEdge(args: {
  src: string
  dst: string
  layer: string
  relType: string | null
  weight: number
}): Promise<boolean> {
  const pool = await getAgePool()
  if (!pool) return false

  const { src, dst, layer, relType, weight } = args
  // Cypher inside AGE: parameters are NOT supported by cypher(...) directly,
  // so we inline values. UUIDs are 36-char strings of [0-9a-f-] and `layer`
  // is whitelisted to a CHECK set, so the injection surface is bounded.
  // We still defensively escape single quotes in rel_type.
  const safeRel = (relType ?? '').replace(/'/g, "''")
  const cypher = `
    MERGE (a:Block {id: '${src}'})
    MERGE (b:Block {id: '${dst}'})
    MERGE (a)-[r:LINK {layer: '${layer}', rel_type: '${safeRel}'}]->(b)
    SET r.weight = ${Number.isFinite(weight) ? weight : 1.0}
  `
  try {
    await pool.query(`SELECT * FROM cypher('nexum_links', $$ ${cypher} $$) AS (v agtype)`)
    return true
  } catch (err) {
    console.error('age dual-write failed', (err as Error).message)
    return false
  }
}

/**
 * Count LINK edges currently stored in AGE (used by tests).
 * Returns -1 when AGE is unavailable.
 */
export async function countAgeEdges(): Promise<number> {
  const pool = await getAgePool()
  if (!pool) return -1
  try {
    const { rows } = await pool.query(
      `SELECT * FROM cypher('nexum_links', $$ MATCH ()-[r:LINK]->() RETURN count(r) $$) AS (n agtype)`,
    )
    if (rows.length === 0) return 0
    return parseInt(String(rows[0].n).replace(/[^0-9]/g, ''), 10) || 0
  } catch {
    return -1
  }
}

// -----------------------------------------------------------------------------
// Phase-1 AGE-default cutover seams (issue #98)
//
// The seams below freeze the contracts that the four follow-on phase-1
// implementation issues will fill in:
//   - #2 will turn `startupRequireAge()` into a hard fail when AGE is missing.
//   - #3 will replace the `backfillLinksToAge()` stub in `db/migrate.ts` with a
//     real backfill that copies every row of `links` into the `nexum_links`
//     graph.
//   - #4 / #5 will route `graphSearch` and `hybridSearch` through the
//     `CypherGraphClient` interface defined here, allowing the recursive-CTE
//     traversal in #6 to be deleted in favour of Cypher.
//
// None of those issues exist as code yet; this scout exists ONLY so they can
// land in parallel against frozen names and signatures. See the
// `Phase-1 AGE-default cutover seams (issue #98)` section in
// `docs/engineering.md` for the contract.
// -----------------------------------------------------------------------------

/**
 * Edge payload accepted by `CypherGraphClient.writeEdge`. Mirrors the shape
 * already consumed by `writeAgeEdge` so the soft-fail dual-write code can be
 * adapted into this interface without a behaviour change.
 */
export interface AgeEdgeInput {
  src: string
  dst: string
  layer: string
  relType: string | null
  weight: number
}

/**
 * Cypher graph client seam (issue #98). The phase-1 cutover replaces the
 * recursive-CTE traversal with Cypher queries against AGE; everything that
 * touches the graph from then on goes through this interface so the
 * implementation can swap (real AGE vs. test fake) without leaking pg into
 * call sites.
 *
 * Phase-1 contract (frozen):
 *  - `writeEdge(edge)` — idempotent dual-write of one LINK edge.
 *    Returns `true` on success, `false` when AGE is unavailable or the write
 *    failed. Callers MUST tolerate `false` during phase-1; phase-2 (issue #2)
 *    flips this into a hard failure.
 *  - `countEdges()` — total LINK edges in the `nexum_links` graph, or `-1`
 *    when AGE is unavailable. Used by tests and observability.
 *  - `query<T>(cypher)` — execute an arbitrary Cypher statement and return the
 *    raw `agtype` rows. Returns `[]` when AGE is unavailable. Used by the
 *    forthcoming `graphSearch` / `hybridSearch` ports (issues #4 / #5).
 *  - `available()` — `true` iff `AGE_DATABASE_URL` is set AND the AGE
 *    extension is present on the target server. Used by `startupRequireAge()`
 *    and by callers that need to branch before issuing Cypher.
 */
export interface CypherGraphClient {
  writeEdge(edge: AgeEdgeInput): Promise<boolean>
  countEdges(): Promise<number>
  query<T = unknown>(cypher: string): Promise<T[]>
  available(): Promise<boolean>
}

/**
 * Adapt the existing soft-fail dual-write helpers into the phase-1
 * `CypherGraphClient` interface. The returned client is a thin wrapper —
 * no new state, no new connections — so swapping call sites onto the
 * interface is observably a no-op until the phase-1 implementation issues
 * land.
 */
export function createCypherGraphClient(): CypherGraphClient {
  return {
    writeEdge: (edge) => writeAgeEdge(edge),
    countEdges: () => countAgeEdges(),
    async query<T = unknown>(cypher: string): Promise<T[]> {
      const pool = await getAgePool()
      if (!pool) return []
      try {
        const { rows } = await pool.query(
          `SELECT * FROM cypher('nexum_links', $$ ${cypher} $$) AS (v agtype)`,
        )
        return rows as T[]
      } catch (err) {
        console.error('age cypher query failed', (err as Error).message)
        return []
      }
    },
    async available() {
      return (await getAgePool()) !== null
    },
  }
}

/**
 * Result of the boot-time AGE gate. `mode: 'required'` means AGE was probed
 * and present; `mode: 'optional'` means AGE_DATABASE_URL was unset and the
 * server is allowed to come up without graph storage; `mode: 'unavailable'`
 * means AGE_DATABASE_URL was set but the extension or connection failed.
 */
export interface StartupRequireAgeResult {
  ok: boolean
  mode: 'required' | 'optional' | 'unavailable'
  reason?: string
}

/**
 * Boot-time hook (issue #98 scout). Today this is a no-op probe that reports
 * whether AGE is available; it does NOT block startup under any condition.
 *
 * Issue #2 will flip this into a hard gate: when `NEXUM_REQUIRE_AGE=true`
 * (the phase-1 default), an `unavailable` result will throw and the server
 * will refuse to start. The signature is frozen now so that #2 is a
 * behaviour change, not a refactor.
 */
export async function startupRequireAge(): Promise<StartupRequireAgeResult> {
  if (!config.AGE_DATABASE_URL) {
    return { ok: true, mode: 'optional', reason: 'AGE_DATABASE_URL unset' }
  }
  const pool = await getAgePool()
  if (!pool) {
    // Today: warn and continue. Phase-1 cutover (#2) will throw here.
    console.warn(
      'startupRequireAge: AGE_DATABASE_URL set but extension unavailable; continuing in soft-fail mode (phase-1 cutover will harden this)',
    )
    return { ok: true, mode: 'unavailable', reason: 'AGE extension not present' }
  }
  return { ok: true, mode: 'required' }
}
