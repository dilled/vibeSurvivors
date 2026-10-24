---
id: vivsurvivors-mp-relay
title: "M27 - VibeSurvivors multiplayer: ServerBase relay plugin + thin ?mp= client (protocol v1)"
category: decision
status: active
tags: [multiplayer, protocol, serverbase]
created: "2026-10-18T05:02:17"
updated: "2026-10-24T16:23:26"
---

<!-- compiled_truth -->
## Relay model (no server simulation)

M27 ships the `VibeSurvivorsPlugin` in `../ServerBase` (branch `feat/vibecraft-server-authoritative`) + a thin client in this repo. The server **relayed only**: it did not simulate the island. Joins are seed-validated (seed must be 1337). **Authority** = the first-joined client whose state was uploaded fresh (<5000 ms); its publicId is broadcast in every tick. One identical 30 Hz tick packet went to all clients. Since M29 (`415fe12`, paired with ServerBase `ca10512`) the relay also carried the full shared world state: world edits (bit1 + `MSG_VIVS_EDIT_SYNC` 30 catch-up) and the authority's clock (bit4 + `MSG_VIVS_TIME` 32) ‒ see [[m29-mp-world-state]]. Since M30 (`3fdb625`) the relay also carried the authority's animal snapshot (bit2 + `MSG_VIVS_ANIMALS` 29) ‒ see [[m30-mp-animals]]. **Since M33 the relay model is superseded as milestones land**: the protocol hard-bumped to **v2** (join `playerId|2|seed`; the server refuses any non-v2 join before the seed check) and the server now owns the island placement (type 33 `MSG_VIVS_WORLD` block sent one-shot on every (re)join) and will own the animal sim ‒ see [[v3-server-authoritative]]. Everything below is the relay-era wire contract, still valid protocol history.

## Protocol v1/v2 (wire facts)

- Transport: WSS, port **3003**, self-signed CN=localhost cert (no SAN ‒ headless Node works with `NODE_TLS_REJECT_UNAUTHORIZED=0`; browser nag is a human-gate detail).
- Join: ServerCore house pattern ‒ send `[3] + utf8 "<uuid>|<ver>|1337"`; version is **2** since M33 (was 1; the server refuses v1). Success = type **8** with u32 publicId **big-endian**; error = type **255** utf8.
- `MSG_VIVS_STATE` (26, c2s): `[26] + VivsPlayerState` (21 B LE: u32 publicId, f32 x,y,z,yaw, u8 state bit0=underwater). Server overwrites the client's publicId; `stateIsPlausible` sanity check (|x|,|z|<=320, y in [-5,40], speed <=12 u/s).
- `MSG_VIVS_TICK` (27, s2c): `[27][u8 flags][u32 authorityPublicId LE]` then **flag-driven sequential sections in fixed order**: bit0 players (`u32 tickId, u32 count, count*21B`), bit1 edits (`u32 count, count*23B` ‒ live since M29), bit2 animals (`u32 count, count*24B` ‒ live since M30), bit3 names (`u32 count, then (u32 id, u32 len, utf8)`), bit4 time (`f32 gameMin LE` ‒ the authority's clock, live since M29). A client MUST consume every set section in order, reading the count prefix even when skipping reserved ones, or the offset walk desyncs.
- `MSG_VIVS_EDIT` (28, c2s): `[28] + VivsWorldEdit` (23 B LE: u32 publicId, u32 entityIndex, u8 kind, u8 action, 12 B kind-specific payload; camp = 3xf32).
- `MSG_VIVS_ANIMALS` (29, c2s): `[29][u32 count][count * 24B animal]` (authority upload, M30; animal 24 B LE: `u16 slot, u8 type, u8 flags, f32 x,y,z,yaw, u8 state (bit0 dead), 3 pad`). The server double-gates it (authority + plausibility) and re-broadcasts it in tick bit2.
- `MSG_VIVS_NAME` (31, c2s): `[31] + utf8 name`.
- `MSG_VIVS_EDIT_SYNC` (30, s2c): `[30][u32 count][count*23B edit]` ‒ the full edit-history catch-up, delivered to late joiners as a one-shot tick packet (M29; authority-gated history on the server).
- `MSG_VIVS_TIME` (32, s2c): `[32] + f32 gameMin LE` at 30 Hz (authority clock, M29).
- `MSG_VIVS_WORLD` (33, s2c, M33): the server-owned island placement block ([u32 seed][palms 6xf64][trees 11xf64][rocks 5xf64][species: u16 keyLen, utf8 key, u32 ptCount, 3xf64 x,z,h], all LE), sent one-shot on every (re)join ahead of the type-30 catch-up. Full layout + generation contract: [[v3-server-authoritative]].
- Everything little-endian **except** the `MSG_JOIN_SUCCESS` publicId (big-endian).

## ServerBase router bug found during M27

`ServerCore/src/MessageRouter.cpp` (pre-existing, not part of the scaffold) had **no cases** for `MSG_VIVS_STATE`/`MSG_VIVS_NAME` and its validity bound was `MSG_GTA_WORLD_SYNC` (25), so **every** VIVS message was rejected before reaching the plugin. Fixed: added both cases (state checks `payload.size() == sizeof(VivsPlayerState)`) and raised the bound to `MSG_VIVS_NAME` (31). M29 extended the same router with the edit/time cases (ServerBase `ca10512`); M30 added the animals case 29 + the authority-gated store/relay in `VivsModule`; M33 added the case 33 (`MSG_VIVS_WORLD`) and raised the bound again. Without these fixes the plugin relays nothing. Deployment caveat: the `Server.cfg` parser chokes on inline comments (a silently defaulted port 3000 was traced to commented-out lines in the deployed gitignored copy) ‒ keep Server.cfg comment-free.

## Client (this repo)

`lib/mp.js` exports `attachMultiplayer({rig, url, seed, displayName, inWater, gameMin, onTick, onEdit, onEditSync, onTime, animals, onAnimals, onWorld})`: ws connect/join (since M33 it speaks **protocol v2**: `playerId|2|seed`, `PROTOCOL_VERSION = 2` hard bump), name send, 30 Hz state + clock upload (clock only when a `gameMin` getter is wired; since M30 the `animals` getter's roster is appended to the loop only when `isAuthority()`), tick parsing (all five sections, fixed offset walk, bit2 now a real parse into the slot-keyed `animals` Map), `remotes` Map, `sendEdit(kind, entityIndex, payload12)`, `isAuthority()`, reconnect backoff (1s x1.6, cap 10s), HUD status line. Since M28 the API also exposes `connected()` (joined && ws OPEN) as the presence visibility gate; since M29 it dispatches bit-1 edits to `onEdit`, handles `MSG_VIVS_EDIT_SYNC` via `onEditSync`, and bit-4 via `onTime`; since M33 it parses type 33 (`parseVivsWorld`) into the `onWorld` callback and exposes a `world` getter holding the last placement block (the server re-sends it on every (re)join, so it is always current) ‒ the input the M34 client-side world build consumes. `index.html` has ONE guarded block: `?mp=host:port` (or full wss://) triggers the name prompt (localStorage `vsvName`, empty = random) + `import('./lib/mp.js')`, and captures the returned API into module-scope `mpApi`; the M28 layer renders presence and the M29 layer wires `onEdit`/`onEditSync` into a deterministic `mpApplyWorldEdit`, `onTime` into clock adoption, and locks followers out of world mutations; the M30 layer wires `onAnimals` into the snapshot-overwrite frame pass. Without `?mp=` the module never imports it ‒ single-player stays bit-identical (smoke stub `location.search=''` never touches it; the smoke blocks prove the client code path + assert WebSocket stays unused in single-player).

## Shipped / reserved for later

M28 shipped: presence rendering (remote avatars + name tags from `remotes`) ‒ [[m28-mp-presence]]. M29 shipped: shared deterministic world state ‒ world edits + authority clock, full edit-history catch-up for late joiners, follower mutation lock-out ‒ [[m29-mp-world-state]]. M30 shipped: animals ‒ the authority's full animal roster relayed on tick bit2, follower snapshot overwrite, events-carrying transforms ‒ [[m30-mp-animals]]. M31 shipped: reconnect hardening + the 3-tab no-divergence gate (`5701e4b`) ‒ the client's 30 Hz state upload is the server's **only** authority-liveness signal, so the `MSG_JOIN_SUCCESS` handler restarts the uplink (`if (sendTimer === 0) sendStateLoop()`, idempotent; the one client-side gap was that the loop started exactly once at attach and `ws.onclose` cleared the interval, leaving the uplink dead after any real reconnect); the server side was already complete (full type-30 `EDIT_SYNC` replay on every (re)join, the 30 s grace window keeps the join-order position so the original authority returns, authority = first join-order client with state fresh <5 s re-evaluated every tick). The 3-tab render gate stays human-operated: https://localhost:3003/?mp=localhost:3003. M33 shipped (v3 transition begins): server `genIsland(seed)` byte-identical to the client's deterministic generation, protocol **v2** hard bump (server refuses v1 joins), type-33 placement block on (re)join, in-memory world store; client parses type 33 into `mpApi.world` ‒ [[v3-server-authoritative]].

## Known v1 limitations (documented, not fixed)

- The server keeps a departed client's last state in the tick for the 30 s reconnect grace (no 'left' flag).
- A **server restart** wipes the edit history while clients keep their applied edits (server-restart resilience is the M40 item, see [[v3-server-authoritative]]).
- A follower's local-only animal interactions are transient (33 ms re-assert).


## Timeline

- time: 2026-10-18T05:02:17
  kind: decision
  summary: "Created this page: M27 - VibeSurvivors multiplayer: ServerBase relay plugin + thin ?mp= client (protocol v1)"
  source: M27 session
  affects: [vivsurvivors-mp-relay]

- time: 2026-10-18T05:02:54
  kind: decision
  summary: "M27 shipped: plugin builds + ?mp= client connects end-to-end against the real server; record the relay model, protocol v1 wire facts, the ServerBase router bug found, and what is reserved for M28-M30"
  source: brain update-truth
  affects: [vivsurvivors-mp-relay]

- time: 2026-10-18T06:08:35
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: "brain sync pass: commit f0f717f (M28)"
  affects: [vivsurvivors-mp-relay]

- time: 2026-10-18T07:36:54
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [vivsurvivors-mp-relay]

- time: 2026-10-18T08:31:42
  kind: decision
  summary: "M30 shipped: tick bit2 animals relay live (MSG_VIVS_ANIMALS 29 added to protocol list; router extended with case 29; M30 moved to shipped)"
  source: "brain sync pass: commit 3fdb625 (M30)"
  affects: [vivsurvivors-mp-relay]

- time: 2026-10-18T08:32:00
  kind: decision
  summary: "Correction: attachMultiplayer M30 options are the animals getter + onAnimals callback"
  source: "brain sync pass: commit 3fdb625 (M30)"
  affects: [vivsurvivors-mp-relay]

- time: 2026-10-24T16:59:43
  kind: reversal
  summary: "Pivot: user directed the server is master of everything (animals, players, trees locations/rotations). The v2 first-client-authority relay model is superseded by the v3 server-authoritative model (previously 'future, NOT now'); see [[v3-server-authoritative]]. Relay-era protocol facts remain valid wire history."
  affects: [vivsurvivors-mp-relay]

- time: 2026-10-24T14:42:32
  kind: decision
  summary: "M31 shipped: client uplink restart on MSG_JOIN_SUCCESS (state uploads are the server's authority-liveness signal); documented known v1 limitations (departed-state 30s grace hold, server-restart edit-history wipe, transient follower animal interactions)"
  source: "brain sync pass: commit 5701e4b (M31)"
  affects: [vivsurvivors-mp-relay]

- time: 2026-10-24T16:23:26
  kind: decision
  summary: "M33 sync: protocol hard-bumped to v2 (join playerId|2|seed, server refuses v1), type 33 MSG_VIVS_WORLD placement block on (re)join added to wire facts, router case 33 noted, client now parses type 33 into onWorld/world getter; relay-era facts re-framed as history"
  source: "brain sync pass: commit 5249907 (M33 client side, range 0fce8c1..5249907)"
  affects: [vivsurvivors-mp-relay]
