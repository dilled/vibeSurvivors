---
id: m21-escape-win
title: "M21 ‒ Escape/win sequence: board the M20 raft (E), row out with WASD, rowing past WIN_R freezes the sim into the #won overlay"
category: decision
status: active
tags: [m21, raft, win, ending]
created: "2026-10-18T00:41:49"
updated: "2026-10-18T01:09:08"
---

<!-- compiled_truth -->
M21 = escape/win sequence: the M20 raft becomes a working game ending (PLAN.md M21: "Completed raft provides a working game ending"). Shipped `d312b0c`; M22 (`d421394`) later extended the win overlay with an E-stay path into [[m22-endless-mode]]. The story win is raft -> sail off; save/persistence stays M25.

**Boarding is a player-side toggle, not a new world object:** `E` within 2.5 u of the built M20 raft boards/unboards the player (`onRaft`), `learn('sail')` + toasts. `E` with no raft is a no-op.

**Aboard, `frame()` moves the raft itself, not the player:** 4.0/6.0 u/s with yaw lerp, deck height WATER+0.7, the rig synced to the deck. The island clamp + ground-follow that pin an on-shore player (~220.5 u) are skipped while aboard, so the raft can actually reach open water.

**The win is a radius, not a scripted event:** rowing past `WIN_R = ISLAND_R + 60` (270 u, deliberately beyond max shark reach ~260 u) calls `winEscape()`. `won = true`, `onRaft = false`, and `started = false` freeze the whole simulation through the existing `started` gates while the renderer keeps drawing.

**State hygiene (the durable part):**
- The `#won` overlay (z-index 25, mirrors `#dead`) shows days ashore `dayOf()`, discoveries `journal.length`, animals seen (`JOURNAL_ANIMALS`) + "R - wash ashore again", and (since M22) the "E - stay on the island (endless)" row.
- A `won`-guard in keydown lets only `R -> location.reload` and (since M22) `E -> startEndless()` act; a `!won`-guard on the started-resume path means no stray key can un-freeze the sim.
- Respawn and the KeyR-shore path clear `onRaft`; `updateSharks` in-water check excludes `onRaft` (the raft is uncounterable).
- `contextHint` gains a `won` early-return, an E-board hint <= 3 u, and a WASD-row hint with u-to-go; title-card row + `#won` CSS added.

**Smoke (new M21 block in `smoke/run.mjs`):** no-raft `E` no-op, board/unboard toggle + sail learn, rowing past `WIN_R` via `pump(3)` -> won / started-frozen / overlay / journal line, snapshot/restore, registry still 10, `location.reload` stubbed. 0 `rng()`/`Math.random` in the new sections; zero world-gen / `PLANT_TYPES` / animal-registry changes. SMOKE_OK (execution proven via a temporary marker, then reverted).

**Verification note:** headless screenshots are not runnable on this host (no Chrome ‒ M17/M18/M20 precedent); render is exercised via the stub DOM.


## Timeline

- time: 2026-10-18T00:41:49
  kind: decision
  summary: "Created this page: M21 ‒ Escape/win sequence: board the M20 raft (E), row out with WASD, rowing past WIN_R freezes the sim into the #won overlay"
  source: "PLAN.md M21 row; commit d312b0c"
  affects: [m21-escape-win]

- time: 2026-10-18T00:42:04
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m21-escape-win]

- time: 2026-10-18T01:09:08
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m21-escape-win]
