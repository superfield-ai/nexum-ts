import { GenericContainer, Wait } from 'testcontainers'
import type { StartedTestContainer } from 'testcontainers'

let container: StartedTestContainer | null = null

export async function startDb(): Promise<string> {
  container = await new GenericContainer('pgvector/pgvector:pg16')
    .withEnvironment({
      POSTGRES_DB: 'nexum',
      POSTGRES_USER: 'nexum',
      POSTGRES_PASSWORD: 'nexum',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
    .start()

  const host = container.getHost()
  const port = container.getMappedPort(5432)
  const url = `postgresql://nexum:nexum@${host}:${port}/nexum`
  process.env.DATABASE_URL = url

  // Reset pool so next getPool() creates a fresh connection with the new URL
  const { resetPool } = await import('../../src/db/pool.js')
  resetPool()

  // Run migrations
  const { migrate } = await import('../../src/db/migrate.js')
  await migrate()

  return url
}

export async function stopDb(): Promise<void> {
  const { resetPool } = await import('../../src/db/pool.js')
  resetPool()
  await container?.stop()
  container = null
}
