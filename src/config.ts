import { readFileSync } from 'node:fs'
try {
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#'))
      process.env[line.slice(0, eq).trim()] ??= line.slice(eq + 1).trim()
  }
} catch {}
export const config = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://nexum:nexum@localhost:5432/nexum',
  // Apache AGE companion DB (issue #75). Optional: when unset, the linker
  // skips AGE dual-writes silently. When set, the linker writes every new
  // edge into AGE as a `LINK` between two `Block` vertices in the
  // `nexum_links` graph.
  AGE_DATABASE_URL: process.env.AGE_DATABASE_URL ?? '',
  PORT: parseInt(process.env.PORT ?? '3000'),
  AUTH_OFF: process.env.NEXUM_AUTH === 'off',
}
