// Flat ESLint config for ChatApp (ESLint 9 / React Native 0.76 + TypeScript).
// Replaces the legacy `extends: '@react-native'` eslintrc that was removed.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'vendor/**',
      'jest/**',
      'scripts/**',
      'babel.config.js',
      'metro.config.js',
      'jest.config.js',
      'jest.integration.config.js',
      'eslint.config.mjs',
      'tailwind.config.js',
      'src/services/media/__generated__/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        __DEV__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // RN/TS codebase conventions — keep noise low, surface real bugs.
      '@typescript-eslint/no-explicit-any': 'off',
      // React Native relies on require() for static assets and lazy native
      // module loading — an accepted convention in this codebase.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    // useMessages bundles two hook paths behind a bundle-time-stable flag with
    // an early return. Hook call order is stable per build (documented in-file),
    // so rules-of-hooks is a false positive here. Scoped off for this file only.
    files: ['src/screens/chat/hooks/useMessages.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    // Test + setup files: relax rules that fight with mocking patterns.
    files: ['**/__tests__/**', '**/*.spec.{ts,tsx}', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.jest },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // Strategy-A hook tests mock React and call hooks directly in Node
      // (no renderer) — see useMessagesFromDb.spec.ts. rules-of-hooks N/A.
      'react-hooks/rules-of-hooks': 'off',
    },
  },
);
