---
id: m39-server-edit-validation
title: "M39 ‒ Server applies + validates world edits against its world store"
category: decision
status: active
tags: [m39, multiplayer, server-authority, edits, world-store]
created: "2026-10-25T11:40:37"
updated: "2026-10-25T11:41:05"
---

<!-- compiled_truth -->
What was decided: from M39 the server is the **single source of truth for world
edits** too (not just player transforms, [[m38-server-player-authority]]). The
plugin keeps an in-memory, deterministic **WorldStore** (palms, plants, camp,
structures) derived from the seed at startup, and validates every
MSG_VIVS_EDIT (type 28) against it BEFORE relaying. This is the "world edits"
side of the [[v3-server-authoritative]] pivot.

How it works (ServerBase, feat/vibecraft-server-authoritative):
- **WorldStore.{hpp,cpp}**: authoritative store + a bit-exact C++ port of the
  client plant-growth math (rainFrac + windDrop, 8-iteration fast-forward),
  per-kind edit validation (palm charge, plant charge, camp, structures), and
  camp/structure placement rules (terrain gates + a 10u camp radius measured
  from the SENDER'S last ACCEPTED/stamped transform, not a local rig).
- **VivsModule**: MSG_VIVS_EDIT is routed authority-gate-first (the M29 gate is
  kept: non-authority edits are dropped, no reject), THEN validated. Accepts are
  applied to the store, stamped with the server publicId, and relayed
  byte-identically. Rejects are delivered to the sender ALONE over a new
  **MSG_VIVS_EDIT_REJECT (type 34)** = [u8 34][23B stamped edit][u16 len LE]
  [utf8 reason]; the type-34 is queued on the sender's per-player pending
  queue (<=1 tick latency). Rejected edits NEVER enter pendingEdits/editHistory,
  so they are never relayed and never replayed to a late joiner.
- **onTick** advances the store each tick (windDrop + plant growth), so charges
  stay authoritative between edits.
- **Type 34 is additive**: protocol v2 is otherwise unchanged; an old client
  that never learns type 34 simply ignores the unknown type (it still sees the
  relayed accepts), so the reject is a pure upgrade path.

Client (vibeSurvivors):
- **lib/mp.js**: MSG_VIVS_EDIT_REJECT = 34 constant + onBinary handler that
  parses the 23B stamped edit + u16 LE reason length + utf8 reason and calls a
  new `onEditReject(pid, entityIndex, kind, reason)` option. Malformed variants
  (truncated, over-length, empty) are dropped silently.
- **index.html**: onEditReject is wired to console.warn + a "the island says no"
  toast so the player who sent the invalid edit sees it. saveGame/loadGame are
  inert in MP mode (the server owns world state).

Scope / persistence: the WorldStore is **in-memory only**; a server restart
re-derives it from the seed. Persistence across restart is M40 (see
[[v3-server-authoritative]] roadmap).

Growth bit-exactness: the server plant growth must match the client bit-exactly
or the server would false-reject valid harvests. Proven by a **ctest
byte-identity gate** (VivsWorldStoreDump) comparing the C++ dump against a
JS-reference dump over 26000 steps / 1300 game-min: BYTE-IDENTICAL.

Verification: ServerBase ctest 171/171 (incl. the growth byte-identity gate);
vibeSurvivors smoke SMOKE_OK (M39 client type-34 parse block + M38 regression);
smoke/e2e-edits.mjs E2E_OK (3 tabs: 7 valid edits relayed byte-identical, 5
invalid edits rejected with explicit reasons to the sender alone and never
relayed, follower edit dropped by the M29 gate, late joiner replays all 7
accepted edits byte-identically via type 30).

Pitfalls discovered while wiring the e2e (client-side test bugs, NOT server
bugs): (1) JS DataView.setFloat32 defaults to BIG-endian ‒ the camp payload
f32s must be written little-endian or the server reads garbage coords; (2) a
failed e2e run must close its WebSockets in a finally, else stale connections
leak server authority and later runs fail at "camp not relayed"; (3) a 100ms
state keepalive re-broadcasts a 2.5u walk step (250ms apart) as 25u/s, above
the 12u/s plausibility budget ‒ pause the keepalive during the walk and let the
walk send states itself at 10u/s with a 300ms settle before the first step.


## Timeline

- time: 2026-10-25T11:40:37
  kind: decision
  summary: "Created this page: M39 ‒ Server applies + validates world edits against its world store"
  source: created via brain create-page
  affects: [m39-server-edit-validation]

- time: 2026-10-25T11:41:05
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m39-server-edit-validation]
