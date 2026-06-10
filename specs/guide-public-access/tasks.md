# Tasks: Guide Page Public Access

## Feature ID
`guide-public-access`

---

## Task 1 — Remove auth middleware from guide page
**File:** `pages/guide.vue`

Change:
```typescript
definePageMeta({ middleware: 'auth' })
```
to:
```typescript
definePageMeta({ middleware: [] })
```

### AC
- [ ] AC-1.1: Visiting `/guide` without a valid session does NOT redirect to `/login`.
- [ ] AC-1.2: Visiting any other protected page (e.g. `/`, `/decisions`, `/optimizer`) without a session still redirects to `/login`.
- [ ] AC-1.3: Visiting `/guide` with a valid session still works normally (page renders, sidebar shows provider state).

---

## Task 2 — TypeScript & test verification

### AC
- [ ] AC-2.1: `pnpm vue-tsc --noEmit` exits 0.
- [ ] AC-2.2: `pnpm exec vitest run --passWithNoTests` exits 0.
