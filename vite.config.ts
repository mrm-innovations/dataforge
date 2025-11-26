import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  // Base path for GitHub Pages project site: https://<user>.github.io/<repo>/
  base: '/dataforge/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Use default Vite HTML entry: index.html
})
