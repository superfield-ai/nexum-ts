import { route, send, readBody } from '../server.js'
import { query, queryOne } from '../db/queries.js'
import { embedTexts } from '../embed/local.js'

// 60-second embedding cache
const queryCache = new Map<string, { embedding: number[]; expires: number }>()

async function getCachedEmbedding(text: string): Promise<number[]> {
  const cached = queryCache.get(text)
  if (cached && cached.expires > Date.now()) return cached.embedding
  const [vec] = await embedTexts([text])
  queryCache.set(text, { embedding: vec, expires: Date.now() + 60_000 })
  return vec
}

route('POST', '/query', async (req, res) => {
  const body = await readBody(req) as any
  if (!body?.corpus_id) return send(res, 400, { error: 'corpus_id is required' })
  const mode = body.mode ?? 'semantic'
  const limit = Math.min(body.limit ?? 10, 100)

  const corpus = await queryOne('SELECT id FROM corpora WHERE id = $1', [body.corpus_id])
  if (!corpus) return send(res, 404, { error: 'corpus not found' })

  if (mode === 'semantic') {
    if (!body.query) return send(res, 400, { error: 'query is required for semantic mode' })
    return send(res, 200, { results: await semanticSearch(body.corpus_id, body.query, limit) })
  }
  if (mode === 'fulltext') {
    if (!body.query) return send(res, 400, { error: 'query is required for fulltext mode' })
    return send(res, 200, { results: await fulltextSearch(body.corpus_id, body.query, limit) })
  }
  if (mode === 'graph') {
    if (!body.seed_block_id) return send(res, 400, { error: 'seed_block_id is required for graph mode' })
    const maxHops = body.max_hops ?? 3
    const layers = body.layers ?? ['structural', 'semantic', 'ai']
    return send(res, 200, { results: await graphSearch(body.seed_block_id, maxHops, layers, limit) })
  }
  if (mode === 'hybrid') {
    if (!body.query) return send(res, 400, { error: 'query is required for hybrid mode' })
    return send(res, 200, { results: await hybridSearch(body.corpus_id, body.query, limit) })
  }
  return send(res, 400, { error: `unknown mode: ${mode}` })
})

// Exported for testing
export async function semanticSearch(corpusId: string, queryText: string, limit: number) {
  const vec = await getCachedEmbedding(queryText)
  const vecStr = `[${vec.join(',')}]`
  const rows = await query<any>(
    `SELECT b.id AS block_id, b.content,
            1 - (b.embedding <=> $1::vector) AS score,
            d.id AS doc_id, d.title, d.external_id
     FROM blocks b JOIN documents d ON d.id = b.doc_id
     WHERE d.corpus_id = $2 AND b.embedding IS NOT NULL
     ORDER BY b.embedding <=> $1::vector LIMIT $3`,
    [vecStr, corpusId, limit]
  )
  return rows.map((r: any) => ({
    block_id: r.block_id, content: r.content, score: parseFloat(r.score),
    document: { id: r.doc_id, title: r.title, external_id: r.external_id }
  }))
}

export async function fulltextSearch(corpusId: string, queryText: string, limit: number) {
  const rows = await query<any>(
    `SELECT b.id AS block_id, b.content,
            ts_rank(b.tsv, plainto_tsquery('english', $1)) AS score,
            d.id AS doc_id, d.title, d.external_id
     FROM blocks b JOIN documents d ON d.id = b.doc_id,
          plainto_tsquery('english', $1) q
     WHERE d.corpus_id = $2 AND b.tsv @@ q
     ORDER BY score DESC LIMIT $3`,
    [queryText, corpusId, limit]
  )
  return rows.map((r: any) => ({
    block_id: r.block_id, content: r.content, score: parseFloat(r.score),
    document: { id: r.doc_id, title: r.title, external_id: r.external_id }
  }))
}

export async function graphSearch(seedBlockId: string, maxHops: number, layers: string[], limit: number) {
  const rows = await query<any>(
    `WITH RECURSIVE graph AS (
       SELECT dst AS id, 1 AS depth, ARRAY[src] AS path, rel_type
       FROM links WHERE src = $1 AND layer = ANY($2)
       UNION ALL
       SELECT l.dst, g.depth + 1, g.path || l.src, l.rel_type
       FROM links l JOIN graph g ON l.src = g.id
       WHERE g.depth < $3 AND l.src != ALL(g.path)
     )
     SELECT DISTINCT b.id AS block_id, b.content,
            g.depth, g.rel_type,
            d.id AS doc_id, d.title, d.external_id
     FROM graph g JOIN blocks b ON b.id = g.id
     JOIN documents d ON d.id = b.doc_id
     ORDER BY g.depth LIMIT $4`,
    [seedBlockId, layers, maxHops, limit]
  )
  return rows.map((r: any) => ({
    block_id: r.block_id, content: r.content,
    depth: r.depth, rel_type: r.rel_type,
    document: { id: r.doc_id, title: r.title, external_id: r.external_id }
  }))
}

export async function hybridSearch(corpusId: string, queryText: string, limit: number) {
  const semanticResults = await semanticSearch(corpusId, queryText, 10)
  const seen = new Set<string>(semanticResults.map(r => r.block_id))
  const results: any[] = semanticResults.map(r => ({ ...r, origin: 'semantic' }))

  for (const sr of semanticResults) {
    const neighbors = await graphSearch(sr.block_id, 1, ['structural', 'semantic', 'ai'], 10)
    for (const n of neighbors) {
      if (!seen.has(n.block_id)) {
        seen.add(n.block_id)
        results.push({ ...n, origin: 'graph' })
      }
    }
  }
  return results.slice(0, limit)
}
