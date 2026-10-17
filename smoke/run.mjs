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
  if (crabs.length !== 9 || gulls.length !== 5 || tigers.length !== 3 || schools.length !== 5)
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

  /* ---- M12: animal framework (registry + shared behaviour helpers) ---- */
  {
    // 1. the shared framework helpers exist
    if (typeof registerAnimal !== 'function' || typeof homeWander !== 'function' ||
        typeof returnHome !== 'function' || typeof faceHome !== 'function' ||
        typeof applyMove !== 'function' || typeof panicWildlife !== 'function' ||
        typeof updateAnimals !== 'function')
      throw new Error('M12: missing animal framework helper');

    // 2. registry: exactly the 4 reference species in frame() order, bound to
    //    the canonical arrays with the unchanged pre-M12 populations
    if (animals.length !== 4) throw new Error('M12: expected 4 registered species, got ' + animals.length);
    const want = [['fish', schools, 5, 'early'], ['crab', crabs, 9, 'early'],
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
