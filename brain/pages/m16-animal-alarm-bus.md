---
id: m16-animal-alarm-bus
title: "M16 ‒ Animal alarm bus: deterministic alarmRaise/alarmsNear bus + six tell emitters and six cross-species reactions"
category: decision
status: active
tags: [animals, m16, alarm-bus, cross-species, determinism]
created: "2026-10-17T22:55:44"
updated: "2026-10-17T22:56:10"
---

<!-- compiled_truth -->
## What shipped (M16 ‒ animal alarm bus + cross-species reactions)

M16 ships the **small deterministic alarm bus** from [[animal-ecosystem-design]] (PLAN.md ¤9 events: scream / alert / attack / flee ‒ `flee` is not used as a kind yet) plus the first **cross-species reactions**. The design contract of PLAN.md's M16 gate "Animals react meaningfully to nearby threats/events" is met; `smoke/run.mjs` has an M16 block. No new species and no new rng consumer ‒ the registry stays at 9 and every M12–M15 assert holds.

## Bus contract

- **Shape**: `alarms[]` of `{kind, x, z, r, t}`; `alarmRaise(kind, x, z, r, t)` appends, `alarmsNear(x, z, kinds?)` returns the **nearest** active alarm covering the point (optional kind filter), `updateAlarms(dt)` decays durations.
- **One decay per frame**: `updateAlarms(dt)` runs once in `frame()` **before both animal phases**, so `'early'` (fish/crabs/sharks) and `'late'` species see the same alarm set in a frame.
- **The emitter owns radius + duration** ‒ consumers never do; reaction fields on the animals are per-species.
- **Additive only**: an empty bus means zero behaviour change (no reaction can fire), which is why the pre-M16 smoke blocks are untouched.
- **Determinism**: the bus has **no rng** ‒ purely state pushed by deterministic tell moments, so it is server world-sync safe under [[multiplayer-deferred-serverbase]].

## Emitters (the six taught tell moments)

| tell moment | kind | radius | duration |
|---|---|---|---|
| monkey tiger-proximity shriek (M13) | `scream` | 20 | the shriek itself (`MONKEY_SCARE_T`) |
| curious-shark turn (M15 patrol -> `curious` **edge**, fired once, not per frame) | `scream` | 25 | 8 s |
| shark bite (M15) | `attack` | 25 | 6 s |
| tiger strike (M5) | `attack` | 20 | 6 s |
| gull dive tell (M6) | `scream` | 15 | the dive tell |
| `panicWildlife` strike point (M11 all-species hook) | `alert` | 25 | 6 s |

## Reactions (six, all on existing species)

- **Crabs** bolt (2 s flee) from **every** alarm kind (`scream`/`attack`/`alert`) ‒ "if the beach is running, something has landed" (new taught tell `crabalarm`).
- **Monkeys** freeze and **face** a `scream`/`attack` alarm for 2 s (new `alertT` fields); the freeze never overrides the monkey's own tiger shriek.
- **Large lizards** scare-flee 2 s (reuse their M13 `scareT` fields) from `scream`/`attack`/`alert`.
- **Snakes** freeze 1.2 s from `alert`/`attack`.
- **Pelicans** flee 3 s (M14 flee fields) from `scream`/`attack`.
- **Fish schools** scatter for 3 s with the M11-surge visual-displacement pattern: a 6 u push away from the alarm origin, no re-clamp, wanders home after (new `scT` fields); a `scream` alarm triggers it (new taught tell `fishscatter`).

## Durable constraints

- Smoke: the M16 block verifies the primitives (raise/coverage/expiration), each cross-reaction, the monkey-shriek emission, the curious-shark **edge** emission (exactly one alarm per turn) + fish scatter, and the `panicWildlife` emission. Because tell moments now push the bus, the M11–M15 blocks **drain `alarms.length = 0` at their boundaries** (and after the M13 shriek test) so the bus never leaks between blocks; the M15 dawn/dusk spear test parks at the school's **live** position because the M16 scatter can displace it from home.


## Timeline

- time: 2026-10-17T22:55:44
  kind: decision
  summary: "Created this page: M16 ‒ Animal alarm bus: deterministic alarmRaise/alarmsNear bus + six tell emitters and six cross-species reactions"
  source: "commit 8532b15 (M16)"
  affects: [m16-animal-alarm-bus]

- time: 2026-10-17T22:56:10
  kind: decision
  summary: "M16 shipped: deterministic alarm bus (alarms/alarmRaise/alarmsNear/updateAlarms, one decay per frame before both animal phases); six tell emitters and six cross-species reactions; crabalarm/fishscatter tells; no rng, no new species, registry 9 unchanged, all M12-M15 asserts hold"
  source: "commit 8532b15 (M16)"
  affects: [m16-animal-alarm-bus]
