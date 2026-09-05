/**
 * Open-redirect guard for the `?redirect=` query on the login page.
 *
 * Accepts only same-origin relative paths. `//host` is protocol-relative and a
 * backslash is normalised to `/` by some browsers, so both are rejected; so is
 * `/login`, which would otherwise bounce the user back to the form.
 */
export function resolveSafeRedirect(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//')) return fallback
  if (raw.includes('\\')) return fallback
  if (raw === '/login' || raw.startsWith('/login?')) return fallback
  return raw
}
