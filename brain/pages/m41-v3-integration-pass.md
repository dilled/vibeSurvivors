---
id: m41-v3-integration-pass
title: "M41 ‒ v3 integration pass: 3-tab playtest gate + payload perf budgets + v3 finalization"
category: decision
status: active
tags: [multiplayer, serverbase, verification, e2e]
created: "2026-10-25T13:44:15"
updated: "2026-10-25T13:44:53"
---

<!-- compiled_truth -->
## What M41 established

M41 is the FINAL integration milestone of the v3 server-authoritative arc ([[v3-server-authoritative]]): NO new game systems ‒ verification + measurement + finalization only. Its gate is "normal 3-tab play/reconnect with zero world divergence," proven at data level (WS clients, no chrome, the standing M27-M40 precedent). Single-player is untouched: zero changes to index.html/lib/mp.js/ServerBase in this milestone.

## The gate: `smoke/e2e-play.mjs` (E2E_OK)

A fresh relay owned by the script (port **3012**, own mkdtemp CWD, SIGTERM + cleanup in finally). Sequence, all green:

- 3 tabs join; the type-33 world block is **29220 B full message** (type byte + 29219 B payload) and **byte-identical across all three tabs**.
- ~22 s of concurrent play: all three tabs upload plausible moving state at 30 Hz (slow circles, ~1 m/s, well under the server's 12 m/s plausibility budget). Stamps of every mover visibly advance (travel > 1 u over 20+ stamps) ‒ uploads are genuinely accepted, not silently rejected.
- Edits from DIFFERENT tabs (camp from A, shelter from B, palm-0 shake from C) are relayed byte-identically in bit1 to all live tabs; zero type-34 rejects over the whole run.
- For 60 common relay ticks (tickId-aligned): the bit0 players section, the bit2 51-slot animals section, and the time+weather tail are **byte-identical across all three tabs** ‒ "zero world divergence" in the exact M27-M40 sense.
- Tab C DROPS mid-play: A/B keep converging byte-identically (60 ticks); one more accepted edit (palm-1 shake from A) lands.
- Tab C REJOINS: world block byte-identical to the live tabs; EDIT_SYNC catch-up = the exact 4 accepted edit bodies, byte-identical and in order; server clock monotonic (rejoin clock >= pre-drop clock); afterwards A/B/C ticks byte-identical again (60 ticks).
- Largest tick observed during the run: 1337 B.

## Measured payload numbers: `smoke/e2e-perf.mjs` (E2E_OK)

Fresh relay (port **3013**), 3 clients (1 slow mover + 2 keepalive tabs, all uploading 22 B state @ 30 Hz like real tabs), 12.0 s steady capture window:

| measured | value | budget |
|---|---|---|
| join world block (type 33 message) | 29220 B (all clients) | == 29220 B |
| steady relay tick, min/mean/max | 1310 / 1310 / 1310 B | max < 2048 B |
| per-client downlink (all messages) | 39624 B/s (~38.7 KB/s) | < 60 KB/s |
| per-client uplink | 660-662 B/s | < 1 KB/s |
| ticks in window | 363 per client (~30 Hz) | >= 200 (steadiness) |

Relay-tick extrapolation (one tick is broadcast to EVERY client, so relay cost scales linearly): ~387 KB/s at 10 clients, ~967 KB/s at 25. The weather section (bit5) is variable (storm/event count), so the perf script asserts budgets + steadiness, never exact tick length; the playtest asserts exact cross-tab byte-identity instead. A storm segment only changes the weather section identically for all tabs.

## Conventions persisted by the two new scripts

- Self-contained relay ownership (the e2e-restart pattern): each script copies the binary + `certs/` + a `Server.cfg` into its own mkdtemp CWD and sets `NODE_TLS_REJECT_UNAUTHORIZED=0` itself. Port assignments: live relay 3003, e2e-restart 3011, e2e-play 3012, e2e-perf 3013 ‒ the scripts are parallel-safe and never mutate the live relay's `vibsurvivors-worldstore.bin`. `KEEP=1` preserves the relay CWD for debugging.
- Cross-tab divergence checks are tickId-aligned: each client keys captured ticks by the u32 tickId in the players header and only compares common tickIds, so jitter can never misalign the comparison.
- The 29220 B figure is the FULL type-33 message length (as e2e-world compares it against the 29220 B JS reference dump), not the payload after the type byte.

## Final v3 verification status (M32-M41)

Everything green in the final state: ServerBase ctest 178/178; `smoke/run.mjs` SMOKE_OK (M27-M40 blocks); the live :3003 relay e2e set (e2e-world / e2e-players / e2e-animals / e2e-weather / e2e-edits) all E2E_OK; e2e-restart E2E_OK; e2e-play E2E_OK; e2e-perf E2E_OK. A human 3-tab browser playtest remains an optional, non-blocking acceptance note (M40 precedent).

## Follow-ons (M42-M44)

Remote players' placed/built objects + held items visible on other clients; remote-player procedural animation (action flag + walk cycle); vegetation placement ground-clamp/canopy-alignment fix. All build on the now-fully-landed v3 world (zero client authority, persisted world store).


## Timeline

- time: 2026-10-25T13:44:15
  kind: decision
  summary: "Created this page: M41 ‒ v3 integration pass: 3-tab playtest gate + payload perf budgets + v3 finalization"
  source: "M41 implementation session (fresh relay :3012/:3013; PLAN.md M41 marked ✅)"
  affects: [m41-v3-integration-pass]

- time: 2026-10-25T13:44:53
  kind: decision
  summary: "M41 final v3 integration status: e2e-play gate (3-tab play + mid-play reconnect, zero divergence) + e2e-perf measured payload numbers + e2e relay-ownership conventions"
  source: brain update-truth
  affects: [m41-v3-integration-pass]
