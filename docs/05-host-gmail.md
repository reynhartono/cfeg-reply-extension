# 05 — Host: Gmail web

## Scope

**mail.google.com** (and standard Gmail UI entry points). Not the iOS/Android Gmail apps.

## Goals

1. Detect the **currently open** message (not only thread list).
2. Read **full headers** including `X-CFEG-*`.
3. Intercept or follow **Reply** and **Reply-All**.
4. Set compose **To** (and Cc as needed) to token addresses before the user sends.

## Header acquisition strategies (priority order)

Gmail does not expose arbitrary headers in the normal reading pane DOM.

| Priority | Strategy | Notes |
|----------|----------|-------|
| A | **Show original equivalent** | **Implemented (Phase 2):** same-origin `GET` `view=om&ik=&permmsgid=` using visible `[data-message-id]` + `ik` scraped from page HTML/links; parse `<pre>` for `X-CFEG-*` |
| B | **Gmail.js-style DOM/legacy globals** | Not used (fragile; page-world CSP) |
| C | **Toolbar “CFEG Reply”** | **Implemented:** force rewrite open compose if auto path missed |

### KI-G1 ADR (locked default)

- **URL shape (public UI):** `/mail/u/{n}/?ik={ik}&view=om&permmsgid={msg-f:…}`
- **Message id:** first visible `[data-message-id]` (normalize leading `#`)
- **ik:** parse from anchors / `GM_ID_KEY` / `ik=` in DOM HTML (isolated world; no page-script copy)
- **Cache:** per `permmsgid` session memory
- **Failure:** fail open; user can still use manual `r+` or toolbar retry

If Google changes `view=om`, revisit this ADR before inventing new endpoints.

## Reply interception

| Approach | Pros | Cons |
|----------|------|------|
| Click capture on Reply buttons | Direct | Selector churn |
| Observe compose box creation + rewrite To | Survives some UI changes | Race windows |
| Keyboard shortcut intercept (r / a) | Power users | Incomplete alone |

**Default:** combine button observe + compose mutation rewrite (idempotent set of recipients).

## Compose field rules

- Clear Gmail’s prefilled To (Alice) when CFEG context exists for Reply.
- Reply-All: replace external participants with token addresses; drop self.
- Do not touch Subject/body except optional subtle note in debug builds (default: **no body mutation**).

## SPA navigation

Gmail is an SPA. Re-run detection on history/thread changes. Drop stale context when message id changes.

## Accounts / multiple inboxes

Support the visible active account’s UI. No cross-account token mixing. If headers belong to the open message, trust them (gateway already authorized mint).

## Internationalization

Selectors and “Show original” labels vary by UI language — prefer stable `data-` / URL patterns over English button text when possible.

## Explicit non-goals

- Offline Gmail
- Google Workspace Add-on APIs (separate product)
- Reading all mailbox mail in the background without user opening a message (avoid broad surveillance posture)
