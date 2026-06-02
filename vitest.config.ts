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
  },
})
