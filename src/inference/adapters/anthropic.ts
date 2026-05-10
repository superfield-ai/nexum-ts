/**
 * Phase-3 dev-scout (issue #114): Anthropic hosted-provider adapter stub.
 *
 * Opt-in only. Architecture constraint A4 keeps the local CPU model as the
 * default; this adapter exists so users with `ANTHROPIC_API_KEY` can swap to
 * Claude for `classifyLink` / `score` quality without changing call sites.
 *
 * The stub throws on every method. The real implementation lands in issue
 * #108 (hosted-provider adapters) and reads its API key from
 * `process.env.ANTHROPIC_API_KEY`. Selection happens via
 * `NEXUM_INFERENCE_BACKEND='anthropic'` (see `src/inference/index.ts`).
 */

import type {
  ClassifyLinkInput,
  EvidenceScore,
  InferenceClient,
  RetrievalMode,
  RetrievalResult,
  RetrievedBlock,
} from '../client.js'

export interface AnthropicInferenceClientConfig {
  apiKey?: string
  model?: string
}

export class AnthropicInferenceClient implements InferenceClient {
  readonly name = 'anthropic-inference-client'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly _config: AnthropicInferenceClientConfig = {}) {}

  embed(_text: string): Promise<number[]> {
    return Promise.reject(
      new Error(
        'AnthropicInferenceClient.embed() is a phase-3 scout stub; real ' +
          'backend lands in issue #108. Anthropic does not currently ship a ' +
          'first-party embedding endpoint; #108 will route embeds through ' +
          'the local-CPU client.',
      ),
    )
  }

  retrieve(_query: string, _mode: RetrievalMode): Promise<RetrievalResult> {
    return Promise.reject(
      new Error(
        'AnthropicInferenceClient.retrieve() is a phase-3 scout stub; ' +
          'retrieval stays local — #108 will delegate to the local-CPU client.',
      ),
    )
  }

  score(_query: string, _evidence: RetrievedBlock[]): Promise<EvidenceScore[]> {
    return Promise.reject(
      new Error(
        'AnthropicInferenceClient.score() is a phase-3 scout stub; real ' +
          'backend lands in issue #108.',
      ),
    )
  }

  classifyLink(_input: ClassifyLinkInput): Promise<string | null> {
    return Promise.reject(
      new Error(
        'AnthropicInferenceClient.classifyLink() is a phase-3 scout stub; ' +
          'real backend lands in issue #108.',
      ),
    )
  }
}
