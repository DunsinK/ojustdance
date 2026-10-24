import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const skeletonRoot = fileURLToPath(new URL('../shared/skeleton', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // The local package's development export points to shared TypeScript source.
  // Allow that one sibling directory so edits update the debug page immediately.
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        skeletonRoot,
      ],
    },
  },
  resolve: {
    // Prefer the package "development" export (TS source) in the Vite client.
    conditions: ['development', 'import', 'module', 'browser', 'default'],
    alias: {
      '@ojustdance/skeleton/fixtures': `${skeletonRoot}/src/fixtures.ts`,
      '@ojustdance/skeleton': `${skeletonRoot}/src/index.ts`,
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})

