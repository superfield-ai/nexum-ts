import { test } from 'node:test'
import assert from 'node:assert/strict'

// Phase-4 synthesis write-back seams (issue #115 dev-scout).
//
// These tests pin the public seam surface that the four follow-on phase-4
// implementation issues consume:
//   - SynthesizedBlockStatus enum         → issue #109 schema migration
//   - LinkTypes.SOURCED_FROM constant     → issues #110, #112 graph writes
//   - propagateStale() hook signature     → issue #112 stale propagation
//   - POST /synthesize route stub         → issue #110 implementation
//   - GET /blocks route stub              → issue #111 polling cursor
//
// Tests run without a live database. All imports are from dist/ (compiled
// TypeScript). Build with `npm run build` before running `npm test`.

process.env.NEXUM_REQUIRE_AGE = 'false'

// ---------------------------------------------------------------------------
// SynthesizedBlockStatus enum
// ---------------------------------------------------------------------------

test('SynthesizedBlockStatus is exported from src/synthesis', async () => {
  const mod = await import('../../dist/synthesis/index.js')
  assert.ok(mod.SynthesizedBlockStatus, 'SynthesizedBlockStatus should be exported')
  const s = mod.SynthesizedBlockStatus
  assert.equal(typeof s.PENDING,      'string', 'PENDING must be a string')
  assert.equal(typeof s.SYNTHESIZING, 'string', 'SYNTHESIZING must be a string')
  assert.equal(typeof s.DONE,         'string', 'DONE must be a string')
  assert.equal(typeof s.FAILED,       'string', 'FAILED must be a string')
  assert.equal(typeof s.STALE,        'string', 'STALE must be a string')
})

test('SynthesizedBlockStatus values are stable string literals', async () => {
  const { SynthesizedBlockStatus } = await import('../../dist/synthesis/index.js')
  assert.equal(SynthesizedBlockStatus.PENDING,      'pending')
  assert.equal(SynthesizedBlockStatus.SYNTHESIZING, 'synthesizing')
  assert.equal(SynthesizedBlockStatus.DONE,         'done')
  assert.equal(SynthesizedBlockStatus.FAILED,       'failed')
  assert.equal(SynthesizedBlockStatus.STALE,        'stale')
})

// ---------------------------------------------------------------------------
// LinkTypes registry — sourced-from constant
// ---------------------------------------------------------------------------

test('LinkTypes is exported from src/synthesis', async () => {
  const { LinkTypes } = await import('../../dist/synthesis/index.js')
  assert.ok(LinkTypes, 'LinkTypes should be exported')
  assert.equal(typeof LinkTypes.SOURCED_FROM, 'string', 'SOURCED_FROM must be a string')
})

test('LinkTypes.SOURCED_FROM is the canonical link type string', async () => {
  const { LinkTypes } = await import('../../dist/synthesis/index.js')
  assert.equal(LinkTypes.SOURCED_FROM, 'sourced-from',
    'SOURCED_FROM must equal "sourced-from" — changing this breaks graph queries')
})

test('LinkTypes preserves existing phase-1/2/3 link type constants', async () => {
  const { LinkTypes } = await import('../../dist/synthesis/index.js')
  assert.equal(LinkTypes.CITES,          'cites')
  assert.equal(LinkTypes.SUPPORTS,       'supports')
  assert.equal(LinkTypes.CONTRADICTS,    'contradicts')
  assert.equal(LinkTypes.ELABORATES,     'elaborates')
  assert.equal(LinkTypes.OVERRIDES,      'overrides')
  assert.equal(LinkTypes.IS_EXCEPTION_TO,'is-exception-to')
})

// ---------------------------------------------------------------------------
// propagateStale() no-op hook
// ---------------------------------------------------------------------------

test('propagateStale is exported from src/synthesis', async () => {
  const { propagateStale } = await import('../../dist/synthesis/index.js')
  assert.equal(typeof propagateStale, 'function', 'propagateStale must be a function')
})

test('propagateStale() is a no-op that resolves without throwing', async () => {
  const { propagateStale } = await import('../../dist/synthesis/index.js')
  // Must accept a block id string and resolve cleanly
  await assert.doesNotReject(() => propagateStale('block-id-001'))
})

test('propagateStale() accepts any string block id', async () => {
  const { propagateStale } = await import('../../dist/synthesis/index.js')
  // Must not throw for empty string, uuid, or arbitrary value
  await assert.doesNotReject(() => propagateStale(''))
  await assert.doesNotReject(() => propagateStale('00000000-0000-0000-0000-000000000000'))
  await assert.doesNotReject(() => propagateStale('arbitrary-block-ref'))
})

// ---------------------------------------------------------------------------
// Route stubs — POST /synthesize and GET /blocks
// ---------------------------------------------------------------------------

test('POST /synthesize route is registered and handles requests (issue #110 implemented)', async () => {
  // Import route module to trigger route() registration
  await import('../../dist/routes/synthesize.js')
  const { createApp } = await import('../../dist/server.js')

  // Auth is off in this unit test environment so principal === 'anon'
  process.env.NEXUM_AUTH = 'off'

  const app = createApp()
  const port = await new Promise((resolve, reject) => {
    app.listen(0, '127.0.0.1', function () {
      resolve(this.address().port)
    })
    app.on('error', reject)
  })

  try {
    // With AUTH_OFF the anon principal gets id='anon'. The request below sends
    // agent_entity_id='anon' (matching) with an empty source_block_ids array,
    // so we expect 400 (validation error) — not 501 — confirming the real
    // handler is wired (issue #110 implemented).
    const resp = await fetch(`http://127.0.0.1:${port}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corpus_id: 'c1', source_block_ids: [], content: 'test', agent_entity_id: 'anon' }),
    })
    assert.notEqual(resp.status, 501,
      'POST /synthesize must no longer return 501 — issue #110 has implemented the real handler')
    // With empty source_block_ids the endpoint returns 400
    assert.equal(resp.status, 400)
  } finally {
    await new Promise(r => app.close(r))
  }
})

test('GET /blocks route stub is registered and returns 501', async () => {
  await import('../../dist/routes/synthesize.js')
  const { createApp } = await import('../../dist/server.js')

  const app = createApp()
  const port = await new Promise((resolve, reject) => {
    app.listen(0, '127.0.0.1', function () {
      resolve(this.address().port)
    })
    app.on('error', reject)
  })

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/blocks`)
    assert.equal(resp.status, 501,
      'GET /blocks stub must return 501 until issue #111 implements the cursor')
    const body = await resp.json()
    assert.equal(body.error, 'not_implemented')
  } finally {
    await new Promise(r => app.close(r))
  }
})
