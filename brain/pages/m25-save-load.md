---
id: m25-save-load
title: "M25 ‒ Save/load + respawn/recovery: one v1 localStorage run-snapshot, progress-only (island stays deterministic), weather-stream resync on load, M22 death contract untouched"
category: decision
status: active
tags: [m25, save, load, localstorage, persistence]
created: "2026-10-18T02:39:15"
updated: "2026-10-18T02:39:39"
---

<!-- compiled_truth -->
M25 = save/load + respawn/recovery (PLAN.md M25: "Progress survives reload and failure states recover correctly"). Shipped `361e93c`. One self-contained section in `index.html` + an in-memory `localStorage` stub in `smoke/run.mjs`. **Zero gameplay/determinism impact**: no world-gen/`PLANT_TYPES`/WEATHER-table/animal-registry changes, and the death mechanics are untouched per the [[m22-endless-mode]] contract (respawn keeps its pre-M25 behavior, asserted as such).

**One snapshot, progress only.** A single JSON `v1` run-snapshot at the localStorage key `vibesurvivors.save.v1`. Because the island layout is deterministic from `SEED` (the same v1 obligation ServerBase multiplayer imposes, see [[multiplayer-deferred-serverbase]]), only progress state is snapshotted ‒ JSON-serializable fields only; THREE nodes are rebuilt, never stored. The snapshot covers: clock as raw `p0`+`gameMin` (`dayOf`/`endlessDay`/`stormBoost` stay derived), player pos/rot + stats + `INV` + spear + endless markers + `poisonDrain`/`infectedWound`/`lastMeal`/`firstNight`, journal/learned, sparse `mapVisited` indices + `mapKnown` (M18/M19 player-side state), camp `{x,z,g,rot}` + the 5 structure flags (the raft is stored as its live `[x,z]` because it can be rowed far from camp), fires as data-only (`x,g,z,phase,cooking` ‒ the pre-existing random fire phase is overwritten by the saved one), ground items as data-only (meshes rebuilt), per-palm coco counts, gull-nest egg count, non-default plant spots (sparse list), and the full weather segment list. **Deliberately NOT saved: animals** ‒ they respawn fresh from their seed streams; they are not progress.

**When it writes.** At every camp event (`makeCamp` via `H` + the 5 structure builders `J`/`K`/`L`/`N`/`O`), at `startEndless`, and exactly once per dusk/dawn phase crossing detected in `frame()` (a `DAY_FRAC` compare before/after the `gameMin` tick, only while `started && !dead`). Saves are suppressed while dead/won, and `winEscape()` clears the save ‒ a finished run reloads as a fresh island.

**On load (first key on the title card, or `?start=1`).** Rebuilds the camp via `makeCamp` + the existing builders at `campOffsets` with the saved rot; restores stats/pos/plants with `plantClock := gameMin` so plants never fast-forward; re-derives every storm segment's events on its private `mulberry32(SEED+273+i*7)` stream in the fixed draw order (`done=false`); and resyncs the shared weather stream by reseeding `mulberry32(SEED+271)` and replaying its exact draw count (initial seg = 1 draw; each extended seg = pick + duration = 2 draws). This replay is the only sanctioned `rng` in the new code.

**Robustness.** All localStorage access is `try/catch` + `typeof` guarded (private mode never throws at module init). The title card rewords to "CONTINUE ‒ DAY N (N ‒ NEW ISLAND)" when a valid save exists: the first key continues (swallowed so it doesn't double-fire an action), `N` clears the save for a fresh island. `readSave` validates `v===1` plus finite/range checks (clock, 0‒100 stats, integral `INV`, palm counts length == world palms 0‒2, plant states/indices, map bounds, camp/structures shape, fire/item fields, egg count, weather-seg states/monotonicity); a malformed or range-bad save is **deleted, never loaded** ‒ the player starts a fresh island.

**Durable format contract:** the save is versioned (`v: 1`) and validation is version-strict (`v !== 1` is rejected) ‒ a future incompatible snapshot must bump `v` and extend `validateSave`, not loosen it. Smoke: in-memory localStorage stub + an M25 block (fresh boot offers nothing; camp+shelter builds write a well-shaped save; the dusk crossing writes exactly one save while phase-stable frames don't; a full scramble-then-load round-trip restores every field incl. `plantClock === gameMin` and camp+shelter rebuild; the post-load weather stream matches a fresh reference stream bit-for-bit ‒ the desync check; corrupt/range-bad saves are discarded AND deleted; dead -> respawn recovers, save no-op while dead). SMOKE_OK. Verification note: headless screenshots not runnable on this host (no Chrome ‒ M17+ precedent); render exercised via the stub DOM.


## Timeline

- time: 2026-10-18T02:39:15
  kind: decision
  summary: "Created this page: M25 ‒ Save/load + respawn/recovery: one v1 localStorage run-snapshot, progress-only (island stays deterministic), weather-stream resync on load, M22 death contract untouched"
  source: "commit 361e93c (PLAN.md M25)"
  affects: [m25-save-load]

- time: 2026-10-18T02:39:39
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m25-save-load]
