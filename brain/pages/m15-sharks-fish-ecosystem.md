---
id: m15-sharks-fish-ecosystem
title: "M15 ‒ Sharks + expanded fish ecosystem (registry 8->9, 'early' slot 8)"
category: decision
status: active
tags: [animals, m15, sharks, fish, registry, determinism]
created: "2026-10-17T22:25:45"
updated: "2026-10-17T22:26:06"
---

<!-- compiled_truth -->
## What shipped (M15 ‒ sharks + expanded fish ecosystem)

M15 ships **2 never-killable reef sharks** (registry slot 8, `'early'` water phase, the last descriptor) and the **expanded fish ecosystem** (slow school regeneration + dawn/dusk double-bite spear). The shark joins via the [[m12-animal-framework]] shape (descriptor + spawn block + mesh builder + `step` hook, no bespoke world wiring). The registry grows **8 -> 9**; it registers after the M14 pelican. `frame()` is untouched. PLAN.md's M15 gate "Water ecosystem creates risk and opportunity" is met; `smoke/run.mjs` has an M15 block.

## Shark behaviour contract (2, `'early'`, always active, reef band)

- **Spawns**: 2 deterministic reef spots in depth ‒2.2..‒0.6 (deeper than the fish band), 40 u+ from the player spawn, 30 u+ apart; the `terrainOK` rule (`heightAt <= -0.6`) keeps a shark in the deep water permanently.
- **FSM**: `patrol` (deterministic `homeWander` around home) ⇄ `curious` (player in the water, `heightAt < 0.5`, within 12 u; **18 u in a storm** ‒ storm-bold) plus a **blood draw**: an in-water player with a festering wound (`infectedWound`) is drawn from 30 u with its own taught tell. `flee` for 3 s from `panicWildlife` (the hook M15 extended with sharks).
- **Bite**: curious + in water + cooldown clear + inside attack radius (2.4 u) triggers a **0.7 s lunge telegraph** (visible lurch), then exactly `SHARK_DMG` (20) damage and an 8 s cooldown. **Aggressive dawn/dusk** (`0.25 <= dayFactor < 0.5`): attack radius +0.8 u and cooldown halved.
- **In-water-only attacks**: a shark within 2 u of a player on land can never hurt them (asserted by the M15 smoke block).
- **Gull-scream tell**: a curious shark circling an in-water player keeps `gullWaterT` alive ‒ this ships the "gulls scream ⇔ shark in the water" alarm tell from [[animal-ecosystem-design]] that was a placeholder since M6.
- **Never killable**: the spear does nothing to a shark; the counters are knowledge, timing, and getting out of the water (consistent with the no-lethal-weapons rule in [[animal-ecosystem-design]]).

## Expanded fish ecosystem

- **Slow regeneration**: each school grows back toward its original size at 1 fish / 120 s, capped at `min(n0, 12)` (the InstancedMesh holds 12 instances).
- **Dawn/dusk double bite**: at dawn/dusk (`0.25 <= dayFactor < 0.5`) the schools bunch and the spear takes **two** fish instead of one, with a taught tell; midday takes one.

## Durable constraints

- **Determinism**: every M15 spawn `rng()` call lives strictly **after the M14 pelican block** (the last pre-M15 global-rng consumer) so the pre-M15 rng stream stays intact (keep it that way). `frame()` is untouched.
- Smoke: the M12/M13/M14 registry expectations grow 8 -> 9; the M15 block verifies the slot-8 shark descriptor, spawn invariants, land immunity, the water bite (exactly 20 hp + taught tell), the 20 u blood draw, the gull-scream keep-alive, `panicWildlife` flee, 1/120 s regeneration capped at `min(n0, 12)`, and the dawn/dusk double bite.


## Timeline

- time: 2026-10-17T22:25:45
  kind: decision
  summary: "Created this page: M15 ‒ Sharks + expanded fish ecosystem (registry 8->9, 'early' slot 8)"
  source: "commit 567fd76 (M15)"
  affects: [m15-sharks-fish-ecosystem]

- time: 2026-10-17T22:26:06
  kind: decision
  summary: "Created page from M15 commit 567fd76: sharks + expanded fish ecosystem"
  source: "commit 567fd76 (M15)"
  affects: [m15-sharks-fish-ecosystem]
