---
id: m19-journal-discoveries
title: "M19 ‒ Journal + discoveries: viewable field journal (I), structured {cat, msg, day} entries, first-sighting discoveries, player-side state only"
category: decision
status: active
tags: [m19, journal, ui, discovery]
created: "2026-10-18T00:04:07"
updated: "2026-10-18T00:04:38"
---

<!-- compiled_truth -->
M19 = journal + discoveries. Scope: plants, animals and discoveries are recorded through gameplay (PLAN.md M19 row). Shipped `8c23a63`. The M6 toast-only journal became a **viewable field journal**, and first-sighting discoveries were added to close the core gameplay gap (seeing a species recorded it, previously only event-tells did).

**Key `I` opens/closes the field journal** (death-guarded; auto-closes on death). Parchment-styled overlay div at z-index 15, matching the M18 paper-map look, grouped into four categories (Plants / Animals / Weather / Survival) with `day N ‒ msg` rows and an "N more to learn" line per category from a **static still-to-learn catalog** (plant species + cook/poison keys, the 10 `see-<id>` keys, the 6 weather tells).

**Entries are structured `{cat, msg, day}`**, not raw strings. `catOf(key)` buckets the 55+ existing learn keys: plants = PLANT_TYPES keys + `eat-*` + `herb-cure`; animals = the 10 species ids + all behaviour tell keys + `bite`/`blood` + `see-*`; weather = storm/lightning/wind/wet/lagoon/rain; everything else is survival. **`learn()` signature, dedupe and toast are untouched** ‒ only the pushed entry shape changed. The two direct `journal.push` sites (fire lit, spear crafted) were converted to `logLine(msg, 'survival')`. No existing event-learn triggers changed.

**Day is derived, never counted:** `dayOf() = floor((p0*1800 + gameMin) / 1800) + 1`, from the same clock the HUD uses, so day numbers survive `?t=` starts, T skips, and sleep jumps.

**First-sighting discoveries:** `journalTick(dt)` scans the M12 animal registry and records `see-<id>` once per species when any live instance is within **SIGHT_R = 30 u** of the player (fish via their school anchors `bx/bz`, same convention as the M18 map). Message = `SEE_MSG` species line + zone word from `zoneAt()`.

**Deliberate constraints (the durable part):**
- **Pure player-side runtime state, exactly like M18's map and the journal/learned sets:** no rng, no world mutation, and **no saving hook ‒ M25 owns save/load**, so nothing journal-related is persisted.
- `frame()` gains exactly one call: `journalTick(dt)` right after `mapTick(dt)`.

**Smoke (new M19 block in `smoke/run.mjs`):** structured entry + dedupe, `catOf` spot checks, a controlled-state crab-park sighting with expected-in-range count + idempotency, toggle/render shows all four categories + day rows, death auto-close, snapshot/restore of state, 10-species registry assert still holds, 0 `rng()` calls in the section. SMOKE_OK (execution proven via a temporary marker, then reverted).

**Verification note:** headless screenshots are not runnable on this host (no Chrome ‒ M17/M18 precedent); the journal render is exercised via the stub DOM instead.


## Timeline

- time: 2026-10-18T00:04:07
  kind: decision
  summary: "Created this page: M19 ‒ Journal + discoveries: viewable field journal (I), structured {cat, msg, day} entries, first-sighting discoveries, player-side state only"
  source: "PLAN.md M19 row; commit 8c23a63"
  affects: [m19-journal-discoveries]

- time: 2026-10-18T00:04:38
  kind: decision
  summary: "Filling compiled_truth from PLAN.md M19 row + committed implementation (8c23a63)"
  source: "PLAN.md M19; commit 8c23a63"
  affects: [m19-journal-discoveries]
