---
slug: roadmap
title: Roadmap
role: milestones
updated: "2026-10-17T18:22:50"
---

# Roadmap

> From PLAN.md ¤11 (the full M0–M31 table there is the source of truth ‒ this page tracks status only). M0 shipped `fd620a0` ‒ island terrain, instanced vegetation, 2.5D camera, player rig, day/night. M1 shipped `f2f6e6d` ‒ survival stats, water, fire+cooking, coconuts, non-lethal spear + fish, crabs, death/respawn; see [[m1-survival-systems]]. M2 shipped ‒ camp spot selection (`H`, validity-checked), fixed-offset shelter/bed structures (`J`/`K`), camp-aware respawn; see [[m2-camp-system]]. M3 shipped ‒ camp fence (`L`, entrance facing the stored heading) + standing camp torch (`N`), `campIsLit()` (torch or fire within 8 m), HUD lit state; see [[m3-camp-fence-light]]. M4 shipped `9d96547` ‒ sleep (`Z` at a lit camp bed): clock jumps to dawn, resting stats at half rate, rest restores +30 health, wake on the bed; see [[m4-sleep-system]]. M5 shipped `98569cc` ‒ first tiger: 3 deterministic jungle-band spawns, hide/patrol/stalk/chase/flee FSM, contact strike (‒30 health + all loot dropped), any lit fire or camp torch drives tigers off; see [[m5-tiger]]. M6 shipped `4e30d98` ‒ night-1 encounter: scripted first-night tiger beat (~13 m close on first dusk, fire/torch drives it off), minimal gulls (M14 placeholder: one-food steal, telegraphed dive-bomb, water-shark scare tell), 3 extra night crabs; see [[m6-night-1-encounter]]. M7 shipped `abfe70a` ‒ vegetation framework: one `PLANT_TYPES` data row per species (M8/M9 extend the rows, not world logic), per-species private `mulberry32(SEED+offset)` spawn (global world-gen rng untouched), game-minute-driven growth/state (sleep + clock-skips fast-forward for free), `E` harvest of fiber; see [[m7-vegetation-framework]]. `node smoke/run.mjs` → `SMOKE_OK`.

| Phase | Status |
|---|---|
| M0 | ✅ `fd620a0` |
| M1 | ✅ `f2f6e6d` |
| M2 | ✅ camp spot + basic structures (shelter, bed) |
| M3 | ✅ fence + camp light/fire integration |
| M4 | ✅ `9d96547` ‒ sleep + night survival loop |
| M5 | ✅ `98569cc` ‒ first tiger (FSM threat loop, fire/torch counters, loot-dropping strike) |
| M6 | ✅ `4e30d98` ‒ night-1 encounter (scripted tiger beat, minimal gulls, night crabs, balance hold) |
| M7 | ✅ `abfe70a` ‒ vegetation framework (data-driven `PLANT_TYPES`, per-species private-rng spawn, game-minute growth/state, `E` harvest fiber) |
| M8+ | per PLAN.md ¤11 |

M20+ (raft, win, endless, audio, perf, save/load, v1, ServerBase multiplayer) ‒ "later" by design; the only v1 design obligation multiplayer imposes is the deterministic world seed.
