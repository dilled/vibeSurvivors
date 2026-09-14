---
slug: background
title: Project background
role: project background
updated: "2026-09-14T18:41:07"
---

# Project background

## Why

VibeSurvivors is a 2.5D/3D survival game: the player is shipwrecked on an island that is on no map. The identity of the game is *learning the island* — its vegetation (edible, poisonous, useful) and its 10 animal species, each with territory, schedule, and teachable audio tells. Victory: build a raft and escape. Endless mode: days survived.

## Goals

- Playable single-player survival loop: forage/fish/gather → cook → camp → survive night → repeat.
- Animals are the game: every encounter is read, predicted, and countered with fire/smoke — not combat-killed.
- One island per playthrough, deterministic seeded generation (required for later multiplayer world-sync).
- Ship single-player first; multiplayer is explicitly a later milestone.
- Zero infrastructure to run: open the page and play (no build step, no server, no internet).

## Non-goals

- No weapons/kill-the-predator fantasy: tools are stick/knife/spear/sling + fire; tigers and sharks are avoided or driven off, not slain.
- No minimap/GPS: navigation is a hand-drawn paper map the player fills in.
- No recipe menus: crafting is discovered and recorded in the journal.
- v1 multiplayer is NOT inventory/journal/death-sync (presence + shared world + animals only).

## Target user

Solo browser player, mid-range laptop, 60fps target. Session shape: short day-loop play (20-min day / 10-min night). House-pattern sibling games: vibeGTA, vibeCraft.
