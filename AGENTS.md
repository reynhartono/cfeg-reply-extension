# AGENTS.md — cfeg-reply-extension

## Phase

**Phase 2 — Gmail Reply intercept.** Fetch `X-CFEG-*` via Show original (`view=om` + `permmsgid` + `ik`); rewrite Reply/Reply-All compose recipients. Phase 3 = multiparty polish / badge hardening.

| Locked | Value |
|--------|--------|
| Repo | `cfeg-reply-extension` |
| Product UI name | **CFEG Reply** |
| Companion | **cf-email-gateway** (mints tokens + `X-CFEG-*`) |
| Browsers | Chrome (Chromium MV3) + Firefox MV3 — **one codebase, dual build** |
| Host v1 | Gmail web only |
| Out of scope | Mobile Gmail app, Workspace add-on, Worker code, per-browser repos |

## Clean-room

Ideas may come from public Gmail/webext projects. **Do not copy code.** License **MIT**.

## SoT order

1. `docs/09-decisions.md`
2. `docs/01-domain.md` + `docs/02-header-contract.md` (producer = **cf-email-gateway**)
3. `docs/05-host-gmail.md` + `docs/12-hosts.md`
4. `docs/04-architecture.md` + `docs/03-settings.md`
5. This file + `README.md`
6. `src/` implements the above

## Invariants

1. **No server secrets** in the extension (no SMTP credentials, no Gmail OAuth).
2. **Consume only** `X-CFEG-*` / agreed aliases; never invent reply targets from From/To guessing when headers absent.
3. **Reply** → bare hop from `X-CFEG-Reply-To-Addr` / angle-addr (mailbox form). **Reply-All** → primary hop + other parties’ tokens (`X-CFEG-Parties` / pN / `Reply-All-Addr`). **Tokens only** on the wire.
4. **Fail open for non-CFEG mail:** if headers missing/unsupported version, do not break native Gmail Reply.
5. **Do not rewrite message bodies** or strip original From; compose-target only.
6. **Host adapters** are pluggable (`hosts/gmail` first); header parser is host-agnostic.
7. **Chrome + Firefox same repo**; browser deltas are build/manifest only.
8. **No PII / real `.eml` / real tokens** in git — synthetic fixtures only.
9. **Mobile Gmail app** is not this product (manual `r+` or future separate add-on).
10. Name: **cfeg-reply-extension** / product **CFEG Reply**.
11. **Do not hijack blank “New message”** — only Reply context (pending reply action or `Re:` subject).
12. **Header contract:** current `X-CFEG-Version` **2**; producer SoT = **cf-email-gateway** header contract docs.

## Commands

```bash
npm install
npm test
npm run check
npm run build:all          # dist/chrome + dist/firefox
# Chrome: load unpacked → dist/chrome
# Firefox: about:debugging → dist/firefox/manifest.json
```

## Layout

- `src/shared/headers.js` — pure parser
- `src/shared/compose-intent.js` — Reply / Reply-All mapping
- `src/hosts/gmail/gmail-ids.js` — view=om URL + ik/raw extract (pure)
- `src/hosts/gmail/headers-source.js` — fetch Show original → context
- `src/hosts/gmail/compose.js` — chip/To/Cc rewrite
- `src/hosts/gmail/content.js` — intercept + toolbar

## Commits

Conventional Commits; scope optional e.g. `docs:`, `feat(gmail):`, `fix(headers):`.
