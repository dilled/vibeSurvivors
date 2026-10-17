---
id: m8-forage-foods
title: "M8 ‒ Edible + poisonous foraging: 4 edibles, 3 lookalike poisons, Q risk/reward eating, vomit/drain, map-driven fire cook"
category: decision
status: active
tags: [foraging, plants, food, poison, cooking, determinism]
created: "2026-10-17T18:48:04"
updated: "2026-10-17T19:11:35"
---

<!-- compiled_truth -->
## What shipped (M8 ‒ edible + poisonous plants and vegetables)

M8 is the "Foraging requires identification and risk/reward choices" milestone from PLAN.md, shipped in `d1594ef`. It builds on [[m7-vegetation-framework]] exactly as M7 predicted: new `PLANT_TYPES` rows only, no new world logic.

- **4 forageable edibles**: sweet potato, wild berry, banana, yam ‒ each a data row with `food.raw`/`food.cooked` hunger values, a harvest `learn` journal string, and the same per-species private-rng spawn as M7. Raw yam is the odd one: tiny gain, immediate nausea vomit, and a "cook it over a fire" `know` entry on first raw eat.
- **3 lookalike poisons**: poisonberry, poisonfern, poisonyam. Each mimics its edible twin ‒ same render kind, same height band, similar scale, **only a color shift apart**. The color shift IS the identification mechanic: there is no name label on the plant.
- **Learned, not labeled (key identification decision)**: poison rows have an empty harvest `learn` string, so harvesting reveals nothing. The permanent "you now know ‒ the † is wrong" journal entry is written by the first *poisoned eat* (learn key `eat-<species>`). Knowledge of poisons comes from the consequence, not a tutorial.
- **`Q` eatGathered ‒ risk/reward ordering**: `VEG_EAT_ORDER` eats the first nonzero entry: cooked forage meals first, raw edibles next, **poisons dead last** so they are consumed only under real hunger pressure (the PLAN.md starvation risk/reward). No per-food keys; one key, priority order (keeps the input budget free).
- **Poison effects**: `vomit` (poisonberry/poisonfern) undoes the most recent real meal's gains via `lastMeal`, which every eat (including M1's C/F/V meals) now records; `drain` (poisonyam) is a **real-second** health bleed (0.25 hp/s for 90 s) ticked in `frame()` ‒ real seconds deliberately, like the M1 stat drain, not game-minutes.
- **Fire cooking is map-driven**: `COOKABLE`/`COOK_RESULT`/`COOK_NAME` tables replace the hardcoded fish/crab branches; the M1 priority is preserved (fishRaw > crab > sweetpotato > yam). Only these four cook.
- **Per-kind instanced-mesh slot allocation (rendering decision)**: plant instanced meshes were resized to cover their kind across **all** species of that kind; each species gets a contiguous base offset in species-iteration order and every plant stores an absolute `p.slot`. Two same-kind species never share a slot, and fiber keeps its M7 0-based slots, so M9 adds species by adding rows.
- **Loot-drop/respawn integration**: the M5 tiger strike and `respawn()` now also clear all nine new inventory keys; respawn additionally clears any active poison drain. HUD gained a second food line.
- **No new global world-gen rng consumer**: the 7 new species spawn from per-species private `mulberry32(SEED + seedOffset)` streams per M7, so the M6 rng-ordering invariant and the pre-M8 world are untouched (see [[m6-night-1-encounter]], [[m7-vegetation-framework]], [[multiplayer-deferred-serverbase]]).

## Alternatives considered

- Labeled poisons (a harvest-time "you now know" journal entry): rejected ‒ M8's PLAN.md intent is that foraging *requires identification*; learned-not-labeled is the mechanic.
- One key per foraged food: rejected ‒ single `Q` key with a fixed eat order; the order itself encodes the risk/reward.
- Game-minute-scaled poison duration: rejected ‒ the drain is a real-time bleed (mirrors M1 stat rates), and sleep would otherwise let the player sleep off a poison.

## Blast radius

- New module state in `index.html`: 7 `PLANT_TYPES` rows, 9 new `INV` keys, `VEG_EAT_ORDER`, `VEG_EAT_TOAST`, `lastMeal`, `poisonDrain`, `COOKABLE`/`COOK_RESULT`/`COOK_NAME`, `eatGathered()`, `vomit()`, `Q` keydown, poison-drain tick in `frame()`, per-kind slot allocation in the plant-mesh setup, 2nd HUD food line.
- M1 eat functions (C/F/V) only gained `lastMeal` bookkeeping; cook branch in `actUse` now table-driven with identical M1 behavior for fish/crab. M5 tiger strike and `respawn()` clear the new keys.
- No new input keys beyond `Q`; no world-gen rng changes; M7 plant framework mechanics untouched.

## Smoke coverage (`smoke/run.mjs` ⇢ `SMOKE_OK`)

Per-kind instanced-mesh sizes and unique slot allocation (fiber keeps M7 0-based slots); the 7 new species' counts, height bands, and `minDist` minimums; first-spawn determinism for one new species (poisonberry, private stream); harvesting each new species once (+1 inv, charge down, learn policy: edibles learn on harvest, poisons do not); Q prefers edibles in order and never eats a poison while an edible foraged item remains; raw yam's nausea vomit undoes the gain and writes the `know` entry; vomit loses the last real meal; poisonyam's real-second drain bleeds then expires; cooked sweetpotato/yam cook over a fire and beat raw in Q order; respawn drops the new keys and clears the drain.


## Timeline

- time: 2026-10-17T18:48:04
  kind: decision
  summary: "Created this page: M8 ‒ Edible + poisonous foraging: 4 edibles, 3 lookalike poisons, Q risk/reward eating, vomit/drain, map-driven fire cook"
  source: "M8 implementation session; shipped d1594ef"
  affects: [m8-forage-foods]

- time: 2026-10-17T18:48:37
  kind: decision
  summary: "M8 shipped: 4 forage edibles + 3 color-shift lookalike poisons (learned-not-labeled identification), Q eatGathered risk/reward order (poisons only under hunger pressure), vomit/drain poison effects, map-driven fire cook preserving M1 priority, per-kind plant instanced-mesh slot allocation, tiger-strike/respawn clear new keys"
  source: "M8 implementation session; shipped d1594ef"
  affects: [m8-forage-foods]

- time: 2026-10-17T18:48:42
  kind: evidence
  summary: "M8 shipped in d1594ef: 7 new PLANT_TYPES rows + 9 INV keys + Q/eatGathered/vomit/poisonDrain + table-driven cook + per-kind slot allocation + 2nd HUD food line in index.html, M8 smoke block in smoke/run.mjs; PLAN.md M8 marked done"
  source: git
  affects: [m8-forage-foods]

- time: 2026-10-17T19:11:35
  kind: note
  summary: "M9 cross-cut: the new herb inventory key is deliberately NOT in VEG_EAT_ORDER (medicine, not food) ‒ Q's risk/reward eat order is unchanged; herb use has its own M key"
  source: "git 742bfa1; see m9-medicinal-plants"
  affects: [m8-forage-foods, m9-medicinal-plants]
