import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { validateFirebaseEnvironment } from './src/config/firebaseEnvironment'

export default defineConfig(({ command, mode }) => {
  validateFirebaseEnvironment({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }, command === 'build')
  return {
  cacheDir: 'node_modules/.vite-current',
  plugins: [react()],
  optimizeDeps: { entries: ['index.html', 'preview.html'] },
  server: {
    port: 5190,
    strictPort: false,
  },
  }
})
