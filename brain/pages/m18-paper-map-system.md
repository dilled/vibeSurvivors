---
id: m18-paper-map-system
title: "M18 ‒ Paper map system: walked-reveal parchment map (Y), proximity landmark/territory discovery, player-side state only"
category: decision
status: active
tags: [m18, map, ui]
created: "2026-10-17T23:48:14"
updated: "2026-10-17T23:48:32"
---

<!-- compiled_truth -->
M18 = the paper map system. Scope: the player can navigate using an in-world paper map (PLAN.md M18 row). Shipped `e8f9270`.

**No minimap ‒ a paper sheet, revealed as walked.** Key `Y` opens a parchment canvas overlay on which the island is drawn only as far as the player has walked it. Terrain reveal = a visited-cell grid (2.5 u cells, 176x176 over the island) that marks cells within 6 u of the player, exposed over a **one-shot deterministic base raster** (the terrain zone palette sampled once at load, no rng, no per-frame regeneration).

**Proximity discovery, once known always known.** Within 40 u the map permanently records: the wreck (known from the start ‒ the ashore point), the camp + flag, fires (per index), the gull nest, school fishing spots (via `bx/bz`), plant sites (per index), and **per-instance animal territories** for all 10 species (threat-inked circles at `homeR`; fish surface as the fishing spots above, not as territory circles). Discovery state is in-memory player-side.

**Deliberate constraints (the durable part):**
- **Pure player-side runtime state, like journal/learned:** no rng, no world mutation, and **no saving hook ‒ M25 owns save/load**, so nothing about the map is persisted or written into the world.
- `frame()` gains exactly two calls: `mapTick` (reveal + discovery) and `mapDraw` (redraw throttled to 0.15 s while open).
- UI: parchment canvas at z-index 15 (above hint/toasts, below the death screen), auto-closes on death; `?map=1` is a debug-only param that opens the map at load.

**Smoke (new M18 block in `smoke/run.mjs`):** the 2D `ctx` stub was extended with the methods the draw path uses; the block proves the map starts closed, the wreck is known, toggling draws on the stub ctx (throttled), proximity discovery works on a controlled-state monkey territory, discovery is idempotent at a fixed position, distant plants do not leak, and the block restores clean state; the 10-species registry assert still holds. SMOKE_OK with 0 `rng()` calls in the section.

**Verification note:** headless screenshots are not runnable on this host (no Chrome ‒ M17 precedent); the open-map render is exercised via the stub ctx instead.


## Timeline

- time: 2026-10-17T23:48:14
  kind: decision
  summary: "Created this page: M18 ‒ Paper map system: walked-reveal parchment map (Y), proximity landmark/territory discovery, player-side state only"
  source: "PLAN.md M18 row; commit e8f9270"
  affects: [m18-paper-map-system]

- time: 2026-10-17T23:48:32
  kind: decision
  summary: "Filling compiled_truth from PLAN.md M18 row + committed implementation (e8f9270)"
  source: "PLAN.md M18; commit e8f9270"
  affects: [m18-paper-map-system]
