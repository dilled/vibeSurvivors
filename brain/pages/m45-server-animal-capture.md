---
id: m45-server-animal-capture
title: "M45 ‒ Server owns animal capture: kind-9 edits end client-side catch races"
category: decision
status: active
tags: [m45, multiplayer, server-authority, animals, catch]
created: "2026-10-25T22:56:43"
updated: "2026-10-25T22:57:18"
---

<!-- compiled_truth -->
What was decided: from M45 the server is also the **single source of truth for
ANIMAL CAPTURE** ‒ the last shared-state gap. Before M45 a crab catch (E) and a
fish spear (X) resolved client-side, so every tab could catch the SAME crab
(or over-drain the same fish school). Catches are now **kind-9 world edits**,
validated and applied server-side against the live AnimalSim, exactly like the
M39 world edits ([[m39-server-edit-validation]]). This closes the
[[v3-server-authoritative]] pivot: trees, animals, players, edits, AND catches
are server-owned.

Wire format (additive, protocol v2 unchanged):
- **kind-9 edit** = [u8 28][23B VivsWorldEdit] with `kind=9, action=0`,
  `entityIndex = slot = type*64 + index` (type 0=fish school, 1=crab),
  `payload[0] = fish take` (0 for crabs). A crab catch is `64 + crabIndex`; a
  fish spear is `schoolIndex` with the number speared in payload[0].
- **Server validation** (VivsModule::validateAndApplyCatch, against AnimalSim):
  slot decodes to a real species, the species is catchable (fish/crab only ‒
  tigers/snakes/etc. reject), the SENDER's stamped transform is within radius
  (crab 2.0u, fish 7.0u), and the animal is catchable-state (crab `alive`,
  school `n >= take`). Rejects are a **type-34** to the sender alone, never
  relayed, never in editHistory.
- **Server apply**: crab `alive=false` (the state bit0 already flows to every
  tab in the tick, so all tabs see it die); fish `n -= take`.
- **Restart**: kind-9 entries are STRIPPED from editHistory on restart (the
  AnimalSim respawns animals from the seed, so a late joiner's EDIT_SYNC must
  not carry stale catches; WorldStore.cpp `case 9` is a no-op for replay).

Server (ServerBase, feat/vibecraft-server-authoritative):
- **AnimalSim.{hpp,cpp}**: `CatchResult tryCatch(uint16_t slot, uint8_t take)`
  + `bool animalPos(uint16_t slot, double& x, double& z) const` expose the
  sim to the module without leaking internals.
- **VivsModule.cpp**: intercepts kind-9 in the MSG_VIVS_EDIT branch, runs
  validateAndApplyCatch, relays accepts in tick bit1, and rejects invalid ones
  (reasons: "the crab is already gone", "too far away", "that animal cannot be
  caught", "no fish left there").
- **WorldStore.cpp**: `case 9` is a no-op in the shared edit switch (restart
  replay; the sim re-derives animals from the seed).

Client (vibeSurvivors):
- **lib/mp.js**: kind 9 documented in the protocol header; **onEditReject now
  receives the echoed 12B payload** as its 4th arg
  (`onEditReject(pid, entityIndex, kind, payload, reason)`) so the page can
  roll back a fish take. The payload read is `new Uint8Array(data, 1 + 10, 12)`
  ‒ payload[12] starts at VivsWorldEdit byte 10 (publicId 4 + entityIndex 4 +
  kind 1 + action 1); an earlier off-by-one (`1 + 11`) read the _pad byte and
  silently read the fish take as 0.
- **index.html**:
  - `mpCatchRollback(kind, eidx, payload)` (named so the smoke can test it):
    kind-9 reject un-catches a crab (alive=true, visible, INV.crab-1) or
    restores a school (n += take capped at n0, INV.fishRaw -= take).
  - `actUse` crab branch + `actStrike` fish branch each call
    `mpEmit(9, slot, payload)` **unconditionally** (mpEmit is a no-op in SP,
    matching the fire/palm/plant convention ‒ no `if (MP_ON)` gate).
  - `mpApplyWorldEdit` handles kind 9 (crab alive=false / school n-=take) for
    the relayed catches from OTHER tabs.
  - `onEditReject` toasts + calls mpCatchRollback.
  - The client adopts the tick's dead bit ONE-WAY (a crab never comes back to
    life locally), so local catch actions target only live animals.

Optimism model: the sender applies the catch locally FIRST (instant feel),
uploads the kind-9 edit; a type-34 reject rolls that back. A valid catch is
always accepted by the bit-exact sim, so a reject means a genuine race (another
tab beat you) or an out-of-range/invalid target.

Verification: ServerBase ctest 49/49 (incl. `PersistFixture.AnimalCaptureKindNine`:
accept+relay, duplicate catch rejected, radius rejected, non-catchable species
rejected, fish count decremented, restart strips catches); vibeSurvivors smoke
SMOKE_OK (M45 block: relayed-catch apply, actUse/actStrike emit kind-9 with the
correct slot, type-34 rollback of crab + fish); live smoke/e2e-animals.mjs
E2E_OK. Single-player path untouched (edits are a no-op when disconnected).


## Timeline

- time: 2026-10-25T22:56:43
  kind: decision
  summary: "Created this page: M45 ‒ Server owns animal capture: kind-9 edits end client-side catch races"
  source: created via brain create-page
  affects: [m45-server-animal-capture]

- time: 2026-10-25T22:57:18
  kind: decision
  summary: "Record the M45 server-owned animal-capture design (kind-9 edits, AnimalSim tryCatch, type-34 rollback) and the mp.js payload off-by-one fix"
  source: M45 implementation
  affects: [m45-server-animal-capture]
