/**
 * Phase-4 synthesis write-back route stubs (issue #115 dev-scout).
 *
 * Wires POST /synthesize and GET /blocks into the router with no-op stubs so
 * the four phase-4 implementation issues can develop against a frozen API
 * surface without mutual blocking.
 *
 * Canonical docs
 * --------------
 * - docs/architecture.md   — API surface, block status lifecycle
 * - docs/implementation-plan.md — phase-4 synthesis write-back tasks
 *
 * Follow-on implementation issues (do NOT implement here — stubs only)
 * --------------------------------------------------------------------
 * - #110 — real POST /synthesize implementation (agent write-back)
 * - #111 — real GET /blocks?cursor= polling implementation
 */

import { route, send, readBody } from '../server.js'

// ---------------------------------------------------------------------------
// POST /synthesize
// ---------------------------------------------------------------------------

/**
 * POST /synthesize — agent write-back entrypoint.
 *
 * Phase-4 scout stub (issue #115). Returns 501 Not Implemented so that
 * issue #110 can provide the real handler without any routing conflicts.
 *
 * Expected request shape (locked here; implementation in #110):
 * {
 *   corpus_id: string,
 *   source_block_ids: string[],
 *   content: string,
 *   model?: string,
 *   meta?: Record<string, unknown>
 * }
 *
 * Expected response shape (locked here; implementation in #110):
 * {
 *   id: string,            // synthesized block id
 *   status: SynthesizedBlockStatusValue,
 *   sourced_from: string[] // source_block_ids echoed back
 * }
 *
 * @see src/synthesis/index.ts — SynthesizedBlockStatus, LinkTypes.SOURCED_FROM
 * @see issue #110 — real implementation
 */
route('POST', '/synthesize', async (req, res) => {
  // Phase-4 scout stub: validate shape minimally, then 501.
  // Issue #110 replaces this body with real write-back logic.
  const _body = await readBody(req)
  void _body
  send(res, 501, {
    error: 'not_implemented',
    message: 'POST /synthesize is a phase-4 stub — implementation tracked in issue #110',
  })
})

// ---------------------------------------------------------------------------
// GET /blocks
// ---------------------------------------------------------------------------

/**
 * GET /blocks — cursor-based block polling endpoint.
 *
 * Phase-4 scout stub (issue #115). Returns 501 Not Implemented so that
 * issue #111 can provide the real handler without any routing conflicts.
 *
 * Expected query parameters (locked here; implementation in #111):
 *   cursor  — opaque pagination token (base64-encoded timestamp + id)
 *   limit   — max results per page (default 50)
 *   corpus_id — filter to a single corpus
 *   status  — filter by SynthesizedBlockStatus value
 *
 * Expected response shape (locked here; implementation in #111):
 * {
 *   blocks: Array<{ id, status, created_at, updated_at, meta }>,
 *   next_cursor: string | null
 * }
 *
 * @see src/synthesis/index.ts — SynthesizedBlockStatus
 * @see issue #111 — real polling cursor implementation
 */
route('GET', '/blocks', async (_req, res) => {
  // Phase-4 scout stub: 501 until issue #111 provides the polling cursor.
  send(res, 501, {
    error: 'not_implemented',
    message: 'GET /blocks is a phase-4 stub — implementation tracked in issue #111',
  })
})
