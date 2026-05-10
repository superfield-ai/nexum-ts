import { test } from 'node:test'
import assert from 'node:assert/strict'

// Phase-1 AGE-default cutover seams (issue #98). These tests pin the
// contracts that the four follow-on phase-1 implementation issues consume.
// They MUST stay green even when AGE_DATABASE_URL is unset (the default in
// CI), because the seams are designed to soft-fail until issue #2 hardens
// `startupRequireAge()` into a hard gate.

test('startupRequireAge is exported and callable as a no-op when AGE unset', async () => {
  const { startupRequireAge, resetAgePool } = await import('../../dist/db/age.js')
  const { config } = await import('../../dist/config.js')
  resetAgePool()
  assert.equal(typeof startupRequireAge, 'function')
  if (!config.AGE_DATABASE_URL) {
    const result = await startupRequireAge()
    assert.equal(result.ok, true)
    assert.equal(result.mode, 'optional')
  }
})

test('createCypherGraphClient produces an object that satisfies the interface', async () => {
  const { createCypherGraphClient, resetAgePool } = await import('../../dist/db/age.js')
  resetAgePool()
  const client = createCypherGraphClient()
  assert.equal(typeof client.writeEdge, 'function')
  assert.equal(typeof client.countEdges, 'function')
  assert.equal(typeof client.query, 'function')
  assert.equal(typeof client.available, 'function')
})

test('CypherGraphClient short-circuits when AGE unavailable', async () => {
  const { createCypherGraphClient, resetAgePool } = await import('../../dist/db/age.js')
  const { config } = await import('../../dist/config.js')
  resetAgePool()
  if (config.AGE_DATABASE_URL) return // only meaningful in CI default

  const client = createCypherGraphClient()
  assert.equal(await client.available(), false)
  assert.equal(await client.countEdges(), -1)
  assert.equal(
    await client.writeEdge({ src: 'a', dst: 'b', layer: 'ai', relType: 'supports', weight: 1 }),
    false,
  )
  assert.deepEqual(await client.query('MATCH (n) RETURN n'), [])
})

test('backfillLinksToAge is exported and reports age-unavailable when AGE unset', async () => {
  const { backfillLinksToAge } = await import('../../dist/db/migrate.js')
  const { resetAgePool } = await import('../../dist/db/age.js')
  const { config } = await import('../../dist/config.js')
  resetAgePool()
  assert.equal(typeof backfillLinksToAge, 'function')
  if (!config.AGE_DATABASE_URL) {
    const result = await backfillLinksToAge()
    assert.equal(result.ok, true)
    assert.equal(result.copied, 0)
    assert.equal(result.skipped, 'age-unavailable')
  }
})

test('CypherGraphClient.writeEdge contract matches the existing dual-write helper', async () => {
  // The phase-1 cutover replaces direct writeAgeEdge call sites with calls
  // through the CypherGraphClient interface. This test pins that the adapter
  // accepts the same payload shape so the swap is mechanical.
  const { createCypherGraphClient, writeAgeEdge, resetAgePool } = await import('../../dist/db/age.js')
  resetAgePool()
  const client = createCypherGraphClient()
  const payload = { src: 'a', dst: 'b', layer: 'structural', relType: 'cites', weight: 1.0 }
  // Both must accept the payload and return a boolean (false when AGE unset).
  const direct = await writeAgeEdge(payload)
  const viaClient = await client.writeEdge(payload)
  assert.equal(typeof direct, 'boolean')
  assert.equal(typeof viaClient, 'boolean')
  assert.equal(direct, viaClient)
})
