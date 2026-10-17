---
id: m6-night-1-encounter
title: "M6 ‒ Night-1 encounter: scripted first-night tiger beat, minimal gulls, night crabs, balance hold"
category: decision
status: active
tags: [tiger, gulls, crabs, night, encounter]
created: "2026-10-17T17:56:49"
updated: "2026-10-17T17:57:38"
---

<!-- compiled_truth -->
## What shipped (M6 ‒ night-1 encounter)

M6 is the "first scary night" gate from PLAN.md ‒ tiger + crabs + gulls + balancing, shipped in `4e30d98`. It layers a scripted tension beat and minimal daytime gulls onto the M5 tiger FSM without changing M5's rules; all numbers are first-cut balance knobs (balance hold, see below).

- **Scripted first-night beat**: on the player's first dusk (`dayFactor < 0.5` after start), the tiger whose home is nearest the camp is teleported deterministically (no rng) to a point ~13 m around the player (first dry-land angle of a 16-slot circle, offset by the tiger's `phase`). If no lit camp/torch or fire is nearby it stalks in ‒ that is the scare. Lighting a fire (`actFire`) drives it off via the M5 fire-driven retreat. One-shot (`firstNight` flag); journal learning `night` ("the island turns after dark ‒ fire and torchlight are your only wall against the tiger") + toast "it is night ‒ the jungle stirs".
- **Minimal gulls (M14 placeholder)**: exactly 5, deterministic, homes in the beach/grass band (height 0.3‒6, >=15 m from spawn, >=15 m apart). Non-lethal contract honoured: no keys, cannot be killed; the counters are timing and knowledge.
  - Day: deterministic sin/cos hover-wander around home (no per-frame rng).
  - Steal: a gull within 12 m takes exactly one carried food item, fixed priority `crabCooked > fishCooked > crab > fishRaw > coconut`, 45 s per-gull cooldown, journal learning `gull`.
  - Dive-bomb: within 15 m, a 3 s screaming telegraph, then it rakes the head for ‒8 HP; one global 60 s dive cooldown (only one gull dives at a time).
  - **Water scare (M15 shark foreshadow)**: while the player is in water (height < 0.5) the flock screams and drifts inland for 8 s; one-time journal learning `gullscare` ("the gulls scream and pull inland ‒ something is in the water"). The shark itself ships in M15.
  - Night: gulls fly home and perch still ‒ mirrors the M5 tiger `hide` pattern.
  - Superseded by the M14 full gull system (territory, alarm bus, ecosystem integration per [[animal-ecosystem-design]]), not extended in M6.
- **Night crabs**: 3 extra crabs around the spawn beach (world total 9), spawned in the height band 0.35‒1.5, >=2.5 m from existing crabs. Crabs move at 1.6x speed after dark (`dayFactor < 0.5`) so the night forage loop works.
- **New context hint**: "night is coming ‒ light a fire (G) or your camp torch (N)" when dusk approaches with no lit camp and no fire within 10 m.

## rng-ordering invariant (extended)

The tiger spawn block (M5) was the last world-gen `rng()` consumer. M6's extra-crab and gull spawn `rng()` calls live strictly AFTER the tiger block, and the gull block is now the last world-gen `rng()` consumer. Any future world-gen rng consumer must append after the gull block to preserve the deterministic world seed ‒ the M20+ multiplayer obligation (see [[m5-tiger]], [[multiplayer-deferred-serverbase]]).

## Balance hold

All M6 numbers (beat radius 13 m, gull population 5, steal radius/cooldown 12 m/45 s, dive damage/cooldown 8/60 s, night crab speed 1.6x) are first-cut balance knobs against M6's PLAN.md gate: "First scary night; if not tense/fun, stop and fix before continuing." No new mechanics beyond M5 were added.

## Alternatives considered

- Randomized first-night tiger placement: rejected ‒ deterministic (rng-free) placement makes the beat guaranteed, legible, and smoke-testable, and keeps world-gen rng ordering clean.
- Killable gulls / spear counter: rejected ‒ the no-lethal rule in [[animal-ecosystem-design]] holds; M6 gulls are a teachable nuisance superseded by M14 rather than extended here.
- Full M14 gull system now: rejected ‒ M6 keeps gulls minimal so the milestone stays inside the night-1 tension gate.

## Blast radius

- No new input keys. New module state in `index.html`: `firstNight`, `firstNightBeat()`, `gulls`, `buildGullMesh`, `updateGulls`, `gullDiveCd`, `gullWaterT`, the `GULL_*` tuning constants, and the refactored `buildCrabGroup` (shared by M1 beach crabs and the M6 spawn crabs). `updateGulls` runs in `frame()` right after `updateTigers`.
- World-gen rng consumption extended ‒ see the rng-ordering invariant above.
- M5 tiger FSM, M1 crabs, and the fire/torch systems are unchanged; M6 only reads them (`dayFactor`, `nearestFire`, `campIsLit`, `learn`, `toast`).

## Smoke coverage (`smoke/run.mjs` ⇒ `SMOKE_OK`)

5 gulls in the beach/grass band; 9 crabs (6 beach + 3 M6). Day: every gull airborne. Steal takes exactly one carried item and sets the `gull` learning. A telegraphed dive costs exactly 8 HP. Water scare sets the inland drift + one-time `gullscare` learning. Night: gulls perch still at home; crabs travel >1.4x their day path length. First-night beat (suppressed with `firstNight = true`, re-armed in its dedicated block): the camp-nearest tiger is placed within 15 m of the player, closes in or strikes, then `actFire()` forces `flee` and the tiger retreats from the fire.


## Timeline

- time: 2026-10-17T17:56:49
  kind: decision
  summary: "Created this page: M6 ‒ Night-1 encounter: scripted first-night tiger beat, minimal gulls, night crabs, balance hold"
  source: "M6 implementation session; shipped 4e30d98"
  affects: [m6-night-1-encounter]

- time: 2026-10-17T17:57:20
  kind: decision
  summary: "M6 shipped: scripted first-night tiger beat (~13 m, fire/torch drives it off), minimal gulls (M14 placeholder: one-food steal, telegraphed dive-bomb, water-shark scare tell), 3 extra night crabs, balance hold"
  source: "M6 implementation session; shipped 4e30d98"
  affects: [m6-night-1-encounter]

- time: 2026-10-17T17:57:38
  kind: evidence
  summary: "M6 shipped in 4e30d98: firstNightBeat + minimal gull system + 3 night crabs in index.html, M6 smoke block in smoke/run.mjs; PLAN.md M6 marked done"
  source: git 4e30d9876f6459c5fa59e5ff6e960035574d4686
  affects: [m6-night-1-encounter]
