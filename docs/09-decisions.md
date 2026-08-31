# 09 — Decisions & defaults

**Product SoT.** Sync `AGENTS.md` when changing.

---

## Locked

| # | Topic | Default |
|---|--------|---------|
| Q1 | Repo name | `cfeg-reply-extension` |
| Q2 | Product name | **CFEG Reply** |
| Q3 | Browser packaging | **One repo**, dual MV3 build (Chrome/Chromium + Firefox) |
| Q4 | Not separate browser repos | Confirmed |
| Q5 | Host v1 | **Gmail web only** |
| Q6 | Mobile Gmail app | **Out of scope here** — sibling product **`cfeg-reply-addon`** (Workspace Add-on) |
| Q7 | Server secrets in extension | **None** v1 |
| Q8 | Activation | Usable hop: `X-CFEG-Reply-To` / `X-Reply-To` / `X-CFEG-Reply-To-Addr` |
| Q9 | Missing headers | **Fail open** (native Gmail) |
| Q10 | Reply mapping | To = **bare hop token** only; **wipe** Gmail default To (never append) |
| Q11 | Reply-All mapping | **To** = primary + parties role/header `to`/`from`/`reply-to`; **Cc** = role/header `cc` only; wipe originals first |
| Q12 | Body mutation | **No** (default) |
| Q13 | Header contract | Current = **`X-CFEG-Version` 2**; producer SoT **cf-email-gateway**; consumer pin `docs/02` |
| Q14 | Unknown future version | Fail open |
| Q15 | Architecture | Shared parser + host adapters |
| Q16 | Companion | **cf-email-gateway** produces headers; this repo consumes only |
| Q17 | License | **MIT** |
| Q18 | Clean-room | No copying AGPL/other extension source |
| Q19 | Settings v1 | Optional enable + debug; zero-config default on |
| Q20 | Analytics / phone-home | **None** |
| Q21 | Gmail API OAuth in extension | **Not v1** |
| Q22 | Umbrella name `cfeg-browser-extensions` | **Rejected** — product-named repo |

---

## Defaults for open implementation details

| # | Topic | Default until revisited |
|---|--------|-------------------------|
| D1 | Header source on Gmail | Prefer automated original/source fetch; spike in Phase 2 |
| D2 | storage.sync vs local | **local** v1 |
| D3 | Popup | Simple on/off + status |
| D4 | Edge/Brave | Use Chromium build |
| D5 | Safari | **Not planned** |

---

## Not open / rejected

- Extension inside `cf-email-gateway` monorepo as Worker sibling SoT  
- Inventing reply targets from From/To without CFEG headers  
- ESP/API keys in the extension  
- Dual-delivery or MIME rewrite in the browser  
- Mobile-first scope for this repo  

---

## Clean-room

Implement from **our docs + public browser/Gmail behaviors**. Inspiration from existing Gmail extensions is ideas-only — **no code copy**.
