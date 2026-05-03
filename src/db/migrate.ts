import { readFileSync } from 'node:fs'
import { getPool } from './pool.js'

export async function migrate() {
  const sql = readFileSync(new URL('../../../db/schema.sql', import.meta.url), 'utf-8')
  const pool = await getPool()
  const client = await pool.connect()
  try {
    // Split on semicolons but preserve dollar-quoted DO $$ ... $$ blocks
    const statements = splitStatements(sql)
    for (const stmt of statements) {
      const trimmed = stmt.trim()
      if (!trimmed) continue
      await client.query(trimmed)
    }
    console.log('Migration complete')
  } finally {
    client.release()
  }
}

function splitStatements(sql: string): string[] {
  const stmts: string[] = []
  let current = ''
  let inDollarQuote = false
  let dollarTag = ''

  let i = 0
  while (i < sql.length) {
    // Detect start/end of dollar-quoted strings
    if (!inDollarQuote && sql[i] === '$') {
      const end = sql.indexOf('$', i + 1)
      if (end !== -1) {
        const tag = sql.slice(i, end + 1)
        if (/^\$[A-Za-z0-9_]*\$$/.test(tag)) {
          inDollarQuote = true
          dollarTag = tag
          current += sql.slice(i, end + 1)
          i = end + 1
          continue
        }
      }
    } else if (inDollarQuote && sql.startsWith(dollarTag, i)) {
      current += dollarTag
      i += dollarTag.length
      inDollarQuote = false
      dollarTag = ''
      continue
    }

    if (!inDollarQuote && sql[i] === ';') {
      stmts.push(current)
      current = ''
    } else {
      current += sql[i]
    }
    i++
  }
  if (current.trim()) stmts.push(current)
  return stmts
}

// Allow running as a script: tsx src/db/migrate.ts
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  migrate().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
}
