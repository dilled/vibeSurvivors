---
id: m14-beach-air-wildlife
title: "M14 ‒ Beach/air wildlife: pelicans, gull nest + egg theft, expanded crabs (registry 7->8)"
category: decision
status: active
tags: [animals, m14, registry, pelicans, gulls, crabs, determinism]
created: "2026-10-17T22:00:01"
updated: "2026-10-17T22:00:27"
---

<!-- compiled_truth -->
## What shipped (M14 ‒ beach/air ecosystem)

M14 ships **3 pelicans (registry slot 7, the last)**, a **gull cliff nest with 3 eggs**, a **gull mob** of the point a pelican just dived, and an **expanded crab population (9 -> 15)** with a hide-from-lizard tell. All join via the [[m12-animal-framework]] shape (descriptor + spawn block + mesh builder + `step` hook, no bespoke world wiring). The registry grows **7 -> 8**; the pelican is `'late'` phase and registers **after the snakes** (the M13 smoke block asserts slots 4–6, so registration order is load-bearing). `frame()` is untouched. PLAN.md M14 gate "Beach/air ecosystem feels active" met; `smoke/run.mjs` has an M14 block.

## Pelican behaviour contract (3, `'late'`, day-active `dayFactor >= 0.5`)

- **Perches**: palm crowns ‒ the 3 tallest palms > 25 u from the spawn (perch anchors are seed-deterministic, no rng); if palms run out, a shallows anchor. Night: folded back to the perch.
- **Deep dive (the fish finder)**: dives a fish school within 40 u, takes **exactly one** fish, 25 s per-pelican cooldown; the strike point becomes the gull-mob point for 4 s; teaches "watch where it dives to find the fish".
- **Hand-steal**: raw fish in hand + within 12 u + cooldown clear triggers a **1.2 s hover telegraph** over the player's hand; **Space during the hover** flaps the pelican off (2 s flee, 30 s steal cooldown); otherwise the raw fish is taken.
- Flees high for 3 s from `panicWildlife` (the hook M14 extended with pelicans).

## Gull nest, anger, and the gull-vs-pelican fight (extends the M6/M11 gulls, not a new species)

- One seeded cliff nest (`heightAt >= 16`, >= 60 u from the spawn) holding **3 eggs**; `E` within 2.5 u takes one. `gullEgg` joins the inventory and the map-driven cook chain (`gullEgg -> gullEggCooked`); `V` becomes "eat hand food" ‒ crab first, then gull egg (10 hunger raw / 20 cooked).
- **Stealing an egg enrages the flock for one visible day** (`gullAngerUntil = gameMin + 1800`): the dive-bomb cooldown drops from 60 s to 8 s for that day, with a taught tell.
- **Gulls mob a pelican that has dived**: while the dive point is live, gulls converge within 25 u and hover over it; teaches "the fight shows where the fish were" ‒ the cross-species fish contest from [[animal-ecosystem-design]].

## Expanded crabs

- **9 -> 15** (6 M1 beach + 3 M6 night + 6 M14), beach band 0.35..1.5, 2.5 u spawn separation.
- **Hide-from-lizard tell**: a live big lizard hunting within 8 u (`CRAB_HIDE_R`) makes the crab scuttle 2 s into the sand + teaches "crabs hide when a big lizard is hunting nearby" ‒ ships the "crabs hide ⇔ big lizard near" tell from [[animal-ecosystem-design]] (the third shipped alarm tell after the monkey shriek, M13, and the gull mob, M14).

## Durable constraints

- Non-lethal to the player; no new lethal weapon (consistent with the read-and-counter rule in [[animal-ecosystem-design]]).
- **Determinism**: every M14 spawn `rng()` call (nest, the 6 extra crabs, the pelican shallows-anchor fallback) lives strictly **after the snake spawn block** (the last pre-M14 global-rng consumer) so the pre-M14 rng stream stays intact (keep it that way); the palm-crown perches are not random. `frame()` is untouched.
- Smoke: the M12 registry expectation grows 7 -> 8 with crab count 15; the M13 slot assertions are untouched; the new M14 block verifies the slot-7 pelican descriptor, perch invariants, nest invariants (3 eggs, cliff band, 60 u+ from spawn), dive-takes-exactly-one-fish + mob point + tell, gull mob convergence, and the hand-steal 1.2 s telegraph / Space counter.


## Timeline

- time: 2026-10-17T22:00:01
  kind: decision
  summary: "Created this page: M14 ‒ Beach/air wildlife: pelicans, gull nest + egg theft, expanded crabs (registry 7->8)"
  source: "commit 6665b91 (M14)"
  affects: [m14-beach-air-wildlife]

- time: 2026-10-17T22:00:27
  kind: decision
  summary: "M14 ‒ pelicans (registry slot 7), gull nest eggs with one-day theft anger, gull-mob of pelican dives, crabs 9 -> 15 with lizard-hide tell"
  source: "commit 6665b91 (M14)"
  affects: [m14-beach-air-wildlife]
