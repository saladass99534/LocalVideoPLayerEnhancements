import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Important for Electron relative paths
  publicDir: 'assets',
  resolve: {
    alias: {
      process: "process/browser",
      stream: "stream-browserify",
      zlib: "browserify-zlib",
      util: "util",
      buffer: "buffer", // Added explicit buffer alias
    }
  },
  define: {
    'process.env': {},
    'global': 'window', // Polyfill global for simple-peer
  },
  server: {
    port: 5173,
    strictPort: true,
  }
})