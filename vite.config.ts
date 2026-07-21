import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The Express server (index.js) serves the built SPA out of `public/` and mounts the
// API under `/api`. So Vite builds into `public/` and keeps its own static assets in
// `static/` (copied verbatim into the build output).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  publicDir: 'static',
  build: {
    outDir: 'public',
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5173,
    proxy: {
      // the Express API in dev
      '/api': 'http://localhost:8080'
    }
  }
})
