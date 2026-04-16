/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const clientPort = Number(process.env.CLIENT_PORT) || 5174
const apiPort = Number(process.env.API_PORT) || 8001

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: clientPort,
    allowedHosts: true,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
    testTimeout: 15000,
  },
})
