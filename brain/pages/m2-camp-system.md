---
id: m2-camp-system
title: "M2 — Camp: build spot + basic structures"
category: decision
status: active
tags: [camp, building, shelter, bed, respawn]
created: "2026-09-14T23:10:35"
updated: "2026-10-17T14:36:48"
---

<!-- compiled_truth -->
## What shipped (M2 — camp build spot + simple structure placement)

- **Camp spot selection**: `H` establishes a single camp at the player position, only where `campCheck(x, z)` passes: dry land (h ≥ 0.9, h ≤ 20), slope ≤ 1.6 within a 5×5 grid of ±2 m, clearance from palms ≥ 2.2 m, big trees ≥ 2.8 m, rocks ≥ 2.2 m. The context hint (`H — make camp here`) only appears on valid ground; invalid attempts toast the specific reason. One camp only (`camp` object: `{x, z, g, rot, grp, flag, structures}`).
- **Basic structures**: placed at fixed offsets relative to the camp's stored facing (`rot` at establishment): shelter `J` → right 2.6 m, bed `K` → front 2.4 m; both rotated to face the camp centre. Build requires the player within 10 m of camp; each structure builds once, no rebuild, no removal.
- **Respawn at camp**: death → respawn now wakes at the camp when one exists (full stat refill, carried inventory lost — same M1 semantics); falls back to the spawn beach only before any camp exists.
- **Surfacing**: HUD gains a `⛺` line (camp state + built structures); journal learnings `camp` / `shelter` / `bed`; help card lists `H · J · K`.

## Alternatives considered

- Multiple camps, free-form structure placement, rebuild/teardown: deferred. Fixed-offset, one-per-type placement is the smallest system that makes the camp real, is smoke-testable, and gives M3 (fence) a defined camp perimeter to work with.
- Camp as a separate scene/world area: rejected — camp is objects in the existing world, grounded per-tile via `heightAt`.

## Rationale

The camp is the anchor for M3 (fence + camp light/fire), M4 (safe sleep needs a valid camp) and M5/M6 (tigers threaten the camp at night). A single, validated, grounded camp with deterministic structure offsets is the minimal contract those milestones can build on.

## Blast radius

- Respawn behavior changed (camp-aware) — covered by smoke test (pre-camp respawns ashore, post-camp respawns at camp).
- Keys `H`, `J`, `K` reserved.
- New world objects: camp pad + flagpole + flag group, shelter group (A-frame thatch lean-to), bed group (driftwood frame + mattress + pillow).
- `contextHint` now also runs `campCheck` per frame — heightAt grid over 25 samples, negligible.

## Smoke coverage (`smoke/run.mjs` → `SMOKE_OK`)

Camp rejected in water; valid-site search; placement at player position, grounded, facing stored rotation; one-camp guard; shelter/bed at camp offsets; duplicate-build rejection; death → respawn at camp.


## Timeline

- time: 2026-09-14T23:10:35
  kind: decision
  summary: "Created this page: M2 — Camp: build spot + basic structures"
  source: M2 implementation session 2026-09-14
  affects: [m2-camp-system]

- time: 2026-09-14T23:12:10
  kind: decision
  summary: "M2 shipped: camp spot selection (H, campCheck validity), fixed-offset shelter/bed structures (J/K), camp-aware respawn; smoke + headless render verified"
  source: M2 implementation session 2026-09-14
  affects: [m2-camp-system]

- time: 2026-10-17T14:35:38
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m2-camp-system]

- time: 2026-10-17T14:36:48
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m2-camp-system]
