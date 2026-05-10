#!/usr/bin/env node
/**
 * Phase-2 dev-scout (issue #79): CI lint enforcing the inference-client seam.
 *
 * Phase-2 experiment directories that touch inference (Area 2 curriculum,
 * Area 3 retrieval-augmented inference, Area 6 GPU acceleration, Area 7
 * differentiable graph) MUST go through `src/inference/client.ts`. This
 * lint scans the four area-* experiment trees for any TypeScript file that
 * appears to call inference / retrieval / scoring helpers without
 * importing from the shared interface and fails the build if it finds one.
 *
 * The lint is intentionally narrow: it only looks at TypeScript files
 * (Python experiments call into Postgres directly and are out of scope for
 * the inference-client seam). It is a no-op while those directories are
 * stub-only and starts catching drift the moment a real implementation
 * lands.
 *
 * Canonical references:
 *   - docs/engineering.md (Phase-2 Scout Seams → CI lint)
 *   - src/inference/client.ts (the interface this lint protects)
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// Experiment directories whose TypeScript entries are required to consume
// the shared inference-client interface.
//
// TODO(#107, phase-3 dev-scout #114): broaden this glob from
// `experiments/area*` to all of `src/` so that production code paths
// (notably `src/linker/`, `src/embed/`, and any future inference call site)
// are held to the same seam discipline as the experiment areas. The lint
// behaviour stays unchanged for now; #107 flips the glob and adds the
// allowed-file exceptions.
const PHASE2_AREAS = [
  'experiments/area2-training-curriculum',
  'experiments/area3-retrieval-inference',
  'experiments/area6-gpu-acceleration',
  'experiments/area7-differentiable-graph',
]

// A file "looks like" it does inference work if it references one of these
// identifiers as a function call. The list is deliberately small; expand
// it if a downstream issue introduces a new inference verb.
const INFERENCE_CALL_PATTERN =
  /\b(?:embed|retrieve|score)\s*\(/

// Files that import from the shared interface satisfy the lint regardless
// of which verbs they call.
const REQUIRED_IMPORT_PATTERN =
  /from\s+['"][^'"]*src\/inference\/client(?:\.js)?['"]/

/** Recursively yield every .ts file under `dir` (skips node_modules/dist). */
async function* walkTs(dir) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return
    throw err
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      yield* walkTs(full)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield full
    }
  }
}

const violations = []

for (const area of PHASE2_AREAS) {
  const abs = path.join(repoRoot, area)
  for await (const file of walkTs(abs)) {
    const text = await fs.readFile(file, 'utf8')
    if (!INFERENCE_CALL_PATTERN.test(text)) continue
    if (REQUIRED_IMPORT_PATTERN.test(text)) continue
    violations.push(path.relative(repoRoot, file))
  }
}

if (violations.length > 0) {
  console.error(
    'phase-2 inference-client lint failed; the following files call ' +
      'embed/retrieve/score but do not import from src/inference/client.ts:',
  )
  for (const v of violations) console.error('  - ' + v)
  console.error(
    '\nFix: import { InferenceClient } from "<rel>/src/inference/client.js" ' +
      'and route the call through it. See docs/engineering.md → ' +
      '"Phase-2 Scout Seams".',
  )
  process.exit(1)
}

console.log(
  'phase-2 inference-client lint OK (' +
    PHASE2_AREAS.length +
    ' area dirs scanned, no violations).',
)
