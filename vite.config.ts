import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { validateFirebaseEnvironment } from './src/config/firebaseEnvironment'

const studioDemoRoutingPlugin = {
  name: 'studio-demo-routing',
  configureServer(server: any) {
    server.middlewares.use((req: any, _res: any, next: any) => {
      const url = req.url || ''
      if (url === '/studio' || url.startsWith('/studio?') || url.startsWith('/studio/')) {
        const q = url.indexOf('?')
        req.url = '/studio.html' + (q >= 0 ? url.slice(q) : '')
      } else if (url === '/demo' || url.startsWith('/demo?') || url.startsWith('/demo/')) {
        const q = url.indexOf('?')
        req.url = '/demo.html' + (q >= 0 ? url.slice(q) : '')
      }
      next()
    })
  },
}

export default defineConfig(({ command, mode }) => {
  validateFirebaseEnvironment({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }, command === 'build')
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
