---
id: m29-mp-world-state
title: "M29 - Shared deterministic world state: world edits + authority clock"
category: decision
status: active
tags: [multiplayer, world-state, protocol]
created: "2026-10-18T07:36:10"
updated: "2026-10-18T07:36:30"
---

<!-- compiled_truth -->
M29 (`415fe12`, paired with ServerBase `ca10512` on `feat/vibecraft-server-authoritative`) shipped shared deterministic world state on top of the [[vivsurvivors-mp-relay]] relay: followers now converge on the same island, not just the same player positions.

## Core model: island = f(SEED 1337, gameMin, edits)

The island is a **pure function of (shared seed, gameMin, edits)**: shared clock + shared edits = full convergence, no other shared state needed. Weather is a pure lookup of `gameMin` and plant growth is gameMin-driven, so both converge for free. The world authority (first joined client with a fresh state, per M27) uploads **every world mutation** as a 23 B edit (`lib/mp.js` `sendEdit`) plus its `gameMin` at 30 Hz (`MSG_VIVS_TIME` 32); the server relays both (tick bit1 / bit4) and **replays the full edit history** to late joiners as a one-shot `MSG_VIVS_EDIT_SYNC` (30) tick packet. Followers apply relayed edits deterministically and are **locked out of world mutations** (`mpWorldLockedGuard`, one toast on a cooldown) ‒ local-only actions (board raft, pickup, drink, cook, crab, gull egg, sleep) stay unlocked.

## Edit wire + apply contract

- `VivsWorldEdit` is 23 B LE: `[u32 publicId][u32 entityIndex][u8 kind][u8 action][12B kind payload]` (camp payload = 3xf32 x/z/rot).
- 8 kinds (0-7): 0 palm (shake/dropped-coconut count), 1 plant (harvest: chargesLeft/state/min), 2 camp (x/z/rot), 3 shelter, 4 bed, 5 fence, 6 torch, 7 raft.
- **Set semantics = idempotent replay**: `mpApplyWorldEdit` is safe to replay (EDIT_SYNC catch-up may be re-sent); a palm edit hides the dropped crown instances via the same `setM(...,9999)` pattern as `dropCoconut` WITHOUT spawning falling items; structures build their meshes at `campOffsets(type)` only if the slot is empty; a local camp wins; a plant edit mirrors the local harvest then re-emits.
- Edits carrying SELF's publicId are skipped (the authority also receives its own edits via the relay).
- **Time adoption**: a follower with a pending authority clock (`onTime` stashes `mpTimeAdopt`; the authority ignores bit4) snaps `gameMin` to it and skips the local `gameMin += dt*timeRate` for that frame; `updatePlants` already fast-forwards forward jumps and resets the plant clock on backward ones.

## Single-player invariant

All M29 code is null-guarded in `index.html` and inert without `?mp=`; zero new `Math.random`; single-player stays bit-identical.

## Verification (durable pattern)

- Offline: M29 smoke block in `smoke/run.mjs` (three-stub InstancedMesh/Matrix4 now record per-instance translations so the crown-hide is assertable): guards inert single-player, 30 Hz loop uploads state AND `[32][f32]` clock, authority `mpEmit` produces `[28][23B]` frames, a follower's `mpEmit` is silent + mutations locked, relayed palm/plant/camp/structure edits apply deterministically, an edit carrying SELF's publicId is skipped, the EDIT_SYNC history replays through the same path and stays idempotent when sent twice, bit-4 adoption snaps then resumes local advance.
- Live: headless **4-client Node E2E** (undici WebSocket, `NODE_TLS_REJECT_UNAUTHORIZED=0`) against the real built relay on wss://localhost:3003: authority sent one of each of the 8 edit kinds + 30 Hz clock; two followers converged on all 8 edits + the clock in tick bit1/bit4; late joiner received the full 8-edit EDIT_SYNC in order ‒ the "3 tabs converge on the same island/world state" gate at the data level (no chrome on host, M27/M28 precedent; the 3-tab render check is the human gate: `https://localhost:3003/?mp=localhost:3003`).

## Explicitly not M29

Animals stay M30 (tick bit2, world-authority upload). Reconnect/integration hardening is M31.


## Timeline

- time: 2026-10-18T07:36:10
  kind: decision
  summary: "Created this page: M29 - Shared deterministic world state: world edits + authority clock"
  source: "brain sync pass: commit 415fe12 (M29)"
  affects: [m29-mp-world-state]

- time: 2026-10-18T07:36:30
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m29-mp-world-state]
