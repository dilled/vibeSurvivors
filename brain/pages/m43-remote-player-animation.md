---
id: m43-remote-player-animation
title: "M43 ‒ MP remote-player animation: 3-bit action enum in the state byte + procedural walk/pose layer on remote avatars"
category: decision
status: active
tags: [m43, multiplayer, protocol, rendering, verification]
created: "2026-10-25T14:55:50"
updated: "2026-10-25T14:56:25"
---

<!-- compiled_truth -->
M43 (`c581d67`) makes MP remote players visibly animate instead of sliding boxes: remote avatars get a procedural walk cycle + one-shot attack/interact poses, driven from a 3-bit action enum packed into the existing state byte. Both the wire and rendering change ride entirely on the existing v3 machinery ([[v3-server-authoritative]], [[m42-mp-shared-world-visibility]]) ‒ no new message types, no wire growth (`STATE_BYTES` stays 21, tick budget unchanged), zero server parse change.

## Protocol: state byte 20 gains a 3-bit action enum (bits 2-4)

State byte 20 layout is now: bit0 underwater (pre-existing), bit1 held spear ([[m42-mp-shared-world-visibility]]), **bits 2-4 = 3-bit action enum**, bits 5-7 reserved. This repurposes bits M42 had reserved for poses.

- Enum (`lib/mp.js` `STATE_ACTION_*`, shifted by `STATE_ACTION_SHIFT = 2`, field mask `0x1c`): `0 IDLE, 1 WALK, 2 RUN, 3 ATTACK, 4 INTERACT, 5 SLEEP`. SLEEP is in the enum per the M43 spec but the client never sends it (sleep is instant) and the renderer treats it as idle.
- `STATE_HELD_MASK` narrowed from M42's `0x7e` to `0x02` (bit1 only) ‒ "held bits 1-7" no longer exists; bit1 is the only held-item bit.
- `attachMultiplayer` gains an `action` option (callback returning the enum); `buildState` ORs `action << 2` into byte 20; the tick parse exposes `p.action` per remote alongside `p.held`.
- The server relays the byte opaquely (memcpy passthrough) ‒ **zero server parse change, no wire growth**.

## Client action source (index.html)

The `action()` attach option reports, in priority order: `spearSwing > 0` to ATTACK; `interactT > 0` to INTERACT (a 0.45 s one-shot timer set by the E / eat keys, decayed in `frame()`); moving (land walking or raft rowing, mirrored per-frame into `mpLocalMoving`) to RUN when Shift is held, else WALK; otherwise IDLE. One-shots ride over the movement state (attack/interact are sent while walking) ‒ matching the local pose math.

## Rendering: pose layer on top of the untouched transform lerp

- `makeMpAvatar` limbs became **pivot groups** (hip pivots at y 0.75, shoulder pivots at y 1.65; mesh children offset -0.375 / -0.33 so resting geometry stays identical to the old boxes). The M42 held spear is now a child of the armR pivot (y re-compensated 0.3 to -0.63) and swings with the arm.
- `mpRemotesFrame` gained a pose pass that is **purely additive on top of the M28 transform lerp**: it writes only limb rotations + a one-shot body lean (`grp.rotation.x`), never position or yaw, so animation can never desync the lerp.
- The walk phase is **receiver-derived** from the observed lerped speed (intentionally NOT wire-synced); legs swing anti-phase, arms at 0.6x. Idle blend is an exponential ease back to rest; ATTACK / INTERACT are rising-edge one-shots (0.35 s arm swing reusing the local-rig swing math; 0.45 s forward lean) that retrigger when the action bit repeats. First sight adopts the action instantly (no blend from rest).
- SLEEP renders as idle (sleep is instant in this game).

## Single-player invariant

Untouched: the action option is only built/sent inside the mp attach, the pose pass lives in the null-guarded `mpRemotesFrame`, `interactT` drives only the mp action, zero new rng / `Math.random`.

## Verification

- `smoke/run.mjs` M43 block: state byte 20 encoding across all six enum values (idle+spear to 0x02 up to sleep+spear to 0x16; frame stays `[26][21B]`), `p.action` / `p.held` parse, pivot-group structure (hip/shoulder pivots, spear child of armR), walk swing (anti-phase legs), attack arm swing, interact lean, idle blend settling to rest, and the pose layer never writing avatar position/yaw.
- `smoke/e2e-players.mjs` case (f): tab A's WALK stamp (state byte 0x04) relayed byte-identically to B/C while B/C action bits stay 0 ‒ the opaque-relay contract at the data level.

## Status / follow-ons

M43 is done; the last post-v3 follow-on remaining is **M44** (vegetation placement ground-clamp / canopy-alignment fix, keeping placement deterministic).

Related: [[m42-mp-shared-world-visibility]], [[m41-v3-integration-pass]], [[v3-server-authoritative]], [[m28-mp-presence]], [[m38-server-player-authority]].


## Timeline

- time: 2026-10-25T14:55:50
  kind: decision
  summary: "Created this page: M43 ‒ MP remote-player animation: 3-bit action enum in the state byte + procedural walk/pose layer on remote avatars"
  source: "brain sync pass: commit c581d67 (range 533f356..c581d67)"
  affects: [m43-remote-player-animation]

- time: 2026-10-25T14:56:25
  kind: decision
  summary: "M43 landed (c581d67): 3-bit action enum (idle/walk/run/attack/interact/sleep) in state byte 20 bits 2-4 repurposing M42's reserved bits (STATE_HELD_MASK narrowed to 0x02), zero server parse change, no wire growth; remote avatar limbs became pivot groups with a procedural walk cycle + one-shot attack/interact pose layer purely additive on the untouched transform lerp; single-player bit-identical, smoke M43 block + e2e-players case (f) green"
  source: "brain sync pass: commit c581d67 (range 533f356..c581d67)"
  affects: [m43-remote-player-animation]
