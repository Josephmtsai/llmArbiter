import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'

import { useTheme, type Theme } from '../composables/useTheme'

const STORAGE_KEY = 'arb-theme'

// Nuxt auto-imports useState as a global. It is keyed and shared, so the stub
// caches by key too - otherwise two useTheme() calls in one test would each get
// their own ref and the sharing behaviour under test would be faked away.
let stateCache: Map<string, Ref<unknown>>

// Captured before any test can replace the accessor with a throwing one.
const realLocalStorage = window.localStorage
const restoreLocalStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: realLocalStorage,
  })
}

beforeEach(() => {
  restoreLocalStorage()
  stateCache = new Map()
  vi.stubGlobal('useState', <T>(key: string, init: () => T): Ref<T> => {
    if (!stateCache.has(key)) stateCache.set(key, ref(init()) as Ref<unknown>)
    return stateCache.get(key) as Ref<T>
  })
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTheme', () => {
  it('restores a saved light theme', () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    const { theme, init } = useTheme()
    init()

    expect(theme.value).toBe('light')
  })

  it('defaults to dark when nothing is stored', () => {
    const { theme, init } = useTheme()
    init()

    expect(theme.value).toBe('dark')
  })

  it('persists the new value to localStorage on toggle', () => {
    const { theme, toggle } = useTheme()

    toggle()
    expect(theme.value).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')

    toggle()
    expect(theme.value).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('leaves the data-theme attribute to unhead instead of writing it directly', () => {
    // Regression guard for the original bug: useTheme used to setAttribute here,
    // which fought app.vue's useHead binding and lost on the next head patch.
    const { toggle } = useTheme()

    toggle()

    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('ignores a stored value that is not a known theme', () => {
    localStorage.setItem(STORAGE_KEY, 'chartreuse')

    const { theme, init } = useTheme()
    init()

    expect(theme.value).toBe('dark')
  })

  describe('when the browser blocks site data', () => {
    // Chrome with site data blocked throws SecurityError on the localStorage
    // getter itself, not just on get/setItem. Unguarded, this threw inside
    // app.vue's onMounted and blanked the whole page.
    const blocked = () => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
    }

    it('falls back to dark on init instead of throwing', () => {
      blocked()
      const { theme, init } = useTheme()

      expect(() => init()).not.toThrow()
      expect(theme.value).toBe('dark')
    })

    it('still switches the theme on toggle instead of throwing', () => {
      blocked()
      const { theme, toggle } = useTheme()

      expect(() => toggle()).not.toThrow()
      expect(theme.value).toBe('light')
    })
  })

  it('shares state between separate useTheme() calls', () => {
    const first = useTheme()
    const second = useTheme()

    first.apply('light' satisfies Theme)

    expect(second.theme.value).toBe('light')
  })
})
