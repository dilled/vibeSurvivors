---
slug: roadmap
title: Roadmap
role: milestones
updated: "2026-10-17T16:36:33"
---

# Roadmap

> From PLAN.md §11 (the full M0–M31 table there is the source of truth — this page tracks status only). M0 shipped `fd620a0` — island terrain, instanced vegetation, 2.5D camera, player rig, day/night. M1 shipped `f2f6e6d` — survival stats, water, fire+cooking, coconuts, non-lethal spear + fish, crabs, death/respawn; see [[m1-survival-systems]]. M2 shipped — camp spot selection (`H`, validity-checked), fixed-offset shelter/bed structures (`J`/`K`), camp-aware respawn; see [[m2-camp-system]]. M3 shipped — camp fence (`L`, entrance facing the stored heading) + standing camp torch (`N`), `campIsLit()` (torch or fire within 8 m), HUD lit state; see [[m3-camp-fence-light]]. M4 shipped `9d96547` — sleep (`Z` at a lit camp bed): clock jumps to dawn, resting stats at half rate, rest restores +30 health, wake on the bed; see [[m4-sleep-system]]. `node smoke/run.mjs` → `SMOKE_OK`.

| Phase | Status |
|---|---|
| M0 | ✅ `fd620a0` |
| M1 | ✅ `f2f6e6d` |
| M2 | ✅ camp spot + basic structures (shelter, bed) |
| M3 | ✅ fence + camp light/fire integration |
| M4 | ✅ `9d96547` — sleep + night survival loop |
| M5+ | per PLAN.md §11 |

M20+ (raft, win, endless, audio, perf, save/load, v1, ServerBase multiplayer) — "later" by design; the only v1 design obligation multiplayer imposes is the deterministic world seed.
