import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../../dist')

test('query route source file exists', () => {
  const srcPath = path.resolve(__dirname, '../../src/routes/query.ts')
  assert.ok(fs.existsSync(srcPath), `src/routes/query.ts should exist at ${srcPath}`)
})

test('query route is imported in src/index.ts', () => {
  const indexPath = path.resolve(__dirname, '../../src/index.ts')
  const contents = fs.readFileSync(indexPath, 'utf8')
  assert.ok(
    contents.includes("import './routes/query.js'"),
    'src/index.ts should import ./routes/query.js'
  )
})

test('query route source contains all four modes', () => {
  const srcPath = path.resolve(__dirname, '../../src/routes/query.ts')
  const contents = fs.readFileSync(srcPath, 'utf8')

  assert.ok(contents.includes("mode === 'semantic'"), "should handle semantic mode")
  assert.ok(contents.includes("mode === 'fulltext'"), "should handle fulltext mode")
  assert.ok(contents.includes("mode === 'graph'"), "should handle graph mode")
  assert.ok(contents.includes("mode === 'hybrid'"), "should handle hybrid mode")
})

test('graph mode source issues a Cypher query through the AGE adapter (issue #101)', () => {
  const srcPath = path.resolve(__dirname, '../../src/routes/query.ts')
  const contents = fs.readFileSync(srcPath, 'utf8')

  // Phase-1 cutover: graphSearch now traverses the AGE `nexum_links` graph
  // via Cypher rather than running a recursive CTE against the `links` table.
  assert.ok(
    contents.includes("from '../db/age.js'") || contents.includes('from "../db/age.js"'),
    'graphSearch should import the AGE adapter'
  )
  assert.ok(contents.includes("cypher('nexum_links'"), 'graphSearch should issue a Cypher call against the nexum_links graph')
  assert.ok(contents.includes('[r:LINK*1..'), 'graphSearch should use a variable-length LINK pattern')
  assert.ok(!contents.includes('WITH RECURSIVE graph'), 'graphSearch must no longer use the recursive CTE')
  assert.ok(contents.includes('depth'), 'graphSearch result should include depth')
  assert.ok(contents.includes('rel_type'), 'graphSearch result should include rel_type')
})

test('hybrid mode source performs semantic search then graph expansion', () => {
  const srcPath = path.resolve(__dirname, '../../src/routes/query.ts')
  const contents = fs.readFileSync(srcPath, 'utf8')

  assert.ok(contents.includes('semanticSearch(corpusId'), 'hybridSearch should call semanticSearch')
  assert.ok(contents.includes('graphSearch(sr.block_id'), 'hybridSearch should call graphSearch per semantic result')
  assert.ok(contents.includes("origin: 'semantic'"), "hybrid results should tag semantic origin")
  assert.ok(contents.includes("origin: 'graph'"), "hybrid results should tag graph origin")
})

test('query route dist file exists after build', () => {
  const distPath = path.join(distDir, 'routes', 'query.js')
  // This test validates that a build artifact is present; it's expected to pass after `npm run build`
  assert.ok(
    fs.existsSync(distPath),
    `dist/routes/query.js should exist at ${distPath} — run 'npm run build' first`
  )
})

test('query route dist file exports nothing but registers route side-effect', async () => {
  const distPath = path.join(distDir, 'routes', 'query.js')
  if (!fs.existsSync(distPath)) {
    // Skip if not built yet
    return
  }
  // The module registers a route as a side effect; importing it should not throw
  // We can't import it in isolation without a DB, but we can verify its shape
  const contents = fs.readFileSync(distPath, 'utf8')
  assert.ok(contents.includes('POST'), 'dist query route should register a POST handler')
  assert.ok(contents.includes('/query'), 'dist query route should register /query path')
})
