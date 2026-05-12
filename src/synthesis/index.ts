/**
 * Phase-4 synthesis write-back seams (issue #115 dev-scout).
 *
 * This module locks the public contract for the four phase-4 implementation
 * issues so they can develop against frozen types and function signatures
 * after the AGE cleanup in #103.
 *
 * Canonical docs
 * --------------
 * - docs/architecture.md   — graph layer design, block status lifecycle
 * - docs/implementation-plan.md — phase-4 synthesis write-back tasks
 *
 * Follow-on implementation issues (do NOT implement here — stubs only)
 * --------------------------------------------------------------------
 * - #109 — real schema migration (synthesized_blocks table, status column)
 * - #110 — real POST /synthesize implementation
 * - #111 — real polling cursor implementation (GET /blocks with cursor)
 * - #112 — real stale propagation logic (propagateStale)
 */

// ---------------------------------------------------------------------------
// Synthesized-block status enum
// ---------------------------------------------------------------------------

/**
 * Status values for a synthesized block written back by the agent layer.
 *
 * Phase-4 scout stub — values are defined here so that issues #109–#112 can
 * import the enum without circular dependencies. The database migration that
 * adds a `synthesized_status` column to `blocks` belongs to issue #109.
 *
 * @see docs/implementation-plan.md phase-4 synthesis write-back
 */
export const SynthesizedBlockStatus = {
  /** Block has been queued for synthesis but not yet processed. */
  PENDING: 'pending',
  /** Block is currently being synthesized by the agent layer. */
  SYNTHESIZING: 'synthesizing',
  /** Block has been successfully synthesized and written back. */
  DONE: 'done',
  /** Synthesis failed; the block may be retried. */
  FAILED: 'failed',
  /** Block was previously done but an upstream dependency changed; needs re-synthesis. */
  STALE: 'stale',
} as const

export type SynthesizedBlockStatusValue = typeof SynthesizedBlockStatus[keyof typeof SynthesizedBlockStatus]

// ---------------------------------------------------------------------------
// Link type registry — sourced-from constant
// ---------------------------------------------------------------------------

/**
 * Typed link type constants used throughout the graph layer.
 *
 * `SOURCED_FROM` is the canonical link type emitted by the synthesizer to
 * record which source blocks a synthesized block was derived from. Registered
 * here as a module-level constant so that the AGE write path (issue #110),
 * the stale propagation hook (issue #112), and query filters all refer to the
 * same immutable string.
 *
 * @see docs/architecture.md — Typed Link Layer
 */
export const LinkTypes = {
  /** Existing structural citation link (phase-1). */
  CITES: 'cites',
  /** Existing AI-inferred semantic links (phase-2/3). */
  SUPPORTS: 'supports',
  CONTRADICTS: 'contradicts',
  ELABORATES: 'elaborates',
  OVERRIDES: 'overrides',
  IS_EXCEPTION_TO: 'is-exception-to',
  /**
   * Phase-4: synthesized block ← source block.
   * Registered as a constant in this scout (issue #115) so #110 and #112
   * can import it without forward-declaring a raw string.
   */
  SOURCED_FROM: 'sourced-from',
} as const

export type LinkTypeValue = typeof LinkTypes[keyof typeof LinkTypes]

// ---------------------------------------------------------------------------
// Stale-propagation hook
// ---------------------------------------------------------------------------

/**
 * Propagate stale status from a changed source block to all synthesized
 * blocks that were derived from it via `sourced-from` edges.
 *
 * Phase-4 scout stub (issue #115) — this is a NO-OP. The real graph traversal
 * and bulk status update belong to issue #112. Callers may wire this hook into
 * the ingest and linker pipelines now; the no-op keeps existing tests green
 * while the interface is frozen.
 *
 * @param sourceBlockId - The block whose content changed, triggering staleness.
 * @returns Promise that resolves when propagation is complete (currently immediately).
 *
 * @see docs/implementation-plan.md phase-4 — stale propagation
 * @see issue #112 — real stale propagation logic
 */
export async function propagateStale(sourceBlockId: string): Promise<void> {
  // Phase-4 scout stub: no-op. Issue #112 will implement AGE graph traversal
  // via `sourced-from` edges to mark downstream synthesized blocks as STALE.
  void sourceBlockId
}
