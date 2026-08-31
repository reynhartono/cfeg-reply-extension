# cfeg-reply-extension

**CFEG Reply** — desktop browser extension that makes Gmail **Reply** / **Reply-All** use Cloudflare Email Gateway reply tokens (`r+TOKEN@domain`) carried in `X-CFEG-*` headers.

> **Status:** Phase 2 — Gmail Reply/Reply-All via `X-CFEG-*` hop tokens.  
> **Companion:** **cf-email-gateway** mints tokens and attaches headers on forward.  
> License **MIT**. Clean-room.

## Why

Native Gmail **ignores** custom `X-Reply-To` / `X-CFEG-Reply-To`.  
CF `message.forward()` may only add **`X-*`** headers (so original From/DKIM stay intact).  
Without an extension, you must manually address `r+TOKEN@…`.

```text
Alice → CF MX → cf-email-gateway
  → archive + mint r+TOKEN
  → forward to Gmail + X-CFEG-Reply-To
  → CFEG Reply (this repo): Reply click → To = r+TOKEN@…
  → reply hop → SMTP as our_mailbox → Alice
```

## Dev

```bash
npm install
npm test
npm run build:all
```

| Load unpacked | Path |
|---------------|------|
| Chrome / Edge / Brave | `dist/chrome` |
| Firefox | `dist/firefox` (temporary add-on) |

Popup: enable/debug toggles. On Gmail: floating **CFEG Reply** / **Reply-All** buttons; auto-rewrite after Reply when `X-CFEG-*` present.

## Non-goals

- Mobile Gmail app / iOS / Android (**see sibling** `cfeg-reply-addon`)
- Google Workspace Add-on (sibling product, not this repo)
- Rewriting inbound MIME or DKIM
- Server-side secrets inside the extension
- Outlook.com / other webmail (architecture allows later hosts)
- Shipping separate Chrome vs Firefox repositories

## Stack

- Manifest V3
- Shared ESM source; **esbuild** → `dist/chrome` + `dist/firefox`
- Content script bundled as IIFE; SW/popup as ESM
- Gmail web host adapter first

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/09-decisions.md](docs/09-decisions.md) | Product defaults (SoT) |
| [docs/02-header-contract.md](docs/02-header-contract.md) | `X-CFEG-*` consumer contract |
| [docs/01-domain.md](docs/01-domain.md) | Objects + behaviors |
| [docs/05-host-gmail.md](docs/05-host-gmail.md) | Gmail integration notes |
| [docs/08-roadmap.md](docs/08-roadmap.md) | Phases |
| [docs/04-architecture.md](docs/04-architecture.md) | Components |
| [AGENTS.md](AGENTS.md) | Agent / contributor rules |

## Layout

See [docs/07-repo-structure.md](docs/07-repo-structure.md).

## Related

| Product | Role |
|---------|------|
| **cf-email-gateway** | Worker, tokens, headers, reply hop |
| **cfeg-reply-addon** | Gmail Workspace Add-on (web + mobile card hop apply) |
