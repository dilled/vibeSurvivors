---
id: m30-mp-animals
title: "M30 - Multiplayer animals: authority animal snapshot relay on tick bit2"
category: decision
status: active
tags: [multiplayer, animals, protocol]
created: "2026-10-18T08:30:50"
updated: "2026-10-18T08:31:16"
---

<!-- compiled_truth -->
M30 (`3fdb625`, paired with the ServerBase commit on `feat/vibecraft-server-authoritative`) made the previously reserved tick bit2 (animals) live end-to-end on top of the [[vivsurvivors-mp-relay]] relay. Animals are shared state the same way M29 world edits are: a **relay model, not server simulation**.

## Core model: the animals ARE the events

The **world authority** owns the animal sim. It uploads its **full animal roster at 30 Hz** as `MSG_VIVS_ANIMALS` 29 (`[29][u32 count][count*24B VivsAnimalState]`; animal 24B LE = `u16 slot, u8 type, u8 flags, f32 x,y,z,yaw, u8 state (bit0 dead), 3 pad`). The server **double-gates** each upload by authority + plausibility and **re-broadcasts it whole** in the tick bit2 section. Followers **overwrite their local animals wholesale** from the snapshot every tick. Because animal events (panic, gull steals, tiger strikes) ride on the animal transforms, converging animals = converging events ‒ no separate event channel needed.

## Wire + client facts

- `VivsAnimalState` 24 B LE: `u16 slot, u8 type, u8 flags, f32 x,y,z,yaw, u8 state (bit0 dead), 3 pad`.
- **Roster determinism removes the mapping channel**: `slot = type*64 + populationIndex` with `type` = registry index; same seed => the **same roster on every client** (default world: 51 individuals across the 10 species), so the slot mapping is never transmitted.
- **Client authority gate**: `isAuthority()` = `publicId !== 0 && authorityId === publicId`; the 30 Hz loop appends the animals snapshot **only** for the authority, so non-authority tabs are silent on type-29 by construction.
- Follower side (one `mpAnimalsFrame(dt)` call per frame, the M24 anchor after `pt('animL')`): the relayed transform **wins each frame** with the M28-style lerp `k = 1 - exp(-dt*15)` applied to both the data fields and the mesh `grp` (shortest-arc yaw). A relayed **dead** hides the mesh but **never forces it visible** (local hides like crabs fleeing a hunting lizard keep working); a dead fish school is emptied (n=0) while local regrowth stays subsumed by the 33 ms re-assert.
- `index.html` wiring is a null-guarded M30 layer after the M29 layer; the authority skips it entirely (its own sim IS the truth).

## Known v1 limitation (accepted, not a defect)

A follower's **local-only animal interactions** (crab catch, spear) are **transient**: the authority snapshot re-asserts the state within 33 ms. Reconnect/integration hardening stays **M31**.

## Single-player invariant

Zero new `Math.random` (audited); everything inert without `?mp=`; all pre-existing M0-M29 smoke blocks still pass.

## Verification (durable pattern)

- Offline: M30 smoke block in `smoke/run.mjs` (M29-block style, snapshot/restore + finally cleanup) proves the full cycle: single-player inert, deterministic 51-entry roster + finite collect, non-authority sends no type-29 frames, authority frame is exactly `5 + 51*24` bytes with spot-checked entries, a follower (authorityId 111) parses bit2 with bit0 also set (section-order proof: players intact across the offset walk), and 60 `mpAnimalsFrame(0.1)` calls hide a relayed dead crab, lerp the live tiger toward the relayed position, and move a school anchor <1e-3.
- Live: headless **3-client Node E2E** against the real built relay on wss://localhost:3003: authority uploaded a 3-animal snapshot (one dead) at 30 Hz; both followers parsed the **identical 3 transforms** in bit2 with the players section intact (data-level convergence, M27/M28/M29 precedent; no chrome on host), and a **spoofed [29] from a non-authority was dropped** by the server's authority gate (log-proven).

## ServerBase deployment note

The `Server.cfg` parser does not tolerate **inline comments** (the deployed gitignored copy had some and the port silently defaulted to 3000). The deployed copy was cleaned; the tracked `VibeSurvivorsPlugin/Server.cfg` is untouched. Keep Server.cfg comment-free.


## Timeline

- time: 2026-10-18T08:30:50
  kind: decision
  summary: "Created this page: M30 - Multiplayer animals: authority animal snapshot relay on tick bit2"
  source: "brain sync pass: commit 3fdb625 (M30)"
  affects: [m30-mp-animals]

- time: 2026-10-18T08:31:16
  kind: decision
  summary: "M30 shipped: tick bit2 animals relay end-to-end (MSG_VIVS_ANIMALS 29, authority 30 Hz upload, server authority+plausibility gate, follower snapshot overwrite); record relay model, roster determinism, authority gate, v1 limitation"
  source: "brain sync pass: commit 3fdb625 (M30)"
  affects: [m30-mp-animals]
