import { config } from './config.js'
import { migrate } from './db/migrate.js'

await migrate()

// Server startup will be wired up in issue #36
console.log(`Nexum starting on port ${config.PORT}`)
