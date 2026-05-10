import { config } from './config.js'
import { migrate } from './db/migrate.js'
import { startupRequireAge } from './db/age.js'
import { createApp } from './server.js'
import './routes/health.js'
import './routes/corpora.js'
import './routes/documents.js'
import './routes/entities.js'
import './routes/embed.js'
import './routes/query.js'
import './routes/openapi.js'

await migrate()

// Phase-1 AGE-default cutover (issues #98 scout, #99 hardening). Hard gate:
// throws when the configured Postgres lacks the AGE extension, refusing to
// serve traffic against a database that cannot answer graph queries.
await startupRequireAge()

const server = createApp()
server.listen(config.PORT, () => {
  console.log(`Nexum API ready — http://localhost:${config.PORT} — GET /openapi.json for API docs`)
})
