import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

// Flat config for ESLint 9. Per spec `tooling-baseline` AD-1 this is a
// hand-rolled config rather than `@nuxt/eslint`, so `pnpm lint` works in a
// fresh clone and inside the pre-commit hook without running `nuxt prepare`.
const maxLenOptions = {
  code: 100,
  ignoreUrls: true,
  ignoreStrings: true,
  ignoreTemplateLiterals: true,
  ignoreRegExpLiterals: true,
}

export default tseslint.config(
  {
    ignores: ['.nuxt/**', '.output/**', 'node_modules/**', 'coverage/**', '.husky/**', 'dist/**'],
  },
  ...tseslint.configs.recommended,
  // strongly-recommended == Vue 3 style guide priority A + B (CLAUDE.md §2), which
  // says they "必須通過" - so the -error variant, since eslint-plugin-vue 10 ships
  // the plain preset at warn severity and warnings do not fail the gate.
  // Priority C stays off so `eslint-config-prettier` has nothing to fight.
  ...pluginVue.configs['flat/strongly-recommended-error'],
  // Prettier owns formatting, so this switches off every stylistic preset rule
  // that would fight it. It sits here rather than last because it also disables
  // max-len, and the blocks below deliberately turn that back on.
  prettier,
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['**/*.{ts,vue,js,mjs}'],
    rules: {
      // Nuxt auto-imports have no import statement; vue-tsc checks them instead.
      'no-undef': 'off',
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // XSS: CLAUDE.md §3 bans v-html on unsanitised input. There are zero uses
      // today, so an outright error keeps it that way.
      'vue/no-v-html': 'error',
      'vue/no-static-inline-styles': 'warn', // OQ-2; 29 pre-existing inline styles
    },
  },
  {
    // AD-7. Split by file type on purpose: base max-len counts an SFC's template
    // and style blocks as plain text, so running it over .vue would ignore the
    // HTML options below and report the same long lines twice.
    files: ['**/*.{ts,js,mjs}'],
    rules: { 'max-len': ['error', maxLenOptions] },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/max-len': [
        'error',
        { ...maxLenOptions, ignoreHTMLAttributeValues: true, ignoreHTMLTextContents: true },
      ],
    },
  },
  {
    // Nuxt decides these filenames (index.vue, default.vue, [run_id].vue).
    files: ['pages/**/*.vue', 'layouts/**/*.vue', 'app.vue'],
    rules: { 'vue/multi-word-component-names': 'off' }, // AD-2
  },
  {
    // The one file allowed to touch console (arrives with silent-failure-elimination).
    files: ['utils/logger.ts'],
    rules: { 'no-console': 'off' },
  },
)
