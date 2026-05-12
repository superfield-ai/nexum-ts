/**
 * Unit tests for LocalCpuInferenceClient (issue #105).
 *
 * These tests mock `@xenova/transformers` so they run without downloading
 * model weights. They verify:
 *   - classifyLink() returns a valid SIGNALS label (string) or null
 *   - evaluateYesNo() returns { answer: 'yes'|'no', confidence: number }
 *   - classifyLink() fast-paths to null when cosineSim < 0.70
 *   - retrieve() and score() reject (not yet implemented in local-cpu)
 *   - the client's `name` property is correct
 *
 * The mock replaces the `@xenova/transformers` module with a lightweight
 * stub that returns a controlled pipeline output. The pipeline cache in
 * local-cpu.ts is process-scoped, so we use mock.module() before any import
 * of local-cpu to ensure the stub is picked up on the first pipeline load.
 */

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Mock @xenova/transformers before local-cpu.ts is imported.
//
// The mock pipeline factory returns a function that accepts (text, labels)
// and resolves with { labels: <sorted by desc score>, scores: [...] }. We
// make 'supports' always win with confidence 0.80 so the NLI threshold check
// is exercised, and 'yes' always wins for evaluateYesNo.
// ---------------------------------------------------------------------------

const mockPipelineOutput = {
  classifyLink: { labels: ['supports', 'contradicts', 'elaborates', 'overrides', 'is-exception-to'], scores: [0.80, 0.08, 0.06, 0.04, 0.02] },
  evaluateYesNo: { labels: ['yes', 'no'], scores: [0.90, 0.10] },
}

let pipelineCallCount = 0

await mock.module('@xenova/transformers', {
  namedExports: {
    env: { cacheDir: '' },
    pipeline: async (_task, _modelId) => {
      // Return a stub pipeline function
      return async (text, labels) => {
        pipelineCallCount++
        if (labels.length === 2 && labels.includes('yes') && labels.includes('no')) {
          return mockPipelineOutput.evaluateYesNo
        }
        return mockPipelineOutput.classifyLink
      }
    },
  },
})

// Import after mock is registered.
const { LocalCpuInferenceClient } = await import('../../dist/inference/local-cpu.js')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('LocalCpuInferenceClient has correct name', () => {
  const client = new LocalCpuInferenceClient()
  assert.equal(client.name, 'local-cpu-inference-client')
})

test('classifyLink returns a valid SIGNALS label string when cosineSim >= 0.70', async () => {
  const client = new LocalCpuInferenceClient()
  const result = await client.classifyLink({
    contentA: 'Party shall pay within 30 days.',
    contentB: 'Payment is consistent with prior agreements.',
    cosineSim: 0.82,
  })
  // Result must be one of the SIGNALS labels or null
  const validLabels = ['supports', 'contradicts', 'elaborates', 'overrides', 'is-exception-to', null]
  assert.ok(
    validLabels.includes(result),
    `Expected a valid SIGNALS label or null, got: ${JSON.stringify(result)}`,
  )
  // Our mock returns 'supports' at 0.80 confidence (≥ 0.35 threshold)
  assert.equal(result, 'supports')
})

test('classifyLink returns null when cosineSim < 0.70 (fast-path bypass)', async () => {
  const client = new LocalCpuInferenceClient()
  const result = await client.classifyLink({
    contentA: 'Clause A content.',
    contentB: 'Clause B content.',
    cosineSim: 0.65,
  })
  assert.equal(result, null)
})

test('classifyLink result has correct shape: string or null', async () => {
  const client = new LocalCpuInferenceClient()
  const result = await client.classifyLink({
    contentA: 'The regulation requires disclosure.',
    contentB: 'Parties must report financial information.',
    cosineSim: 0.75,
  })
  // Shape check: must be string or null
  assert.ok(
    typeof result === 'string' || result === null,
    `classifyLink must return string | null, got ${typeof result}`,
  )
})

test('evaluateYesNo returns { answer, confidence } shape', async () => {
  const client = new LocalCpuInferenceClient()
  const result = await client.evaluateYesNo(
    'Does the contract require written notice?',
  )
  // Shape checks
  assert.ok(
    typeof result === 'object' && result !== null,
    'evaluateYesNo must return an object',
  )
  assert.ok(
    result.answer === 'yes' || result.answer === 'no',
    `answer must be 'yes' or 'no', got: ${result.answer}`,
  )
  assert.ok(
    typeof result.confidence === 'number' &&
      result.confidence >= 0 &&
      result.confidence <= 1,
    `confidence must be a number in [0,1], got: ${result.confidence}`,
  )
})

test('evaluateYesNo returns expected values from mock (yes at 0.90)', async () => {
  const client = new LocalCpuInferenceClient()
  const result = await client.evaluateYesNo('Is the obligation mandatory?')
  assert.equal(result.answer, 'yes')
  assert.equal(result.confidence, 0.90)
})

test('retrieve rejects with not-implemented message', async () => {
  const client = new LocalCpuInferenceClient()
  await assert.rejects(
    () => client.retrieve('query', 'vector'),
    /not implemented in the local-cpu backend/i,
  )
})

test('score rejects with not-implemented message', async () => {
  const client = new LocalCpuInferenceClient()
  await assert.rejects(
    () => client.score('query', [{ blockId: 'b1', score: 0.5 }]),
    /not implemented in the local-cpu backend/i,
  )
})

test('PHASE3_DEFAULT_BACKEND is local-cpu', async () => {
  const { PHASE3_DEFAULT_BACKEND } = await import('../../dist/inference/index.js')
  assert.equal(
    PHASE3_DEFAULT_BACKEND,
    'local-cpu',
    'PHASE3_DEFAULT_BACKEND must be local-cpu after issue #105',
  )
})
