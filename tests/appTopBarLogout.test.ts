import { mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const navigateTo = vi.fn()
const logout = vi.fn()

vi.stubGlobal('ref', ref)
vi.stubGlobal('navigateTo', navigateTo)
vi.stubGlobal('useState', <T>(_key: string, init: () => T) => ref(init()))
vi.stubGlobal('useTheme', () => ({ theme: ref('dark'), toggle: vi.fn() }))
vi.stubGlobal('useAuthStore', () => ({ logout }))

const AppTopBar = (await import('../components/AppTopBar.vue')).default

function mountBar() {
  return mount(AppTopBar, { props: { title: 'Decisions' } })
}

/** The sign-out control is the second icon button; the first toggles the theme. */
function signOutButton(wrapper: ReturnType<typeof mountBar>) {
  return wrapper.findAll('.arb-topbar__icon-btn')[1]
}

beforeEach(() => {
  navigateTo.mockReset()
  logout.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AppTopBar sign-out', () => {
  it('leaves for /login once the server confirms the sign-out', async () => {
    logout.mockResolvedValue(true)
    const wrapper = mountBar()

    await signOutButton(wrapper).trigger('click')
    await Promise.resolve()

    expect(logout).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledWith('/login')
  })

  it('stays on the current page when sign-out fails (AC-6.7)', async () => {
    logout.mockResolvedValue(false)
    const wrapper = mountBar()

    await signOutButton(wrapper).trigger('click')
    await Promise.resolve()

    expect(logout).toHaveBeenCalledTimes(1)
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
