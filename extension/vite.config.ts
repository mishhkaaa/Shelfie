import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// The side panel (index.html) is a real ES module page — Vite/Rollup can
// freely code-split it (e.g. the jsx-runtime chunk shared with nothing
// else here, since it's the only module-graph entry in this config).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      }
    }
  }
})
