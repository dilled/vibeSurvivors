---
id: m13-land-wildlife
title: "M13 ‒ Land wildlife: monkeys, large lizards, snakes (registry 4->7)"
category: decision
status: active
tags: [animals, m13, registry, monkeys, lizards, snakes, determinism]
created: "2026-10-17T21:20:01"
updated: "2026-10-17T22:00:48"
---

<!-- compiled_truth -->
## What shipped (M13 ‒ three land species via the M12 registry)

M13 adds **monkeys, large lizards, and snakes** through the [[m12-animal-framework]] registry exactly as designed ‒ descriptor + spawn block + mesh builder + `step` hook, no bespoke world wiring. The registry grows **4 -> 7**; all three are `'late'` phase and register **after the gulls** (frame order: tigers, gulls, monkeys, lizards, snakes). `frame()` is untouched. PLAN.md M13 gate "Land wildlife has distinct behaviours" met; `?` smoke has an M13 block.

## Species behaviour contracts

**Monkeys** (5, jungle edge band height 3..7, active `dayFactor >= 0.25`, climb to the home perch at night):
- **Steal**: takes exactly **one** carried meat item, fixed priority `crabCooked > fishCooked > crab > fishRaw`, per-monkey 45 s cooldown, taught via learn/toast.
- **Shriek tell**: a live tiger within the monkey's home freezes it in a 4 s shriek ("a tiger is near") ‒ this ships the design contract's "monkeys shriek ⇒ tiger near" alarm tell from [[animal-ecosystem-design]].
- **Coconut bait**: a carried coconut makes a monkey circle the player (bait to them, not the reverse).
- Startle 3 s from `panicWildlife`.

**Large lizards** (4, beach/jungle edge band 0.6..7, same activity window):
- **Tide-line crab hunter**: bursts at 7.5 (faster than a walking player's 5.5) for up to 3 s to seize a crab within 6 u.
- **Dusk camp raid**: in the `dayFactor 0.25..0.5` dusk window it creeps into an **unfortified** camp and snipes one meat item (same priority order, 40 s cooldown); **fence AND fire** (`camp.structures.fence && campIsLit()`) keep it permanently out of the 8 u camp perimeter.
- Loses its nerve under 3 u of the player and flees.

**Snakes** (6, deep jungle/cliffs band 7..20, day+dusk only, mostly-still slither line):
- **Reactive ambush only** ‒ never proactive: strikes only if stepped on (< 1.1 u) or cornered (< 1.5 u while its escape step is terrain-vetoed), with a **0.8 s rear-up telegraph** before damage.
- **Deterministic even/odd variant split**: even indices are **venomous** (18 damage ‒ health, not death; burning wound), odd are **harmless** (spits and slithers off).
- Freeze (coiled) 1.2 s in `panicWildlife`.

## Durable constraints

- Non-lethal to the player: a single snake strike never kills a full-health player; all three species are unkillable and keyless ‒ consistent with the "no lethal weapons" rule in [[animal-ecosystem-design]].
- **Determinism**: all three spawn blocks' `rng()` calls live strictly **after the gull block** so the pre-M13 rng stream stays intact (keep it that way); `frame()` is untouched; helpers reused are `homeWander`/`returnHome`/`applyMove` from M12.
- `panicWildlife` (the M11 all-species hook) is the cross-species event point now shared by all 7 species.
- `smoke/run.mjs` M13 block: registry slots 0–3 are the 4 reference species in `frame()` order, 4–6 are the M13 species; home-band invariants, the even/odd venom split, each steal/shriek/raid/crab-hunt/strike behaviour, and clean-state restore.


## Timeline

- time: 2026-10-17T21:20:01
  kind: decision
  summary: "Created this page: M13 ‒ Land wildlife: monkeys, large lizards, snakes (registry 4->7)"
  source: "commit e85ab49 (M13)"
  affects: [m13-land-wildlife]

- time: 2026-10-17T21:20:25
  kind: decision
  summary: "M13 ‒ three land species joined the M12 registry: monkeys (steal/shriek-tell/coconut-bait), lizards (crab hunt + dusk camp raid held by fence+fire), snakes (reactive ambush, 0.8s tell, venom/harmless split); registry 4->7"
  source: "commit e85ab49 (M13)"
  affects: [m13-land-wildlife]

- time: 2026-10-17T22:00:48
  kind: note
  summary: "M14 (commit 6665b91) grew the registry to 8 (pelican, slot 7, registered after the snakes) and panicWildlife now also makes the 3 pelicans flee for 3 s; the M13 slot-4-6 smoke assertions are untouched; see [[m14-beach-air-wildlife]]"
  source: "commit 6665b91 (M14)"
  affects: [m14-beach-air-wildlife]
