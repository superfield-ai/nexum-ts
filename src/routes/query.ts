import { route, send, readBody } from '../server.js'
import { query, queryOne } from '../db/queries.js'
import { embedTexts } from '../embed/local.js'

// In-memory cache with 60-second TTL
const queryCache = new Map<string, { embedding: number[]; expires: number }>()

export async function getCachedEmbedding(text: string): Promise<number[]> {
  const cached = queryCache.get(text)
  if (cached && cached.expires > Date.now()) return cached.embedding
  const [vec] = await embedTexts([text])
  queryCache.set(text, { embedding: vec, expires: Date.now() + 60_000 })
  return vec
}

export function mapSearchRow(r: Record<string, unknown>) {
  return {
    block_id: r.block_id,
    content: r.content,
    score: parseFloat(r.score as string),
    document: { id: r.doc_id, title: r.title, external_id: r.external_id }
  }
}

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
  return rows.map(mapSearchRow)
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
  return rows.map(mapSearchRow)
}

// POST /query
route('POST', '/query', async (req, res) => {
  const body = await readBody(req) as any
  if (!body?.corpus_id) return send(res, 400, { error: 'corpus_id is required' })
  if (!body?.query) return send(res, 400, { error: 'query is required' })
  const mode = body.mode ?? 'semantic'
  const limit = Math.min(body.limit ?? 10, 100)

  // Verify corpus exists
  const corpus = await queryOne('SELECT id FROM corpora WHERE id = $1', [body.corpus_id])
  if (!corpus) return send(res, 404, { error: 'corpus not found' })

  if (mode === 'semantic') {
    const results = await semanticSearch(body.corpus_id, body.query, limit)
    return send(res, 200, { results })
  }
  if (mode === 'fulltext') {
    const results = await fulltextSearch(body.corpus_id, body.query, limit)
    return send(res, 200, { results })
  }
  // graph and hybrid will be added in issue #45
  return send(res, 400, { error: `unknown mode: ${mode}` })
})
