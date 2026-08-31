# 11 — Privacy

## Data the extension may touch

| Data | Where | Retention |
|------|--------|-----------|
| `X-CFEG-*` headers of open message | Memory / short cache | Session / until navigate away |
| Settings (enabled, debug) | `browser.storage.local` | Until cleared |
| Compose recipients it sets | Gmail compose DOM | User’s draft only |

## Data the extension must not

- Upload mail to a third-party backend operated by this project (v1: **no network client to CFEG**)
- Exfiltrate full mailbox contents
- Log bodies when `debug` is off; when on, prefer local console only

## Permissions justification (planned)

| Permission | Why |
|------------|-----|
| Gmail host | Read open-message context + compose |
| storage | Settings |

No “read all sites”. No nativeMessaging v1.

## Threat notes

- Malicious page on other origins should not trigger Gmail adapter.
- Header injection: strip CR/LF before writing compose fields.
- Extension compromise ≈ ability to change To on reply — user still clicks Send; still serious — keep dependency surface small.

## User expectation

Extension only changes behavior for messages that already carry CFEG headers from **their** gateway forward path.
