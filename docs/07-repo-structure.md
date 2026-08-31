# 07 — Repo structure (target)

Phase 0 was docs-only. **Phase 1+ tree:**

```text
cfeg-reply-extension/
├── AGENTS.md
├── README.md
├── LICENSE
├── package.json
├── .gitignore
├── .env.example
├── docs/
├── src/
│   ├── background/service-worker.js
│   ├── shared/
│   │   ├── headers.js
│   │   ├── compose-intent.js
│   │   └── settings.js
│   ├── hosts/gmail/
│   │   ├── content.js
│   │   └── headers-source.js
│   └── popup/
├── targets/
│   ├── chrome/manifest.json
│   └── firefox/manifest.json
├── assets/icons/
├── test/
├── scripts/build.mjs
├── scripts/gen-icons.mjs
└── dist/                   # gitignored — npm run build:all
```

## Boundaries

| Path | May depend on |
|------|----------------|
| `shared/headers` | nothing host-specific |
| `hosts/gmail` | shared + DOM |
| `targets/*` | build only |

## Not in this repo

- `cf-email-gateway` Worker
- OpenTofu / catch-alls
- Real `.eml` corpora
