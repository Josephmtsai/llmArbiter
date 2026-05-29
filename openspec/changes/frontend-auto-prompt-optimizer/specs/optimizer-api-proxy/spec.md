## ADDED Requirements

### Requirement: Server-side proxy for optimizer workflow APIs
The frontend SHALL call local Nuxt server API routes for optimizer workflow operations instead of calling Arbiter optimizer, eval pool, review queue, or pool evaluation endpoints directly from browser JavaScript.

#### Scenario: Browser calls local API
- **WHEN** the optimizer page requests eval pool stats, review queue entries, pool evaluation start, optimizer history, optimizer start, or optimizer cancellation
- **THEN** the browser request URL uses the Nuxt app origin and a local `/api/arbiter/...` route

#### Scenario: Backend credentials stay server-side
- **WHEN** a Nuxt server proxy route forwards a request to Arbiter
- **THEN** the Arbiter `X-API-Key` header is read from private runtime config and is not exposed through `runtimeConfig.public`

### Requirement: Proxy preserves backend status codes and stable error detail
The Nuxt server proxy SHALL preserve backend HTTP status codes and return a stable error shape that supports both FastAPI `detail` errors and Arbiter envelope errors.

#### Scenario: Backend returns detail error
- **WHEN** Arbiter returns an error body with `detail`
- **THEN** the proxy response keeps the backend status code and includes the same `detail` value

#### Scenario: Backend returns envelope error
- **WHEN** Arbiter returns an envelope with `status = "error"`
- **THEN** the proxy response preserves the message or data needed for UI error handling

### Requirement: Proxy validates required mutation input
Proxy routes SHALL validate required path and body inputs before forwarding mutation requests.

#### Scenario: Missing review correction action
- **WHEN** the client sends `action = "correct"` without `expected_action`
- **THEN** the proxy returns a validation error without forwarding an invalid request to Arbiter

#### Scenario: Missing optimizer run id
- **WHEN** an optimizer cancellation route cannot parse a numeric run id
- **THEN** the proxy returns a client error and does not call Arbiter
