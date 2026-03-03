import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  root: 'src/renderer',
  publicDir: 'public',
  base: './',
  envDir: path.join(__dirname),
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  test: {
    include: ['../../src/tests/**/*.test.ts'],
    root: 'src/renderer',
  },
})
