/**
 * Apache AGE pool + Cypher seam (issues #75, #98, #99).
 *
 * Phase-1 cutover (issue #99) made Apache AGE a hard runtime requirement.
 * The supported deployment is the unified `apache/age:PG16_latest` image,
 * so AGE lives on the same Postgres instance as the primary `DATABASE_URL`.
 * `AGE_DATABASE_URL` remains a config knob purely so an operator can point
 * AGE traffic at a separate Postgres if they ever want to; when unset the
 * primary `DATABASE_URL` is used.
 *
 * Design intent
 * -------------
 * - **Required at boot.** `startupRequireAge()` probes the configured
 *   Postgres for the `age` extension and throws when it is missing. There is
 *   no soft-fail / optional-companion fallback. Set `NEXUM_REQUIRE_AGE=false`
 *   only for unit tests that need this module loaded without an AGE server
 *   present.
 * - **Lazy.** The pool is created on first use, not at import time.
 * - **Pooled, not per-call.** `pg.Pool` reuse keeps Cypher latency in line
 *   with regular Postgres queries (single round-trip per `cypher(...)` call).
 * - **search_path is set per-connection** because AGE requires `ag_catalog`
 *   on the search path before any `cypher(...)` call.
 *
 * See `db/migrations/0001_age_shim.sql` for graph/label provisioning and
 * `docs/engineering.md` (Phase-1 AGE-default cutover) for the contract.
 */

import pg from 'pg'
import { config } from '../config.js'

let agePool: pg.Pool | null = null

/**
 * Resolve the Postgres URL the AGE pool should connect to. Defaults to the
 * primary `DATABASE_URL` since the unified `apache/age:PG16_latest` image
 * exposes pgvector and AGE on the same instance.
 */
function ageConnectionUrl(): string {
  return config.AGE_DATABASE_URL || config.DATABASE_URL
}

export function resetAgePool(): void {
  agePool = null
}

/**
 * Returns a configured AGE pool. The pool is created lazily on first use.
 * Connection failures surface to the caller; there is no soft-fail path.
 */
export async function getAgePool(): Promise<pg.Pool> {
  if (agePool) return agePool

  const candidate = new pg.Pool({ connectionString: ageConnectionUrl() })
  // Configure search_path on every fresh connection so cypher(...) resolves.
  candidate.on('connect', (client) => {
    client.query("LOAD 'age'; SET search_path = ag_catalog, \"$user\", public").catch(() => {
      // If LOAD fails the connection is unusable for AGE; subsequent queries
      // will surface the error. We don't tear down the whole pool here.
    })
  })

  agePool = candidate
  return agePool
}

/**
 * Dual-write a single edge into AGE. Idempotent: MERGEs both endpoint
 * vertices and the LINK edge keyed by (src, dst, layer, rel_type).
 *
 * Returns true on success, false on a query error so the caller can decide
 * to retry. Phase-1 makes AGE required at boot, so by the time linker code
 * runs the pool MUST be usable; a write failure here indicates a transient
 * fault, not a missing-AGE configuration.
 */
export async function writeAgeEdge(args: {
  src: string
  dst: string
  layer: string
  relType: string | null
  weight: number
}): Promise<boolean> {
  const pool = await getAgePool()

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
    console.error('age write failed', (err as Error).message)
    return false
  }
}

/**
 * Count LINK edges currently stored in AGE (used by tests).
 * Returns 0 when the graph is empty; throws on connection errors.
 */
export async function countAgeEdges(): Promise<number> {
  const pool = await getAgePool()
  const { rows } = await pool.query(
    `SELECT * FROM cypher('nexum_links', $$ MATCH ()-[r:LINK]->() RETURN count(r) $$) AS (n agtype)`,
  )
  if (rows.length === 0) return 0
  return parseInt(String(rows[0].n).replace(/[^0-9]/g, ''), 10) || 0
}

// -----------------------------------------------------------------------------
// Phase-1 AGE-default cutover seams (issue #98 scout, hardened in #99)
//
// The seams below freeze the contracts for the four follow-on phase-1
// implementation issues:
//   - #99 (this issue) turns `startupRequireAge()` into a hard fail when AGE
//     is missing.
//   - #100 will replace the `backfillLinksToAge()` stub in `db/migrate.ts`
//     with a real backfill that copies every row of `links` into the
//     `nexum_links` graph.
//   - #101 / #102 will route `graphSearch` and `hybridSearch` through the
//     `CypherGraphClient` interface defined here, allowing the recursive-CTE
//     traversal in #103 to be deleted in favour of Cypher.
//
// See `docs/engineering.md` for the contract.
// -----------------------------------------------------------------------------

/**
 * Edge payload accepted by `CypherGraphClient.writeEdge`. Mirrors the shape
 * already consumed by `writeAgeEdge` so call sites can swap onto the
 * interface without a behaviour change.
 */
export interface AgeEdgeInput {
  src: string
  dst: string
  layer: string
  relType: string | null
  weight: number
}

/**
 * Cypher graph client seam (issue #98). Everything that touches the graph
 * goes through this interface so the implementation can swap (real AGE vs.
 * test fake) without leaking pg into call sites.
 *
 * Phase-1 contract (frozen):
 *  - `writeEdge(edge)` — idempotent write of one LINK edge. Returns true on
 *    success, false on a transient query error.
 *  - `countEdges()` — total LINK edges in the `nexum_links` graph.
 *  - `query<T>(cypher)` — execute an arbitrary Cypher statement and return
 *    the raw `agtype` rows.
 *  - `available()` — true iff the AGE pool can connect and the `age`
 *    extension is loaded. Used by `startupRequireAge()` and by tests.
 */
export interface CypherGraphClient {
  writeEdge(edge: AgeEdgeInput): Promise<boolean>
  countEdges(): Promise<number>
  query<T = unknown>(cypher: string): Promise<T[]>
  available(): Promise<boolean>
}

/**
 * Build a CypherGraphClient backed by the runtime AGE pool. The returned
 * client is a thin wrapper — no new state, no new connections.
 */
export function createCypherGraphClient(): CypherGraphClient {
  return {
    writeEdge: (edge) => writeAgeEdge(edge),
    countEdges: () => countAgeEdges(),
    async query<T = unknown>(cypher: string): Promise<T[]> {
      const pool = await getAgePool()
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
      try {
        const pool = await getAgePool()
        const { rows } = await pool.query(
          "SELECT 1 FROM pg_extension WHERE extname = 'age'",
        )
        return rows.length > 0
      } catch {
        return false
      }
    },
  }
}

/**
 * Result of the boot-time AGE gate. After the phase-1 cutover only
 * `mode: 'required'` is reachable on a successful boot; any other state
 * causes `startupRequireAge()` to throw.
 */
export interface StartupRequireAgeResult {
  ok: boolean
  mode: 'required' | 'skipped'
  reason?: string
}

/**
 * Boot-time hard gate (issue #99). Probes the configured Postgres for the
 * `age` extension and throws when it is missing, refusing to bring up a
 * server against a database that cannot serve graph queries.
 *
 * Set `NEXUM_REQUIRE_AGE=false` only for unit tests that need to import
 * this module without a running AGE-capable Postgres. In every real
 * environment the flag stays at its default (true) and AGE is required.
 */
export async function startupRequireAge(): Promise<StartupRequireAgeResult> {
  const required = process.env.NEXUM_REQUIRE_AGE !== 'false'
  if (!required) {
    return { ok: true, mode: 'skipped', reason: 'NEXUM_REQUIRE_AGE=false' }
  }
  let pool: pg.Pool
  try {
    pool = await getAgePool()
  } catch (err) {
    throw new Error(
      `startupRequireAge: failed to connect to AGE Postgres at ${ageConnectionUrl()}: ${(err as Error).message}. ` +
        `Phase-1 requires apache/age:PG16_latest. Set NEXUM_REQUIRE_AGE=false only for unit tests.`,
    )
  }
  let rows: unknown[]
  try {
    const result = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'age'")
    rows = result.rows
  } catch (err) {
    throw new Error(
      `startupRequireAge: failed to probe AGE extension: ${(err as Error).message}`,
    )
  }
  if (rows.length === 0) {
    throw new Error(
      `startupRequireAge: AGE extension not installed on ${ageConnectionUrl()}. ` +
        `Phase-1 requires apache/age:PG16_latest as the Postgres image. ` +
        `Set NEXUM_REQUIRE_AGE=false only for unit tests.`,
    )
  }
  return { ok: true, mode: 'required' }
}
