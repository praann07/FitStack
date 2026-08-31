import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Vite 8 transpiles for browserslist-style targets; the legacy 'ES2020'
    // value was rejected by lightningcss during CSS minification.
    target: 'baseline-widely-available',
    // Neither terser nor esbuild is installed; use rolldown's built-in minifier.
    minify: 'oxc',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react/')) {
              return 'vendor-react'
            }
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('lucide-react') || id.includes('recharts')) return 'vendor-ui'
            if (id.includes('date-fns')) return 'vendor-date'
          }
          return undefined
        },
      },
    },
  },
})
