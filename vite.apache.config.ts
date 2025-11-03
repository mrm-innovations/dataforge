import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

// Vite config specifically for local Apache deployment
// - Uses /scorecard_v6/ as base
// - Uses src_entry.html as the HTML input to avoid conflicts when
//   the webroot index.html contains already-built tags
export default defineConfig({
  base: '/scorecard_v6/dist/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, 'src_entry.html'),
    },
  },
})
