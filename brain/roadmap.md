---
slug: roadmap
title: Roadmap
role: milestones
updated: "2026-09-14T23:12:24"
---

# Roadmap

> From PLAN.md §11 (the full M0–M31 table there is the source of truth — this page tracks status only). M0 shipped `fd620a0` — island terrain, instanced vegetation, 2.5D camera, player rig, day/night. M1 shipped `f2f6e6d` — survival stats, water, fire+cooking, coconuts, non-lethal spear + fish, crabs, death/respawn; see [[m1-survival-systems]]. M2 shipped — camp spot selection (`H`, validity-checked), fixed-offset shelter/bed structures (`J`/`K`), camp-aware respawn; see [[m2-camp-system]]. `node smoke/run.mjs` → `SMOKE_OK`.

| Phase | Status |
|---|---|
| M0 | ✅ `fd620a0` |
| M1 | ✅ `f2f6e6d` |
| M2 | ✅ camp spot + basic structures (shelter, bed) |
| M3 | next — fence + camp light/fire integration |
| M4+ | per PLAN.md §11 |

M20+ (raft, win, endless, audio, perf, save/load, v1, ServerBase multiplayer) — "later" by design; the only v1 design obligation multiplayer imposes is the deterministic world seed.
