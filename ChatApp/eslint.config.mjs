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
        // ─── Design-lint v2: raw <Text> JSX ───────────────────────────────
        // Use KoolaText with semantic variant/tone — never raw <Text>.
        {
          selector: 'JSXOpeningElement[name.name="Text"]',
          message: 'Use <KoolaText> instead of raw <Text>. See ui-dna.md.',
        },
        // ─── Design-lint v2: Touchable* usage ─────────────────────────────
        // Use Pressable with explicit press state — never Touchable*.
        {
          selector: 'JSXOpeningElement[name.name=/^Touchable/]',
          message: 'Use <Pressable> instead of Touchable* components. See ui-dna.md.',
        },
        // ─── Design-lint v2: magic-number spacing/radius ──────────────────
        // Style keys for padding/margin/gap/radius should use koolaSpacing/koolaRadii tokens.
        {
          selector: 'Property[key.name=/^(padding|paddingHorizontal|paddingVertical|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginHorizontal|marginVertical|marginTop|marginBottom|marginLeft|marginRight|gap|rowGap|columnGap|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius)$/] > Literal[value=/^[0-9]+$/]',
          message: 'Avoid magic-number spacing/radius. Use koolaSpacing.* or koolaRadii.* tokens (see ui-dna.md).',
        },
      ],
      // ─── Design-lint v2: koolaColors direct import in screens/components ─
      // Screens/components must not import koolaColors/koolaDarkColors directly.
      // Use useTheme().palette instead.
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
            {
              name: '../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
            {
              name: '../../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
            {
              name: '../../../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
          patterns: [
            {
              group: ['**/ui/theme'],
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
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
    // ─── Design-lint ratchet: src/screens/auth ───────────────────────────────
    // Clean for: hex, rawText, Touchable. NOT clean for: magic-number.
    // This block replaces the global no-restricted-syntax for this directory.
    files: ['src/screens/auth/**/*.{ts,tsx}'],
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
        {
          selector: 'JSXOpeningElement[name.name="Text"]',
          message: 'Use <KoolaText> instead of raw <Text>. See ui-dna.md.',
        },
        {
          selector: 'JSXOpeningElement[name.name=/^Touchable/]',
          message: 'Use <Pressable> instead of Touchable* components. See ui-dna.md.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
            {
              name: '../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
          patterns: [
            {
              group: ['**/ui/theme'],
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // ─── Design-lint ratchet: src/screens/connect ────────────────────────────
    // Clean for: hex, Touchable, koolaColors. NOT clean for: rawText, magic-number.
    files: ['src/screens/connect/**/*.{ts,tsx}'],
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
        {
          selector: 'JSXOpeningElement[name.name=/^Touchable/]',
          message: 'Use <Pressable> instead of Touchable* components. See ui-dna.md.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
            {
              name: '../../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
          patterns: [
            {
              group: ['**/ui/theme'],
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // ─── Design-lint ratchet: src/components/moments ─────────────────────────
    // Clean for: hex only. NOT clean for: rawText, Touchable, magic-number.
    files: ['src/components/moments/**/*.{ts,tsx}'],
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
    // ─── Design-lint ratchet: src/screens/services + src/screens/shopping ────
    // Clean for: rawText, Touchable, koolaColors.
    files: [
      'src/screens/services/**/*.{ts,tsx}',
      'src/screens/shopping/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="Text"]',
          message: 'Use <KoolaText> instead of raw <Text>. See ui-dna.md.',
        },
        {
          selector: 'JSXOpeningElement[name.name=/^Touchable/]',
          message: 'Use <Pressable> instead of Touchable* components. See ui-dna.md.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
          patterns: [
            {
              group: ['**/ui/theme'],
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // ─── Design-lint ratchet: src/screens/placeholder ────────────────────────
    // Clean for: Touchable, koolaColors.
    files: ['src/screens/placeholder/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name=/^Touchable/]',
          message: 'Use <Pressable> instead of Touchable* components. See ui-dna.md.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
          patterns: [
            {
              group: ['**/ui/theme'],
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // ─── Design-lint ratchet: src/components/connect ─────────────────────────
    // Clean for: Touchable.
    files: ['src/components/connect/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name=/^Touchable/]',
          message: 'Use <Pressable> instead of Touchable* components. See ui-dna.md.',
        },
      ],
    },
  },
  {
    // ─── Design-lint ratchet: src/screens/call, src/components/search ────────
    // Clean for: koolaColors, rawText, Touchable.
    files: [
      'src/screens/call/**/*.{ts,tsx}',
      'src/components/search/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="Text"]',
          message: 'Use <KoolaText> instead of raw <Text>. See ui-dna.md.',
        },
        {
          selector: 'JSXOpeningElement[name.name=/^Touchable/]',
          message: 'Use <Pressable> instead of Touchable* components. See ui-dna.md.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
            {
              name: '../../../ui/theme',
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
          patterns: [
            {
              group: ['**/ui/theme'],
              importNames: ['koolaColors', 'koolaDarkColors'],
              message: 'Import palette via useTheme().palette instead of koolaColors directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // ─── Design-lint ratchet: src/ui/** ──────────────────────────────────────
    // Clean for: hex. (Token definitions exempted further below.)
    files: ['src/ui/**/*.{ts,tsx}'],
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
    // ─── Exempt KoolaText.tsx from raw <Text> rule ───────────────────────────
    // KoolaText is the primitive that wraps raw RN <Text>; it MUST use <Text>.
    files: ['src/ui/KoolaText.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
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
