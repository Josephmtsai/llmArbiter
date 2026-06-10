# Spec: Guide Page Public Access

## Feature ID
`guide-public-access`

## Summary
Remove the `auth` middleware from `pages/guide.vue` so the How It Works guide is accessible without logging in. All other pages remain protected.

## Problem Statement
The guide page is documentation-only — it contains no sensitive data and makes no API calls. Requiring login before reading it creates unnecessary friction for new users who want to understand the system before setting up credentials.

## Scope

### In Scope
- Remove auth gate from `pages/guide.vue` only.

### Out of Scope
- Modifying any other page's auth requirement.
- Creating a separate public layout (sidebar API failures are already gracefully handled).
- Adding a "login to use" call-to-action on the guide page.
- Redirecting unauthenticated users who click sidebar nav links — they will hit the target page's own auth middleware and be redirected to `/login` automatically.

## Architecture Decision

### Why Option A (remove middleware only) is correct
The guide page makes no `useFetch` / `$fetch` calls of its own. It renders entirely from static data in `<script setup>`. The `AppSidebar` is in the default layout and calls `api.healthCheck()` and `api.getProviders()` on mount — both wrapped in `try/catch` that already handles 401s gracefully by setting `apiOnline = false` and `activeProvider = null`. The sidebar renders fine in this degraded state.

No new layout, no new component, no new composable is needed.

### Change
```diff
- definePageMeta({ middleware: 'auth' })
+ definePageMeta({ middleware: [] })
```

## Acceptance Criteria
See `tasks.md`.
