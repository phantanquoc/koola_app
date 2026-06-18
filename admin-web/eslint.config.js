import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // setLoading/setError at the start of a data-fetch effect is the
      // standard async pattern. The rule is overly strict for this project.
      'react-hooks/set-state-in-effect': 'off',
      // Context + provider exported from the same file is intentional here.
      'react-refresh/only-export-components': 'off',
    },
  },
])
