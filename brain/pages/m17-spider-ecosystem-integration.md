---
id: m17-spider-ecosystem-integration
title: "M17: spider (10th species) + ecosystem integration"
category: project
status: active
tags: [m17, animals, balancing]
created: "2026-10-17T23:22:19"
updated: "2026-10-17T23:22:47"
---

<!-- compiled_truth -->
M17 = the last animal milestone. Scope: ship the PLAN.md ¤5 **spider** as the 10th registered species through the M12 framework, plus the ecosystem integration/balancing sweep across all 10 (registry 9 -> 10). Gate: all 10 species coexist without obviously broken behaviour; `node smoke/run.mjs` → `SMOKE_OK`.

**The spider (registry slot 9, `'late'`, pop 3, band 'jungle edge/camp 3..12'):** a big tarantula-type, night-only (`dayFactor < 0.25`), low threat, **non-lethal, no damage**. By day it holds still at its den (the tiger/lizard hide pattern). At night, with a camp, a player within `SPIDER_RAID_RANGE` (12) and meat in `SPIDER_MEAT_ORDER` (reuses `LIZ_MEAT_ORDER`), it creeps in at 1.8 u/s, stops 3 u from the camp, raises a **0.9 s clicking tell** (front legs up), then steals exactly one meat item (`INV[pick]--`, per-spider `raidCd` 45, `learn('spider')`, toast). Up close (2 u) it loses its nerve and flees.

**Counter = fire/torch (the universal rule, no fence required):** `camp && campIsLit()` keeps the spider out of the 7 u camp perimeter (`applyMove` terrain veto) and teaches `learn('spiderfire')`.

**Alarm bus = reaction only (M16 emitter set of 6 unchanged):** the spider flees 3 s from `scream`/`attack`/`alert` alarms via `alarmsNear`; it never emits (the click tell is player-facing, not a bus event). Additive, so the M16 asserts hold.

**Design constraints (balancing = constant-knob tuning only):** populations stay pinned (5/15/3/5, 5/4/6, pelicans 3 + crabs 15, sharks 2) ‒ the sweep touched no pinned population; only new `SPIDER_*` knobs were added.

**Determinism:** no new private rng stream; the 3 spider spawns consume only the global `rng()` **strictly after the M15 shark block** (before the spear section), so the M12–M15 spawn stream is untouched. No per-frame rng. Server world-sync safe (matches the M16 bus constraint). Spawn band keeps homes out of the 7..20 deep-jungle tiger band and 15 u+ from tiger homes so the tiger FSM and the spider raid never interleave.

**Deferred (documented, not built):** cave blind spiders (no cave terrain exists on the island in M0–M17 ‒ no world change in this milestone) and the silk resource (no crafting system until M20; rope is fiber/liana per PLAN.md ¤8; silk would be a consumer-less inventory key).

**Smoke (new M17 block after the M16 block):** registry slot 9 = the spider descriptor (pop 3, 'late', step fn) + slot-drift check over slots 0–8; spawn band/spacing invariants (3..12, 30 u+ from spawn, 15 u+ from tiger homes, 8 u+ apart); a 10-species coexistence sanity pass (no empty population, no NaN positions, spider mesh built); day clock (spiders return to / hold at their dens, nothing stolen); night + unlit camp + one meat + player at the camp (exactly one meat sniped, `learned.has('spider')`, per-spider cooldown set); night + lit camp (`campIsLit()`; the spider never crosses the perimeter and the steal point, `learned.has('spiderfire')`); alarm reaction (`alarmRaise('scream')` near a spider sets its flee fields). Full snapshot/restore of spider + `INV` + `learned` + clock + camp + fires state, and `alarms.length = 0` drained at the boundary. The four M12–M15 registry-count asserts were bumped 9 -> 10 (established pattern when a species is added).


## Timeline

- time: 2026-10-17T23:22:19
  kind: decision
  summary: "Created this page: M17: spider (10th species) + ecosystem integration"
  source: "PLAN.md M17 row; handoff M17.md"
  affects: [m17-spider-ecosystem-integration]

- time: 2026-10-17T23:22:47
  kind: decision
  summary: "M17 shipped: spider as the 10th species + ecosystem integration sweep"
  source: M17 implementation session
  affects: [m17-spider-ecosystem-integration]
