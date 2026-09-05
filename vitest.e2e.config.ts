import { defineConfig } from 'vitest/config'

// End-to-end suite for the proxy route (spec: proxy-hardening). Kept in its own
// config because it needs a real build in `.output/` and a Node environment,
// while the unit suite runs in jsdom against source. Excluded from coverage on
// purpose: it spawns a separate process, so v8 would report nothing for it and
// drag the measured numbers down.
//
// Run order is `pnpm build` then `pnpm test:e2e`; CI does exactly that.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    // One shared server per file, so files must not race for it.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
