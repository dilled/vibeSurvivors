---
id: v3-server-authoritative
title: "Pivot: server is world-authority (v3 model) - trees, animals, players"
category: decision
status: active
tags: [multiplayer, serverbase, authority]
created: "2026-10-24T16:59:28"
updated: "2026-10-24T14:42:17"
---

<!-- compiled_truth -->
## The decision (v3: server is world-authority)

2026-10-24 the user directed a pivot: in multiplayer the server is **master of everything**. It owns island generation (tree/vegetation/rock locations **and rotations** are generated on the server and shipped to clients, not derived locally), the animal simulation, and player state. Clients render what the server says. The v2 first-client-authority relay model ([[vivsurvivors-mp-relay]]) is superseded as each milestone lands and removed entirely at M40. The protocol is hard-versioned at the switch (v2 bump at M33); relay-era wire facts remain valid protocol history.

## Milestone plan (per PLAN.md)

- **M32** ‒ Bit-exact C++ port of the deterministic stack (mulberry32, hash2, vnoise, fbm, heightAt, scatter) with golden test vectors extracted from the JS implementation; C++ output must bit-match the JS vectors.
- **M33** ‒ Server island generation in C++ (vegetation/plant/rock positions + rotations from the same seed); protocol **v2** join payload ships the placement block on join; the server keeps a world store for later validation.
- **M34** ‒ Client builds the `?mp=` world from the server payload (local scatter/plant spawn skipped in mp mode); without `?mp=` nothing changes ‒ single-player stays bit-identical.
- **M35** ‒ Server animal sim part 1: C++ animal framework (registry, FSM helpers, phase slots) + first species batch (fish, crabs, tigers, gulls) simulated on the server and streamed to clients.
- **M40** ‒ Protocol v2 hardening + full v2 relay removal (client authority uploads of animals/time, authority election, edit relay gates) + server-restart resilience (world store survives restart).

The single-player determinism contract (island = f(SEED 1337, gameMin, edits); bit-identical without `?mp=`) is preserved throughout the v3 transition. MP follow-on requirements M42-M44 (remote camp/structure/fire + held-item visibility, remote-player animation, vegetation placement ground-clamp/canopy-alignment fix keeping placement deterministic) build on the v3 world.

Related: [[vivsurvivors-mp-relay]] (superseded v2 model + wire history), [[m29-mp-world-state]], [[m30-mp-animals]], [[multiplayer-deferred-serverbase]].


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
