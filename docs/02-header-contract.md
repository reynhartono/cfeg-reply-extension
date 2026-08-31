# 02 — Header contract (consumer)

**Producer SoT:** **cf-email-gateway** header contract (`docs/15-x-cfeg-header-contract.md` in that project).  
**This file:** consumer pin for **CFEG Reply**. Breaking changes require `X-CFEG-Version` bump + coordinated releases.

---

## Version

| Value | Status |
|-------|--------|
| `2` | **Current** |
| missing | Treat as current when a usable hop is present |
| any other | Fail open (no intercept) |

---

## Required for activation

At least one of:

- `X-CFEG-Reply-To`
- `X-Reply-To`
- `X-CFEG-Reply-To-Addr`

Without a usable hop address, or with an unsupported `X-CFEG-Version` → **no intercept**.

---

## Participant rules (producer; extension trusts headers)

**Primary (Reply):** first external original `Reply-To`, else external `From`.  
**Others (Reply-All):** remaining external Reply-To → From → To → Cc (deduped).  
Our-domain addresses are not parties.

---

## Headers

| Header | Example | Consumer use |
|--------|---------|----------------|
| `X-CFEG-Version` | `2` | Contract version |
| `X-CFEG-Reply-To` | `"Alice <alice@a.com>" <r+TOKEN@example.test>` | Reply chip (display + hop) |
| `X-CFEG-Reply-To-Addr` | `r+TOKEN@example.test` | Bare hop (SMTP To) |
| `X-Reply-To` | same as Reply-To | Alias |
| `X-CFEG-Reply-To-Display` | `Alice <alice@a.com>` | UI only |
| `X-CFEG-Reply-Token` | `TOKEN` | Debug |
| `X-CFEG-Reply-Mailbox` | `desk@example.test` | Informational |
| `X-CFEG-Reply-Primary` | `alice@a.com\|Alice` | Optional label |
| `X-CFEG-Parties` | JSON array | **Preferred multiparty** |
| `X-CFEG-Reply-All-Addr` | `r+…, r+….p1, …` | Reply-All bare tokens |
| `X-CFEG-Reply-All` | full mailboxes CSV | Reply-All chips |
| `X-CFEG-Reply-To-pN` | `"Carol <c@…>" <r+….pN@…>` | Sequential fallback |
| `X-CFEG-Reply-To-pN-Addr` | bare | Sequential bare |
| `X-CFEG-Participant-pN` | `email\|name` | Labels |

### Mailbox form

```text
"Original Name <original@addr>" <r+TOKEN[.pN]@ourdomain>
```

Compose **display** may show the label; **SMTP recipient must be the angle-addr / `*-Addr` token**.

### `X-CFEG-Parties` element

```json
{
  "role": "primary|from|reply-to|to|cc|other",
  "header": "from|reply-to|to|cc",
  "name": "Alice",
  "email": "alice@a.com",
  "token": "r+TOKEN@example.test",
  "suffix": null,
  "mailbox": "\"Alice <alice@a.com>\" <r+TOKEN@example.test>"
}
```

---

## Reply vs Reply-All

| Action | Recipients |
|--------|------------|
| **Reply** | `[primary token]` only |
| **Reply-All** | **To** = primary + parties with role/header `to` / `from` / `reply-to`; **Cc** = role/header `cc` only |

**Tokens only** — never raw Alice/Carol on the wire.

### Parse sketch

```text
1. version ← X-CFEG-Version (missing → current; unsupported → fail open)
2. if Parties JSON → use it (skip primary in participants list)
3. else p1..pN + primary
4. replyToAddr ← Reply-To-Addr or angle-addr from Reply-To mailbox
5. replyToMailbox ← full Reply-To if mailbox-form
```

---

## Example scenarios

### S1 — Simple From

```text
From: Alice <alice@a.com>
To: desk@example.test
```

```text
X-CFEG-Version: 2
X-CFEG-Reply-To: "Alice <alice@a.com>" <r+TOKEN@example.test>
X-CFEG-Reply-To-Addr: r+TOKEN@example.test
X-CFEG-Parties: [{"role":"primary","header":"from","name":"Alice","email":"alice@a.com","token":"r+TOKEN@example.test","suffix":null,...}]
```

**Reply** → To: `r+TOKEN@example.test`  
**Reply-All** → same (no others)

---

### S2 — From + Cc

```text
From: Example Sender <sender@example.com>
To: cc-test@example.test
Cc: cc-peer@example.test
```

```text
X-CFEG-Version: 2
X-CFEG-Reply-To: "Example Sender <sender@example.com>" <r+TOKEN@example.test>
X-CFEG-Reply-To-p1: "cc-peer@example.test" <r+TOKEN.p1@example.test>
X-CFEG-Reply-All-Addr: r+TOKEN@example.test, r+TOKEN.p1@example.test
```

**Reply** → Example Sender token only  
**Reply-All** → To primary token; Cc p1 token

---

### S3 — Original Reply-To wins

```text
From: Alice <alice@a.com>
Reply-To: Desk <desk@vendor.com>
To: catch@example.test
Cc: Carol <carol@c.com>
```

| # | email | role |
|---|-------|------|
| 0 | desk@vendor.com | primary |
| p1 | alice@a.com | from |
| p2 | carol@c.com | cc |

```text
X-CFEG-Version: 2
X-CFEG-Reply-To: "Desk <desk@vendor.com>" <r+TOKEN@example.test>
X-CFEG-Reply-To-p1: "Alice <alice@a.com>" <r+TOKEN.p1@example.test>
X-CFEG-Reply-To-p2: "Carol <carol@c.com>" <r+TOKEN.p2@example.test>
```

---

### S4 — Multi To + multi Cc

```text
From: Alice <alice@a.com>
To: Bob <bob@b.com>, catch@example.test, Dana <dana@d.com>
Cc: Carol <carol@c.com>, Eve <eve@e.com>
```

Parties: Alice, Bob, Dana, Carol, Eve (`catch@example.test` omitted).  
Reply-All-Addr: five tokens.

---

### S5 — Multi Reply-To

```text
From: Alice <alice@a.com>
Reply-To: R1 <r1@x.com>, R2 <r2@x.com>
To: catch@example.test
```

Primary `r1@`; p1 `r2@`; p2 Alice.

---

## Out of contract

- Gateway minting, D1, hop auth — `cf-email-gateway`  
- Native Gmail may ignore X-headers — extension required for one-click  

## Implementation

- Parser: `src/shared/headers.js`  
- Intent: `src/shared/compose-intent.js`  
- Tests: `test/headers.test.js`, `test/compose-intent.test.js`
