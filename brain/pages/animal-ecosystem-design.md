---
id: animal-ecosystem-design
title: The 10-species animal ecosystem is the core design
category: concept
status: active
created: "2026-09-14T18:41:08"
updated: "2026-10-17T23:23:06"
---

<!-- compiled_truth -->
The game's identity is its animal ecosystem, not the survival checklist. **10 species**: fish, crabs, seagulls, pelicans, monkeys, spiders, large lizards, snakes, tigers, sharks. Each species has: territory, day/night schedule, threat tier, a teachable audio tell, and its role in the food chain. One cross-species **alarm bus** carries events (scream / alert / attack / flee): gulls scream ⇔ shark in the water, monkeys shriek ⇔ tiger near, crabs hide ⇔ big lizard near, fish schools are contested by pelicans and gulls. Design rule: the player has **no lethal weapons** ‒ counters are fire, smoke, torch, fence, timing, and knowledge; tigers/sharks are avoided or driven off, never killed. Camp placement is strategy: once territories are mapped (on the hand-drawn paper map ‒ there is **no minimap**), the island's danger becomes legible.

This page is the design contract for the animal milestones M12–M17 (framework, species, alarm bus, ecosystem integration ‒ the old gate 'The island is alive'): every species listed in PLAN.md ¤5 must ship with territory, schedule, tells, and alarm-bus wiring. **All 10 species are now shipped (M17 closed the contract); no animal milestone remains.**

**Framework contract (shipped in M12, [[m12-animal-framework]]):** every species is registered in the shared `animals[]` registry via `registerAnimal` as a descriptor (population array, home band, activity window, speeds, home-pull radius, terrain rule, threat/tell notes, frame phase) plus a per-species `step` hook, moving on the shared `homeWander`/`returnHome`/`faceHome`/`applyMove` helpers. Species run in two frame phases: `'early'` (fish, crabs, sharks) before weather/sky, `'late'` (tigers, gulls, and the M13/M14/M17 species) after `updateSky`. Cross-species alarm-bus events build on the `panicWildlife` all-species hook pattern.

**Species shipped:** M13 ([[m13-land-wildlife]]) added monkeys (jungle-edge meat stealer, tiger-proximity shriek tell, coconut bait), large lizards (tide-line crab hunter, dusk camp raid held out by fence AND fire), and snakes (reactive-only ambush, 0.8 s telegraph, venomous/harmless split) (registry 4 -> 7). M14 ([[m14-beach-air-wildlife]]) added pelicans (palm-crown perches, deep-dive fish finder, 1.2 s hover steal countered by Space), the gull cliff nest with 3 stealable eggs (theft = one visible day of dive-bombing), the gull mob of a pelican's dive point, and crabs 9 -> 15 with the hide-from-lizard tell (registry 7 -> 8, pelican slot 7 after the snakes). M15 ([[m15-sharks-fish-ecosystem]]) added the 2 never-killable reef sharks (registry slot 8, `'early'`: patrol/curious/bite FSM, 0.7 s lunge telegraph, in-water-only bites, festering-wound blood draw, storm-bold, aggressive dawn/dusk) and the expanded fish ecosystem (slow school regeneration, dawn/dusk double-bite spear) (registry 8 -> 9). Shipped alarm tells so far: monkey tiger-proximity shriek (M13), gull mob of a pelican dive and crab hide from a big lizard (M14), gulls screaming while a shark circles an in-water player (M15, completing the M6 water-scare placeholder). M16 ([[m16-animal-alarm-bus]]) shipped the **cross-species alarm bus itself**: a small deterministic `alarms[]` bus (`alarmRaise`/`alarmsNear`/`updateAlarms`, one decay per frame before both animal phases, no rng) where the six tell moments emit (`scream`: monkey shriek, curious-shark edge, gull dive; `attack`: shark bite, tiger strike; `alert`: `panicWildlife`) and six species react ‒ crabs bolt from every alarm (new `crabalarm` tell), monkeys freeze facing the alarm, lizards scare-flee, snakes freeze, pelicans flee, fish schools scatter (new `fishscatter` tell). All reactions are additive, so the M12–M15 behaviour holds. M17 ([[m17-spider-ecosystem-integration]]) added the **spider** (registry slot 9, `'late'`, pop 3): night-only, non-lethal, creeps into an unlit camp near the player and snipes one leftover meat item after a 0.9 s clicking tell (front legs raised); a lit fire or torch is the counter (no fence needed); alarm-bus reaction only. Cave blind spiders and the silk resource are deferred (no cave terrain; no crafting until M20).


## Timeline

- time: 2026-09-14T18:41:08
  kind: decision
  summary: "Created this page: The 10-species animal ecosystem is the core design"
  source: "PLAN.md §5"
  affects: [animal-ecosystem-design]

- time: 2026-09-14T18:41:40
  kind: decision
  summary: "10 species + alarm bus + read-and-counter (no lethal) rule"
  source: "PLAN.md §5"
  affects: [animal-ecosystem-design]

- time: 2026-09-14T18:41:54
  kind: decision
  summary: "10 species + alarm bus + read-and-counter (no lethal) rule"
  source: "PLAN.md §5"
  affects: [animal-ecosystem-design]

- time: 2026-10-17T14:35:38
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [animal-ecosystem-design]

- time: 2026-10-17T14:36:48
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: brain update-truth
  affects: [animal-ecosystem-design]

- time: 2026-10-17T20:44:31
  kind: decision
  summary: "M12 framework shipped: framework contract for M13+ species added, points to m12-animal-framework"
  source: "commit c6ade32 (M12)"
  affects: [animal-ecosystem-design]

- time: 2026-10-17T21:20:37
  kind: decision
  summary: "M13 shipped: monkeys, large lizards, snakes joined the registry (4->7); monkey tiger-proximity shriek tell is live; remaining: pelicans, expanded crabs, sharks, alarm bus"
  source: "commit e85ab49 (M13)"
  affects: [animal-ecosystem-design]

- time: 2026-10-17T22:00:47
  kind: decision
  summary: "M14 shipped: pelicans (slot 7), gull nest eggs + one-day theft anger, gull-mob of pelican dives, crabs 9 -> 15 with lizard-hide tell; registry 7 -> 8; only sharks and the alarm bus remain"
  source: "commit 6665b91 (M14)"
  affects: [animal-ecosystem-design]

- time: 2026-10-17T22:26:23
  kind: decision
  summary: "M15 shipped: 2 never-killable reef sharks (registry slot 8, 'early') + expanded fish ecosystem; gull-scream tell now live; only the alarm bus (M16) and integration (M17) remain"
  source: "commit 567fd76 (M15)"
  affects: [animal-ecosystem-design]

- time: 2026-10-17T22:56:24
  kind: decision
  summary: "M16 shipped: the cross-species alarm bus is live (see m16-animal-alarm-bus); remaining is only M17 ecosystem integration/balancing"
  source: "commit 8532b15 (M16)"
  affects: [animal-ecosystem-design]

- time: 2026-10-17T23:22:47
  kind: decision
  summary: "M17 shipped: the spider (10th species, registry slot 9 'late', night-only non-lethal meat-sniper with a 0.9 s clicking tell, fire/torch counter, alarm-bus reaction only) completes the 10-species contract; M12-M17 all done, all 10 species coexist"
  source: M17 implementation session
  affects: [animal-ecosystem-design]

- time: 2026-10-17T23:23:06
  kind: decision
  summary: "M17 complete: spider shipped as the 10th species; all 10 species now shipped, no remaining animal milestone"
  source: M17 implementation session
  affects: [animal-ecosystem-design]
