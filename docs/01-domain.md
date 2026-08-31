# 01 — Domain

## Purpose

When the user views a message that CFEG forwarded with reply headers, **one-click Reply / Reply-All** should send through the gateway token addresses so outbound mail is authorized and From is **our_mailbox**, without breaking DKIM on the inbound copy.

## Actors

| Actor | Role |
|-------|------|
| End user | Reads mail in Gmail web; clicks Reply / Reply-All |
| CFEG Reply | Reads headers; rewrites compose recipients |
| cf-email-gateway | Already delivered message + headers; handles `r+` inbound |
| Alice / participants | External parties; receive hop mail from our domain |

## Core objects

### CfegMessageContext

Parsed from the open message’s headers (when present):

| Field | Source header (typical) |
|-------|-------------------------|
| `version` | `X-CFEG-Version` |
| `replyTo` | `X-CFEG-Reply-To` (or alias `X-Reply-To`) |
| `replyToDisplay` | `X-CFEG-Reply-To-Display` |
| `token` | `X-CFEG-Reply-Token` |
| `mailbox` | `X-CFEG-Reply-Mailbox` |
| `primary` | `X-CFEG-Reply-Primary` (`email\|name`) |
| `participants[]` | `X-CFEG-Reply-To-pN` + `X-CFEG-Participant-pN` |

If `version` unsupported or `replyTo` missing → **no CFEG context** (fail open).

### ComposeIntent

| Kind | Desired To/Cc behavior (v1 default) |
|------|-------------------------------------|
| `reply` | To = `replyTo` only (token). Optional UI hint from `replyToDisplay`. |
| `reply_all` | To = primary token; Cc (or additional To per host limits) = each `pN` token address that exists. Do **not** re-add the user’s own Gmail as recipient. |

Exact To vs Cc split is a host constraint; semantics = “all tokenized participants get a token recipient.”

### Settings (extension)

See `03-settings.md`. Minimal v1: enable/disable, optional debug.

## Lifecycles

### Message open

```text
user opens thread message
  → host adapter attempts header read
  → parse contract → CfegMessageContext | null
  → cache per message id for the session (implementation detail)
```

### Reply click

```text
user activates Reply or Reply-All
  → if context null: do nothing (native path)
  → else intercept / post-process compose
  → set recipients from ComposeIntent
  → user edits body and sends via normal Gmail send
```

Extension does **not** send mail itself in v1.

### Gateway after send

Out of scope here — user sends to `r+…@our-domain`; Worker reply hop applies.

## Rules

1. Never invent a token from `From:` alone.
2. Never replace recipients on non-CFEG messages.
3. Prefer headers over body scraping.
4. Unsupported `X-CFEG-Version` → fail open (optionally badge “update extension”).
5. Multiparty without `pN` headers → Reply-All degrades to primary-only (still better than native Alice-direct if primary token set).
6. No collection of message bodies to a backend operated by this extension.

## Non-objects

- Delivery attempts, D1, R2, routing YAML — gateway only.
- OAuth tokens for Gmail API — not v1.
