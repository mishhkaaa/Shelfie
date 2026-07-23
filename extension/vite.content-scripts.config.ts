import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// Content scripts (and the background service worker) are injected as
// classic, non-module scripts by Chrome — they cannot contain `import`
// statements. Rollup refuses codeSplitting:false whenever there's more
// than one input (it needs shared chunks to de-duplicate across entries),
// so each entry here gets its own fully separate, single-input build —
// that's what actually guarantees a self-contained file, not just an
// output-format flag. ENTRY selects which one via an env var; see
// package.json's build script for the three invocations.
const ENTRY = process.env.SHELFIE_ENTRY

if (!ENTRY) {
  throw new Error('vite.content-scripts.config.ts requires SHELFIE_ENTRY to be set')
}

const entryPaths: Record<string, string> = {
  background: resolve(__dirname, 'src/background.ts'),
  'content-script': resolve(__dirname, 'src/content-script.ts'),
  'inpage-panel': resolve(__dirname, 'src/inpage-panel.ts'),
  'main-world-interceptor': resolve(__dirname, 'src/main-world-interceptor.ts')
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: { [ENTRY]: entryPaths[ENTRY] },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          // inpage-panel.css must have a predictable flat name: mount.ts
          // resolves it via chrome.runtime.getURL("inpage-panel.css"), and
          // manifest.json's web_accessible_resources declares that exact
          // name — a hashed filename would break both.
          if (assetInfo.names?.some((n) => n.endsWith('.css'))) {
            return '[name].css'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  }
})
