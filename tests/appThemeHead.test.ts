import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRef, nextTick, onMounted, ref, unref, type Ref } from 'vue'

import App from '../app.vue'
import { useTheme } from '../composables/useTheme'

const STORAGE_KEY = 'arb-theme'

// What app.vue handed to useHead, captured instead of applied. The point of this
// file is the *binding*, not unhead's DOM writing, which is unhead's own concern.
type HeadInput = { htmlAttrs?: Record<string, unknown> }
let headCalls: HeadInput[]

let stateCache: Map<string, Ref<unknown>>

const mountApp = () =>
  mount(App, {
    global: {
      stubs: { NuxtLayout: true, NuxtPage: true },
    },
  })

beforeEach(() => {
  headCalls = []
  stateCache = new Map()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')

  // These three are Nuxt auto-imports, so inside app.vue they resolve as
  // globals. onMounted is stubbed with the genuine Vue implementation - a fake
  // would let a regression that never calls init() slip through.
  vi.stubGlobal('useState', <T>(key: string, init: () => T): Ref<T> => {
    if (!stateCache.has(key)) stateCache.set(key, ref(init()) as Ref<unknown>)
    return stateCache.get(key) as Ref<T>
  })
  vi.stubGlobal('onMounted', onMounted)
  vi.stubGlobal('useTheme', useTheme)
  vi.stubGlobal('useHead', (input: HeadInput) => {
    headCalls.push(input)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app.vue theme head binding', () => {
  it('binds data-theme to a ref rather than a constant', () => {
    // The original bug in one assertion: `useHead({ htmlAttrs: { 'data-theme':
    // 'dark' } })` is a string, so every head patch rewrote the restored theme
    // back to dark. Anything the theme can change has to arrive as a ref.
    mountApp()

    const bound = headCalls.at(0)?.htmlAttrs?.['data-theme']

    expect(headCalls).toHaveLength(1)
    expect(isRef(bound)).toBe(true)
  })

  it('hands unhead the restored theme after mount, not the default', async () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    mountApp()
    await nextTick()

    const bound = headCalls.at(0)?.htmlAttrs?.['data-theme']

    expect(unref(bound)).toBe('light')
  })

  it('does not read storage during setup, so the SSR value stays hydratable', () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    // The state the server serialises must not depend on localStorage, or the
    // client's first render would differ from the SSR markup. Asserting this
    // before mount, not after: @vue/test-utils flushes onMounted synchronously,
    // so post-mount the restore has already happened by design.
    expect(useTheme().theme.value).toBe('dark')

    mountApp()
  })

  it('restores the theme for every layout, not just the default one', async () => {
    // layouts/auth.vue never called init(), so /login ignored the saved theme.
    // Mounting app.vue with no layout at all proves the restore no longer
    // depends on which layout renders.
    localStorage.setItem(STORAGE_KEY, 'light')

    mountApp()
    await nextTick()

    expect(useTheme().theme.value).toBe('light')
  })

  it('is the only head source that declares data-theme', async () => {
    // The second half of the original bug lived in nuxt.config.ts, which had its
    // own hardcoded htmlAttrs. Two head sources competing for one attribute is
    // the defect itself, so the config is executed here (defineNuxtConfig is a
    // Nuxt global, hence the stub) and asserted to declare nothing.
    vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)

    const { default: config } = (await import('../nuxt.config')) as unknown as {
      default: { app?: { head?: { htmlAttrs?: Record<string, unknown> } } }
    }

    expect(config.app?.head?.htmlAttrs?.['data-theme']).toBeUndefined()
  })

  it('keeps the restored theme when unhead re-reads the binding', async () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    mountApp()
    await nextTick()

    const bound = headCalls.at(0)?.htmlAttrs?.['data-theme']

    // A later head patch re-reads the same ref. With the old constant this
    // second read returned 'dark' and clobbered the restored value.
    expect(unref(bound)).toBe('light')
    expect(unref(bound)).toBe(unref(useTheme().theme))
  })
})
