---
slug: roadmap
title: Roadmap
role: milestones
updated: "2026-09-14T21:02:37"
---

# Roadmap

> From PLAN.md §11. M0 shipped `fd620a0` — island terrain, instanced vegetation, 2.5D camera, player rig, day/night. M1 shipped `f2f6e6d` — survival stats, water, fire+cooking, coconuts, non-lethal spear + fish schools, crabs, death/respawn; see [[m1-survival-systems]]. `node smoke/run.mjs` → `SMOKE_OK`.

| Phase | Scope | Gate |
|---|---|---|
| M0 ✅ | Three.js scaffold: island terrain, palms/trees, 2.5D camera, day/night | Walkable beach, sun sets |
| M1 ✅ | Survival: stats, water, fire, coconut, spear + fish, first crab | 10-min playable fragment |
| M2 | Camp: fence, light, sleep + first night with one tiger + crabs + gulls | First scary night (fun-check) |
| M3 | Vegetation (edible/poison/medicinal/growth) + weather (rain/storm) | Foraging is a game |
| M4 | All 10 animals + alarm bus + paper map + journal | The island is alive |
| M5 | Raft + win + endless mode | Shippable v0.1 |
| M6 | Polish: audio pass, perf, save/respawn | v1 |
| M7 | Multiplayer via `../ServerBase` (`VibeSurvivorsPlugin`) | 3 tabs converge on one island |

M7 is "later" by design: the only v1 design obligation it imposes is the deterministic world seed.
