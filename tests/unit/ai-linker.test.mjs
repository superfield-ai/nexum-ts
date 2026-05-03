import { test } from 'node:test'
import assert from 'node:assert/strict'

test('classifyPair returns null below 0.70 threshold', async () => {
  const { classifyPair } = await import('../../dist/linker/ai.js')
  assert.equal(classifyPair('clause A', 'clause B', 0.65), null)
})

test('classifyPair detects contradicts keyword', async () => {
  const { classifyPair } = await import('../../dist/linker/ai.js')
  const result = classifyPair('Party shall pay', 'however, Party is not required', 0.80)
  assert.equal(result, 'contradicts')
})

test('classifyPair detects elaborates keyword', async () => {
  const { classifyPair } = await import('../../dist/linker/ai.js')
  const result = classifyPair('The term includes', 'specifically, this means direct costs', 0.80)
  assert.equal(result, 'elaborates')
})

test('classifyPair returns supports for high similarity without keyword', async () => {
  const { classifyPair } = await import('../../dist/linker/ai.js')
  const result = classifyPair('Payment terms clause A', 'Payment terms clause B', 0.90)
  assert.equal(result, 'supports')
})

test('classifyPair returns null for medium similarity without keyword', async () => {
  const { classifyPair } = await import('../../dist/linker/ai.js')
  const result = classifyPair('Payment terms', 'Delivery schedule', 0.75)
  assert.equal(result, null)
})
