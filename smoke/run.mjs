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
  setWeatherDebug('clear');   // M10: pin weather so pre-M10 blocks stay dry (schedule tested in the M10 block)

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
  if (crabs.length !== 15) throw new Error('expected 15 crabs (6 beach + 3 M6 + 6 M14): ' + crabs.length);

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
  INV.herb = 1;   // M9: strike must drop herbs and infect the wound
  for (let i = 0; i < 30 && stats.health >= 80; i++) pump(20);
  if (stats.health >= 80) throw new Error('tiger never struck: ' + stats.health);
  if (INV.coconut !== 0) throw new Error('tiger attack should drop all carried loot');
  if (!learned.has('tiger')) throw new Error('tiger learn entry missing');
  if (INV.herb !== 0) throw new Error('tiger attack should drop herbs too');
  if (!infectedWound) throw new Error('tiger strike should infect the wound');
  if (!learned.has('infection')) throw new Error('infection learn entry missing');

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
  infectedWound = false;   // M9: clear the M5 strike infection before the exact-HP dive test
  INV.coconut = INV.fishRaw = INV.fishCooked = INV.crab = INV.crabCooked = 0;
  firstNight = true;   // suppress the scripted beat until its dedicated test

  // populations: 5 gulls in the beach/grass band; 6 beach + 3 M6 + 6 M14 crabs
  if (gulls.length !== 5) throw new Error('expected 5 gulls: ' + gulls.length);
  if (gulls.some((g) => heightAt(g.hx, g.hz) < 0.3 || heightAt(g.hx, g.hz) > 6))
    throw new Error('gull home outside the beach/grass band');
  if (crabs.length !== 15) throw new Error('expected 6 + 3 + 6 crabs: ' + crabs.length);

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
  infectedWound = false;   // M9: M5 strike infects; clear so the harvest hint test sees its own line
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

  // instanced meshes sized per kind across ALL species of that kind (M8)
  const kindCount = (k) => plants.filter((p) => PLANT_TYPES[p.type].kind === k).length;
  if (plantMesh.tuft.count !== kindCount('tuft') * 3) throw new Error('tuft mesh count wrong: ' + plantMesh.tuft.count);
  if (plantMesh.shrub.count !== kindCount('shrub')) throw new Error('shrub mesh count wrong');
  if (plantMesh.head.count !== kindCount('flower')) throw new Error('flower head count wrong');

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
  gameMin += 3600; pump(1);   // 2.5 days: covers M9's worn (1.5x) regrow of a just-depleted tuft
  if (G0.state !== 'ready') throw new Error('growing tuft should be ready after a full regrow: ' + G0.state);
  if (F0.state !== 'ready' || F0.chargesLeft !== PLANT_TYPES.fiber.charges)
    throw new Error('depleted tuft should regrow and reset charges: ' + F0.state + '/' + F0.chargesLeft);

  // pre-M7 world untouched
  if (palms.length < 60 || bigTrees.length < 60 || rocks.length < 100) throw new Error('pre-M7 vegetation counts changed');
  if (crabs.length !== 15 || gulls.length !== 5 || tigers.length !== 3 || schools.length !== 5)
    throw new Error('pre-M7 populations changed');

  /* ---- M8: edible + poisonous plants (forage, Q eating, vomit/drain, cook) ---- */

  // slot allocation: no two plants share a slot; fiber keeps its M7 0-based slots
  {
    const seen = new Set();
    for (const p of plants) {
      if (seen.has(p.slot)) throw new Error('duplicate plant slot: ' + p.slot);
      seen.add(p.slot);
    }
    if (!fiberPlants.every((p) => p.slot === p.si)) throw new Error('fiber slots no longer 0-based (M7 regression)');
  }

  // the 7 new species: counts, height bands, minDist minimums
  const m8spec = { sweetpotato: [30, 0.8, 5.0, 5], wildberry: [30, 4, 7, 5], banana: [25, 8, 13, 6],
                  yam: [25, 11.5, 15.8, 6], poisonberry: [18, 4, 7, 5], poisonfern: [18, 0.8, 5.0, 5],
                  poisonyam: [15, 11.5, 15.8, 6] };
  for (const [id, [count, hmin, hmax, minDist]] of Object.entries(m8spec)) {
    const list = plants.filter((p) => p.type === id);
    if (list.length < Math.floor(count * 0.7)) throw new Error('too few ' + id + ': ' + list.length);
    if (list.some((p) => p.h < hmin || p.h > hmax)) throw new Error(id + ' outside its height band');
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z) < minDist)
          throw new Error('two ' + id + ' closer than minDist');
  }

  // first-spawn determinism for one new species (poisonberry, private stream)
  {
    const def = PLANT_TYPES.poisonberry;
    const r = mulberry32(SEED + def.seedOffset);
    let first = null, tries = 0;
    while (!first && tries++ < 4000) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * ISLAND_R * 0.96;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (heightAt(x, z) < def.hmin || heightAt(x, z) > def.hmax) continue;
      first = { x, z };
    }
    const pb = plants.find((p) => p.type === 'poisonberry');
    if (!pb) throw new Error('no poisonberry planted');
    if (Math.abs(first.x - pb.x) > 1e-9 || Math.abs(first.z - pb.z) > 1e-9)
      throw new Error('poisonberry spawn not reproducible from its private stream');
  }

  // uncontested ready plant (reuse the M7 scan pattern)
  const m8pick = (id) => {
    let hit = null;
    scan: for (const p of plants) {
      if (p.type !== id || p.state !== 'ready' || p.h < 0.35) continue;
      if (palms.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3.5)) continue;
      if (crabs.some((c) => c.alive && Math.hypot(c.x - p.x, c.z - p.z) < 1.5)) continue;
      if (fires.some((f) => Math.hypot(f.x - p.x, f.z - p.z) < 2.5)) continue;
      if (items.some((i) => !i.taken && i.state === 'ground' && Math.hypot(i.x - p.x, i.z - p.z) < 1.6)) continue;
      if (tigers.some((t) => (t.state === 'stalk' || t.state === 'chase') && Math.hypot(t.x - p.x, t.z - p.z) < 12)) continue;
      hit = p; break scan;
    }
    if (!hit) throw new Error('no uncontested ready ' + id + ' for the M8 harvest test');
    return hit;
  };

  // harvest each new species once: +1 INV, charge down, learn policy
  for (const id of ['sweetpotato', 'wildberry', 'banana', 'yam', 'poisonberry', 'poisonfern', 'poisonyam']) {
    const p = m8pick(id);
    rig.position.set(p.x, Math.max(p.h, WATER - 0.25), p.z);
    const before = INV[id];
    actUse();
    if (INV[id] !== before + 1) throw new Error(id + ' harvest did not land in inventory: ' + INV[id]);
    if (p.chargesLeft !== PLANT_TYPES[id].charges - 1) throw new Error(id + ' charge not decremented');
  }
  if (!learned.has('banana')) throw new Error('edible harvest learn entry missing');
  if (learned.has('poisonberry') || learned.has('poisonfern') || learned.has('poisonyam'))
    throw new Error('poison harvest should not write a learn entry (learned, not labeled)');

  // eating: Q prefers edibles (banana before wildberry), raw meals are small
  stats.thirst = 100; stats.hunger = 50; stats.health = 100;
  INV.sweetpotato = INV.sweetpotatoCooked = INV.yam = INV.yamCooked = INV.banana = INV.wildberry = 0;
  INV.poisonberry = INV.poisonfern = INV.poisonyam = 0;
  INV.wildberry = 1; INV.banana = 1;
  eatGathered();
  if (INV.banana !== 0 || stats.hunger < 63 || stats.hunger > 65)
    throw new Error('Q should eat banana (+14) first: ' + stats.hunger);
  eatGathered();
  if (INV.wildberry !== 0 || stats.hunger < 72 || stats.hunger > 74)
    throw new Error('wildberry (+10) meal wrong: ' + stats.hunger);

  // raw yam: tiny gain, then nausea vomit undoes it and writes the know entry
  stats.hunger = 60;
  INV.yam = 1;
  eatGathered();
  if (INV.yam !== 0) throw new Error('raw yam was not eaten');
  if (stats.hunger > 60.01) throw new Error('raw yam + vomit should net ~zero: ' + stats.hunger);
  if (!learned.has('eat-yam')) throw new Error('raw-yam "you now know" entry missing');

  // poisons only eat when nothing else remains; vomit loses the last real meal
  stats.hunger = 70; stats.thirst = 70;
  lastMeal = { hunger: 10, thirst: 5 };
  INV.poisonberry = 1;
  eatGathered();
  if (INV.poisonberry !== 0) throw new Error('poisonberry was not eaten');
  if (Math.abs(stats.hunger - 60) > 0.01 || Math.abs(stats.thirst - 65) > 0.01)
    throw new Error('vomit should undo the last meal: ' + stats.hunger + '/' + stats.thirst);
  if (!learned.has('eat-poisonberry')) throw new Error('poisonberry "you now know" entry missing');

  // Q never eats a poison while an edible foraged item remains
  INV.poisonfern = 1; INV.wildberry = 1;
  eatGathered();
  if (INV.wildberry !== 0 || INV.poisonfern !== 1) throw new Error('wildberry should be eaten before poisonfern');

  // poisonyam: real-second health bleed (regen off via low thirst), then expiry
  stats.health = 100; stats.thirst = 10; stats.hunger = 20; poisonDrain = null;
  INV.poisonfern = 0;
  INV.poisonyam = 1;
  eatGathered();
  if (!poisonDrain || poisonDrain.rem <= 0) throw new Error('poisonyam should start a health drain');
  const hp8 = stats.health;
  pump(60);   // ~1 real second
  if (stats.health >= hp8) throw new Error('poison drain should bleed health: ' + stats.health + ' vs ' + hp8);
  if (!learned.has('eat-poisonyam')) throw new Error('poisonyam "you now know" entry missing');
  poisonDrain = { rem: 0.05, rate: 1 };
  pump(12);
  if (poisonDrain !== null) throw new Error('poison drain should expire');

  // cooking: sweetpotato then yam over a free fire; cooked meals beat raw in Q order
  INV.sweetpotato = 1; INV.yam = 1;
  const fire8 = fires.find((f) => !f.cooking);
  if (!fire8) throw new Error('no free fire for the M8 cook test');
  rig.position.set(fire8.x, Math.max(fire8.g, WATER - 0.25), fire8.z);
  actUse();
  if (!fire8.cooking || fire8.cooking.item !== 'sweetpotato')
    throw new Error('sweetpotato should cook first: ' + (fire8.cooking && fire8.cooking.item));
  pump(200);   // > 2.5 s cook
  if (INV.sweetpotato !== 0 || INV.sweetpotatoCooked !== 1) throw new Error('sweetpotato was not cooked');
  actUse();
  if (!fire8.cooking || fire8.cooking.item !== 'yam') throw new Error('yam should cook second');
  pump(200);
  if (INV.yam !== 0 || INV.yamCooked !== 1) throw new Error('yam was not cooked');
  stats.hunger = 40;
  eatGathered();
  if (INV.yamCooked !== 0 || INV.sweetpotatoCooked !== 1)
    throw new Error('Q should eat yamCooked before sweetpotatoCooked');
  if (stats.hunger < 59 || stats.hunger > 61) throw new Error('cooked yam (+20) meal wrong: ' + stats.hunger);

  // respawn drops the new keys and clears the poison drain
  stats.health = 0; checkDeath();
  if (!dead) throw new Error('player should be dead at 0 health (M8)');
  INV.banana = 2; INV.poisonberry = 3; INV.sweetpotatoCooked = 1; poisonDrain = { rem: 5, rate: 1 };
  respawn();
  if (dead) throw new Error('respawn (M8) failed');
  if (INV.sweetpotato + INV.sweetpotatoCooked + INV.yam + INV.yamCooked + INV.banana + INV.wildberry
      + INV.poisonberry + INV.poisonfern + INV.poisonyam !== 0)
    throw new Error('respawn should drop foraged inventory');
  if (poisonDrain !== null) throw new Error('respawn should clear the poison drain');

  /* ---- M9: medicinal plants + harvesting/regrowth (herb, infection, wear) ---- */

  // herb species: count, height band, minDist; tuft mesh resizes with it
  const herbPlants = plants.filter((p) => p.type === 'herb');
  if (herbPlants.length < Math.floor(18 * 0.7)) throw new Error('too few herbs: ' + herbPlants.length);
  if (herbPlants.some((p) => p.h < 1.0 || p.h > 9.0)) throw new Error('herb outside its height band');
  for (let i = 0; i < herbPlants.length; i++)
    for (let j = i + 1; j < herbPlants.length; j++)
      if (Math.hypot(herbPlants[i].x - herbPlants[j].x, herbPlants[i].z - herbPlants[j].z) < 5)
        throw new Error('two herbs closer than minDist');
  if (plantMesh.tuft.count !== kindCount('tuft') * 3) throw new Error('tuft mesh count wrong after M9: ' + plantMesh.tuft.count);

  // first-spawn determinism (private stream, SEED + 1193)
  {
    const def = PLANT_TYPES.herb;
    const r = mulberry32(SEED + def.seedOffset);
    let first = null, tries = 0;
    while (!first && tries++ < 4000) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * ISLAND_R * 0.96;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (heightAt(x, z) < def.hmin || heightAt(x, z) > def.hmax) continue;
      first = { x, z };
    }
    const hb = plants.find((p) => p.type === 'herb');
    if (!hb) throw new Error('no herb planted');
    if (Math.abs(first.x - hb.x) > 1e-9 || Math.abs(first.z - hb.z) > 1e-9)
      throw new Error('herb spawn not reproducible from its private stream');
  }

  // harvest: uncontested ready herb -> E -> +1 herb, charge down, learn entry
  const H0 = m8pick('herb');
  rig.position.set(H0.x, Math.max(H0.h, WATER - 0.25), H0.z);
  actUse();
  if (INV.herb !== 1) throw new Error('herb harvest did not land: ' + INV.herb);
  if (H0.chargesLeft !== PLANT_TYPES.herb.charges - 1) throw new Error('herb charge not decremented');
  if (!learned.has('herb')) throw new Error('herb learn entry missing');

  // infection: persistent real-second bleed (regen off via low thirst), cured by M
  infectedWound = true; poisonDrain = null;
  stats.health = 100; stats.thirst = 10; stats.hunger = 20;
  const hp9a = stats.health;
  pump(60);   // ~1 real second
  if (stats.health >= hp9a) throw new Error('festering wound should bleed health: ' + stats.health + ' vs ' + hp9a);
  stats.health = 60; INV.herb = 2;
  useHerb();
  if (stats.health !== 85) throw new Error('herb should restore +25 hp: ' + stats.health);
  if (INV.herb !== 1) throw new Error('herb was not consumed');
  if (infectedWound) throw new Error('herb should close the festering wound');
  if (!learned.has('herb-cure')) throw new Error('herb-cure learn entry missing');
  const hp9b = stats.health;
  pump(60);
  if (stats.health !== hp9b) throw new Error('cured wound: no bleed and no regen expected: ' + stats.health);

  // regrowth wear: each full depletion slows the next regrow (state only, no rng)
  while (H0.state === 'ready') actUse();
  if (H0.state !== 'depleted' || H0.chargesLeft !== 0)
    throw new Error('herb should deplete at 0 charges: ' + H0.state + '/' + H0.chargesLeft);
  gameMin = 0; pump(1);
  gameMin += 7200; pump(1);   // 5 game days: full regrow even at the worn rate
  if (H0.state !== 'ready') throw new Error('worn herb should regrow: ' + H0.state);
  if (H0.chargesLeft !== PLANT_TYPES.herb.charges) throw new Error('regrow should reset charges: ' + H0.chargesLeft);
  if (Math.abs(H0.wear - 1.5) > 1e-9) throw new Error('wear should rise to 1.5 after one depletion: ' + H0.wear);
  while (H0.state === 'ready') actUse();
  gameMin = 0; pump(1);
  gameMin += 7200; pump(1);
  if (Math.abs(H0.wear - 2.0) > 1e-9) throw new Error('wear should rise to 2.0 after two depletions: ' + H0.wear);
  if (!herbPlants.some((p) => p !== H0 && p.state === 'ready' && p.wear === 1))
    throw new Error('never-depleted herbs should keep wear 1');

  // respawn drops the herb and cures the wound
  infectedWound = true; INV.herb = 1;
  stats.health = 0; checkDeath();
  if (!dead) throw new Error('player should be dead at 0 health (M9)');
  respawn();
  if (dead) throw new Error('respawn (M9) failed');
  if (INV.herb !== 0) throw new Error('respawn should drop herbs');
  if (infectedWound) throw new Error('respawn should clear the festering wound');

  /* ---- M10: weather framework (clear/cloudy/rain) ---- */

  // schedule determinism: replay the lazy generation on a fresh private stream
  if (weather.segs.length < 4) throw new Error('weather schedule should be extended by now: ' + weather.segs.length);
  {
    const wr = mulberry32(SEED + WEATHER_SEED_OFFSET);
    const rdur = (s) => { const d = WEATHER_DUR[s]; return d[0] + wr() * (d[1] - d[0]); };
    const rep = [{ state: 'clear', end: rdur('clear') }];
    let prev = 'clear';
    for (let i = 0; i < 3; i++) {
      const opts = WEATHER_NEXT[prev];
      const r = wr(); let acc = 0, st = opts[opts.length - 1][0];
      for (const o of opts) { acc += o[1]; if (r < acc) { st = o[0]; break; } }
      rep.push({ state: st, end: rep[i].end + rdur(st) });
      prev = st;
    }
    for (let i = 0; i < rep.length; i++) {
      if (weather.segs[i].state !== rep[i].state)
        throw new Error('weather seg ' + i + ' state mismatch: ' + weather.segs[i].state + ' vs ' + rep[i].state);
      if (Math.abs(weather.segs[i].end - rep[i].end) > 1e-9)
        throw new Error('weather seg ' + i + ' end mismatch: ' + weather.segs[i].end + ' vs ' + rep[i].end);
    }
    if (weather.segs[0].state !== 'clear') throw new Error('schedule must start clear');
    if (weatherStateAt(0) !== 'clear') throw new Error('weather at t=0 must be clear');
  }

  // rain integration: 5 game days contains rain; growth is the rain-weighted range average
  const rf = rainFrac(0, 7200);
  if (!(rf > 0 && rf < 1)) throw new Error('5 game days should contain some (not all) rain: ' + rf);
  if (Math.abs(plantGrowthMult(0, 7200) - (1 + (RAIN_GROWTH - 1) * rf)) > 1e-9)
    throw new Error('plantGrowthMult should be the rain-weighted range average');
  if (rainFrac(10, 5) !== 0) throw new Error('inverted window must be dry');

  // visible transitions at noon: sun, fog, streaks, HUD
  setClockP(0.33); pump(2);
  const baseSun = sun.intensity;
  if (baseSun <= 0) throw new Error('need a daytime sun baseline: ' + baseSun);
  setWeatherDebug('cloudy'); pump(60);
  if (sun.intensity >= baseSun * 0.85) throw new Error('clouds should dim the sun: ' + sun.intensity);
  if (rainGrp.visible !== false) throw new Error('no rain streaks when only cloudy');
  if (scene.fog.far < 500) throw new Error('cloudy fog should stay far: ' + scene.fog.far);
  setWeatherDebug('rain'); pump(60);
  if (rainGrp.visible !== true) throw new Error('rain streaks should be visible');
  if (scene.fog.far >= 400) throw new Error('rain fog should close in: ' + scene.fog.far);
  if (sun.intensity >= baseSun * 0.6) throw new Error('rain should dim the sun hard: ' + sun.intensity);
  if (!hudText.includes('rain')) throw new Error('HUD should name the weather: ' + hudText);
  setWeatherDebug('clear'); pump(60);
  if (rainGrp.visible !== false) throw new Error('streaks should stop when clear');
  if (scene.fog.far < 500) throw new Error('fog should open up when clear: ' + scene.fog.far);
  if (!hudText.includes('clear')) throw new Error('HUD should show clear weather');

  // rain douses unsheltered fires; a fire under the shelter survives
  const gSp = Math.max(heightAt(spawn.x, spawn.z), WATER - 0.25);
  rig.position.set(spawn.x, gSp, spawn.z);
  const nF = fires.length;
  if (nF >= 5) throw new Error('unexpected fire count before M10: ' + nF);
  actFire();
  if (fires.length !== nF + 1) throw new Error('open fire should light');
  setWeatherDebug('rain'); pump(2);
  if (fires.length !== 0) throw new Error('rain should douse every unsheltered fire: ' + fires.length);
  if (!learned.has('weather')) throw new Error('first rain should teach the weather rule');
  const shel = camp.structures.shelter;
  if (!shel) throw new Error('shelter should exist from M2');
  rig.position.set(shel.position.x, Math.max(heightAt(shel.position.x, shel.position.z), WATER - 0.25), shel.position.z);
  actFire();
  if (fires.length !== 1) throw new Error('shelter fire should light: ' + fires.length);
  const shFire = fires[0];
  pump(2);
  if (!fires.includes(shFire)) throw new Error('fire under the shelter should survive rain');
  if (!campIsLit()) throw new Error('camp should stay lit by the shelter fire');

  // doused cook returns its raw item (no item loss)
  setWeatherDebug('clear'); pump(2);
  rig.position.set(spawn.x, gSp, spawn.z);
  actFire();
  const openF = fires[fires.length - 1];
  if (Math.hypot(shel.position.x - spawn.x, shel.position.z - spawn.z) < 2.5)
    throw new Error('smoke camp too close to spawn for the cook test');
  INV.fishRaw = 1;
  actUse();
  if (!openF.cooking || openF.cooking.item !== 'fishRaw')
    throw new Error('fish cook should start on the open fire');
  setWeatherDebug('rain'); pump(2);
  if (fires.includes(openF)) throw new Error('open fire should be doused');
  if (INV.fishRaw !== 1) throw new Error('doused cook should return the raw item: ' + INV.fishRaw);
  if (fires.length !== 1 || !fires.includes(shFire))
    throw new Error('shelter fire should be the only fire left');

  // leave a clean state
  setWeatherDebug('clear'); pump(2);

  /* ---- M11: storm gameplay + weather/survival interaction ---- */

  // 1. schedule: a storm exists in the first 40000 game minutes, its events
  //    are precomputed on the per-segment stream and replay exactly
  weatherExtend(40000);
  const si = weather.segs.findIndex((s) => s.state === 'storm');
  if (si < 0) throw new Error('no storm segment in the first 40000 game minutes');
  const seg = weather.segs[si];
  {
    if (weather.segs[0].evs.length !== 0) throw new Error('a non-storm segment must have no events');
    const evR = mulberry32(SEED + WEATHER_SEED_EVENTS + si * 7);
    const nS = 1 + Math.floor(evR() * 3);
    const rep = [];
    for (let k = 0; k < nS; k++) {
      const t = seg.start + evR() * (seg.end - seg.start);
      const a = evR() * Math.PI * 2;
      const r = Math.sqrt(evR()) * ISLAND_R * 0.7;
      rep.push({ kind: 'strike', t, x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    const nD = 1 + Math.floor(evR() * 2);
    for (let k = 0; k < nD; k++)
      rep.push({ kind: 'drop', t: seg.start + evR() * (seg.end - seg.start), pi: Math.floor(evR() * palms.length) });
    rep.sort((u, v) => u.t - v.t);
    if (rep.length !== seg.evs.length) throw new Error('storm event count mismatch: ' + rep.length + ' vs ' + seg.evs.length);
    for (let i = 0; i < rep.length; i++) {
      const a = rep[i], b = seg.evs[i];
      if (a.kind !== b.kind || Math.abs(a.t - b.t) > 1e-9)
        throw new Error('storm event ' + i + ' replay mismatch: ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
      if (a.kind === 'strike' && (Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.z - b.z) > 1e-9))
        throw new Error('storm event ' + i + ' strike position mismatch');
      if (a.kind === 'drop' && a.pi !== b.pi) throw new Error('storm event ' + i + ' drop palm mismatch');
    }
    for (const ev of seg.evs)
      if (ev.t < seg.start - 1e-9 || ev.t > seg.end + 1e-9) throw new Error('storm event outside its segment: ' + ev.t);
  }

  // shared dry ground far from camp for the lightning + wet tests
  const pp = palms.find((p) => p.h >= 0.5 && Math.hypot(p.x - camp.x, p.z - camp.z) > 16 && !nearFire(p.x, p.z, 8));
  if (!pp) throw new Error('no dry point far from camp for M11');
  let p2x = NaN, p2z = NaN;
  for (let k = 0; k < 720; k++) {
    const a = (k / 720) * Math.PI * 2;
    const x = pp.x + Math.cos(a) * 11, z = pp.z + Math.sin(a) * 11;
    if (heightAt(x, z) >= 0.5) { p2x = x; p2z = z; break; }
  }
  if (isNaN(p2x)) throw new Error('no dry point 11u from the lightning palm');
  const ux = (p2x - pp.x) / 11, uz = (p2z - pp.z) / 11;
  const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);

  // 2. dropCoconut: crown decrements, a falling item starts at the crown
  {
    const p0 = palms.find((p) => p.cocos > 0);
    if (!p0) throw new Error('no palm with coconuts for M11');
    const c0 = p0.cocos, nI = items.length;
    dropCoconut(p0);
    if (p0.cocos !== c0 - 1) throw new Error('dropCoconut should decrement the crown');
    if (items.length !== nI + 1) throw new Error('dropCoconut should add a falling item');
    const it = items[items.length - 1];
    if (it.state !== 'fall') throw new Error('a wind-dropped coconut should be falling');
    if (Math.hypot(it.x - p0.top[0], it.z - p0.top[2]) > 1) throw new Error('the dropped coconut should start at the crown');
  }

  // 3. doLightning: ignites on open ground, panics animals, sears the open player
  {
    park(p2x, p2z);
    const hp0 = stats.health;
    const nF = fires.length;
    if (nF >= 5) throw new Error('unexpected fire count before M11 lightning: ' + nF);
    const crabNear = crabs.find((c) => c.alive && Math.hypot(c.x - pp.x, c.z - pp.z) < 25);
    doLightning(pp.x, pp.z);
    if (fires.length !== nF + 1) throw new Error('lightning should ignite a fire on open ground: ' + fires.length);
    if (stormBoltT <= 0) throw new Error('lightning should raise the bolt');
    if (tigers[0].panicT <= 0) throw new Error('lightning should panic the tigers');
    if (gullPanicT <= 0) throw new Error('lightning should quiet the gulls');
    if (stats.health !== hp0) throw new Error('a strike 11u away must not sear the player');
    if (crabNear && crabNear.fleeT <= 0) throw new Error('a nearby crab should scuttle from the strike');

    // 2.75u from the strike: inside STRIKE_HIT_R but outside FIRE_DRY_R
    stats.health = 90;
    park(p2x - ux * 2.75, p2z - uz * 2.75);
    doLightning(p2x, p2z);
    if (stats.health !== 90 - STRIKE_DMG)
      throw new Error('an unsheltered strike should sear for STRIKE_DMG: ' + stats.health);
    if (!learned.has('lightning')) throw new Error('a sear should teach the lightning rule');
    park(p2x, p2z);
  }

  // 4. event machinery: a natural storm fires its precomputed events lazily
  setWeatherDebug(null);
  gameMin = seg.evs[0].t;
  {
    // park far from every strike so the catch-up cannot sear the player
    let cx = spawn.x, cz = spawn.z, best = -1;
    for (let k = 0; k < 600; k++) {
      const a = k * 0.35, r = 10 + (k % 7) * 12;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (heightAt(x, z) < 0.5) continue;
      let mn = Infinity;
      for (const ev of seg.evs) if (ev.kind === 'strike') mn = Math.min(mn, Math.hypot(x - ev.x, z - ev.z));
      if (mn > best) { best = mn; cx = x; cz = z; }
    }
    rig.position.set(cx, heightAt(cx, cz), cz);
  }
  pump(2);
  {
    const due = seg.evs.filter((e) => e.t <= gameMin).length;
    const done = seg.evs.filter((e) => e.done).length;
    if (seg.evs[0].done !== true) throw new Error('the first due event should have fired');
    if (done !== due) throw new Error('catch-up should fire exactly the due events: ' + done + ' vs ' + due);
  }
  setWeatherDebug('clear');

  // 5. storm visuals: dark sky, wind streaks, closed fog, HUD, bolt
  setClockP(((0.33 - gameMin / 1800) % 1 + 1) % 1);
  pump(2);
  const bSun = sun.intensity, bFog = scene.fog.far;
  if (bSun <= 0) throw new Error('need a daytime sun baseline for the storm: ' + bSun);
  setWeatherDebug('storm');
  pump(60);
  if (rainGrp.visible !== true) throw new Error('a storm should show rain streaks');
  if (scene.fog.far >= bFog - 60) throw new Error('a storm should close the fog: ' + scene.fog.far);
  if (sun.intensity >= bSun * 0.35) throw new Error('a storm should dim the sun: ' + sun.intensity);
  if (!hudText.includes('storm')) throw new Error('HUD should name the storm: ' + hudText);
  if (!bolt || typeof bolt.visible !== 'boolean') throw new Error('the lightning bolt should exist');
  setWeatherDebug('clear');
  pump(60);
  if (scene.fog.far < bFog - 30) throw new Error('fog should reopen when clear: ' + scene.fog.far);
  if (!hudText.includes('clear')) throw new Error('HUD should show clear weather');

  // 6. wet stat: rain soaks an exposed player, shelter dries them off
  {
    let wx = NaN, wz = NaN, wb = -1;
    for (let k = 0; k < 600; k++) {
      const a = k * 0.35, r = 10 + (k % 7) * 12;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (heightAt(x, z) < 0.5) continue;
      if (Math.hypot(x - camp.x, z - camp.z) < 10) continue;   /* keep the shelter/torch dry off */
      if (Math.hypot(x - pp.x, z - pp.z) < 6) continue;
      let mn = Infinity;
      for (const ev of seg.evs) if (ev.kind === 'strike') mn = Math.min(mn, Math.hypot(x - ev.x, z - ev.z));
      if (mn > wb) { wb = mn; wx = x; wz = z; }
    }
    if (isNaN(wx)) throw new Error('no safe dry point for the wet test');
    park(wx, wz);
    stats.thirst = stats.hunger = 100;
    stats.wet = 100;
    const hp0 = stats.health;
    setWeatherDebug('rain');
    pump(300);
    if (stats.wet < 90) throw new Error('rain should hold the soak: ' + stats.wet);
    if (stats.health >= hp0 - 1.5) throw new Error('soaking should drain health: ' + stats.health + ' vs ' + hp0);
    if (!learned.has('wet')) throw new Error('the soak should teach the wet rule');

    rig.position.set(shel.position.x, Math.max(heightAt(shel.position.x, shel.position.z), WATER - 0.25), shel.position.z);
    setWeatherDebug('rain');
    pump(600);
    if (stats.wet >= 25) throw new Error('shelter should dry you off: ' + stats.wet);
    setWeatherDebug('clear');
    pump(600);
    if (stats.wet !== 0) throw new Error('clear weather should finish drying: ' + stats.wet);
  }

  // 7. lagoon surge: the storm refuses the spear, clear weather still fishes
  setWeatherDebug('storm');
  {
    const s = schools.find((sc) => sc.n > 0);
    if (!s) throw new Error('no fish school for the lagoon test');
    rig.position.set(s.x, Math.max(heightAt(s.x, s.z), WATER - 0.25), s.z);
    const fr = INV.fishRaw;
    actStrike();
    if (INV.fishRaw !== fr) throw new Error('the storm should refuse the spear');
    if (!learned.has('lagoon')) throw new Error('the surge should teach the lagoon rule');
    setWeatherDebug('clear');
    actStrike();
    if (INV.fishRaw !== fr + 1) throw new Error('clear weather should still fish: ' + INV.fishRaw);
  }

  // 8. rain masks fire and smoke: tigers fear fires less in wet weather
  setClockP(((0.9 - gameMin / 1800) % 1 + 1) % 1);
  pump(2);
  {
    let tx = NaN, tz = NaN;
    for (let k = 0; k < 720; k++) {
      const a = (k / 720) * Math.PI * 2;
      const x = shel.position.x + Math.cos(a) * 8, z = shel.position.z + Math.sin(a) * 8;
      if (heightAt(x, z) >= 0.5 && Math.hypot(x + 8 - shel.position.x, z - shel.position.z) > 12) {
        tx = x; tz = z; break;
      }
    }
    if (isNaN(tx)) throw new Error('no ground for the tiger fire test');
    const tf = makeFire(tx, heightAt(tx, tz), tz);
    for (const t of tigers) t.panicT = 0;
    const t0 = tigers[0];
    setWeatherDebug('clear');
    t0.state = 'patrol'; t0.x = tx + 8; t0.z = tz;
    pump(2);
    if (t0.state !== 'flee') throw new Error('clear night: 8u from a fire should put the tiger to flight: ' + t0.state);
    setWeatherDebug('rain');
    t0.state = 'patrol'; t0.x = tx + 8; t0.z = tz;
    pump(2);
    if (t0.state === 'flee') throw new Error('rain masks the fire: 8u should not scare the tiger');
    scene.remove(tf.grp);   /* may already be doused by the rain above; both are idempotent here */
    const tfi = fires.indexOf(tf);
    if (tfi >= 0) fires.splice(tfi, 1);
    t0.x = t0.hx; t0.z = t0.hz; t0.state = 'hide'; t0.panicT = 0;
    setClockP(((0.33 - gameMin / 1800) % 1 + 1) % 1);
  }

  // leave a clean state (M11)
  setWeatherDebug('clear');
  stats.wet = 0;
  alarms.length = 0;   // M16: drain the alarm bus at the block boundary

  /* ---- M12: animal framework (registry + shared behaviour helpers) ---- */
  {
    // 1. the shared framework helpers exist
    if (typeof registerAnimal !== 'function' || typeof homeWander !== 'function' ||
        typeof returnHome !== 'function' || typeof faceHome !== 'function' ||
        typeof applyMove !== 'function' || typeof panicWildlife !== 'function' ||
        typeof updateAnimals !== 'function')
      throw new Error('M12: missing animal framework helper');

    // 2. registry: slots 0-3 are exactly the 4 reference species in frame()
    //    order, bound to the canonical arrays with the unchanged pre-M12
    //    populations. M13-M17 register 6 more (slots 4-9) so the total is 10.
    if (animals.length !== 10) throw new Error('M12: expected 10 registered species (4 reference + 3 M13 + 1 M14 + 1 M15 + 1 M17), got ' + animals.length);
    const want = [['fish', schools, 5, 'early'], ['crab', crabs, 15, 'early'],
                  ['tiger', tigers, 3, 'late'], ['gull', gulls, 5, 'late']];
    want.forEach(([id, pop, n, phase], i) => {
      const sp = animals[i];
      if (!sp || sp.id !== id) throw new Error('M12: registry slot ' + i + ' is ' + (sp && sp.id) + ', want ' + id);
      if (sp.pop !== pop) throw new Error('M12: ' + id + ' not bound to the canonical array');
      if (sp.pop.length !== n) throw new Error('M12: ' + id + ' population ' + sp.pop.length + ' != ' + n);
      if (sp.phase !== phase) throw new Error('M12: ' + id + ' phase ' + sp.phase + ' != ' + phase);
      if (typeof sp.step !== 'function') throw new Error('M12: ' + id + ' has no step hook');
    });

    // 3. panicWildlife reproduces the M11 lightning effects exactly
    const c0 = crabs.find((c) => c.alive);
    if (!c0) throw new Error('M12: no living crab for the panic test');
    const savedPanic = tigers.map((t) => t.panicT), savedFlee = c0.fleeT, savedGP = gullPanicT;
    panicWildlife(c0.x, c0.z);
    for (const t of tigers)
      if (t.panicT !== 6 || t.panicX !== c0.x || t.panicZ !== c0.z)
        throw new Error('M12: panicWildlife did not panic a tiger');
    if (gullPanicT !== 5) throw new Error('M12: panicWildlife did not quiet the gulls: ' + gullPanicT);
    if (c0.fleeT !== 3) throw new Error('M12: panicWildlife did not startle the crab: ' + c0.fleeT);
    tigers.forEach((t, i) => { t.panicT = savedPanic[i]; t.panicX = 0; t.panicZ = 0; });
    c0.fleeT = savedFlee;
    gullPanicT = savedGP;

    // 4. updateAnimals drives the phase step hooks (one guarded tick, FSMs frozen)
    const wasDead = dead;
    dead = true;
    updateAnimals(0.016, 'early');
    updateAnimals(0.016, 'late');
    dead = wasDead;
  }

  // leave a clean state (M12)
  setWeatherDebug('clear');
  alarms.length = 0;   // M16: drain the alarm bus at the block boundary

  /* ---- M13: land wildlife (monkeys + large lizards + snakes) ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const pAt = (p) => setClockP(((p - gameMin / 1800) % 1 + 1) % 1);

    // 1. registry: the three M13 species after the gulls, 'late', canonical arrays
    if (animals.length !== 10) throw new Error('M13: expected 10 registered species, got ' + animals.length);
    const want = [['monkey', monkeys, 5], ['lizard', lizards, 4], ['snake', snakes, 6]];
    want.forEach(([id, pop, n], j) => {
      const sp = animals[4 + j];
      if (!sp || sp.id !== id) throw new Error('M13: registry slot ' + (4 + j) + ' is ' + (sp && sp.id) + ', want ' + id);
      if (sp.pop !== pop) throw new Error('M13: ' + id + ' not bound to the canonical array');
      if (sp.pop.length !== n) throw new Error('M13: ' + id + ' population ' + sp.pop.length + ' != ' + n);
      if (sp.phase !== 'late') throw new Error('M13: ' + id + ' phase ' + sp.phase + ' != late');
      if (typeof sp.step !== 'function') throw new Error('M13: ' + id + ' has no step hook');
    });
    /* spawn bands on the home points (the units drift, the homes are seeded) */
    if (monkeys.some((m) => heightAt(m.hx, m.hz) < 3 || heightAt(m.hx, m.hz) > 7)) throw new Error('M13: monkey home outside the 3..7 band');
    if (lizards.some((l) => heightAt(l.hx, l.hz) < 0.6 || heightAt(l.hx, l.hz) > 7)) throw new Error('M13: lizard home outside the 0.6..7 band');
    if (snakes.some((s) => heightAt(s.hx, s.hz) < 7 || heightAt(s.hx, s.hz) > 20)) throw new Error('M13: snake home outside the 7..20 band');
    if (!snakes[0].venom || snakes[1].venom || !snakes[2].venom || snakes[3].venom)
      throw new Error('M13: snake variant split not the deterministic even-odd pattern');

    // 2. monkey steal (day): one carried meat item, per-monkey cooldown + learn
    pAt(0.33); pump(2);
    {
      const m0 = monkeys[0];
      if (tigers.some((t) => Math.hypot(t.x - m0.hx, t.z - m0.hz) < MONKEY_SCARE_R))
        throw new Error('M13: setup - a tiger is near the monkey home, steal test contaminated');
      const saved = {};
      for (const k of MONKEY_FOOD_ORDER) { saved[k] = INV[k]; INV[k] = 0; }
      saved.coconut = INV.coconut; INV.coconut = 0;
      INV.crabCooked = 1;
      const sCd = m0.stealCd, sSc = m0.scareT;
      m0.stealCd = 0; m0.scareT = 0;
      park(m0.x, m0.z);
      pump(4);
      if (INV.crabCooked !== 0) throw new Error('M13: the monkey should have snatched the carried meat: ' + INV.crabCooked);
      if (m0.stealCd <= 0) throw new Error('M13: monkey steal should set the per-monkey cooldown');
      if (!learned.has('monkey')) throw new Error('M13: monkey steal should teach the tell');
      for (const k of MONKEY_FOOD_ORDER) INV[k] = saved[k];
      INV.coconut = saved.coconut;
      m0.stealCd = sCd; m0.scareT = sSc;
    }

    // 3. monkey shriek (dawn): a live tiger near the monkey home freezes it
    pAt(0.008); pump(2);
    {
      const m0 = monkeys[1];
      park(camp.x, camp.z);   // 60u+ from every tiger home, and 150u+ from the tiger at m1's home
      const t0 = tigers[0];
      const sT = { x: t0.x, z: t0.z, state: t0.state, panicT: t0.panicT };
      const sS = m0.screamT, sSc = m0.scareT;
      m0.screamT = 0; m0.scareT = 0;   // a stale M11 lightning scare would mask the shriek branch
      t0.x = m0.hx + 3; t0.z = m0.hz; t0.state = 'patrol';
      pump(3);
      if (!(m0.screamT > 0 || learned.has('monkeyscream')))
        throw new Error('M13: dawn monkey should shriek with a tiger near its home');
      m0.screamT = sS; m0.scareT = sSc;
      t0.x = sT.x; t0.z = sT.z; t0.state = sT.state; t0.panicT = sT.panicT;
      alarms.length = 0;   // M16: drain the shriek alarm before the crab hunt below
      park(camp.x, camp.z);
    }

    // 4. lizard crab hunt (day): the burst takes a living crab from the tide line
    pAt(0.33); pump(2);
    {
      park(camp.x, camp.z);   // safe from the (dusk) tigers; the hunted crab is picked 8u+ away
      const c0 = crabs.find((c) => c.alive && Math.hypot(c.x - camp.x, c.z - camp.z) > 8);
      if (!c0) throw new Error('M13: no living crab 8u+ from the camp for the hunt test');
      const l0 = lizards[0];
      const sL = { x: l0.x, z: l0.z, burstT: l0.burstT, burstCd: l0.burstCd, fleeT: l0.fleeT, scareT: l0.scareT };
      l0.x = c0.x; l0.z = c0.z; l0.burstT = 0; l0.burstCd = 0; l0.fleeT = 0; l0.scareT = 0;
      pump(3);
      if (c0.alive !== false) throw new Error('M13: the lizard should have caught the crab under it');
      if (c0.grp.visible !== false) throw new Error('M13: the eaten crab should be hidden');
      if (!learned.has('lizardcrab')) throw new Error('M13: the crab hunt should teach the tide-line tell');
      c0.alive = true; c0.grp.visible = true;   // restore
      l0.x = sL.x; l0.z = sL.z; l0.burstT = sL.burstT; l0.burstCd = sL.burstCd;
      l0.fleeT = sL.fleeT; l0.scareT = sL.scareT;
    }

    // 5. lizard dusk camp raid: unfortified camp loses one meat; fence+fire keep it out
    pAt(0.657); pump(2);
    {
      if (!(dayFactor >= 0.25 && dayFactor < 0.5))
        throw new Error('M13: dusk clock setup failed, dayFactor ' + dayFactor);
      const l0 = lizards[0];
      const sL = { x: l0.x, z: l0.z, raidCd: l0.raidCd, burstCd: l0.burstCd, burstT: l0.burstT,
                  fleeT: l0.fleeT, scareT: l0.scareT, dir: l0.dir, phase: l0.phase };
      const fFence = camp.structures.fence, fTorch = camp.structures.torch;
      const savedMeat = {};
      for (const k of LIZ_MEAT_ORDER) { savedMeat[k] = INV[k]; INV[k] = 0; }
      INV.crabCooked = 2;
      const savedSteal = monkeys.map((m) => m.stealCd);   // keep the monkeys from sniping too
      monkeys.forEach((m) => { m.stealCd = MONKEY_STEAL_CD; m.scareT = 0; });
      camp.structures.fence = null; camp.structures.torch = null;   // unfortified
      park(camp.x + 9, camp.z);                       // player inside the raid range
      l0.x = camp.x - 5; l0.z = camp.z;               // lizard approaches from the far side
      l0.raidCd = 0; l0.burstCd = 8; l0.burstT = 0; l0.fleeT = 0; l0.scareT = 0;   // burst CD keeps the crab hunt quiet
      pump(150);   // ~2.5 s: the 5u approach at 3.5u/s finishes well inside
      if (INV.crabCooked !== 1)
        throw new Error('M13: the lizard should have sniped exactly one meat at the unfortified camp: ' + INV.crabCooked);
      if (!learned.has('lizard')) throw new Error('M13: the camp raid should teach the tell');
      // now fortified: fence AND fire keep the lizard outside the perimeter
      camp.structures.fence = fFence; camp.structures.torch = fTorch;
      l0.raidCd = 0; l0.x = camp.x - 5; l0.z = camp.z; l0.fleeT = 0; l0.scareT = 0;
      pump(150);
      if (INV.crabCooked !== 1)
        throw new Error('M13: fence and fire should keep the lizard from the camp: ' + INV.crabCooked);
      if (!learned.has('lizardfence')) throw new Error('M13: the held perimeter should teach the fence+fire tell');
      camp.structures.fence = fFence; camp.structures.torch = fTorch;
      monkeys.forEach((m, i) => { m.stealCd = savedSteal[i]; });
      for (const k of LIZ_MEAT_ORDER) INV[k] = savedMeat[k];
      l0.x = sL.x; l0.z = sL.z; l0.raidCd = sL.raidCd; l0.burstCd = sL.burstCd; l0.burstT = sL.burstT;
      l0.fleeT = sL.fleeT; l0.scareT = sL.scareT; l0.dir = sL.dir; l0.phase = sL.phase;
    }

    // 6. snakes: venomous strike drops health (health, not death), harmless spits
    pAt(0.33); pump(2);
    {
      park(camp.x, camp.z);
      const sThirst = stats.thirst;
      stats.thirst = 10;   // above the drain threshold, below the regen threshold: health stays put except the strike
      const sInf = infectedWound;
      infectedWound = false;   // an earlier night's tiger wound must not bleed into the exact-damage asserts
      stats.health = 100;
      const s0 = snakes[0];
      const sA = { strikeCd: s0.strikeCd, tellT: s0.tellT, fleeT: s0.fleeT, freezeT: s0.freezeT };
      s0.strikeCd = 0; s0.tellT = 0; s0.fleeT = 0; s0.freezeT = 0;
      park(s0.x, s0.z);   // stepped on it
      pump(80);           // ~1.3 s > the 0.8 s telegraph
      if (stats.health !== 100 - SNAKE_VENOM_DMG)
        throw new Error('M13: the venom strike should deal SNAKE_VENOM_DMG: ' + stats.health);
      if (dead) throw new Error('M13: a single snake strike must not kill a full-health player');
      if (!learned.has('snakevenom')) throw new Error('M13: the venom strike should teach the tell');
      stats.health = 100;
      const s1 = snakes[1];
      const sB = { strikeCd: s1.strikeCd, tellT: s1.tellT, fleeT: s1.fleeT, freezeT: s1.freezeT };
      s1.strikeCd = 0; s1.tellT = 0; s1.fleeT = 0; s1.freezeT = 0;
      park(s1.x, s1.z);
      pump(80);
      if (stats.health !== 100) throw new Error('M13: the harmless snake should not damage: ' + stats.health);
      if (!learned.has('snakeharmless')) throw new Error('M13: the harmless snake should teach the tell');
      s0.strikeCd = sA.strikeCd; s0.tellT = sA.tellT; s0.fleeT = sA.fleeT; s0.freezeT = sA.freezeT;
      s1.strikeCd = sB.strikeCd; s1.tellT = sB.tellT; s1.fleeT = sB.fleeT; s1.freezeT = sB.freezeT;
      stats.health = 100;
      stats.thirst = sThirst;
      infectedWound = sInf;
      park(camp.x, camp.z);
    }

    // 7. panicWildlife startles the new species (M12 exact values untouched)
    {
      const m0 = monkeys[0], l0 = lizards[0], s0 = snakes[0];
      const sM = m0.scareT, sL = l0.scareT, sS = s0.freezeT;
      const sT = tigers.map((t) => t.panicT), sG = gullPanicT;
      panicWildlife(m0.x, m0.z);
      if (!(m0.scareT > 0)) throw new Error('M13: panicWildlife should startle the monkey');
      if (!(l0.scareT > 0)) throw new Error('M13: panicWildlife should startle the lizard');
      if (!(s0.freezeT > 0)) throw new Error('M13: panicWildlife should freeze the snake');
      m0.scareT = sM; l0.scareT = sL; s0.freezeT = sS;
      tigers.forEach((t, i) => { t.panicT = sT[i]; });
      gullPanicT = sG;
      for (const c of crabs) if (c.alive) c.fleeT = 0;
    }

    // leave a clean state (M13)
    park(spawn.x, spawn.z);
    setWeatherDebug('clear');
    pAt(0.33);
    stats.health = 100;
    alarms.length = 0;   // M16: drain the alarm bus at the block boundary
  }

  /* ---- M14: seagulls + pelicans + expanded crabs ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const pAt = (p) => setClockP(((p - gameMin / 1800) % 1 + 1) % 1);
    const invSnap = { ...INV };
    const schoolSnap = schools.map((s) => s.n);
    const crabSnap = crabs.map((c) => c.alive);
    const nestSnap = gullNest.eggs;
    const angerSnap = gullAngerUntil;
    const mobSnap = { x: pelicanFishX, z: pelicanFishZ, t: pelicanFishT };
    const pelicanSnap = pelicans.map((p) => ({ x: p.x, z: p.z, stealT: p.stealT, stealCd: p.stealCd,
                                               diveCd: p.diveCd, fleeT: p.fleeT, fleeX: p.fleeX, fleeZ: p.fleeZ, dir: p.dir }));
    const monkeySnap = monkeys.map((m) => m.stealCd);

    // 1. registry: slot 7 is the pelican (M12/M13 slots untouched); crabs number 15
    if (animals.length !== 10) throw new Error('M14: expected 10 registered species, got ' + animals.length);
    const psp = animals[7];
    if (!psp || psp.id !== 'pelican' || psp.pop !== pelicans || psp.pop.length !== 3 ||
        psp.phase !== 'late' || typeof psp.step !== 'function')
      throw new Error('M14: registry slot 7 must be the pelican descriptor');
    if (crabs.length !== 15) throw new Error('M14: crabs must number 15, got ' + crabs.length);

    // 2. pelican homes: a palm crown or a shallows anchor
    for (const p of pelicans) {
      const onPalm = palms.some((pm) => pm.top[0] === p.hx && pm.top[2] === p.hz &&
        Math.abs(pm.top[1] - p.perch[1]) < 0.01);
      if (!onPalm && heightAt(p.hx, p.hz) > -0.2) throw new Error('M14: pelican home is neither a palm crown nor shallows');
    }

    // 3. gull nest: 3 eggs, cliff band, 60u+ from spawn
    if (!gullNest || gullNest.eggs !== 3 || gullNest.eggMeshes.length !== 3)
      throw new Error('M14: the gull nest must hold 3 eggs');
    if (heightAt(gullNest.x, gullNest.z) < 16) throw new Error('M14: the gull nest must sit on the cliff band');
    if (Math.hypot(gullNest.x - spawn.x, gullNest.z - spawn.z) < 60) throw new Error('M14: the gull nest must be 60u+ from spawn');

    // 4. pelican deep-dive: takes one fish, sets the gull-mob point, teaches the tell
    pAt(0.33); pump(2);
    {
      const s0 = schools.find((s) => s.n > 0);
      if (!s0) throw new Error('M14: no fish school for the dive test');
      const p0 = pelicans[0];
      const sInv = INV.fishRaw;
      const sG = gulls.map((gu) => gu.stealCd);
      const sD = [pelicans[1].diveCd, pelicans[2].diveCd];
      gulls.forEach((gu) => { gu.stealCd = GULL_STEAL_CD; });   // no gull interference
      pelicans[1].diveCd = PELICAN_DIVE_CD; pelicans[2].diveCd = PELICAN_DIVE_CD;   // p0 is the only diver
      const n0 = s0.n;
      p0.diveCd = 0; p0.stealT = 0; p0.stealCd = PELICAN_STEAL_CD; p0.fleeT = 0;
      p0.x = s0.x + 2; p0.z = s0.z;
      park(camp.x, camp.z);
      pump(200);   // ~3.3 s: the 2 u flight + the strike
      if (s0.n !== n0 - 1) throw new Error('M14: the pelican dive should take exactly one fish: ' + s0.n);
      if (pelicanFishT <= 0) throw new Error('M14: the dive should set the gull-mob point');
      if (!learned.has('pelicandive')) throw new Error('M14: the dive should teach the fish-finder tell');
      INV.fishRaw = sInv;
      gulls.forEach((gu, i) => { gu.stealCd = sG[i]; });
      pelicans[1].diveCd = sD[0]; pelicans[2].diveCd = sD[1];
    }

    // 5. gull-vs-pelican: while the mob point is live, a gull converges on it
    {
      park(camp.x, camp.z);
      const gu = gulls[0];
      const sG = { x: gu.x, z: gu.z, stealCd: gu.stealCd, diveTell: gu.diveTell };
      const sCd = gullDiveCd;
      gullDiveCd = GULL_DIVE_CD;   // keep the dive FSM from freezing the gull mid-mob
      gu.stealCd = GULL_STEAL_CD; gu.diveTell = 0;
      pelicanFishX = gu.x + 10; pelicanFishZ = gu.z; pelicanFishT = 4;
      pump(60);   // 1 s at 8.5 u/s
      const dNow = Math.hypot(pelicanFishX - gu.x, pelicanFishZ - gu.z);
      if (dNow > 5) throw new Error('M14: the gull should mob the fish point, still ' + dNow.toFixed(1) + 'u away');
      if (!learned.has('gullmob')) throw new Error('M14: the mob should teach the tell');
      gu.x = sG.x; gu.z = sG.z; gu.stealCd = sG.stealCd; gu.diveTell = sG.diveTell;
      gullDiveCd = sCd;
    }

    // 6. pelican hand-steal: 1.2 s hover; without Space the fish goes, with Space it stays
    pAt(0.33); pump(2);
    {
      const p0 = pelicans[0];
      const sInv = INV.fishRaw;
      const sG = gulls.map((gu) => gu.stealCd);
      const sM = monkeys.map((m) => m.stealCd);
      gulls.forEach((gu) => { gu.stealCd = GULL_STEAL_CD; });
      monkeys.forEach((m) => { m.stealCd = MONKEY_STEAL_CD; });
      pelicans[1].stealCd = PELICAN_STEAL_CD; pelicans[2].stealCd = PELICAN_STEAL_CD;
      INV.fishRaw = 1;
      p0.stealCd = 0; p0.stealT = 0; p0.fleeT = 0; p0.diveCd = PELICAN_DIVE_CD;
      park(p0.x, p0.z);
      pump(90);   // ~1.5 s: the 1.2 s telegraph runs out without Space
      if (INV.fishRaw !== 0) throw new Error('M14: the pelican should take the raw fish: ' + INV.fishRaw);
      if (!learned.has('pelican')) throw new Error('M14: the steal should teach the tell');
      INV.fishRaw = 1;
      p0.stealCd = 0; p0.stealT = PELICAN_STEAL_T;   // force mid-telegraph
      keys['Space'] = true;
      pump(3);
      keys['Space'] = false;
      if (INV.fishRaw !== 1) throw new Error('M14: Space should keep the fish: ' + INV.fishRaw);
      if (!learned.has('pelicansteal')) throw new Error('M14: the counter should teach the tell');
      INV.fishRaw = sInv;
      gulls.forEach((gu, i) => { gu.stealCd = sG[i]; });
      monkeys.forEach((m, i) => { m.stealCd = sM[i]; });
      park(camp.x, camp.z);
    }

    // 7. gull nest egg: E takes one, the flock is angry for a visible day
    {
      park(camp.x, camp.z);   // far from any gull home
      const sEggs = gullNest.eggs, sAnger = gullAngerUntil, sInv = INV.gullEgg;
      const sG = gulls.map((gu) => gu.stealCd);
      gulls.forEach((gu) => { gu.stealCd = GULL_STEAL_CD; });
      park(gullNest.x, gullNest.z);
      actUse();
      if (INV.gullEgg !== sInv + 1) throw new Error('M14: the nest should give a gull egg: ' + INV.gullEgg);
      if (gullNest.eggs !== sEggs - 1) throw new Error('M14: the nest should lose one egg: ' + gullNest.eggs);
      if (gullNest.eggMeshes[sEggs - 1].visible !== false)
        throw new Error('M14: the taken egg should be hidden in the nest');
      if (!(gullAngerUntil > gameMin)) throw new Error('M14: taking the egg should enrage the flock: ' + gullAngerUntil);
      if (!learned.has('gullegg')) throw new Error('M14: the egg should teach the tell');
      INV.gullEgg = sInv;
      gullNest.eggs = sEggs;
      gullNest.eggMeshes.forEach((m, i) => { m.visible = i < sEggs; });
      gullAngerUntil = sAnger;
      gulls.forEach((gu, i) => { gu.stealCd = sG[i]; });
      park(camp.x, camp.z);
    }

    // 8. crabs hide from a live big lizard (their hiding = a lizard is close)
    {
      const l0 = lizards[0];
      const cc = crabs.find((c) => c.alive);
      if (!cc) throw new Error('M14: no living crab for the hide test');
      const sC = { x: cc.x, z: cc.z, fleeT: cc.fleeT, dir: cc.dir };
      cc.x = l0.x + 2; cc.z = l0.z; cc.fleeT = 0;
      pump(3);
      if (!(cc.fleeT > 0)) throw new Error('M14: a crab within ' + CRAB_HIDE_R + 'u of a lizard should scuttle to hide: ' + cc.fleeT);
      if (!learned.has('crabhide')) throw new Error('M14: the hide should teach the tell');
      cc.x = sC.x; cc.z = sC.z; cc.fleeT = sC.fleeT; cc.dir = sC.dir;
    }

    // 9. panicWildlife startles the pelicans (M12/M13 effects untouched)
    {
      const p0 = pelicans[1];
      const sP = { t: p0.fleeT, x: p0.fleeX, z: p0.fleeZ };
      const sT = tigers.map((t) => ({ panicT: t.panicT, panicX: t.panicX, panicZ: t.panicZ }));
      const sG = gullPanicT;
      const sC = crabs.map((c) => c.fleeT);
      const sM = monkeys.map((m) => m.scareT);
      const sL = lizards.map((l) => l.scareT);
      const sS = snakes.map((s) => s.freezeT);
      panicWildlife(p0.x, p0.z);
      if (!(p0.fleeT > 0)) throw new Error('M14: panicWildlife should startle the pelican');
      p0.fleeT = sP.t; p0.fleeX = sP.x; p0.fleeZ = sP.z;
      tigers.forEach((t, i) => { t.panicT = sT[i].panicT; t.panicX = sT[i].panicX; t.panicZ = sT[i].panicZ; });
      gullPanicT = sG;
      crabs.forEach((c, i) => { c.fleeT = sC[i]; });
      monkeys.forEach((m, i) => { m.scareT = sM[i]; });
      lizards.forEach((l, i) => { l.scareT = sL[i]; });
      snakes.forEach((s, i) => { s.freezeT = sS[i]; });
    }

    // leave a clean state (M14)
    park(spawn.x, spawn.z);
    setWeatherDebug('clear');
    pAt(0.33);
    stats.health = 100;
    Object.assign(INV, invSnap);
    gullAngerUntil = angerSnap;
    pelicanFishX = mobSnap.x; pelicanFishZ = mobSnap.z; pelicanFishT = mobSnap.t;
    schools.forEach((s, i) => { s.n = schoolSnap[i]; s.mesh.count = s.n; });
    crabs.forEach((c, i) => { c.alive = crabSnap[i]; c.grp.visible = c.alive; });
    gullNest.eggs = nestSnap;
    gullNest.eggMeshes.forEach((m, i) => { m.visible = i < nestSnap; });
    pelicans.forEach((p, i) => {
      p.x = pelicanSnap[i].x; p.z = pelicanSnap[i].z;
      p.stealT = pelicanSnap[i].stealT; p.stealCd = pelicanSnap[i].stealCd; p.diveCd = pelicanSnap[i].diveCd;
      p.fleeT = pelicanSnap[i].fleeT; p.fleeX = pelicanSnap[i].fleeX; p.fleeZ = pelicanSnap[i].fleeZ;
      p.dir = pelicanSnap[i].dir;
    });
    monkeys.forEach((m, i) => { m.stealCd = monkeySnap[i]; });
    alarms.length = 0;   // M16: drain the alarm bus at the block boundary
  }

  /* ---- M15: sharks + expanded fish ecosystem ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const pAt = (p) => setClockP(((p - gameMin / 1800) % 1 + 1) % 1);
    const sharkSnap = sharks.map((s) => ({ x: s.x, z: s.z, dir: s.dir, state: s.state,
                                            tellT: s.tellT, atkCd: s.atkCd, fleeT: s.fleeT,
                                            fleeX: s.fleeX, fleeZ: s.fleeZ }));
    const schoolSnap = schools.map((s) => ({ n: s.n, regT: s.regT }));
    const infSnap = infectedWound;
    const spearSnap = spear;
    const fishSnap = INV.fishRaw;
    const cdSnap = strikeCd;
    const gullCdSnap = gullDiveCd;
    const gullTellSnap = gulls.map((g) => g.diveTell);
    /* freeze gull dive-bombs so a pending tell can't corrupt the exact-health asserts */
    const stillGulls = () => { gulls.forEach((g) => { g.diveTell = 0; }); gullDiveCd = 999; };

    // 1. registry: slot 8 is the shark ('early', canonical array, pop 2)
    if (animals.length !== 10) throw new Error('M15: expected 10 registered species, got ' + animals.length);
    const ssp = animals[8];
    if (!ssp || ssp.id !== 'shark' || ssp.pop !== sharks || ssp.pop.length !== 2 ||
        ssp.phase !== 'early' || typeof ssp.step !== 'function')
      throw new Error('M15: registry slot 8 must be the shark descriptor');

    // 2. spawn invariants: reef band, 40u+ from spawn, 30u+ apart
    for (const s of sharks) {
      const h = heightAt(s.hx, s.hz);
      if (h > -0.6 || h < -2.2) throw new Error('M15: shark home outside the -2.2..-0.6 band: ' + h);
      if (Math.hypot(s.hx - spawn.x, s.hz - spawn.z) < 40) throw new Error('M15: shark home < 40u from spawn');
    }
    if (Math.hypot(sharks[0].hx - sharks[1].hx, sharks[0].hz - sharks[1].hz) < 30)
      throw new Error('M15: the two shark homes must be 30u+ apart');

    // 3. land immunity: a 2u-away shark cannot hurt a player on the beach
    pAt(0.33); pump(2);
    stillGulls();
    {
      const landPt = (() => {
        for (let r = 4; r < ISLAND_R; r += 2)
          for (let k = 0; k < 16; k++) {
            const a = k * Math.PI / 8;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            if (heightAt(x, z) >= SHARK_IN_WATER) return { x, z };
          }
        throw new Error('M15: no land point found');
      })();
      const s0 = sharks[0];
      s0.x = landPt.x + 2; s0.z = landPt.z; s0.fleeT = 0; s0.tellT = 0; s0.atkCd = 0; s0.state = 'patrol';
      sharks[1].atkCd = 999;
      park(landPt.x, landPt.z);
      stats.health = 100; stats.thirst = 100; stats.hunger = 100; infectedWound = false;
      pump(300);   // 5 s: well past the 0.7 s telegraph
      if (stats.health !== 100) throw new Error('M15: a shark must not hurt a player on land: ' + stats.health);
    }

    // 4. water attack: a curious shark in the shallows bites exactly once for SHARK_DMG
    {
      const s0 = sharks[0];
      const sx = schools[0];
      park(sx.bx, sx.bz);   // the school home is shallow water (< 0.5)
      /* thirst/hunger at 15: below the +0.35/s regen threshold, above the drain threshold */
      stats.health = 100; stats.thirst = 15; stats.hunger = 15; infectedWound = false;
      s0.x = sx.bx + 2; s0.z = sx.bz; s0.state = 'curious'; s0.tellT = 0; s0.atkCd = 0; s0.fleeT = 0;
      sharks[1].atkCd = 999;
      stillGulls();
      pump(120);   // 2 s: the 0.7 s lunge runs, then the 8 s cooldown holds
      if (stats.health !== 100 - SHARK_DMG) throw new Error('M15: the shark bite should take exactly ' + SHARK_DMG + ' hp: ' + stats.health);
      if (dead) throw new Error('M15: a shark bite must not one-shot a full-health player');
      if (!learned.has('shark')) throw new Error('M15: the bite should teach the tell');
    }

    // 5. blood: a festering wound in the water draws the shark from 20u away
    {
      const s0 = sharks[1];
      const sx = schools[1];
      infectedWound = true;
      park(sx.bx, sx.bz);
      s0.x = sx.bx + 20; s0.z = sx.bz; s0.fleeT = 0; s0.tellT = 0; s0.atkCd = SHARK_ATK_CD; s0.state = 'patrol';
      stillGulls();
      pump(120);
      if (s0.state !== 'curious') throw new Error('M15: a bleeding in-water player should draw the shark curious: ' + s0.state);
      if (!learned.has('blood')) throw new Error('M15: the blood draw should teach the tell');
      infectedWound = infSnap;
    }

    // 6. gull scream: a curious shark near the in-water player keeps gullWaterT alive
    {
      const s0 = sharks[0];
      const sx = schools[0];
      park(sx.bx, sx.bz);
      s0.x = sx.bx + 6; s0.z = sx.bz; s0.fleeT = 0; s0.atkCd = 999;
      stillGulls();
      gullWaterT = 0;
      pump(60);
      if (!(gullWaterT > 0)) throw new Error('M15: a curious shark in the water should keep the gull scream alive: ' + gullWaterT);
    }

    // 7. panicWildlife flees the sharks (M12/M13/M14 effects untouched)
    {
      const s0 = sharks[1];
      const s = { t: s0.fleeT, x: s0.fleeX, z: s0.fleeZ };
      const sT = tigers.map((t) => ({ panicT: t.panicT, panicX: t.panicX, panicZ: t.panicZ }));
      const sG = gullPanicT;
      const sC = crabs.map((c) => c.fleeT);
      const sM = monkeys.map((m) => m.scareT);
      const sL = lizards.map((l) => l.scareT);
      const sS = snakes.map((k) => k.freezeT);
      const sP = pelicans.map((p) => p.fleeT);
      panicWildlife(s0.x, s0.z);
      if (!(s0.fleeT > 0)) throw new Error('M15: panicWildlife should flee the shark');
      s0.fleeT = s.t; s0.fleeX = s.x; s0.fleeZ = s.z;
      tigers.forEach((t, i) => { t.panicT = sT[i].panicT; t.panicX = sT[i].panicX; t.panicZ = sT[i].panicZ; });
      gullPanicT = sG;
      crabs.forEach((c, i) => { c.fleeT = sC[i]; });
      monkeys.forEach((m, i) => { m.scareT = sM[i]; });
      lizards.forEach((l, i) => { l.scareT = sL[i]; });
      snakes.forEach((k, i) => { k.freezeT = sS[i]; });
      pelicans.forEach((p, i) => { p.fleeT = sP[i]; });
    }

    // 8. regeneration: a thinned school grows back at 1/120s, capped at min(n0, 12)
    {
      const s0 = schools[0];
      const cap = Math.min(s0.n0, 12);
      s0.n = Math.max(0, cap - 1); s0.regT = 119.9;
      pump(30);   // ~0.5 s: crosses the 120 s boundary exactly once
      if (s0.n !== cap) throw new Error('M15: the school should regenerate to its cap: ' + s0.n + ' != ' + cap);
      s0.n = cap; s0.regT = 240;
      pump(30);
      if (s0.n !== cap) throw new Error('M15: the school must not grow past min(n0, 12): ' + s0.n);
    }

    // 9. dawn/dusk double bite: the spear takes two; midday takes one
    {
      const s0 = schools[1];
      const startN = s0.n = Math.max(s0.n, 3);
      spear = true; strikeCd = 0; infectedWound = false;
      sharks.forEach((s) => { s.atkCd = 999; });
      park(s0.x, s0.z);   // live school position: the M16 alarm scatter can displace it from home
      pAt(0.658); pump(2);   // the previous-frame dayFactor enters the [0.25, 0.5) band
      if (dayFactor < 0.25 || dayFactor >= 0.5) throw new Error('M15: the test clock left the dawn/dusk band: ' + dayFactor);
      const b1 = INV.fishRaw;
      actStrike();
      if (INV.fishRaw !== b1 + 2) throw new Error('M15: the dawn/dusk spear should take two fish: ' + INV.fishRaw);
      if (s0.n !== startN - 2) throw new Error('M15: the school should lose two fish: ' + s0.n);
      if (!learned.has('bite')) throw new Error('M15: the double bite should teach the tell');
      pAt(0.33); pump(2);   // back to midday
      const b2 = INV.fishRaw;
      strikeCd = 0;
      actStrike();
      if (INV.fishRaw !== b2 + 1) throw new Error('M15: a midday spear should take one fish: ' + INV.fishRaw);
    }

    // leave a clean state (M15)
    park(spawn.x, spawn.z);
    setWeatherDebug('clear');
    pAt(0.33);
    stats.health = 100;
    infectedWound = infSnap;
    spear = spearSnap;
    strikeCd = cdSnap;
    INV.fishRaw = fishSnap;
    gullWaterT = 0;
    schools.forEach((s, i) => { s.n = schoolSnap[i].n; s.regT = schoolSnap[i].regT; s.mesh.count = s.n; });
    sharks.forEach((s, i) => {
      const q = sharkSnap[i];
      s.x = q.x; s.z = q.z; s.dir = q.dir; s.state = q.state;
      s.tellT = q.tellT; s.atkCd = q.atkCd; s.fleeT = q.fleeT; s.fleeX = q.fleeX; s.fleeZ = q.fleeZ;
      s.grp.scale.setScalar(1);
    });
    gulls.forEach((g, i) => { g.diveTell = gullTellSnap[i]; });
    gullDiveCd = gullCdSnap;
    alarms.length = 0;   // M16: drain the alarm bus at the block boundary
  }

  /* ---- M16: animal alarm bus + cross-species reactions ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const pAt = (p) => setClockP(((p - gameMin / 1800) % 1 + 1) % 1);
    const crabSnap = crabs.map((c) => ({ fleeT: c.fleeT, dir: c.dir }));
    const monkeySnap = monkeys.map((m) => ({ screamT: m.screamT, scareT: m.scareT,
                                             scareX: m.scareX, scareZ: m.scareZ,
                                             alertT: m.alertT, alertX: m.alertX, alertZ: m.alertZ }));
    const lizardSnap = lizards.map((l) => ({ scareT: l.scareT, scareX: l.scareX, scareZ: l.scareZ }));
    const snakeSnap = snakes.map((s) => s.freezeT);
    const pelicanSnap = pelicans.map((p) => ({ fleeT: p.fleeT, fleeX: p.fleeX, fleeZ: p.fleeZ }));
    const sharkSnap = sharks.map((s) => ({ x: s.x, z: s.z, dir: s.dir, state: s.state,
                                           tellT: s.tellT, atkCd: s.atkCd, fleeT: s.fleeT,
                                           fleeX: s.fleeX, fleeZ: s.fleeZ }));
    const schoolSnap = schools.map((s) => ({ x: s.x, z: s.z, scT: s.scT, scX: s.scX, scZ: s.scZ }));
    const tigerSnap = tigers.map((t) => ({ x: t.x, z: t.z, state: t.state,
                                           panicT: t.panicT, panicX: t.panicX, panicZ: t.panicZ }));
    const gullWaterSnap = gullWaterT;
    const infSnap = infectedWound;
    pAt(0.33); pump(2);
    stats.health = 100; stats.thirst = 100; stats.hunger = 100; infectedWound = false;

    // 1. primitives: raise, coverage, expiration
    if (typeof alarmRaise !== 'function' || typeof alarmsNear !== 'function' ||
        typeof updateAlarms !== 'function' || !Array.isArray(alarms))
      throw new Error('M16: the alarm bus primitives are missing');
    alarms.length = 0;
    alarmRaise('scream', 0, 0, 20, 2);
    if (!alarmsNear(5, 5, ['scream']))
      throw new Error('M16: alarmsNear should find a covering scream alarm');
    if (alarmsNear(30, 0, ['scream']))
      throw new Error('M16: alarmsNear must not reach outside the alarm radius');
    pump(180);   // 3 s: the 2 s alarm must be gone
    if (alarms.some((a) => a.kind === 'scream' && a.x === 0 && a.z === 0))
      throw new Error('M16: the alarm should expire after its duration');
    alarms.length = 0;

    // 2. cross-reactions from a raised alarm (crab / lizard / snake / pelican)
    {
      const c0 = crabs.find((c) => c.alive);
      if (!c0) throw new Error('M16: no living crab to test');
      alarmRaise('scream', c0.x, c0.z, 20, 4);
      pump(2);
      if (!(c0.fleeT > 0)) throw new Error('M16: the crab should bolt from a scream alarm');
      if (!learned.has('crabalarm')) throw new Error('M16: the crab alarm should teach the tell');
    }
    {
      const l0 = lizards[0];
      alarms.length = 0;
      alarmRaise('attack', l0.x, l0.z, 20, 4);
      pump(2);
      if (!(l0.scareT > 0)) throw new Error('M16: the lizard should be spooked by an attack alarm');
    }
    {
      const s0 = snakes[0];
      alarms.length = 0;
      alarmRaise('alert', s0.x, s0.z, 25, 4);
      pump(2);
      if (!(s0.freezeT > 0)) throw new Error('M16: the snake should freeze at an alert alarm');
    }
    {
      const p0 = pelicans[0];
      alarms.length = 0;
      alarmRaise('scream', p0.x, p0.z, 30, 4);
      pump(2);
      if (!(p0.fleeT > 0)) throw new Error('M16: the pelican should flee a scream alarm');
    }

    // 3. monkey shriek emission: the tell moment rings a 'scream' at the monkey
    pAt(0.008); pump(2);
    alarms.length = 0;
    {
      const m0 = monkeys[1];
      park(camp.x, camp.z);   // 60u+ from every tiger home (M13 pattern)
      const t0 = tigers[0];
      m0.screamT = 0; m0.scareT = 0; m0.alertT = 0;
      t0.x = m0.hx + 3; t0.z = m0.hz; t0.state = 'patrol';
      pump(3);
      if (!alarms.some((a) => a.kind === 'scream' &&
          Math.hypot(a.x - m0.x, a.z - m0.z) < 2))
        throw new Error('M16: the monkey shriek should raise a scream alarm at the monkey');
      t0.x = tigerSnap[0].x; t0.z = tigerSnap[0].z; t0.state = tigerSnap[0].state;
      monkeys.forEach((m) => { m.screamT = 0; m.alertT = 0; });
      alarms.length = 0;
      park(spawn.x, spawn.z);
    }

    // 4. curious-shark emission + fish scatter (M15 pattern)
    pAt(0.33); pump(2);
    alarms.length = 0;
    {
      const s0 = sharks[0];
      const sx = schools[0];
      park(sx.bx, sx.bz);   // the school home is shallow water
      s0.x = sx.bx + 6; s0.z = sx.bz;
      s0.state = 'patrol'; s0.fleeT = 0; s0.tellT = 0; s0.atkCd = 999;
      sharks[1].atkCd = 999;
      gullWaterT = 0;
      pump(60);   // 1 s: the patrol->curious edge fires once
      if (!(gullWaterT > 0))
        throw new Error('M16: the M15 gull scream must stay alive: ' + gullWaterT);
      const sharkScreams = alarms.filter((a) => a.kind === 'scream' &&
          Math.hypot(a.x - (sx.bx + 6), a.z - sx.bz) < 2);
      if (sharkScreams.length !== 1)
        throw new Error('M16: the curious turn should raise exactly one scream alarm at the shark (edge, not per-frame): ' + sharkScreams.length);
      if (!(sx.scT > 0)) throw new Error('M16: the school should scatter from the gull scream');
      if (!learned.has('fishscatter')) throw new Error('M16: the scatter should teach the tell');
      park(spawn.x, spawn.z);
    }

    // 5. panicWildlife emission: the M11 hook rings an 'alert' at the strike point
    {
      const x = spawn.x + 5, z = spawn.z;
      alarms.length = 0;
      panicWildlife(x, z);
      if (!alarms.some((a) => a.kind === 'alert' &&
          Math.hypot(a.x - x, a.z - z) < 0.5))
        throw new Error('M16: panicWildlife should raise an alert alarm at the strike point');
    }

    // leave a clean state (M16)
    alarms.length = 0;
    park(spawn.x, spawn.z);
    setWeatherDebug('clear');
    pAt(0.33);
    stats.health = 100;
    infectedWound = infSnap;
    gullWaterT = gullWaterSnap;
    crabs.forEach((c, i) => { c.fleeT = crabSnap[i].fleeT; c.dir = crabSnap[i].dir; });
    monkeys.forEach((m, i) => { const q = monkeySnap[i];
      m.screamT = q.screamT; m.scareT = q.scareT; m.scareX = q.scareX; m.scareZ = q.scareZ;
      m.alertT = q.alertT; m.alertX = q.alertX; m.alertZ = q.alertZ; });
    lizards.forEach((l, i) => { const q = lizardSnap[i];
      l.scareT = q.scareT; l.scareX = q.scareX; l.scareZ = q.scareZ; });
    snakes.forEach((k, i) => { k.freezeT = snakeSnap[i]; });
    pelicans.forEach((p, i) => { const q = pelicanSnap[i];
      p.fleeT = q.fleeT; p.fleeX = q.fleeX; p.fleeZ = q.fleeZ; });
    sharks.forEach((s, i) => { const q = sharkSnap[i];
      s.x = q.x; s.z = q.z; s.dir = q.dir; s.state = q.state;
      s.tellT = q.tellT; s.atkCd = q.atkCd; s.fleeT = q.fleeT;
      s.fleeX = q.fleeX; s.fleeZ = q.fleeZ;
      s.grp.scale.setScalar(1); });
    schools.forEach((s, i) => { const q = schoolSnap[i];
      s.x = q.x; s.z = q.z; s.scT = q.scT; s.scX = q.scX; s.scZ = q.scZ; });
    tigers.forEach((t, i) => { const q = tigerSnap[i];
      t.x = q.x; t.z = q.z; t.state = q.state;
      t.panicT = q.panicT; t.panicX = q.panicX; t.panicZ = q.panicZ; });
  }

  /* ---- M17: animal ecosystem integration + balancing (the spider, 10th species) ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const pAt = (p) => setClockP(((p - gameMin / 1800) % 1 + 1) % 1);
    const spiderSnap = spiders.map((s) => ({ x: s.x, z: s.z, dir: s.dir, phase: s.phase,
        raidCd: s.raidCd, tellT: s.tellT, fleeT: s.fleeT, fleeX: s.fleeX, fleeZ: s.fleeZ,
        pfleeT: s.pfleeT }));
    const invSnap = { ...INV };
    const learnedSnap = { spider: learned.has('spider'), spiderfire: learned.has('spiderfire') };
    const fFence = camp.structures.fence, fTorch = camp.structures.torch;
    const firesSnap = fires.map((f) => ({ x: f.x, z: f.z }));

    // 1. registry: the full 10-species island, slot 9 is the spider ('late', pop 3)
    if (animals.length !== 10) throw new Error('M17: expected 10 registered species, got ' + animals.length);
    const sp9 = animals[9];
    if (!sp9 || sp9.id !== 'spider' || sp9.pop !== spiders || sp9.pop.length !== 3 ||
        sp9.phase !== 'late' || typeof sp9.step !== 'function')
      throw new Error('M17: registry slot 9 must be the spider descriptor');
    const wantIds = ['fish', 'crab', 'tiger', 'gull', 'monkey', 'lizard', 'snake', 'pelican', 'shark'];
    wantIds.forEach((id, i) => {
      if (!animals[i] || animals[i].id !== id)
        throw new Error('M17: registry slot ' + i + ' drifted to ' + (animals[i] && animals[i].id));
    });

    // 2. spawn invariants: jungle-edge/camp band, 30u+ from spawn, 15u+ from tiger homes, 8u+ apart
    for (const s of spiders) {
      const h = heightAt(s.hx, s.hz);
      if (h < 3 || h > 12) throw new Error('M17: spider home outside the 3..12 band: ' + h);
      if (Math.hypot(s.hx - spawn.x, s.hz - spawn.z) < 30) throw new Error('M17: spider home < 30u from spawn');
      if (tigers.some((t) => Math.hypot(t.hx - s.hx, t.hz - s.hz) < 15))
        throw new Error('M17: spider home < 15u from a tiger home');
    }
    for (let i = 0; i < spiders.length; i++)
      for (let j = i + 1; j < spiders.length; j++)
        if (Math.hypot(spiders[i].hx - spiders[j].hx, spiders[i].hz - spiders[j].hz) < 8)
          throw new Error('M17: spider homes must be 8u+ apart');

    // 2b. coexistence sanity (10 species): no empty population, no NaN positions, spider mesh built
    for (const sp of animals) {
      if (!sp.pop.length) throw new Error('M17: the ' + sp.id + ' population is empty');
      if (sp.pop.some((a) => !isFinite(a.x) || !isFinite(a.z)))
        throw new Error('M17: the ' + sp.id + ' population has a NaN position');
    }
    if (spiders.some((s) => !s.grp || s.grp.children.length < 8 || !isFinite(s.grp.position.x) ||
        !isFinite(s.grp.position.y) || !isFinite(s.grp.position.z)))
      throw new Error('M17: a spider mesh is missing or NaN');

    // 3. day: the spiders hold at their dens, nothing is stolen
    pAt(0.33); pump(2);
    {
      if (dayFactor < 0.25) throw new Error('M17: noon clock setup failed, dayFactor ' + dayFactor);
      for (const k of SPIDER_MEAT_ORDER) INV[k] = 0;
      const s0 = spiders[0];
      s0.x = s0.hx + 10; s0.z = s0.hz;
      pump(360);   // 6 s: returnHome pulls the displaced spider back
      if (Math.hypot(s0.hx - s0.x, s0.hz - s0.z) >= 10)
        throw new Error('M17: the day spider should return to its den, ' + Math.hypot(s0.hx - s0.x, s0.hz - s0.z).toFixed(1) + 'u out');
      if (SPIDER_MEAT_ORDER.some((k) => INV[k] !== 0)) throw new Error('M17: day spiders must not steal');
    }

    // 4. night, unlit camp, meat present, player at the camp: exactly one meat sniped
    pAt(0.85); pump(2);
    {
      if (dayFactor >= 0.25) throw new Error('M17: night clock setup failed, dayFactor ' + dayFactor);
      camp.structures.fence = null; camp.structures.torch = null;   // unfortified
      fires.forEach((f) => { f.x += 200; f.z += 200; });   // no camp fire can lit it
      if (campIsLit()) throw new Error('M17: setup - the camp must be dark');
      for (const k of SPIDER_MEAT_ORDER) INV[k] = 0;
      INV.crabCooked = 1;
      const s0 = spiders[0];
      s0.x = camp.x - 6; s0.z = camp.z;
      s0.raidCd = 0; s0.tellT = 0; s0.fleeT = 0; s0.pfleeT = 0;
      park(camp.x, camp.z);   // inside SPIDER_RAID_RANGE, 3u from the stop point (flee radius 2)
      pump(400);   // ~6.7 s: 3u creep at 1.8u/s + 0.9 s tell
      if (INV.crabCooked !== 0) throw new Error('M17: the spider should have sniped the unlit camp meat: ' + INV.crabCooked);
      if (s0.raidCd <= 0) throw new Error('M17: the raid should set the per-spider cooldown');
      if (!learned.has('spider')) throw new Error('M17: the raid should teach the tell');
      s0.x = spiderSnap[0].x; s0.z = spiderSnap[0].z;
      s0.raidCd = 0; s0.tellT = 0; s0.fleeT = 0; s0.pfleeT = 0;
      for (const k of SPIDER_MEAT_ORDER) INV[k] = 0;   // reset before the lit-camp leg
      INV.fishRaw = 1;   // a different meat item: proves the order, not the item, is the target
    }

    // 5. night, lit camp: the spider never crosses the perimeter, the tell is learned
    {
      camp.structures.torch = fTorch;   // the universal counter: fire/torch, no fence needed
      if (!campIsLit()) throw new Error('M17: setup - the camp must be lit for the perimeter test');
      const s0 = spiders[0];
      s0.x = camp.x - 5; s0.z = camp.z;   // inside the blocked radius
      s0.raidCd = 0; s0.tellT = 0; s0.fleeT = 0; s0.pfleeT = 0;
      park(camp.x, camp.z);
      pump(300);   // 5 s: enough frames to cross the perimeter if the veto fails
      if (INV.fishRaw !== 1) throw new Error('M17: the lit camp should keep the spider from the meat: ' + INV.fishRaw);
      if (!learned.has('spiderfire')) throw new Error('M17: the held perimeter should teach the fire tell');
      if (Math.hypot(camp.x - s0.x, camp.z - s0.z) < SPIDER_RAID_STOP)
        throw new Error('M17: the lit-camp veto should stop the spider before the steal point: ' + Math.hypot(camp.x - s0.x, camp.z - s0.z).toFixed(2));
      s0.x = spiderSnap[0].x; s0.z = spiderSnap[0].z;
      s0.raidCd = 0; s0.tellT = 0; s0.fleeT = 0; s0.pfleeT = 0;
      camp.structures.torch = null; camp.structures.fence = null;
    }

    // 6. alarm-bus reaction only: a nearby alarm starts the flee, the spider never emits
    alarms.length = 0;
    {
      const s1 = spiders[1];
      const sA = { fleeT: s1.fleeT, fleeX: s1.fleeX, fleeZ: s1.fleeZ };
      const p1x = s1.x, p1z = s1.z;
      alarmRaise('scream', p1x, p1z, 20, 4);
      pump(2);
      if (!(s1.fleeT > 0)) throw new Error('M17: the spider should flee a nearby alarm');
      if (s1.fleeX !== p1x || s1.fleeZ !== p1z)
        throw new Error('M17: the spider flee should aim away from the alarm');
      alarms.length = 0;
      s1.fleeT = sA.fleeT; s1.fleeX = sA.fleeX; s1.fleeZ = sA.fleeZ;
    }

    // leave a clean state (M17)
    alarms.length = 0;
    park(spawn.x, spawn.z);
    setWeatherDebug('clear');
    pAt(0.33);
    camp.structures.fence = fFence; camp.structures.torch = fTorch;
    fires.forEach((f, i) => { f.x = firesSnap[i].x; f.z = firesSnap[i].z; });
    Object.assign(INV, invSnap);
    spiders.forEach((s, i) => { const q = spiderSnap[i];
      s.x = q.x; s.z = q.z; s.dir = q.dir; s.phase = q.phase;
      s.raidCd = q.raidCd; s.tellT = q.tellT; s.fleeT = q.fleeT;
      s.fleeX = q.fleeX; s.fleeZ = q.fleeZ; s.pfleeT = q.pfleeT;
      s.legs.forEach((l) => { l.rotation.z = 0; });
    });
    if (!learnedSnap.spider) learned.delete('spider');
    if (!learnedSnap.spiderfire) learned.delete('spiderfire');
  }
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
