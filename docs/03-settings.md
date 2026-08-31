# 03 — Settings & storage

## Principle

v1 needs **almost no settings**. Prefer zero-config: install → works on Gmail when headers present.

## Planned keys (extension storage)

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `enabled` | bool | `true` | Master switch |
| `debug` | bool | `false` | Verbose logging to extension console |
| `supportedVersions` | number[] | `[1]` | Client capability (code constant may supersede) |

No account linking. No API keys in v1.

## Storage location

- `browser.storage.sync` optional later for sync across desktops.
- v1 default: `browser.storage.local` is enough.

## What we do not store

- Full email bodies
- Persistent copies of tokens beyond short-lived in-memory/message cache
- Analytics identifiers phoned home (none)

## Permissions posture

Minimize:

- Host permissions: Gmail origins only for v1
- `storage` if settings used
- Avoid `https://*/` broad access

Exact permission list locked in Phase 1 manifest work (`04`, `07`).
