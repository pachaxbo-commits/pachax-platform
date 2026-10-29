import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { validateFirebaseEnvironment } from './src/config/firebaseEnvironment'
import { assertPreviewFirebaseIsolation } from './scripts/preview-firebase-isolation.mjs'

const studioDemoRoutingPlugin: Plugin = {
  name: 'studio-demo-routing',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url || ''
      if (url === '/studio' || url.startsWith('/studio?') || url.startsWith('/studio/')) {
        const q = url.indexOf('?')
        req.url = '/studio.html' + (q >= 0 ? url.slice(q) : '')
      } else if (url === '/demo/hamburger' || url.startsWith('/demo/hamburger?') || url === '/demo/retail' || url.startsWith('/demo/retail?')) {
        const q = url.indexOf('?')
        req.url = '/demo-isolated.html' + (q >= 0 ? url.slice(q) : '')
      } else if (url === '/demo' || url.startsWith('/demo?') || url.startsWith('/demo/')) {
        const q = url.indexOf('?')
        req.url = '/demo.html' + (q >= 0 ? url.slice(q) : '')
      }
      next()
    })
  },
}

export default defineConfig(({ command, mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  validateFirebaseEnvironment(environment, command === 'build')
  assertPreviewFirebaseIsolation(environment, process.env.VERCEL_ENV)
  return {
    cacheDir: 'node_modules/.vite-current',
    plugins: [react(), studioDemoRoutingPlugin],
    optimizeDeps: { entries: ['index.html', 'preview.html', 'studio.html', 'demo.html'] },
    server: {
      port: 5190,
      strictPort: false,
    },
    build: {
      rollupOptions: {
        input: {
          main: 'index.html',
          studio: 'studio.html',
          demo: 'demo.html',
          preview: 'preview.html',
        },
      },
    },
  }
})
