# 04 — Architecture

## Context diagram

```text
┌─────────────────────────┐         X-CFEG-* on forward
│   cf-email-gateway      │ ──────────────────────────┐
│   (Worker / D1 / R2)    │                           │
└─────────────────────────┘                           ▼
                                          ┌──────────────────────┐
                                          │ Gmail web (browser)  │
                                          │  message + headers   │
                                          └──────────┬───────────┘
                                                     │ read / compose
                                          ┌──────────▼───────────┐
                                          │ CFEG Reply (MV3)     │
                                          │  parser + host + UI  │
                                          └──────────┬───────────┘
                                                     │ user sends
                                          ┌──────────▼───────────┐
                                          │ r+TOKEN@ → gateway   │
                                          │ reply hop → Alice    │
                                          └──────────────────────┘
```

## Extension components (target)

| Component | Responsibility |
|-----------|----------------|
| **background** (SW) | Install, settings defaults, optional message routing |
| **content script (Gmail)** | Detect open message, Reply buttons, compose DOM |
| **headers module** | Pure parse/validate of contract (unit-testable) |
| **host adapter: gmail** | Gmail-specific DOM / source retrieval |
| **optional popup** | Enable toggle, status, version |
| **build** | Chrome zip vs Firefox artifacts from shared src |

## Data flow

1. Content script observes thread/message view.
2. Obtain raw headers (strategy order in `05-host-gmail.md`).
3. `parseCfegHeaders(raw) → context | null`.
4. On Reply / Reply-All, apply `ComposeIntent` to compose fields.
5. Leave send to Gmail.

## Trust boundaries

| Boundary | Rule |
|----------|------|
| Extension ↔ Gmail DOM | Untrusted DOM; harden selectors; no `eval` of mail HTML as code |
| Extension ↔ network | v1 **no** CFEG backend calls from extension |
| Extension ↔ gateway contract | Versioned headers only |

## Dual-browser

```text
src/                 shared
targets/chrome/      manifest + icons merge
targets/firefox/     manifest + gecko id
```

Use `browser.*` via polyfill. No separate product logic forks.

## Failure modes

| Case | Behavior |
|------|----------|
| Headers unavailable | Fail open |
| Compose race (Gmail redraw) | Retry set recipients once/twice; then fail open |
| Multiple compose windows | Bind context to the message that initiated reply |
| Extension disabled | Native Gmail only |

## Non-architecture

- Not a MIME rewriter
- Not an SMTP client
- Not a mobile app
