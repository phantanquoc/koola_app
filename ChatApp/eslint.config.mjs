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
      // ─── Design-lint: flag raw hex color literals ─────────────────────────
      // Screens should reference palette tokens (via useTheme()) instead of
      // hardcoding hex colors. Starts at warn globally; will escalate to error
      // per directory as clusters are migrated.
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Property[key.name=/color|Color|background|Background|tint|border/i] > Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'Avoid raw hex color literals in styles. Use palette tokens from useTheme() instead (see ui-dna.md).',
        },
        {
          selector: 'Property[key.name=/color|Color|background|Background|tint|border/i] > TemplateLiteral',
          message: 'Avoid template-literal colors in styles. Use palette tokens from useTheme() instead.',
        },
      ],
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
  {
    // ─── Design-lint ratchet: escalate to error for cleaned directories ──────
    // These directories have been fully migrated to palette tokens.
    // No raw hex color literals should appear in new code here.
    files: [
      'src/ui/**/*.{ts,tsx}',
      'src/screens/auth/**/*.{ts,tsx}',
      'src/screens/connect/**/*.{ts,tsx}',
      'src/components/moments/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Property[key.name=/color|Color|background|Background|tint|border/i] > Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'Avoid raw hex color literals in styles. Use palette tokens from useTheme() instead (see ui-dna.md).',
        },
        {
          selector: 'Property[key.name=/color|Color|background|Background|tint|border/i] > TemplateLiteral',
          message: 'Avoid template-literal colors in styles. Use palette tokens from useTheme() instead.',
        },
      ],
    },
  },
  {
    // ─── Design-lint: theme.ts + token files are the definitions ─────────────
    // Hex literals are intentional here (they ARE the tokens). Suppress.
    // MUST come after the ratchet escalation so it overrides correctly.
    files: ['src/ui/theme.ts', 'src/ui/tokens/**'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
