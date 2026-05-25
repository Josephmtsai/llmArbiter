export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'arb-theme'

export function useTheme() {
  const theme = useState<Theme>('theme', () => 'dark')

  function apply(t: Theme) {
    theme.value = t
    if (import.meta.client) {
      document.documentElement.setAttribute('data-theme', t)
      localStorage.setItem(STORAGE_KEY, t)
    }
  }

  function toggle() {
    apply(theme.value === 'dark' ? 'light' : 'dark')
  }

  function init() {
    if (!import.meta.client) return
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
    apply(saved ?? 'dark')
  }

  return { theme, apply, toggle, init }
}
