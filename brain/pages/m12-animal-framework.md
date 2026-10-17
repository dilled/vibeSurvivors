---
id: m12-animal-framework
title: "M12 ‒ Animal framework: species registry + shared behaviour helpers + early/late frame phases"
category: decision
status: active
tags: [animals, framework, registry, determinism, architecture]
created: "2026-10-17T20:43:56"
updated: "2026-10-17T22:00:48"
---

<!-- compiled_truth -->
## What shipped (M12 ‒ animal framework + shared state/behaviour foundations)

M12 lands the shared animal framework that M13+ species build on, satisfying PLAN.md's gate "New animal species can be added without bespoke world logic". No gameplay behaviour changed: the four existing species keep their verbatim pre-M12 behaviour, now expressed through the framework.

## The framework contract (how new species join)

A species is a **descriptor + a per-species `step` hook**, registered into the global `animals[]` registry via `registerAnimal(species)`. Descriptor fields: `id`, `label`, `pop` (bound to the canonical species array), `band` (home band), `count`, `active` (activity-window predicate), `speed`, `homeR` (home-pull radius), `terrainOK` (terrain veto rule), `threat`/`tells` (notes), `phase` (`'early'` or `'late'`). **M13+ species follow exactly this shape: descriptor + spawn block + mesh builder + step hook, no bespoke world wiring.**

Shared helpers (all deterministic, no per-frame rng):
- `homeWander(a, cfg)` ‒ deterministic sin/cos wander around the home band (the tiger/school/gull pattern); pulls home past `homeR`, holds below `minStep` (`still` speed, defaults to `speed`).
- `returnHome(a, speed)` ‒ fly/patrol straight home (tiger hide, gull night perch).
- `faceHome(a, r)` ‒ steer toward home only past radius (crab forage loop).
- `applyMove(a, dir, speed, dt, terrainOK)` ‒ integrate along `dir` (`atan2(dx, dz)`, three.js forward (sin, cos)); the `terrainOK` rule can veto the step (shoreline stops).
- `panicWildlife(x, z)` ‒ the **all-species panic hook** (M11 lightning effects, unchanged): every tiger flees the spot for 6 s, the gull flock goes quiet for 5 s, crabs within 25 u scuttle for 3 s. This is the first all-species hook and the model for cross-species events (the [[animal-ecosystem-design]] alarm bus builds on this pattern).

## Frame ordering (determinism contract)

`frame()` drives the registry via `updateAnimals(dt, phase)` in two phases, preserving the exact M0–M11 order:
- **`'early'` species (fish, crabs)** run **before** weather/sky, on the **previous frame's** `dayFactor`.
- **`'late'` species (tigers, then gulls)** run **after** `updateSky`, so `dayFactor` is fresh this frame.

## Reference species (the framework's example shapes)

The four pre-M12 species are registered as reference entries with unchanged behaviour: `fish` (early, schools, 5), `crab` (early, beach 0.35..1.5, 9), `tiger` (late, jungle 7..20, 3, night-active), `gull` (late, coast 0.3..6, 5, day-active and storm-quiet via `stormQuietGulls()`).

## Blast radius

- `index.html` only (plus `smoke/run.mjs`): crabs/tigers/gulls rewritten onto `faceHome`/`returnHome`/`homeWander`/`applyMove` with per-species `*_WANDER`/`TIG_WANDER` param objects; `stormQuietGulls()` extracted; `doLightning`'s inline panic block replaced by `panicWildlife`; `frame()`'s four direct species calls replaced by the two `updateAnimals` phases. No behaviour, rng-stream, or world-gen changes.
- `smoke/run.mjs`: M12 block ‒ all framework helpers exist; registry is exactly the 4 reference species in `frame()` order, bound to the canonical arrays with pre-M12 populations (5/9/3/5) and phases; `panicWildlife` reproduces the exact M11 lightning effects; `updateAnimals` drives both phase hooks (guarded tick, FSMs frozen); clean-state restore at the end.


## Timeline

- time: 2026-10-17T20:43:56
  kind: decision
  summary: "Created this page: M12 ‒ Animal framework: species registry + shared behaviour helpers + early/late frame phases"
  source: "commit c6ade32 (M12)"
  affects: [m12-animal-framework]

- time: 2026-10-17T20:44:19
  kind: decision
  summary: "Created page from M12 commit c6ade32: animal registry + shared behaviour foundation"
  source: "commit c6ade32 (M12)"
  affects: [m12-animal-framework]

- time: 2026-10-17T21:21:07
  kind: note
  summary: "M13 (commit e85ab49) registered monkeys, lizards, snakes via this registry (4 -> 7 species, all 'late', after the gulls); framework contract unchanged, frame() untouched; see [[m13-land-wildlife]]"
  source: "commit e85ab49 (M13)"
  affects: [m13-land-wildlife]

- time: 2026-10-17T22:00:48
  kind: note
  summary: "M14 (commit 6665b91) registered the pelican as registry slot 7 (7 -> 8 species, 'late', after the snakes) and grew crabs 9 -> 15; framework contract unchanged, frame() untouched; see [[m14-beach-air-wildlife]]"
  source: "commit 6665b91 (M14)"
  affects: [m14-beach-air-wildlife]
