# 08 — Roadmap

## Phase 0 — Docs ✅

- [x] Repo `cfeg-reply-extension`
- [x] AGENTS + numbered docs
- [x] Header contract pin
- [x] Chrome+Firefox same-repo decision
- [x] Mobile explicitly out of scope

## Phase 1 — Bootstrap + header parser ✅

- [x] package.json, MV3 manifests (chrome/firefox)
- [x] Pure `parseCfegHeaders` + unit tests (synthetic vectors)
- [x] Compose-intent helpers + tests
- [x] Minimal content script shell on Gmail (no intercept yet)
- [x] `npm run build:all` → load unpacked `dist/chrome` / `dist/firefox`

## Phase 2 — Gmail Reply intercept ✅

- [x] Spike KI-G1: Show original via `view=om` + `permmsgid` + `ik` (same-origin fetch)
- [x] Wire context → Reply / Reply-All recipient rewrite
- [x] Fail-open paths + popup enable toggle + floating toolbar
- [ ] Pilot E2E against live `cf-email-gateway` + pilot Gmail (operator)

## Phase 3 — Multiparty + polish

- [x] pN Reply-All mapping (compose-intent; live DOM polish ongoing)
- [ ] Display-name hints in chips
- [ ] Hardening against Gmail DOM churn (iterate from pilot feedback)
- [ ] Optional badge when CFEG message detected

## Phase 4 — Package

- [x] GitHub pre-release zip artifacts (Chrome + Firefox)
- [ ] Store assets / unlisted CWS/AMO publish (optional)
- [ ] Keep `X-CFEG-Version` support matrix in sync with **cf-email-gateway** header contract
- [x] Release notes / load instructions in GitHub release body

## Later / separate products

| Idea | Where |
|------|--------|
| Outlook.com host | Same repo, new `hosts/outlook` |
| Google Workspace Add-on (Gmail mobile + web card) | **`cfeg-reply-addon`** (separate product; Phase 0 docs) |
| Native mobile apps | Not planned |

## Dependency on gateway

Extension Phase 2 pilot needs gateway already minting `X-CFEG-*` on `cf_forward` (done on gateway side per companion docs).
