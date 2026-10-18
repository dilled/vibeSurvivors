---
id: m11-storm-gameplay
title: "M11 ‒ Storm gameplay: 'storm' weather state, per-segment seeded lightning fires + animal panic, wind-dropped coconuts, lagoon surge, wet stat + shelter/fire drying, rain-masked fire fear, ?weather=storm"
category: decision
status: active
tags: [weather, storm, lightning, wet, fire, animals, schedule, determinism]
created: "2026-10-17T20:23:47"
updated: "2026-10-18T01:39:41"
---

<!-- compiled_truth -->
## What shipped (M11 ‒ storm gameplay + weather/survival interaction)

M11 makes the storm a real survival event, not a visual: a fourth weather state `'storm'` appended to M10's data-driven schedule ([[m10-weather-framework]]), with per-storm precomputed lightning strikes and wind drops, a new player `wet` stat, and storm-specific animal behavior. Gate from PLAN.md: "Storm materially changes survival decisions".

- **`storm` joins `WEATHER_STATES` / `WEATHER_NEXT`** (the data-driven extension M10 was designed for): `storm` durations 45–150 game minutes; transition table now `rain ⇢ {cloudy .5, storm .2, clear .3}`, `storm ⇢ {rain .6, cloudy .4}` ‒ **a storm can only follow rain and never self-repeats** (all other M10 rows unchanged). A storm is treated as **heavy rain** everywhere: `isWetSt(st) = rain | storm` drives dousing, plant-growth acceleration (`rainFrac` now counts storm segments), and soaking.
- **Per-storm-segment precomputed events (deterministic contract):** when a storm segment is generated, its events are precomputed on a private stream `mulberry32(SEED + 273 + i*7)` where `i` is the segment index (stream map: world 0, weather schedule 271, weather event streams 273, rain-streak offsets 4242). Fixed draw order: **all strikes first** (`t`, angle `a`, radius `r = sqrt(uniform)*ISLAND_R*0.7` ‒ uniform over the island disk), **then all drops** (`t`, palm index); 1–3 strikes, 1–2 drops, then sorted by `t`. Events fire lazily in `updateWeather` as they come due (`ev.done` flag, catch-up-safe for clock jumps) and are **gated on the effective state**, so a `?weather=` pin suppresses precomputed events (a pinned storm on a non-storm segment has no events; pinning another state on a storm segment skips firing). The smoke replays the exact draw order on a fresh rng and compares every value.
- **Lightning (`doLightning`):** sky flash + one shared bolt mesh (thin box ‒ `smoke/three-stub.mjs` untouched). It **ignites an uncontrolled fire on open ground** (`heightAt >= 0.5`, fire cap 5 respected, fires never die), **sears the player** for `STRIKE_DMG = 15` hp if within `STRIKE_HIT_R = 3.0` and in the open (not `isDryNow()` ‒ shelter and a nearby fire are "fair cover"), and **panics the wildlife**: every tiger panics for 6 s (flee from the strike spot, panics are cleared at dawn), gulls go quiet for 5 s (flock to perch, no steal, no dive-bomb), crabs within 25 u scuttle for 3 s. One-time `learn('lightning')`.
- **Wind-dropped coconuts:** `dropCoconut(p)` was extracted out of `actUse` so the storm wind reuses the exact same drop path; `dropCoconutIfAny(pi)` consumes a precomputed palm index (safe ‒ `palms` is a fixed array). One-time `learn('wind')`.
- **Lagoon surge:** in a storm `actStrike` **refuses the spear** ("the lagoon surges ‒ the fish are gone from the shallows", `learn('lagoon')`); clear weather still fishes normally. Visually, fish schools sink to deeper water (min depth ‑0.8 instead of ‑0.3) and displace outward 6 u.
- **New player stat `wet` (0–100, HUD 4th bar, resets on sleep and respawn):** soaks in wet weather while not dry (rain `3/s`, storm `5/s`); dries otherwise (open `2/s`; `8/s` near the shelter or a lit fire within `FIRE_DRY_R = 2.5`; `isDryNow()` reuses `SHELTER_PROTECT_R = 2.0`). Soaking drains health at `(wet/100) * WET_DRAIN` with `WET_DRAIN = 0.8` hp/s max ‒ **intended as pressure, not a death spiral**. Sleeping under the shelter resets `wet` to 0 (dries off). One-time `learn('wet')` above 15.
- **Rain masks fire and smoke (animal legibility):** tigers' fire-avoidance radius is `FIRE_AVOID_R * 0.6` in wet weather (flee-end margin unchanged); 8 u from a fire flees in clear but not in rain (smoke-verified).
- **Visuals + debug:** storm sky `0x39424f` (0.6 blend) + lightning flash `0xdfe8f2`, rain streaks fall faster and lean in storm wind, fog closes 120 further, sun/hemi dim more, HUD `⛈` glyph + "storm", toast "the storm breaks" + one-time `learn('storm')`. `?weather=storm` works via the existing M10 `setWeatherDebug` (override never rewrites `segs`). Camp torches stay rain-proof (M10 decision unchanged).
- **Deliberately NOT in M11:** any weather effect on thirst/hunger rates, sharks, sleep gate, or save/serialization. Animal *weather-legibility* polish remains M16; storm audio remains M23.

## Blast radius

- `index.html` only (plus `smoke/run.mjs`): 4th stat field, fish-school depth/displacement, tiger + gull panic fields/branches, `actUse`/`actStrike`/`actSleep`/`respawn` touch points, the M10 weather section extended (state, table, per-segment `evs`, `isWetSt`/`effectiveWeather`, `doLightning`, `dropCoconut(IfAny)`, event catch-up), `updateSky`/`updateRain` storm terms, HUD wet bar, `frame()` soak/drain. No world-gen or existing rng-stream changes; no new gameplay key.
- `smoke/run.mjs`: M11 block after M10: storm exists in the first 40000 game minutes with an exact event replay (kind/t/x/z/palm, bounds in segment, non-storm segments event-free); `dropCoconut` crown/item contract; `doLightning` ignites on open ground, panics tigers/gulls, scuttles a nearby crab, does NOT sear at 11 u, sears exactly `STRIKE_DMG` at 2.75 u + `learn('lightning')`; natural-storm lazy catch-up fires exactly the due events (player parked off every strike); storm visuals (streaks, fog close, sun dim, HUD "storm", bolt exists) and clear-weather reversion; wet soak/drain in the open, shelter + clear drying to 0; lagoon surge refuses the spear / clear still fishes + `learn('lagoon')`; tiger fire fear 8 u: flee in clear, no flee in rain; ends pinned to clear with `wet = 0`.


## Timeline

- time: 2026-10-17T20:23:47
  kind: decision
  summary: "Created this page: M11 ‒ Storm gameplay: 'storm' weather state, per-segment seeded lightning fires + animal panic, wind-dropped coconuts, lagoon surge, wet stat + shelter/fire drying, rain-masked fire fear, ?weather=storm"
  source: "M11 implementation, commit 34a064e"
  affects: [m11-storm-gameplay]

- time: 2026-10-17T20:24:29
  kind: decision
  summary: "Created: M11 ‒ Storm gameplay: 'storm' weather state appended to M10's data-driven schedule, per-segment seeded lightning fires + animal panic, wind-dropped coconuts, lagoon surge, wet stat + drying, rain-masked fire fear, ?weather=storm"
  source: "M11 implementation, commit 34a064e"
  affects: [m11-storm-gameplay]

- time: 2026-10-18T01:39:41
  kind: note
  summary: "The storm audio deferred to M23 has shipped: storm wind bed tracks weather.vis.storm and doLightning triggers range-delayed thunder in [[m23-audio]] (commit 4bb4e83)."
  source: commit 4bb4e83
  affects: [m23-audio]
