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
  PORT: parseInt(process.env.PORT ?? '3000'),
  AUTH_OFF: process.env.NEXUM_AUTH === 'off',
}
