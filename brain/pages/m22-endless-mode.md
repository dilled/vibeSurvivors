---
id: m22-endless-mode
title: "M22 ‒ Endless mode: after the M21 win overlay the player can stay on the island (E); per-endless-day escalation via boost factors, story mode stays bit-identical"
category: decision
status: active
tags: [m22, endless, escalation, win]
created: "2026-10-18T01:08:32"
updated: "2026-10-18T03:23:04"
---

<!-- compiled_truth -->
M22 = endless mode + adaptation/escalating pressure (PLAN.md M22). Shipped `d421394`. After the M21 win overlay the player can choose to stay on the island; the island then gets harder every endless day via boost factors that are all exactly 0 while `endless === false`, so story mode stays bit-identical.

**Staying is a player-side toggle, not a new mode object:** `E` in the won-guard (the `#won` overlay keys are otherwise only R) calls `startEndless()`: flips `endless`/`won`/`started` so the existing gates unfreeze the sim, drops the rig back at camp (spawn fallback), keeps the M20 raft built at camp (the player stays re-escapable via `[[m21-escape-win]]`), records `endlessStartDay = dayOf()` and `endlessStartMin = p0*1800 + gameMin`, `learn('endless')` + survival `logLine` + toast. Idempotent (`!won || endless` guard). Win overlay + title card gain the E-stay row.

**Escalation is a small boost family, not new AI:**
- `endlessDay() = dayOf() - endlessStartDay` (clamped >= 0); `boost(perDay, cap) = min(cap, perDay * endlessDay)`.
- Tiger `boost(0.12/day, cap 0.5)` (capped at endless day 4.17): stalk/chase ranges *1+tb, stalk/chase speeds *1+0.4tb, `atkCd / (1+tb)`. Damage is deliberately unchanged (no death spiral).
- Pelican `boost(0.15/day, cap 0.6)`: steal start radius *1+0.5pb, steal window and both stealCd sites /1+pb.
- Day `boost(0.04/day, cap 0.5)`: flows through `timeRate(p)` into the frame tick ‒ base 12h day = 20 real min / 12h night = 10 min (0.6 / 1.2 rate), endless up to +50% faster (shorter days).
- Storm: weight in `weatherPick` and duration in `weatherDur` multiplied by (1+sb) / (1+0.3sb) with `sb` capped at 1.0; same single-draw structure, no new rng draws, same draw order, story sb = 0. `stormBoost` is computed from the segment start day index `floor((p0*1800+min)/1800) - (endlessStartDay-1)` so the first endless day stays gentle. Cached weather segments keep their generation-time boost, so M10/M11 replays are untouched.

**Scoring & death in endless:** score = days survived. HUD gains an "🏝 endless ‒ day N" line while endless. The endless death overlay shows days survived (`dayOf() - endlessStartDay + 1`) + discoveries while `respawn()` stays the spec-correct camp respawn with carried loot lost. (M26 refinement: the *story* dead overlay is now camp-aware ‒ with a camp it rewrites to the "wake at your camp (you lose what you were carrying)" wording matching `respawn()`, static text stays the no-camp default; the endless branch keeps its days-survived text ‒ see [[m26-single-player-v1]].)

**Deliberate scope limits:** boat tier-5 item, save/persistence (`[[m25]]`-style work) stay later; only tiger + pelican escalate (other species are out of scope). Zero world-gen / `PLANT_TYPES` / animal-registry changes (registry stays 10).

**Smoke (new M22 block in `smoke/run.mjs`):** story invariants (all boosts 0), win replication -> `startEndless` asserts (camp position, learn, journal, overlay hidden, idempotent re-entry + HUD line), ramp values (day-2: tb/pb/db = 0.24/0.30/0.08, timeRate 0.6*1.08 / 1.2*1.08, storm 0.5; day-42 caps 0.5/0.6/0.5/1.0), `weatherExtend` tail contains a storm, exact full-schedule replay from seg 0 with generation-time boost split at the entry segLen, endless death overlay (days survived + camp respawn + loot loss), snapshot/restore, registry still 10. SMOKE_OK (execution proven via a temporary M22-BLOCK-RAN marker, then reverted); 0 `rng()`/`Math.random` in the new lines (only the pre-existing `weatherRng` draw, moved). One off-by-day smoke bug caught + fixed: the day index is `p0*1800+gameMin` and `endlessStartMin` already includes `p0*1800` ‒ offset from the raw entry gameMin, not from it plus p0.

**Verification note:** headless screenshots are not runnable on this host (no Chrome ‒ M17–M21 precedent); render is exercised via the stub DOM.


## Timeline

- time: 2026-10-18T01:08:32
  kind: decision
  summary: "Created this page: M22 ‒ Endless mode: after the M21 win overlay the player can stay on the island (E); per-endless-day escalation via boost factors, story mode stays bit-identical"
  source: commit d421394
  affects: [m22-endless-mode]

- time: 2026-10-18T01:08:57
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [m22-endless-mode]

- time: 2026-10-18T03:23:04
  kind: decision
  summary: "Corrected stale claim: M26 made the story dead overlay camp-aware (see [[m26-single-player-v1]]); endless branch unchanged"
  source: commit 58f0668
  affects: [m22-endless-mode]
