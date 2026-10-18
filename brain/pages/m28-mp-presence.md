---
id: m28-mp-presence
title: "M28 - Multiplayer player presence + movement rendering"
category: decision
status: active
tags: [multiplayer, rendering, presence]
created: "2026-10-18T06:07:57"
updated: "2026-10-18T06:08:18"
---

<!-- compiled_truth -->
M28 shipped `f0f717f`: remote players relayed by the [[vivsurvivors-mp-relay]] M27 client now render in the 3D scene. Presence + movement only.

## Scope decision

**Time authority (tick bit4) is explicitly NOT M28.** It has no v1 wire payload and is deferred to M29 ‒ it would require a ServerBase plugin change + shared struct change, so M28 kept the wire format untouched. M27's "reserved for M28" presence rendering is done; the rest of the M27 reservation list stands (edits M29, animals M30).

## Client presence rendering (index.html)

One new null-guarded block, inert without `?mp=` (zero new `Math.random`, single-player stays bit-identical):

- The `?mp=` block now **captures** `attachMultiplayer`'s return value into module-scope `mpApi` (previously declared-but-discarded); `mpAvatars` Map (publicId -> avatar state) + `makeMpAvatar(id)` build a boxy humanoid mirroring the local rig (shared 256x48-canvas name tag as a `THREE.Sprite`, texture `needsUpdate` only on name change).
- Shirt color: 10-color palette indexed by `((id * 0x9E3779B1) >>> 0) % 10` ‒ deterministic per publicId, zero rng.
- `mpRemotesFrame(dt)` is called from ONE new guarded line in `frame()`. Per-frame contract:
  - first sight **SNAPS** to the tick transform (never lerps from origin);
  - then smooth lerp `k = 1 - exp(-dt*15)` on x/y/z + shortest-arc yaw (`atan2(sin d, cos d)` ‒ no long-way spins);
  - a jump >30 u snaps (rejoin case);
  - avatars are diffed against `mpApi.remotes` each frame: ids dropped from a tick are removed from the scene;
  - everything hides while not `connected()`.
- Names arrive in a later tick than the first player section, so tags are drawn lazily on name change and shown once a name exists.

## lib/mp.js addition

The previously declared-but-never-set `joined` flag is now set on `MSG_JOIN_SUCCESS` / cleared on `ws.onclose`, and the API gains `connected(): joined && ws OPEN` ‒ the single presence visibility gate for the render layer.

## Verification (durable pattern)

- Offline: new M28 smoke block in `smoke/run.mjs` (three-stub gains Sprite/SpriteMaterial/CanvasTexture) drives the full presence cycle through FakeWS + buildTick: guard inert single-player, snap-not-origin, 60-frame convergence on the SHORT yaw arc, name-tag update, >30 u jump snap, departed-id removal, disconnect hides + `connected()` false; M27's "0 WebSocket constructions without `?mp=`" invariant still passes.
- Live: headless **3-client Node E2E** (undici WebSocket, `NODE_TLS_REJECT_UNAUTHORIZED=0`) against the real built relay on wss://localhost:3003 ‒ all three `attachMultiplayer` clients each saw the other two in `remotes` with correct names + finite transforms in <0.5s, i.e. the "3 tabs see the same connected players" gate at the data level (host has no browser; the render layer is covered by the smoke block). Same no-chrome-on-host precedent as M27.


## Timeline

- time: 2026-10-18T06:07:57
  kind: decision
  summary: "Created this page: M28 - Multiplayer player presence + movement rendering"
  source: "brain sync pass: commit f0f717f"
  affects: [m28-mp-presence]

- time: 2026-10-18T06:08:18
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: "brain sync pass: commit f0f717f (M28)"
  affects: [m28-mp-presence]
