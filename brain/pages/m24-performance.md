---
id: m24-performance
title: "M24 ‒ Performance pass: rain instancing, 2-level LOD for the 9 mesh animal species, read-only section profiler"
category: decision
status: active
tags: [m24, performance, lod, instancing, rendering]
created: "2026-10-18T02:07:07"
updated: "2026-10-18T02:07:27"
---

<!-- compiled_truth -->
M24 = the performance pass (PLAN.md M24: "Stable target performance with full island systems active"). Shipped `df5bc15`. Three render-side workstreams in `index.html`, **zero gameplay/determinism impact**.

**1. Instancing (rain):** the 90 individual rain-streak meshes collapse into ONE `InstancedMesh(90)` (`DynamicDrawUsage`) inside `rainGrp`. The group is kept so the [[m10-weather-framework]]/[[m11-storm-gameplay]] `rainGrp.visible` gating and its smoke assertions keep working unchanged; `updateRain` rewrites all 90 matrices via the existing `setM` and sets `instanceMatrix.needsUpdate` only while raining. `dropRng` draw order (3/drop) is unchanged, so the rain pattern stays bit-identical.

**2. LOD (animals):** `LOD_FAR = 70 u` + a `makeLod()` helper: one shared `BoxGeometry(1,1,1)` proxy, per-species cached `MeshLambertMaterial`, proxy scaled to a rough per-species silhouette and sitting on the local ground. Every animal pop entry is now a two-level `THREE.LOD` (detail group at distance 0, shared box proxy at `LOD_FAR`) covering all 9 mesh species: crabs (all 3 spawn blocks), tigers, gulls, monkeys, lizards, snakes (venomous/harmless proxy color), M14 pelicans, sharks, spiders. Wrap mechanics: copy spawn position, zero the detail group, scene remove/add, store `grp` as the LOD node ‒ so the unchanged per-frame contract keeps working render-only: `grp.position.set`/`rotation.y`/`visible`, the M13 crab-catch/lizard-hide hides, the shark lurch scale. **Deliberately NOT wrapped:** fish schools and static vegetation (already instanced), fires, the gull nest, and the camp/raft. Durable convention: a new mesh-based animal species joins via the same two-level LOD wrap (or instancing), never a raw mesh at full detail.

**3. Profiler (read-only):** a section profiler (`perf {ms,avg,frames}` + `pt()` markers around `stats`/`animE`/`sky`/`animL`/`plants`/`render` in `frame()`, EMA 0.9/0.1) driven by `showPerf`; on via `?perf=1` at load or the `F8` key (`F` is already eatFish), with a HUD line showing per-section ms + WebGL draw calls read via optional-chained `renderer.info.render.calls` (the smoke stub has no `info`).

**Smoke (`smoke/run.mjs`):** the stub DOM gains an `LOD` class (`levels`/`addLevel`, no-op `update`); the M17 spider-mesh assertion now reads the detail level through the LOD (`levels[0].level.children`). New M24 block asserts: 2-level LOD (detail 0, proxy at `LOD_FAR`) across all 9 species, zeroed detail groups + LOD-at-spawn (no double offset), `rainGrp` holding exactly one `InstancedMesh(90)` whose matrices are rewritten while raining and whose `rainGrp.visible` gating still flips on rain->clear, the profiler off by default + counting frames + filling all 6 sections + riding the HUD line behind `showPerf`, and the house invariants (vegetation populations, heightfield spot, all animal pop counts, 10-species registry). SMOKE_OK (M24 block execution proven via a temporary marker, then reverted).

**Determinism invariants:** zero `rng()`/`Math.random` in the new lines (only the three rewritten `crabs.push` lines keep the pre-existing same-order draws); zero world-gen/`PLANT_TYPES`/weather-schedule/animal-registry changes.

**Verification note:** the 60 fps mid-range-laptop budget is the human gate; headless screenshots are not runnable on this host (no Chrome ‒ M17+ precedent), so render is exercised via the stub DOM, not a real WebGL context.


## Timeline

- time: 2026-10-18T02:07:07
  kind: decision
  summary: "Created this page: M24 ‒ Performance pass: rain instancing, 2-level LOD for the 9 mesh animal species, read-only section profiler"
  source: "commit df5bc15 (PLAN.md M24)"
  affects: [m24-performance]

- time: 2026-10-18T02:07:27
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m24-performance]
