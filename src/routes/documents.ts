import { route, send, readBody } from '../server.js'
import { queryOne } from '../db/queries.js'
import { parseText } from '../ingest/parse-text.js'
import { parseMarkdown } from '../ingest/parse-markdown.js'
import { contentHash } from '../ingest/dedup.js'
import type { ParsedBlock } from '../ingest/parse-text.js'

route('POST', '/documents', async (req, res) => {
  const body = await readBody(req) as any

  // Validate
  if (!body?.corpus_id) return send(res, 400, { error: 'corpus_id is required' })
  if (!body?.title) return send(res, 400, { error: 'title is required' })
  if (!body?.content) return send(res, 400, { error: 'content is required' })
  if (!['text', 'markdown'].includes(body?.format)) return send(res, 400, { error: 'format must be text or markdown' })

  // Check corpus exists
  const corpus = await queryOne('SELECT id FROM corpora WHERE id = $1', [body.corpus_id])
  if (!corpus) return send(res, 404, { error: 'corpus not found' })

  // Parse blocks
  const parsedBlocks: ParsedBlock[] = body.format === 'markdown'
    ? parseMarkdown(body.content)
    : parseText(body.content)

  // Hash all blocks
  const hashes = parsedBlocks.map(b => contentHash(b.content))

  // Get pool for transaction
  const { getPool } = await import('../db/pool.js')
  const pool = await getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Insert document
    const docRow = await client.query(
      `INSERT INTO documents (title, source_format, corpus_id, external_id, meta)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [body.title, body.format === 'text' ? null : 'markdown', body.corpus_id, body.external_id ?? null, body.meta ?? null]
    )
    const docId: string = docRow.rows[0].id

    // Insert version
    const verRow = await client.query(
      `INSERT INTO document_versions (doc_id, version_num, status)
       VALUES ($1, 1, 'parsed') RETURNING id`,
      [docId]
    )
    const versionId: string = verRow.rows[0].id

    // Check for existing blocks by content_hash
    const existingRows = await client.query(
      `SELECT id, content_hash FROM blocks WHERE doc_id = $1 AND content_hash = ANY($2)`,
      [docId, hashes]
    )
    const existingMap = new Map<string, string>()
    for (const r of existingRows.rows) existingMap.set(r.content_hash, r.id)

    // Insert or reuse blocks + link to version
    for (let i = 0; i < parsedBlocks.length; i++) {
      const b = parsedBlocks[i]
      const hash = hashes[i]
      let blockId = existingMap.get(hash)

      if (!blockId) {
        const bRow = await client.query(
          `INSERT INTO blocks (doc_id, content, content_hash, block_type, level)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [docId, b.content, hash, b.block_type, b.level]
        )
        blockId = bRow.rows[0]?.id
        if (!blockId) {
          // race: fetch the existing one
          const ex = await client.query('SELECT id FROM blocks WHERE doc_id=$1 AND content_hash=$2', [docId, hash])
          blockId = ex.rows[0].id
        }
      }

      await client.query(
        `INSERT INTO version_blocks (version_id, block_id, seq) VALUES ($1, $2, $3)`,
        [versionId, blockId, i + 1]
      )
    }

    // Update current_version_id
    await client.query(
      `UPDATE documents SET current_version_id = $1 WHERE id = $2`,
      [versionId, docId]
    )

    await client.query('COMMIT')

    send(res, 202, {
      id: docId,
      version_id: versionId,
      block_count: parsedBlocks.length,
      status: 'pending_embed',
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
