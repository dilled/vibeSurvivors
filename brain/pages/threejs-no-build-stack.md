---
id: threejs-no-build-stack
title: "Client is Three.js r0.158, vendored, no build step"
category: decision
status: active
created: "2026-09-14T18:41:08"
updated: "2026-09-14T18:41:40"
---

<!-- compiled_truth -->
Decided: the client follows the house pattern exactly — Three.js **r0.158** vendored in `lib/` (copy from ../vibeGTA/lib/three.module.js), a single `index.html` + `game.js`, no package.json, no build step, no CDN, no internet. The camera is 2.5D: a real 3D low-poly world viewed from a fixed oblique third-person angle (no free-look, no mouse-aim). World generation must be **deterministic from a seed** (hand-authored layout archetypes + randomized interior placement) — this is the single v1 requirement imposed by future multiplayer. Rendering budget: instanced trees/rocks, merged vegetation meshes, day/night via directional light + fog + sky lerp; 60fps on a mid-range laptop.

Alternatives considered: Unity (rejected: breaks house pattern, heavier), procedural full-terrain gen (rejected for v1: art control), free-look 3D camera (rejected: '2.5D' feel, control simplicity).


## Timeline

- time: 2026-09-14T18:41:08
  kind: decision
  summary: "Created this page: Client is Three.js r0.158, vendored, no build step"
  source: "PLAN.md §9 / house pattern (vibeGTA, vibeCraft)"
  affects: [threejs-no-build-stack]

- time: 2026-09-14T18:41:40
  kind: decision
  summary: "Three.js r0.158 vendored, single-file client, deterministic seeded world"
  source: "PLAN.md §9"
  affects: [threejs-no-build-stack]
