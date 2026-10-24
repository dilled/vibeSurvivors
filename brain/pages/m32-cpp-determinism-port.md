---
id: m32-cpp-determinism-port
title: "M32 ‒ Bit-exact C++ port of the deterministic stack: V8 libm gotchas (fdlibm trig, hypot) + ServerBase byte-identity gate"
category: decision
status: active
tags: [cpp, server, determinism, v8, m32]
created: "2026-10-24T15:33:48"
updated: "2026-10-24T15:34:17"
---

<!-- compiled_truth -->
## What landed

The pure world-gen stack (`mulberry32`, `hash2`, `vnoise`, `fbm`, `heightAt`, `scatter`) from `index.html` is now ported to C++20 in `../ServerBase/VibeSurvivorsPlugin` (`Determinism.hpp/.cpp`, namespace `vsurv::det`). The JS in `index.html` stays the single reference; the C++ port must be **bit-identical**, not merely close.

## The non-obvious V8 libm facts (the whole point of this page)

Bit-identity against Node/V8 is NOT achievable with `std::` math functions. Two traps, both cost ~1 ulp on ~3% of inputs:

1. **`Math.sin`/`Math.cos` do not call the platform libm.** V8 builtins call its own bundled fdlibm (`base::ieee754::fdlibm_sin`/`fdlibm_cos`, from `deps/v8/src/base/ieee754.cc`, BSD-licensed Sun fdlibm). This is the default in both Node and Chrome (`use_libm_trig_functions` is off by default). glibc's `sin`/`cos` disagree by 1 ulp on a large minority of arguments (observed ~593/20000 cos, ~603/20000 sin mismatches in [0, 2*pi)).
   - Fix: the fdlibm `sin`/`cos` (+ `__kernel_{sin,cos}`, both `rem_pio2` variants) are vendored into `VibeSurvivorsPlugin/src/V8Trig.cpp` (namespace `vsurv::det::v8trig`, declared in `V8Trig.hpp`). Verified bit-identical to Node `Math.sin`/`Math.cos` over 2M samples in the game's angle range.
2. **`Math.hypot` is a builtin, not libm.** V8 computes it in the stable ratio form `sqrt(r^2+1) * max` where `r = min/max`. glibc `hypot` returns exact 250 for `hypot(-240,-70)`; V8 returns `250.00000000000003`. `Determinism.cpp` uses a local `jsHypot2()` replicating V8's builtin instead of `std::hypot`.

Rule for future ports: any `Math.{sin,cos,tan,asin,acos,atan2,...}` in the pure stack needs the corresponding V8/fdlibm or builtin-algorithm counterpart, never `std::`.

## Test gates (in ServerBase, branch feature/auto-milestones-20260914-215319)

- **Byte-identity ctest** `vibs_determinism_matches_js_reference`: node `tests/vivs_det_dump.mjs` extracts the pure region **verbatim from index.html**, evaluates it in a sandbox, and dumps 14 sections (mulberry32 seed matrix, 97x97 hash2, 161x161 vnoise/fbm3/fbm5, 193x193 heightAt, two scatter streams + tail draws) as int32-count-prefixed LE double64; `VivsDetDump` (`tests/vivs_det_dump.cpp`) emits the C++ side; `cmp` must pass. Guarded on node + sibling index.html existing. Same pattern as the VibeCraft `vibe_world_matches_js_reference` gate.
- **Node-free goldens** `tests/test_vivs_determinism.cpp` (`VivsDeterminism.*` gtests): hard-coded first draws (incl. int32-edge seed -1), hash2/vnoise/fbm/heightAt goldens, scatter placement goldens + stream-continuity tail draws, and the private-stream shape (SEED+101) M33 plant spawning will use.

## Notes

- The port keeps JS `int32` semantics via uint32 arithmetic; `Math.PI` maps to `std::numbers::pi_v<double>` (same double literal).
- Scatter in C++ takes the rng by parameter (`scatter(rng, n, ...)`) instead of JS's module-global `rng`; behavior identical when the same stream is supplied (dumped stream continuity proves it).
- Side fix: `tests/test_vivs_determinism.cpp` hash2(0,0) golden was a transcription typo (0.8892...) corrected to the reference 0.748030913993716240 (== vnoise(0,0), as expected at integer corners).
- Side fix: stale `VibeWorldDump` binary from an older toolchain required GLIBC_2.38 (`__isoc23_strtoul`) on this glibc 2.36 box and broke `vibe_world_matches_js_reference`; forced rebuild with the current toolchain fixed it.


## Timeline

- time: 2026-10-24T15:33:48
  kind: decision
  summary: "Created this page: M32 ‒ Bit-exact C++ port of the deterministic stack: V8 libm gotchas (fdlibm trig, hypot) + ServerBase byte-identity gate"
  source: created via brain create-page
  affects: [m32-cpp-determinism-port]

- time: 2026-10-24T15:34:17
  kind: decision
  summary: "M32 complete: document the V8 libm gotchas and the ServerBase byte-identity gate for the C++ deterministic-stack port"
  source: M32 implementation session
  affects: [m32-cpp-determinism-port]
