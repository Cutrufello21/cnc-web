import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApiMiddleware } from './server/dev-api.js'

export default defineConfig({
  plugins: [react(), devApiMiddleware()],
})
