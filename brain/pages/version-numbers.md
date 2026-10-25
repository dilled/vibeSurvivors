---
id: version-numbers
title: "Version numbers: client 1.0.0 + plugin 1.0.0"
category: decision
status: active
created: "2026-10-25T18:11:21"
updated: "2026-10-25T20:13:18"
---

<!-- compiled_truth -->
## Version numbers

The project has a simple two-sided version number, both starting at **1.0.0**:

- **Client:** `const VERSION = '1.0.0'` at the top of the module in `vibeSurvivors/index.html` (next to `SEED`). It is rendered into the **title-card sub line** (`#subline`, above the key list): `shipwreck ‒ an unmapped island ‒ v1.0.0`. (An earlier bottom-left corner badge `#verline` was tried and removed ‒ the sub line is the one place, chosen because the corner badge was too easy to miss.)
- **Server plugin:** `inline constexpr const char* kPluginVersion = "1.0.0";` in `ServerBase/VibeSurvivorsPlugin/include/VibeSurvivorsPlugin/Version.hpp`. The startup banner in `VivsModule.cpp` logs `Server started (plugin v1.0.0, world seed ...)`.

Bump rule: bump both constants together when a change is worth announcing. Protocol/world-gen behavior changes are **protocol-version** territory (protocol v2 in the join message), not plugin-version territory; the plugin version is the product version, not the wire version.

Headless-verification note: `google-chrome --headless ... --screenshot` without `--virtual-time-budget` can capture the frame before the deferred module runs, so JS-set content (like this line) may be missing from the screenshot even though the page is correct. Use `--virtual-time-budget` (or `--dump-dom` with the budget) when verifying JS-rendered DOM in headless.


## Timeline

- time: 2026-10-25T18:11:21
  kind: decision
  summary: "Created this page: Version numbers: client 1.0.0 + plugin 1.0.0"
  source: created via brain create-page
  affects: [version-numbers]

- time: 2026-10-25T18:11:33
  kind: decision
  summary: "Versioning convention: client + server plugin both start at 1.0.0; client shows it on the page, plugin logs it at startup"
  source: brain update-truth
  affects: [version-numbers]

- time: 2026-10-25T20:13:18
  kind: decision
  summary: "Version moved into the title-card sub line (SHIPWRECK - AN UNMAPPED ISLAND - V1.0.0); the bottom-left corner badge is removed"
  source: brain update-truth
  affects: [version-numbers]
