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
