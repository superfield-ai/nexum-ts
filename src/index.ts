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

// Phase-1 AGE-default cutover seam (issue #98). No-op probe today; issue #2
// will turn this into a hard gate that refuses to boot when AGE is missing.
await startupRequireAge()

const server = createApp()
server.listen(config.PORT, () => {
  console.log(`Nexum API ready — http://localhost:${config.PORT} — GET /openapi.json for API docs`)
})
