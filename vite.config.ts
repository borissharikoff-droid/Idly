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
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'scheduler'],
          'vendor-motion': ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-zustand': ['zustand'],
          'game-data': [
            './src/renderer/lib/loot.ts',
            './src/renderer/lib/combat.ts',
            './src/renderer/lib/crafting.ts',
            './src/renderer/lib/farming.ts',
            './src/renderer/lib/cooking.ts',
            './src/renderer/lib/skills.ts',
            './src/renderer/lib/xp.ts',
          ],
        },
      },
    },
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
