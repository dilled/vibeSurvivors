---
id: m42-mp-shared-world-visibility
title: "M42 ‒ MP shared-world visibility: fires as world edit kind 8 + held-spear flag in the state byte"
category: decision
status: active
tags: [m42, multiplayer, world-state, protocol, verification]
created: "2026-10-25T14:30:57"
updated: "2026-10-25T14:56:51"
---

<!-- compiled_truth -->
M42 (`8fbf7c3`, server half separately in ServerBase `720f7ee`) closes the first post-v3 follow-on from the M41 M42-M44 list ([[m41-v3-integration-pass]]): **remote players' placed objects + held items become visible on other clients**. Both gaps were closed riding the existing v3 machinery ([[v3-server-authoritative]]) ‒ no new message types, no new wire fields beyond repurposing reserved bits, no perf-budget change (steady relay tick stays 1310 B).

## Gap 1: fires became a shared-world edit (kind 8)

Before M42 the G-key fire was **local-only** ‒ the one remaining player world mutation not in the shared edit stream. It is now the **9th world edit kind (kind 8)**:

- Payload `f32 x, f32 z` (entityIndex 0). `actFire` emits `mpEmit(8, ...)` after `makeFire` (a no-op in single-player).
- Server-validated exactly like all M39 edits: WorldStore `fires_` + cap 5 + height gate; accepts relay byte-identically, rejects to the sender alone.
- Relayed, persisted to the world store, and EDIT_SYNC-replayed by the existing M29/M39/M40 machinery with zero new server plumbing.
- Determinism: zero new rng. The zero-rng flicker **phase is derived from position** (`makeFire` gained an optional phase arg), and `(x,z)` dedup within 1e-3 makes EDIT_SYNC replay a no-op, preserving the set-semantics/idempotent-replay contract of `mpApplyWorldEdit`.
- Implementation note (durable for future kinds): the kind-8 branch sits BEFORE the structure mapping (kind 8 used to fall through to `'raft'`), and a `kind > 8` guard bounds the mapper ‒ new kinds must extend the kind table deliberately.

## Gap 2: held-spear flag in the state byte

- Packed into **state byte 20, bit1** (bit0 = the pre-existing underwater bit; **bits 2-7 were reserved for M43 poses** (M43 repurposed **bits 2-4 as the 3-bit action enum** ‒ see [[m43-remote-player-animation]] ‒ leaving only bits 5-7 reserved)). `STATE_BYTES` stays 21; the server relays the byte opaquely (memcpy passthrough) ‒ **zero server parse change**.
- `lib/mp.js` exports `STATE_HELD_SPEAR` / `STATE_HELD_MASK` (0x7e at the time; M43 later narrowed the mask to 0x02 since bit1 is the only held-item bit); `attachMultiplayer` takes a `held` option, `buildState` ORs the held bits into byte 20, and the tick parse exposes `p.held` per remote (self-capture unchanged ‒ the own spear is still rendered locally).
- Client (`index.html`): the attach option is `held: () => (spear ? MP_HELD_SPEAR : 0)`; `makeSpearGroup()` was extracted and is shared with the local `spearMesh`; remote avatars carry a spear group on `armR`, and `mpRemotesFrame` drives `av.spear.visible` from `p.held` every tick.

## Single-player invariant

Untouched: `actFire` emits nothing without `?mp=`, the held flag is only built/sent inside the mp client, and the SP smoke gate stays silent. No new `Math.random` anywhere.

## Verification

- `smoke/run.mjs` M42 block: held bit present in the 21 B state frame, `p.held` parse + own-entry shape, kind-8 apply/dedup/deterministic phase, avatar spear follows the bit, `actFire` emits kind 8 when connected, SP silent.
- `e2e-edits.mjs`: a valid fire relayed byte-identical to all 3 tabs; an underwater fire rejected (sender only); the 6th fire rejected (cap 5).
- `e2e-players.mjs`: A's held-spear stamp (state byte 2 of the players section) relayed byte-identical to B/C, with B/C keeping their own bits.
- `e2e-restart.mjs`: the fire edit persists in the world store (113 B store) and replays across a server restart; e2e-world / e2e-animals / e2e-weather / e2e-play / e2e-perf all re-verified unchanged (tick budget still 1310 B).

## Status / follow-ons

M42 is done, and **M43** (remote-player procedural animation, `c581d67`) has since landed using those reserved bits ‒ see [[m43-remote-player-animation]]. The remaining post-v3 follow-on is **M44** (vegetation placement ground-clamp/canopy-alignment fix keeping placement deterministic).

Related: [[v3-server-authoritative]], [[m29-mp-world-state]], [[m39-server-edit-validation]], [[m40-zero-client-authority]], [[m41-v3-integration-pass]], [[m43-remote-player-animation]].


## Timeline

- time: 2026-10-25T14:30:57
  kind: decision
  summary: "Created this page: M42 ‒ MP shared-world visibility: fires as world edit kind 8 + held-spear flag in the state byte"
  source: "brain sync pass: commit 8fbf7c3 (range 9658e72..8fbf7c3)"
  affects: [m42-mp-shared-world-visibility]

- time: 2026-10-25T14:31:25
  kind: decision
  summary: "M42 landed: fires became the 9th world edit kind (kind 8, server-validated + relayed/persisted/EDIT_SYNC-replayed) and the held-spear flag packed into state byte 20 bit1 (STATE_BYTES stays 21, zero server parse change); remote avatars carry the spear; single-player unaffected; smoke + e2e gates green, tick budget unchanged at 1310 B"
  source: "brain sync pass: commit 8fbf7c3 (range 9658e72..8fbf7c3)"
  affects: [m42-mp-shared-world-visibility]

- time: 2026-10-25T14:56:51
  kind: decision
  summary: "M43 landed (c581d67): the state byte's M42-reserved bits 2-7 became a 3-bit action enum (bits 2-4) in M43, so only bits 5-7 stay reserved and STATE_HELD_MASK narrowed to 0x02; M43 is now done, M44 remains the last post-v3 follow-on"
  source: "brain sync pass: commit c581d67 (range 533f356..c581d67)"
  affects: [m42-mp-shared-world-visibility]
