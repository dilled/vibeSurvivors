// Headless smoke test for the game module (no browser needed):
//   node smoke/run.mjs
// Loads index.html's <script type="module"> with a stubbed three.js + DOM,
// pumps frames, then exercises the M0 core: deterministic island, spawn on
// beach, WASD movement on terrain, day/night time controls.
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

function makeEl() {
  return {
    style: {},
    addEventListener: () => {},
    appendChild: () => {},
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      measureText: () => ({ width: 10 }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {}, clearRect: () => {},
      beginPath: () => {}, arc: () => {}, fill: () => {},
      stroke: () => {}, fillText: () => {},
    }),
  };
}
const byId = {};
globalThis.document = {
  body: makeEl(),
  createElement: () => makeEl(),
  getElementById: (id) => (byId[id] ||= { style: {}, addEventListener: () => {}, textContent: '', innerHTML: '' }),
  addEventListener: () => {},
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.window = globalThis;
globalThis.location = { search: '', href: 'http://localhost/' };
globalThis.__rafCb = null;
globalThis.requestAnimationFrame = (cb) => { globalThis.__rafCb = cb; return 1; };

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
let patched = src.replace("from 'three'", "from './three-stub.mjs'");
patched += `
;
/* ---- smoke driver: island + movement + time (module scope) ---- */
{
  let __tt = 1000;
  const pump = (n) => { for (let i = 0; i < n; i++) { const cb = __rafCb; __rafCb = null; __tt += 16.7; if (cb) cb(__tt); } };
  firstNight = true;   // M6: suppress the scripted beat; its dedicated M6 block re-arms it
  pump(5); // one clean frame before asserting

  // deterministic island: center is land, edges are sea
  if (heightAt(0, 0) < 2) throw new Error('island center not land: ' + heightAt(0, 0));
  if (heightAt(ISLAND_R * 1.1, 0) > -1) throw new Error('past island edge should be seabed');

  // spawn washes ashore on a beach
  const sh = heightAt(spawn.x, spawn.z);
  if (sh < 0.4 || sh > 3.2) throw new Error('spawn not on beach: ' + sh.toFixed(2));

  // vegetation scattered from the seed
  if (palms.length < 60) throw new Error('too few palms: ' + palms.length);
  if (bigTrees.length < 60) throw new Error('too few big trees: ' + bigTrees.length);
  if (rocks.length < 100) throw new Error('too few rocks: ' + rocks.length);
  if (bigTrees.some((t) => t.h < 7 || t.h > 22)) throw new Error('big tree outside jungle placement band');
  if (bigTrees.some((t) => t.th < 6 || t.th > 10)) throw new Error('big tree trunk height out of range: ' + bigTrees.map((t) => t.th).join(','));

  // WASD: walk up the beach away from camera (-z), y follows terrain
  started = true; // a real keydown would do this; stub can't dispatch it
  const z0 = rig.position.z;
  keys['KeyW'] = true;
  pump(120);
  keys['KeyW'] = false;
  if (rig.position.z > z0 - 5) throw new Error('W did not move the player forward');
  const groundNow = Math.max(heightAt(rig.position.x, rig.position.z), WATER - 0.25);
  if (Math.abs(rig.position.y - groundNow) > 0.3) throw new Error('player not grounded: ' + rig.position.y.toFixed(2) + ' vs ' + groundNow.toFixed(2));

  // day: strong sun, bright sky; night: sun off, dark sky
  setClockP(0.33); pump(3);
  if (sun.intensity < 0.8) throw new Error('daytime sun too dim: ' + sun.intensity);
  const dayR = skyColor.r;
  setClockP(0.85); pump(3);
  if (sun.intensity !== 0) throw new Error('sun should be off at night');
  if (skyColor.r > dayR) throw new Error('night sky should be darker than day sky');
  setClockP(0.33); pump(3);

  /* ---- M1: survival ---- */

  // world placements are seeded
  if (schools.length !== 5) throw new Error('expected 5 fish schools: ' + schools.length);
  if (schools.some((s) => s.n < 8 || s.n > 13)) throw new Error('fish school size out of band');
  if (crabs.length !== 9) throw new Error('expected 9 crabs (6 beach + 3 M6 extras): ' + crabs.length);

  // stats tick down in real time; clock advances
  const th0 = stats.thirst, hu0 = stats.hunger, gm0 = gameMin;
  pump(30);
  if (stats.thirst >= th0) throw new Error('thirst should drain');
  if (stats.hunger >= hu0) throw new Error('hunger should drain');
  if (gameMin <= gm0) throw new Error('clock should advance');

  // fire + cook: teleport to the beach spawn, light a fire, cook a raw fish
  const gSpawn = Math.max(heightAt(spawn.x, spawn.z), WATER - 0.25);
  rig.position.set(spawn.x, gSpawn, spawn.z);
  INV.fishRaw = 1;
  actFire();
  if (fires.length !== 1) throw new Error('fire was not lit');
  if (fires[0].g < 0.35) throw new Error('fire lit in water');
  actUse();
  if (!fires[0].cooking) throw new Error('cooking did not start');
  pump(200); // > 2.5s cook
  if (INV.fishRaw !== 0 || INV.fishCooked !== 1) throw new Error('fish was not cooked: ' + INV.fishRaw + '/' + INV.fishCooked);

  // drink: find deep water, teleport, press E
  let wx = null, wz = null;
  outer: for (let r = 20; r < ISLAND_R * 1.05 && wx === null; r += 6) {
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (heightAt(x, z) < -0.8) { wx = x; wz = z; break outer; }
    }
  }
  if (wx === null) throw new Error('no water found for drink test');
  stats.thirst = 50;
  drinkCd = 0;
  rig.position.set(wx, Math.max(heightAt(wx, wz), WATER - 0.25), wz);
  actUse();
  pump(1);
  if (stats.thirst < 84) throw new Error('drink did not restore thirst: ' + stats.thirst.toFixed(1));

  // coconuts: shake a palm, wait for the drop, pick it up, eat it
  const palm0 = palms.find((p) => p.cocos === 2 && heightAt(p.x, p.z) >= 1);
  if (!palm0) throw new Error('no palm with coconuts on land');
  rig.position.set(palm0.x, Math.max(heightAt(palm0.x, palm0.z), WATER - 0.25), palm0.z);
  const huC = stats.hunger;
  actUse();
  if (items.length !== 1 || palm0.cocos !== 1) throw new Error('palm did not drop a coconut');
  pump(150); // fall from ~6m
  if (items[0].state !== 'ground') throw new Error('coconut did not land: ' + items[0].state);
  actUse();
  if (INV.coconut !== 1 || !items[0].taken) throw new Error('coconut was not picked up');
  eatCoconut();
  if (INV.coconut !== 0 || stats.hunger <= huC) throw new Error('eating a coconut did nothing');

  // spear + fish: craft the spear, teleport to a school, strike
  actCraftSpear();
  if (!spear || !spearMesh.visible) throw new Error('spear was not crafted');
  const s0 = schools[0];
  rig.position.set(s0.x, Math.max(heightAt(s0.x, s0.z), WATER - 0.25), s0.z);
  const n0 = s0.n;
  actStrike();
  if (INV.fishRaw !== 1 || s0.n !== n0 - 1) throw new Error('spear did not catch a fish');
  actStrike(); // on cooldown
  if (s0.n !== n0 - 1) throw new Error('strike cooldown not enforced');
  pump(100);

  // crabs: teleport next to one, E catches it (shakes nearby palms first if any)
  const crabT = crabs.find((c) => c.alive && Math.hypot(c.hx - spawn.x, c.hz - spawn.z) > 4);
  if (!crabT) throw new Error('no crab available for catch test');
  let cx = crabT.x + 1.2, cz = crabT.z;
  for (let k = 0; k < 8; k++) {   /* stand on dry sand, not in the drink band */
    const a2 = (k * Math.PI) / 4;
    const px = crabT.x + Math.cos(a2) * 1.2, pz = crabT.z + Math.sin(a2) * 1.2;
    if (heightAt(px, pz) >= 0.3) { cx = px; cz = pz; break; }
  }
  rig.position.set(cx, Math.max(heightAt(cx, cz), WATER - 0.25), cz);
  for (let i = 0; i < 12 && crabT.alive; i++) actUse();
  if (crabT.alive) throw new Error('crab was not caught');
  if (INV.crab !== 1) throw new Error('crab not added to inventory');

  // death + respawn
  stats.thirst = 0; stats.hunger = 0; stats.health = 0;
  pump(2);
  if (!dead) throw new Error('player should be dead at 0 health');
  if (deadEl.style.display !== 'flex') throw new Error('death overlay not shown');
  respawn();
  if (dead || stats.thirst !== 100 || stats.hunger !== 100 || stats.health !== 100) throw new Error('respawn did not restore stats');
  if (INV.coconut + INV.fishRaw + INV.fishCooked + INV.crab + INV.crabCooked !== 0) throw new Error('respawn should drop inventory');
  if (Math.abs(rig.position.x - spawn.x) + Math.abs(rig.position.z - spawn.z) > 0.01) throw new Error('respawn did not move player to spawn');
  const thR = stats.thirst;
  pump(30);
  if (stats.thirst >= thR) throw new Error('stats should tick again after respawn');

  // journal collected the learnings
  if (journal.length < 5) throw new Error('journal too short: ' + journal.length);

  /* ---- M2: camp spot + basic structures ---- */

  // camp in the water is rejected (reuse the deep-water point from the drink test)
  rig.position.set(wx, Math.max(heightAt(wx, wz), WATER - 0.25), wz);
  actCamp();
  if (camp !== null) throw new Error('camp should not be placed in the water');
  if (campCheck(wx, wz).ok) throw new Error('water should fail the camp check');

  // find a valid camp site: flat dry ground, clear of palms/trees/rocks
  let ccx = null, ccz = null;
  for (let r = 12; r < ISLAND_R * 0.85 && ccx === null; r += 4) {
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (campCheck(x, z).ok) { ccx = x; ccz = z; break; }
    }
  }
  if (ccx === null) throw new Error('no valid camp site found on the island');

  // establish camp: player position, grounded, faces the player heading
  const gC = Math.max(heightAt(ccx, ccz), WATER - 0.25);
  rig.position.set(ccx, gC, ccz);
  rig.rotation.y = 1.3;
  actCamp();
  if (!camp) throw new Error('camp was not established');
  if (Math.abs(camp.x - ccx) > 0.01 || Math.abs(camp.z - ccz) > 0.01) throw new Error('camp not at the player position');
  if (Math.abs(camp.g - heightAt(ccx, ccz)) > 0.01) throw new Error('camp not grounded: ' + camp.g.toFixed(2));
  if (Math.abs(camp.rot - 1.3) > 0.01) throw new Error('camp should face the player heading');
  if (camp.structures.shelter !== null || camp.structures.bed !== null) throw new Error('new camp should have no structures');
  const campRef = camp;
  actCamp();
  if (camp !== campRef) throw new Error('a second camp should not be placeable');

  // structures: shelter on the right of camp, bed in front; duplicates rejected
  const rx = Math.cos(camp.rot), rz = -Math.sin(camp.rot);
  rig.position.set(camp.x + rx * 2.6, Math.max(heightAt(camp.x + rx * 2.6, camp.z + rz * 2.6), 0), camp.z + rz * 2.6);
  actShelter();
  if (!camp.structures.shelter) throw new Error('shelter was not built');
  const shRef = camp.structures.shelter;
  actShelter();
  if (camp.structures.shelter !== shRef) throw new Error('shelter should not be built twice');
  rig.position.set(camp.x, camp.g, camp.z);
  actBed();
  if (!camp.structures.bed) throw new Error('bed was not built');
  const bedRef = camp.structures.bed;
  actBed();
  if (camp.structures.bed !== bedRef) throw new Error('bed should not be built twice');
  if (Math.hypot(shRef.position.x - (camp.x + rx * 2.6)) + Math.abs(shRef.position.z - (camp.z + rz * 2.6)) > 0.01)
    throw new Error('shelter not at the camp offset');

  // death -> respawn wakes at camp (the M1 ashore respawn was tested earlier, pre-camp)
  stats.thirst = 0; stats.hunger = 0; stats.health = 0;
  pump(2);
  if (!dead) throw new Error('player should be dead for the camp respawn test');
  respawn();
  if (dead) throw new Error('respawn failed');
  if (Math.abs(rig.position.x - camp.x) + Math.abs(rig.position.z - camp.z) > 0.01) throw new Error('respawn should wake at camp');
  if (Math.abs(rig.position.y - camp.g) > 0.3) throw new Error('camp respawn not grounded');
  pump(30);
  const thC = stats.thirst;
  pump(30);
  if (stats.thirst >= thC) throw new Error('stats should tick again after camp respawn');

  /* ---- M3: fence + camp light/fire integration ---- */

  // lit state tracks fires before the torch exists (no torch yet)
  if (campIsLit() !== fires.some((f) => Math.hypot(f.x - camp.x, f.z - camp.z) < 8))
    throw new Error('camp lit state should track nearby fires before the torch');

  // fence: built at camp, one per camp, posts ring the camp at ~4m
  rig.position.set(camp.x, camp.g, camp.z);
  actFence();
  if (!camp.structures.fence) throw new Error('fence was not built');
  const fenceRef = camp.structures.fence;
  actFence();
  if (camp.structures.fence !== fenceRef) throw new Error('fence should not be built twice');
  const fencePosts = fenceRef.children.filter((c) => c.userData.post);
  if (fencePosts.length < 14) throw new Error('fence has too few posts: ' + fencePosts.length);
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const p of fencePosts) {
    const dx = p.position.x - camp.x, dz = p.position.z - camp.z;
    if (Math.abs(wrapA(Math.atan2(dx, dz) - camp.rot)) < 0.35) throw new Error('a fence post blocks the camp entrance');
    if (Math.hypot(dx, dz) < 3.6 || Math.hypot(dx, dz) > 4.4) throw new Error('fence post not on the camp ring');
  }
  // rails: the fence has horizontal rails between kept posts
  const rails = fenceRef.children.filter((c) => !c.userData.post);
  if (rails.length < 24) throw new Error('fence has too few rails: ' + rails.length);

  // torch: standing camp light at the left offset; lights the camp
  const lrx = -Math.cos(camp.rot), lrz = Math.sin(camp.rot);
  rig.position.set(camp.x, camp.g, camp.z);
  actTorch();
  if (!camp.structures.torch) throw new Error('camp torch was not built');
  const torchRef = camp.structures.torch;
  actTorch();
  if (camp.structures.torch !== torchRef) throw new Error('torch should not be built twice');
  if (Math.hypot(torchRef.position.x - (camp.x + lrx * 2.0), torchRef.position.z - (camp.z + lrz * 2.0)) > 0.01)
    throw new Error('torch not at the camp offset');
  if (!campIsLit()) throw new Error('camp should be lit by its torch');

  // fire integration: a fire lit at the camp also lights it
  const nFires0 = fires.length;
  actFire();
  if (fires.length !== nFires0 + 1) throw new Error('fire at camp was not lit');
  if (!campIsLit()) throw new Error('camp should be lit by a fire burning in it');
  if (torchLights.length !== 1) throw new Error('torch should register exactly one standing light');

  /* ---- M4: sleep + night survival loop ---- */

  // clock to midnight; far from camp, sleep is rejected and the clock is untouched
  setClockP(0.85); pump(1);
  const farx = camp.x - 15;
  rig.position.set(farx, Math.max(heightAt(farx, camp.z), WATER - 0.25), camp.z);
  if (sleepCheck().ok) throw new Error('sleep should be rejected far from camp');
  const gmFar = gameMin;
  actSleep();
  if (gameMin !== gmFar) throw new Error('rejected sleep must not advance the clock');

  // at the camp but in the dark: rejected (null the torch, move the camp fire away)
  rig.position.set(camp.x, camp.g, camp.z);
  const tT = camp.structures.torch; camp.structures.torch = null;
  const farF = fires[fires.length - 1]; farF.x += 50;
  if (campIsLit()) throw new Error('camp should be dark with torch nulled and fire moved');
  if (sleepCheck().ok) throw new Error('sleep should be rejected in the dark');
  camp.structures.torch = tT; farF.x -= 50;
  if (!campIsLit()) throw new Error('camp should be lit again after restore');

  // no bed: rejected
  const tB = camp.structures.bed; camp.structures.bed = null;
  if (sleepCheck().ok) throw new Error('sleep should require a bed');
  camp.structures.bed = tB;

  // valid camp at night: allowed, and the context hint offers sleep
  if (!sleepCheck().ok) throw new Error('valid camp should allow sleep');
  pump(1);
  const hint = contextHint();
  if (!hint.startsWith('Z')) throw new Error('night hint should offer sleep: ' + hint);

  // sleep: jump to dawn, resting costs, rest recovery, wake on the bed
  const thS = stats.thirst, huS = stats.hunger, hpS = stats.health, gmS = gameMin;
  const pBefore = (p0 + gameMin / 1800) % 1;
  const dpExp = (0.05 - pBefore + 1) % 1;
  actSleep();
  const pAfter = (p0 + gameMin / 1800) % 1;
  if (Math.abs(pAfter - 0.05) > 0.001) throw new Error('sleep should land at dawn: ' + pAfter);
  if (Math.abs((gameMin - gmS) - dpExp * 1800) > 1) throw new Error('sleep did not advance the clock correctly');
  const realSec = (dpExp * 1800) / 1.2;
  const thExp = Math.max(0, thS - THIRST_RATE * realSec * 0.5);
  const huExp = Math.max(0, huS - HUNGER_RATE * realSec * 0.5);
  if (Math.abs(stats.thirst - thExp) > 1e-6) throw new Error('sleep thirst cost wrong: ' + stats.thirst + ' vs ' + thExp);
  if (Math.abs(stats.hunger - huExp) > 1e-6) throw new Error('sleep hunger cost wrong: ' + stats.hunger + ' vs ' + huExp);
  if (stats.health !== Math.min(100, hpS + 30)) throw new Error('sleep rest recovery wrong');
  const bo = campOffsets('bed');
  if (Math.abs(rig.position.x - bo.x) + Math.abs(rig.position.z - bo.z) > 0.01) throw new Error('did not wake on the bed');
  pump(2);
  if (sun.intensity <= 0) throw new Error('dawn after sleep should have sun');

  /* ---- M5: tiger (spawn, patrol/stalk/chase, retreat from fire) ---- */

  // deterministic spawn: 3 tigers in the jungle band, well clear of each other and of spawn
  if (tigers.length !== 3) throw new Error('expected 3 tigers: ' + tigers.length);
  if (tigers.some((t) => heightAt(t.hx, t.hz) < 7 || heightAt(t.hx, t.hz) > 20)) throw new Error('tiger home outside the jungle band');
  for (let i = 0; i < tigers.length; i++)
    for (let j = i + 1; j < tigers.length; j++)
      if (Math.hypot(tigers[i].hx - tigers[j].hx, tigers[i].hz - tigers[j].hz) < 55) throw new Error('two tigers spawn too close');
  if (tigers.some((t) => Math.hypot(t.hx - spawn.x, t.hz - spawn.z) < 55)) throw new Error('tiger too close to spawn');

  // gameMin accumulated across M0‒M4 (sleep lands p at dawn 0.05), so zero it
  // for setClockP to mean exactly what we ask for
  gameMin = 0;

  // day: tigers hide, standing still at home (player parked at spawn, 60m+ from all tigers)
  rig.position.set(spawn.x, Math.max(heightAt(spawn.x, spawn.z), WATER - 0.25), spawn.z);
  setClockP(0.33); pump(10);
  if (!tigers.every((t) => t.state === 'hide' && Math.hypot(t.x - t.hx, t.z - t.hz) < 1))
    throw new Error('day tigers should hide at home: ' + tigers.map((t) => t.state).join(','));
  const tStart = tigers.map((t) => ({ x: t.x, z: t.z }));

  // night: every tiger is active (patrolling, or fleeing if its territory touches a fire) and moving
  setClockP(0.85); pump(30);
  if (!tigers.every((t, i) => (t.state === 'patrol' || t.state === 'flee') &&
      Math.hypot(t.x - tStart[i].x, t.z - tStart[i].z) > 0.5))
    throw new Error('night tigers should move: ' + tigers.map((t) => t.state).join(','));

  // threat loop: approach a fire-free tiger; it stalks/closes, then strikes on contact
  const T = tigers.find((t) => t.state === 'patrol' && !nearFire(t.hx, t.hz, 25));
  if (!T) throw new Error('no fire-free tiger available for the threat test');
  let ax = T.hx + 12, az = T.hz;
  for (let k = 1; k < 16 && heightAt(ax, az) < 1; k++) {
    const a2 = (k * Math.PI) / 8;
    ax = T.hx + Math.cos(a2) * 12; az = T.hz + Math.sin(a2) * 12;
  }
  if (heightAt(ax, az) < 0.35) throw new Error('no dry ground near the tiger for the fire test');
  rig.position.set(ax, Math.max(heightAt(ax, az), WATER - 0.25), az);
  pump(90);
  if (T.state !== 'stalk' && T.state !== 'chase') throw new Error('tiger should stalk or chase: ' + T.state);
  if (Math.hypot(T.x - rig.position.x, T.z - rig.position.z) >= 10) throw new Error('tiger should have closed the distance');

  stats.health = 100; stats.thirst = 100; stats.hunger = 100;
  INV.coconut = 2;
  for (let i = 0; i < 30 && stats.health >= 80; i++) pump(20);
  if (stats.health >= 80) throw new Error('tiger never struck: ' + stats.health);
  if (INV.coconut !== 0) throw new Error('tiger attack should drop all carried loot');
  if (!learned.has('tiger')) throw new Error('tiger learn entry missing');

  // fire counter: light a fire where the tiger is striking; it retreats
  actFire();
  pump(6);
  if (T.state !== 'flee') throw new Error('tiger should flee the fire: ' + T.state);
  pump(150);
  if (nearFire(T.x, T.z, 10)) throw new Error('tiger should have retreated from the fire');

  // daylight: it returns to its territory and hides
  setClockP(0.33); pump(1200);
  if (T.state !== 'hide') throw new Error('day tiger should hide: ' + T.state);
  if (Math.hypot(T.x - T.hx, T.z - T.hz) > 1.5) throw new Error('day tiger should be at home');

  /* ---- M6: night-1 encounter (gulls, night crabs, first-night tiger beat) ---- */

  // reset state that M0‒M5 left behind
  gameMin = 0;
  stats.health = 100; stats.thirst = 100; stats.hunger = 100;
  INV.coconut = INV.fishRaw = INV.fishCooked = INV.crab = INV.crabCooked = 0;
  firstNight = true;   // suppress the scripted beat until its dedicated test

  // populations: 5 gulls in the beach/grass band; 6 beach + 3 extra crabs
  if (gulls.length !== 5) throw new Error('expected 5 gulls: ' + gulls.length);
  if (gulls.some((g) => heightAt(g.hx, g.hz) < 0.3 || heightAt(g.hx, g.hz) > 6))
    throw new Error('gull home outside the beach/grass band');
  if (crabs.length !== 9) throw new Error('expected 6 + 3 extra crabs: ' + crabs.length);

  // day: every gull is airborne and moving (hover-wander around home)
  rig.position.set(spawn.x, Math.max(heightAt(spawn.x, spawn.z), WATER - 0.25), spawn.z);
  setClockP(0.33); pump(10);
  const g0 = gulls.map((g) => ({ x: g.x, z: g.z }));
  pump(90);
  gulls.forEach((g, i) => {
    if (Math.hypot(g.x - g0[i].x, g.z - g0[i].z) < 0.1)
      throw new Error('day gull should be flying: ' + i);
  });

  // steal: exactly one carried food item, per-gull cooldown, learn entry
  const G = gulls[0];
  rig.position.set(G.hx, Math.max(heightAt(G.hx, G.hz), WATER - 0.25), G.hz);
  G.x = G.hx; G.z = G.hz;
  INV.coconut = 2;
  gulls.forEach((g) => { g.stealCd = (g === G) ? 0 : 99; g.diveTell = 0; });
  gullDiveCd = 60;
  pump(10);
  if (INV.coconut !== 1) throw new Error('gull should have stolen exactly one coconut: ' + INV.coconut);
  if (!learned.has('gull')) throw new Error('gull learn entry missing');

  // dive-bomb: telegraphed swoop rakes the head for exactly -8 HP (regen off)
  stats.health = 100; stats.thirst = 5; stats.hunger = 5;
  INV.coconut = 0;
  G.diveTell = 3;
  gullDiveCd = 60;
  pump(190);
  if (stats.health !== 92) throw new Error('dive-bomb should cost exactly 8 HP: ' + stats.health);

  // water scare: gulls scream and drift inland, one-time learn entry
  let swx = 0, swz = 0, foundW = false;
  for (let r = 2; r <= 20 && !foundW; r += 2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r;
      if (heightAt(x, z) >= 0 && heightAt(x, z) < 0.5) { swx = x; swz = z; foundW = true; break; }
    }
  }
  if (!foundW) throw new Error('no shallows found near spawn for the water tell');
  rig.position.set(swx, Math.max(heightAt(swx, swz), WATER - 0.25), swz);
  setClockP(0.33); pump(30);
  if (!learned.has('gullscare')) throw new Error('gullscare learn entry missing');
  if (gullWaterT <= 0) throw new Error('gulls should be drifting inland after the water scare');

  // night: gulls fly home and perch still (mirrors the tiger's hide)
  rig.position.set(spawn.x, Math.max(heightAt(spawn.x, spawn.z), WATER - 0.25), spawn.z);
  setClockP(0.85); pump(20);
  gulls.forEach((g) => {
    const l = Math.hypot(g.hx, g.hz) || 1;
    g.x -= (g.hx / l) * 3; g.z -= (g.hz / l) * 3;   // 3 m toward the island center (landward)
  });
  pump(240);
  if (!gulls.every((g) => Math.hypot(g.x - g.hx, g.z - g.hz) < 1))
    throw new Error('night gulls should perch at home');

  // crabs are bolder at night: path length over equal time is higher
  const crabPath = (frames) => {
    let s = 0;
    for (let i = 0; i < frames; i++) {
      const pre = crabs.map((c) => ({ x: c.x, z: c.z }));
      const cb = __rafCb; __rafCb = null; __tt += 16.7; if (cb) cb(__tt);
      s += crabs.reduce((a, c, i2) => a + Math.hypot(c.x - pre[i2].x, c.z - pre[i2].z), 0);
    }
    return s;
  };
  setClockP(0.33); pump(10);
  const dayPath = crabPath(120);
  setClockP(0.85); pump(10);
  const nightPath = crabPath(120);
  if (!(nightPath > dayPath * 1.4))
    throw new Error('night crabs should move faster: ' + nightPath + ' vs ' + dayPath);

  // scripted first-night beat: re-arm, park on dry ground clear of fire,
  // let night fall — the nearest tiger closes, the strike lands, fire burns it off
  firstNight = false;
  stats.health = 100; stats.thirst = 5; stats.hunger = 5;
  let bx = spawn.x, bz = spawn.z;
  outer: for (let r = 4; r <= 18; r += 2) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r;
      if (heightAt(x, z) >= 0.5 && nearestFire(x, z).d > 14 &&
          Math.hypot(x - camp.x, z - camp.z) > 12) { bx = x; bz = z; break outer; }
    }
  }
  rig.position.set(bx, Math.max(heightAt(bx, bz), WATER - 0.25), bz);
  setClockP(0.85); pump(1);
  const TN = tigers.reduce((a, b) =>
    Math.hypot(a.hx - camp.x, a.hz - camp.z) < Math.hypot(b.hx - camp.x, b.hz - camp.z) ? a : b);
  const beatD = Math.hypot(TN.x - rig.position.x, TN.z - rig.position.z);
  if (beatD > 15) throw new Error('first-night beat should place the tiger ~13 m away: ' + beatD.toFixed(1));
  pump(240);
  const struck = stats.health < 100;
  const closed = Math.hypot(TN.x - rig.position.x, TN.z - rig.position.z) < 14;
  if (!struck && !closed) throw new Error('first-night tiger should close in: ' + TN.state + ' hp=' + stats.health);
  actFire();
  pump(30);
  if (TN.state !== 'flee') throw new Error('tiger should flee the new fire: ' + TN.state);
  pump(150);
  if (nearFire(TN.x, TN.z, 10)) throw new Error('tiger should have retreated from the fire');

  /* ---- M7: vegetation framework (plant data, deterministic spawn, growth, harvest) ---- */

  stats.health = 100; stats.thirst = 100; stats.hunger = 100;
  setClockP(0.33); pump(10);   // day: tigers hide, nothing stalks

  const fiberPlants = plants.filter((p) => p.type === 'fiber');
  const shrubPlants = plants.filter((p) => p.type === 'shrub');
  const flowerPlants = plants.filter((p) => p.type === 'flower');
  if (fiberPlants.length < 20) throw new Error('too few fiber tufts: ' + fiberPlants.length);
  if (shrubPlants.length < 15) throw new Error('too few jungle shrubs: ' + shrubPlants.length);
  if (flowerPlants.length < 25) throw new Error('too few flowers: ' + flowerPlants.length);
  if (fiberPlants.some((p) => p.h < 0.5 || p.h > 5.5)) throw new Error('fiber outside its height band');
  if (shrubPlants.some((p) => p.h < 7 || p.h > 14)) throw new Error('shrub outside its height band');
  if (flowerPlants.some((p) => p.h < 1.5 || p.h > 15)) throw new Error('flower outside its height band');
  for (let i = 0; i < fiberPlants.length; i++)
    for (let j = i + 1; j < fiberPlants.length; j++)
      if (Math.hypot(fiberPlants[i].x - fiberPlants[j].x, fiberPlants[i].z - fiberPlants[j].z) < 4)
        throw new Error('two fiber tufts closer than minDist');
  const readyFrac = plants.filter((p) => p.state === 'ready').length / plants.length;
  if (readyFrac < 0.3) throw new Error('too few ready plants on day 1: ' + readyFrac);

  // instanced meshes sized per species
  if (plantMesh.tuft.count !== fiberPlants.length * 3) throw new Error('tuft mesh count wrong: ' + plantMesh.tuft.count);
  if (plantMesh.shrub.count !== shrubPlants.length) throw new Error('shrub mesh count wrong');
  if (plantMesh.head.count !== flowerPlants.length) throw new Error('flower head count wrong');

  // determinism: the first fiber spawn must be reproducible from the species' private stream
  {
    const def = PLANT_TYPES.fiber;
    const r = mulberry32(SEED + def.seedOffset);
    let first = null, tries = 0;
    while (!first && tries++ < 4000) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * ISLAND_R * 0.96;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (heightAt(x, z) < def.hmin || heightAt(x, z) > def.hmax) continue;
      first = { x, z };
    }
    if (Math.abs(first.x - fiberPlants[0].x) > 1e-9 || Math.abs(first.z - fiberPlants[0].z) > 1e-9)
      throw new Error('fiber spawn not reproducible from its private stream');
  }

  // harvest: uncontested ready tuft -> E -> +1 fiber, charge down, deplete at 0
  let F0 = null;
  outer7: for (const p of fiberPlants) {
    if (p.state !== 'ready' || p.chargesLeft !== PLANT_TYPES.fiber.charges || p.h < 0.35) continue;
    if (palms.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3.5)) continue;
    if (crabs.some((c) => c.alive && Math.hypot(c.x - p.x, c.z - p.z) < 1.5)) continue;
    if (fires.some((f) => Math.hypot(f.x - p.x, f.z - p.z) < 2.5)) continue;
    if (items.some((i) => !i.taken && i.state === 'ground' && Math.hypot(i.x - p.x, i.z - p.z) < 1.6)) continue;
    F0 = p; break outer7;
  }
  if (!F0) throw new Error('no uncontested ready fiber tuft for the harvest test');
  const tuftSets0 = plantMesh.tuft._count || 0;
  rig.position.set(F0.x, Math.max(F0.h, WATER - 0.25), F0.z);
  const fiber0 = INV.fiber;
  actUse();
  if (INV.fiber !== fiber0 + 1) throw new Error('fiber harvest did not land in inventory: ' + INV.fiber);
  if (F0.chargesLeft !== PLANT_TYPES.fiber.charges - 1) throw new Error('fiber charge not decremented');
  if (!learned.has('fiber')) throw new Error('fiber learn entry missing');
  while (F0.state === 'ready') actUse();
  if (F0.state !== 'depleted' || F0.chargesLeft !== 0)
    throw new Error('tuft should deplete at 0 charges: ' + F0.state + '/' + F0.chargesLeft);
  if ((plantMesh.tuft._count || 0) < tuftSets0 + 3) throw new Error('tuft matrix not re-emitted on depletion');

  // context hint fires at a ready harvestable plant
  let FH = null;
  outer8: for (const p of fiberPlants) {
    if (p.state !== 'ready' || p.h < 0.35) continue;
    if (palms.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3.5)) continue;
    if (crabs.some((c) => c.alive && Math.hypot(c.x - p.x, c.z - p.z) < 1.5)) continue;
    if (fires.some((f) => Math.hypot(f.x - p.x, f.z - p.z) < 2.5)) continue;
    if (items.some((i) => !i.taken && i.state === 'ground' && Math.hypot(i.x - p.x, i.z - p.z) < 1.6)) continue;
    if (tigers.some((t) => (t.state === 'stalk' || t.state === 'chase') && Math.hypot(t.x - p.x, t.z - p.z) < 12)) continue;
    FH = p; break outer8;
  }
  if (!FH) throw new Error('no uncontested ready fiber tuft for the hint test');
  rig.position.set(FH.x, Math.max(FH.h, WATER - 0.25), FH.z);
  if (!/harvest/.test(contextHint())) throw new Error('harvest context hint missing: ' + contextHint());

  // drop:null markers are not harvestable
  let FM = null;
  outer9: for (const p of flowerPlants) {
    if (p.state !== 'ready' || p.h < 0.35) continue;
    if (palms.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3.5)) continue;
    if (fiberPlants.some((q) => q.state === 'ready' && Math.hypot(q.x - p.x, q.z - p.z) < 1.6)) continue;
    FM = p; break outer9;
  }
  if (FM) {
    rig.position.set(FM.x, Math.max(FM.h, WATER - 0.25), FM.z);
    const fB = INV.fiber, st = FM.state;
    actUse();
    if (FM.state !== st || INV.fiber !== fB) throw new Error('drop:null flower should not be harvestable');
  }

  // growth is game-minute driven: one big jump (like actSleep's) fast-forwards everything
  gameMin = 0; pump(1);
  const G0 = fiberPlants.find((p) => p.state === 'growing');
  if (!G0) throw new Error('no growing fiber tuft left for the growth test');
  gameMin += 3000; pump(1);
  if (G0.state !== 'ready') throw new Error('growing tuft should be ready after a full regrow: ' + G0.state);
  if (F0.state !== 'ready' || F0.chargesLeft !== PLANT_TYPES.fiber.charges)
    throw new Error('depleted tuft should regrow and reset charges: ' + F0.state + '/' + F0.chargesLeft);

  // pre-M7 world untouched
  if (palms.length < 60 || bigTrees.length < 60 || rocks.length < 100) throw new Error('pre-M7 vegetation counts changed');
  if (crabs.length !== 9 || gulls.length !== 5 || tigers.length !== 3 || schools.length !== 5)
    throw new Error('pre-M7 populations changed');
}
`;
const file = join(here, '.game-smoke.mjs');
writeFileSync(file, patched);

try {
  await import(file);
  console.log('SMOKE_OK — module evaluated, island + movement + day/night clean');
} catch (e) {
  console.error('SMOKE_FAIL:', e);
  process.exitCode = 1;
} finally {
  try { writeFileSync(file, ''); } catch {}
}
