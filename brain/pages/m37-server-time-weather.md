---
id: m37-server-time-weather
title: "M37 ‒ Server owns time + weather: seed-driven clock and weather/storm schedule in the plugin; clients adopt the server clock and weather state"
category: decision
status: active
tags: [m37, multiplayer, server-authority, weather, clock]
created: "2026-10-25T09:22:34"
updated: "2026-10-25T09:23:12"
---

<!-- compiled_truth -->
What was decided: from M37 the server (ServerBase `VibeSurvivorsPlugin`) OWNS the
game clock and the weather/storm schedule. The client no longer advances its own
clock or reads its local weather schedule while connected ‒ it adopts the server's.
This extends the [[v3-server-authoritative]] pivot (trees, animals, players) to time
and weather, retiring the "authority client's clock/weather" model.

How it works:
- **Server clock** (tick bit4, `VIVS_TICK_TIME`): the plugin steps its own
  `simGameMin_` every 30 Hz tick at the story rate (day 0.6 / dark 1.2 game-min/s,
  no M22 endless boost ‒ MP is story mode only). The tick ALWAYS carries bit4 with
  `simGameMin_` as an LE f32. Every tab ‒ including the old authority ‒ snaps
  `gameMin` to it (client `mpTimeAdopt`). The client's type-32 `MSG_VIVS_TIME` upload
  is now tracked for plausibility only; it no longer drives the clock.
- **Server weather** (tick bit5, `VIVS_TICK_WEATHER`): `u8 state` (0=clear
  1=cloudy 2=rain 3=storm) + `u32 nEvents` + `nEvents * 13 B` events, where each
  event is `u8 kind, f32 t, f32 a, f32 b` (LE, no padding). kind 0 = strike
  (a=x, b=z), kind 1 = wind drop (a=palmIdx, b=0); `t` is the ABSOLUTE gameMin.
  Outside storms nEvents=0. Inside a storm the server sends the ACTIVE storm
  segment's full sorted event list every tick (so every tab fires the identical
  storm beats).
- **Client adoption**: `effectiveWeather()` returns the server `state` when
  connected (the `weather.forced` debug pin still wins, and the local
  `weatherStateAt(gameMin)` is the single-player fallback). The storm-event block
  in `updateWeather` fires the SERVER's event list lazily (t <= gameMin) with a
  per-index done set keyed by list identity (`len:firstT:lastT`), so each event
  fires once and a new storm segment resets it.

Bit-exact port: the C++ `vsurv::Weather` (Weather.hpp/.cpp) is a byte-identical
port of the client's seeded schedule (story mode, stormBoost=0). The
`vibs_weather_matches_js_reference` ctest (tests/vivs_weather_dump.{mjs,cpp}) cmps
a JS dump against a C++ dump and is the gate; test_vivs_weather.cpp pins the
seed-1337 goldens (68 segs to 20000 min, 3 storms, 7 events, first storm
1060.16..1183.41) and a tick bit5 wire round-trip.

Gates: full ServerBase ctest (162) green; `node smoke/run.mjs` SMOKE_OK (the M37
block exercises clock adopt + weather adopt + storm-beat firing against a fake WS);
`node smoke/e2e-weather.mjs` proves the live relay sends the clock+weather tail
byte-identical to 3 tabs with the clock advancing.

Wire-format note: the per-event size is 13 bytes and the writer MUST set bit5 in
the flags byte or the reader never parses the section (both were initial bugs,
locked by the round-trip gtest).


## Timeline

- time: 2026-10-25T09:22:34
  kind: decision
  summary: "Created this page: M37 ‒ Server owns time + weather: seed-driven clock and weather/storm schedule in the plugin; clients adopt the server clock and weather state"
  source: M37 implementation
  affects: [m37-server-time-weather]

- time: 2026-10-25T09:23:12
  kind: decision
  summary: "M37 complete: server owns the game clock + weather/storm schedule; clients adopt it; bit-exact C++ port + 3-tab E2E gate"
  source: M37 implementation
  affects: [m37-server-time-weather]
