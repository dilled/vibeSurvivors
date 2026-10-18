---
id: vivsurvivors-mp-relay
title: "M27 - VibeSurvivors multiplayer: ServerBase relay plugin + thin ?mp= client (protocol v1)"
category: decision
status: active
tags: [multiplayer, protocol, serverbase]
created: "2026-10-18T05:02:17"
updated: "2026-10-18T05:02:54"
---

<!-- compiled_truth -->
## Relay model (no server simulation)

M27 ships the `VibeSurvivorsPlugin` in `../ServerBase` (branch `feat/vibecraft-server-authoritative`) + a thin client in this repo. The server **relays only**: it does not simulate the island. Joins are seed-validated (seed must be 1337, protocol version 1). **Authority** = the first-joined client whose state was uploaded fresh (<5000 ms); its publicId is broadcast in every tick. One identical 30 Hz tick packet goes to all clients.

## Protocol v1 (wire facts)

- Transport: WSS, port **3003**, self-signed CN=localhost cert (no SAN ‒ headless Node works with `NODE_TLS_REJECT_UNAUTHORIZED=0`; browser nag is a human-gate detail).
- Join: ServerCore house pattern ‒ send `[3] + utf8 "<uuid>|1|1337"`; success = type **8** with u32 publicId **big-endian**; error = type **255** utf8.
- `MSG_VIVS_STATE` (26, c2s): `[26] + VivsPlayerState` (21 B LE: u32 publicId, f32 x,y,z,yaw, u8 state bit0=underwater). Server overwrites the client's publicId; `stateIsPlausible` sanity check (|x|,|z|<=320, y in [-5,40], speed <=12 u/s).
- `MSG_VIVS_TICK` (27, s2c): `[27][u8 flags][u32 authorityPublicId LE]` then **flag-driven sequential sections in fixed order**: bit0 players (`u32 tickId, u32 count, count*21B`), bit1 edits (M29), bit2 animals (M30), bit3 names (`u32 count, then (u32 id, u32 len, utf8)`), bit4 time (M28+). A client MUST consume every set section in order, reading the count prefix even when skipping reserved ones, or the offset walk desyncs.
- `MSG_VIVS_NAME` (31, c2s): `[31] + utf8 name`. IDs 28/29/30 are reserved (M29/M30) and ignored by the server; 30 = `MSG_VIVS_EDIT_SYNC` join catch-up.
- Everything little-endian **except** the `MSG_JOIN_SUCCESS` publicId (big-endian).

## ServerBase router bug found during M27

`ServerCore/src/MessageRouter.cpp` (pre-existing, not part of the scaffold) had **no cases** for `MSG_VIVS_STATE`/`MSG_VIVS_NAME` and its validity bound was `MSG_GTA_WORLD_SYNC` (25), so **every** VIVS message was rejected before reaching the plugin. Fixed: added both cases (state checks `payload.size() == sizeof(VivsPlayerState)`) and raised the bound to `MSG_VIVS_NAME` (31). Without this the plugin relays nothing.

## Client (this repo)

`lib/mp.js` exports `attachMultiplayer({rig, url, seed, displayName, inWater, onTick})`: ws connect/join, name send, 30 Hz state upload, tick parsing (players+names; reserved sections skipped per the rule above), `remotes` Map, reconnect backoff (1s x1.6, cap 10s), HUD status line. `index.html` has ONE guarded block: `?mp=host:port` (or full wss://) triggers the name prompt (localStorage `vsvName`, empty = random) + `import('./lib/mp.js')`. Without `?mp=` the module never imports it ‒ single-player stays bit-identical (smoke stub `location.search=''` never touches it; smoke M27 block proves the client code path + asserts WebSocket stays unused in single-player).

## Reserved for later

M28: presence rendering (remote avatars + name tags from `remotes`) + time authority (tick bit4). M29: world edits relay (bit1 + `MSG_VIVS_EDIT_SYNC` 30 on join). M30: animals (bit2, world-authority upload). M27 deliberately implements none of them.


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
