# 00 — Glossary

| Term | Meaning |
|------|---------|
| **CFEG** | Cloudflare Email Gateway (`cf-email-gateway`) |
| **CFEG Reply** | This product / extension UI name |
| **Token address** | `r+TOKEN[@.pN|.all]@our-domain` minted by the gateway |
| **Primary reply** | Address in `X-CFEG-Reply-To` — usual Reply target |
| **our_mailbox** | Original inbound address on our domain; reply hop sends **as** this |
| **Host** | Webmail UI the extension drives (v1: Gmail web) |
| **Host adapter** | Code that reads headers in that UI and rewrites compose |
| **Header contract** | Agreed `X-CFEG-*` fields + `X-CFEG-Version` |
| **Reply hop** | Gateway path: authorized mail to `r+TOKEN@` → ESP as our_mailbox → original sender/participants |
| **Fail open** | Without usable CFEG headers, native Reply behaves as stock Gmail |
| **Fail closed** (gateway) | Token auth on the Worker — not an extension concern |
| **MV3** | Chrome/Firefox Manifest V3 extension model |
| **Multiparty / pN** | Extra participants exposed as `X-CFEG-Reply-To-pN` + `X-CFEG-Participant-pN` |
| **Show original** | Gmail UI to view full headers (manual fallback) |

Synthetic examples only in docs/fixtures — never real mailboxes or live tokens in git.
