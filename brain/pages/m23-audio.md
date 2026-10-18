---
id: m23-audio
title: "M23 ‒ Audio pass: procedural WebAudio, generated only (no assets), read-only over game state, zero rng"
category: decision
status: active
tags: [m23, audio, webaudio, determinism]
created: "2026-10-18T01:38:52"
updated: "2026-10-18T01:39:48"
---

<!-- compiled_truth -->
M23 = the audio pass (PLAN.md M23). Shipped `4bb4e83`. The island gets coherent, procedurally-generated WebAudio feedback across all four cue families ‒ **generated only, no audio assets** (the stack root-page audio choice, now realized in code).

**Architecture:**
- One self-contained audio section in `index.html` (no separate files, no build step) + an `AudioContext` stub in `smoke/run.mjs` (see smoke below).
- **Autoplay policy:** `audioInit()` runs on the first keydown (the existing start branch); until then every audio call is a no-op. `audioResume()` re-covers suspended contexts. Master gain starts at 0.5.
- **Four cue families:**
  1. *Island ambience beds:* waves always on (clock LFO around 0.12 gain), day chirps and night crickets crossfaded on `dayFactor < 0.5`, both scheduled by deterministic clock hashes.
  2. *Weather beds:* rain gain = `0.16 * weather.vis.rain`, storm wind = `0.2 * weather.vis.storm`, fire crackle from `nearestFire` within 14 u ‒ i.e. rain/storm audio ([[m10-weather-framework]] / [[m11-storm-gameplay]] deferrals) resolved.
  3. *Animal signatures:* 10 distinct, teachable per-species cues (tiger roar, gull dive tell, monkey shriek, lizard sprint, snake hiss, pelican flaps/splash, shark lunge+bite, spider clicking, fish scatter, crab scuttle) + a soft species-agnostic [[m16-animal-alarm-bus]] backstop (`scream`/`alert`/`attack`) fired inside `alarmRaise` itself, so future emitters are covered automatically.
  4. *Survival-action cues:* drink/use/spear/fire/build (x5 camp structures)/sleep/craft (x2)/raft/eat (x7 foods)/herb/death/respawn/win/endless, plus the first-time learn blip and zone footsteps (sand/grass/jungle/splash) once per `walkPhase` half-cycle while moving.
- **Distance model:** cues with position scale volume by `1/(1+d*0.08)` and are gated past 40 u; lightning thunder is the exception ‒ heard at any distance, delayed by range (`min(2.5, d*0.03)` s), volume `0.3/(1+d*0.025)`.
- **Read-only tick:** `audioTick(dt)` runs once per frame in `frame()` (after the late animal phase) and is **read-only over game state**; bed gains are re-derived from clock/weather each frame, so sleep jumps and T-speed skips are safe. Audio never feeds back into simulation state.
- **Mute:** `P` flips `sndMuted` (master gain 0.5 <-> 0); HUD shows a "muted ‒ P" line and the title card lists the key.

**Determinism constraint:** **zero `rng()` / `Math.random`** in the audio section ‒ the shared 2 s noise buffer and every one-shot variation are pure functions of the clock (`ahash` integer hash of clock-derived integers), so audio stays server world-sync safe under [[multiplayer-deferred-serverbase]] (it is a pure function of deterministic state, never a state input).

**Smoke (new M23 block in `smoke/run.mjs`):** a minimal `AudioContext` stub (`AParam` + `AudioContextStub` with `__audioCalls` counters; `__audioTime` advances with the pumps) and asserts: nothing before first key, init + 0.5 master + four beds, thunder bursts from `doLightning`, rain->storm->clear bed tracking, alarm backstop + 40 u distance gate + tiger signature, footsteps while walking and silent when stopped, eat + fire cues, mute toggle/restore, registry still 10. SMOKE_OK (M23 block execution proven via a temporary marker, then reverted); 0 `rng()`/`Math.random` in the new lines; zero world-gen/`PLANT_TYPES`/animal-registry changes.

**Verification note:** headless screenshots not runnable on this host (no Chrome ‒ M17+ precedent); audio is exercised via the stub, not a real AudioContext.


## Timeline

- time: 2026-10-18T01:38:52
  kind: decision
  summary: "Created this page: M23 ‒ Audio pass: procedural WebAudio, generated only (no assets), read-only over game state, zero rng"
  source: commit 4bb4e83
  affects: [m23-audio]

- time: 2026-10-18T01:39:18
  kind: decision
  summary: "Set M23 compiled truth: procedural WebAudio architecture, four cue families, distance model, read-only tick, zero-rng determinism, smoke stub coverage"
  source: commit 4bb4e83
  affects: [m23-audio]

- time: 2026-10-18T01:39:48
  kind: decision
  summary: "Fixed lint warning: stack is a root page slug, not a [[ ]]-linked page"
  source: lint-links
  affects: [m23-audio]
