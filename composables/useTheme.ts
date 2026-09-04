export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'arb-theme'

// A browser set to block site data throws on the localStorage getter itself, so
// even reaching for it has to be guarded. Unguarded, this threw inside app.vue's
// onMounted and took the whole app down with it - a blank page instead of a
// wrong theme.
function readStoredTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    // Site data blocked - fall back to the default.
    return null
  }
}

function persistTheme(t: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, t)
  } catch {
    // Site data blocked - the theme still applies for this page view.
  }
}

export function useTheme() {
  const theme = useState<Theme>('theme', () => 'dark')

  function apply(t: Theme) {
    theme.value = t
    if (import.meta.client) {
      // No setAttribute here on purpose - app.vue binds data-theme through
      // unhead, which would overwrite anything written directly to the DOM.
      persistTheme(t)
    }
  }

  function toggle() {
    apply(theme.value === 'dark' ? 'light' : 'dark')
  }

  function init() {
    if (!import.meta.client) return
    apply(readStoredTheme() ?? 'dark')
  }

  return { theme, apply, toggle, init }
}
