import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const phpBackend = env.VITE_PHP_BACKEND || 'http://localhost/dataforge'
  return {
    // Use root base in dev so assets resolve at /, and /dataforge/ for production builds.
    base: command === 'serve' ? '/' : '/dataforge/',
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: phpBackend,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Use default Vite HTML entry: index.html
  }
})
