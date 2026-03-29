import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    command === 'serve' && {
      name: 'dev-api-lazy',
      configureServer: async (server) => {
        const { devApiMiddleware } = await import('./server/dev-api.js')
        const plugin = devApiMiddleware()
        plugin.configureServer(server)
      },
    },
  ].filter(Boolean),
}))
