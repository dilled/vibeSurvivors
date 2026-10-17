---
id: m9-medicinal-plants
title: "M9 ‒ Medicinal plants + harvesting/regrowth: healing herb (M use), tiger-strike infection bleed, per-spot regrow wear"
category: decision
status: active
tags: [medicinal, herb, infection, regrowth, wear, plants, tiger]
created: "2026-10-17T19:10:42"
updated: "2026-10-17T19:11:18"
---

<!-- compiled_truth -->
## What shipped (M9 ‒ medicinal plants + harvesting/regrowth)

M9 is the "medicinal plants + harvesting/regrowth" milestone from PLAN.md, shipped in `742bfa1`. It extends [[m7-vegetation-framework]] / [[m8-forage-foods]] exactly as M7 predicted: one new `PLANT_TYPES` data row, no new world logic, and the global world-gen rng stays untouched (per-species private stream `mulberry32(SEED + 1193)`).

- **Healing herb species (medicine, not food)**: pale-green tuft, ~18 plants, h 1.0‒9.0, minDist 5, 2 harvest charges, 1.5-day regrow. The key classification decision: the herb is **medicine** and is deliberately *not* part of `VEG_EAT_ORDER` ‒ `Q` never eats it. It has its own dedicated key `M` (`useHerb()`): chews one herb to (a) close a festering tiger wound and (b) restore +25 health.
- **Tiger-strike infection (persistent consequence mechanic)**: the [[m5-tiger]] contact strike now does more than its flat ‒30 health + loot drop ‒ it also sets `infectedWound`, a **persistent real-second bleed (0.1 hp/s, ~17 real minutes from full health)** that never expires on its own and is cured only by chewing a healing herb (`M`) (or dying/respawning). Natural health regen (the 0.35 hp/s when thirst+hunger > 15) is suppressed while infected. The rate is tuned as *pressure, not death spiral*. This turns the tiger strike from a one-shot damage event into a persistent world-state consequence the player must treat.
- **Per-spot regrowth wear (harvest pressure loop)**: each full depletion (charges 0 ⇢ regrown) permanently adds `+0.5` wear to that *individual* plant, capped at `3x` its regrow time; never-depleted plants stay at wear 1. Over-harvesting a spot makes it slowly worse. This is state-only and deterministic ‒ it never touches the spawn rng, preserving the M7 private-stream invariant and the deterministic world seed (see [[multiplayer-deferred-serverbase]]).
- **Loot/respawn integration**: the tiger strike drops carried herbs too, and `respawn()` clears the herb inventory and cures the wound; festering gets a context hint (with herb count) and a HUD slot (❀/herb). A `learn('infection')` journal entry teaches the cure on first strike; `herb` / `herb-cure` learn entries on harvest/cure.

## Alternatives considered

- Making the herb edible (Q order / food stats): rejected ‒ medicine, not food; a dedicated `M` key keeps its purpose unambiguous and avoids the risk of the Q eat-order eating the only wound cure.
- Self-expiring infection (like the M8 poison drain): rejected ‒ a persistent, cure-gated bleed is the intended tiger-strike consequence; only the low rate (0.1 hp/s) keeps it pressure instead of a death spiral.
- Global/regen-based wear or rng-based wear: rejected ‒ per-plant state-only wear keeps the mechanic deterministic and decoupled from the spawn streams.

## Blast radius

- `index.html`: 1 new `PLANT_TYPES` row (herb), `PLANT_WEAR_STEP`/`PLANT_WEAR_MAX` + wear handling in `updatePlants` (per-plant `p.wear`), `infectedWound` state + `INFECT_RATE` bleed tick in `frame()`, regen suppression while infected, `useHerb()` + `M` keydown, `herb` `INV` key cleared in the M5 strike branch (plus `infectedWound = true` + learn/toast there) and in `respawn()`, context hint, HUD line.
- M7/M8 plant mechanics unchanged (fiber keeps 0-based slots; per-kind instanced-mesh allocation from M8 already covers the new tuft). No world-gen rng changes.

## Smoke coverage (`smoke/run.mjs` ⇢ `SMOKE_OK`)

Herb count/height band/minDist and tuft-mesh count after M9; first-spawn determinism from the private stream (SEED + 1193); uncontested herb harvest (+1 inv, charge down, learn entry); M5 strike drops herbs and sets the infection (+ `infection` learn entry); infection bleeds in real seconds, the herb cures it and restores exactly +25 hp, and a cured player neither bleeds nor regens; per-spot wear rises 1 ⇢ 1.5 ⇢ 2.0 across depletions while never-depleted herbs keep wear 1; a 5-game-day jump regrows a worn herb; respawn drops the herb and clears the wound; the M7 regrow fast-forward test window widened to 2.5 days to cover the 1.5x worn regrow.


## Timeline

- time: 2026-10-17T19:10:42
  kind: decision
  summary: "Created this page: M9 ‒ Medicinal plants + harvesting/regrowth: healing herb (M use), tiger-strike infection bleed, per-spot regrow wear"
  source: "M9 implementation session; shipped 742bfa1"
  affects: [m9-medicinal-plants]

- time: 2026-10-17T19:11:10
  kind: decision
  summary: "M9 shipped: medicinal herb species (M chew, never food), tiger-strike persistent infection bleed cured only by herb, per-spot deterministic regrow wear; M7/M8 data-row pattern extended, no world-gen rng change"
  source: "M9 implementation session; shipped 742bfa1"
  affects: [m9-medicinal-plants]

- time: 2026-10-17T19:11:18
  kind: evidence
  summary: "M9 shipped in 742bfa1: herb PLANT_TYPES row + private stream spawn, M/useHerb (+25 hp, closes infection), infectedWound 0.1 hp/s persistent bleed (regen suppressed), per-spot regrow wear +0.5/cap 3 in updatePlants, strike/respawn integration, M9 smoke block; PLAN.md M9 marked done"
  source: git 742bfa17275a163ee74918815254428358961925
  affects: [m9-medicinal-plants]
