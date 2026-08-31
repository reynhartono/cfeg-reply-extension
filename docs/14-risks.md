# 14 — Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gmail DOM / endpoint churn | Intercept breaks | Fail open; isolate host adapter; parser tests stay green |
| Cannot read X-* without fragile hacks | No one-click | Spike early; degraded manual path; gateway still works with copy-paste `r+` |
| User replies natively anyway | Mail bypasses hop / wrong From path | Optional badge “CFEG — use extension Reply”; docs |
| Over-broad permissions | Store reject / user trust | Gmail-only hosts |
| Contract drift vs gateway | Wrong recipients | Pin `02-header-contract`; version header; dual-repo checklist on gateway header changes |
| XSS via header values in DOM | Account risk | Escape/assign via safe APIs; no innerHTML of raw headers |
| Multiparty incomplete headers | Missing Cc | Degrade to primary token; don’t invent |
| Store review delay | Distribution | Load unpacked for personal pilot indefinitely |

## Accepted

- Mobile gap until a different product  
- Dependence on gateway minting headers correctly  
