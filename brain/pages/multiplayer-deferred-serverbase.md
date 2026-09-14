---
id: multiplayer-deferred-serverbase
title: Multiplayer is deferred to M7 via ../ServerBase
category: decision
status: active
created: "2026-09-14T18:41:08"
updated: "2026-09-14T18:41:40"
---

<!-- compiled_truth -->
Decided: multiplayer is a **later milestone (M7)**, implemented as `VibeSurvivorsPlugin` inside `../ServerBase` — a C++20 uWebSockets executable following the `VibeCraftPlugin` pattern: the **first client is world-authority** (owns island gen from the shared seed, animal sim, vegetation/build edits), the server relays ~30 Hz ticks and **broadcasts the full applied-edit history on join/late-join** so all clients converge. v1-mp syncs player presence, shared world edits, animal state near authority, weather + time-of-day. Client hook: `?mp=host:port` URL param; without it the game is pure single-player (server optional). Explicitly NOT in v1-mp: inventory sync, death/respawn rules, shared journal, host migration.

Alternatives considered: server-authoritative sim (rejected: far more C++ work for v1-mp, matches VibeCraft's accepted trade-off later); no multiplayer (rejected: it is a planned milestone, only deferred).


## Timeline

- time: 2026-09-14T18:41:08
  kind: decision
  summary: "Created this page: Multiplayer is deferred to M7 via ../ServerBase"
  source: "PLAN.md §9 / house pattern (VibeCraftPlugin)"
  affects: [multiplayer-deferred-serverbase]

- time: 2026-09-14T18:41:40
  kind: decision
  summary: "mp deferred to M7; VibeSurvivorsPlugin, world-authority client relay"
  source: "PLAN.md §9"
  affects: [multiplayer-deferred-serverbase]
