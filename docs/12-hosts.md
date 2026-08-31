# 12 — Hosts (port / adapter)

## Port

```text
HostAdapter
  canHandle(location) -> bool
  getOpenMessageRef() -> MessageRef | null
  getRawHeaders(messageRef) -> Promise<string | HeaderMap | null>
  onReplyIntent(kind: 'reply' | 'reply_all', handler) -> unsubscribe
  applyRecipients(composeRef, { to: string[], cc: string[] }) -> Promise<void>
```

Pure modules (not hosts):

- `parseCfegHeaders`
- `toComposeIntent(context, kind)`

## v1 adapter

| Id | Origins (indicative) | Status |
|----|----------------------|--------|
| `gmail` | `https://mail.google.com/*` | Phase 1–2 |

## Future adapters (same repo)

| Id | Notes |
|----|--------|
| `outlook_web` | Only if user demand; separate spike |
| `generic_eml` | Paste source tool — optional debug host |

## Registration

Build includes only enabled hosts. v1 ships **gmail** only to minimize permissions.
