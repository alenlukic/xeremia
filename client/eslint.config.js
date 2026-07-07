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
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message: 'Use Number for decimal conversion.',
        },
        {
          name: 'parseInt',
          message: 'Use Number for decimal conversion.',
        },
        {
          name: 'isNaN',
          message: 'Use Number.isNaN or Number.isFinite.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports.',
        },
      ],
      semi: ['error', 'never'],
      // Existing components use intentional ref-sync and effect-driven resets;
      // treat react-hooks v7 strict rules as warnings until refactored.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      'require-await': 'error',
    },
  },
  {
    // Playwright and Vite consume default-exported configuration objects.
    files: ['playwright.config.ts', 'vite.config.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
])
