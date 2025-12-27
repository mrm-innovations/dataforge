import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // Use root base in dev so assets resolve at /, and /dataforge/ for production builds.
  base: command === 'serve' ? '/' : '/dataforge/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Use default Vite HTML entry: index.html
}))
