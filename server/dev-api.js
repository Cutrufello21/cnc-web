// Local dev server middleware — proxies /api/* to our serverless functions
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { pathToFileURL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
config({ path: resolve(projectRoot, '.env') })

export function devApiMiddleware() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()

        const route = req.url.replace(/^\/api\//, '').split('?')[0]
        const handlerPath = join(projectRoot, 'api', `${route}.js`)

        try {
          // Use absolute file URL for dynamic import
          const fileUrl = pathToFileURL(handlerPath).href
          // Cache-bust to pick up changes in dev
          const mod = await import(`${fileUrl}?t=${Date.now()}`)
          const handler = mod.default

          // Parse query string
          const url = new URL(req.url, `http://${req.headers.host}`)
          req.query = Object.fromEntries(url.searchParams)

          // Add Express-like helpers to raw Node response
          if (!res.json) {
            res.json = (data) => {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(data))
            }
          }
          if (!res.status || typeof res.status !== 'function') {
            res.status = (code) => {
              res.statusCode = code
              return res
            }
          }

          await handler(req, res)
        } catch (err) {
          console.error(`API error [${route}]:`, err.message)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}
