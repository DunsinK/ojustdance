import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { fileURLToPath } from 'node:url'

export default defineConfig([
  globalIgnores(['**/dist/**', '**/.keyframe-tests/**']),
  {
    // One lint invocation covers the app and its sibling shared TypeScript package.
    basePath: fileURLToPath(new URL('..', import.meta.url)),
    files: ['frontend/**/*.{ts,tsx}', 'shared/skeleton/src/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
