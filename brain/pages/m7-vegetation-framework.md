---
id: m7-vegetation-framework
title: "M7 ‒ Vegetation framework: data-driven plant rows, per-species private-rng spawn, game-minute growth/state, E harvest"
category: decision
status: active
tags: [vegetation, plants, foraging, determinism, rng, framework]
created: "2026-10-17T18:22:04"
updated: "2026-10-17T18:22:23"
---

<!-- compiled_truth -->
## What shipped (M7 ‒ vegetation framework)

M7 is the "reusable plant system" from PLAN.md: plants exist as a data-driven framework, not one-off scenery. Shipped in `abfe70a`. Three species are live: **fiber** (harvestable, drops 1 fiber), **shrub** and **flower** (both `drop: null` decorative markers, not harvestable). M8 (edible + poisonous) and M9 (medicinal + harvesting/regrowth) build on this by **adding fields to the `PLANT_TYPES` rows, not by adding new world logic** ‒ the reusability is the whole point of the milestone.

- **Data-driven**: one `PLANT_TYPES` row per species ‒ `seedOffset`, height band (`hmin`/`hmax`), target `count`, `minDist`, `regrowDays`, harvest `charges`, render `kind`, `drop`, and a `learn` journal string. Rows: fiber (`seedOffset 101`, h 0.5~5.5, count 40, minDist 4, regrow 1d, 3 charges, drops `fiber`), shrub (`211`, h 7~14, count 30, minDist 5, regrow 2d, `drop: null`), flower (`317`, h 1.5~15, count 50, minDist 3, regrow 0.5d, `drop: null`). Targets are capped by rejection sampling; smoke asserts minimums (20/15/25).
- **Per-species private rng stream (the key determinism decision)**: each species spawns from its own `mulberry32(SEED + seedOffset)`; per-plant initial state (`(i+1)*7919 % 100`) and size (`0.75 + (i*37)%13 / 25`) are **index-derived, not rng**. Plants **never consume the global world-gen rng**, so M7 does *not* extend the M5/M6 global `rng()`-ordering chain, and adding or recounting one species can never shift another species' or the palm/tree/rock placement. This deliberately departs from the M1‒M6 "append to the global stream" pattern to keep the deterministic world seed stable (the M27+ ServerBase world-sync obligation ‒ see [[m5-tiger]], [[m6-night-1-encounter]], [[multiplayer-deferred-serverbase]]).
- **Game-minute-driven growth (no per-frame simulation)**: growth is bookkept off `gameMin` deltas (`updatePlants`), so the M4 sleep clock-jump and the `T`/number-key debug clock-skips fast-forward plants for free ‒ the same deterministic "single jump, no per-frame night sim" philosophy as [[m4-sleep-system]]. Large deltas are folded in a bounded loop (no per-frame loop).
- **State machine**: `growing` ⇢ `ready` (after `regrowDays`) ⇢ harvest drains `charges`; at 0 the plant is `depleted`, then a longer regrow returns it to `growing` and resets `charges`. Day-1 seed: ~45% start `ready` (index-derived) so foraging works on day 1.
- **Harvest interface**: `E` harvests the nearest `ready` plant with a `drop` (lowest priority, wired *after* the M1‒M6 branches in `actUse`). Fiber drops 1 to a new `fiber` inventory slot (🌾 in the HUD) and records a `learn` entry; `drop: null` species are not harvestable. Context hint "E ‒ harvest" within 1.5 m.
- **M10 weather hook reserved**: `plantGrowthMult()` (currently `1`) is the single multiplier M10 (weather/rain) will use to accelerate growth without touching the rest of the plant logic.

## Alternatives considered

- Append plants to the global world-gen rng stream (the M1‒M6 pattern): rejected ‒ it would make every future species add/recount shift existing species and the pre-M7 world; the private per-species streams decouple each species from the others and from the global chain.
- Per-frame growth simulation: rejected ‒ game-minute delta bookkeeping is deterministic and smoke-testable, and makes sleep/clock-skips free (mirrors the [[m4-sleep-system]] single-jump decision).
- Making shrub/flower harvestable now: rejected ‒ M7 ships the framework + one harvestable (fiber); the `drop: null` markers prove the data-driven model extends, and M8/M9 fill in edible/toxic/medicinal drops.

## Blast radius

- New module state in `index.html`: `PLANT_TYPES`, `plants`, `spawnSpecies`, `plantMesh` (per-species `InstancedMesh`, `DynamicDrawUsage`), `emitPlant`, `plantStateColor`, `updatePlants` (runs in `frame()` after `updateGulls`), `plantClock`, `plantGrowthMult`; a new `fiber` slot in `INV` + 🌾 HUD; an `E` harvest branch in `actUse` and a hint in `contextHint`.
- **Purely additive**: pre-M7 world untouched ‒ palms (~60), big trees (~60), rocks (~100), crabs (9), gulls (5), tigers (3), fish schools (5) all unchanged (smoke-asserted). Per the rendering budget in [[threejs-no-build-stack]] the plants use instanced meshes.
- No new input keys (reuses `E`); reuses `heightAt`, `mulberry32`, `learn`, `toast`, `gameMin`.

## Smoke coverage (`smoke/run.mjs` ⇒ `SMOKE_OK`)

Fiber/shrub/flower present in their height bands, minimum counts, and pairwise `minDist`; per-species instanced-mesh counts correct; the first fiber spawn reproduces exactly from its private stream; harvesting an uncontested ready tuft lands +1 fiber, decrements a charge, records the `learn` entry, and depletes at 0 charges (re-emitting its matrix); the "E ‒ harvest" context hint fires at a ready harvestable; a `drop: null` flower is not harvestable; a 3000-game-minute jump fast-forwards a `growing` tuft to `ready` and a `depleted` tuft to regrown with reset charges; and all pre-M7 populations are unchanged.


## Timeline

- time: 2026-10-17T18:22:04
  kind: decision
  summary: "Created this page: M7 ‒ Vegetation framework: data-driven plant rows, per-species private-rng spawn, game-minute growth/state, E harvest"
  source: "M7 implementation session; shipped abfe70a"
  affects: [m7-vegetation-framework]

- time: 2026-10-17T18:22:23
  kind: decision
  summary: "M7 shipped: reusable vegetation framework ‒ one PLANT_TYPES data row per species (M8/M9 extend the rows), per-species private mulberry32(SEED+offset) spawn that never consumes the global world-gen rng, game-minute-driven growth/state (sleep + clock-skips fast-forward for free), E harvest of ready drop-bearing plants, purely additive world"
  source: "M7 implementation session; shipped abfe70a"
  affects: [m7-vegetation-framework]

- time: 2026-10-17T18:22:23
  kind: evidence
  summary: "M7 shipped in abfe70a: PLANT_TYPES data rows + per-species private-rng spawn + game-minute growth/state + E fiber harvest in index.html, M7 smoke block in smoke/run.mjs, fiber slot + setColorAt/multiplyScalar stubs, three-stub; PLAN.md M7 marked done"
  source: git abfe70a78308e5d34f3b5c4240d1103e9c650554
  affects: [m7-vegetation-framework]
