import { mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { resolveSafeRedirect } from '../utils/auth'

// pages/login.vue leans on Nuxt auto-imports; provide them before importing it.
// resolveSafeRedirect is stubbed with the real implementation, so this exercises
// the page's wiring rather than a reimplementation of the guard.
const navigateTo = vi.fn()
const login = vi.fn()
let query: Record<string, unknown>

vi.stubGlobal('ref', ref)
vi.stubGlobal('definePageMeta', () => undefined)
vi.stubGlobal('resolveSafeRedirect', resolveSafeRedirect)
vi.stubGlobal('navigateTo', navigateTo)
vi.stubGlobal('useRoute', () => ({ path: '/login', fullPath: '/login', query }))
vi.stubGlobal('useAuthStore', () => ({ login, error: null, loading: false }))

const LoginPage = (await import('../pages/login.vue')).default

const stubs = {
  UiField: { props: ['label'], template: '<label><slot /></label>' },
  UiInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  },
  UiButton: { template: '<button type="submit"><slot /></button>' },
}

async function submitWith(redirect: unknown, loginResult: boolean) {
  query = redirect === undefined ? {} : { redirect }
  login.mockResolvedValue(loginResult)
  const wrapper = mount(LoginPage, { global: { stubs } })
  await wrapper.find('input').setValue('a-password')
  await wrapper.find('form').trigger('submit')
  await Promise.resolve()
  return wrapper
}

beforeEach(() => {
  navigateTo.mockReset()
  login.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('pages/login.vue redirect handling', () => {
  it('returns to the page the user was sent away from (AC-5.2)', async () => {
    await submitWith('/decisions', true)

    expect(login).toHaveBeenCalledWith('a-password')
    expect(navigateTo).toHaveBeenCalledWith('/decisions')
  })

  it('preserves a query string on the original path (AC-5.2)', async () => {
    await submitWith('/decisions?limit=10', true)

    expect(navigateTo).toHaveBeenCalledWith('/decisions?limit=10')
  })

  it('refuses an off-site redirect and lands on the dashboard (AC-5.3)', async () => {
    await submitWith('https://evil.com', true)

    expect(navigateTo).toHaveBeenCalledWith('/')
  })

  it('refuses a protocol-relative redirect (AC-5.3)', async () => {
    await submitWith('//evil.com', true)

    expect(navigateTo).toHaveBeenCalledWith('/')
  })

  it('lands on the dashboard when no redirect is present (AC-5.4)', async () => {
    await submitWith(undefined, true)

    expect(navigateTo).toHaveBeenCalledWith('/')
  })

  it('stays on the login page when the password is rejected', async () => {
    await submitWith('/decisions', false)

    expect(navigateTo).not.toHaveBeenCalled()
  })
})
