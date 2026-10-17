---
slug: roadmap
title: Roadmap
role: milestones
updated: "2026-10-17T21:21:02"
---

# Roadmap

> From PLAN.md ¤11 (the full M0–M31 table there is the source of truth ‒ this page tracks status only). M0 shipped `fd620a0` ‒ island terrain, instanced vegetation, 2.5D camera, player rig, day/night. M1 shipped `f2f6e6d` ‒ survival stats, water, fire+cooking, coconuts, non-lethal spear + fish, crabs, death/respawn; see [[m1-survival-systems]]. M2 shipped ‒ camp spot selection (`H`, validity-checked), fixed-offset shelter/bed structures (`J`/`K`), camp-aware respawn; see [[m2-camp-system]]. M3 shipped ‒ camp fence (`L`, entrance facing the stored heading) + standing camp torch (`N`), `campIsLit()` (torch or fire within 8 m), HUD lit state; see [[m3-camp-fence-light]]. M4 shipped `9d96547` ‒ sleep (`Z` at a lit camp bed): clock jumps to dawn, resting stats at half rate, rest restores +30 health, wake on the bed; see [[m4-sleep-system]]. M5 shipped `98569cc` ‒ first tiger: 3 deterministic jungle-band spawns, hide/patrol/stalk/chase/flee FSM, contact strike (‒30 health + all loot dropped), any lit fire or camp torch drives tigers off; see [[m5-tiger]]. M6 shipped `4e30d98` ‒ night-1 encounter: scripted first-night tiger beat (~13 m close on first dusk, fire/torch drives it off), minimal gulls (M14 placeholder: one-food steal, telegraphed dive-bomb, water-shark scare tell), 3 extra night crabs; see [[m6-night-1-encounter]]. M7 shipped `abfe70a` ‒ vegetation framework: one `PLANT_TYPES` data row per species (M8/M9 extend the rows, not world logic), per-species private `mulberry32(SEED+offset)` spawn (global world-gen rng untouched), game-minute-driven growth/state (sleep + clock-skips fast-forward for free), `E` harvest of fiber; see [[m7-vegetation-framework]]. M8 shipped `d1594ef` ‒ edible + poisonous foraging: 4 forage edibles + 3 color-shift lookalike poisons (identification is learned from eating, never labeled), `Q` eats by risk/reward order (poisons only under hunger pressure), vomit/real-second drain poison effects, map-driven fire cook (M1 priority kept); see [[m8-forage-foods]]. M9 shipped `742bfa1` ‒ medicinal plants + harvesting/regrowth: healing herb (medicine, not food ‒ `M` chews it, `Q` never eats it), tiger-strike persistent infection bleed cured only by the herb, per-spot deterministic regrow wear (over-harvesting slows regrowth); see [[m9-medicinal-plants]]. M10 shipped `f55a987` ‒ weather framework: clear/cloudy/rain as a seeded, lazily-extended schedule keyed on elapsed `gameMin` (private rng stream, survives clock jumps/rewinds, data-driven `WEATHER_NEXT` so M11 appends `storm`), visible sky/fog/sun/rain-streak blend + HUD, rain douses unsheltered fires (shelter r2.0 protects; camp torches rain-proof; a doused cook keeps its raw item), rain-accelerated plant growth owns the M7 hook (range-average `plantGrowthMult`), `?weather=` debug only; see [[m10-weather-framework]]. M11 shipped `34a064e` ‒ storm gameplay: `storm` appended as the 4th schedule state (only follows rain, 45–150 min, heavy rain for dousing/growth), per-storm precomputed lightning strikes + wind coconut drops on a private per-segment rng stream (smoke replays every value), strikes ignite open-ground fires, sear unsheltered players, and panic tigers/gulls/crabs, new `wet` stat (soak in rain/storm, dry by shelter or fire, hp drain when soaking), storm refuses the spear (lagoon surge), rain masks fire/smoke (tigers fear fires less), `?weather=storm` debug only; see [[m11-storm-gameplay]]. M12 shipped `c6ade32` ‒ animal framework: shared `animals[]` registry + behaviour helpers (`homeWander`/`returnHome`/`faceHome`/`applyMove`) + early/late frame phases; the 4 existing species re-registered with unchanged behaviour, new species join with no bespoke world wiring; see [[m12-animal-framework]]. M13 shipped `e85ab49` ‒ land wildlife: monkeys (jungle-edge meat stealer, tiger-proximity shriek tell, coconut bait), large lizards (tide-line crab hunter, dusk camp raid held out by fence AND fire), snakes (reactive-only ambush, 0.8 s telegraph, venomous/harmless split); registry 4 -> 7, `frame()` untouched; see [[m13-land-wildlife]]. `node smoke/run.mjs` → `SMOKE_OK`.

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
| M8 | ✅ `d1594ef` ‒ edible + poisonous foraging (4 edibles, 3 lookalike poisons, `Q` risk/reward eat, map-driven fire cook) |
| M9 | ✅ `742bfa1` ‒ medicinal plants + harvesting/regrowth (healing herb `M` use, tiger-strike infection bleed, per-spot regrow wear) |
| M10 | ✅ `f55a987` ‒ weather framework (clear/cloudy/rain seeded `gameMin` schedule, rain douses unsheltered fires, rain-accelerated plant growth, `?weather` debug) |
| M11 | ✅ `34a064e` ‒ storm gameplay (`storm` schedule state, seeded lightning + animal panic, wind coconuts, `wet` stat, rain-masked fire fear, `?weather=storm`) |
| M12 | ✅ `c6ade32` ‒ animal framework (species registry + shared behaviour helpers + early/late frame phases, 4 reference species unchanged) |
| M13 | ✅ `e85ab49` ‒ land wildlife (monkeys, large lizards, snakes via the registry; registry 4 -> 7, `frame()` untouched) |
| M14+ | per PLAN.md ¤11 |

M20+ (raft, win, endless, audio, perf, save/load, v1, ServerBase multiplayer) ‒ "later" by design; the only v1 design obligation multiplayer imposes is the deterministic world seed.
