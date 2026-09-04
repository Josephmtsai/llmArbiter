import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Nuxt substitutes import.meta.client / import.meta.server at build time.
// Vitest does not, and its `define` option does not cover import.meta either, so
// without this every client-only branch reads as undefined and silently never
// runs - tests would "pass" while covering nothing. jsdom is a browser
// environment, so client:true / server:false is the honest mapping.
const nuxtImportMetaFlags = {
  name: 'nuxt-import-meta-flags',
  transform(code: string, id: string) {
    if (id.includes('node_modules') || !/import\.meta\.(client|server)/.test(code)) return null
    return {
      code: code.replace(/import\.meta\.client/g, 'true').replace(/import\.meta\.server/g, 'false'),
      map: null,
    }
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
      // lines 44.12 / statements 44.12 / functions 55.14 / branches 80.51.
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
