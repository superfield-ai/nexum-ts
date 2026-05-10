/**
 * Phase-3 dev-scout (issue #114): LocalCpuInferenceClient seam.
 *
 * Phase 3 of the implementation plan pins a CPU-friendly local model as the
 * default `InferenceClient` so that the platform stays runnable on a laptop
 * without API keys (architecture constraint A4: out-of-the-box default;
 * constraint OD1: opinionated defaults).
 *
 * This file ships ONLY the class signature. Every method throws
 * "not yet implemented" so accidental use in a real code path fails loudly
 * rather than silently returning fake numbers. The runnable backend lands
 * in:
 *
 *   - #105  LocalCpuInferenceClient — real `@xenova/transformers` ONNX
 *           backend that fills in `embed`, `score`, `classifyLink`, and a
 *           local-graph `retrieve`.
 *   - #106  AI linker port — switches `src/linker/ai.ts` from the inline
 *           `classifyPair` heuristic to `getDefaultInferenceClient().classifyLink`.
 *
 * The class deliberately implements the existing `InferenceClient` interface
 * from `src/inference/client.ts`; widening or narrowing the surface MUST
 * happen there first so the lint (`scripts/lint-phase2-inference-client.mjs`,
 * to be broadened in #107) catches drift across the codebase.
 *
 * Canonical references:
 *   - docs/engineering.md → "Phase-3 InferenceClient default seams (issue #114)"
 *   - docs/implementation-plan.md (Phase 3)
 */

import type {
  ClassifyLinkInput,
  EvidenceScore,
  InferenceClient,
  RetrievalMode,
  RetrievalResult,
  RetrievedBlock,
} from './client.js'

/**
 * Configuration accepted by `LocalCpuInferenceClient`. The scout fixes the
 * shape; #105 fills in defaults (likely `Xenova/all-MiniLM-L6-v2` for
 * embeddings) and an opt-in cache directory under `/var/cache/nexum/models`.
 */
export interface LocalCpuInferenceClientConfig {
  /** Hugging Face model id for the embedding backbone. */
  embeddingModel?: string
  /** Local on-disk cache directory for ONNX weights. */
  cacheDir?: string
  /** Hard cap on concurrent forward passes; ORT is not thread-safe. */
  maxConcurrency?: number
}

/**
 * Default `InferenceClient` for Phase 3. Stub-only in #114; real backend
 * lands in #105.
 */
export class LocalCpuInferenceClient implements InferenceClient {
  readonly name = 'local-cpu-inference-client'

  // The config is recorded but not consumed by the stub. #105 plumbs it into
  // the `@xenova/transformers` pipeline.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly _config: LocalCpuInferenceClientConfig = {}) {}

  embed(_text: string): Promise<number[]> {
    return Promise.reject(
      new Error(
        'LocalCpuInferenceClient.embed() is a phase-3 scout stub; ' +
          'real backend lands in issue #105.',
      ),
    )
  }

  retrieve(_query: string, _mode: RetrievalMode): Promise<RetrievalResult> {
    return Promise.reject(
      new Error(
        'LocalCpuInferenceClient.retrieve() is a phase-3 scout stub; ' +
          'real backend lands in issue #105.',
      ),
    )
  }

  score(_query: string, _evidence: RetrievedBlock[]): Promise<EvidenceScore[]> {
    return Promise.reject(
      new Error(
        'LocalCpuInferenceClient.score() is a phase-3 scout stub; ' +
          'real backend lands in issue #105.',
      ),
    )
  }

  classifyLink(_input: ClassifyLinkInput): Promise<string | null> {
    return Promise.reject(
      new Error(
        'LocalCpuInferenceClient.classifyLink() is a phase-3 scout stub; ' +
          'real backend lands in issue #105 and is consumed by the linker port in #106.',
      ),
    )
  }
}
