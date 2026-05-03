import { config } from './config.js'
import { migrate } from './db/migrate.js'
import { createApp } from './server.js'
import './routes/health.js'
import './routes/corpora.js'
import './routes/documents.js'
import './routes/entities.js'
import './routes/embed.js'

await migrate()

const server = createApp()
server.listen(config.PORT, () => {
  console.log(`Nexum listening on port ${config.PORT}`)
})
