---
id: m4-sleep-system
title: "M4 — Sleep system + night survival loop"
category: decision
status: active
tags: [camp, sleep, night]
created: "2026-10-17T16:34:32"
updated: "2026-10-17T16:34:59"
---

<!-- compiled_truth -->
## What shipped (M4 — sleep + night survival loop)

- **Sleep (`Z`)**: carries the night at a valid camp. Gate (`sleepCheck()`, all required): camp established, player within 10 m of camp centre, a bed structure exists (`K`), and `campIsLit()` (torch `N` or a fire within 8 m — M3 contract). Each failure rejects with a toast reason; **a rejected sleep must not advance the clock** (smoke-invariant).
- **Clock jump**: `gameMin` advances so the day phase lands exactly at dawn (`p = 0.05`, ~06:30). No per-frame night simulation — the night is a single deterministic jump.
- **Resting costs**: thirst and hunger drain at **half rate** for the night's real-time duration (`dp*1800/1.2` seconds at the 1.2 game-sec/real-sec rate), clamped at 0.
- **Rest recovery**: health +30 (cap 100) — rest restores but does not full-heal; the player still manages food/water across nights.
- **Wake position**: rig is placed on the bed's fixed camp offset (`campOffsets('bed')`, grounded via `heightAt`).
- **Surfacing**: context hint offers `Z ‒ sleep until dawn` at night (`dayFactor < 0.25`) when bed + lit camp exist; help card row added; journal learning `sleep`.

## Alternatives considered

- Proximity-to-bed gate: rejected — the 10 m camp-radius gate matches M2/M3 build rules and keeps `sleepCheck()` as a pure state check on camp + position.
- Simulating the night frame-by-frame (with danger exposure): rejected — the jump keeps sleep deterministic and smoke-testable; night danger belongs to the M5/M6 creature loop, which sleep opts out of by design.

## Rationale

M4 closes the night survival loop: the M3 lit-camp contract (`campIsLit()` + bed) is exactly the "valid camp conditions" sleep gates on. Sleeping is the safe opt-out of the night; the tiger (M5) and night-1 balancing (M6) make staying awake the risky choice, so sleep cost/recovery numbers are the first real night-economy balance knobs.

## Blast radius

- Key `Z` reserved.
- Reuses `camp.structures.bed`, `campIsLit()`, `campOffsets('bed')` — no new camp structure.
- New module state: `sleepCheck`, `actSleep`.
- Smoke now asserts: rejection far from camp / in the dark / with no bed; rejected sleep leaves `gameMin` untouched; valid sleep lands phase at dawn, applies the exact half-rate thirst/hunger cost and +30 health, wakes on the bed, and the sun is up afterwards.


## Timeline

- time: 2026-10-17T16:34:32
  kind: decision
  summary: "Created this page: M4 — Sleep system + night survival loop"
  source: "M4 implementation session; shipped 9d96547"
  affects: [m4-sleep-system]

- time: 2026-10-17T16:34:51
  kind: decision
  summary: "M4 shipped: Z sleep at a lit camp bed jumps the clock to dawn; resting stats at half rate, rest restores +30 health; wake on the bed"
  source: "M4 implementation session; shipped 9d96547"
  affects: [m4-sleep-system]

- time: 2026-10-17T16:34:59
  kind: evidence
  summary: "M4 shipped in 9d96547: actSleep/sleepCheck in index.html, help card Z row, dawn context hint, smoke/run.mjs M4 block"
  source: git 9d96547594477f68ddb90c6ee26b56e69e81421b
  affects: [m4-sleep-system]
