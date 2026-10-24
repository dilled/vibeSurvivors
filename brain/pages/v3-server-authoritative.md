---
id: v3-server-authoritative
title: "Pivot: server is world-authority (v3 model) - trees, animals, players"
category: decision
status: active
tags: [multiplayer, serverbase, authority]
created: "2026-10-24T16:59:28"
updated: "2026-10-24T16:49:15"
---

<!-- compiled_truth -->
## The decision (v3: server is world-authority)

2026-10-24 the user directed a pivot: in multiplayer the server is **master of everything**. It owns island generation (tree/vegetation/rock locations **and rotations** are generated on the server and shipped to clients, not derived locally), the animal simulation, and player state. Clients render what the server says. The v2 first-client-authority relay model ([[vivsurvivors-mp-relay]]) is superseded as each milestone lands and removed entirely at M40. The protocol is hard-versioned at the switch (**v2 bump landed in M33: the server now refuses non-v2 joins**); relay-era wire facts remain valid protocol history.

## Milestone plan (per PLAN.md)

- **M32** ✅ ‒ Bit-exact C++ port of the deterministic stack (mulberry32, hash2, vnoise, fbm, heightAt, scatter) with golden test vectors extracted from the JS implementation; C++ output must bit-match the JS vectors.
- **M33** ✅ ‒ Server island generation in C++: `VibeSurvivorsPlugin/src/WorldGen.cpp` `genIsland(seed)` mirrors the client's draw order 1:1 (global stream: palms scatter + 3 draws/palm, trees scatter + 1/tree, rocks 90+25, then the render-block visual draws in the real order; plants on per-species private streams `mulberry32(seed+offset)`, PLANT_TYPES key order). Protocol **v2** hard bump: join = `playerId|2|seed`, server refuses any other version before the seed check. Type 33 `MSG_VIVS_WORLD` placement block ([u32 seed][palms 6f64][trees 11f64][rocks 5f64][species: key + pts 3f64], all LE) is sent on every (re)join, ahead of the M29 edit-history catch-up (per-player FIFO, one packet per tick). Server keeps the world in memory (`VivsModule::world_`) for M39 edit validation. Verified: ctest `vibs_world_matches_js_reference` (byte-identity against the JS reference extracted verbatim from index.html), 134/134 green; headless E2E `smoke/e2e-world.mjs` (3 clients byte-identical, v1 refused, rejoin re-sync).
- **M34** ✅ ‒ Client builds the `?mp=` world from the server's type-33 placement block: `onWorld` hook drives `mpBuildWorld`, which replaces the local `palms`/`bigTrees`/`rocks`/`plants` data and rebuilds the instanced vegetation meshes **once** (build-once `mpWorldBuilt` guard; the server re-sends the block on every (re)join, so duplicates are ignored ‒ rebuilding would reset cocos/charges state). Deliberate design (differs from the PLAN wording "local spawn is skipped"): the local scatter/plant **spawn loops still run** in mp mode so the global rng stream is consumed bit-identically to single-player (protects animal spawns and the rng-ordering invariant); only the mesh builds are deferred and wrapped (`buildIslandMeshes`/`buildPlantMeshes`/`emitAllPlants`) with server-value ternary fallbacks (`cs`/`loff`/`llen`/`s`/`sy`) over the local rng draws. `updatePlants` and `mpApplyWorldEdit` kind 0/1 are guarded until the payload lands (plant mesh unallocated). mp entry shapes mirror local spawn exactly (palm `h = trunkH` spread-overwrite semantics; M44's floating-palm quirk replicated on purpose; rock `sy` = the final y-scale). Verified: smoke proves payload consumption (modified synthetic payload, entry shapes, index-derived plant fields, build-once + null-ignore) with the non-mp bands untouched; E2E re-verified the live 29220 B payload stays byte-identical; without `?mp=` nothing changes.
- **M35** ‒ Server animal sim part 1: C++ animal framework (registry, FSM helpers, phase slots) + first species batch (fish, crabs, tigers, gulls) simulated on the server and streamed to clients.
- **M40** ‒ Protocol v2 hardening + full v2 relay removal (client authority uploads of animals/time, authority election, edit relay gates) + server-restart resilience (world store survives restart).

The single-player determinism contract (island = f(SEED 1337, gameMin, edits); bit-identical without `?mp=`) is preserved throughout the v3 transition. MP follow-on requirements M42-M44 (remote camp/structure/fire + held-item visibility, remote-player animation, vegetation placement ground-clamp/canopy-alignment fix keeping placement deterministic) build on the v3 world.

Related: [[vivsurvivors-mp-relay]] (superseded v2 model + wire history), [[m29-mp-world-state]], [[m30-mp-animals]], [[m32-cpp-determinism-port]], [[multiplayer-deferred-serverbase]].


## Timeline

- time: 2026-10-24T16:59:28
  kind: decision
  summary: "Created this page: Pivot: server is world-authority (v3 model) - trees, animals, players"
  source: created via brain create-page
  affects: [v3-server-authoritative]

- time: 2026-10-24T14:42:17
  kind: decision
  summary: "Filled the placeholder page with the v3 pivot decision + M32-M35/M40 milestone plan"
  source: "brain sync pass: commits 837f413, 285f23b, 9f2f3d8 (PLAN.md M32-M35, M42-M44)"
  affects: [v3-server-authoritative]

- time: 2026-10-24T16:14:57
  kind: decision
  summary: "M33 landed: C++ genIsland (WorldGen.cpp) byte-identical to the JS reference, protocol v2 hard bump (server refuses non-v2 joins), type-33 world block on (re)join, in-memory world store for M39; ctest byte-identity + headless E2E green"
  source: "M33 implementation session: commits in ServerBase + vibeSurvivors"
  affects: [v3-server-authoritative]

- time: 2026-10-24T16:49:15
  kind: decision
  summary: "M34 landed: ?mp= client builds the island vegetation from the server's type-33 block (mpBuildWorld via onWorld, build-once guard); local spawn loops still run so the rng stream stays bit-identical to single-player; mesh builds wrapped with server-value ternary fallbacks; updatePlants + mpApplyWorldEdit kind 0/1 guarded pre-payload; smoke + E2E byte-identity green"
  source: "brain sync pass: commit c23cbbe (M34, range 82714127..c23cbbe)"
  affects: [v3-server-authoritative]
