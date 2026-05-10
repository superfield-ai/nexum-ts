import { claimJob, completeJob, failJob } from '../db/jobs.js'
import { query, execute } from '../db/queries.js'
import { randomUUID } from 'node:crypto'
import { embedEdge } from './edge-embed.js'
import { writeAgeEdge } from '../db/age.js'
import { timeStage } from '../ingest/timing.js'
// Phase-3 dev-scout (issue #114): bind through the default `InferenceClient`
// hook so issue #106 can swap in the LocalCpuInferenceClient classification
// path without touching this file. Today the default backend is the loud
// stub, so we deliberately do NOT call it from the live link loop yet — the
// import alone fixes the seam and lets the lint (`scripts/
// lint-phase2-inference-client.mjs`, broadened in #107) see this module on
// the inference-client path.
import { getDefaultInferenceClient } from '../inference/index.js'

export const SIGNALS: Record<string, string[]> = {
  contradicts:      ['not ', 'however', 'contrary', 'but ', 'instead', 'unlike', 'disagrees', 'conflicts'],
  supports:         ['similarly', 'also ', 'furthermore', 'consistent', 'confirms', 'in accordance', 'agrees'],
  elaborates:       ['specifically', 'for example', 'in particular', 'namely', 'that is', 'i.e.', 'e.g.'],
  overrides:        ['supersedes', 'replaces', 'amends', 'notwithstanding', 'prevails over', 'controls over'],
  'is-exception-to': ['except', 'unless', 'provided that', 'subject to', 'other than', 'excluding'],
}

export function classifyPair(contentA: string, contentB: string, cosineSim: number): string | null {
  if (cosineSim < 0.70) return null
  const b = contentB.toLowerCase()
  for (const [relType, keywords] of Object.entries(SIGNALS)) {
    if (keywords.some(kw => b.includes(kw))) return relType
  }
  return cosineSim > 0.85 ? 'supports' : null
}

/**
 * Phase-3 dev-scout (issue #114): default-binding hook usage.
 *
 * Resolve (and memoise) the default `InferenceClient` so that the seam is
 * actively touched by the linker. Issue #106 ports the hot loop in
 * `processAiLinks` from the inline `classifyPair` heuristic to
 * `defaultInferenceClient.classifyLink(...)`. While the default backend is
 * still the loud stub (Phase 3, pre-#105), no call site invokes the stub —
 * resolving the client is side-effect-free.
 */
export const defaultInferenceClient = getDefaultInferenceClient()

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function processAiLinks(versionId: string): Promise<void> {
  // Get all blocks for this version with their embeddings
  const blocks = await query<{ id: string; content: string; embedding: string | null; doc_id: string }>(
    `SELECT b.id, b.content, b.embedding::text, b.doc_id
     FROM blocks b JOIN version_blocks vb ON vb.block_id = b.id
     WHERE vb.version_id = $1 AND b.embedding IS NOT NULL`,
    [versionId]
  )

  // Get the corpus_id via document
  if (blocks.length === 0) return
  const docResult = await query<{ corpus_id: string }>(
    `SELECT corpus_id FROM documents WHERE id = $1`,
    [blocks[0].doc_id]
  )
  if (docResult.length === 0) return
  const corpusId = docResult[0].corpus_id

  for (const block of blocks) {
    // Find similar blocks in the same corpus using pgvector ANN
    const similar = await query<{ id: string; content: string; sim: string }>(
      `SELECT b2.id, b2.content,
              1 - (b1.embedding <=> b2.embedding) AS sim
       FROM blocks b1, blocks b2
       JOIN documents d ON d.id = b2.doc_id
       WHERE b1.id = $1
         AND d.corpus_id = $2
         AND b2.id != b1.id
         AND b2.embedding IS NOT NULL
         AND 1 - (b1.embedding <=> b2.embedding) > 0.70
       ORDER BY sim DESC
       LIMIT 20`,
      [block.id, corpusId]
    )

    for (const candidate of similar) {
      const cosineSim = parseFloat(candidate.sim)
      const relType = classifyPair(block.content, candidate.content, cosineSim)
      if (!relType) continue

      // Edge embedding (issue #75, phase-2): templated string strategy.
      // Wrapped in timeStage so #12 (H5.1) can observe per-edge embed cost.
      const edgeVec = await timeStage('edge_embed', { docId: block.doc_id, blockCount: 1 }, () =>
        embedEdge(block.content, candidate.content, relType),
      )

      await execute(
        `INSERT INTO links (id, src, dst, layer, rel_type, weight, confirmed, provenance, edge_embedding)
         VALUES ($1, $2, $3, 'ai', $4, $5, null, $6, ${edgeVec ? '$7::vector' : 'NULL'})
         ON CONFLICT DO NOTHING`,
        edgeVec
          ? [
              randomUUID(), block.id, candidate.id, relType, cosineSim,
              JSON.stringify({ model: 'keyword-heuristics-v1', confidence: cosineSim, created_at: new Date().toISOString() }),
              edgeVec,
            ]
          : [
              randomUUID(), block.id, candidate.id, relType, cosineSim,
              JSON.stringify({ model: 'keyword-heuristics-v1', confidence: cosineSim, created_at: new Date().toISOString() }),
            ],
      )

      // Mirror the edge into the AGE graph (the canonical graph store after
      // the phase-1 cutover, issue #99). AGE is required at boot, so this
      // call is expected to succeed; transient failures return false and are
      // logged but do not abort the linker batch.
      await writeAgeEdge({ src: block.id, dst: candidate.id, layer: 'ai', relType, weight: cosineSim })
    }
  }
}

export async function runAiLinker(signal?: AbortSignal) {
  while (!signal?.aborted) {
    const job = await claimJob('ai-link')
    if (!job) { await sleep(2000); continue }

    try {
      await processAiLinks((job.payload as any).version_id)
      await completeJob(job.id)
    } catch (err) {
      console.error('ai linker error', err)
      // @ts-ignore
      await failJob(job.id)
    }
  }
}
