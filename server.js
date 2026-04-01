import express from 'express'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json({ limit: '10mb' }))

// Helper to wrap Vercel-style handlers into Express routes
function wrapHandler(handlerModule) {
  return async (req, res) => {
    try {
      // Parse query params (already done by Express)
      const handler = handlerModule.default
      await handler(req, res)
    } catch (err) {
      console.error('Route error:', err.message)
      if (!res.headersSent) {
        res.status(500).json({ error: err.message })
      }
    }
  }
}

// Dynamically load all API routes
const apiFiles = [
  'actions', 'ai-insights', 'analytics', 'dispatch', 'driver', 'geocode',
  'hq', 'map-data', 'orders', 'payroll', 'reassign', 'routing', 'sheets-view'
]

for (const name of apiFiles) {
  const mod = await import(`./api/${name}.js`)
  // Support both GET and POST on each route
  app.all(`/api/${name}`, wrapHandler(mod))
  console.log(`  /api/${name}`)
}

// Serve static build files
const distPath = join(__dirname, 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  // SPA fallback — serve index.html for all non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`CNC Delivery server running on port ${PORT}`)
})
