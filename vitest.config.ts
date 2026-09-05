import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Nuxt substitutes import.meta.client / import.meta.server at build time.
// Vitest does not, and its `define` option does not cover import.meta either, so
// without this every client-only branch reads as undefined and silently never
// runs - tests would "pass" while covering nothing. jsdom is a browser
// environment, so client:true / server:false is the honest mapping.
//
// Two deliberate constraints on the replacement:
//
// - The negative lookahead stops `import.meta.clientOnly` becoming `trueOnly`.
//   Without it the match is a prefix match, not a token match.
// - Each replacement is padded to the exact byte length of the text it replaces,
//   so every following token keeps its original line AND column. That is what
//   makes `map: null` honest here: positions are unchanged, so the identity
//   mapping Vitest falls back to is correct and v8 coverage still points at the
//   right source locations.
//
// Known limitation: this is textual, not syntax-aware, so the literal string
// "import.meta.client" inside a string or template would also be replaced. No
// source file contains one (only composables/useTheme.ts uses these flags at
// all), and a syntax-aware pass is not worth the dependency for two call sites.
const FLAG_SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/import\.meta\.client(?![\w$])/g, 'true'],
  [/import\.meta\.server(?![\w$])/g, 'false'],
]

const nuxtImportMetaFlags = {
  name: 'nuxt-import-meta-flags',
  transform(code: string, id: string) {
    // Plain substring guard, not `regex.test()`: a /g regex carries lastIndex
    // across calls, so testing it here would make later files miss matches.
    if (id.includes('node_modules') || !code.includes('import.meta.')) return null
    const transformed = FLAG_SUBSTITUTIONS.reduce(
      (acc, [pattern, value]) => acc.replace(pattern, (match) => value.padEnd(match.length)),
      code,
    )
    return { code: transformed, map: null }
  },
}

export default defineConfig({
  // @ts-expect-error Nuxt resolves Vite 7 while Vitest 2 types reference Vite 5.
  plugins: [vue(), nuxtImportMetaFlags],
  resolve: {
    alias: {
      '~': new URL('.', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'pages/**/*.{ts,vue}',
        'components/**/*.{ts,vue}',
        'composables/**/*.ts',
        'stores/**/*.ts',
        'utils/**/*.ts',
        'server/**/*.ts',
        'middleware/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'],
      // Ratchet (spec tooling-baseline AD-6): every feature hands off the
      // coverage it measured and raises each threshold to at least
      // "measured - 2". Thresholds only ever go up. Target is 80% (CLAUDE.md
      // §5). Ratcheted by `theme-persistence` on 2026-09-05 from the
      // tooling-baseline starting point of 41/41/51/78: measured
      // lines 44.22 / statements 44.22 / functions 55.14 / branches 80.51.
      // Branches stays at 78 - floor(80.51) - 2 is still 78.
      thresholds: {
        lines: 42,
        statements: 42,
        functions: 53,
        branches: 78,
      },
    },
  },
})
