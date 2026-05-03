import { test } from 'node:test'
import assert from 'node:assert/strict'

test('query route module exports correctly', async () => {
  const mod = await import('../../dist/routes/query.js')
  assert.equal(typeof mod.semanticSearch, 'function')
  assert.equal(typeof mod.fulltextSearch, 'function')
  assert.equal(typeof mod.getCachedEmbedding, 'function')
  assert.equal(typeof mod.mapSearchRow, 'function')
})

test('mapSearchRow transforms DB row to response shape', async () => {
  const { mapSearchRow } = await import('../../dist/routes/query.js')
  const row = {
    block_id: 'block-uuid-1',
    content: 'The tenant shall pay rent...',
    score: '0.87',
    doc_id: 'doc-uuid-1',
    title: 'Contract A',
    external_id: 'cuad-0001'
  }
  const result = mapSearchRow(row)
  assert.equal(result.block_id, 'block-uuid-1')
  assert.equal(result.content, 'The tenant shall pay rent...')
  assert.equal(result.score, 0.87)
  assert.deepEqual(result.document, {
    id: 'doc-uuid-1',
    title: 'Contract A',
    external_id: 'cuad-0001'
  })
})

test('mapSearchRow parses score as float', async () => {
  const { mapSearchRow } = await import('../../dist/routes/query.js')
  const row = {
    block_id: 'b1',
    content: 'text',
    score: '0.123456',
    doc_id: 'd1',
    title: 'Doc',
    external_id: null
  }
  const result = mapSearchRow(row)
  assert.equal(typeof result.score, 'number')
  assert.ok(Math.abs(result.score - 0.123456) < 1e-6)
})
