import { test } from 'node:test'
import assert from 'node:assert/strict'

test('buildEdgeText produces "<rel>: <src> -> <dst>" template', async () => {
  const { buildEdgeText } = await import('../../dist/linker/edge-embed.js')
  const text = buildEdgeText('alice owes bob', 'bob is paid', 'supports')
  assert.equal(text, 'supports: alice owes bob -> bob is paid')
})

test('buildEdgeText falls back to "related" when relType is null', async () => {
  const { buildEdgeText } = await import('../../dist/linker/edge-embed.js')
  const text = buildEdgeText('a', 'b', null)
  assert.ok(text.startsWith('related: '))
})

test('buildEdgeText truncates long snippets', async () => {
  const { buildEdgeText } = await import('../../dist/linker/edge-embed.js')
  const long = 'x'.repeat(1000)
  const text = buildEdgeText(long, long, 'cites')
  // 240 chars per side, plus rel + arrow
  assert.ok(text.length < 600, `expected truncation, got length=${text.length}`)
})

test('buildEdgeText collapses whitespace', async () => {
  const { buildEdgeText } = await import('../../dist/linker/edge-embed.js')
  const text = buildEdgeText('a   b\n\tc', 'd  e', 'cites')
  assert.equal(text, 'cites: a b c -> d e')
})

test('vectorLiteral emits pgvector literal format', async () => {
  const { vectorLiteral } = await import('../../dist/linker/edge-embed.js')
  assert.equal(vectorLiteral([1, 2, 3]), '[1,2,3]')
})

test('age helper short-circuits when AGE_DATABASE_URL unset', async () => {
  // config.AGE_DATABASE_URL is captured at import time from process.env. The
  // test runner does not set it, so the helper must report unavailable
  // synchronously. We do not unset env here in case a future caller does set
  // it — short-circuit semantics are: pool returns null and writes return false.
  const { resetAgePool, writeAgeEdge, countAgeEdges } = await import('../../dist/db/age.js')
  const { config } = await import('../../dist/config.js')
  resetAgePool()
  if (!config.AGE_DATABASE_URL) {
    assert.equal(await writeAgeEdge({ src: 'a', dst: 'b', layer: 'ai', relType: 'supports', weight: 1 }), false)
    assert.equal(await countAgeEdges(), -1)
  }
})
