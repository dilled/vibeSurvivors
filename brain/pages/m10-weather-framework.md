---
id: m10-weather-framework
title: "M10 ‒ Weather framework: clear/cloudy/rain seeded schedule over game minutes, sky/fog/rain visuals, rain douses unsheltered fires, rain-accelerated plant growth, ?weather"
category: decision
status: active
tags: [weather, rain, fire, plants, schedule, determinism]
created: "2026-10-17T19:40:47"
updated: "2026-10-17T19:41:44"
---

<!-- compiled_truth -->
## What shipped (M10 ‒ weather framework: clear/cloudy/rain)

M10 makes weather a first-class, deterministic system with three states (clear/cloudy/rain) that transitions **visibly** (sky color/fog/sun dim + rain streaks + HUD glyph+word + toasts) and **affects the island** (rain douses unsheltered fires; rain accelerates plant growth via the M7 hook). Gate from PLAN.md: "Weather transitions visibly and affects the island". Storm is deliberately M11 ‒ `WEATHER_STATES` + the `WEATHER_NEXT` transition table are data-driven so M11 appends `'storm'` without forking code.

- **Weather = pure function of elapsed `gameMin`, not clock position**: a seeded, *lazily extended* segment schedule (`weather.segs`), private rng stream `mulberry32(SEED + 271)` (world uses `SEED`, plants use 101..1193 ‒ untouched). This was the key architectural decision: the clock model has `gameMin` (elapsed minutes; T-key, actSleep jumps, real-time accumulation) and `p0` (base phase; only debug `setClockP`/`?t=` change it). Keying on `gameMin` survives `setClockP`/`?t=` (position-keyed schedules would break), sleep jumps, and raw `gameMin` rewinds (M7/M9 smoke). It is also the future multiplayer model (M27+: authoritative client broadcasts weather at game time).
- **Lazy generation, exact draw order** (smoke replays it): seg0 = clear with duration `240+480*rng()`, then each next segment draws first the *state* (one cumulative-weight draw from `WEATHER_NEXT[prev]`), then its *duration* (`clear 240-720`, `cloudy 120-360`, `rain 60-180` game minutes). Transition table: clear ⇢ {cloudy .7, clear .3}, cloudy ⇢ {rain .5, clear .4, cloudy .1}, rain ⇢ {cloudy .7, clear .3} (rain never self-repeats). Seed 1337 gives first rain at game-min 3161 and `rainFrac(0,7200) = 0.1218`. `weatherExtend(min)` appends as needed (one-time cost even for 7200-min jumps); `weatherStateAt(min)` and `rainFrac(minA,minB)` are pure interval lookups so `gameMin` rewinds are harmless. All weather math is interval/lookup-based ‒ never a monotonically consumed cursor.
- **Debug override without schedule mutation**: `setWeatherDebug(state)` (used by `?weather=clear|cloudy|rain` and the smoke) sets `weather.forced`, which overrides the *live/visual* state only ‒ it never rewrites `segs`, so the natural schedule stays deterministic. Debug-only entry point, same house class as `?t=`/`setClockP` (makes the live game non-deterministic; that is accepted for debug). No gameplay key (WASD owns W; weather has no player *action* in M10).
- **Rain douses fires, shelter protects**: while the effective state is rain, `douseUnshelteredFires()` runs each frame (idempotent, cheap no-op when nothing is unprotected). A fire survives only if the shelter structure exists and the fire is within `SHELTER_PROTECT_R = 2.0` of `camp.structures.shelter.position`. Dousing removes the fire group from the scene and splices it from `fires` (safe for all consumers: `nearestFire`/`nearFire`, tiger flee, `campIsLit`, cook). Crucially, **a doused cook loses only the cook, never the item**: `actUse` starts a cook without consuming the raw item (consumption happens at cook *completion*), so dousing simply leaves the raw item in the inventory ‒ the earlier "return to INV" increment would have double-counted. Camp **torch structures are rain-proof** in M10 (keeps the M4 sleep gate stable; M11 may revisit). Toast only when at least one fire actually went out (no per-frame spam).
- **Rain-accelerated plant growth (owns the M7 hook)**: `plantGrowthMult()`'s no-arg stub became `plantGrowthMult(minA, minB) = 1 + (RAIN_GROWTH - 1) * rainFrac(minA, minB)` with `RAIN_GROWTH = 1.5` ‒ a **range average** over the window, and `updatePlants` passes `(prevPlantClock, gameMin)`, so sleep jumps and T-skips stay consistent (M9's 7200-min wear-jump math stays valid: faster regrow can't add extra depletion cycles; wear increments per depletion transition only).
- **Visual blend + HUD**: `weather.vis = {cloudy, rain}` smooth toward the effective-state targets at ~1 s time constant (deviation from handoff: `dt * 3`, not `dt` ‒ with plain `dt` the 60-frame smoke thresholds for sun dim would not be reached). `updateSky` dims `sun.intensity` by `(1 - 0.5*cloudy - 0.6*rain)` (floor 0), lerps the sky toward `0x8d99a6` (0.45 * cloudy) then `0x5f6b7a` (0.7 * rain), closes fog `520 -> 320` with rain, dims hemi milder; the HUD clock line appends `☀/☁/🌧 state`. Rain streaks: 90 rig-attached shared-geometry `Mesh` boxes in a `Group` (offsets from `mulberry32(SEED + 4242)`, x/z in [-7,7], falling 14 u/s, wrap ‒ Group+Mesh+BoxGeometry only, so `smoke/three-stub.mjs` is untouched), visible when `vis.rain > 0.5`.
- **Deliberately deferred to M11+**: wet/warmth player stat (M11 survival interaction; today's stats are thirst/hunger/health), wind/lightning/storm (M11), lagoon surge, animal weather-legibility (M16), rain audio (M23). No weather effect on `THIRST_RATE`/hunger/tigers/sharks.

## Alternatives considered

- Wall-clock or clock-position schedule: rejected ‒ `setClockP`/`?t=` only touch `p0`, so position-keyed schedules break under existing debug/smoke behavior; elapsed `gameMin` also matches the M27+ mp model.
- "Wet fire" object instead of removal: rejected ‒ full removal is simpler and every fire consumer tolerates spliced entries; no gameplay need for a sputtering state in M10.
- Consuming the cooking item at cook start: rejected (not implemented) ‒ existing M8 cook semantics consume at completion, so dousing must not touch the inventory.

## Blast radius

- `index.html` only (plus `smoke/run.mjs`): new weather section inserted before the day/night section (TDZ-safe for the `?weather=` dev param, which runs earlier in module init), `plantGrowthMult` 2-arg replacement + single call-site change in `updatePlants`, weather blend + HUD word in `updateSky`, `updateWeather`/`updateRain` calls in `frame()`. No world-gen/plant rng changes; no new gameplay key.
- `smoke/run.mjs`: a **load-bearing early pin** `setWeatherDebug('clear')` right after the first `pump(5)` ‒ without it, M7's `gameMin += 3600` / M9's `gameMin += 7200` jumps would put the live schedule in rain mid-run, douse the M1/M3 fires, and break M8's cook test and fire-count assumptions. All pre-M10 blocks keep bit-identical fire/plant behavior.

## Smoke coverage (`smoke/run.mjs` ⇢ `SMOKE_OK`)

M10 block (after M9): schedule determinism by replaying the generation draw order on a fresh `mulberry32(SEED + 271)` for the first 4 segments (`state`+`end` exact, seg0 clear, `weatherStateAt(0) === 'clear'`); `rainFrac(0,7200)` in (0,1), `plantGrowthMult(0,7200) === 1 + (RAIN_GROWTH-1)*rf`, inverted window dry; visible transitions at noon (cloudy dims sun / no streaks / fog stays far; rain shows streaks / fog < 400 / sun < 0.6*base / HUD names "rain"; clear reverses all, HUD shows "clear"); rain douses every unsheltered fire (fires 5 ⇢ 0) and writes the one-time `learn('weather')`; a fire lit under the shelter survives + camp stays lit; a doused cook leaves `INV.fishRaw === 1` and the shelter fire is the only fire left; ends pinned to clear.


## Timeline

- time: 2026-10-17T19:40:47
  kind: decision
  summary: "Created this page: M10 ‒ Weather framework: clear/cloudy/rain seeded schedule over game minutes, sky/fog/rain visuals, rain douses unsheltered fires, rain-accelerated plant growth, ?weather"
  source: created via brain create-page
  affects: [m10-weather-framework]

- time: 2026-10-17T19:41:44
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: M10 implementation
  affects: [m10-weather-framework]

- time: 2026-10-17T19:41:44
  kind: decision
  summary: "M10 shipped: weather keyed on elapsed gameMin (seed 271, lazy segments, interval lookups), forced debug override never rewrites segs, rain douses unsheltered fires (shelter r2.0, torches rain-proof, cook item stays raw), plantGrowthMult is a rain-weighted range average over (RAIN_GROWTH 1.5), sky/fog/sun/streak/HUD blend at ~1s (dt*3), smoke pins weather clear before M10 blocks"
  affects: [m10-weather-framework]
