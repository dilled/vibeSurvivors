---
id: v3-server-authoritative
title: "Pivot: server is world-authority (v3 model) - trees, animals, players"
category: decision
status: active
tags: [multiplayer, serverbase, authority]
created: "2026-10-24T16:59:28"
updated: "2026-10-25T11:47:58"
---

<!-- compiled_truth -->
<!-- compiled_truth -->
## The decision (v3: server is world-authority)

2026-10-24 the user directed a pivot: in multiplayer the server is **master of everything**. It owns island generation (tree/vegetation/rock locations **and rotations** are generated on the server and shipped to clients, not derived locally), the animal simulation, and player state. Clients render what the server says. The v2 first-client-authority relay model ([[vivsurvivors-mp-relay]]) is superseded as each milestone lands and removed entirely at M40. The protocol is hard-versioned at the switch (**v2 bump landed in M33: the server now refuses non-v2 joins**); relay-era wire facts remain valid protocol history.

## Milestone plan (per PLAN.md)

- **M32** ✅ ‒ Bit-exact C++ port of the deterministic stack (mulberry32, hash2, vnoise, fbm, heightAt, scatter) with golden test vectors extracted from the JS implementation; C++ output must bit-match the JS vectors.
- **M33** ✅ ‒ Server island generation in C++: `VibeSurvivorsPlugin/src/WorldGen.cpp` `genIsland(seed)` mirrors the client's draw order 1:1 (global stream: palms scatter + 3 draws/palm, trees scatter + 1/tree, rocks 90+25, then the render-block visual draws in the real order; plants on per-species private streams `mulberry32(seed+offset)`, PLANT_TYPES key order). Protocol **v2** hard bump: join = `playerId|2|seed`, server refuses any other version before the seed check. Type 33 `MSG_VIVS_WORLD` placement block ([u32 seed][palms 6f64][trees 11f64][rocks 5f64][species: key + pts 3f64], all LE) is sent on every (re)join, ahead of the M29 edit-history catch-up (per-player FIFO, one packet per tick). Server keeps the world in memory (`VivsModule::world_`) for M39 edit validation. Verified: ctest `vibs_world_matches_js_reference` (byte-identity against the JS reference extracted verbatim from index.html), 134/134 green; headless E2E `smoke/e2e-world.mjs` (3 clients byte-identical, v1 refused, rejoin re-sync).
- **M34** ✅ ‒ Client builds the `?mp=` world from the server's type-33 placement block: `onWorld` hook drives `mpBuildWorld`, which replaces the local `palms`/`bigTrees`/`rocks`/`plants` data and rebuilds the instanced vegetation meshes **once** (build-once `mpWorldBuilt` guard; the server re-sends the block on every (re)join, so duplicates are ignored ‒ rebuilding would reset cocos/charges state). Deliberate design (differs from the PLAN wording "local spawn is skipped"): the local scatter/plant **spawn loops still run** in mp mode so the global rng stream is consumed bit-identically to single-player (protects animal spawns and the rng-ordering invariant); only the mesh builds are deferred and wrapped (`buildIslandMeshes`/`buildPlantMeshes`/`emitAllPlants`) with server-value ternary fallbacks (`cs`/`loff`/`llen`/`s`/`sy`) over the local rng draws. `updatePlants` and `mpApplyWorldEdit` kind 0/1 are guarded until the payload lands (plant mesh unallocated). mp entry shapes mirror local spawn exactly (palm `h = trunkH` spread-overwrite semantics; M44's floating-palm quirk replicated on purpose; rock `sy` = the final y-scale). Verified: smoke proves payload consumption (modified synthetic payload, entry shapes, index-derived plant fields, build-once + null-ignore) with the non-mp bands untouched; E2E re-verified the live 29220 B payload stays byte-identical; without `?mp=` nothing changes.
- **M35** ✅ ‒ Server animal sim part 1: `VibeSurvivorsPlugin` now simulates the first four species (`vsurv::animals::AnimalSim`, roster of 28: 5 fish schools, 15 crabs, 3 tigers, 5 gulls; slots 0..4 / 64..78 / 128..130 / 192..196 = type*64+popIndex). The ctor replays the client's MP-mode spawn stream bit-identically (same `mulberry32(1337)` draw order as index.html: palms/trees/rocks scatters, the MP-deferred `buildIslandMeshes` visual draws NOT consumed, then fish, M1 crabs, tigers, M6 crabs, gulls, and the draw-only M13/M14 tail ‒ monkeys/lizards/snakes 2 draws each + nest retry loop ‒ that shifts the stream before the 6 M14 crabs; the C++ goldens pin this, moving a client spawn block moves the M14 crabs). Server clock: `simGameMin_ += dt * clockRate` at 30 Hz (story rate 0.6 day / 1.2 dark, p0=0.1, no M22 boost), snapped by the authority's MSG_VIVS_TIME. Every tick's bit2 = `snapshot()` (always 28 entries) for all tabs, replacing the M30 authority-upload relay server-side; the client M30 authority skip in `mpAnimalsFrame` is removed so every tab (incl. authority) adopts the snapshot. The six unported species still run locally per-tab in mp (M36 server-simulates them and disables local sim). Reduced sim is intended: tigers reach only Hide/Patrol (no player/fire/alarm-bus/depletion). The M30 type-29 client upload path stays until M40. Verified: ctest `vibs_animals_matches_js_reference` (C++ `VivsAnimalsDump` byte-identical to a JS dump that evaluates the real spawn blocks extracted from index.html), `VivsAnimals.*` gtests, smoke M35 block (authority adopts the 28-slot snapshot, slots 256+ untouched, type-29 upload intact), headless E2E `smoke/e2e-animals.mjs` (3 tabs: exactly 28 entries, byte-identical snapshots, evolving over ~2 s), world payload re-verified unchanged (29220 B, `e2e-world`).
- **M36** ✅ ‒ Server animal sim part 2: `AnimalSim` now simulates ALL 51 animals (the full ten-species registry, ROSTER_COUNT=51; new bands 256..260 monkeys, 320..323 lizards, 384..389 snakes, 448..450 pelicans, 512..513 sharks, 576..578 spiders). The ctor converts the M13 draw-only replays into stored entities (same draws, dir/phase from the two placeholder draws), then APPENDS pelican/shark/spider spawn AFTER the M14 crabs (client source order; pelican perches = the 3 highest palms >25u from spawn, stable-sort by trunkH desc, top = base+tilt*trunkH*0.98, groundH+trunkH; shark patrol-only with the custom `heightAt <= -0.6` terrain veto; spiders night-creep without the player raid). Alarm bus ported (M16): `alarms_` + `updateAlarms` once per step before both phases, `alarmsNear`/`alarmRaise`; receivers wired for every ported species (fish scatter, crabs bolt, monkeys listen-freeze, lizards spook, snakes freeze, pelicans flee-high, spiders flee) and the ONE organic emitter: monkey shriek (a live tiger <14u of the monkey's home during dayFactor>=0.25; screamT=4 + alarm 'scream' r20 t4). Player-dependent emitters (tiger strike, shark curious/bite, gull dive tell, panicWildlife/lightning) deliberately NOT ported ‒ they arrive with M37 (weather) and M38 (player authority). The M13 spawn goldens pin the converted entities; the vibs_animals dump pair now dumps all 51. Client: with `?mp=` connected `updateAnimals` returns early (local sim fully disabled on every tab incl. authority); `mpAnimalsFrame` now also lerps grp y (pelican altitude, shark depth) and takes the fish live count n from the state byte (state=0..12, the M36 extension of the dead bit; lib/mp.js exposes raw state); new presentation pass `mpAnimalsPresent` (mp-only, zero rng) keeps the puppets alive: schools run the factored `schoolPlace` instance loop, grounded species snap y to heightAt(server x/z), the gull adds GULL_ALT, pelican/shark keep the just-lerped y, legs/wings swing from per-frame displacement (>0.05 = moving). The M30 type-29 client upload still relays the full 51-entry roster until M40. Verified: 152/152 ServerBase ctest (incl. `vibs_animals_matches_js_reference` byte-identity for all 51), smoke M36 block (SP steps / connected-inert / 51-slot adoption incl. shark depth + pelican altitude + fish n-from-state / type-29 upload 51 entries / SP steps again), headless E2E `e2e-animals` (3 tabs: exactly 51 entries, byte-identical, evolving), world payload re-verified unchanged (29220 B).
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

- time: 2026-10-24T19:35:06
  kind: decision
  summary: "M35 landed: server simulates the 28-animal roster (AnimalSim, bit-identical ctor replay of the client MP spawn stream), tick bit2 is the server snapshot for all tabs (M30 relay retired server-side), client authority skip removed so all tabs adopt it; six unported species still local in mp until M36; ctest byte-identity + smoke + 3-tab E2E green"
  source: "M35 implementation session: commits in ServerBase + vibeSurvivors (branch feature/auto-milestones-20260914-215319)"
  affects: [v3-server-authoritative]

- time: 2026-10-24T21:07:58
  kind: decision
  summary: "M36 landed: server simulates all 51 animals + alarm bus; mp clients fully disable the local sim (puppet presentation pass)"
  source: "M36 implementation session: commits in ServerBase (feat/vibecraft-server-authoritative) + vibeSurvivors (feature/auto-milestones-20260914-215319)"
  affects: [v3-server-authoritative]

- time: 2026-10-24T21:07:58
  kind: decision
  summary: "M36 landed: AnimalSim simulates all 51 animals (six new bands + M13 entities stored + pelican/shark/spider appended after M14 crabs), M16 alarm bus ported with receivers for every species and the monkey shriek as the only organic emitter (player-dependent emitters deferred to M37/M38); mp clients fully disable the local animal sim (updateAnimals gated on mpApi.connected(), mpAnimalsFrame y-lerp + fish n from state byte, new mpAnimalsPresent puppet pass with schoolPlace factored out); 152/152 ServerBase ctest incl. 51-animal byte-identity, smoke M36 block, 3-tab 51-slot E2E, world payload unchanged"
  source: "M36 implementation session: commits in ServerBase + vibeSurvivors"
  affects: [v3-server-authoritative]

- time: 2026-10-25T09:58:24
  kind: decision
  summary: "M38 landed: server player authority on the client - every tab (incl. the mover's own) reconciles its rig to the server's stamped transform with the exact M28 lerp semantics; self capture in lib/mp.js + mpSelfFrame in index.html; zero wire change (protocol v2, 21 B state); M29/M30 gates + authorityPublicId stay until M39/M40; detail in [[m38-server-player-authority]]"
  source: "brain sync pass: commit 9dbb259 (range 67e2d35..9dbb259)"
  affects: [v3-server-authoritative, m38-server-player-authority]

- time: 2026-10-25T11:47:58
  kind: decision
  summary: "M39 landed: server applies + validates world edits against its in-memory, seed-derived WorldStore (per-kind validation; camp/structure placement rules use the SENDER's last accepted/stamped transform); accepts are stamped + relayed byte-identically, rejects go to the sender ALONE over the additive MSG_VIVS_EDIT_REJECT (type 34, never relayed/replayed); server-side growth is bit-exact vs the client (ctest byte-identity gate over 26000 steps); client parses type 34 (lib/mp.js onEditReject) and toasts it; MP-mode local save/load inert; WorldStore stays in-memory, restart resilience is M40; detail in [[m39-server-edit-validation]]"
  source: "brain sync pass: commits 3122b11 + e116a4b (range 2e619d1..e116a4b)"
  affects: [v3-server-authoritative, m39-server-edit-validation]
