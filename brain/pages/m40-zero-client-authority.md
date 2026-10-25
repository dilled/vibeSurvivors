---
id: m40-zero-client-authority
title: "M40 ‒ Protocol v2 hardening + full v2 relay removal: zero client authority + server-restart resilience"
category: decision
status: active
created: "2026-10-25T13:12:24"
updated: "2026-10-25T13:26:21"
---

<!-- compiled_truth -->
M40 removed ALL client authority and made the server world survive a restart.

Wire (protocol v2, client + server agree): the relay tick is
`[u8 27][u8 flags][sections from byte 2]` ‒ the old `u32 authorityPublicId`
head is GONE. The 30 Hz client uplink is **state-only**: type 26 (21B) plus
type-28 edits from ANY connected tab. Types 29 (animal upload) and 32 (clock
upload) are RETIRED: the client never sends them and the MessageRouter
discards inbound 29/32. Tick bit2 is KEPT ‒ it now carries the
SERVER-SIMULATED animal roster (M35/M36 server sim, detail in [[v3-server-authoritative]]),
not the retired client upload.

Client (lib/mp.js + index.html): `authorityId`, `isAuthority()`,
`buildAnimals`, `buildTime`, the `gameMin`/`animals` attach options,
`mpWorldLocked`/`mpWorldLockedGuard` (8 call sites), `mpCollectAnimals` and
`mpLockToastT` are deleted. `mpEmit` only checks connection state (the
server validates every edit). The server clock (bit4) is adopted by EVERY
tab.

Server (VibeSurvivorsPlugin): the TIME/ANIMALS inbound handlers and the
EDIT authority gate are gone (any connected player may edit; the world
store + sender-distance structure gate validate). Persistence:
`vibsurvivors-worldstore.bin` in the relay CWD ‒
`[u32 magic 0x31575356][u32 seed][f64 clock][u32 count][count*(f64 editGameMin + 23B VivsWorldEdit)]`.
Written on every accepted edit, every 30 ticks, and on onServerStop; loaded
in onServerStart (re-init fresh store, walk the storm cursor to the
persisted clock, applyReplay each edit in order). `applyReplay` bypasses
ONLY the sender-distance gate. Corrupt magic / wrong seed / truncation /
size mismatch all start a fresh island.

Verification: ServerBase ctest 178/178 (7 new: 6 persist tests +
WorldStore.ApplyReplay); smoke/run.mjs M27-M39 blocks rewired (off 6->2,
upload assertions inverted, authority assertions removed) + a new M40
block (retired-symbol absence, state-only uplink, offset-2 sections,
self-tab clock adoption) -> SMOKE_OK. Live e2e: e2e parsers off 6->2,
e2e-edits case (c) inverted (an ex-follower tab's edit is accepted +
relayed), NEW smoke/e2e-restart.mjs (own mkdtemp CWD, port 3011; the :3003
relay is never touched) proves edit history replays byte-identically and
the clock resumes, not resets.


## Timeline

- time: 2026-10-25T13:12:24
  kind: decision
  summary: "Created this page: M40 ‒ Protocol v2 hardening + full v2 relay removal: zero client authority + server-restart resilience"
  source: created via brain create-page
  affects: [m40-zero-client-authority]

- time: 2026-10-25T13:12:24
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: "M40 implementation (2026-10-25)"
  affects: [m40-zero-client-authority]

- time: 2026-10-25T13:26:21
  kind: decision
  summary: "Fixed broken links: M35/M36 server-sim facts live in [[v3-server-authoritative]], not in non-existent pages"
  source: "brain sync pass: commit 3a4a34e (M40, range 1b4b084..3a4a34e)"
  affects: [m40-zero-client-authority]
