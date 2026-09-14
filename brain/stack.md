---
slug: stack
title: Tech stack
role: tech-stack choices
updated: "2026-09-14T18:41:07"
---

# Tech stack

> Provisional — from PLAN.md §9 (Tech), before any code exists.

| Domain | Choice | Rationale |
|---|---|---|
| Rendering | Three.js **r0.158**, vendored in `lib/` | House pattern (vibeGTA / vibeCraft); no build step, no npm, no internet needed |
| Client shape | Single `index.html` + `game.js` | House pattern; open-and-play |
| Perspective | 2.5D: 3D low-poly world, fixed oblique third-person camera, no free-look/aim | "2.5D" feel, simple controls, performance headroom |
| World gen | Deterministic seeded: 3–5 hand-authored layout archetypes + randomized interior | Art control + server world-sync convergence later |
| Animal AI | Per-species finite state machine + small **alarm bus** (scream/alert/attack/flee events) | Simple, debuggable; 10 species |
| Audio | WebAudio, generated/short clips, no asset pipeline | No build step constraint; audio carries the night fear |
| Save | localStorage, JSON snapshot at camp + night transition (single-player) | House pattern (vibeCraft local saves) |
| Multiplayer (later, M7) | `VibeSurvivorsPlugin` in `../ServerBase` (C++20, uWebSockets, zlib/lz4) | House pattern: first client is world-authority, ~30 Hz tick relay, full edit-history resend on join, `?mp=host:port` |
