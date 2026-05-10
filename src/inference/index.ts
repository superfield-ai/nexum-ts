/**
 * Phase-3 dev-scout (issue #114): default-binding hook for `InferenceClient`.
 *
 * Call sites that want "the inference client" — initially only
 * `src/linker/ai.ts` after the #106 port — go through
 * `getDefaultInferenceClient()` rather than `new`-ing a concrete class. That
 * keeps the eventual swap from a heuristic linker to a real local-CPU model
 * (issue #105) a single-file change instead of a sweep across the codebase.
 *
 * Selection contract (frozen by this scout):
 *
 *   - The factory is memoised; the first call wins for the lifetime of the
 *     process. Tests that want a different client MUST call
 *     `setDefaultInferenceClient()` before any code path that resolves the
 *     default, or `resetDefaultInferenceClient()` between cases.
 *   - The factory consults `process.env.NEXUM_INFERENCE_BACKEND`:
 *       * `'stub'`       (default today, while #105 is in flight) — returns
 *         `StubInferenceClient`. This preserves "no behaviour change" for
 *         the dev-scout: nothing in `src/` reads the default yet.
 *       * `'local-cpu'`  (default after #105 merges) — returns
 *         `LocalCpuInferenceClient`. Already wired here so #105 only needs
 *         to flip the default constant and remove the stub branch.
 *       * `'anthropic'` / `'openai'` — opt-in hosted-provider adapters.
 *         The adapter classes exist as throwing stubs in
 *         `src/inference/adapters/` and are filled in by issue #108.
 *   - Unknown values fall back to the stub and log once on stderr.
 *
 * Canonical references:
 *   - docs/engineering.md → "Phase-3 InferenceClient default seams (issue #114)"
 *   - docs/implementation-plan.md (Phase 3)
 */

import { StubInferenceClient, type InferenceClient } from './client.js'
import { LocalCpuInferenceClient } from './local-cpu.js'
import { AnthropicInferenceClient } from './adapters/anthropic.js'
import { OpenAiInferenceClient } from './adapters/openai.js'

export type InferenceBackend = 'stub' | 'local-cpu' | 'anthropic' | 'openai'

/**
 * Phase-3 default. Today: `'stub'` — `getDefaultInferenceClient()` returns
 * the loud-failing stub so no caller can accidentally start using an
 * unimplemented backend. Issue #105 flips this to `'local-cpu'` once the
 * `@xenova/transformers` backend ships.
 */
export const PHASE3_DEFAULT_BACKEND: InferenceBackend = 'stub'

let cached: InferenceClient | null = null
let warnedUnknown = false

function selectBackend(): InferenceBackend {
  const raw = process.env.NEXUM_INFERENCE_BACKEND
  if (!raw) return PHASE3_DEFAULT_BACKEND
  if (raw === 'stub' || raw === 'local-cpu' || raw === 'anthropic' || raw === 'openai') {
    return raw
  }
  if (!warnedUnknown) {
    warnedUnknown = true
    console.error(
      `[inference] unknown NEXUM_INFERENCE_BACKEND='${raw}', falling back to ` +
        `'${PHASE3_DEFAULT_BACKEND}' (see src/inference/index.ts).`,
    )
  }
  return PHASE3_DEFAULT_BACKEND
}

function construct(backend: InferenceBackend): InferenceClient {
  switch (backend) {
    case 'stub':
      return new StubInferenceClient()
    case 'local-cpu':
      return new LocalCpuInferenceClient()
    case 'anthropic':
      return new AnthropicInferenceClient()
    case 'openai':
      return new OpenAiInferenceClient()
  }
}

/**
 * Return the process-wide default `InferenceClient`. Memoised after the
 * first call. See module header for the selection contract.
 */
export function getDefaultInferenceClient(): InferenceClient {
  if (cached) return cached
  cached = construct(selectBackend())
  return cached
}

/**
 * Override the default for tests or for callers that want to inject a custom
 * client (e.g. a recording double). Subsequent calls to
 * `getDefaultInferenceClient()` return `client` until `reset` is invoked.
 */
export function setDefaultInferenceClient(client: InferenceClient): void {
  cached = client
}

/** Drop the memoised default so the next `getDefaultInferenceClient()` re-selects. */
export function resetDefaultInferenceClient(): void {
  cached = null
  warnedUnknown = false
}

export { LocalCpuInferenceClient } from './local-cpu.js'
export { AnthropicInferenceClient } from './adapters/anthropic.js'
export { OpenAiInferenceClient } from './adapters/openai.js'
export type {
  ClassifyLinkInput,
  EvidenceScore,
  InferenceClient,
  RetrievalMode,
  RetrievalResult,
  RetrievedBlock,
} from './client.js'
export { StubInferenceClient } from './client.js'
