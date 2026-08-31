# 06 — Ops

## Load unpacked (dev)

```bash
npm install && npm test && npm run build:all
```

### Chrome / Chromium

1. `chrome://extensions` → Developer mode → **Load unpacked** → `dist/chrome`
2. Open `https://mail.google.com`
3. Popup: toggle Enabled / Debug

### Firefox

1. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `dist/firefox/manifest.json`
2. Same Gmail smoke as Chrome

### Notes

- Rebuild after code changes: `npm run build:all`, then reload the extension
- Reply on a CFEG-forwarded message → To should become `r+…@`; toast confirms
- Floating **CFEG Reply** / **CFEG Reply-All** if auto rewrite misses
- Popup → Debug for `[cfeg-reply]` console logs

## Pilot checklist (with a live gateway)

1. Confirm the gateway sets `X-CFEG-*` on forward.
2. Send external mail that the gateway forwards to the pilot Gmail.
3. In Gmail → Show original → verify headers (baseline without extension).
4. Load CFEG Reply → open message → Reply → To must be `r+…@`.
5. Send reply → hop should deliver as the gateway mailbox.
6. Reply-All multiparty when party headers are present.

## Store release (later)

| Store | Artifact |
|-------|----------|
| Chrome Web Store | zip from `build:chrome` |
| Firefox AMO | xpi / web-ext sign |

Unlisted listings until ready. No PII in screenshots.

## GitHub release zips

```bash
npm test && npm run pack
```

| Asset | Load |
|-------|------|
| `cfeg-reply-extension-*-chrome.zip` | Unzip → Chrome Load unpacked |
| `cfeg-reply-extension-*-firefox.zip` | Unzip → `about:debugging` temporary add-on → `manifest.json` |
