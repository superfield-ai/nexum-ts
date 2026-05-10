import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import { getPool } from './pool.js'
import { config } from '../config.js'

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

  // Apply AGE-side migrations (issue #75). Only runs when AGE_DATABASE_URL is
  // configured. Each migration file is idempotent. The compose stack also
  // applies these via docker-entrypoint-initdb.d; running them here covers
  // hosted Postgres-AGE deployments that do not use the entrypoint hook and
  // also makes integration tests deterministic when they bring up an AGE
  // container after the volume is already initialized.
  await migrateAge()
}

export async function migrateAge(): Promise<boolean> {
  if (!config.AGE_DATABASE_URL) return false
  const migrationsDir = new URL('../../../db/migrations/', import.meta.url)
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  if (files.length === 0) return false

  const agePool = new pg.Pool({ connectionString: config.AGE_DATABASE_URL })
  try {
    const client = await agePool.connect()
    try {
      for (const file of files) {
        const sql = readFileSync(new URL(file, migrationsDir), 'utf-8')
        // AGE shim is a single DO $$ ... $$ block; pass it whole.
        await client.query(sql)
      }
      console.log(`AGE migrations applied (${files.length})`)
    } finally {
      client.release()
    }
    return true
  } catch (err) {
    console.error('AGE migration failed (continuing without AGE):', (err as Error).message)
    return false
  } finally {
    await agePool.end().catch(() => {})
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
