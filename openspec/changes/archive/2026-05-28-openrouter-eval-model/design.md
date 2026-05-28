## Context

The backend now supports four providers (`ollama`, `claude`, `codex`, `openrouter`). When `openrouter` is active, an optional `model` field on `POST /evaluate` lets callers specify which OpenRouter model to use. The backend also returns two new fields on the evaluate response: `persisted` (bool) and `discard_reason` (string | null). The frontend needs to expose all of this and make the active model visible at a glance.

Current state:
- `types/api.ts`: `EvaluateRequest` has no `model` field; `EvaluationSummary` has no `persisted`/`discard_reason`
- Provider selector (Settings page) lists three providers; `openrouter` is not in the UI
- Evaluate page has no model picker
- Sidebar footer shows active provider name only

## Goals / Non-Goals

**Goals:**
- Add `openrouter` to the provider dropdown (Settings page)
- Show a model picker on Evaluate page when active provider is `openrouter`
- Wire the picked model into `POST /evaluate`
- Show a discard warning when the evaluate response has `persisted: false`
- Display the active model label on the Evaluate page (near the Run button) and in the sidebar footer next to the provider name

**Non-Goals:**
- Fetching the list of available OpenRouter models from API (static list of 3 shortcuts + free-text only)
- Per-run model persistence (model selection is session-local, not saved)
- Any backend changes

## Decisions

### Model selector: shortcuts + free-text, not a dropdown

Three named shortcuts (DeepSeek Flash, Qwen Plus, HY3) cover the most common cases. A free-text input handles arbitrary model IDs. A dropdown would require fetching OpenRouter's model catalogue, which the backend doesn't expose. Empty = server default.

**Alternative**: Full dropdown with API-fetched models — rejected; adds a new API dependency and the list changes too frequently.

### Model label display: Evaluate page header chip + sidebar footer

The Evaluate page shows a small chip next to the "Run evaluation" button: `openrouter · deepseek-flash` (or `openrouter · default` if no model picked). The sidebar footer already shows the active provider — it gains a subtitle line with the model shortname when provider is openrouter.

This answers "which model am I running?" without navigating away.

**Alternative**: Only in the results card — rejected; user needs to see the model *before* running too.

### `model` value in request: send shorthand key, not full model string

The UI stores the shorthand key (`deepseek-flash`, `qwen-plus`, `hy3`) or a raw free-text value. The backend maps shorthand keys to full model strings server-side. Sending the shorthand key keeps the UI simple and the mapping centralised on the backend.

### Discard warning: inline banner, not a toast

An inline warning inside the results card is persistent and re-readable. A toast would vanish. Inline fits the existing results layout.

## Risks / Trade-offs

- [Model selector only shows when provider is openrouter] If the user switches provider away from openrouter, the picked model is forgotten — mitigation: model selection is intentionally ephemeral, matches YAGNI
- [Backend short-hand key mapping may change] Frontend sends `deepseek-flash` etc.; if backend renames keys the UI breaks silently — mitigation: treat unknown discard_reason values gracefully with a fallback message

## Migration Plan

Frontend-only change. No migration needed. Provider dropdown auto-populates from `available_providers` in the `GET /config/provider` response, so `openrouter` will appear as soon as the backend includes it.
