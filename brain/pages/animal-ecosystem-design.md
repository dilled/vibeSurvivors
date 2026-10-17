---
id: animal-ecosystem-design
title: The 10-species animal ecosystem is the core design
category: concept
status: active
created: "2026-09-14T18:41:08"
updated: "2026-10-17T21:20:37"
---

<!-- compiled_truth -->
The game's identity is its animal ecosystem, not the survival checklist. **10 species**: fish, crabs, seagulls, pelicans, monkeys, spiders, large lizards, snakes, tigers, sharks. Each species has: territory, day/night schedule, threat tier, a teachable audio tell, and its role in the food chain. One cross-species **alarm bus** carries events (scream / alert / attack / flee): gulls scream ⇒ shark in the water, monkeys shriek ⇒ tiger near, crabs hide ⇒ big lizard near, fish schools are contested by pelicans and gulls. Design rule: the player has **no lethal weapons** — counters are fire, smoke, torch, fence, timing, and knowledge; tigers/sharks are avoided or driven off, never killed. Camp placement is strategy: once territories are mapped (on the hand-drawn paper map — there is **no minimap**), the island's danger becomes legible.

This page is the design contract for the animal milestones M12–M17 (framework, species, alarm bus, ecosystem integration ‒ the old gate 'The island is alive'): every species listed in PLAN.md §5 must ship with territory, schedule, tells, and alarm-bus wiring.

**Framework contract (shipped in M12, [[m12-animal-framework]]):** every species is registered in the shared `animals[]` registry via `registerAnimal` as a descriptor (population array, home band, activity window, speeds, home-pull radius, terrain rule, threat/tell notes, frame phase) plus a per-species `step` hook, moving on the shared `homeWander`/`returnHome`/`faceHome`/`applyMove` helpers. Species run in two frame phases: `'early'` (fish, crabs) before weather/sky, `'late'` (tigers, gulls, and the M13 land species) after `updateSky`. Cross-species alarm-bus events build on the `panicWildlife` all-species hook pattern.

**Species shipped so far:** M13 ([m13-land-wildlife]) added monkeys (jungle-edge meat stealer, tiger-proximity shriek tell ‒ the first shipped alarm-bus tell, coconut bait), large lizards (tide-line crab hunter, dusk camp raid held out by fence AND fire), and snakes (reactive-only ambush, 0.8 s telegraph, venomous/harmless split) through the registry with no bespoke world wiring (registry 4 -> 7). Remaining species milestones: pelicans, expanded crabs, sharks (M14–M15) and the alarm bus itself (M16).


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
