---
id: m38-server-player-authority
title: "M38 ‒ Server player authority: every tab renders its own rig from the server's stamped transform"
category: decision
status: active
tags: [m38, multiplayer, server-authority, players]
created: "2026-10-25T09:58:00"
updated: "2026-10-25T09:58:19"
---

<!-- compiled_truth -->
What was decided: from M38 the server is the **single source of truth for player
transforms**. Every tab ‒ including the mover's own tab ‒ renders its local rig from
the server's stamped (accepted) transform exactly like it renders remotes. This
implements the "players" side of the [[v3-server-authoritative]] pivot on the client.

How it works:
- **lib/mp.js**: the tick bit0 player section now captures the OWN entry into a
  `self` state ({x, y, z, yaw, underwater}) BEFORE the self-exclusion drop loop, so
  `remotes` still excludes self (unchanged) while a new `self` getter exposes the
  server's stamp for this tab (null until the first own entry; cleared on rejoin and
  on disconnect).
- **index.html**: new `mpSelfFrame(dt)` runs every frame right after the local
  movement/raft/clamp block, before `mpRemotesFrame`. It reconciles the local rig
  with the exact M28 presence lerp semantics: first-sight snap, >30u divergence
  snap (the server-side rollback/reject case), otherwise lerp
  k = 1 - exp(-dt*15) with shortest-arc yaw. Local WASD/rowing keeps predicting
  between the 30 Hz stamps; the stamp wins. There is no code path where the client's
  own transform is authoritative over the server's. Inert without `?mp=`, while
  disconnected, or before the first own stamp (local sim is truth then).
- The **underwater bit is NOT adopted** from the stamp: the local
  inWater()/heightAt computation stays authoritative for that state.

Scope decision (settled): the M29/M30 authority machinery is **not** retired yet.
mpEmit/mpWorldLocked, the authority-gated type-29 animal upload, and the
authorityPublicId wire field all stay until M39/M40 per the [[v3-server-authoritative]]
plan ‒ only the player/presence side of the client authority election is retired
now.

Wire format: **zero change** ‒ protocol v2, 21 B player state, tick layout untouched.
M38 is purely client-side capture + reconciliation; the ServerBase side (rejectedStates
counter + throttled reject log, 162/162 ctest) lives in a separate commit on
feat/vibecraft-server-authoritative.

Verification gates:
- Offline: new M38 smoke block in `smoke/run.mjs` (SP inert; `self` populated while
  `remotes` still excludes self; first-sight snap; 60-frame convergence to 1e-3;
  >30u rollback snap; type-26/32 uploads intact; type-29 still authority-gated;
  disconnect reverts to local authority).
- Live: new headless 3-tab `smoke/e2e-players.mjs` on the real relay ‒ all three
  tabs' bit0 stamps byte-identical across tabs (one relay tick), each tab sees its
  own id stamped, a teleport type-26 (x+500) is rejected so stamps stay at the last
  plausible value (max jump 0.033 u over 28 stamps), and the time+weather tail stays
  byte-identical (M37 regression). e2e-world (29220 B), e2e-animals (51-slot identity)
  and e2e-weather all re-verified unchanged.


## Timeline

- time: 2026-10-25T09:58:00
  kind: decision
  summary: "Created this page: M38 ‒ Server player authority: every tab renders its own rig from the server's stamped transform"
  source: "brain sync pass: commit 9dbb259 (range 67e2d35..9dbb259)"
  affects: [m38-server-player-authority]

- time: 2026-10-25T09:58:19
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m38-server-player-authority]
