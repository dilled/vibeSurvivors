---
id: m5-tiger
title: "M5 — First tiger: spawn, patrol/stalk/chase FSM, loot-dropping strike, fire-driven retreat"
category: decision
status: active
tags: [tiger, night, predator, threat]
created: "2026-10-17T17:12:47"
updated: "2026-10-17T19:11:18"
---

<!-- compiled_truth -->
## What shipped (M5 — first tiger)

- **Population & spawn**: exactly 3 tigers, deterministic. Homes in the jungle band (terrain height 7‒20), each ⁓60 m from the player spawn and from every other tiger (rejection sampling, 4000 tries). **rng-ordering invariant**: the tiger spawn `rng()` calls live strictly after the crabs block, which was the last `rng()` consumer of world gen (M1). Any future world-gen consumer must append after the tiger block to preserve the deterministic seed (the M20+ multiplayer obligation).
- **Activity window**: tigers are night creatures — active at dusk/night/dawn (`dayFactor < 0.5`); by day they return to their territory home and `hide`.
- **FSM (hide / patrol / stalk / chase / flee)**:
  - patrol: deterministic sin/cos wander around the territory home, pulled back if ⁓20 m from home (speed 2).
  - within 14 m of the player: stalk (5); stalk ⇢ chase on player sprint (Shift, within 8 m) or within 3.5 m (7); stalk falls back to patrol beyond 18 m; chase ends beyond 22 m.
  - fleeing (6) is **sticky**: it ends only past the 15 m margin so a tiger cannot hover on the fire ring while the player stands by the fire.
- **Strike**: contact within 1.5 m, 5 s cooldown: ‒30 health, **all carried loot is dropped** (coconut / raw+cooked fish / raw+cooked crab zeroed), journal learning `tiger`, toast, death check. Injuries come with a cost, not a kill switch.
- **Fire-driven retreat**: `nearestFire()` = nearest lit `fires` entry **or the standing camp torch**; within 10 m it forces `flee`, taking priority over stalk/chase. The M3 torch thus counts as a tiger counter for free.
- **Non-lethal contract honoured**: tigers never die, cannot be killed, and cannot be provoked into death; counters are fire, torchlight, sprint, and distance — per [[animal-ecosystem-design]].
- **Terrain**: movement blocked below height 0.5 — tigers stop at the shoreline, never enter water.
- **Surfacing**: context hint overrides — "a tiger is closing ‒ SPRINT or stand in a lit fire (G)" when a stalking/chasing tiger is within 12 m; "eyes in the dark" night hint within 20 m of any tiger.

## Alternatives considered

- Persistent hunt state (remembers the player after the chase window closes): rejected — a fresh 14 m stalk radius each frame keeps the threat legible and the smoke test deterministic.
- Making the fire check consider only placed `fires`: rejected — including the camp torch makes the M2/M3 camp investment pay off in the M5 threat loop (a lit camp is a safe night base).
- Damage-only strike (no loot drop): rejected — dropping everything is the non-lethal equivalent of a lethal hit and creates the M6 "scary first night" tension without killing the player.

## Rationale

M5 is the first concrete entry of the animal ecosystem: it proves the read-and-counter loop (see the tell ‒ eyes, then stalk, then sprint-or-fire) before M6 layers crabs/gulls/balancing on top. All numbers (3 tigers, radii, speeds, damage, cooldown) are first-cut balance knobs for M6's "if not tense, stop and fix" gate.

## Blast radius

- No new input keys; reuses M1 `fires` + `actFire`, M3 camp torch, M0 `dayFactor` / `runT` / `heightAt` / `learn` / `toast`.
- New module state: `tigers`, `nearestFire`, `nearFire`, `buildTigerMesh`, `updateTigers` (runs in `frame()` right after `updateSky` so `dayFactor` is fresh), plus the `TIG_*` tuning constants.
- World-gen rng consumption extended — see the spawn rng-ordering invariant above.

## Smoke coverage (`smoke/run.mjs` → `SMOKE_OK`)

3 tigers in the jungle band with ⁓60 m pairwise and ⁓55 m spawn separation; day tigers hide still at home; night tigers are active (patrol or flee) and moving; approaching a fire-free tiger makes it stalk/chase and close the distance; a strike lands below 80 health, zeroes carried loot, and sets the `tiger` journal learning; `actFire()` where it strikes forces `flee` and clears 10 m; at day it returns to its home and hides.


## Timeline

- time: 2026-10-17T17:12:47
  kind: decision
  summary: "Created this page: M5 — First tiger: spawn, patrol/stalk/chase FSM, loot-dropping strike, fire-driven retreat"
  source: "M5 implementation session; shipped 98569cc"
  affects: [m5-tiger]

- time: 2026-10-17T17:13:23
  kind: decision
  summary: "M5 shipped: 3 deterministic tigers, hide/patrol/stalk/chase/flee FSM, contact strike drops all loot, any lit fire or camp torch drives tigers off"
  source: "M5 implementation session; shipped 98569cc"
  affects: [m5-tiger]

- time: 2026-10-17T17:13:23
  kind: evidence
  summary: "M5 shipped in 98569cc: tiger FSM block + updateTigers in index.html, threat context hints, smoke/run.mjs M5 block; PLAN.md M5 marked done"
  source: git 98569cc13c8d4e751b233962c6808feb5db5287d
  affects: [m5-tiger]

- time: 2026-10-17T19:11:18
  kind: note
  summary: "M9 cross-cut: the tiger contact strike now also sets infectedWound (persistent 0.1 hp/s real-second bleed, cured only by the M9 healing herb via M) in addition to the original -30 health + loot drop; strike also drops carried herbs"
  source: "git 742bfa1; see m9-medicinal-plants"
  affects: [m5-tiger, m9-medicinal-plants]
