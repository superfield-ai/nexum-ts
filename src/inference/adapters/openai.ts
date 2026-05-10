/**
 * Phase-3 dev-scout (issue #114): OpenAI hosted-provider adapter stub.
 *
 * Opt-in only. Architecture constraint A4 keeps the local CPU model as the
 * default; this adapter exists so users with `OPENAI_API_KEY` can swap to
 * OpenAI for `embed` / `score` quality without changing call sites.
 *
 * The stub throws on every method. The real implementation lands in issue
 * #108 and reads its API key from `process.env.OPENAI_API_KEY`. Selection
 * happens via `NEXUM_INFERENCE_BACKEND='openai'` (see
 * `src/inference/index.ts`).
 */

import type {
  ClassifyLinkInput,
  EvidenceScore,
  InferenceClient,
  RetrievalMode,
  RetrievalResult,
  RetrievedBlock,
} from '../client.js'

export interface OpenAiInferenceClientConfig {
  apiKey?: string
  embeddingModel?: string
  chatModel?: string
}

export class OpenAiInferenceClient implements InferenceClient {
  readonly name = 'openai-inference-client'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly _config: OpenAiInferenceClientConfig = {}) {}

  embed(_text: string): Promise<number[]> {
    return Promise.reject(
      new Error(
        'OpenAiInferenceClient.embed() is a phase-3 scout stub; real ' +
          'backend lands in issue #108.',
      ),
    )
  }

  retrieve(_query: string, _mode: RetrievalMode): Promise<RetrievalResult> {
    return Promise.reject(
      new Error(
        'OpenAiInferenceClient.retrieve() is a phase-3 scout stub; ' +
          'retrieval stays local — #108 will delegate to the local-CPU client.',
      ),
    )
  }

  score(_query: string, _evidence: RetrievedBlock[]): Promise<EvidenceScore[]> {
    return Promise.reject(
      new Error(
        'OpenAiInferenceClient.score() is a phase-3 scout stub; real ' +
          'backend lands in issue #108.',
      ),
    )
  }

  classifyLink(_input: ClassifyLinkInput): Promise<string | null> {
    return Promise.reject(
      new Error(
        'OpenAiInferenceClient.classifyLink() is a phase-3 scout stub; ' +
          'real backend lands in issue #108.',
      ),
    )
  }
}
