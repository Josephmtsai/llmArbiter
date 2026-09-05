import { beforeEach, describe, expect, it } from 'vitest'

import { PRE_PAINT_SCRIPT } from '../utils/prePaintScript'

const STORAGE_KEY = 'arb-theme'

// The real accessor, captured before any test swaps in a throwing one.
const realLocalStorage = window.localStorage
const restoreLocalStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: realLocalStorage,
  })
}

const blockSiteData = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('blocked', 'SecurityError')
    },
  })
}

// Executes the exact string that ships in <head>, rather than a re-implementation
// of it. A test that reasoned about what the script "should" do would keep
// passing after someone edited the shipped text.
const runPrePaintScript = () => {
  new Function(PRE_PAINT_SCRIPT)()
}

beforeEach(() => {
  restoreLocalStorage()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('pre-paint script', () => {
  it('applies a stored light theme before anything else runs', () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    runPrePaintScript()

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('applies a stored dark theme', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')

    runPrePaintScript()

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('leaves the attribute alone when nothing is stored', () => {
    runPrePaintScript()

    // Not set to anything - the SSR default from useState stands.
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('ignores a stored value that is not a known theme', () => {
    localStorage.setItem(STORAGE_KEY, 'chartreuse')

    runPrePaintScript()

    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  describe('when the browser blocks site data', () => {
    it('does not throw', () => {
      blockSiteData()

      expect(() => runPrePaintScript()).not.toThrow()
    })

    it('installs a working in-memory store so unguarded callers stop crashing', () => {
      // This is the blocker the reviewer caught: nuxt-auth-utils calls
      // localStorage.getItem() with no try/catch during app init, which threw
      // and rendered Nuxt's 500 page. After the shim it gets null instead.
      blockSiteData()
      runPrePaintScript()

      expect(() => localStorage.getItem('temp-nuxt-auth-utils-popup')).not.toThrow()
      expect(localStorage.getItem('temp-nuxt-auth-utils-popup')).toBeNull()
    })

    it('supports the rest of the Storage surface it replaces', () => {
      blockSiteData()
      runPrePaintScript()

      localStorage.setItem('a', '1')
      expect(localStorage.getItem('a')).toBe('1')
      expect(localStorage.length).toBe(1)
      expect(localStorage.key(0)).toBe('a')

      localStorage.removeItem('a')
      expect(localStorage.getItem('a')).toBeNull()

      localStorage.setItem('b', '2')
      localStorage.clear()
      expect(localStorage.length).toBe(0)
    })

    it('keeps the substitute in memory only, so the privacy setting still holds', () => {
      blockSiteData()
      runPrePaintScript()

      localStorage.setItem(STORAGE_KEY, 'light')

      // The shim is a plain object, not the real Storage the browser blocked.
      expect(window.localStorage).not.toBe(realLocalStorage)
      expect(window.localStorage instanceof Storage).toBe(false)
    })

    it('falls back to the default theme rather than guessing', () => {
      blockSiteData()

      runPrePaintScript()

      expect(document.documentElement.dataset.theme).toBeUndefined()
    })
  })
})
