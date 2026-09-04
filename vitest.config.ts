import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // @ts-expect-error Nuxt resolves Vite 7 while Vitest 2 types reference Vite 5.
  plugins: [vue()],
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
      // §5). Starting point below = 2026-09-05 measurement, floored, minus 2:
      // lines 43.73 / statements 43.73 / functions 53.43 / branches 80.14.
      // Higher than the 20/20/45/70 the spec pencilled in - narrowing include
      // to business code raised the numbers, and leaving lines at 20 would let
      // coverage halve without the gate noticing.
      thresholds: {
        lines: 41,
        statements: 41,
        functions: 51,
        branches: 78,
      },
    },
  },
})
