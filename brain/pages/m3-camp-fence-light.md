---
id: m3-camp-fence-light
title: "M3 — Camp fence + camp light/fire integration"
category: decision
status: active
tags: [camp, fence, torch, light]
created: "2026-09-14T23:43:42"
updated: "2026-09-14T23:43:42"
---

<!-- compiled_truth -->
## What shipped (M3 — fence + camp light/fire integration)

- **Fence (`L`)**: driftwood post ring at radius 4.0 m around the camp (20 segments, 2 rails per kept segment), grounded per post via `heightAt`. The entrance gap faces the camp's stored heading (`camp.rot` — where the player stood at `H`): posts whose angle is within `FENCE_GAP = 0.35` rad of `rot` are skipped, and rails never span the gap (length > 1.5 m rails are dropped). One fence per camp, no removal; build requires the player within 10 m of camp (same rule as shelter/bed).
- **Camp torch (`N`)**: a standing light at the left camp offset (2.0 m, fixed like shelter/bed). It is a *structure*, not a `fires` entry: it has its own flicker list `torchLights`, persists at respawn, and does not count against the 5-fire cap nor cook. Flame + PointLight (26 m) match the M1 fire look.
- **Camp lit state**: `campIsLit()` = torch built **or** any regular fire within 8 m of camp centre. HUD camp line lists built structures (`fence · shelter · bed · torch`) and appends `🔥lit` when lit.
- **Surfacing**: context hint now lists all missing camp structures (`J/K/L/N`); help card row extended to `H · J · K · L · N`; journal learnings `fence` / `torch`.

## Alternatives considered

- Per-post click placement / tear-down: deferred — fixed geometry keeps the fence deterministic and smoke-testable, matching the M2 structure model.
- Making the torch a real `fires` entry (cookable): rejected — a cookable camp fire would consume the fire cap and complicate the "camp is lit" state; the torch is a dedicated standing light and M4 sleep can gate on `campIsLit()` directly.

## Rationale

M4 (sleep) needs "valid camp conditions" and M5/M6 need a defensible, lit camp that tigers/lizards avoid; `campIsLit()` + the fence perimeter are the minimal contract. The fence gate facing the player's heading makes the entrance legible in-world and gives the smoke test a geometric invariant.

## Blast radius

- Keys `L`, `N` reserved.
- `camp.structures` gained `fence` / `torch` (HUD + hint enumerate the structure list, so M4+ structures should be added to `campOffsets`, the HUD list, and the hint list together).
- New module state: `FENCE_R`, `FENCE_SEG`, `FENCE_GAP`, `torchLights`, `buildFenceMesh`, `buildTorchMesh`, `updateTorchLights`, `campIsLit`, `actFence`, `actTorch`.

## Smoke coverage (`smoke/run.mjs` → `SMOKE_OK`)

Lit state tracks fires pre-torch; fence posts ring the camp at ~4 m with no post inside the entrance half-angle and ≥ 14 posts / ≥ 24 rails; duplicate fence/torch rejected; torch at the left offset; torch and a fire-at-camp both make `campIsLit()` true; exactly one standing light registered.


## Timeline

- time: 2026-09-14T23:43:42
  kind: decision
  summary: "Created this page: M3 — Camp fence + camp light/fire integration"
  source: M3 implementation session 2026-09-14
  affects: [m3-camp-fence-light]

- time: 2026-09-14T23:43:42
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: M3 implementation session 2026-09-14
  affects: [m3-camp-fence-light]
