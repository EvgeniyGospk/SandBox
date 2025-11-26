import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * Plugin to add Cross-Origin Isolation headers
 * Required for SharedArrayBuffer to work in browsers
 */
function crossOriginIsolation(): Plugin {
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    crossOriginIsolation(),  // Must be first!
    tailwindcss(), 
    react()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@particula/engine-wasm': fileURLToPath(new URL('../../packages/engine/pkg', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@particula/engine-wasm'],
  },
  worker: {
    format: 'es',  // Use ES modules for workers
  },
})
