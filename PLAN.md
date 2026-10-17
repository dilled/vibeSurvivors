# VibeSurvivors — Game Plan

**Genre:** 2.5D/3D survival — shipwreck on an unmapped island
**Stack (per house pattern, like vibeGTA / vibeCraft):** plain JS + **Three.js** (v0.158) vendored in `lib/`, single `index.html` + game JS, **no build step, no internet needed**. Multiplayer later via `../ServerBase` (C++20 uWebSockets plugin, like `VibeCraftPlugin`).
**Perspective:** 3D low-poly world rendered from a fixed angled/third-person camera ("2.5D"): you see real 3D, but the camera is locked to a comfortable oblique angle — no free-fly, no mouse-look.

---

## 1. Elevator Pitch

Your ship has wrecked on an island that is not on any map. Learn it slowly: what grows where, what eats what, what hunts at night. The island's 10 animal species and its vegetation — edible, poisonous, useful — are the game.

## 2. Core Loop

```
Wake → forage / fish / gather → cook → camp & build → night (danger) → repeat
Meta-goal: craft a raft → escape (story win). Endless mode: days survived.
```

- **0–10 min:** wash ashore, water, fire, first coconut, first fish. No recipe UI — the journal fills by doing.
- **Day:** resource + weather decisions (rain = wet fire but faster growth).
- **Night:** light/fuel/heat management; predators are active. Camp is your defensible space.
- **Win:** raft → sail off. **Endless:** same template, escalating animal pressure + shorter days + storms; score = days.

## 3. World

- One island per playthrough, **procedurally placed inside hand-authored layout archetypes** (3–5 archetypes; interior randomization). Deterministic seed (needed for the later server world-sync).
- Zones: **Beach/Shallows → Jungle Edge → Deep Jungle → Cliffs/Ridge**. Water: lagoon + reef shallows (swimmable, tide pools).
- **No minimap** — you draw your own paper map (canvas) as you discover landmarks, territories, and plant sites. The "unmapped island" fantasy is a feature.
- Day/night: ~20 min day, ~10 min night (endless). Sky, fog, and light color shift with time and weather.

## 4. Player

- Stats: **Hunger, Thirst, Health, Warmth, Fatigue, Wet** (rain/cold; wet kills fire and cools you).
- Tools, not weapons: stick → knife → spear → sling; **torch/fire/smoke are the universal animal counter**.
- Injuries: sprained leg (slow), infected wound (blood attracts sharks in water), burned hand (can't craft for X).
- Death: story mode → restart island, keep journal; endless → respawn at camp, lose carried loot.

## 5. Animals (10 species)

Each has **territory, schedule, fear/aggression logic, and teachable audio tells**. Alarm-bus: animals react to each other (monkey shriek → all alert; gulls scream → something in the water).

| Species | Zone | Schedule | Threat | Role |
|---|---|---|---|---|
| **Fish** 🐟 | shallows/lagoon | day schools, dawn/dusk bite | none (food) | **Primary food source:** spear them in the shallows; schools move, so you learn *where* to fish. Pelicans/gulls target the same fish — the water is contested. |
| **Crabs** 🦀 | beach, tide pools | dawn/dusk | none | Tutorial animal (easy catch, hand net). Their hiding = warning that a big lizard is near. |
| **Seagulls** 🕊️ | beach, cliffs | day | nuisance | Steal unguarded food; dive at heads. **Early warning of sharks** (screaming + diving). Nesting on cliffs: eggs = meat, but theft → dive-bombed for a day. |
| **Pelicans** 🦢 | lagoon, perched on palms | day | minor | The *strong* scavenger: steals fish out of your hand (timing mini-game), deep-dives at fish schools (watchable fish-finder). Gull vs pelican fights over fish — exploitable. |
| **Monkeys** 🐒 | jungle edge | day | nuisance (theft) | **Alarm network:** shriek = tiger near. Ignoring them is a player choice with consequences. Baitable with coconut to reveal an area. |
| **Spiders** 🕷️ | jungle edge, caves, camps | night (big ones) | low | Small webs = silk resource. One large tarantula-type hunts leftover meat near camps at night (clicking audio tells before encounter). Cave blind spiders = deep-jungle atmosphere. |
| **Large lizards** 🦎 | beach/jungle edge | day | **middle** | Monitor/Komodo-type. Faster than you for 3 seconds. Hunts crabs + gull eggs (food chain you can read). Visits unfortified shore camps at dusk if meat is present; fence + fire keeps it out. |
| **Snakes** 🐍 | deep jungle, cliffs | day+dusk | reactive | **Never strike first** — only if stepped on or cornered. The tax for walking the deep jungle with your eyes open. Some species harmless → fear calibration: learn which sounds are real. One deadly mistake = health, not death. |
| **Tigers** 🐯 | deep jungle | night + dawn/dusk | **apex** | 2–3 per island, territorial. Cannot be killed; **driven off by fire + smoke**. Caught → lose loot + injury. The whole camp-placement strategy is a conversation with the tiger's territory; night-watching maps its patrol. |
| **Sharks** 🦈 | reef/shallows | always, aggressive dawn/dusk | **apex (in water)** | Never enter water while aggro. Gulls screaming = shark. Injury blood = attraction. Curious → attack. The fear is *entering/leaving water at the wrong time* — they can't follow on land. |

**Meta-systems:**
1. **Ecosystem chain** (gulls→sharks, monkeys→tigers, crabs→lizards, fish→pelicans/gulls, meat→spiders/tigers). Change one link, the island visibly changes.
2. **Visible territories** once mapped → camp placement is strategy, not luck.
3. **Adaptation** (endless): the island you've survived adapts — more aggressive tigers, bolder pelicans.

## 6. Vegetation

- **Palm trees** (beach/jungle edge): coconuts (food, fallable by knocking), fiber from leaves. The archetypal island tree.
- **Big trees with lianas** (deep jungle): dense canopy, climbing access to high branches (liana vines as rope + climbing), hidden nests/caches; vines are the craftable **rope** source.
- **Plants** (generic + specific): fiber plants (rope/net), medicinal herbs (treat infection), thatch (shelter).
- **Flowers:** mostly atmosphere + markers. Some are **toxic-indicator flowers** (they grow near poison plants); one is a rare dye.
- **Edible vegetables:** 4–5 kinds across zones (sweet potato, yam, bananas, root veg, wild berries) — some need cooking (raw = weak effect or nausea).
- **Poisonous plants:** 3–5 kinds, visually similar to edibles at a glance (learned, not labeled). Mistake = nausea/vomiting (lose recently eaten food) or slow health drain; the journal records your mistakes permanently ("You now know: the purple-veined berry is wrong").
- **Growth system:** plants/veg regrow on ~day cycles; rain accelerates growth. Harvesting the same spot repeatedly depletes it.

## 7. Weather

- States: **Clear → Cloudy → Rain → Storm**, transitions on a seed-driven schedule (endless: frequency escalates).
- **Rain:** fire goes out unless under shelter (wet stat), plants grow faster, rivers/water level rises, night slightly less dangerous (rain masks fire/smoke).
- **Storm:** lightning (fires + panic in animals), heavy wind (palms drop coconuts — resource opportunity), lagoon surges (fish displaced; sharks bolder).
- Weather is legible: it's *predicted* by the animals before it hits (gulls move inland, monkeys hush, fish surface).

## 8. Crafting & Building (discovered, not shown)

| Tier | Examples |
|---|---|
| 1 | fire, stick, water container, rope (fiber/liana) |
| 2 | knife, spear, hand net, torch, bed |
| 3 | traps (crab/snare), throw stick, sling, smoke pot |
| 4 | fence, signal fire, rain shelter, camp fort (fence + fire + light) |
| 5 | **raft** (win) → boat (endless) |

- Heat is the player's language with the island: smoke/fire is the universal answer to every animal.
- Recipes discovered → journal entry; no recipe menu in v1 (a searchable journal view later).

## 9. Tech

### Client (vibeGTA / vibeCraft house pattern)
- `index.html` + `game.js`, Three.js r158 vendored in `lib/`. No build step, no npm, no internet.
- **2.5D camera:** 3D low-poly world, fixed oblique third-person camera (no free-look). Same feel as vibeCraft's voxel world but organic: low-poly palms/trees with lianas, instanced vegetation, simple skinned or boxy animals (house style).
- **World gen:** deterministic seeded generator (archetype layout + random interior) — the seed must be reproducible for server world-sync later.
- **Rendering budget:** instanced trees/rocks, merged vegetation meshes, no shadows in far zones, day/night via directional light + fog + sky color lerp. Target 60fps mid-range laptop.
- **Animals:** per-species finite state machine + a small **alarm bus** (events: scream, alert, attack, flee).
- **Audio:** every animal a distinct, teachable sound signature; night is carried by audio. (Audio via WebAudio, no assets beyond generated/short clips.)
- **Save:** localStorage (single-player); JSON snapshot at camp + night transition.

### Multiplayer — LATER, via `../ServerBase` (like VibeGTA/VibeCraft)
Follow the established pattern exactly (see `ServerBase/ReadMe.md`, `VibeCraftPlugin`):
- **New plugin:** `VibeSurvivorsPlugin` (C++20 executable inside `../ServerBase`, uWebSockets + zlib/lz4, own port + `Server.cfg`, self-signed certs).
- **Model:** v2-style relay — **the first client is world-authority** (owns island gen from the shared seed, owns animal sim and block/vegetation edits); the server relays ticks (~30 Hz) and **broadcasts the full applied-edit history on join/late-join** so every client converges to the same island.
- **Synced in v1-mp:** player presence (avatar, name tag, position ~30 Hz interpolated), shared world edits (harvest/plant/build/camp), animal state near the authority client, weather + time-of-day driven by the authoritative client.
- **Client hook:** `?mp=host:port` URL param exactly like vibeCraft; without it, pure single-player (server optional).
- **Session identity:** per-tab session, first-run name + avatar prompt stored in localStorage (house pattern).
- **Deliberately NOT in v1-mp:** inventory sync, death/respawn rules, shared journal, host-migration. Those come in mp v2+ if v1 lands.
- **Future (mp v2+), NOT now:** move to the **vibeGTA v3 model — server is world-authority**: the plugin owns world gen, animal sim, and world edits (applies them itself, rollbacks on rejection), clients upload their own-body state @30 Hz and the server plausibility-checks + stamps grants. Hard-version the protocol at the switch. v1-mp stays on the v2 relay model above.

### Sequencing decision
Ship **single-player first** (it must be fun with zero multiplayer), then the plugin. The deterministic-seed requirement in §3 is the *only* thing v1 must design for mp upfront.

## 10. Art & Audio Direction

- Low-poly, painterly, muted tropical palette. Day warm, night cold-blue — **audio carries the fear**.
- No blood; violence implied (missing coconut, shadow at the tree line, snapped twig).
- 30-second interactive opening: the wreck. No cutscenes.

## 11. Milestones

| Phase | Scope | Gate |
|---|---|---|
| **M0** ✅ | Three.js scaffold: island terrain, palms/trees, 2.5D camera, day/night | Walkable beach, sun sets |
| **M1** ✅ | Survival basics: stats, water, fire, coconut, spear, fish, first crab | 10-min playable fragment |
| **M2** ✅ | Camp build spot + simple building placement | Player can choose a camp location and place basic camp structures |
| **M3** ✅ | Fence + camp light/fire integration | Functional fenced and lit camp |
| **M4** ✅ | Sleep system + night survival loop | Player can sleep safely under valid camp conditions |
| **M5** ✅ | First tiger: spawn, movement, stalking/chasing, retreat from fire | Tiger creates a functional threat loop |
| **M6** ✅ | Night-1 encounter: tiger + crabs + gulls + balancing | First scary night; if not tense/fun, stop and fix before continuing |
| **M7** ✅ | Vegetation framework: deterministic spawning, plant data, growth/state system | Plants exist as a reusable gameplay system |
| **M8** ✅ | Edible + poisonous plants and vegetables | Foraging requires identification and risk/reward choices |
| **M9** ✅ | Medicinal plants + harvesting/regrowth | Plant resources support survival decisions over time |
| **M10** ✅ | Weather framework: clear/cloudy/rain | Weather transitions visibly and affects the island |
| **M11** ✅ | Storm gameplay + weather/survival interaction | Storm materially changes survival decisions |
| **M12** ✅ | Remaining animal framework + shared animal state/behaviour foundations | New animal species can be added without bespoke world logic |
| **M13** ✅ | Monkeys + large lizards + snakes | Land wildlife has distinct behaviours |
| **M14** | Seagulls + pelicans + expanded crabs | Beach/air ecosystem feels active |
| **M15** | Sharks + expanded fish ecosystem | Water ecosystem creates risk and opportunity |
| **M16** | Animal alarm bus + cross-species reactions | Animals react meaningfully to nearby threats/events |
| **M17** | Animal ecosystem integration + balancing | All 10 species coexist without obvious broken behaviour |
| **M18** | Paper map system | Player can navigate using an in-world paper map |
| **M19** | Journal + discoveries | Plants, animals and discoveries are recorded through gameplay |
| **M20** | Raft construction system | Player can gather/build all required raft components |
| **M21** | Escape/win sequence | Completed raft provides a working game ending |
| **M22** | Endless mode + adaptation/escalating pressure | Game can continue meaningfully after normal progression |
| **M23** | Audio pass | Island, weather, animals and survival actions have coherent audio feedback |
| **M24** | Performance pass: instancing, LOD, profiling | Stable target performance with full island systems active |
| **M25** | Save/load + respawn/recovery | Progress survives reload and failure states recover correctly |
| **M26** | Single-player v1 integration/polish | Complete single-player game passes end-to-end playthrough |
| **M27** | ServerBase `VibeSurvivorsPlugin` scaffold + protocol | Plugin builds and client can connect with `?mp=host:port` |
| **M28** | Multiplayer player presence + movement | 3 tabs see the same connected players |
| **M29** | Shared deterministic world state | 3 tabs converge on the same island/world state |
| **M30** | Multiplayer animals + gameplay event relay | Animal/gameplay events converge across clients |
| **M31** | Multiplayer integration + reconnect/testing | 3 tabs survive normal play/reconnect without world divergence |

## 12. Dev conventions

- **Smoke test (no browser):** `node smoke/run.mjs` — extracts the inline module from index.html, stubs three.js (`smoke/three-stub.mjs`) + DOM, pumps frames, asserts island/spawn/vegetation/movement/day-night + M1 survival (stats tick, fire+cook, drink, coconut shake/pickup/eat, spear+fish, crab catch, death/respawn) + M2 camp (camp spot validation/placement, shelter/bed structures, respawn at camp) + M3 camp fence/torch (fence ring with entrance gap, standing camp torch, camp lit state) + M4 sleep (rejection cases, dawn clock jump, resting costs, wake on the bed). Must print `SMOKE_OK`.
- **Dev URL params:** `?t=0..1` set time of day, `?start=1` skips the title overlay. Debug keys in-game: `T` +15 min, `1/2/3/4` dawn/noon/dusk/midnight, `R` respawn.
- **Headless render check:** `python3 -m http.server 8901 &` then `google-chrome --headless=new --no-sandbox --disable-gpu --enable-unsafe-swiftshader --window-size=960,600 --screenshot=/tmp/shot.png "http://127.0.0.1:8901/?t=0.33&start=1"`.
- **World gen must stay deterministic** (`mulberry32(SEED)`) — ServerBase world-sync (M27+) depends on it.
