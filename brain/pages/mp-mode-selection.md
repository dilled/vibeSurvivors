---
id: mp-mode-selection
title: "MP mode selection: bare production URL is multiplayer, no hardcoded URLs (lib/cfg.js)"
category: decision
status: active
created: "2026-10-25T21:03:32"
updated: "2026-10-25T21:03:48"
---

<!-- compiled_truth -->
## MP mode selection

Players must not need to modify the URL. Resolution order (top wins):

1. `?mp=host:port` or `?mp=wss://...` ‒ explicit, always wins (dev / other servers).
2. **Bare URL on the production domain is MULTIPLAYER**: page hostname equals `VIVS_CFG.mpDomain` (vibesurvivors.kopale.site) and no `?sp` flag ‒ the client auto-connects to `VIVS_CFG.mpHost` (ws.kopale.site). So `https://vibesurvivors.kopale.site/` is the shared-island MP game.
3. `?sp` ‒ single player (works on the production domain to opt out of MP).
4. Any other hostname (localhost/127.x dev) ‒ single player unless `?mp=` is given (house dev pattern preserved).

### No hard-coded URLs in code (user rule)

Deployment settings live in **`lib/cfg.js`** ‒ a classic (non-module) script loaded before the game module, setting `window.VIVS_CFG = { mpHost, mpDomain }`. index.html reads it defensively (`(window.VIVS_CFG) || {}`): a missing/empty file means "no deployment defaults" and the game still works (pure single player unless `?mp=`). This is the settings-file mechanism for the no-build-step stack; the ServerBase web deploy copies `lib/` wholesale, so the deployed server serves it automatically.

Implementation notes:
- `MP_ON` must be a real boolean (`!!(...)`) ‒ the M34 smoke asserts `MP_ON === false` on the (non-mp) smoke page, and `false || undefined` evaluates `undefined`.
- The smoke harness only extracts the inline module; the external `<script src="lib/cfg.js">` tag is inert there.
- If the MP server is down on the production domain the island renders empty (M34: local gen skipped) and mp.js retries the connection with backoff ‒ known trade-off, no SP fallback.


## Timeline

- time: 2026-10-25T21:03:32
  kind: decision
  summary: "Created this page: MP mode selection: bare production URL is multiplayer, no hardcoded URLs (lib/cfg.js)"
  source: created via brain create-page
  affects: [mp-mode-selection]

- time: 2026-10-25T21:03:48
  kind: decision
  summary: "Bare production URL is multiplayer; deployment settings in lib/cfg.js (window.VIVS_CFG), never hardcoded in game code; ?sp = single player, ?mp= always wins"
  source: brain update-truth
  affects: [mp-mode-selection]
