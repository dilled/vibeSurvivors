---
id: m26-single-player-v1
title: "M26 ‒ Single-player v1 integration/polish: end-to-end playthrough smoke gate, three integration seams fixed (title-card N fall-through, camp-aware story death overlay, title-card M row), zero new systems, story determinism preserved"
category: decision
status: active
tags: [m26, v1, integration, smoke]
created: "2026-10-18T03:22:22"
updated: "2026-10-18T03:22:47"
---

<!-- compiled_truth -->
M26 = single-player v1 integration/polish (PLAN.md M26: "Complete single-player game passes end-to-end playthrough"). Shipped `58f0668`. This closes the single-player phase (M0–M26). No new systems/features ‒ render/UX/flow only, zero gameplay/determinism impact; the optional wreck-mesh stretch was skipped (render-only polish).

**Smoke gate (new M26 block at the end of `smoke/run.mjs`):** a scripted full-story playthrough driven end-to-end (house snapshot/restore pattern, full-state restore incl. crown instances, plant emitPlant, weather seg truncation + the M25 loadGame weatherRng replay resync), with cross-system asserts across the whole story: wash-up + drink at the waterline (h<0.25 gate), B spear + X strike in the shallows, G fire + E cook + F eat cooked fish, palm shake drops a coconut (falls to ground) + pickup + C eat, E harvest a ready forageable (VEG_EAT_ORDER-filtered spot; ripen-in-place fallback for the day-1 seed) + Q eat, camp + all five structures (J/K/L/N) + `campIsLit()`, Z sleep at the bed (dawn clock jump, wet cleared, +30 rest, wakes at the bed), forced storm soak (wet>15, `learn('wet')`, shelter dries to 0), spent-palm wood + `learn('wood')`, U rope, O raft at camp (exact 8 wood + 4 rope), E board + row past WIN_R + `pump(3)` ‒> won/frozen/clearSave/win overlay, `startEndless` (camp restart, `learn('endless')`, day-1 endless boosts 0.12 / 0.6*1.04), endless death (days-survived overlay, loot cleared, wakes at camp), story death with a camp (camp-aware overlay), full save/load round-trip of the finished camp (stats/inv/pos/clock/journal/camp + all 5 structures incl. raft/weather seg identity), and the title-card keydown paths via a captured `window` keydown listener (the stub now records the game's handler as `__keydownCb`). All pre-existing M0–M25 blocks still pass; SMOKE_OK (block execution proven via a temporary M26-BLOCK-RAN marker, then reverted).

**Three integration seams fixed (all in `index.html`):**
1. Title-card N fall-through: `if (e.code === 'KeyN') clearSave();` had no return, so choosing a fresh island on the title card fell through into the action keys and fired a spurious `actTorch` ("establish a camp first" toast; with a live camp it would have built a torch and re-saved the save N just cleared). Now `{ clearSave(); return; }`. This is what actually makes the [[m25-save-load]] title-card contract (first key = CONTINUE, swallowed; N = fresh island) hold; the first-key `loadGame()` swallow and the `?start=1` boot path are untouched.
2. Story death overlay is camp-aware: `checkDeath()` rewrites the dead overlay to "wake at your camp (you lose what you were carrying)" when a camp exists, matching `respawn()`; the static DOM text stays the no-camp default, and the endless branch keeps its days-survived text per the [[m22-endless-mode]] contract.
3. Title-card key list gained the missing M (chew a healing herb) row.

**Determinism:** 0 new `rng()`/`Math.random` in any new line (the only mulberry32 in the smoke block is the mandated M25 weatherRng replay resync in the restore); WEATHER tables/`PLANT_TYPES`/animal registry/seed constants untouched, so story mode stays bit-identical (M10/M11 replay asserts still pass inside SMOKE_OK); the M22 death/respawn contract and M25 save semantics are otherwise unchanged.

**Verification note:** headless screenshots are not runnable on this host (no Chrome ‒ M17–M25 precedent); render is exercised via the stub DOM. Remaining best-effort human/browser gate: title card shows the M row, N with a save starts a fresh island with no stray toast, and the story death overlay matches the camp respawn.


## Timeline

- time: 2026-10-18T03:22:22
  kind: decision
  summary: "Created this page: M26 ‒ Single-player v1 integration/polish: end-to-end playthrough smoke gate, three integration seams fixed (title-card N fall-through, camp-aware story death overlay, title-card M row), zero new systems, story determinism preserved"
  source: "commit 58f0668 (PLAN.md M26)"
  affects: [m26-single-player-v1]

- time: 2026-10-18T03:22:47
  kind: decision
  summary: "Created compiled truth: M26 shipped 58f0668 ‒ end-to-end playthrough smoke gate + three integration seams, no new systems, story determinism preserved"
  source: commit 58f0668
  affects: [m26-single-player-v1]
