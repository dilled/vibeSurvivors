---
id: m20-raft-construction
title: "M20 ‒ Raft construction: wood from spent palms, first real recipe (rope, U), camp raft build (O); escape/win stays M21"
category: decision
status: active
tags: [m20, raft, crafting, camp, inventory]
created: "2026-10-18T00:22:54"
updated: "2026-10-18T00:43:10"
---

<!-- compiled_truth -->
M20 = raft construction system: the complete gather/craft/build path for the winning raft (PLAN.md M20: "Player can gather/build all required raft components"). Shipped `0ab4f16`. M20 only builds the raft, it does not take it to open water ‒ the escape/win sequence shipped as M21 (`d312b0c`); see [[m21-escape-win]].

**Wood is the first new `INV` counter, gathered from the existing vegetation framework, not a new plant species.** The `actUse` palm branch broadens to any palm within 3.5 u: a palm with coconuts still drops one via `dropCoconut` (the M11 storm wind-drop path is untouched), while a spent palm (`cocos == 0`) yields +1 wood with a one-time `learn('wood')`. Zero world-gen / `PLANT_TYPES` / animal-registry changes.

**Rope is the first real recipe:** `actCraftRope()` (key `U`, usable anywhere) twists `ROPE_FIBER = 3` fiber tufts into 1 rope, `learn('rope')`, no-op below 3 fiber. Fiber continues to come from M7 `E` harvest; no new gathering loop.

**The raft is a camp structure, not a carried item:** `actBuildRaft()` (key `O`, within 10 u of camp) consumes `RAFT_WOOD = 8` + `RAFT_ROPE = 4` with an explicit "needs X wood / Y rope (have ...)" toast, then places `buildRaftMesh` (two outrigger floats, 4 lash-bound deck planks, end lash bands, stern posts ‒ house palette) at the new `campOffsets('raft')` slot: forward 3.0 u, inside the 4 u fence ring. `camp.structures` gains `raft: null`; building sets it, and a second build is refused ("the raft is already built"). `learn('raft')` + a `logLine(..., 'survival')` journal line.

**State hygiene (the durable part):**
- `INV.wood` / `INV.rope` reset at both death sites (tiger strike + respawn) so crafted progress can't leak across deaths, matching the existing INV-reset convention.
- UI wiring is additive: `U`/`O` keybinds + title-card row, HUD inventory line gains wood/rope, `campLine` lists the raft, `contextHint` gains the spent-palm wood hint and the raft as the last missing structure placed after the night-sleep hint (M4 sleep-hint precedence kept).
- M19 journal integration: `SURVIVAL_CATALOG = ['rope', 'raft', 'wood']` feeds the Survival category's "N more to learn" line; no journal mechanics touched.

**Smoke (new M20 block in `smoke/run.mjs`):** spent-palm wood gain on a dry item/fire-free site, coconut-drop regression with cleanup, rope craft + 0-fiber no-op, raft build/consumption/no-double-build/insufficient-resources, learned/journal/INV/camp snapshot-restore, 10-species registry assert still holds, 0 `rng()`/`Math.random` in the new sections. SMOKE_OK (execution proven via a temporary marker, then reverted).

**Verification note:** headless screenshots are not runnable on this host (no Chrome ‒ M17/M18 precedent); the raft render is exercised via the stub DOM.


## Timeline

- time: 2026-10-18T00:22:54
  kind: decision
  summary: "Created this page: M20 ‒ Raft construction: wood from spent palms, first real recipe (rope, U), camp raft build (O); escape/win stays M21"
  source: "PLAN.md M20 row; commit 0ab4f16"
  affects: [m20-raft-construction]

- time: 2026-10-18T00:23:11
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m20-raft-construction]

- time: 2026-10-18T00:43:10
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m20-raft-construction]
