---
id: mobile-controls
title: "Mobile/touch controls: virtual stick + action grid on coarse-pointer devices (no desktop change)"
category: decision
status: active
tags: [touch, mobile, input, ui]
created: "2026-11-06T20:35:41"
updated: "2026-11-06T20:35:59"
---

<!-- compiled_truth -->
Mobile/touch controls exist as a separate input layer in index.html (desktop keyboard/mouse path is untouched).

Detection: IS_TOUCH = matchMedia('(pointer: coarse)') OR 'ontouchstart' in window OR ?touch=1 URL param (dev/force). Under the node smoke stub IS_TOUCH is false, so the whole touch layer is inert there.

Layout (static HTML in #touchui, shown + body.touch class only when IS_TOUCH):
- Virtual stick: #stickbase/#stickknob bottom-left; fills normalized touchStick {x,y}; frame() adds it to the same camera-relative mx/mz as WASD (threshold mag>0.2); stick feed is the only difference in the movement math.
- RUN: round toggle above the stick sets touchSprint; included in the speed picks (8.5/5.5, raft 6.0/4.0) and in mpLocalRun, so MP action state matches.
- Camera: touch-drag on the canvas (not the joystick) orbits camYaw/camPitch with the exact mouse-drag factors (0.0032, clamps CAM_PITCH_MIN/MAX).
- Action grid #actgrid (3x4): USE(actUse), EAT(eatBest), FIRE(actFire), STRIKE(actStrike), CRAFT(actCraftSpear), SLEEP(actSleep), CAMP(actCamp), HERB(useHerb), ROPE(actCraftRope), RAFT(actBuildRaft), MAP(toggleMap), LOG(toggleJournal). Each fires the same function as its key (interactT poses included).
- eatBest(): one smart meal for the EAT button = cooked fish > cooked crab > coconut > eatGathered(); the C/F/V/Q keys keep their own behaviour.
- Overlays: first touch anywhere (including the stick) starts the game via touchBeginGame() (mirrors first-key: started, audioInit, bootSave continue); title card key list is swapped for a touch guide; NEW ISLAND button when a save exists; #dead gains a RISE button (respawn); the #won card gains STAY-ENDLESS / NEW GAME buttons via delegated touchstart (id-based, since winEscape rebuilds its innerHTML).
- Hints: hintTouch() translates standalone uppercase key tokens in contextHint() to button labels (C/F/V/Q -> EAT first) when IS_TOUCH.
- CSS: body.touch lifts #hint/#toasts above the grid (bottom 240px), shrinks #hud font, and scales the title h1 for portrait.

Debug/test handle: window.__vsv = { started, pos, cam, stick } for CDP checks.

Verification: smoke/run.mjs asserts IS_TOUCH is false in node and that touchStick drives the same movement path (position restored after); CDP drive (headless chrome, Input.dispatchTouchEvent) verified first-tap start, stick movement, stick reset, touch camera orbit, STRIKE tap, and EAT toast.


## Timeline

- time: 2026-11-06T20:35:41
  kind: decision
  summary: "Created this page: Mobile/touch controls: virtual stick + action grid on coarse-pointer devices (no desktop change)"
  source: created via brain create-page
  affects: [mobile-controls]

- time: 2026-11-06T20:35:59
  kind: decision
  summary: Rewrote compiled_truth to the new best understanding
  source: "mobile controls task (post-M45)"
  affects: [mobile-controls]
