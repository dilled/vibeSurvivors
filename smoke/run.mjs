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
    remove: () => {},   /* M27: the MP HUD / name-prompt panels detach themselves */
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      measureText: () => ({ width: 10 }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {}, clearRect: () => {},
      beginPath: () => {}, closePath: () => {}, arc: () => {}, fill: () => {},
      stroke: () => {}, fillText: () => {},
      moveTo: () => {}, lineTo: () => {}, strokeRect: () => {}, rect: () => {},
      drawImage: () => {}, save: () => {}, restore: () => {},   /* M18: paper map */
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
globalThis.addEventListener = (ev, cb) => { if (ev === 'keydown') globalThis.__keydownCb = cb; };   // M26: capture the game's title-card/action keydown handler
globalThis.removeEventListener = () => {};
globalThis.window = globalThis;
globalThis.location = { search: '', href: 'http://localhost/', reload: () => {} };
/* M25: in-memory localStorage stub (the game guards all access with storageOk + try/catch) */
{
  const __ls = {};
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(__ls, k) ? __ls[k] : null),
    setItem: (k, v) => { __ls[k] = String(v); },
    removeItem: (k) => { delete __ls[k]; },
    clear: () => { for (const k of Object.keys(__ls)) delete __ls[k]; },
  };
}
globalThis.__rafCb = null;
globalThis.requestAnimationFrame = (cb) => { globalThis.__rafCb = cb; return 1; };
globalThis.__audioTime = 0;   // M23: stub AudioContext clock, advanced by the pumps
globalThis.__audioCalls = { osc: 0, noise: 0, buffer: 0, gain: 0, filter: 0, resume: 0 };
/* M23: minimal WebAudio stub ‒ the game assumes window.AudioContext exists */
class AParam { constructor(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } }
class AudioContextStub {
  constructor() {
    this.state = 'suspended';
    this.sampleRate = 44100;
    this.destination = {};
  }
  get currentTime() { return globalThis.__audioTime; }
  resume() { this.state = 'running'; globalThis.__audioCalls.resume++; return Promise.resolve(); }
  createGain() { globalThis.__audioCalls.gain++; return { gain: new AParam(0), connect: () => {} }; }
  createStereoPanner() { return { pan: new AParam(0), connect: () => {} }; }
  createOscillator() { globalThis.__audioCalls.osc++; return { frequency: new AParam(440), type: 'sine', connect: () => {}, start: () => {}, stop: () => {} }; }
  createBuffer(ch, len, rate) { globalThis.__audioCalls.buffer++; return { length: len, sampleRate: rate, numberOfChannels: ch, getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { globalThis.__audioCalls.noise++; return { buffer: null, loop: false, playbackRate: new AParam(1), connect: () => {}, start: () => {}, stop: () => {} }; }
  createBiquadFilter() { globalThis.__audioCalls.filter++; return { type: 'lowpass', frequency: new AParam(1000), Q: new AParam(1), connect: () => {} }; }
}
globalThis.AudioContext = AudioContextStub;
globalThis.window.AudioContext = AudioContextStub;
/* M27: count WebSocket constructions — must stay 0 without ?mp= (single-player untouched) */
globalThis.__wsCtor = 0;
globalThis.WebSocket = class { constructor() { globalThis.__wsCtor++; } };

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
let patched = src.replace("from 'three'", "from './three-stub.mjs'");
patched += `
;
/* ---- smoke driver: island + movement + time (module scope) ---- */
{
  let __tt = 1000;
  const pump = (n) => { for (let i = 0; i < n; i++) { const cb = __rafCb; __rafCb = null; __tt += 16.7; globalThis.__audioTime += 0.0167; if (cb) cb(__tt); } };   // M23: audio clock advances with the frames
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
      const cb = __rafCb; __rafCb = null; __tt += 16.7; globalThis.__audioTime += 0.0167; if (cb) cb(__tt);   // M23
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
    if (spiders.some((s) => !s.grp || !s.grp.levels || s.grp.levels[0].level.children.length < 8 ||
        !isFinite(s.grp.position.x) || !isFinite(s.grp.position.y) || !isFinite(s.grp.position.z)))
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

  /* ---- M18: paper map ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const visitedCount = () => { let n = 0; for (let i = 0; i < mapVisited.length; i++) n += mapVisited[i]; return n; };

    // 1. initial state: closed, the wreck known, spawn cells visited
    if (mapOpen) throw new Error('M18: the map should start closed');
    if (!mapKnown.has('wreck')) throw new Error('M18: the wreck should be known from the start');
    if (visitedCount() === 0) throw new Error('M18: the visited grid should be seeded around spawn');

    // 2. toggle + throttled draw on the stubbed 2D context
    toggleMap();
    if (!mapOpen) throw new Error('M18: toggleMap should open the map');
    mapDraw(0.2);
    mapDraw(0.2);
    const visDrawn = visitedCount();
    toggleMap();
    if (mapOpen) throw new Error('M18: toggleMap should close the map');
    if (visitedCount() !== visDrawn) throw new Error('M18: drawing should not change the visited grid');

    // 3. proximity discovery in a controlled state: clear, park at a monkey home
    mapKnown.clear(); mapKnown.add('wreck');
    mapVisited.fill(0); mapRevealDirty = true;
    const mk = monkeys[0];
    park(mk.hx, mk.hz);
    mapTick(0.1);
    if (!mapKnown.has('terr:monkey:0'))
      throw new Error('M18: the monkey territory should be discovered on proximity');
    if (visitedCount() === 0) throw new Error('M18: the visited grid should mark walked cells');
    const k1 = mapKnown.size, v1 = visitedCount();
    mapTick(0.1); mapTick(0.1);
    if (mapKnown.size !== k1 || visitedCount() !== v1)
      throw new Error('M18: discovery should be idempotent at a fixed position');
    const far = plants.find((q) =>
      Math.hypot(q.x - mk.hx, q.z - mk.hz) > MAP_SEE_R * 1.5 &&
      Math.hypot(q.x - spawn.x, q.z - spawn.z) > MAP_SEE_R * 1.5);
    if (!far) throw new Error('M18: no plant far enough from the test positions');
    if (mapKnown.has('plant:' + plants.indexOf(far)))
      throw new Error('M18: a far plant must not leak onto the map');
    toggleMap(); mapDraw(0.2); toggleMap();

    // leave a clean state (M18)
    mapKnown.clear(); mapKnown.add('wreck');
    mapVisited.fill(0); mapRevealDirty = true;
    park(spawn.x, spawn.z);
    mapTick(0.1);
    if (animals.length !== 10) throw new Error('M18: the registry must still hold 10 species: ' + animals.length);
    if (mapOpen) throw new Error('M18: the map should be left closed');
  }

  /* ---- M19: field journal + first-sighting discoveries ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const learnedSnap = new Set(learned);
    const journalSnap = journal.slice();
    const seeSnap = [...learned].filter((k) => k.startsWith('see-'));

    // 1. structured {cat, msg, day} entry + dedupe
    journal.length = 0;
    learn('smoketest-x', 'smoke entry one');
    learn('smoketest-x', 'smoke entry one');
    if (journal.length !== 1) throw new Error('M19: learn should dedupe: ' + journal.length);
    const e0 = journal[0];
    if (e0.cat !== 'survival' || e0.msg !== 'smoke entry one' || !(Number.isInteger(e0.day) && e0.day >= 1))
      throw new Error('M19: entry must be {cat, msg, day}: ' + JSON.stringify(e0));

    // 2. category derivation
    const catChecks = [
      ['fiber', 'plants'], ['eat-poisonberry', 'plants'], ['herb-cure', 'plants'],
      ['tiger', 'animals'], ['see-crab', 'animals'], ['monkeyscream', 'animals'], ['bite', 'animals'],
      ['storm', 'weather'], ['lightning', 'weather'], ['wet', 'weather'],
      ['camp', 'survival'], ['water', 'survival'], ['infection', 'survival'],
    ];
    for (const [k, want] of catChecks) if (catOf(k) !== want)
      throw new Error('M19: catOf(' + k + ') should be ' + want + ', got ' + catOf(k));

    // 3. first sighting: park at a crab, record in range, idempotent
    for (const k of seeSnap) learned.delete(k);
    const cr = crabs[0];
    park(cr.x, cr.z);
    let expect = 0;
    for (const sp of animals) {
      const inR = sp.id === 'fish'
        ? schools.some((s) => Math.hypot(s.bx - cr.x, s.bz - cr.z) < SIGHT_R)
        : sp.pop.some((a) => Math.hypot(a.x - cr.x, a.z - cr.z) < SIGHT_R);
      if (inR) expect++;
    }
    if (expect < 1) throw new Error('M19: the crab itself must be in range of its own position');
    journal.length = 0;
    journalTick(0.1);
    if (!learned.has('see-crab')) throw new Error('M19: the crab should be recorded on sight');
    const animalRows = journal.filter((q) => q.cat === 'animals');
    if (animalRows.length !== expect)
      throw new Error('M19: expected ' + expect + ' sighting entries, got ' + animalRows.length);
    if (!animalRows.every((q) => q.day >= 1 && typeof q.msg === 'string' && q.msg.length > 0))
      throw new Error('M19: sighting entries must carry a day and a message');
    const k2 = learned.size, j2 = journal.length;
    journalTick(0.1); journalTick(0.1);
    if (learned.size !== k2 || journal.length !== j2)
      throw new Error('M19: sighting should be idempotent at a fixed position');
    for (const k of seeSnap) learned.add(k);

    // 4. toggle + render: grouped categories, entries visible
    journal.length = 0;
    journal.push({ cat: 'plants', msg: 'smoke plant entry', day: dayOf() });
    journal.push({ cat: 'animals', msg: 'smoke animal entry', day: dayOf() });
    toggleJournal();
    if (!journalOpen) throw new Error('M19: toggleJournal should open the journal');
    const html = String(journalEl.innerHTML);
    for (const word of ['Plants', 'Animals', 'Weather', 'Survival'])
      if (html.indexOf(word) < 0) throw new Error('M19: the journal should list the ' + word + ' category');
    if (html.indexOf('day ' + dayOf() + ' \u2014 smoke plant entry') < 0)
      throw new Error('M19: entries should render as "day N \u2014 msg"');
    if (html.indexOf('smoke animal entry') < 0)
      throw new Error('M19: the animal entry should render too');
    toggleJournal();
    if (journalOpen) throw new Error('M19: toggleJournal should close the journal');

    // 5. death auto-closes; dead player cannot open
    dead = true;
    toggleJournal();
    journalTick(0.1);
    if (journalOpen) throw new Error('M19: the journal should close on death');
    dead = false;

    // leave a clean state (M19)
    journal.length = 0; journal.push(...journalSnap);
    for (const k of learned) if (!learnedSnap.has(k)) learned.delete(k);
    for (const k of learnedSnap) learned.add(k);
    park(spawn.x, spawn.z);
    if (journalOpen) throw new Error('M19: the journal should be left closed');
    if (animals.length !== 10) throw new Error('M19: the registry must still hold 10 species: ' + animals.length);
  }

  /* ---- M20: raft construction (wood -> rope -> raft) ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const learnedSnap = new Set(learned);
    const journalSnap = journal.slice();
    const invSnap = { ...INV };
    const raftSnap = camp.structures.raft;
    const clearOf = (x, z) =>
      items.every((i) => i.taken || Math.hypot(i.x - x, i.z - z) > 2) &&
      fires.every((f) => Math.hypot(f.x - x, f.z - z) > 3);

    // 1. a spent palm gives wood on E (pure inventory counter, no new entity)
    const dryPalm = palms.find((p) => heightAt(p.x, p.z) > 0.35 && clearOf(p.x, p.z));
    if (!dryPalm) throw new Error('M20: no dry palm site for the wood test');
    const cocos0 = dryPalm.cocos;
    dryPalm.cocos = 0;
    const wood0 = INV.wood;
    park(dryPalm.x, dryPalm.z);
    actUse();
    if (INV.wood !== wood0 + 1) throw new Error('M20: the spent palm should yield 1 wood: ' + INV.wood);
    if (!learned.has('wood')) throw new Error('M20: the wood journal entry is missing');
    if (dryPalm.cocos !== 0) throw new Error('M20: the wood path must not touch coconuts');
    dryPalm.cocos = cocos0;

    // 2. coconut palms still drop coconuts (the old path is intact)
    const cocoPalm = palms.find((p) => p.cocos > 0 && heightAt(p.x, p.z) > 0.35 && clearOf(p.x, p.z));
    if (!cocoPalm) throw new Error('M20: no coconut palm site for the regression check');
    const drops0 = items.length, cocos1 = cocoPalm.cocos;
    park(cocoPalm.x, cocoPalm.z);
    actUse();
    if (cocoPalm.cocos !== cocos1 - 1) throw new Error('M20: a coconut palm must still drop a coconut');
    if (items.length !== drops0 + 1) throw new Error('M20: the coconut item must enter the world');
    const drop = items[items.length - 1];
    drop.taken = true;
    scene.remove(drop.mesh);
    items.pop();
    if (INV.wood !== wood0 + 1) throw new Error('M20: the coconut path must not grant wood');

    // 3. rope: 3 fiber -> 1 rope (U, anywhere), guarded on fiber
    const rope0 = INV.rope;
    INV.fiber = ROPE_FIBER;
    actCraftRope();
    if (INV.fiber !== 0 || INV.rope !== rope0 + 1)
      throw new Error('M20: rope craft should consume 3 fiber: ' + INV.fiber + '/' + INV.rope);
    if (!learned.has('rope')) throw new Error('M20: the rope journal entry is missing');
    actCraftRope();   // 0 fiber: no-op
    if (INV.rope !== rope0 + 1) throw new Error('M20: crafting at 0 fiber must be a no-op');

    // 4. raft: 8 wood + 4 rope at camp (O)
    if (!camp) throw new Error('M20: the M2 camp should still exist');
    if (raftSnap) { scene.remove(raftSnap); camp.structures.raft = null; }
    INV.wood = RAFT_WOOD; INV.rope = RAFT_ROPE;
    park(camp.x, camp.z);
    actBuildRaft();
    if (!camp.structures.raft) throw new Error('M20: the raft should be built');
    if (INV.wood !== 0 || INV.rope !== 0) throw new Error('M20: the recipe must be consumed');
    if (!learned.has('raft')) throw new Error('M20: the raft journal entry is missing');
    if (!journal.some((e) => e.cat === 'survival' && e.msg.indexOf('raft') >= 0))
      throw new Error('M20: the raft build should log a journal line');
    const raftRef = camp.structures.raft;
    actBuildRaft();
    if (camp.structures.raft !== raftRef) throw new Error('M20: the raft should not build twice');
    camp.structures.raft = null;
    scene.remove(raftRef);
    INV.wood = RAFT_WOOD - 1; INV.rope = RAFT_ROPE;
    actBuildRaft();
    if (camp.structures.raft) throw new Error('M20: a short recipe must not build the raft');
    if (INV.wood !== RAFT_WOOD - 1) throw new Error('M20: a failed build must not consume wood');

    // leave a clean state (M20)
    camp.structures.raft = raftSnap;
    for (const k in INV) INV[k] = invSnap[k];
    for (const k of learned) if (!learnedSnap.has(k)) learned.delete(k);
    for (const k of learnedSnap) learned.add(k);
    journal.length = 0; journal.push(...journalSnap);
    park(spawn.x, spawn.z);
    if (animals.length !== 10) throw new Error('M20: the registry must still hold 10 species: ' + animals.length);
  }

  /* ---- M21: escape / win sequence (board the raft, row past the reef) ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const learnedSnap = new Set(learned);
    const journalSnap = journal.slice();
    const invSnap = { ...INV };
    const raftSnap = camp.structures.raft;

    // clean board for the crossing
    onRaft = false; won = false; wonEl.style.display = 'none'; wonEl.innerHTML = '';
    if (raftSnap) { scene.remove(raftSnap); camp.structures.raft = null; }

    // 1. no raft: E is a no-op with respect to boarding
    park(camp.x, camp.z);
    actUse(); actUse(); actUse();
    if (onRaft) throw new Error('M21: E must not board when no raft is built');
    if (learned.has('sail')) throw new Error('M21: no sail learn without a raft');

    // 2. build the raft, board within reach, unboard again
    INV.wood = RAFT_WOOD; INV.rope = RAFT_ROPE;
    park(camp.x, camp.z);
    actBuildRaft();
    const raft = camp.structures.raft;
    if (!raft) throw new Error('M21: the raft should be built');
    park(raft.position.x, raft.position.z);
    actUse();
    if (onRaft !== true) throw new Error('M21: E near the raft should board it');
    if (!learned.has('sail')) throw new Error('M21: the sail journal entry is missing');
    actUse();
    if (onRaft !== false) throw new Error('M21: E again near the raft should unboard');

    // 3. re-board and row out past WIN_R: the win freezes the sim
    actUse();
    if (onRaft !== true) throw new Error('M21: re-boarding should work');
    raft.position.set(0, WATER, WIN_R + 10);
    rig.position.set(0, WATER + 0.7, WIN_R + 10);
    pump(3);
    if (won !== true) throw new Error('M21: rowing past WIN_R should win');
    if (started !== false) throw new Error('M21: the win should freeze the sim (started)');
    if (onRaft !== false) throw new Error('M21: the win should clear onRaft');
    if (wonEl.style.display !== 'flex') throw new Error('M21: the win overlay should show');
    if (String(wonEl.innerHTML).indexOf('YOU LEFT THE ISLAND') < 0)
      throw new Error('M21: the win overlay should announce the escape');
    if (!journal.some((e) => e.cat === 'survival' && e.msg.indexOf('island') >= 0))
      throw new Error('M21: the escape should log a survival journal line');

    // leave a clean state (M21)
    won = false; onRaft = false; started = true;
    wonEl.style.display = 'none'; wonEl.innerHTML = '';
    if (camp.structures.raft) { scene.remove(camp.structures.raft); camp.structures.raft = null; }
    if (raftSnap) { scene.add(raftSnap); camp.structures.raft = raftSnap; }
    for (const k in INV) INV[k] = invSnap[k];
    for (const k of learned) if (!learnedSnap.has(k)) learned.delete(k);
    for (const k of learnedSnap) learned.add(k);
    journal.length = 0; journal.push(...journalSnap);
    park(spawn.x, spawn.z);
    if (animals.length !== 10) throw new Error('M21: the registry must still hold 10 species: ' + animals.length);
  }

  /* ---- M22: endless mode + adaptation / escalating pressure ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const segLenAtEntry = weather.segs.length;   // story-schedule boundary (boost 0 below it)
    const snap = {
      endless, endlessStartDay, endlessStartMin, won, started, dead,
      gameMin, health: stats.health, inv: { ...INV },
      learned: new Set(learned), journal: journal.slice(),
      deadHtml: deadEl.innerHTML, deadDisplay: deadEl.style.display,
      raft: camp.structures.raft,
    };
    const restore = () => {
      endless = snap.endless; endlessStartDay = snap.endlessStartDay; endlessStartMin = snap.endlessStartMin;
      won = snap.won; started = snap.started; dead = snap.dead;
      gameMin = snap.gameMin; stats.health = snap.health;
      for (const k in INV) INV[k] = snap.inv[k];
      learned.clear(); for (const k of snap.learned) learned.add(k);
      journal.length = 0; journal.push(...snap.journal);
      weather.segs.length = segLenAtEntry;   // append-only cache: truncate what M22 appended
      deadEl.innerHTML = snap.deadHtml; deadEl.style.display = snap.deadDisplay;
      if (camp.structures.raft) { scene.remove(camp.structures.raft); camp.structures.raft = null; }
      if (snap.raft) { scene.add(snap.raft); camp.structures.raft = snap.raft; }
      park(spawn.x, spawn.z);
    };

    // 1. story invariants: every escalation factor is exactly 0 before endless
    if (endlessDay() !== 0) throw new Error('M22: story endlessDay must be 0');
    if (tigerBoost() !== 0 || pelicanBoost() !== 0 || dayBoost() !== 0)
      throw new Error('M22: story boosts must all be 0');
    if (timeRate(0.3) !== 0.6 || timeRate(0.7) !== 1.2)
      throw new Error('M22: story timeRate must be the old day/night rates');
    if (stormBoost(gameMin) !== 0) throw new Error('M22: story stormBoost must be 0');

    // 2. entry: replicate the M21 win, then stay on the island (E on the overlay)
    onRaft = false; won = false; started = true;
    wonEl.style.display = 'none'; wonEl.innerHTML = '';
    if (camp.structures.raft) { scene.remove(camp.structures.raft); camp.structures.raft = null; }
    gameMin = 0;
    INV.wood = RAFT_WOOD; INV.rope = RAFT_ROPE;
    park(camp.x, camp.z);
    actBuildRaft();
    const raft = camp.structures.raft;
    if (!raft) throw new Error('M22: the raft should be built');
    park(raft.position.x, raft.position.z);
    actUse();
    if (onRaft !== true) throw new Error('M22: E should board the raft');
    raft.position.set(0, WATER, WIN_R + 10);
    rig.position.set(0, WATER + 0.7, WIN_R + 10);
    pump(3);
    if (won !== true) throw new Error('M22: rowing past WIN_R should win');
    startEndless();
    if (endless !== true) throw new Error('M22: E on the win overlay should start endless');
    if (won !== false || started !== true) throw new Error('M22: endless should unfreeze the sim');
    if (onRaft !== false) throw new Error('M22: endless should clear onRaft');
    if (wonEl.style.display !== 'none') throw new Error('M22: the win overlay should hide');
    if (Math.abs(rig.position.x - camp.x) + Math.abs(rig.position.z - camp.z) > 1e-6)
      throw new Error('M22: endless should restart the run at camp');
    if (!learned.has('endless')) throw new Error('M22: the endless learn entry is missing');
    if (!journal.some((e) => e.cat === 'survival' && e.msg.indexOf('endless') >= 0))
      throw new Error('M22: the endless entry should log a survival journal line');
    const est0 = endlessStartDay;
    startEndless();   // idempotent: already endless, nothing may move
    if (endlessStartDay !== est0) throw new Error('M22: re-entry must not move the endless clock');
    pump(1);
    if (hudText.indexOf('endless') < 0) throw new Error('M22: the HUD should show the endless day line');

    // 3. ramps: per-day escalation with caps (gameMin is the raw clock; the day
    //    index is p0*1800 + gameMin, so offset from the entry gameMin, not
    //    from endlessStartMin which already contains p0*1800)
    const g0 = endlessStartMin - p0 * 1800;
    gameMin = g0 + 2 * 1800;
    if (endlessDay() !== 2) throw new Error('M22: 2 endless days expected: ' + endlessDay());
    if (Math.abs(tigerBoost() - 0.24) > 1e-9) throw new Error('M22: tiger ramp at day 2: ' + tigerBoost());
    if (Math.abs(pelicanBoost() - 0.30) > 1e-9) throw new Error('M22: pelican ramp at day 2: ' + pelicanBoost());
    if (Math.abs(dayBoost() - 0.08) > 1e-9) throw new Error('M22: day ramp at day 2: ' + dayBoost());
    if (Math.abs(timeRate(0.3) - 0.6 * 1.08) > 1e-9) throw new Error('M22: day rate must scale by the day boost');
    if (Math.abs(timeRate(0.7) - 1.2 * 1.08) > 1e-9) throw new Error('M22: night rate must scale by the day boost');
    if (Math.abs(stormBoost(gameMin) - 0.5) > 1e-9) throw new Error('M22: storm ramp at day 2: ' + stormBoost(gameMin));
    gameMin = g0 + 42 * 1800;
    if (tigerBoost() !== 0.5 || pelicanBoost() !== 0.6 || dayBoost() !== 0.5)
      throw new Error('M22: boosts must hit their caps at day 42');
    if (stormBoost(gameMin) !== 1.0) throw new Error('M22: storm boost must cap at 1.0');

    // 4. storm escalation + exact replay: story segs keep boost 0 (generation-time
    //    boost), segs generated in endless use stormBoost(segStart)
    weatherExtend(gameMin + 36000);
    const es = weather.segs.find((s) => s.state === 'storm' && s.start >= endlessStartMin);
    if (!es) throw new Error('M22: the endless tail of the schedule should contain a storm');
    {
      const wr = mulberry32(SEED + WEATHER_SEED_OFFSET);
      const rdur = (s, s0, sb) => {
        const d = WEATHER_DUR[s];
        const v = d[0] + wr() * (d[1] - d[0]);
        return s === 'storm' ? v * (1 + 0.3 * sb) : v;
      };
      const rep = [{ state: 'clear', start: 0, end: rdur('clear', 0, 0) }];
      for (let i = 1; i < weather.segs.length; i++) {
        const s0 = rep[i - 1].end;
        const sb = i >= segLenAtEntry ? stormBoost(s0) : 0;   // boost at generation time
        const opts = WEATHER_NEXT[rep[i - 1].state];
        const r = wr(); let acc = 0; let st = opts[opts.length - 1][0];
        for (const [o, w] of opts) { acc += (o === 'storm' ? w * (1 + sb) : w); if (r < acc) { st = o; break; } }
        rep.push({ state: st, start: s0, end: s0 + rdur(st, s0, sb) });
      }
      for (let i = 0; i < rep.length; i++) {
        if (weather.segs[i].state !== rep[i].state)
          throw new Error('M22: weather replay seg ' + i + ' state mismatch');
        if (Math.abs(weather.segs[i].end - rep[i].end) > 1e-9)
          throw new Error('M22: weather replay seg ' + i + ' end mismatch');
      }
    }

    // 5. death in endless: the overlay shows the days-survived score, respawn is
    //    the spec-correct camp respawn with carried loot lost
    INV.coconut = 1;
    stats.health = 0;
    checkDeath();
    if (dead !== true) throw new Error('M22: 0 health should kill');
    if (deadEl.style.display !== 'flex') throw new Error('M22: the dead overlay should show');
    if (String(deadEl.innerHTML).indexOf('days survived') < 0)
      throw new Error('M22: the endless death overlay should show the days-survived score');
    respawn();
    if (dead !== false) throw new Error('M22: respawn should wake the player');
    if (INV.coconut !== 0) throw new Error('M22: respawn should drop the carried loot');
    if (Math.abs(rig.position.x - camp.x) + Math.abs(rig.position.z - camp.z) > 1e-6)
      throw new Error('M22: endless respawn should wake at camp');

    restore();
    if (animals.length !== 10) throw new Error('M22: the registry must still hold 10 species: ' + animals.length);
  }

  /* ---- M23: audio pass (procedural WebAudio, generated only) ---- */
  {
    // 1. autoplay policy: nothing is created before the first key
    if (audioCtx !== null) throw new Error('M23: audio must not init before the first key');
    audioInit();   // the keydown handler's first-key branch does exactly this
    if (audioCtx === null) throw new Error('M23: audioInit should create the context');
    if (audioCtx.state !== 'running') throw new Error('M23: audioInit should resume the context');
    if (!masterGain || masterGain.gain.value !== 0.5)
      throw new Error('M23: master gain should start at 0.5 unmuted: ' + (masterGain && masterGain.gain.value));
    for (const b of ['waves', 'rain', 'wind', 'fire'])
      if (!beds[b]) throw new Error('M23: ambience bed missing: ' + b);

    const ac = globalThis.__audioCalls;
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    park(spawn.x, spawn.z);
    setWeatherDebug('clear'); pump(60);   // settle beds to clear

    // 2. thunder: a strike schedules delayed noise bursts (near = louder/earlier)
    const tn0 = ac.noise;
    doLightning(5, 5);
    if (ac.noise - tn0 < 2) throw new Error('M23: doLightning should schedule the thunder bursts');
    stats.health = 100; dead = false; deadEl.style.display = 'none';
    while (fires.length > 0) { const f = fires.pop(); scene.remove(f.grp); }   // the strike may have ignited ground

    // 3. weather beds follow the blended vis values
    setWeatherDebug('rain'); pump(120);
    if (weather.vis.rain < 0.9) throw new Error('M23: rain vis should rise: ' + weather.vis.rain);
    if (Math.abs(beds.rain.gain.value - 0.16 * weather.vis.rain) > 1e-9)
      throw new Error('M23: rain bed gain should track weather.vis.rain');
    setWeatherDebug('storm'); pump(120);
    if (beds.wind.gain.value < 0.05) throw new Error('M23: storm wind bed should rise: ' + beds.wind.gain.value);
    setWeatherDebug('clear'); pump(400);
    if (beds.rain.gain.value > 0.02 || beds.wind.gain.value > 0.02)
      throw new Error('M23: weather beds should decay to clear');

    // 4. alarm-bus backstop cues (scream/alert/attack) + the distance gate
    const px = rig.position.x, pz = rig.position.z;   // cues are relative to the player
    const o0 = ac.osc;
    alarmRaise('scream', px + 5, pz + 5, 20, 3);
    if (ac.osc - o0 < 2) throw new Error('M23: scream alarm should raise the backstop cue');
    const o1 = ac.osc;
    alarmRaise('alert', px + 7, pz + 7, 20, 3);
    if (ac.osc - o1 < 1) throw new Error('M23: alert alarm should raise the backstop cue');
    const n0t = ac.osc + ac.noise;
    alarmRaise('attack', px + 9, pz + 9, 20, 3);
    if (ac.osc + ac.noise - n0t < 2) throw new Error('M23: attack alarm should raise the thud backstop');
    const f0 = ac.osc + ac.noise;
    cue('tiger', px + 300, pz + 300);   // >40u away: distance gate must swallow it
    if (ac.osc + ac.noise !== f0) throw new Error('M23: cues beyond 40u should not schedule sources');
    const f1 = ac.osc + ac.noise;
    cue('tiger', px + 10, pz + 10);
    if (ac.osc + ac.noise - f1 < 2) throw new Error('M23: the tiger roar should schedule its signature');
    alarms.length = 0;   // the backstop tests added alarms on purpose

    // 5. footsteps: one per walkPhase half-cycle while moving, none when stopped
    keys['KeyW'] = true; park(spawn.x, spawn.z);
    const h0 = stepHalf, ph0 = walkPhase;
    pump(90); keys['KeyW'] = false;
    if (walkPhase - ph0 < Math.PI * 4) throw new Error('M23: the player should have been walking');
    if (stepHalf <= h0) throw new Error('M23: footsteps should tick while walking');
    const h1 = stepHalf;
    pump(90);
    if (stepHalf !== h1) throw new Error('M23: no footsteps should tick while stopped');

    // 6. survival action cues schedule sources
    const a0 = ac.osc + ac.noise;
    INV.coconut = 1; eatCoconut();
    if (ac.osc + ac.noise - a0 < 3) throw new Error('M23: eating should schedule its cue');
    const a1 = ac.osc + ac.noise;
    actFire();
    if (fires.length < 1) throw new Error('M23: the fire should light at the spawn beach');
    if (ac.osc + ac.noise - a1 < 2) throw new Error('M23: lighting a fire should schedule its cue');
    while (fires.length > 0) { const f = fires.pop(); scene.remove(f.grp); }

    // 7. mute: P flips the master gain to 0 and back
    const g0 = masterGain.gain.value;
    toggleMute();
    if (!sndMuted || masterGain.gain.value !== 0) throw new Error('M23: mute should zero the master gain');
    toggleMute();
    if (sndMuted || masterGain.gain.value !== g0) throw new Error('M23: unmuting should restore the master gain');

    // restore clean state
    INV.coconut = 0; INV.fishCooked = 0;
    setWeatherDebug('clear');
    if (animals.length !== 10) throw new Error('M23: the registry must still hold 10 species: ' + animals.length);
  }

  /* ---- M24: performance pass (instancing, LOD, profiling) ---- */
  {
    // 1. every animal pop entry is a 2-level LOD: detail at 0, shared proxy at LOD_FAR
    const lodCheck = (arr, name) => {
      for (const e of arr) {
        const g = e.grp;
        if (!g || !Array.isArray(g.levels) || g.levels.length !== 2)
          throw new Error('M24: the ' + name + ' grp must be a 2-level LOD');
        if (g.levels[0].distance !== 0)
          throw new Error('M24: the ' + name + ' detail level must sit at distance 0');
        if (g.levels[1].distance !== LOD_FAR)
          throw new Error('M24: the ' + name + ' proxy level must sit at LOD_FAR');
      }
    };
    lodCheck(crabs, 'crab'); lodCheck(tigers, 'tiger'); lodCheck(gulls, 'gull');
    lodCheck(pelicans, 'pelican'); lodCheck(monkeys, 'monkey'); lodCheck(lizards, 'lizard');
    lodCheck(snakes, 'snake'); lodCheck(sharks, 'shark'); lodCheck(spiders, 'spider');

    // 2. detail groups are zeroed LOD-local; the LOD holds the world position (no double offset)
    const c0 = crabs[0];
    if (c0.grp.levels[0].level.position.x !== 0 || c0.grp.levels[0].level.position.y !== 0 ||
        c0.grp.levels[0].level.position.z !== 0)
      throw new Error('M24: the crab detail group must be LOD-local (zeroed)');
    if (Math.abs(c0.grp.position.x - c0.x) > 1e-6 || Math.abs(c0.grp.position.z - c0.z) > 1e-6)
      throw new Error('M24: the crab LOD must hold the world position (no double offset)');
    if (tigers.some((t) => t.grp.levels[0].level.position.x !== 0 ||
        t.grp.levels[0].level.position.z !== 0))
      throw new Error('M24: the tiger detail groups must be LOD-local (zeroed)');

    // 3. rain: 90 individual meshes -> ONE InstancedMesh(90) inside rainGrp, matrices per frame
    if (rainGrp.children.length !== 1)
      throw new Error('M24: rainGrp must hold exactly one instanced mesh: ' + rainGrp.children.length);
    const rm = rainGrp.children[0];
    if (rm.constructor.name !== 'InstancedMesh' || rm.count !== 90)
      throw new Error('M24: the rain must be one InstancedMesh of count 90');
    if (!rm.instanceMatrix) throw new Error('M24: the rain mesh must expose instanceMatrix');
    const rm0 = rm._count || 0;
    setWeatherDebug('rain'); pump(60);
    if (!rainGrp.visible) throw new Error('M24: the rain must be visible while weather.vis.rain > 0.5');
    if ((rm._count || 0) <= rm0) throw new Error('M24: the rain matrices must be rewritten while raining');
    setWeatherDebug('clear'); pump(60);
    if (rainGrp.visible) throw new Error('M24: the rain must hide once the vis value decays');

    // 4. profiler: off by default; active frames count, sections fill, HUD line rides showPerf
    if (showPerf || perf.on) throw new Error('M24: the profiler must be off by default');
    showPerf = true;
    const f0 = perf.frames;
    pump(5);
    if (perf.frames - f0 !== 5) throw new Error('M24: perf.frames must count the active frames');
    for (const k of ['stats', 'animE', 'sky', 'animL', 'plants', 'render'])
      if (!(k in perf.avg)) throw new Error('M24: the profiler must measure the ' + k + ' section');
    if (hudText.indexOf('drawcalls') < 0) throw new Error('M24: the HUD must show the perf line with drawcalls');
    showPerf = false;
    pump(1);
    if (hudText.indexOf('drawcalls') >= 0) throw new Error('M24: the perf line must hide with showPerf');
    if (perf.frames !== f0 + 5) throw new Error('M24: the profiler must stop counting while hidden');

    // 5. house invariants: world-gen populations + registry untouched by the render pass
    if (palms.length < 60 || bigTrees.length < 60 || rocks.length < 100)
      throw new Error('M24: the static vegetation populations changed');
    if (heightAt(0, 0) < 2) throw new Error('M24: the island heightfield changed');
    if (crabs.length !== 15 || tigers.length !== 3 || gulls.length !== 5 ||
        pelicans.length !== 3 || monkeys.length !== 5 || lizards.length !== 4 ||
        snakes.length !== 6 || spiders.length !== 3)
      throw new Error('M24: an animal population count changed');
    if (sharks.length < 1) throw new Error('M24: the shark population changed');
    if (animals.length !== 10) throw new Error('M24: the registry must still hold 10 species: ' + animals.length);
  }

  /* ---- M25: save/load + respawn/recovery ---- */
  {
    const ls = globalThis.localStorage;
    ls.removeItem(SAVE_KEY);

    /* earlier blocks left a camp + fires behind; clear them for a known state */
    if (camp) {
      scene.remove(camp.grp);
      for (const k of ['shelter', 'bed', 'fence', 'torch', 'raft']) if (camp.structures[k]) scene.remove(camp.structures[k]);
      camp = null;
    }
    for (const f of fires) scene.remove(f.grp); fires.length = 0;
    for (const it of items) scene.remove(it.mesh); items.length = 0;

    // 0. fresh boot: no save, title line untouched
    if (hasSave()) throw new Error('M25: no save must exist on a fresh boot');
    if ((document.getElementById('playline').innerHTML || '').includes('CONTINUE'))
      throw new Error('M25: the title line must not offer to continue without a save');

    // 1. camp + structure events write a well-shaped save
    const px = rig.position.x, pz = rig.position.z;
    makeCamp(px, pz);
    actShelter();
    const pre = JSON.parse(ls.getItem(SAVE_KEY));
    if (!pre || pre.v !== 1) throw new Error('M25: a camp build must write a v1 save');
    if (!pre.camp || pre.camp.structures.shelter !== true)
      throw new Error('M25: the save must carry the camp + shelter state');
    if (!Array.isArray(pre.journal) || !Array.isArray(pre.learned) || !Array.isArray(pre.mapKnown))
      throw new Error('M25: the save must carry journal/learned/mapKnown');
    if (!Array.isArray(pre.palms) || pre.palms.length !== palms.length)
      throw new Error('M25: the save must carry one coco count per palm');
    if (!pre.weather || pre.weather.segs.length !== weather.segs.length)
      throw new Error('M25: the save must carry the full weather segment list');

    // 2. the dusk crossing saves exactly once; phase-stable frames do not re-save
    setClockP(0.1);
    gameMin = 1800 * (2 / 3 - 0.1) - 0.2;   /* 0.2 game min before dusk (~20 frames at day rate) */
    saveGame();   /* re-baseline at the rewound clock so the crossing save is provably newer */
    const rawDay = ls.getItem(SAVE_KEY);
    pump(25);   /* crosses the DAY_FRAC boundary (~0.01 game min/frame) and settles into night */
    if (((p0 + gameMin / 1800) % 1) < 2 / 3) throw new Error('M25: the pump must have crossed into night');
    const rawNight = ls.getItem(SAVE_KEY);
    if (rawNight === rawDay) throw new Error('M25: the dusk crossing must write a save');
    const nightSave = JSON.parse(rawNight);
    if (!(nightSave.gameMin > JSON.parse(rawDay).gameMin)) throw new Error('M25: the crossing save must be newer');
    pump(3);   /* night, phase-stable */
    if (ls.getItem(SAVE_KEY) !== rawNight) throw new Error('M25: stable-phase frames must not re-save');

    // 3. round-trip: mutate live state, save, scramble the live state, load, assert restored
    stats.thirst = 42; stats.hunger = 33; stats.health = 57; stats.wet = 12;
    INV.wood = 5; INV.fiber = 3; INV.coconut = 2;
    spear = true;
    rig.position.set(12.5, 3, -7.5); rig.rotation.y = 1.1;
    const pp = plants[0];
    pp.state = 'depleted'; pp.min = 500; pp.chargesLeft = 0; pp.wear = 2;
    palms[0].cocos = 1;
    makeFire(10, heightAt(10, 15), 15);
    fires[0].phase = 4.5; fires[0].cooking = 'fishRaw';
    const im = new THREE.Mesh(itemGeo, itemMat);
    scene.add(im);
    items.push({ x: 2, y: 1, z: 3, vy: -1, state: 'fall', mesh: im, taken: false });
    gullNest.eggs = 2;
    logLine('m25 roundtrip marker', 'survival');
    learned.add('m25test');
    mapKnown.add('m25spot');
    saveGame();
    const goodRaw = ls.getItem(SAVE_KEY);
    stats.thirst = 1; stats.health = 99;
    gameMin += 5000; p0 = 0.5;
    scene.remove(camp.grp);
    for (const k of ['shelter', 'bed', 'fence', 'torch', 'raft']) if (camp.structures[k]) scene.remove(camp.structures[k]);
    camp = null;
    for (const f of fires) scene.remove(f.grp); fires.length = 0;
    for (const it of items) scene.remove(it.mesh); items.length = 0;
    palms[0].cocos = 2;
    gullNest.eggs = 3;
    pp.state = 'ready'; pp.min = 0; pp.chargesLeft = 4; pp.wear = 1;
    journal.length = 0; learned.clear(); mapKnown.clear();
    spear = false; INV.wood = 0;
    rig.position.set(0, 0, 0); rig.rotation.y = 0;
    if (!loadGame()) throw new Error('M25: loadGame must restore the valid save');
    if (Math.abs(stats.thirst - 42) > 1e-9 || Math.abs(stats.hunger - 33) > 1e-9 ||
        Math.abs(stats.health - 57) > 1e-9 || Math.abs(stats.wet - 12) > 1e-9)
      throw new Error('M25: the stats must round-trip');
    if (INV.wood !== 5 || INV.fiber !== 3 || INV.coconut !== 2 || spear !== true)
      throw new Error('M25: the inventory + spear must round-trip');
    if (Math.abs(rig.position.x - 12.5) > 1e-9 || Math.abs(rig.position.z + 7.5) > 1e-9 ||
        Math.abs(rig.rotation.y - 1.1) > 1e-9)
      throw new Error('M25: the player position must round-trip');
    if (pp.state !== 'depleted' || Math.abs(pp.min - 500) > 1e-9 || pp.chargesLeft !== 0 || pp.wear !== 2)
      throw new Error('M25: the non-default plant state must round-trip');
    if (plantClock !== gameMin) throw new Error('M25: plantClock must equal the loaded gameMin (no fast-forward)');
    const before = { s: pp.state, m: pp.min };
    updatePlants(); updatePlants();
    if (pp.state !== before.s || Math.abs(pp.min - before.m) > 1e-9)
      throw new Error('M25: plants must not double-grow right after a load');
    if (palms[0].cocos !== 1) throw new Error('M25: the palm coco count must round-trip');
    if (!camp || !camp.structures.shelter)
      throw new Error('M25: the camp + shelter must be rebuilt on load');
    if (Math.abs(camp.x - px) > 1e-9 || Math.abs(camp.z - pz) > 1e-9)
      throw new Error('M25: the camp position must round-trip');
    if (fires.length !== 1 || Math.abs(fires[0].phase - 4.5) > 1e-9 || fires[0].cooking !== 'fishRaw')
      throw new Error('M25: the fire data must round-trip');
    if (items.length !== 1 || items[0].state !== 'fall' || !items[0].mesh)
      throw new Error('M25: the ground item must be rebuilt with a fresh mesh');
    if (gullNest.eggs !== 2 || gullNest.eggMeshes[1].visible !== true || gullNest.eggMeshes[2].visible !== false)
      throw new Error('M25: the gull nest eggs must round-trip');
    if (!journal.some((e) => e.msg === 'm25 roundtrip marker') || !learned.has('m25test') || !mapKnown.has('m25spot'))
      throw new Error('M25: the journal/learned/map knowledge must survive the round-trip');
    if (JSON.stringify(weather.segs.map((s) => [s.state, s.start, s.end])) !==
        JSON.stringify(JSON.parse(goodRaw).weather.segs.map((s) => [s.s, s.a, s.b])))
      throw new Error('M25: the weather segments must round-trip');
    if (weather.segs.some((s) => s.state === 'storm' && s.evs.some((ev) => ev.done !== false)))
      throw new Error('M25: restored storm events must be re-derived with done=false');

    // 4. weather stream alignment: the next generated seg must match a fresh reference stream
    const nSegs = weather.segs.length;
    const refR = mulberry32(SEED + WEATHER_SEED_OFFSET);
    for (let k = 0; k < 1 + 2 * (nSegs - 1); k++) refR();   /* initial seg = 1 draw, each extended = 2 */
    const lastSeg = weather.segs[nSegs - 1];
    const opts = WEATHER_NEXT[lastSeg.state];
    const rr = refR();
    let acc = 0, refSt = null;
    for (const [st, w] of opts) { acc += w; if (rr < acc) { refSt = st; break; } }
    if (!refSt) refSt = opts[opts.length - 1][0];
    const [mn, mx] = WEATHER_DUR[refSt];
    const refEnd = lastSeg.end + mn + refR() * (mx - mn);
    weatherExtend(lastSeg.end + 10);   /* every seg lasts >= 45 game min, so exactly one extends */
    const nextSeg = weather.segs[weather.segs.length - 1];
    if (nextSeg.state !== refSt || Math.abs(nextSeg.start - lastSeg.end) > 1e-9 ||
        Math.abs(nextSeg.end - refEnd) > 1e-9)
      throw new Error('M25: the weather stream must be resynced on load (a desync would corrupt future weather)');

    // 5. corrupted / malformed / range-bad saves are discarded to a fresh island
    ls.setItem(SAVE_KEY, '{this is not json');
    if (readSave() !== null) throw new Error('M25: malformed JSON must be discarded');
    if (ls.getItem(SAVE_KEY) !== null) throw new Error('M25: a malformed save must be deleted');
    const bad = JSON.parse(goodRaw);
    bad.gameMin = -5;
    ls.setItem(SAVE_KEY, JSON.stringify(bad));
    if (readSave() !== null) throw new Error('M25: a range-bad save (gameMin < 0) must be discarded');
    const bad2 = JSON.parse(goodRaw);
    bad2.stats.thirst = 150;
    ls.setItem(SAVE_KEY, JSON.stringify(bad2));
    if (readSave() !== null) throw new Error('M25: an out-of-range stat must be discarded');
    const bad3 = JSON.parse(goodRaw);
    bad3.palms.pop();
    ls.setItem(SAVE_KEY, JSON.stringify(bad3));
    if (readSave() !== null) throw new Error('M25: a save whose palm list mismatches the world must be discarded');
    ls.setItem(SAVE_KEY, goodRaw);
    if (readSave() === null) throw new Error('M25: a good save must still validate after the corrupt probes');

    // 6. death -> respawn recovery
    stats.health = 0;
    checkDeath();
    if (!dead) throw new Error('M25: zero health must kill the player');
    const rawAtDeath = ls.getItem(SAVE_KEY);
    saveGame();   /* never snapshots a dead state */
    if (ls.getItem(SAVE_KEY) !== rawAtDeath) throw new Error('M25: saveGame must be a no-op while dead');
    respawn();
    if (dead || stats.health !== 100 || stats.thirst !== 100 || stats.hunger !== 100)
      throw new Error('M25: respawn must restore to full vitals');
    if (INV.wood !== 0 || INV.rope !== 0 || INV.coconut !== 0)
      throw new Error('M25: respawn must clear carried loot (fiber stays, per the pre-M25 respawn contract)');
    if (Math.abs(rig.position.x - camp.x) > 1e-9 || Math.abs(rig.position.z - camp.z) > 1e-9)
      throw new Error('M25: respawn must wake the player at the camp');
    saveGame();   /* and the run is savable again after the recovery */
    const postRes = JSON.parse(ls.getItem(SAVE_KEY));
    if (!(postRes.gameMin > 0) || postRes.stats.health !== 100) throw new Error('M25: the post-respawn save must be valid');

    // 7. house invariants: the persistence work left the world intact
    if (palms.length < 60 || bigTrees.length < 60 || rocks.length < 100)
      throw new Error('M25: the static vegetation populations changed');
    if (heightAt(0, 0) < 2) throw new Error('M25: the island heightfield changed');
    if (crabs.length !== 15 || tigers.length !== 3 || gulls.length !== 5 ||
        pelicans.length !== 3 || monkeys.length !== 5 || lizards.length !== 4 ||
        snakes.length !== 6 || spiders.length !== 3)
      throw new Error('M25: an animal population count changed');
    if (sharks.length < 1) throw new Error('M25: the shark population changed');
    if (animals.length !== 10) throw new Error('M25: the registry must still hold 10 species');
  }

  /* ---- M26: single-player v1 end-to-end playthrough ---- */
  {
    const park = (x, z) => rig.position.set(x, Math.max(heightAt(x, z), WATER - 0.25), z);
    const ls = globalThis.localStorage;
    const kd = globalThis.__keydownCb;
    if (typeof kd !== 'function') throw new Error('M26: the window stub must capture the keydown handler');

    // 0. snapshot the whole live state ‒ this block runs the entire story and must
    //    leave everything exactly as the earlier blocks left it
    const segLenIn = weather.segs.length;
    const evDoneIn = weather.segs.map((s) => (s.evs ? s.evs.map((e) => e.done) : null));
    const campIn = camp;
    const campStructIn = camp ? { shelter: camp.structures.shelter, bed: camp.structures.bed,
      fence: camp.structures.fence, torch: camp.structures.torch, raft: camp.structures.raft } : null;
    const firesIn = fires.slice();
    const itemsIn = items.slice();
    const palmsIn = palms.map((p) => p.cocos);
    const plantsIn = plants.map((p) => ({ s: p.state, m: p.min, c: p.chargesLeft, w: p.wear }));
    const nestIn = { eggs: gullNest.eggs, vis: gullNest.eggMeshes.map((m) => m.visible) };
    const scalIn = { p0, gameMin, plantClock, firstNight, started, dead, won, endless,
      endlessStartDay, endlessStartMin, onRaft, spear, drinkCd, strikeCd, poisonDrain,
      infectedWound, lastMeal };
    const invIn = { ...INV }, statsIn = { ...stats };
    const learnedIn = new Set(learned), journalIn = journal.slice();
    const mapKnownIn = [...mapKnown], mapVisitedIn = [...mapVisited];
    const rigIn = [rig.position.x, rig.position.y, rig.position.z, rig.rotation.y];
    const domIn = { deadHtml: deadEl.innerHTML, deadDisp: deadEl.style.display,
      wonHtml: wonEl.innerHTML, wonDisp: wonEl.style.display,
      playline: (document.getElementById('playline').innerHTML || ''),
      ovOp: overlay.style.opacity, ovDisp: overlay.style.display, hint: hintEl.textContent };
    const saveIn = ls.getItem(SAVE_KEY);
    const bootSaveIn = bootSave;
    const restore = () => {
      for (const k in keys) keys[k] = false;
      for (const f of fires) scene.remove(f.grp); fires.length = 0;
      for (const f of firesIn) { fires.push(f); scene.add(f.grp); }
      for (const it of items) scene.remove(it.mesh); items.length = 0;
      for (const it of itemsIn) { items.push(it); scene.add(it.mesh); }
      if (camp) {
        scene.remove(camp.grp);
        for (const k of ['shelter', 'bed', 'fence', 'torch', 'raft']) if (camp.structures[k]) scene.remove(camp.structures[k]);
        camp = null;
      }
      if (campIn) {
        scene.add(campIn.grp);
        for (const k of ['shelter', 'bed', 'fence', 'torch', 'raft']) if (campStructIn[k]) scene.add(campStructIn[k]);
        camp = campIn;
      }
      for (let i = 0; i < palms.length; i++) {
        const p = palms[i];
        p.cocos = palmsIn[i];
        for (let j = 0; j < 2; j++) {
          if (j < p.cocos) {
            if (j === 0) setM(p.idx * 2, cocosMesh, p.top[0] + 0.18, p.top[1] - 0.18, p.top[2] + 0.1, 0, 0, 0, 1, 1, 1);
            else setM(p.idx * 2 + 1, cocosMesh, p.top[0] - 0.15, p.top[1] - 0.18, p.top[2] - 0.14, 0, 0, 0, 1, 1, 1);
          } else setM(p.idx * 2 + j, cocosMesh, 9999, -99, 9999, 0, 0, 0, 0, 0, 0);
        }
      }
      for (let i = 0; i < plants.length; i++) {
        const p = plants[i], q = plantsIn[i];
        if (p.state !== q.s || p.min !== q.m || p.chargesLeft !== q.c || p.wear !== q.w) {
          p.state = q.s; p.min = q.m; p.chargesLeft = q.c; p.wear = q.w;
          emitPlant(p);
        }
      }
      gullNest.eggs = nestIn.eggs;
      for (let i = 0; i < gullNest.eggMeshes.length; i++) gullNest.eggMeshes[i].visible = nestIn.vis[i];
      weather.segs.length = segLenIn;
      for (let i = 0; i < weather.segs.length; i++)
        if (evDoneIn[i]) for (let k = 0; k < weather.segs[i].evs.length; k++) weather.segs[i].evs[k].done = evDoneIn[i][k];
      weatherRng = mulberry32(SEED + WEATHER_SEED_OFFSET);   /* resync the stream to the restored seg list (the M25 loadGame pattern) */
      for (let k = 0; k < 1 + 2 * (segLenIn - 1); k++) weatherRng();
      p0 = scalIn.p0; gameMin = scalIn.gameMin; plantClock = scalIn.plantClock; firstNight = scalIn.firstNight;
      started = scalIn.started; dead = scalIn.dead; won = scalIn.won; endless = scalIn.endless;
      endlessStartDay = scalIn.endlessStartDay; endlessStartMin = scalIn.endlessStartMin;
      onRaft = scalIn.onRaft; spear = scalIn.spear; spearMesh.visible = spear;
      drinkCd = scalIn.drinkCd; strikeCd = scalIn.strikeCd;
      poisonDrain = scalIn.poisonDrain; infectedWound = scalIn.infectedWound; lastMeal = scalIn.lastMeal;
      for (const k in INV) INV[k] = invIn[k];
      stats.thirst = statsIn.thirst; stats.hunger = statsIn.hunger; stats.health = statsIn.health; stats.wet = statsIn.wet;
      learned.clear(); for (const k of learnedIn) learned.add(k);
      journal.length = 0; journal.push(...journalIn);
      mapKnown.clear(); for (const k of mapKnownIn) mapKnown.add(k);
      mapVisited.fill(0); for (let i = 0; i < mapVisitedIn.length; i++) mapVisited[i] = mapVisitedIn[i];
      rig.position.set(rigIn[0], rigIn[1], rigIn[2]); rig.rotation.y = rigIn[3];
      deadEl.innerHTML = domIn.deadHtml; deadEl.style.display = domIn.deadDisp;
      wonEl.innerHTML = domIn.wonHtml; wonEl.style.display = domIn.wonDisp;
      document.getElementById('playline').innerHTML = domIn.playline;
      overlay.style.opacity = domIn.ovOp; overlay.style.display = domIn.ovDisp;
      hintEl.textContent = domIn.hint;
      bootSave = bootSaveIn;
      if (saveIn === null) { if (ls.getItem(SAVE_KEY) !== null) ls.removeItem(SAVE_KEY); }
      else ls.setItem(SAVE_KEY, saveIn);
    };
    const restoreAtEnd = restore;

    // fresh-run reset: the playthrough starts from wash-ashore, nothing carried
    for (const k in keys) keys[k] = false;
    if (camp) {
      scene.remove(camp.grp);
      for (const k of ['shelter', 'bed', 'fence', 'torch', 'raft']) if (camp.structures[k]) scene.remove(camp.structures[k]);
      camp = null;
    }
    for (const f of fires) scene.remove(f.grp); fires.length = 0;
    for (const it of items) scene.remove(it.mesh); items.length = 0;
    for (const k in INV) INV[k] = 0;
    spear = false; spearMesh.visible = false;
    stats.thirst = 80; stats.hunger = 80; stats.health = 100; stats.wet = 0;
    drinkCd = 0; strikeCd = 0; poisonDrain = null; infectedWound = false;
    started = true; dead = false; won = false; endless = false; onRaft = false;
    setClockP(0.33); setWeatherDebug('clear');
    gameMin = 0;   /* the run starts at the story clock (the schedule is a pure function of gameMin) */

    // 1. wash up at the water's edge and drink
    {
      let wx = NaN, wz = NaN;
      for (let r = ISLAND_R * 1.06; r > 5 && isNaN(wx); r -= 1.5)
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2 + 0.37;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (heightAt(x, z) < 0.25) { wx = x; wz = z; break; }
        }
      if (isNaN(wx)) throw new Error('M26: no shallow water point for the drink');
      park(wx, wz);
      stats.thirst = 40;
      actUse();
      if (Math.abs(stats.thirst - 75) > 1e-9) throw new Error('M26: a drink must restore +35 thirst');
      if (!learned.has('water')) throw new Error('M26: the drink must teach the water rule');
      pump(160);   /* the drink cooldown lapses while the run keeps moving */
    }

    // 2. spear + fish, cook the catch over a fire, eat it
    actCraftSpear();
    if (!spear || !spearMesh.visible) throw new Error('M26: B must craft the spear');
    const sc = schools.find((s) => s.n > 0);
    if (!sc) throw new Error('M26: a fish school must remain in the shallows');
    park(sc.x, sc.z);
    const raw0 = INV.fishRaw;
    actStrike();
    if (INV.fishRaw < raw0 + 1) throw new Error('M26: X must spear at least one fish');
    if (!learned.has('fish')) throw new Error('M26: the spear must teach the fish rule');
    let fx = NaN, fz = NaN;
    for (let r = ISLAND_R * 0.9; r > 5 && isNaN(fx); r -= 2)
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2 + 1.1;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = heightAt(x, z);
        if (h < 0.5 || h > 2.5) continue;
        if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;   /* keep the palm shake clean */
        fx = x; fz = z; break;
      }
    if (isNaN(fx)) throw new Error('M26: no dry sand point for the fire');
    park(fx, fz);
    actFire();
    if (fires.length !== 1) throw new Error('M26: G must light a fire on dry sand');
    park(fires[0].x, fires[0].z);
    actUse();
    if (!fires[0].cooking || fires[0].cooking.item !== 'fishRaw')
      throw new Error('M26: E by the fire must start cooking the fish');
    pump(170);   /* the 2.5 s cook finishes */
    if (fires[0].cooking) throw new Error('M26: the cook must have finished');
    if (INV.fishCooked < 1 || INV.fishRaw > raw0) throw new Error('M26: the cook must yield cooked fish');
    const hun0 = stats.hunger;
    eatFish();
    if (stats.hunger !== Math.min(100, hun0 + 30)) throw new Error('M26: eating cooked fish must feed +30');

    // 3. shake a coconut, pick it up, drink it
    const cocoPalm = palms.find((p) => p.cocos > 0);
    if (!cocoPalm) throw new Error('M26: a coconut-bearing palm must exist');
    park(cocoPalm.x, cocoPalm.z);
    const coco0 = cocoPalm.cocos;
    const itemsBefore = items.length;
    actUse();
    if (cocoPalm.cocos !== coco0 - 1) throw new Error('M26: E on the palm must drop a coconut');
    if (items.length !== itemsBefore + 1) throw new Error('M26: the drop must become a ground item');
    pump(120);   /* the coconut lands */
    const it = items.find((i) => !i.taken && i.state === 'ground' &&
      Math.hypot(i.x - cocoPalm.x, i.z - cocoPalm.z) < 2);
    if (!it) throw new Error('M26: the coconut must settle on the ground near the palm');
    park(it.x, it.z);
    actUse();
    if (INV.coconut !== 1 || it.taken !== true) throw new Error('M26: E must pick up the coconut');
    eatCoconut();
    if (INV.coconut !== 0) throw new Error('M26: C must eat the coconut');
    if (!learned.has('coco')) throw new Error('M26: the coconut must teach the coco rule');

    // 4. forage: harvest a ready plant and eat what it drops
    {
      const eatKeys = new Set(VEG_EAT_ORDER.map((e) => e[0]));
      let ph = null;
      for (const p of plants) {
        if (p.state !== 'ready' || !PLANT_TYPES[p.type].drop || !eatKeys.has(PLANT_TYPES[p.type].drop.invKey)) continue;
        if (heightAt(p.x, p.z) < 0.3) continue;
        if (palms.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 4)) continue;
        if (fires.some((f) => !f.cooking && Math.hypot(f.x - p.x, f.z - p.z) < 3)) continue;
        if (items.some((i) => !i.taken && Math.hypot(i.x - p.x, i.z - p.z) < 2)) continue;
        if (crabs.some((c) => c.alive && Math.hypot(c.x - p.x, c.z - p.z) < 2)) continue;
        if (Math.hypot(p.x - gullNest.x, p.z - gullNest.z) < 3) continue;
        ph = p; break;
      }
      if (!ph) {   /* day-1 seed: if none is naturally ripe, ripen one in place */
        ph = plants.find((p) => PLANT_TYPES[p.type].drop && eatKeys.has(PLANT_TYPES[p.type].drop.invKey) &&
          p.chargesLeft > 0 && heightAt(p.x, p.z) >= 0.3 &&
          !palms.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 4)) || null;
        if (!ph) throw new Error('M26: no harvestable plant spot');
        ph.state = 'ready'; ph.min = 0;
      }
      park(ph.x, ph.z);
      const drop = PLANT_TYPES[ph.type].drop;
      const k0 = INV[drop.invKey] || 0;
      actUse();
      if ((INV[drop.invKey] || 0) !== k0 + drop.n) throw new Error('M26: E must harvest the ready plant');
      eatGathered();
      if ((INV[drop.invKey] || 0) !== k0 + drop.n - 1) throw new Error('M26: Q must eat the foraged drop');
    }

    // 5. establish the camp and raise all five structures
    let cx = NaN, cz = NaN;
    for (let r = 8; r < ISLAND_R * 0.8 && isNaN(cx); r += 6)
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (campCheck(x, z).ok) { cx = x; cz = z; break; }
      }
    if (isNaN(cx)) throw new Error('M26: no valid camp spot found');
    park(cx, cz);
    actCamp();
    if (!camp) throw new Error('M26: H must establish the camp');
    if (ls.getItem(SAVE_KEY) === null) throw new Error('M26: establishing the camp must write a save');
    park(camp.x, camp.z);
    actShelter(); actBed(); actFence(); actTorch();
    if (!camp.structures.shelter || !camp.structures.bed || !camp.structures.fence || !camp.structures.torch)
      throw new Error('M26: J/K/L/N must build all four camp structures');
    if (!campIsLit()) throw new Error('M26: the torch must light the camp');

    // 6. sleep at the bed: dawn clock jump, rest heals, the soak clears
    setClockP(0.55);
    park(camp.x, camp.z);
    stats.wet = 40; stats.health = 50; stats.thirst = 100; stats.hunger = 100;
    const pBefore = (p0 + gameMin / 1800) % 1;
    if (pBefore < 0.4 || pBefore >= DAY_FRAC) throw new Error('M26: the sleep test must start in the afternoon');
    actSleep();
    const pAfter = (p0 + gameMin / 1800) % 1;
    if (pAfter < 0.03 || pAfter > 0.08) throw new Error('M26: sleep must wake at dawn (~0.05): ' + pAfter);
    if (stats.wet !== 0) throw new Error('M26: sleep must clear the soak');
    if (Math.abs(stats.health - 80) > 1e-9) throw new Error('M26: rest must heal +30 (50 -> 80)');
    if (!learned.has('sleep')) throw new Error('M26: sleep must teach the sleep rule');
    if (Math.hypot(rig.position.x - camp.x, rig.position.z - camp.z) > 10)
      throw new Error('M26: sleep must wake the player at the bed');

    // 7. storm: the soak teaches the wet rule; the shelter dries you off
    setWeatherDebug('storm');
    let sx = NaN, sz = NaN, sbest = -1;
    const due = [];
    for (const s of weather.segs) for (const ev of s.evs)
      if (ev.kind === 'strike' && !ev.done && ev.t <= gameMin + 12) due.push(ev);
    for (let r = 10; r < ISLAND_R * 0.85; r += 5)
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2 + 0.2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (heightAt(x, z) < 0.5) continue;
        if (Math.hypot(x - camp.x, z - camp.z) < 12) continue;   /* stay clear of the dry shelter */
        let mn = Infinity;
        for (const ev of due) mn = Math.min(mn, Math.hypot(x - ev.x, z - ev.z));
        if (mn > sbest) { sbest = mn; sx = x; sz = z; }
      }
    if (isNaN(sx)) throw new Error('M26: no exposed dry spot for the storm soak');
    park(sx, sz);
    stats.wet = 0;
    pump(300);   /* ~5 s in the open storm */
    if (stats.wet <= 15) throw new Error('M26: the storm must soak an exposed player: ' + stats.wet);
    if (!learned.has('wet')) throw new Error('M26: the soak must teach the wet rule');
    setWeatherDebug('clear');
    const shP = camp.structures.shelter.position;
    park(shP.x, shP.z);
    pump(600);
    if (stats.wet !== 0) throw new Error('M26: the shelter must dry the player off');

    // 8. a spent palm drops straight poles (wood)
    const spent = palms.find((p) => p.cocos === 0 &&
      !items.some((i) => !i.taken && Math.hypot(i.x - p.x, i.z - p.z) < 1.7) &&
      !fires.some((f) => !f.cooking && Math.hypot(f.x - p.x, f.z - p.z) < 2.6));
    if (!spent) throw new Error('M26: a clean spent palm must exist');
    park(spent.x, spent.z);
    const wood0 = INV.wood;
    actUse();
    if (INV.wood !== wood0 + 1) throw new Error('M26: a spent palm must drop +1 wood');
    if (!learned.has('wood')) throw new Error('M26: the spent palm must teach the wood rule');

    // 9. twist the rope (fiber is already foraged)
    INV.fiber = Math.max(INV.fiber, ROPE_FIBER);
    actCraftRope();
    if (INV.rope < 1) throw new Error('M26: U must twist a rope');
    if (!learned.has('rope')) throw new Error('M26: rope must be recorded');

    // 10. build the raft at camp
    INV.wood = Math.max(INV.wood, RAFT_WOOD);
    INV.rope = Math.max(INV.rope, RAFT_ROPE);
    park(camp.x, camp.z);
    const w0 = INV.wood, r0 = INV.rope;
    actBuildRaft();
    if (!camp.structures.raft) throw new Error('M26: O must build the raft at camp');
    if (INV.wood !== w0 - RAFT_WOOD || INV.rope !== r0 - RAFT_ROPE)
      throw new Error('M26: the raft must cost ' + RAFT_WOOD + ' wood + ' + RAFT_ROPE + ' rope');

    // 11. board and row past the reef: the run is won, the save is cleared
    park(camp.structures.raft.position.x, camp.structures.raft.position.z);
    actUse();
    if (onRaft !== true) throw new Error('M26: E must board the raft');
    const raft = camp.structures.raft;
    raft.position.set(0, WATER, WIN_R + 10);
    rig.position.set(0, WATER + 0.7, WIN_R + 10);
    pump(3);
    if (won !== true || started !== false || onRaft !== false)
      throw new Error('M26: rowing past the reef must win and freeze the sim');
    if (ls.getItem(SAVE_KEY) !== null) throw new Error('M26: a finished run must clear the save');
    if (wonEl.style.display !== 'flex' || String(wonEl.innerHTML).indexOf('YOU LEFT THE ISLAND') < 0)
      throw new Error('M26: the win overlay must show the escape');

    // 12. stay on the island: endless starts, the island ramps by the day
    startEndless();
    if (endless !== true || won !== false || started !== true)
      throw new Error('M26: E on the win overlay must start endless');
    if (Math.hypot(rig.position.x - camp.x, rig.position.z - camp.z) > 1e-6)
      throw new Error('M26: endless must restart the run at camp');
    if (!learned.has('endless')) throw new Error('M26: endless must be recorded');
    gameMin = endlessStartMin - p0 * 1800 + 1800;   /* one endless day in */
    if (endlessDay() !== 1) throw new Error('M26: one endless day expected: ' + endlessDay());
    if (Math.abs(tigerBoost() - 0.12) > 1e-9) throw new Error('M26: the tiger ramp must be 0.12 at endless day 1');
    if (Math.abs(timeRate(0.3) - 0.6 * 1.04) > 1e-9) throw new Error('M26: the day rate must scale with the day boost');

    // 13. death in endless: days-survived overlay, camp respawn, loot lost
    INV.coconut = 1;
    stats.health = 0;
    checkDeath();
    if (dead !== true) throw new Error('M26: zero health must kill');
    if (String(deadEl.innerHTML).indexOf('days survived') < 0)
      throw new Error('M26: the endless death overlay must show the days-survived score');
    respawn();
    if (dead !== false || stats.health !== 100 || stats.thirst !== 100 || stats.hunger !== 100)
      throw new Error('M26: respawn must wake at full vitals');
    if (INV.coconut !== 0) throw new Error('M26: respawn must drop the carried loot');
    if (Math.hypot(rig.position.x - camp.x, rig.position.z - camp.z) > 1e-6)
      throw new Error('M26: respawn must wake at camp');

    // 14. story death with a camp: the overlay must match the camp respawn
    endless = false;
    stats.health = 0;
    checkDeath();
    if (dead !== true) throw new Error('M26: zero health must kill again');
    const storyDead = String(deadEl.innerHTML);
    if (storyDead.indexOf('wake at your camp') < 0 || storyDead.indexOf('days survived') >= 0)
      throw new Error('M26: the story death overlay must be camp-aware when a camp exists: ' + storyDead);
    respawn();
    if (dead !== false) throw new Error('M26: respawn must wake again');

    // 15. save/load round-trip of the finished camp + structures
    logLine('m26 end-to-end marker', 'survival');
    stats.thirst = 41; stats.hunger = 44; stats.health = 55; stats.wet = 7;
    INV.wood = 5; INV.rope = 2; INV.fiber = 3; INV.coconut = 1;
    rig.position.set(14.5, 3.5, -9.5); rig.rotation.y = 2.2;
    saveGame();
    const raw15 = ls.getItem(SAVE_KEY);
    if (!raw15) throw new Error('M26: a live run must be savable');
    stats.thirst = 1; stats.health = 99;
    gameMin += 900; p0 = 0.9;
    INV.wood = 99;
    learned.add('m26scratched');
    scene.remove(camp.grp);
    for (const k of ['shelter', 'bed', 'fence', 'torch', 'raft']) if (camp.structures[k]) scene.remove(camp.structures[k]);
    camp = null;
    if (!loadGame()) throw new Error('M26: loadGame must restore the round-trip save');
    const sv15 = JSON.parse(raw15);
    if (stats.thirst !== 41 || stats.hunger !== 44 || stats.health !== 55 || stats.wet !== 7)
      throw new Error('M26: the stats must round-trip');
    if (INV.wood !== 5 || INV.rope !== 2 || INV.fiber !== 3 || INV.coconut !== 1)
      throw new Error('M26: the inventory must round-trip');
    if (Math.abs(rig.position.x - 14.5) > 1e-9 || Math.abs(rig.position.z + 9.5) > 1e-9 || Math.abs(rig.rotation.y - 2.2) > 1e-9)
      throw new Error('M26: the position must round-trip');
    if (Math.abs(gameMin - sv15.gameMin) > 1e-9 || p0 !== sv15.p0)
      throw new Error('M26: the clock must round-trip');
    if (learned.has('m26scratched')) throw new Error('M26: the load must replace the live state');
    if (!journal.some((e) => e.msg === 'm26 end-to-end marker'))
      throw new Error('M26: the journal must round-trip');
    if (!camp || !camp.structures.shelter || !camp.structures.bed || !camp.structures.fence ||
        !camp.structures.torch || !camp.structures.raft)
      throw new Error('M26: the camp + all structures must be rebuilt on load');
    if (weather.segs.length !== sv15.weather.segs.length)
      throw new Error('M26: the weather segments must round-trip');

    // 16. title-card key paths: N clears the save for a fresh island (no fall-through
    //     into the action keys), any other first key continues the run
    bootSave = readSave();
    if (!bootSave) throw new Error('M26: a valid save must exist for the title-card test');
    park(camp.x, camp.z);
    const torchMesh = camp.structures.torch;
    camp.structures.torch = null;   /* makes a spurious actTorch observable */
    started = false;
    kd({ code: 'KeyN', repeat: false });
    keys['KeyN'] = false;
    if (started !== true) throw new Error('M26: the first key must start the game');
    if (ls.getItem(SAVE_KEY) !== null) throw new Error('M26: N on the title card must clear the save (fresh island)');
    if (camp.structures.torch !== null) throw new Error('M26: N must not fall through into actTorch');
    camp.structures.torch = torchMesh;
    stats.health = 61;
    saveGame();
    stats.health = 90;
    started = false;
    kd({ code: 'KeyA', repeat: false });
    keys['KeyA'] = false;
    if (started !== true) throw new Error('M26: the first key must start the game (continue path)');
    if (stats.health !== 61) throw new Error('M26: the first key on the title card must load the save');

    restoreAtEnd();

    // 17. house invariants: the playthrough left the world intact
    if (palms.length < 60 || bigTrees.length < 60 || rocks.length < 100)
      throw new Error('M26: the static vegetation populations changed');
    if (crabs.length !== 15 || tigers.length !== 3 || gulls.length !== 5 ||
        pelicans.length !== 3 || monkeys.length !== 5 || lizards.length !== 4 ||
        snakes.length !== 6 || spiders.length !== 3)
      throw new Error('M26: an animal population count changed');
    if (sharks.length < 1) throw new Error('M26: the shark population changed');
    if (animals.length !== 10) throw new Error('M26: the registry must still hold 10 species');
  }

}

/* ---- M27: multiplayer client (lib/mp.js) protocol ---- */
{
  /* 1. the single-player page must not have touched WebSocket at all
   *    (location.search is '' in the smoke, so the ?mp= hook is inert) */
  if (globalThis.__wsCtor !== 0)
    throw new Error('M27: a WebSocket was constructed without ?mp= (single-player changed)');

  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };
  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    const tickLog = [];
    const rigStub = { position: { x: 1.5, y: 2.25, z: -3.5 }, rotation: { y: 0.75 } };
    const api = mp.attachMultiplayer({
      rig: rigStub, url: '127.0.0.1:3003', seed: 1337, displayName: 'SmokeTester',
      inWater: () => true, onTick: (tickId, rem) => tickLog.push({ tickId, n: rem.size }),
    });

    /* 2. connect: bare host:port gets wss://, the 30 Hz send loop starts */
    if (wsInstances.length !== 1 || wsInstances[0].url !== 'wss://127.0.0.1:3003')
      throw new Error('M27: ws did not connect to wss://host:port');
    if (intervals.length !== 1 || intervals[0].ms !== (1000 / 30))
      throw new Error('M27: the 30 Hz state send loop is missing');

    /* 3. join: type 3 "<uuid>|2|1337" (mp.js assigns ws.onopen — invoke it as OPEN) */
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    let j = wsInstances[0].sent.at(-1);
    j = j instanceof Uint8Array ? j : new Uint8Array(j);
    if (j[0] !== 3) throw new Error('M27: join is not type 3');
    const joinText = new TextDecoder().decode(j.subarray(1));
    const jParts = joinText.split('|');
    if (jParts.length !== 3 || jParts[1] !== '2' || jParts[2] !== '1337')
      throw new Error('M27: join payload is not "<id>|2|1337": ' + joinText);

    /* 4. join success: publicId is BIG-endian, the name is sent right after */
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 7, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 7) throw new Error('M27: big-endian publicId not parsed (got ' + api.publicId + ')');
    if (!/SmokeTester/.test(api.status()) || !/id 7/.test(api.status()))
      throw new Error('M27: status line wrong: ' + api.status());
    let nm = wsInstances[0].sent.at(-1);
    nm = nm instanceof Uint8Array ? nm : new Uint8Array(nm);
    if (nm[0] !== 31 || new TextDecoder().decode(nm.subarray(1)) !== 'SmokeTester')
      throw new Error('M27: name frame is not [31][utf8]');

    /* 5. 30 Hz state frame: [26][u32 id LE][f32 x,y,z,yaw LE][u8 state bit0] */
    intervals[0].fn();
    let st = wsInstances[0].sent.at(-1);
    st = st instanceof Uint8Array ? st : new Uint8Array(st);
    if (st[0] !== 26 || st.byteLength !== 22) throw new Error('M27: state frame is not [26][21B]');
    const sDv = new DataView(st.buffer, st.byteOffset, st.byteLength);
    if (sDv.getUint32(1, true) !== 7 || Math.abs(sDv.getFloat32(5, true) - 1.5) > 1e-6
        || Math.abs(sDv.getFloat32(9, true) - 2.25) > 1e-6 || Math.abs(sDv.getFloat32(13, true) + 3.5) > 1e-6
        || Math.abs(sDv.getFloat32(17, true) - 0.75) > 1e-6 || st[21] !== 1)
      throw new Error('M27: state payload fields wrong');

    /* 6. tick parse: players + names, with the reserved edits/animals sections
   *    present and correctly skipped (flags 0x0D = players|edits|names) */
    const buildTick = (flags, tickId, players, editCount, animalCount, names) => {
      const parts = [new Uint8Array([27, flags])];
      let buf;
      const w32 = (v) => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v, true); return new Uint8Array(b.buffer); };
      if (flags & 1) {
        parts.push(w32(tickId), w32(players.length));
        for (const p of players) {
          const b = new DataView(new ArrayBuffer(21));
          b.setUint32(0, p.id, true);
          b.setFloat32(4, p.x, true); b.setFloat32(8, p.y, true);
          b.setFloat32(12, p.z, true); b.setFloat32(16, p.yaw, true);
          b.setUint8(20, p.state);
          parts.push(new Uint8Array(b.buffer));
        }
      }
      if (flags & 2) parts.push(w32(editCount), new Uint8Array(editCount * 23));   // M29: 23B edits, skipped here
      if (flags & 4) parts.push(w32(animalCount), new Uint8Array(animalCount * 24));   // reserved M30 payload
      if (flags & 8) {
        parts.push(w32(names.length));
        for (const n of names) {
          parts.push(w32(n.id), w32(n.name.length), new TextEncoder().encode(n.name));
        }
      }
      const total = parts.reduce((a, p) => a + p.length, 0);
      buf = new Uint8Array(total);
      let off = 0;
      for (const p of parts) { buf.set(p, off); off += p.length; }
      return buf;
    };
    const t1 = buildTick(0x0D, 42,
      [{ id: 7, x: 1.5, y: 2.25, z: -3.5, yaw: 0.75, state: 1 },
       { id: 9, x: 5.5, y: 0, z: -5.5, yaw: 1, state: 0 }],
      2, 0, [{ id: 9, name: 'Bob' }]);
    wsInstances[0].onmessage({ data: t1.buffer.slice(0) });
    if (tickLog.length !== 1 || tickLog[0].tickId !== 42)
      throw new Error('M27: onTick did not fire with tickId');
    if (api.remotes.size !== 1 || api.remotes.has(7))
      throw new Error('M27: remotes must hold only the remote (self excluded)');
    const r = api.remotes.get(9);
    if (!r || Math.abs(r.x - 5.5) > 1e-6 || r.yaw !== 1 || r.underwater !== false || r.name !== 'Bob')
      throw new Error('M27: remote parsed wrong: ' + JSON.stringify(r));

    /* 7. animals section present too (flags 0x0F) and still parsed right */
    const t2 = buildTick(0x0F, 43,
      [{ id: 9, x: 6, y: 0, z: -5, yaw: 1.1, state: 1 }],
      0, 3, []);
    wsInstances[0].onmessage({ data: t2.buffer.slice(0) });
    if (tickLog.length !== 2 || tickLog[1].tickId !== 43)
      throw new Error('M27: the animals-skip tick was not consumed');
    const r2 = api.remotes.get(9);
    if (!r2 || Math.abs(r2.x - 6) > 1e-6 || r2.underwater !== true || r2.name !== 'Bob')
      throw new Error('M27: updated remote parsed wrong: ' + JSON.stringify(r2));

    /* 8. a remote that leaves the session is dropped from the map */
    const t3 = buildTick(0x01, 44, [{ id: 7, x: 1.5, y: 2.25, z: -3.5, yaw: 0.75, state: 0 }], 0, 0, []);
    wsInstances[0].onmessage({ data: t3.buffer.slice(0) });
    if (api.remotes.size !== 0) throw new Error('M27: a departed remote was not dropped');

    /* 9. drop + reconnect: the backoff timer re-arms a fresh socket */
    if (timeouts.length !== 0) throw new Error('M27: an unexpected timer before close');
    wsInstances[0].onclose();
    if (timeouts.length !== 1 || timeouts[0].ms !== 1000)
      throw new Error('M27: no 1 s reconnect backoff on close');
    timeouts[0].fn();
    if (wsInstances.length !== 2)
      throw new Error('M27: the reconnect did not open a fresh socket');
    wsInstances[1].readyState = 1;
    wsInstances[1].onopen();
    let j2 = wsInstances[1].sent.at(-1);
    j2 = j2 instanceof Uint8Array ? j2 : new Uint8Array(j2);
    if (j2[0] !== 3)
      throw new Error('M27: the reconnected socket did not rejoin with type 3');

    api.close();
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
  }
}

/* ---- M28: multiplayer presence renderer (avatars from mpApi.remotes) ---- */
{
  /* 1. the whole single-player pass above must have stayed inert */
  if (mpApi !== null || mpAvatars.size !== 0)
    throw new Error('M28: presence state leaked into single-player mode');
  mpRemotesFrame(1 / 60);   /* no mpApi -> guard returns, nothing happens */
  if (mpAvatars.size !== 0) throw new Error('M28: the guard is not inert without mpApi');

  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };
  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    const api = mp.attachMultiplayer({
      rig: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } },
      url: '127.0.0.1:3003', seed: 1337, displayName: 'M28Tester', inWater: () => false,
    });
    if (typeof api.connected !== 'function' || api.connected() !== false)
      throw new Error('M28: connected() must be false before the join succeeds');
    mpApi = api;   /* the page's ?mp= block does exactly this */

    /* 2. connect + join success (publicId 50 big-endian, the M27 pattern) */
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 50, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 50) throw new Error('M28: join success not parsed');
    if (api.connected() !== true) throw new Error('M28: connected() must be true after join');

    /* 3. first sight of a remote snaps (never lerps from the origin) */
    const buildTick = (flags, tickId, players, editCount, animalCount, names) => {
      const parts = [new Uint8Array([27, flags])];
      const w32 = (v) => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v, true); return new Uint8Array(b.buffer); };
      if (flags & 1) {
        parts.push(w32(tickId), w32(players.length));
        for (const p of players) {
          const b = new DataView(new ArrayBuffer(21));
          b.setUint32(0, p.id, true);
          b.setFloat32(4, p.x, true); b.setFloat32(8, p.y, true);
          b.setFloat32(12, p.z, true); b.setFloat32(16, p.yaw, true);
          b.setUint8(20, p.state);
          parts.push(new Uint8Array(b.buffer));
        }
      }
      if (flags & 2) parts.push(w32(editCount), new Uint8Array(editCount * 23));
      if (flags & 4) parts.push(w32(animalCount), new Uint8Array(animalCount * 24));
      if (flags & 8) {
        parts.push(w32(names.length));
        for (const n of names) parts.push(w32(n.id), w32(n.name.length), new TextEncoder().encode(n.name));
      }
      const total = parts.reduce((a, p) => a + p.length, 0);
      const buf = new Uint8Array(total);
      let off = 0;
      for (const p of parts) { buf.set(p, off); off += p.length; }
      return buf;
    };
    const t1 = buildTick(0x01, 1,
      [{ id: 50, x: 0, y: 0, z: 0, yaw: 0, state: 0 },
       { id: 60, x: 5, y: 1.2, z: -6, yaw: 1.3, state: 0 }], 0, 0, []);
    wsInstances[0].onmessage({ data: t1.buffer.slice(0) });
    mpRemotesFrame(1 / 60);
    if (mpAvatars.size !== 1 || !mpAvatars.has(60))
      throw new Error('M28: first sight must create exactly one avatar (self excluded)');
    const av = mpAvatars.get(60);
    if (Math.abs(av.x - 5) > 1e-6 || Math.abs(av.y - 1.2) > 1e-6 || Math.abs(av.z + 6) > 1e-6)
      throw new Error('M28: first sight must snap to the tick transform, not lerp from origin');
    if (Math.abs(av.grp.position.x - 5) > 1e-6 || Math.abs(av.grp.position.z + 6) > 1e-6)
      throw new Error('M28: the avatar group was not placed at the snap position');
    if (Math.abs(av.yaw - 1.3) > 1e-6 || Math.abs(av.grp.rotation.y - 1.3) > 1e-6)
      throw new Error('M28: first-sight yaw not snapped');
    if (av.grp.visible !== true || !scene.children.includes(av.grp))
      throw new Error('M28: avatar not visible/in the scene while connected');
    if (av.sprite.visible !== false) throw new Error('M28: name tag must stay hidden until a name arrives');

    /* 4. lerp toward new tick values (x converges, yaw takes the short arc),
     *    and the name arrives in the names section after the players section */
    const t2 = buildTick(0x0D, 2, [{ id: 60, x: 6, y: 1.2, z: -6, yaw: 4.6, state: 0 }], 0, 0, [{ id: 60, name: 'Bob' }]);
    wsInstances[0].onmessage({ data: t2.buffer.slice(0) });
    for (let i = 0; i < 60; i++) mpRemotesFrame(1 / 60);
    if (av.x >= 6 || av.x <= 5) throw new Error('M28: x should converge toward 6, got ' + av.x);
    /* 4.6 - 1.3 = 3.3 rad > pi -> the shortest arc goes DOWN from 1.3 */
    if (av.yaw >= 1.3) throw new Error('M28: yaw must lerp the shortest arc (down from 1.3), got ' + av.yaw);
    if (av.name !== 'Bob') throw new Error('M28: the relayed name was not stored on the tag');
    if (av.sprite.visible !== true) throw new Error('M28: name tag not shown once the name arrives');
    if (av.tex.needsUpdate !== true) throw new Error('M28: name tag texture not flagged for update');

    /* 5. a >30 u jump (rejoin) snaps instead of lerping across the island */
    const t3 = buildTick(0x01, 3, [{ id: 60, x: 60, y: 0, z: -60, yaw: 0, state: 0 }], 0, 0, []);
    wsInstances[0].onmessage({ data: t3.buffer.slice(0) });
    mpRemotesFrame(1 / 60);
    if (Math.abs(av.x - 60) > 1e-6 || Math.abs(av.z + 60) > 1e-6)
      throw new Error('M28: a >30 u jump must snap (rejoin), not lerp');

    /* 6. a remote that leaves the session (absent from a tick) is removed */
    const t4 = buildTick(0x01, 4, [{ id: 50, x: 0, y: 0, z: 0, yaw: 0, state: 0 }], 0, 0, []);
    wsInstances[0].onmessage({ data: t4.buffer.slice(0) });
    mpRemotesFrame(1 / 60);
    if (mpAvatars.size !== 0) throw new Error('M28: a departed remote was not removed');
    if (scene.children.includes(av.grp)) throw new Error('M28: the departed avatar was left in the scene');

    /* 7. a disconnect hides avatars and connected() goes false */
    const t5 = buildTick(0x01, 5, [{ id: 60, x: 60, y: 0, z: -60, yaw: 0, state: 0 }], 0, 0, []);
    wsInstances[0].onmessage({ data: t5.buffer.slice(0) });
    mpRemotesFrame(1 / 60);
    wsInstances[0].onclose();   /* rejoin backoff timer armed via the fake setTimeout */
    if (api.connected() !== false) throw new Error('M28: connected() must be false after close');
    mpRemotesFrame(1 / 60);
    if (mpAvatars.size !== 1 || mpAvatars.get(60).grp.visible !== false)
      throw new Error('M28: avatars must be hidden while disconnected');

    api.close();
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;   /* restore single-player state for everything after */
    for (const av of mpAvatars.values()) scene.remove(av.grp);
    mpAvatars.clear();
  }
}

/* ---- M29: shared deterministic world state (edits + authority clock) ---- */
{
  /* 1. single-player invariants: without mpApi nothing fires */
  if (mpApi !== null) throw new Error('M29: mpApi leaked in from the M28 block');
  mpEmit(0, 0, mpPayloadU8(1));   /* must be a silent no-op (no ws attached) */
  mpApplyWorldEdit(99, 0, new Uint8Array(12));   /* unknown kind: ignored */

  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };
  /* the game's lastT is whatever the earlier blocks left it at, so start
     WELL past that or frame() would compute a negative dt on the first call */
  let __tt9 = 1e8;
  const pump = (n) => { for (let i = 0; i < n; i++) { const cb = globalThis.__rafCb; globalThis.__rafCb = null; __tt9 += 16.7; globalThis.__audioTime += 0.0167; if (cb) cb(__tt9); } };

  /* snapshot everything the block can touch */
  const savePalms = palms.map((q) => q.cocos);
  const savePlants = plants.map((q) => ({ chargesLeft: q.chargesLeft, state: q.state, min: q.min, wear: q.wear }));
  const saveCamp = camp;
  if (saveCamp && saveCamp.grp) scene.remove(saveCamp.grp);   /* M26's story camp may still stand */
  camp = null;
  const saveGameMin = gameMin;
  const saveStarted = started, saveDead = dead, saveWon = won, saveOnRaft = onRaft;
  const saveItems = items.length, saveTorches = torchLights.length;
  const saveStats = { health: stats.health, hunger: stats.hunger, thirst: stats.thirst, wet: stats.wet };
  const saveCooking = fires.map((f) => f.cooking);
  for (const f of fires) if (typeof f.cooking === 'string') f.cooking = null;   /* M25 save-test state */
  const palmIdx = palms.findIndex((q) => q.cocos === 2);
  if (palmIdx < 0) throw new Error('M29: no palm with 2 coconuts to harvest');
  const p0 = palms[palmIdx];

  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    /* the page's ?mp= block wires these hooks; mirror them exactly */
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M29Tester', inWater: () => false,
      onEdit: (pid, eidx, kind, action, payload) => {
        if (pid === api.publicId) return;
        mpApplyWorldEdit(kind, eidx, payload);
      },
      onEditSync: (pid, eidx, kind, action, payload) => {
        if (pid === api.publicId) return;
        mpApplyWorldEdit(kind, eidx, payload);
      },
      onTime: (gm) => {
        if (!Number.isFinite(gm)) return;
        mpTimeAdopt = gm;
      },
    });
    mpApi = api;

    /* 2. connect + join success (publicId 100 big-endian, the M27 pattern) */
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 100, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 100 || api.connected() !== true)
      throw new Error('M29: the join success was not parsed');

    /* 3. M40: the 30 Hz loop uploads state ONLY: [26][21B] (the type-32
       clock upload is retired - the server owns the clock) */
    gameMin = 42.5;
    intervals[0].fn();
    let st = wsInstances[0].sent.at(-1);
    st = st instanceof Uint8Array ? st : new Uint8Array(st);
    if (st[0] !== 26 || st.byteLength !== 22)
      throw new Error('M29: the state frame is missing from the send loop');
    if (wsInstances[0].sent.filter((d) => (d instanceof Uint8Array ? d : new Uint8Array(d))[0] === 32).length > 0)
      throw new Error('M29: the type-32 clock upload must be retired (M40)');

    /* wire helpers: one 23B VivsWorldEdit, and a tick with real edit payloads
       + an optional bit4 time section (players/edits/animals/names/time order) */
    const buildEdit = (pid, eidx, kind, payload) => {
      const b = new Uint8Array(23);
      const dv = new DataView(b.buffer);
      dv.setUint32(0, pid, true);
      dv.setUint32(4, eidx, true);
      b[8] = kind; b[9] = 0;
      if (payload) b.set(payload.subarray(0, 12), 10);
      return b;
    };
    const w32 = (v) => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v, true); return new Uint8Array(b.buffer); };
    const buildTick = (flags, tickId, players, edits, names, time) => {
      const parts = [new Uint8Array([27, flags])];
      if (flags & 1) {
        parts.push(w32(tickId), w32(players.length));
        for (const p of players) {
          const b = new DataView(new ArrayBuffer(21));
          b.setUint32(0, p.id, true);
          b.setFloat32(4, p.x, true); b.setFloat32(8, p.y, true);
          b.setFloat32(12, p.z, true); b.setFloat32(16, p.yaw, true);
          b.setUint8(20, p.state);
          parts.push(new Uint8Array(b.buffer));
        }
      }
      if (flags & 2) {
        parts.push(w32(edits.length));
        for (const e of edits) parts.push(e);
      }
      if (flags & 8) {
        parts.push(w32(names.length));
        for (const n of names) parts.push(w32(n.id), w32(n.name.length), new TextEncoder().encode(n.name));
      }
      if ((flags & 16) && time !== null) {
        const b = new DataView(new ArrayBuffer(4));
        b.setFloat32(0, time, true);
        parts.push(new Uint8Array(b.buffer));
      }
      const total = parts.reduce((a, q) => a + q.length, 0);
      const buf = new Uint8Array(total);
      let off = 0;
      for (const q of parts) { buf.set(q, off); off += q.length; }
      return buf;
    };
    const sendTick = (flags, tickId, players, edits, names, time) =>
      wsInstances[0].onmessage({ data: buildTick(flags, tickId, players, edits, names, time).buffer.slice(0) });

    /* 4. connected: mpEmit emits [28][23B] frames (M40: any tab may edit;
       the server validates) */
    sendTick(0x01, 1, [{ id: 100, x: 0, y: 0, z: 0, yaw: 0, state: 0 }], [], [], null);
    const sentN = wsInstances[0].sent.length;
    mpEmit(0, p0.idx, mpPayloadU8(1));
    if (wsInstances[0].sent.length !== sentN + 1) throw new Error('M29: authority mpEmit did not send');
    let ed = wsInstances[0].sent.at(-1);
    ed = ed instanceof Uint8Array ? ed : new Uint8Array(ed);
    const edDv = new DataView(ed.buffer, ed.byteOffset, ed.byteLength);
    if (ed[0] !== 28 || ed.byteLength !== 24)
      throw new Error('M29: the edit frame is not [28][23B] (len ' + ed.byteLength + ')');
    if (edDv.getUint32(1, true) !== 100 || edDv.getUint32(5, true) !== p0.idx
        || ed[9] !== 0 || ed[10] !== 0 || ed[11] !== 1 || ed[12] !== 0)
      throw new Error('M29: the edit frame fields are wrong');

    /* 5. M40: with another player in the tick there is no local lock -
       mpEmit still uploads (the server is the validator) */
    sendTick(0x01, 2, [{ id: 101, x: 3, y: 0, z: -3, yaw: 1, state: 0 }], [], [], null);
    const sentN2 = wsInstances[0].sent.length;
    mpEmit(3, 0, null);
    if (wsInstances[0].sent.length !== sentN2 + 1)
      throw new Error('M29: a connected tab must still upload world edits');

    /* 6. relayed edits apply deterministically (tick bit1 section) */
    const itemsBefore = items.length;
    const pl = plants.find((q) => q.state === 'ready' && q.chargesLeft > 1);
    if (!pl) throw new Error('M29: no ready plant with charges left to harvest');
    const plTarget = pl.chargesLeft - 1;           /* mirror one harvest */
    sendTick(0x03, 3, [], [
      buildEdit(101, p0.idx, 0, mpPayloadU8(1)),   /* palm: 2 -> 1 coco */
      buildEdit(101, plants.indexOf(pl), 1, mpPayloadU8(plTarget)),
    ], [], null);
    if (p0.cocos !== 1) throw new Error('M29: the relayed palm edit was not applied');
    const crown = cocosMesh.instanceMatrix.mats[p0.idx * 2 + 1];
    if (!crown || crown.x !== 9999)
      throw new Error('M29: the dropped coconut crown was not hidden on replay');
    if (items.length !== itemsBefore)
      throw new Error('M29: the replay must NOT spawn falling coconuts');
    if (pl.chargesLeft !== plTarget || pl.min !== 0
        || pl.state !== (plTarget > 0 ? 'ready' : 'depleted'))
      throw new Error('M29: the relayed plant harvest was not mirrored');

    /* camp + all five structures arrive in one bit1 walk */
    sendTick(0x03, 4, [], [
      buildEdit(101, 0, 2, mpPayloadCamp(7.5, -4.25, 2.4)),
      buildEdit(101, 0, 3, null),
      buildEdit(101, 0, 4, null),
      buildEdit(101, 0, 5, null),
      buildEdit(101, 0, 6, null),
      buildEdit(101, 0, 7, null),
    ], [], null);
    if (!camp) throw new Error('M29: the relayed camp was not built');
    if (Math.abs(camp.x - 7.5) > 1e-6 || Math.abs(camp.z + 4.25) > 1e-6 || Math.abs(camp.rot - 2.4) > 1e-5)
      throw new Error('M29: the camp edit did not carry x/z/rot');
    const so = campOffsets('shelter'), ra = campOffsets('raft');
    if (!camp.structures.shelter || !camp.structures.bed || !camp.structures.fence
        || !camp.structures.torch || !camp.structures.raft)
      throw new Error('M29: a relayed structure was not built');
    if (Math.abs(camp.structures.shelter.position.x - so.x) > 1e-6
        || Math.abs(camp.structures.shelter.position.z - so.z) > 1e-6)
      throw new Error('M29: the shelter is not at campOffsets(shelter)');
    if (Math.abs(camp.structures.raft.position.x - ra.x) > 1e-6
        || Math.abs(camp.structures.raft.position.z - ra.z) > 1e-6)
      throw new Error('M29: the raft is not at campOffsets(raft)');
    if (torchLights.length !== saveTorches + 1)
      throw new Error('M29: the relayed torch did not register a light');

    /* an edit carrying SELF's publicId in a tick is skipped (already local) */
    const pl2 = plants.find((q) => q !== pl);
    const pl3 = plants.find((q) => q !== pl && q.state === 'ready' && q.chargesLeft > 1);
    if (!pl3) throw new Error('M29: no second ready plant for the self-skip test');
    const pl3Target = pl3.chargesLeft - 1;
    sendTick(0x03, 5, [], [
      buildEdit(100, plants.indexOf(pl2), 1, mpPayloadU8(0)),
      buildEdit(101, plants.indexOf(pl3), 1, mpPayloadU8(pl3Target)),
    ], [], null);
    if (pl2.chargesLeft !== savePlants[plants.indexOf(pl2)].chargesLeft
        || pl2.state !== savePlants[plants.indexOf(pl2)].state)
      throw new Error('M29: an edit relayed with the SELF publicId was applied');
    if (pl3.chargesLeft !== pl3Target || pl3.min !== 0
        || pl3.state !== (pl3Target > 0 ? 'ready' : 'depleted'))
      throw new Error('M29: the remote plant edit in the same tick was not applied');

    /* 7. EDIT_SYNC catch-up: the full history replays through the same path
       and stays idempotent when sent twice */
    const syncBuf = new Uint8Array(1 + 4 + 2 * 23);
    syncBuf[0] = 30;
    new DataView(syncBuf.buffer).setUint32(1, 2, true);
    syncBuf.set(buildEdit(101, p0.idx, 0, mpPayloadU8(0)), 5);
    syncBuf.set(buildEdit(101, 0, 2, mpPayloadCamp(7.5, -4.25, 2.4)), 5 + 23);
    wsInstances[0].onmessage({ data: syncBuf.buffer.slice(0) });
    if (p0.cocos !== 0) throw new Error('M29: the EDIT_SYNC palm edit (cocos 0) was not applied');
    const crown0 = cocosMesh.instanceMatrix.mats[p0.idx * 2];
    if (!crown0 || crown0.x !== 9999)
      throw new Error('M29: the last coconut crown was not hidden on replay');
    if (!camp || Math.abs(camp.x - 7.5) > 1e-6)
      throw new Error('M29: the EDIT_SYNC re-camp moved the camp');
    if (items.length !== itemsBefore) throw new Error('M29: the replay spawned items');
    wsInstances[0].onmessage({ data: syncBuf.buffer.slice(0) });
    if (p0.cocos !== 0 || items.length !== itemsBefore)
      throw new Error('M29: the EDIT_SYNC replay is not idempotent');

    /* 8. bit4: the server clock is adopted by EVERY tab (M40) - frame()
       snaps the clock to the stashed value, then local advance resumes */
    sendTick(0x11, 6, [], [], [], 999.25);
    if (Math.abs(mpTimeAdopt - 999.25) > 1e-4)
      throw new Error('M29: the clock was not stashed from bit4');
    sendTick(0x11, 7, [], [], [], 512.3);
    if (Math.abs(mpTimeAdopt - 512.3) > 1e-4)
      throw new Error('M29: the latest bit4 clock must win');
    started = true; dead = false; won = false; onRaft = false;
    /* earlier blocks may have left out-of-range stats; the HUD draws before
       frame() clamps them, so clamp them the way the sim would */
    for (const k of ['thirst', 'hunger', 'health', 'wet'])
      stats[k] = Math.min(100, Math.max(0, stats[k]));
    pump(1);
    if (Math.abs(gameMin - 512.3) > 1e-4)
      throw new Error('M29: frame() did not snap gameMin to the adopted clock: ' + gameMin);
    if (mpTimeAdopt !== 0) throw new Error('M29: the pending clock was not consumed');
    pump(1);
    if (gameMin <= 512.3 || gameMin - 512.3 > 0.05)
      throw new Error('M29: the local clock did not resume after the snap: ' + gameMin);

    /* 9. back to single-player: the clock keeps advancing on its own */
    api.close();
    mpApi = null;
    const g0 = gameMin;
    pump(1);
    if (!(gameMin > g0))
      throw new Error('M29: after the MP session the single-player clock stopped');
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
    for (const av of mpAvatars.values()) scene.remove(av.grp);
    mpAvatars.clear();
    /* restore the world state the block touched (crown instances re-applied) */
    palms.forEach((q, i) => {
      q.cocos = savePalms[i];
      for (let j = 0; j < 2; j++) {
        if (j < q.cocos)
          setM(q.idx * 2 + j, cocosMesh,
            j === 0 ? q.top[0] + 0.18 : q.top[0] - 0.15,
            q.top[1] - 0.18,
            j === 0 ? q.top[2] + 0.1 : q.top[2] - 0.14, 0, 0, 0, 1, 1, 1);
        else
          setM(q.idx * 2 + j, cocosMesh, 9999, -99, 9999, 0, 0, 0, 0, 0, 0);
      }
    });
    plants.forEach((q, i) => {
      q.chargesLeft = savePlants[i].chargesLeft;
      q.state = savePlants[i].state;
      q.min = savePlants[i].min;
      q.wear = savePlants[i].wear;
      emitPlant(q);
    });
    if (camp !== saveCamp && camp && camp.grp) scene.remove(camp.grp);
    camp = saveCamp;
    if (saveCamp && saveCamp.grp) scene.add(saveCamp.grp);
    torchLights.length = saveTorches;
    for (let i = saveItems; i < items.length; i++) if (items[i].mesh) scene.remove(items[i].mesh);
    items.length = saveItems;
    gameMin = saveGameMin;
    mpTimeAdopt = 0;
    fires.forEach((f, i) => { f.cooking = saveCooking[i]; });
    started = saveStarted; dead = saveDead; won = saveWon; onRaft = saveOnRaft;
    stats.health = saveStats.health; stats.hunger = saveStats.hunger;
    stats.thirst = saveStats.thirst; stats.wet = saveStats.wet;
  }
}

/* ---- M30: multiplayer animals + gameplay event relay ---- */
{
  /* 1. single-player invariants: without mpApi the apply layer is inert and
   *    the roster is the full deterministic population (slot = type*64+i) */
  if (mpApi !== null) throw new Error('M30: mpApi leaked in from the M29 block');
  mpAnimalsFrame(0.016);   /* must be a silent no-op (no mpApi) */
  const roster = mpAnimalRoster();
  const expectTotal = schools.length + crabs.length + tigers.length + gulls.length
    + monkeys.length + lizards.length + snakes.length + pelicans.length
    + sharks.length + spiders.length;
  if (roster.length !== expectTotal)
    throw new Error('M30: the roster has ' + roster.length + ' entries, expected ' + expectTotal);
  const byType = (t) => roster.filter((r) => r.type === t);
  if (byType(0).some((r, i) => r.slot !== i || r.isSchool !== true))
    throw new Error('M30: fish school slots are not 0..n');
  if (byType(1).length !== crabs.length || byType(1)[0].slot !== 64)
    throw new Error('M30: crab slots are not 64+');
  if (byType(2)[0].slot !== 128)
    throw new Error('M30: the first tiger slot is not 128');
  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };
  let __tt10 = 2e8;
  const pump = (n) => { for (let i = 0; i < n; i++) { const cb = globalThis.__rafCb; globalThis.__rafCb = null; __tt10 += 16.7; globalThis.__audioTime += 0.0167; if (cb) cb(__tt10); } };

  /* snapshot every animal the block can touch */
  const saveAnimals = [];
  for (const sp of animals)
    for (const e of sp.pop) {
      const rec = { x: e.x, z: e.z, dir: e.dir, n: e.n, alive: e.alive };
      if (e.mesh) rec.meshCount = e.mesh.count;
      if (e.grp) { rec.gx = e.grp.position.x; rec.gz = e.grp.position.z;
        rec.ry = e.grp.rotation.y; rec.vis = e.grp.visible; }
      saveAnimals.push(rec);
    }
  const saveGameMin = gameMin, saveStarted = started, saveDead = dead;
  const saveWon = won, saveOnRaft = onRaft;
  const saveCooking = fires.map((f) => f.cooking);
  for (const f of fires) if (typeof f.cooking === 'string') f.cooking = null;   /* M25 save-test state (M29 pattern) */

  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    /* the page's ?mp= block wires these hooks; mirror them exactly */
    let animalTickEntries = 0;
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M30Tester', inWater: () => false,
      onAnimals: (m) => { animalTickEntries += m.size; },
    });
    mpApi = api;

    /* 2. connect + join success (publicId 110 big-endian, the M27 pattern) */
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 110, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 110 || api.connected() !== true)
      throw new Error('M30: the join success was not parsed');

    /* 3. M40: before any tick the 30 Hz loop sends exactly ONE frame -
       the type-26 state */
    {
      /* M40: the 30 Hz loop sends EXACTLY ONE frame - the type-26 state.
         The type-29 animal upload and type-32 clock upload are retired
         (server-sim animals + server clock) */
      const sentN = wsInstances[0].sent.length;
      intervals[0].fn();
      const tail = wsInstances[0].sent.slice(sentN);
      if (tail.length !== 1) throw new Error('M30: the loop sent ' + tail.length + ' frames, expected state only');
      const t = tail[0] instanceof Uint8Array ? tail[0] : new Uint8Array(tail[0]);
      if (t[0] !== 26 || t.length !== 1 + 21)
        throw new Error('M30: the 30 Hz frame is not the type-26 state (type ' + t[0] + ', len ' + t.length + ')');
    }

    /* wire helpers: a tick with players (bit0) + real animals (bit2) */
    const w32 = (v) => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v, true); return new Uint8Array(b.buffer); };
    const buildTick = (flags, tickId, players, animalsList) => {
      const parts = [new Uint8Array([27, flags])];
      if (flags & 1) {
        parts.push(w32(tickId), w32(players.length));
        for (const p of players) {
          const b = new DataView(new ArrayBuffer(21));
          b.setUint32(0, p.id, true);
          b.setFloat32(4, p.x, true); b.setFloat32(8, p.y, true);
          b.setFloat32(12, p.z, true); b.setFloat32(16, p.yaw, true);
          b.setUint8(20, p.state);
          parts.push(new Uint8Array(b.buffer));
        }
      }
      if (flags & 4) {
        parts.push(w32(animalsList.length));
        for (const a of animalsList) {
          const b = new Uint8Array(24);
          const dv = new DataView(b.buffer);
          dv.setUint16(0, a.slot, true);
          b[2] = a.type; b[3] = 0;
          dv.setFloat32(4, a.x, true); dv.setFloat32(8, a.y, true);
          dv.setFloat32(12, a.z, true); dv.setFloat32(16, a.yaw, true);
          b[20] = a.dead ? 1 : 0;
          parts.push(b);
        }
      }
      const total = parts.reduce((s, q) => s + q.length, 0);
      const buf = new Uint8Array(total);
      let off = 0;
      for (const q of parts) { buf.set(q, off); off += q.length; }
      return buf;
    };
    const sendTick = (flags, tickId, players, animalsList) =>
      wsInstances[0].onmessage({ data: buildTick(flags, tickId, players, animalsList).buffer.slice(0) });

    /* 4. M40: the type-29 animal upload is retired - the loop now sends
       exactly the type-26 state frame (roster is server-simulated, M35) */
    sendTick(0x01, 1, [{ id: 110, x: 0, y: 0, z: 0, yaw: 0, state: 0 }], null);
    gameMin = 42.75;
    intervals[0].fn();
    {
      const up = wsInstances[0].sent.at(-1);
      const t = up instanceof Uint8Array ? up : new Uint8Array(up);
      if (t[0] !== 26)
        throw new Error('M30: the 30 Hz frame must be state-only after M40 (got type ' + t[0] + ')');
    }

    /* 5. the bit-2 section populates api.animals (the server-simulated
       roster) and no tab uploads animals anymore */
    sendTick(0x01, 2, [{ id: 111, x: 3, y: 0, z: -3, yaw: 1, state: 0 }], null);
    const sentN = wsInstances[0].sent.length;
    intervals[0].fn();
    {
      const tail = wsInstances[0].sent.slice(sentN);
      if (tail.length !== 1)
        throw new Error('M30: the loop sent ' + tail.length + ' frames, expected state only');
      for (const d of tail)
        if ((d instanceof Uint8Array ? d : new Uint8Array(d))[0] === 29)
          throw new Error('M30: a tab uploaded animals');
    }

    /* relayed snapshot: a school anchor, one LIVE tiger, one DEAD crab */
    const crab = crabs.find((c) => c.alive && c.grp);
    if (!crab) throw new Error('M30: no live crab to relay dead');
    const crabSlot = 64 + crabs.indexOf(crab);
    const t0 = tigers.find((t) => t.grp) || tigers[0];
    const s0 = schools[0];
    const rx = 30, rz = -20;             /* school anchor target */
    const tx = -40, tz = 25, tyaw = 1.2;  /* live tiger target */
    sendTick(0x05, 3,
      [{ id: 110, x: 0.5, y: 0.5, z: 0.5, yaw: 0.25, state: 0 },
       { id: 111, x: 3, y: 0, z: -3, yaw: 1, state: 0 }],
      [
        { slot: 0, type: 0, x: rx, y: 0, z: rz, yaw: 0, dead: false },
        { slot: 128, type: 2, x: tx, y: 2, z: tz, yaw: tyaw, dead: false },
        { slot: crabSlot, type: 1, x: 0, y: 0, z: 0, yaw: 0, dead: true },
      ]);
    if (api.animals.size !== 3)
      throw new Error('M30: api.animals must hold exactly the 3 relayed entries, got ' + api.animals.size);
    const aCrab = api.animals.get(crabSlot);
    if (!aCrab || !aCrab.dead) throw new Error('M30: the relayed dead crab was not parsed');
    const aTiger = api.animals.get(128);
    if (!aTiger || Math.abs(aTiger.x - tx) > 1e-6 || Math.abs(aTiger.yaw - tyaw) > 1e-6)
      throw new Error('M30: the relayed tiger was not parsed');
    if (animalTickEntries !== 3) throw new Error('M30: onAnimals did not fire with the snapshot');
    if (api.remotes.has(110)) throw new Error('M30: self leaked into remotes');
    const r111 = api.remotes.get(111);
    if (!r111 || Math.abs(r111.x - 3) > 1e-6)
      throw new Error('M30: the players section desynced the walk across bit2');

    /* 6. mpAnimalsFrame: the relayed transforms win on the follower
       (dead hides the mesh; live individuals + the school anchor converge) */
    /* the relay targets sit well outside the spawn bands, so every entity
       starts measurably far from its target (no degenerate d0 === 0) */
    const dT0 = Math.hypot(t0.grp.position.x - tx, t0.grp.position.z - tz);
    const dS0 = Math.hypot(s0.x - rx, s0.z - rz);
    if (dT0 < 1 || dS0 < 1) throw new Error('M30: degenerate starting distance (tiger ' + dT0 + ', school ' + dS0 + ')');
    for (let i = 0; i < 60; i++) mpAnimalsFrame(0.1);
    if (crab.grp.visible !== false) throw new Error('M30: the relayed dead crab was not hidden');
    const dT1 = Math.hypot(t0.grp.position.x - tx, t0.grp.position.z - tz);
    if (dT1 >= dT0)
      throw new Error('M30: the tiger grp did not move toward the relayed transform (' + dT0 + ' -> ' + dT1 + ')');
    const dS1 = Math.hypot(s0.x - rx, s0.z - rz);
    if (dS1 >= dS0)
      throw new Error('M30: the school anchor did not move toward the relayed anchor');
    if (Math.abs(s0.x - rx) > 1e-3 || Math.abs(s0.z - rz) > 1e-3)
      throw new Error('M30: the school anchor did not converge: (' + s0.x + ', ' + s0.z + ') -> target (' + rx + ', ' + rz + ')');
    if (Math.abs(t0.x - t0.grp.position.x) > 0.5)
      throw new Error('M30: the tiger data field drifted from its grp after the relay');

    /* 7. the frame() hook: a pumped frame with the snapshot relayed applies
       the same layer in the real render loop without throwing */
    started = true; dead = false; won = false; onRaft = false;
    for (const k of ['thirst', 'hunger', 'health', 'wet'])
      stats[k] = Math.min(100, Math.max(0, stats[k]));
    const g0 = gameMin;
    pump(2);
    if (!(gameMin > g0))
      throw new Error('M30: frame() stopped advancing the clock with the MP session open');

    /* 8. back to single-player: the apply layer goes inert again */
    api.close();
    mpApi = null;
    mpAnimalsFrame(0.016);
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
    for (const av of mpAvatars.values()) scene.remove(av.grp);
    mpAvatars.clear();
    let ai = 0;
    for (const sp of animals)
      for (const e of sp.pop) {
      const rec = saveAnimals[ai++];
      e.x = rec.x; e.z = rec.z; e.dir = rec.dir; e.n = rec.n; e.alive = rec.alive;
      if (rec.meshCount !== undefined && e.mesh) e.mesh.count = rec.meshCount;
      if (e.grp) {
        e.grp.position.x = rec.gx; e.grp.position.z = rec.gz;
        e.grp.rotation.y = rec.ry; e.grp.visible = rec.vis;
      }
      }
    gameMin = saveGameMin;
    mpTimeAdopt = 0;
    started = saveStarted; dead = saveDead; won = saveWon; onRaft = saveOnRaft;
    fires.forEach((f, i) => { f.cooking = saveCooking[i]; });
  }
}

/* ---- M31: multiplayer reconnect hardening (uplink resume + catch-up) ---- */
{
  /* 1. invariants: no MP state leaked in from the M30 block */
  if (mpApi !== null) throw new Error('M31: mpApi leaked in from the M30 block');
  if (mpTimeAdopt !== 0) throw new Error('M31: mpTimeAdopt leaked in from the M30 block');
  mpAnimalsFrame(0.016);   /* silent no-op without mpApi */

  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };
  let __tt11 = 3e8;   /* far past every earlier block's lastT (negative-dt guard) */
  const pump = (n) => { for (let i = 0; i < n; i++) { const cb = globalThis.__rafCb; globalThis.__rafCb = null; __tt11 += 16.7; globalThis.__audioTime += 0.0167; if (cb) cb(__tt11); } };

  /* snapshot everything the block can touch (M29 + M30 union) */
  const savePalms = palms.map((q) => q.cocos);
  const savePlants = plants.map((q) => ({ chargesLeft: q.chargesLeft, state: q.state, min: q.min, wear: q.wear }));
  const saveCamp = camp;
  if (saveCamp && saveCamp.grp) scene.remove(saveCamp.grp);   /* the story camp may stand */
  camp = null;
  const saveGameMin = gameMin;
  const saveStarted = started, saveDead = dead, saveWon = won, saveOnRaft = onRaft;
  const saveItems = items.length, saveTorches = torchLights.length;
  const saveStats = { health: stats.health, hunger: stats.hunger, thirst: stats.thirst, wet: stats.wet };
  const saveCooking = fires.map((f) => f.cooking);
  for (const f of fires) if (typeof f.cooking === 'string') f.cooking = null;
  const saveAnimals = [];
  for (const sp of animals)
    for (const e of sp.pop) {
      const rec = { x: e.x, z: e.z, dir: e.dir, n: e.n, alive: e.alive };
      if (e.mesh) rec.meshCount = e.mesh.count;
      if (e.grp) { rec.gx = e.grp.position.x; rec.gz = e.grp.position.z;
        rec.ry = e.grp.rotation.y; rec.vis = e.grp.visible; }
      saveAnimals.push(rec);
    }
  const expectTotal = schools.length + crabs.length + tigers.length + gulls.length
    + monkeys.length + lizards.length + snakes.length + pelicans.length
    + sharks.length + spiders.length;
  const palmIdx = palms.findIndex((q) => q.cocos === 2);
  if (palmIdx < 0) throw new Error('M31: no palm with 2 coconuts to harvest');
  const p0 = palms[palmIdx];
  const pl = plants.find((q) => q.state === 'ready' && q.chargesLeft > 1);
  if (!pl) throw new Error('M31: no ready plant with charges left to harvest');
  const plIdx = plants.indexOf(pl);
  const plTarget = pl.chargesLeft - 1;

  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    /* mirror the page's ?mp= block hooks exactly */
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M31Tester', inWater: () => false,
      onEdit: (pid, eidx, kind, action, payload) => {
        if (pid === api.publicId) return;
        mpApplyWorldEdit(kind, eidx, payload);
      },
      onEditSync: (pid, eidx, kind, action, payload) => {
        if (pid === api.publicId) return;
        mpApplyWorldEdit(kind, eidx, payload);
      },
      onTime: (gm) => {
        if (!Number.isFinite(gm)) return;
        mpTimeAdopt = gm;
      },
    });
    mpApi = api;

    /* 2. connect + join success (publicId 120, the M27 pattern); a tick makes
       this tab a FOLLOWER of id 121 */
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 120, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 120 || api.connected() !== true)
      throw new Error('M31: the join success was not parsed');
    const buildEdit = (pid, eidx, kind, payload) => {
      const b = new Uint8Array(23);
      const dv = new DataView(b.buffer);
      dv.setUint32(0, pid, true);
      dv.setUint32(4, eidx, true);
      b[8] = kind; b[9] = 0;
      if (payload) b.set(payload.subarray(0, 12), 10);
      return b;
    };
    const w32 = (v) => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v, true); return new Uint8Array(b.buffer); };
    const buildTick = (flags, tickId, players, time) => {
      const parts = [new Uint8Array([27, flags])];
      if (flags & 1) {
        parts.push(w32(tickId), w32(players.length));
        for (const p of players) {
          const b = new DataView(new ArrayBuffer(21));
          b.setUint32(0, p.id, true);
          b.setFloat32(4, p.x, true); b.setFloat32(8, p.y, true);
          b.setFloat32(12, p.z, true); b.setFloat32(16, p.yaw, true);
          b.setUint8(20, p.state);
          parts.push(new Uint8Array(b.buffer));
        }
      }
      if ((flags & 16) && time !== null) {
        const b = new DataView(new ArrayBuffer(4));
        b.setFloat32(0, time, true);
        parts.push(new Uint8Array(b.buffer));
      }
      const total = parts.reduce((s, q) => s + q.length, 0);
      const buf = new Uint8Array(total);
      let off = 0;
      for (const q of parts) { buf.set(q, off); off += q.length; }
      return buf;
    };
    const sendTick = (flags, tickId, players, time) =>
      wsInstances[wsInstances.length - 1].onmessage(
        { data: buildTick(flags, tickId, players, time).buffer.slice(0) });
    const PLAYER_120 = { id: 120, x: 0.5, y: 0, z: -0.5, yaw: 0.25, state: 0 };
    const PLAYER_121 = { id: 121, x: 3.5, y: 0, z: -3.5, yaw: 1.1, state: 0 };
    sendTick(0x01, 1, [PLAYER_120, PLAYER_121], null);
    {
      /* M40: no authority tracking - the loop sends exactly the type-26
         state frame for any connected tab */
      const sentN = wsInstances[0].sent.length;
      intervals[0].fn();
      const tail = wsInstances[0].sent.slice(sentN);
      if (tail.length !== 1) throw new Error('M31: the loop sent ' + tail.length + ' frames, expected state only');
      if ((tail[0] instanceof Uint8Array ? tail[0] : new Uint8Array(tail[0]))[0] !== 26)
        throw new Error('M31: the 30 Hz frame is not the type-26 state');
    }

    /* 3. DROP + RECONNECT: the close handler cancels the uplink, the 1 s
       backoff re-arms a fresh socket, and the M31 fix restarts the 30 Hz
       upload after the rejoin (this is THE regression) */
    wsInstances[0].readyState = 3;
    wsInstances[0].onclose();
    if (intervals[0].on !== false) throw new Error('M31: the uplink interval was not canceled on close');
    if (timeouts.length !== 1 || timeouts[0].ms !== 1000)
      throw new Error('M31: no 1 s reconnect backoff on close');
    if (api.connected() !== false) throw new Error('M31: presence must hide while rejoining');
    timeouts[0].fn();
    if (wsInstances.length !== 2) throw new Error('M31: the reconnect did not open a fresh socket');
    const ws2 = wsInstances[1];
    ws2.readyState = 1;
    ws2.onopen();
    let j2 = ws2.sent.at(-1);
    j2 = j2 instanceof Uint8Array ? j2 : new Uint8Array(j2);
    if (j2[0] !== 3) throw new Error('M31: the reconnected socket did not rejoin with type 3');
    ws2.onmessage({ data: jsBuf.buffer.slice(0) });   /* same publicId 120 on rejoin */
    if (intervals.length !== 2 || intervals[1].on !== true || intervals[1].ms !== (1000 / 30))
      throw new Error('M31: the 30 Hz uplink did not restart after the rejoin');
    {
      const sentN = ws2.sent.length;
      intervals[1].fn();
      const tail = ws2.sent.slice(sentN);
      if (tail.length !== 1) throw new Error('M31: the resumed loop sent ' + tail.length + ' frames, expected state only');
      if ((tail[0] instanceof Uint8Array ? tail[0] : new Uint8Array(tail[0]))[0] !== 26)
        throw new Error('M31: the resumed loop sent the wrong frame (type ' + (tail[0] instanceof Uint8Array ? tail[0][0] : new Uint8Array(tail[0])[0]) + ')');
      if (api.connected() !== true) throw new Error('M31: presence must be visible after the rejoin');
    }

    /* 4. EDIT_SYNC catch-up: the full edit history the server replays on every
       join (edits made by 121 while this tab was away) applies, and a second
       identical replay is a no-op (set semantics) */
    const itemsBefore = items.length;
    const syncBuf = new Uint8Array(1 + 4 + 3 * 23);
    syncBuf[0] = 30;
    new DataView(syncBuf.buffer).setUint32(1, 3, true);
    syncBuf.set(buildEdit(121, p0.idx, 0, mpPayloadU8(1)), 5);
    syncBuf.set(buildEdit(121, plIdx, 1, mpPayloadU8(plTarget)), 5 + 23);
    syncBuf.set(buildEdit(121, 0, 2, mpPayloadCamp(7.5, -4.25, 2.4)), 5 + 2 * 23);
    ws2.onmessage({ data: syncBuf.buffer.slice(0) });
    if (p0.cocos !== 1) throw new Error('M31: the EDIT_SYNC palm edit was not applied');
    if (pl.chargesLeft !== plTarget || pl.min !== 0
        || pl.state !== (plTarget > 0 ? 'ready' : 'depleted'))
      throw new Error('M31: the EDIT_SYNC plant harvest was not mirrored');
    if (!camp || Math.abs(camp.x - 7.5) > 1e-6 || Math.abs(camp.z + 4.25) > 1e-6 || Math.abs(camp.rot - 2.4) > 1e-5)
      throw new Error('M31: the EDIT_SYNC camp was not adopted');
    if (items.length !== itemsBefore) throw new Error('M31: the catch-up replay spawned items');
    ws2.onmessage({ data: syncBuf.buffer.slice(0) });   /* the second replay */
    if (p0.cocos !== 1 || pl.chargesLeft !== plTarget
        || !camp || Math.abs(camp.x - 7.5) > 1e-6 || items.length !== itemsBefore)
      throw new Error('M31: the EDIT_SYNC catch-up is not idempotent');

    /* 5. clock re-adoption: bit4 from the authority stashes the pending
       clock and frame() snaps to it after the reconnect */
    sendTick(0x11, 2, [PLAYER_120, PLAYER_121], 611.25);
    if (Math.abs(mpTimeAdopt - 611.25) > 1e-4)
      throw new Error('M31: the authority clock was not stashed from bit4');
    started = true; dead = false; won = false; onRaft = false;
    for (const k of ['thirst', 'hunger', 'health', 'wet'])
      stats[k] = Math.min(100, Math.max(0, stats[k]));
    pump(1);
    if (Math.abs(gameMin - 611.25) > 1e-4)
      throw new Error('M31: frame() did not snap gameMin to the adopted clock: ' + gameMin);
    if (mpTimeAdopt !== 0) throw new Error('M31: the pending clock was not consumed');
    pump(1);
    if (gameMin <= 611.25 || gameMin - 611.25 > 0.05)
      throw new Error('M31: the local clock did not resume after the snap: ' + gameMin);

    /* 6. M40: no authority flip exists anymore - the resumed loop sends
       exactly the type-26 state frame; the type-29 animal snapshot is
       retired (server-simulated roster) */
    sendTick(0x01, 3, [PLAYER_120, PLAYER_121], null);
    {
      const sentN = ws2.sent.length;
      intervals[1].fn();
      const tail = ws2.sent.slice(sentN);
      if (tail.length !== 1)
        throw new Error('M31: the resumed loop sent ' + tail.length + ' frames, expected state only');
      const t = tail[0] instanceof Uint8Array ? tail[0] : new Uint8Array(tail[0]);
      if (t[0] !== 26 || t.length !== 1 + 21)
        throw new Error('M31: the resumed frame is not the type-26 state (type ' + t[0] + ')');
    }

    /* 7. back to single-player: everything goes inert again */
    api.close();
    mpApi = null;
    mpAnimalsFrame(0.016);
    const g0 = gameMin;
    pump(1);
    if (!(gameMin > g0))
      throw new Error('M31: after the MP session the single-player clock stopped');
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
    for (const av of mpAvatars.values()) scene.remove(av.grp);
    mpAvatars.clear();
    palms.forEach((q, i) => {
      q.cocos = savePalms[i];
      for (let j = 0; j < 2; j++) {
        if (j < q.cocos)
          setM(q.idx * 2 + j, cocosMesh,
            j === 0 ? q.top[0] + 0.18 : q.top[0] - 0.15,
            q.top[1] - 0.18,
            j === 0 ? q.top[2] + 0.1 : q.top[2] - 0.14, 0, 0, 0, 1, 1, 1);
        else
          setM(q.idx * 2 + j, cocosMesh, 9999, -99, 9999, 0, 0, 0, 0, 0, 0);
      }
    });
    plants.forEach((q, i) => {
      q.chargesLeft = savePlants[i].chargesLeft;
      q.state = savePlants[i].state;
      q.min = savePlants[i].min;
      q.wear = savePlants[i].wear;
      emitPlant(q);
    });
    if (camp !== saveCamp && camp && camp.grp) scene.remove(camp.grp);
    camp = saveCamp;
    if (saveCamp && saveCamp.grp) scene.add(saveCamp.grp);
    torchLights.length = saveTorches;
    for (let i = saveItems; i < items.length; i++) if (items[i].mesh) scene.remove(items[i].mesh);
    items.length = saveItems;
    let ai = 0;
    for (const sp of animals)
      for (const e of sp.pop) {
      const rec = saveAnimals[ai++];
      e.x = rec.x; e.z = rec.z; e.dir = rec.dir; e.n = rec.n; e.alive = rec.alive;
      if (rec.meshCount !== undefined && e.mesh) e.mesh.count = rec.meshCount;
      if (e.grp) {
        e.grp.position.x = rec.gx; e.grp.position.z = rec.gz;
        e.grp.rotation.y = rec.ry; e.grp.visible = rec.vis;
      }
      }
    gameMin = saveGameMin;
    mpTimeAdopt = 0;
    fires.forEach((f, i) => { f.cooking = saveCooking[i]; });
    started = saveStarted; dead = saveDead; won = saveWon; onRaft = saveOnRaft;
    stats.health = saveStats.health; stats.hunger = saveStats.hunger;
    stats.thirst = saveStats.thirst; stats.wet = saveStats.wet;
  }
}

/* ---- M33: protocol v2 join + island placement block (type 33) ---- */
{
  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };
  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    const worldLog = [];
    const api = mp.attachMultiplayer({
      rig: { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } },
      url: '127.0.0.1:3003', seed: 1337, displayName: 'WorldSmoke',
      inWater: () => false, onWorld: (w) => worldLog.push(w),
    });
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    let j = wsInstances[0].sent.at(-1);
    j = j instanceof Uint8Array ? j : new Uint8Array(j);
    const jp = new TextDecoder().decode(j.subarray(1)).split('|');
    if (jp.length !== 3 || jp[1] !== '2')
      throw new Error('M33: join payload is not protocol v2: ' + jp.join('|'));

    /* join success: publicId 21 (big-endian, the M27 pattern) */
    const jsBuf = new Uint8Array(5);
    jsBuf[0] = 8; jsBuf[4] = 21;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 21) throw new Error('M33: join success not parsed');

    /* type 33: seed 1337, 1 palm, 1 tree, 1 rock, 2 species */
    const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
    const u16 = v => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
    const f64 = v => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return b; };
    const enc = s => new TextEncoder().encode(s);
    const sendWorld = (chunks) => {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const buf = new Uint8Array(total);
      let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
      wsInstances[0].onmessage({ data: buf.buffer.slice(0) });
    };
    sendWorld([
      new Uint8Array([33]),
      u32(1337),
      u32(1), f64(1.25), f64(-2.5), f64(4.5), f64(4.1), f64(0.1), f64(-0.05),
      u32(1), f64(7.5), f64(8.25), f64(12.75), f64(7.5), f64(3.1),
      f64(0.6), f64(0.7), f64(0.8), f64(2.5), f64(3.5), f64(4.5),
      u32(1), f64(15.5), f64(-16.25), f64(14.125), f64(1.25), f64(1.4),
      u16(2),
      u16(5), enc('fiber'), u32(2), f64(10), f64(11), f64(2.5), f64(12), f64(13), f64(3.5),
      u16(4), enc('herb'), u32(1), f64(20), f64(21), f64(6.5),
    ]);
    if (worldLog.length !== 1) throw new Error('M33: onWorld did not fire once');
    const w = worldLog[0];
    if (w.seed !== 1337) throw new Error('M33: seed wrong: ' + w.seed);
    if (w.palms.length !== 1 || w.palms[0].x !== 1.25 || w.palms[0].groundH !== 4.5
        || w.palms[0].trunkH !== 4.1 || w.palms[0].tx !== 0.1 || w.palms[0].tz !== -0.05)
      throw new Error('M33: palm parse wrong: ' + JSON.stringify(w.palms));
    if (w.trees.length !== 1 || w.trees[0].trunkH !== 7.5 || w.trees[0].canopyS !== 3.1
        || w.trees[0].off[1] !== 0.7 || w.trees[0].len[2] !== 4.5)
      throw new Error('M33: tree parse wrong: ' + JSON.stringify(w.trees));
    if (w.rocks.length !== 1 || w.rocks[0].groundH !== 14.125
        || w.rocks[0].s !== 1.25 || w.rocks[0].sy !== 1.4)
      throw new Error('M33: rock parse wrong: ' + JSON.stringify(w.rocks));
    if (w.species.length !== 2 || w.species[0].key !== 'fiber' || w.species[0].pts.length !== 2
        || w.species[0].pts[0].z !== 11 || w.species[0].pts[1].h !== 3.5
        || w.species[1].key !== 'herb' || w.species[1].pts[0].x !== 20)
      throw new Error('M33: species parse wrong: ' + JSON.stringify(w.species));
    if (api.world !== w) throw new Error('M33: api.world is not the last world');

    /* rejoin: the server re-sends the block; the stored world is replaced */
    sendWorld([new Uint8Array([33]), u32(1337), u32(0), u32(0), u32(0), u16(0)]);
    if (worldLog.length !== 2)
      throw new Error('M33: the second world did not fire onWorld');
    if (api.world !== worldLog[1] || api.world.palms.length !== 0 || api.world.species.length !== 0)
      throw new Error('M33: api.world was not replaced by the second world');

    api.close();
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
  }
}

/* ---- M34: mp world built from the server placement block (type 33) ----
   The smoke page is non-mp (location.search = ''), so the immediate local
   builds ran at load; we then feed a MODIFIED synthetic payload to
   mpBuildWorld and assert the world arrays reflect the payload (consumption,
   not byte-identity), that the build is once-guarded, and restore the local
   world. This block is last: no earlier assertion may see the synthetic. */
{
  if (MP_ON !== false) throw new Error('M34: the smoke page must be non-mp');
  if (mpWorldBuilt !== false) throw new Error('M34: mpWorldBuilt must start false (non-mp)');
  if (palms.length < 60 || bigTrees.length < 60 || rocks.length < 100)
    throw new Error('M34: the immediate non-mp local build did not run');
  const snap = {
    palms: JSON.parse(JSON.stringify(palms)),
    bigTrees: JSON.parse(JSON.stringify(bigTrees)),
    rocks: JSON.parse(JSON.stringify(rocks)),
    plants: JSON.parse(JSON.stringify(plants)),
  };
  const nP = palms.length, nT = bigTrees.length, nR = rocks.length, nPl = plants.length;

  /* modified synthetic payload: counts/positions differ from local gen */
  const w = {
    seed: 1337,
    palms: [
      { x: 1.5, z: -2.25, groundH: 3.5, trunkH: 4.25, tx: 0.2, tz: -0.15 },
      { x: -3.75, z: 4.5, groundH: 1.25, trunkH: 3.75, tx: -0.1, tz: 0.3 },
      { x: 0, z: 7.125, groundH: 5.5, trunkH: 5.5, tx: 0, tz: 0 },
    ],
    trees: [
      { x: 8.25, z: -9.5, groundH: 10.75, trunkH: 8.5, canopyS: 3.25,
        off: [0.55, 0.65, 0.75], len: [2.25, 3.75, 5.25] },
      { x: -11.5, z: 12.25, groundH: 13.5, trunkH: 6.75, canopyS: 2.85,
        off: [0.9, 0.5, 0.55], len: [2, 2.5, 5.5] },
    ],
    rocks: [
      { x: 16.5, z: -17.75, groundH: 15.25, s: 1.35, sy: 1.1 },
      { x: -1.25, z: 0.75, groundH: 0.5, s: 0.55, sy: 0.6 },
    ],
    species: [{ key: 'fiber', pts: [
      { x: 10.5, z: 11.25, h: 2.5 }, { x: 12.75, z: 13.5, h: 3.5 },
      { x: 14.25, z: 15.75, h: 4.5 },
    ] }],
  };
  mpBuildWorld(w);
  if (mpWorldBuilt !== true) throw new Error('M34: mpWorldBuilt not set');
  if (palms.length !== 3 || bigTrees.length !== 2 || rocks.length !== 2 || plants.length !== 3)
    throw new Error('M34: arrays were not replaced: ' + palms.length + '/' + bigTrees.length
      + '/' + rocks.length + '/' + plants.length);
  {
    const p0 = palms[0];
    if (p0.h !== 4.25) throw new Error('M34: palm h must be trunkH (M44 quirk): ' + p0.h);
    if (p0.top[0] !== 1.5 + 0.2 * 4.25 * 0.98 || p0.top[1] !== 3.5 + 4.25
        || p0.top[2] !== -2.25 - 0.15 * 4.25 * 0.98)
      throw new Error('M34: palm top not recomputed: ' + JSON.stringify(p0.top));
    if (p0.cocos !== 2 || p0.idx !== 0 || palms[2].idx !== 2)
      throw new Error('M34: palm cocos/idx wrong');
    const t0 = bigTrees[0];
    if (t0.h !== 10.75 || t0.th !== 8.5 || t0.cs !== 3.25
        || t0.loff[1] !== 0.65 || t0.llen[2] !== 5.25)
      throw new Error('M34: big tree entry wrong: ' + JSON.stringify(t0));
    if (bigTrees[1].cs !== 2.85 || bigTrees[1].loff[0] !== 0.9)
      throw new Error('M34: second big tree entry wrong');
    if (rocks[0].h !== 15.25 || rocks[0].s !== 1.35 || rocks[0].sy !== 1.1)
      throw new Error('M34: rock entry wrong: ' + JSON.stringify(rocks[0]));
    if (rocks[1].s !== 0.55 || rocks[1].sy !== 0.6)
      throw new Error('M34: second rock entry wrong');
    if (!plants.every((p) => p.type === 'fiber'))
      throw new Error('M34: plant types wrong');
    for (let i = 0; i < 3; i++) {
      const p = plants[i], frac = (((i + 1) * 7919) % 100) / 100;
      const ready = frac < 0.45;
      if (p.x !== w.species[0].pts[i].x || p.h !== w.species[0].pts[i].h)
        throw new Error('M34: plant position wrong: ' + JSON.stringify(p));
      if (p.state !== (ready ? 'ready' : 'growing')
          || p.min !== (ready ? 0 : frac * 1440 * PLANT_TYPES.fiber.regrowDays))
        throw new Error('M34: plant state/min not index-derived: ' + JSON.stringify(p));
      if (p.chargesLeft !== PLANT_TYPES.fiber.charges || p.si !== i || p.idx !== i
          || p.wear !== 1 || p.s !== 0.75 + ((i * 37) % 13) / 25)
        throw new Error('M34: plant derived fields wrong: ' + JSON.stringify(p));
    }
  }
  /* build-once: rejoin re-sends the block; duplicates and nulls are ignored */
  mpBuildWorld(w);
  if (palms.length !== 3) throw new Error('M34: duplicate world block was not ignored');
  mpBuildWorld(null);
  if (palms.length !== 3) throw new Error('M34: null world block was not ignored');

  /* restore the local world (this block is last; kept clean for SMOKE_OK) */
  palms.length = 0; snap.palms.forEach((e) => palms.push(e));
  bigTrees.length = 0; snap.bigTrees.forEach((e) => bigTrees.push(e));
  rocks.length = 0; snap.rocks.forEach((e) => rocks.push(e));
  plants.length = 0; snap.plants.forEach((e) => plants.push(e));
  buildIslandMeshes(); buildPlantMeshes(); emitAllPlants();
  if (palms.length !== nP || bigTrees.length !== nT || rocks.length !== nR || plants.length !== nPl)
    throw new Error('M34: restore failed');
}

/* ---- M35: server-simulated animals (all tabs adopt the bit2 snapshot) ----
   M35 removed the M30 authority skip from mpAnimalsFrame: the server now
   simulates the first four species (fish, crabs, tigers, gulls) and every
   tick's bit2 carries its 28-entry snapshot for ALL tabs. Every tab adopts
   it, including the world authority. The M30 upload side (the authority's
   type-29 roster relay) is still in place until M40 retires it. */
{
  /* 1. single-player invariants: without mpApi the apply layer is inert */
  if (mpApi !== null) throw new Error('M35: mpApi leaked in from the M34 block');
  mpAnimalsFrame(0.016);   /* must be a silent no-op (no mpApi) */

  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };

  /* snapshot every animal the block can touch (M30 pattern; gy since M36
     added the grp y lerp) */
  const saveAnimals = [];
  for (const sp of animals)
    for (const e of sp.pop) {
      const rec = { x: e.x, z: e.z, dir: e.dir, n: e.n, alive: e.alive };
      if (e.mesh) rec.meshCount = e.mesh.count;
      if (e.grp) { rec.gx = e.grp.position.x; rec.gy = e.grp.position.y;
        rec.gz = e.grp.position.z; rec.ry = e.grp.rotation.y;
        rec.vis = e.grp.visible; }
      saveAnimals.push(rec);
    }
  const saveGameMin = gameMin, saveStarted = started, saveDead = dead;
  const saveWon = won, saveOnRaft = onRaft;

  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M35Tester', inWater: () => false,
    });
    mpApi = api;

    /* 2. connect + join success (publicId 110 big-endian, the M27 pattern) */
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 110, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 110 || api.connected() !== true)
      throw new Error('M35: the join success was not parsed');

    /* a tick whose bit2 (animals section) carries the 28-entry server
       roster: fish 0..4, crabs 64..78, tigers 128..130, gulls 192..196 */
    const slotOf = {};
    for (const r of mpAnimalRoster()) slotOf[r.slot] = r;
    const expectedSlots = [];
    for (let i = 0; i < schools.length; i++) expectedSlots.push(i);
    for (let i = 0; i < crabs.length; i++) expectedSlots.push(64 + i);
    for (let i = 0; i < tigers.length; i++) expectedSlots.push(128 + i);
    for (let i = 0; i < gulls.length; i++) expectedSlots.push(192 + i);
    if (expectedSlots.length !== 28)
      throw new Error('M35: the server roster must have 28 entries, got ' + expectedSlots.length);
    const far = { 0: [30, -20, 0], 64: [40, 10, 0.5], 128: [-40, 25, 1.2], 192: [10, -35, -0.7] };
    const entries = [];
    for (const s of expectedSlots) {
      const r = slotOf[s];
      if (!r) throw new Error('M35: no roster entry for slot ' + s);
      const f = far[s];
      entries.push(f
        ? { slot: s, type: r.type, x: f[0], y: 0, z: f[1], yaw: f[2], dead: false }
        : { slot: s, type: r.type, x: 12.5 + s * 0.001, y: 0, z: -8.25 + s * 0.001, yaw: 0.1, dead: false });
    }
    const sendAnimalsTick = (tickEntries) => {
      const u32b = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
      const parts = [new Uint8Array([27, 0x04]), u32b(tickEntries.length)];
      for (const a of tickEntries) {
        const b = new Uint8Array(24);
        const dv = new DataView(b.buffer);
        dv.setUint16(0, a.slot, true);
        b[2] = a.type; b[3] = 0;
        dv.setFloat32(4, a.x, true); dv.setFloat32(8, a.y, true);
        dv.setFloat32(12, a.z, true); dv.setFloat32(16, a.yaw, true);
        b[20] = a.dead ? 1 : 0;
        parts.push(b);
      }
      const total = parts.reduce((s, q) => s + q.length, 0);
      const buf = new Uint8Array(total);
      let off = 0;
      for (const q of parts) { buf.set(q, off); off += q.length; }
      wsInstances[0].onmessage({ data: buf.buffer.slice(0) });
    };

    /* 3. the snapshot parses (M40: no authority - the roster is the
       server's, every tab renders it) */
    sendAnimalsTick(entries);
    if (api.animals.size !== 28)
      throw new Error('M35: api.animals must hold the 28 server entries, got ' + api.animals.size);
    for (const s of expectedSlots)
      if (!api.animals.has(s)) throw new Error('M35: slot ' + s + ' missing from the parsed snapshot');

    /* 4. M40: the type-29 animal upload is retired - the 30 Hz loop sends
       exactly the type-26 state frame */
    {
      const sentN = wsInstances[0].sent.length;
      intervals[0].fn();
      const tail = wsInstances[0].sent.slice(sentN)
        .map((d) => (d instanceof Uint8Array ? d : new Uint8Array(d)));
      if (tail.length !== 1 || tail[0][0] !== 26)
        throw new Error('M35: the 30 Hz loop is not state-only: ' + tail.map((d) => d[0]).join(','));
    }

    /* 5. the authority tab ADOPTS the server snapshot (the M30 skip is gone):
       the four far targets converge; slots 256+ (unported species) are
       untouched because they are absent from the snapshot */
    const s0 = schools[0], c0 = crabs[0], t0 = tigers[0], g0 = gulls[0];
    for (const [name, e] of [['crab', c0], ['tiger', t0], ['gull', g0]])
      if (!e.grp) throw new Error('M35: no grp on the ' + name + ' to adopt');
    const monkeyR = mpAnimalRoster().find((r) => r.id === 'monkey');
    if (!monkeyR || monkeyR.slot !== 256)
      throw new Error('M35: the first monkey slot is not 256 (unported band)');
    const mEnt = monkeyR.pop[0];
    const before = {
      sx: s0.x, sz: s0.z,
      cx: c0.x, cz: c0.z, cgrx: c0.grp.position.x, cgrz: c0.grp.position.z, cry: c0.grp.rotation.y,
      tx: t0.x, tz: t0.z, tgrx: t0.grp.position.x, tgrz: t0.grp.position.z, try_: t0.grp.rotation.y,
      gx: g0.x, gz: g0.z, ggrx: g0.grp.position.x, ggrz: g0.grp.position.z, gry: g0.grp.rotation.y,
      mx: mEnt.x, mz: mEnt.z, mdir: mEnt.dir,
      mgrx: mEnt.grp ? mEnt.grp.position.x : null,
      mgrz: mEnt.grp ? mEnt.grp.position.z : null,
    };
    /* yaw compares modulo 2*pi: the shortest-arc lerp converges to the
       target offset by the spawn-dir's 2*pi multiple (M28-style lerp) */
    const angDiff = (a, b) => {
      let d = (a - b) % (2 * Math.PI);
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      return Math.abs(d);
    };
    for (let i = 0; i < 60; i++) mpAnimalsFrame(0.1);
    if (Math.abs(s0.x - 30) > 1e-3 || Math.abs(s0.z - -20) > 1e-3)
      throw new Error('M35: the authority did not adopt the fish anchor: (' + s0.x + ', ' + s0.z + ')');
    if (Math.abs(c0.grp.position.x - 40) > 1e-3 || Math.abs(c0.grp.position.z - 10) > 1e-3)
      throw new Error('M35: the authority did not adopt the crab transform');
    if (angDiff(c0.grp.rotation.y, 0.5) > 1e-3)
      throw new Error('M35: the authority did not adopt the crab yaw (' + c0.grp.rotation.y + ')');
    if (Math.abs(t0.grp.position.x - -40) > 1e-3 || Math.abs(t0.grp.position.z - 25) > 1e-3)
      throw new Error('M35: the authority did not adopt the tiger transform');
    if (angDiff(t0.grp.rotation.y, 1.2) > 1e-3)
      throw new Error('M35: the authority did not adopt the tiger yaw');
    if (Math.abs(g0.grp.position.x - 10) > 1e-3 || Math.abs(g0.grp.position.z - -35) > 1e-3)
      throw new Error('M35: the authority did not adopt the gull transform');
    if (angDiff(g0.grp.rotation.y, -0.7) > 1e-3)
      throw new Error('M35: the authority did not adopt the gull yaw');
    if (Math.abs(c0.x - c0.grp.position.x) > 0.5 || Math.abs(t0.x - t0.grp.position.x) > 0.5)
      throw new Error('M35: a data field drifted from its grp after adoption');
    if (mEnt.x !== before.mx || mEnt.z !== before.mz || mEnt.dir !== before.mdir
        || (mEnt.grp && (mEnt.grp.position.x !== before.mgrx || mEnt.grp.position.z !== before.mgrz)))
      throw new Error('M35: an unported (slot 256+) animal was touched by the snapshot adoption');

    /* 6. back to single-player: the apply layer goes inert again */
    api.close();
    mpApi = null;
    mpAnimalsFrame(0.016);
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
    let ai = 0;
    for (const sp of animals)
      for (const e of sp.pop) {
        const rec = saveAnimals[ai++];
        e.x = rec.x; e.z = rec.z; e.dir = rec.dir; e.n = rec.n; e.alive = rec.alive;
        if (rec.meshCount !== undefined && e.mesh) e.mesh.count = rec.meshCount;
        if (e.grp) {
          e.grp.position.x = rec.gx; e.grp.position.y = rec.gy;
          e.grp.position.z = rec.gz; e.grp.rotation.y = rec.ry;
          e.grp.visible = rec.vis;
        }
      }
    gameMin = saveGameMin;
    mpTimeAdopt = 0;
    started = saveStarted; dead = saveDead; won = saveWon; onRaft = saveOnRaft;
  }
}

/* ---- M36: the full 51-animal roster is server-simulated; mp mode disables
   the local sim (updateAnimals gates on mpApi.connected()) and the bit2
   snapshot is the only thing that moves animals; mpAnimalsPresent keeps the
   puppets alive (fish instances via schoolPlace, grounded y from heightAt,
   gull +GULL_ALT, pelican/shark y from the just-lerped snapshot, limbs from
   the estimated speed). Without ?mp= the single-player path is untouched. */
{
  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };

  const saveAnimals = [];
  for (const sp of animals)
    for (const e of sp.pop) {
      const rec = { x: e.x, z: e.z, dir: e.dir, n: e.n, alive: e.alive };
      if (e.mesh) rec.meshCount = e.mesh.count;
      if (e.grp) { rec.gx = e.grp.position.x; rec.gy = e.grp.position.y;
        rec.gz = e.grp.position.z; rec.ry = e.grp.rotation.y;
        rec.vis = e.grp.visible; }
      saveAnimals.push(rec);
    }
  const saveGameMin = gameMin, saveStarted = started, saveDead = dead;
  const saveWon = won, saveOnRaft = onRaft;
  const m0 = monkeys[0], g0 = gulls[0], sh0 = sharks[0], pel0 = pelicans[0], sp0 = spiders[0];

  try {
    /* 1. single-player: updateAnimals still steps the full ten-species
       registry (mpApi is null, the gate is open) */
    if (mpApi !== null) throw new Error('M36: mpApi leaked in from the M35 block');
    started = true; dead = false;
    const before = { x: m0.x, z: m0.z, dir: m0.dir };
    updateAnimals(0.1, 'early');
    updateAnimals(0.1, 'late');
    if (m0.x === before.x && m0.z === before.z && m0.dir === before.dir)
      throw new Error('M36: single-player updateAnimals no longer steps the monkeys');

    /* 2. connect + join success (the M27/M35 FakeWS pattern) */
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M36Tester', inWater: () => false,
    });
    mpApi = api;
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 110, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 110 || api.connected() !== true)
      throw new Error('M36: the join success was not parsed');

    /* 3. while connected the local sim is FULLY disabled: a frame pump does
       not advance a single data field of the 51 animals */
    const frozen = [];
    for (const sp of animals)
      for (const e of sp.pop)
        frozen.push([e, e.x, e.z, e.dir, e.n]);
    updateAnimals(0.1, 'early');
    updateAnimals(0.1, 'late');
    frozen.forEach(([e, x, z, d, n], i) => {
      if (e.x !== x || e.z !== z || (typeof d === 'number' && e.dir !== d) || e.n !== n)
        throw new Error('M36: updateAnimals mutated animal ' + i + ' while connected');
    });

    /* 4. a 51-entry tick: all ten bands, the registry type per slot, and the
       fish state byte = the live count (the M36 extension of the state bit) */
    const slotOf = {};
    for (const r of mpAnimalRoster()) slotOf[r.slot] = r;
    const bands = [[schools, 0], [crabs, 64], [tigers, 128], [gulls, 192],
                   [monkeys, 256], [lizards, 320], [snakes, 384], [pelicans, 448],
                   [sharks, 512], [spiders, 576]];
    const fishN = [9, 7, 5, 3, 1];
    const entries = [];
    let fishI = 0;
    for (const [pop, base] of bands)
      for (let i = 0; i < pop.length; i++) {
        const slot = base + i;
        const r = slotOf[slot];
        if (!r) throw new Error('M36: no roster entry for slot ' + slot);
        const far =
          slot === 256 ? [35, -30, 0, 0.9] :     /* monkey 0: the new band adopts */
          slot === 576 ? [-45, 30, 0, 2.0] :     /* spider 0 */
          slot === 512 ? [20, 10, -0.5, 0.4] :   /* shark 0: depth adoption */
          slot === 448 ? [5, -40, 9.5, -0.3] :   /* pelican 0: altitude adoption */
          null;
        const st = r.type === 0 ? fishN[fishI++] : 0;
        entries.push(far
          ? { slot: slot, type: r.type, x: far[0], y: far[2], z: far[1], yaw: far[3], state: st }
          : { slot: slot, type: r.type, x: 12.5 + slot * 0.001, y: 0,
              z: -8.25 + slot * 0.001, yaw: 0.1, state: st });
      }
    if (entries.length !== 51)
      throw new Error('M36: the roster must be 51 animals, got ' + entries.length);
    const sendAnimalsTick = (tickEntries) => {
      const u32b = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
      const parts = [new Uint8Array([27, 0x04]), u32b(tickEntries.length)];
      for (const a of tickEntries) {
        const b = new Uint8Array(24);
        const dv = new DataView(b.buffer);
        dv.setUint16(0, a.slot, true);
        b[2] = a.type; b[3] = 0;
        dv.setFloat32(4, a.x, true); dv.setFloat32(8, a.y, true);
        dv.setFloat32(12, a.z, true); dv.setFloat32(16, a.yaw, true);
        b[20] = a.state & 0xFF;   /* M36: the raw state byte (fish = live n) */
        parts.push(b);
      }
      const total = parts.reduce((s, q) => s + q.length, 0);
      const buf = new Uint8Array(total);
      let off = 0;
      for (const q of parts) { buf.set(q, off); off += q.length; }
      wsInstances[0].onmessage({ data: buf.buffer.slice(0) });
    };

    /* 5. the full snapshot parses (M40: the roster is the server's) */
    sendAnimalsTick(entries);
    if (api.animals.size !== 51)
      throw new Error('M36: api.animals must hold the 51 server entries, got ' + api.animals.size);
    for (const e of entries)
      if (!api.animals.has(e.slot))
        throw new Error('M36: slot ' + e.slot + ' missing from the parsed snapshot');

    /* 6. M40: the type-29 animal upload is retired - the 30 Hz loop sends
       exactly the type-26 state frame */
    {
      const sentN = wsInstances[0].sent.length;
      intervals[0].fn();
      const tail = wsInstances[0].sent.slice(sentN)
        .map((d) => (d instanceof Uint8Array ? d : new Uint8Array(d)));
      if (tail.length !== 1 || tail[0][0] !== 26)
        throw new Error('M36: the 30 Hz loop is not state-only: ' + tail.map((d) => d[0]).join(','));
    }

    /* 7. all ten bands ADOPT the server transforms: the four far targets
       converge, the two new bands join, the shark takes the server depth
       and the pelican the server altitude (the M36 y lerp), and every fish
       school takes its live count from the state byte */
    for (const [name, e] of [['monkey', m0], ['spider', sp0], ['shark', sh0], ['pelican', pel0]])
      if (!e.grp) throw new Error('M36: no grp on the ' + name + ' to adopt');
    for (let i = 0; i < 60; i++) mpAnimalsFrame(0.1);
    if (Math.abs(m0.x - 35) > 1e-3 || Math.abs(m0.z - -30) > 1e-3)
      throw new Error('M36: the monkey did not adopt the server transform: (' + m0.x + ', ' + m0.z + ')');
    if (Math.abs(sp0.x - -45) > 1e-3 || Math.abs(sp0.z - 30) > 1e-3)
      throw new Error('M36: the spider did not adopt the server transform');
    if (Math.abs(sh0.grp.position.y - -0.5) > 1e-3)
      throw new Error('M36: the shark did not adopt the server depth (y ' + sh0.grp.position.y + ')');
    if (Math.abs(pel0.grp.position.y - 9.5) > 1e-3)
      throw new Error('M36: the pelican did not adopt the server altitude (y ' + pel0.grp.position.y + ')');
    schools.forEach((s, i) => {
      if (s.n !== fishN[i])
        throw new Error('M36: school ' + i + ' did not take the live count from the state byte: ' + s.n);
    });

    /* 8. the presentation pass: fish instances refresh their count, the
       grounded species snap to the terrain under the server x/z, the gull
       adds GULL_ALT, the pelican/shark keep the just-lerped y, the limbs
       animate (finite) */
    mpAnimalsPresent(0.1);
    if (schools[0].mesh.count !== schools[0].n)
      throw new Error('M36: schoolPlace did not refresh the instance count');
    if (Math.abs(m0.grp.position.y - heightAt(m0.x, m0.z)) > 1e-6)
      throw new Error('M36: the monkey is not on the terrain under the server x/z');
    if (Math.abs(g0.grp.position.y - (heightAt(g0.x, g0.z) + GULL_ALT)) > 1e-6)
      throw new Error('M36: the gull is not at heightAt + GULL_ALT');
    if (Math.abs(sh0.grp.position.y - -0.5) > 1e-3)
      throw new Error('M36: mpAnimalsPresent moved the shark out of its lerped depth');
    if (!Number.isFinite(m0.legs[0].rotation.x))
      throw new Error('M36: the monkey leg animation is not finite');

    /* 9. back to single-player: the local sim steps again */
    api.close();
    mpApi = null;
    const after = { x: m0.x, z: m0.z };
    updateAnimals(0.1, 'early');
    updateAnimals(0.1, 'late');
    if (m0.x === after.x && m0.z === after.z)
      throw new Error('M36: single-player updateAnimals stopped stepping after disconnect');
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
    let ai = 0;
    for (const sp of animals)
      for (const e of sp.pop) {
        const rec = saveAnimals[ai++];
        e.x = rec.x; e.z = rec.z; e.dir = rec.dir; e.n = rec.n; e.alive = rec.alive;
        if (rec.meshCount !== undefined && e.mesh) e.mesh.count = rec.meshCount;
        if (e.grp) {
          e.grp.position.x = rec.gx; e.grp.position.y = rec.gy;
          e.grp.position.z = rec.gz; e.grp.rotation.y = rec.ry;
          e.grp.visible = rec.vis;
        }
      }
    gameMin = saveGameMin;
    mpTimeAdopt = 0;
    started = saveStarted; dead = saveDead; won = saveWon; onRaft = saveOnRaft;
  }
}

/* ---- M37: the server owns the clock and the weather schedule. Every tab
   (the authority INCLUDED) adopts tick bit4; tick bit5 carries the server
   weather state + the active storm seg's event list, which updateWeather
   fires (per-index done set, keyed by list identity) instead of the local
   segs. effectiveWeather() adopts the server state (debug pin still wins).
   Without ?mp= the local schedule is authoritative. */
{
  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };

  let __t37 = 4e8;   /* far past every earlier block's lastT (negative-dt guard) */
  const pump = (n) => {   /* M37-local: the driver's pump is out of scope here */
    for (let i = 0; i < n; i++) {
      const cb = globalThis.__rafCb; globalThis.__rafCb = null;
      __t37 += 16.7; globalThis.__audioTime += 0.0167;
      if (cb) cb(__t37);
    }
  };
  const saveGameMin = gameMin, saveStarted = started, saveDead = dead;
  const saveWon = won, saveOnRaft = onRaft;
  const saveForced = weather.forced, saveLastState = weather.lastState, saveLastMin = weather.lastMin;
  const saveVis = { cloudy: weather.vis.cloudy, rain: weather.vis.rain, storm: weather.vis.storm };
  const saveFlash = stormFlash, saveBoltT = stormBoltT, saveBoltVis = bolt.visible;
  const saveBoltPos = { x: bolt.position.x, y: bolt.position.y, z: bolt.position.z };
  const saveFires = fires.slice(), saveItems = items.slice();
  const saveCooking = fires.map((f) => f.cooking);
  /* the M25 round-trip test deliberately left a string cooking on the fire;
     normalize so updateFires can run, restore it on the way out */
  for (const f of fires) if (typeof f.cooking === 'string') f.cooking = null;
  const saveStats = Object.assign({}, stats);
  const saveLearned = new Set(learned);
  /* earlier blocks may have shaken these palms dry - guarantee stock */
  palms[10].cocos = Math.max(palms[10].cocos, 2);
  palms[42].cocos = Math.max(palms[42].cocos, 2);
  palms[5].cocos = Math.max(palms[5].cocos, 2);
  const saveCocos = { 5: palms[5].cocos, 10: palms[10].cocos, 42: palms[42].cocos };
  const saveRig = { x: rig.position.x, y: rig.position.y, z: rig.position.z };

  const sendTick = (time, wstate, evs) => {
    const parts = [];
    const head = new Uint8Array(2);
    let flags = 0;
    if (time !== undefined) flags |= 1 << 4;
    if (wstate !== undefined) flags |= 1 << 5;
    head[0] = 27; head[1] = flags;
    parts.push(head);
    if (time !== undefined) {
      const tb = new Uint8Array(4);
      new DataView(tb.buffer).setFloat32(0, time, true);
      parts.push(tb);
    }
    if (wstate !== undefined) {
      /* M37: [u8 state][u32 nEvents LE][nEvents * 13B: u8 kind, f32 t, f32 a, f32 b] */
      const wb = new Uint8Array(5 + evs.length * 13);
      wb[0] = wstate;
      new DataView(wb.buffer).setUint32(1, evs.length, true);
      let o = 5;
      for (const ev of evs) {
        wb[o] = ev.kind;
        new DataView(wb.buffer).setFloat32(o + 1, ev.t, true);
        new DataView(wb.buffer).setFloat32(o + 5, ev.a, true);
        new DataView(wb.buffer).setFloat32(o + 9, ev.b, true);
        o += 13;
      }
      parts.push(wb);
    }
    const total = parts.reduce((s, q) => s + q.length, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const q of parts) { buf.set(q, off); off += q.length; }
    wsInstances[0].onmessage({ data: buf.buffer.slice(0) });
  };

  try {
    /* 1. single-player: the local schedule is authoritative (no server) */
    if (mpApi !== null) throw new Error('M37: mpApi leaked in from the M36 block');
    weather.forced = null;
    if (effectiveWeather() !== weatherStateAt(gameMin))
      throw new Error('M37: without a server the local schedule must be authoritative');

    /* 2. connect + join success (the M27/M35/M36 FakeWS pattern) */
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M37Tester', inWater: () => false,
      /* the game's own onTime: adopt the server clock (every tab, authority included) */
      onTime: (gm) => { if (Number.isFinite(gm)) mpTimeAdopt = gm; },
    });
    mpApi = api;
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 110, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 110 || api.connected() !== true)
      throw new Error('M37: the join success was not parsed');

    /* 3. the SERVER clock is adopted by EVERY tab (M40) - bit4
       (the server's own clock) snaps it */
    started = true; dead = false;
    sendTick(512.25, 0, []);
    if (!api.weather || api.weather.state !== 'clear' || api.weather.events.length !== 0)
      throw new Error('M37: the bit5 section did not parse to a clear weather state');
    pump(1);
    if (Math.abs(gameMin - 512.25) > 1e-4)
      throw new Error('M37: the clock did not adopt the server value: ' + gameMin);
    if (effectiveWeather() !== 'clear')
      throw new Error('M37: effectiveWeather did not adopt the server state');

    /* 4. storm beats: the server's storm seg event list (the seed-1337
       first-storm values, exactly what the server relays) fires drops and
       the strike as the clock passes their t - each exactly once */
    const stormEvs = [
      { kind: 1, t: 1143.6854285947168, a: 10, b: 0 },
      { kind: 1, t: 1155.154038978248, a: 42, b: 0 },
      { kind: 0, t: 1168.5172978735109, a: 111.61525450549635, b: -71.26843317778255 },
    ];
    rig.position.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
    sendTick(1140.0, 3, stormEvs);
    if (api.weather.state !== 'storm' || api.weather.events.length !== 3)
      throw new Error('M37: the storm section did not parse: ' + JSON.stringify(api.weather));
    if (effectiveWeather() !== 'storm')
      throw new Error('M37: effectiveWeather must adopt the server storm');
    pump(1);
    if (Math.abs(gameMin - 1140.0) > 1e-4)
      throw new Error('M37: the clock did not snap to the storm start: ' + gameMin);
    if (palms[10].cocos !== saveCocos[10])
      throw new Error('M37: the first drop fired before its t');

    /* 5. clock passes t1: the palm-10 drop fires once */
    sendTick(1144.0, 3, stormEvs);
    pump(1);
    if (palms[10].cocos !== saveCocos[10] - 1)
      throw new Error('M37: the palm-10 drop did not fire: ' + palms[10].cocos);
    if (items.length !== saveItems.length + 1)
      throw new Error('M37: the drop did not spawn a falling coconut');
    pump(2);   // same list, clock still past t1: no second fire
    if (palms[10].cocos !== saveCocos[10] - 1)
      throw new Error('M37: the palm-10 drop fired twice');

    /* 6. clock passes t2: the palm-42 drop fires */
    sendTick(1156.0, 3, stormEvs);
    pump(1);
    if (palms[42].cocos !== saveCocos[42] - 1)
      throw new Error('M37: the palm-42 drop did not fire');

    /* 7. clock passes t3: the strike fires (flash + bolt at the server x,z)
       and does NOT fire again on the following frames */
    sendTick(1169.0, 3, stormEvs);
    pump(1);
    if (stormFlash < 0.5)
      throw new Error('M37: the strike did not flash: ' + stormFlash);
    if (bolt.visible !== true)
      throw new Error('M37: the bolt is not visible after the strike');
    if (Math.abs(bolt.position.x - 111.61525450549635) > 1e-3 ||
        Math.abs(bolt.position.z + 71.26843317778255) > 1e-3)
      throw new Error('M37: the bolt is not at the server strike position');
    pump(3);
    if (palms[42].cocos !== saveCocos[42] - 1 || palms[10].cocos !== saveCocos[10] - 1)
      throw new Error('M37: the earlier drops re-fired after the strike');

    /* 8. a NEW server list (the storm seg advanced) resets the done set:
       a new list identity re-fires its own events from scratch */
    sendTick(1170.0, 3, [{ kind: 1, t: 1169.5, a: 5, b: 0 }]);
    pump(1);
    if (palms[5].cocos !== saveCocos[5] - 1)
      throw new Error('M37: the new list drop did not fire (done set not reset)');
    pump(2);
    if (palms[5].cocos !== saveCocos[5] - 1)
      throw new Error('M37: the new list drop fired twice');

    /* 9. M40: the type-32 clock upload is retired (server clock, bit4)
       - the 30 Hz loop sends exactly the type-26 state frame */
    {
      const sentN = wsInstances[0].sent.length;
      intervals[0].fn();
      const tail = wsInstances[0].sent.slice(sentN)
        .map((d) => (d instanceof Uint8Array ? d : new Uint8Array(d)));
      if (tail.length !== 1 || tail[0][0] !== 26 || tail[0].length !== 1 + 21)
        throw new Error('M37: the 30 Hz loop is not state-only: ' + tail.map((d) => d[0]).join(','));
    }

    /* 10. back to single-player: the local schedule is authoritative again */
    api.close();
    mpApi = null;
    if (effectiveWeather() !== weatherStateAt(gameMin))
      throw new Error('M37: after disconnect the local schedule must win again');

  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
    gameMin = saveGameMin;
    mpTimeAdopt = 0;
    started = saveStarted; dead = saveDead; won = saveWon; onRaft = saveOnRaft;
    weather.forced = saveForced;
    weather.lastState = saveLastState; weather.lastMin = saveLastMin;
    weather.vis.cloudy = saveVis.cloudy; weather.vis.rain = saveVis.rain; weather.vis.storm = saveVis.storm;
    stormFlash = saveFlash; stormBoltT = saveBoltT; bolt.visible = saveBoltVis;
    bolt.position.set(saveBoltPos.x, saveBoltPos.y, saveBoltPos.z);
    fires.length = 0; fires.push(...saveFires);
    fires.forEach((f, i) => { f.cooking = saveCooking[i]; });
    items.length = 0; items.push(...saveItems);
    Object.assign(stats, saveStats);
    learned.clear(); for (const k of saveLearned) learned.add(k);
    palms[5].cocos = saveCocos[5]; palms[10].cocos = saveCocos[10]; palms[42].cocos = saveCocos[42];
    rig.position.set(saveRig.x, saveRig.y, saveRig.z);
  }
}

/* ---- M38: server player authority. The server is the single source of
   truth for player transforms: every tab (the mover's OWN tab included)
   reconciles its local rig to the server's stamped (accepted) transform via
   mpSelfFrame - first-sight snap, >30u divergence snap (server-side
   rollback), otherwise the M28 presence lerp k = 1-exp(-dt*15) with
   shortest-arc yaw. Local WASD/rowing keeps predicting between ticks; the
   30 Hz stamp wins. No code path treats the local transform as authoritative
   over the server's. The M29/M30 gates (world lock, the authority-gated
   type-29 upload) and the authorityPublicId wire field stay until M39/M40. */
{
  /* 1. single-player invariants: no mpApi -> no self-adoption */
  if (mpApi !== null) throw new Error('M38: mpApi leaked in from the M37 block');
  {
    const x = rig.position.x, y = rig.position.y, z = rig.position.z, ry = rig.rotation.y;
    mpSelfFrame(0.016);   /* must be a silent no-op (no mpApi) */
    if (rig.position.x !== x || rig.position.y !== y || rig.position.z !== z || rig.rotation.y !== ry)
      throw new Error('M38: mpSelfFrame touched the rig without ?mp=');
  }

  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };

  let __t38 = 4.1e8;   /* far past every earlier block's lastT (negative-dt guard) */
  const pump = (n) => {
    for (let i = 0; i < n; i++) {
      const cb = globalThis.__rafCb; globalThis.__rafCb = null;
      __t38 += 16.7; globalThis.__audioTime += 0.0167;
      if (cb) cb(__t38);
    }
  };

  const saveStarted = started, saveDead = dead, saveWon = won, saveOnRaft = onRaft;
  const saveRig = { x: rig.position.x, y: rig.position.y, z: rig.position.z, ry: rig.rotation.y };
  /* an earlier block may have left a string cooking on the fire; normalize
     so updateFires (run by every pumped frame) can run, restore it in finally */
  const saveFires = fires.slice();
  const saveCooking = fires.map((f) => f.cooking);
  for (const f of fires) if (typeof f.cooking === 'string') f.cooking = null;

  /* tick builder: [27][u8 flags][u32 authority LE], then a bit0 players
     section (u32 tickId, u32 count, count * 21B state) when players !== null */
  const sendPlayersTick = (tickId, players) => {
    const parts = [];
    const head = new Uint8Array(2);
    head[0] = 27; head[1] = players ? 1 : 0;
    parts.push(head);
    if (players) {
      const b = new Uint8Array(8 + players.length * 21);
      const dv = new DataView(b.buffer);
      dv.setUint32(0, tickId, true);
      dv.setUint32(4, players.length, true);
      let o = 8;
      for (const p of players) {
        dv.setUint32(o, p.id, true);
        dv.setFloat32(o + 4, p.x, true);
        dv.setFloat32(o + 8, p.y, true);
        dv.setFloat32(o + 12, p.z, true);
        dv.setFloat32(o + 16, p.yaw, true);
        b[o + 20] = p.u ? 1 : 0;
        o += 21;
      }
      parts.push(b);
    }
    const total = parts.reduce((s, q) => s + q.length, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const q of parts) { buf.set(q, off); off += q.length; }
    wsInstances[0].onmessage({ data: buf.buffer.slice(0) });
  };

  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M38Tester', inWater: () => false,
    });
    mpApi = api;
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 110, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 110 || api.connected() !== true)
      throw new Error('M38: the join success was not parsed');
    if (api.self !== null)
      throw new Error('M38: self must be null before the first own tick entry');

    /* freeze the local sim's rig writes: no WASD input (started false),
       not aboard, ground handling off (won true) - so during this block the
       rig is written ONLY by mpSelfFrame */
    started = false; dead = false; won = true; onRaft = false;

    /* 2. a tick bit0 carries the SERVER's stamped transform for THIS tab
       (own publicId 110) and a second player 220: mpApi.self is populated
       from the stamp; remotes still excludes self but keeps 220 */
    const selfStamp = { id: 110, x: 50, y: 2, z: -30, yaw: 2.4 };
    const other = { id: 220, x: 80, y: 0, z: 90, yaw: 0.7 };
    sendPlayersTick(7, [selfStamp, other]);
    if (!api.self)
      throw new Error('M38: mpApi.self was not populated from the own tick entry');
    if (Math.abs(api.self.x - 50) > 1e-3 || Math.abs(api.self.y - 2) > 1e-3 ||
        Math.abs(api.self.z + 30) > 1e-3 || Math.abs(api.self.yaw - 2.4) > 1e-3)
      throw new Error('M38: the stamped self transform is wrong: ' + JSON.stringify(api.self));
    if (api.remotes.has(110) || api.remotes.size !== 1 || !api.remotes.has(220))
      throw new Error('M38: the self entry leaked into remotes or 220 was dropped');

    /* 3. first sight: the rig SNAPS to the server stamp */
    rig.position.set(5, 1, 5);
    rig.rotation.y = 0.3;
    pump(1);
    if (Math.abs(rig.position.x - 50) > 1e-3 || Math.abs(rig.position.y - 2) > 1e-3 ||
        Math.abs(rig.position.z + 30) > 1e-3 || Math.abs(rig.rotation.y - 2.4) > 1e-3)
      throw new Error('M38: first sight did not snap the rig to the stamp: ' +
        rig.position.x + ', ' + rig.position.y + ', ' + rig.position.z + ', ' + rig.rotation.y);

    /* 4. divergence <=30u: the local prediction lerps back to the stamp
       (k = 1-exp(-dt*15); 60 frames ~= 1s closes 1-exp(-15) of the gap) */
    rig.position.set(52, 2, -28);
    pump(60);
    if (Math.abs(rig.position.x - 50) > 1e-3 || Math.abs(rig.position.y - 2) > 1e-3 ||
        Math.abs(rig.position.z + 30) > 1e-3)
      throw new Error('M38: the rig did not converge to the stamp: ' +
        rig.position.x + ', ' + rig.position.y + ', ' + rig.position.z);

    /* 5. divergence >30u (a rejected teleport rolled back server-side):
       the rig SNAPS to the stamp - no client-authority fallback */
    rig.position.set(100, 2, -30);
    pump(1);
    if (Math.abs(rig.position.x - 50) > 1e-3 || Math.abs(rig.position.y - 2) > 1e-3 ||
        Math.abs(rig.position.z + 30) > 1e-3)
      throw new Error('M38: the >30u divergence did not snap back to the stamp: ' +
        rig.position.x + ', ' + rig.position.y + ', ' + rig.position.z);

    /* 6. M40: the 30 Hz loop sends EXACTLY the type-26 state frame
       (21B + type byte) - the type-29 animal upload and the type-32
       clock upload are retired */
    {
      const sentN = wsInstances[0].sent.length;
      intervals[0].fn();
      const sent = wsInstances[0].sent.slice(sentN)
        .map((d) => (d instanceof Uint8Array ? d : new Uint8Array(d)));
      if (sent.length !== 1 || sent[0][0] !== 26 || sent[0].length !== 1 + 21)
        throw new Error('M38: the 30 Hz loop is not state-only: ' + sent.map((d) => d[0]).join(','));
    }
    sendPlayersTick(8, [selfStamp]);
    {
      const sentN = wsInstances[0].sent.length;
      intervals[0].fn();
      const sent = wsInstances[0].sent.slice(sentN)
        .map((d) => (d instanceof Uint8Array ? d : new Uint8Array(d)));
      if (sent.length !== 1 || sent[0][0] !== 26)
        throw new Error('M38: the loop must keep uploading the type-26 state');
    }

    /* 7. disconnect: the server stamp is gone, local sim is authoritative
       again */
    api.close();
    if (api.self !== null)
      throw new Error('M38: the server stamp must clear on disconnect');
    mpApi = null;
    {
      const x = rig.position.x, y = rig.position.y, z = rig.position.z, ry = rig.rotation.y;
      mpSelfFrame(0.016);
      if (rig.position.x !== x || rig.position.y !== y || rig.position.z !== z || rig.rotation.y !== ry)
        throw new Error('M38: mpSelfFrame must be inert after disconnect');
    }
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
    started = saveStarted; dead = saveDead; won = saveWon; onRaft = saveOnRaft;
    rig.position.set(saveRig.x, saveRig.y, saveRig.z);
    rig.rotation.y = saveRig.ry;
    mpSelfSeen = false;
    fires.length = 0; fires.push(...saveFires);
    fires.forEach((f, i) => { f.cooking = saveCooking[i]; });
    for (const av of mpAvatars.values()) scene.remove(av.grp);
    mpAvatars.clear();
  }
}

/* ---- M39: the server applies + validates world edits against its world
   store. Server side: see ServerBase (WorldStore gtests + the JS-reference
   growth byte-identity ctest + smoke/e2e-edits.mjs against the live relay).
   Client side: the type-34 MSG_VIVS_EDIT_REJECT wire message (a REJECTED
   edit is never relayed - the sender alone gets [34][23B edit][u16 len LE]
   [utf8 reason]) is parsed and surfaced through onEditReject, malformed
   variants are dropped silently, and the type-28 uplink is untouched. */
{
  if (mpApi !== null) throw new Error('M39: mpApi leaked in from the M38 block');

  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };

  /* build [34][23B VivsWorldEdit][u16 reasonLen LE][utf8 reason] */
  const buildReject = (publicId, entityIndex, kind, payload0, reason) => {
    const rb = new TextEncoder().encode(reason);
    const b = new Uint8Array(1 + 23 + 2 + rb.length);
    b[0] = 34;
    const dv = new DataView(b.buffer);
    dv.setUint32(1, publicId, true);
    dv.setUint32(5, entityIndex, true);
    b[9] = kind; b[10] = 0; b[11] = payload0;
    dv.setUint16(1 + 23, rb.length, true);
    b.set(rb, 1 + 23 + 2);
    return b;
  };

  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    const rejections = [];
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M39Tester', inWater: () => false,
      onEditReject: (pid, eidx, kind, reason) => rejections.push({ pid, eidx, kind, reason }),
    });
    mpApi = api;
    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 110, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 110 || api.connected() !== true)
      throw new Error('M39: the join success was not parsed');

    /* 1. a valid type-34 (the server rejected a palm shake: the palm was
       already dry) surfaces through onEditReject with the parsed fields */
    wsInstances[0].onmessage({
      data: buildReject(110, 7, 0, 5, 'palm 7 has 0 coconuts').buffer.slice(0),
    });
    if (rejections.length !== 1)
      throw new Error('M39: the type-34 reject was not dispatched');
    if (rejections[0].pid !== 110 || rejections[0].eidx !== 7 || rejections[0].kind !== 0)
      throw new Error('M39: the reject fields are wrong: ' + JSON.stringify(rejections[0]));
    if (rejections[0].reason !== 'palm 7 has 0 coconuts')
      throw new Error('M39: the reject reason was not decoded: ' + rejections[0].reason);

    /* 2. a camp-spot reject (utf8 reason, longer) decodes cleanly */
    wsInstances[0].onmessage({
      data: buildReject(110, 0, 2, 0, 'camp spot invalid: a palm stands in the way').buffer.slice(0),
    });
    if (rejections.length !== 2 || rejections[1].kind !== 2)
      throw new Error('M39: the second reject was not dispatched');
    if (rejections[1].reason !== 'camp spot invalid: a palm stands in the way')
      throw new Error('M39: the second reason was not decoded: ' + rejections[1].reason);

    /* 3. malformed variants are dropped silently: truncated edit, reason
       length beyond the packet, empty packet */
    const good = buildReject(110, 3, 3, 0, 'shelter already built');
    const trunc = good.slice(0, 25).buffer.slice(0);          // mid-edit
    const overLen = buildReject(110, 3, 3, 0, 'no').slice();  // len 2 -> pad u16 +2
    overLen[1 + 23] += 2;
    wsInstances[0].onmessage({ data: trunc });
    wsInstances[0].onmessage({ data: overLen.buffer.slice(0) });
    wsInstances[0].onmessage({ data: new Uint8Array([34, 0]).buffer.slice(0) });
    if (rejections.length !== 2)
      throw new Error('M39: a malformed type-34 reached the hook');

    /* 4. the type-28 edit uplink is untouched (24B: type + 23B edit) */
    const sentOk = api.sendEdit(0, 7, new Uint8Array(12));
    if (!sentOk) throw new Error('M39: sendEdit stopped working');
    const up = wsInstances[0].sent.slice(-1)
      .map((d) => (d instanceof Uint8Array ? d : new Uint8Array(d)))
      .find((d) => d[0] === 28);
    if (!up || up.length !== 1 + 23 || new DataView(up.buffer, up.byteOffset).getUint32(5, true) !== 7)
      throw new Error('M39: the type-28 edit upload is gone or malformed');

    api.close();
    mpApi = null;
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
  }
}

/* ---- M40: protocol v2 hardening + full v2 relay removal (client side).
   Zero client authority: the authority concept (authorityPublicId wire
   field, authorityId tracking, the world-lock, the type-29 animal upload,
   the type-32 clock upload) is GONE from the client. Every tab uploads
   state + edits; the server owns the clock, the weather, the animal sim,
   and edit validation. Tick sections now start at byte 2 (flags byte only). */
{
  /* 1. the retired client-authority surface is gone from the page */
  if (typeof mpWorldLocked !== 'undefined')
    throw new Error('M40: mpWorldLocked must be removed from the page');
  if (typeof mpWorldLockedGuard !== 'undefined')
    throw new Error('M40: mpWorldLockedGuard must be removed from the page');
  if (typeof mpCollectAnimals !== 'undefined')
    throw new Error('M40: mpCollectAnimals must be removed from the page');

  const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
  const realSetTimeout = globalThis.setTimeout, realWebSocket = globalThis.WebSocket;
  const intervals = [], timeouts = [], wsInstances = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; wsInstances.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  }
  FakeWS.OPEN = 1;
  globalThis.WebSocket = FakeWS;
  globalThis.setInterval = (fn, ms) => { const h = { fn, ms, on: true }; intervals.push(h); return h; };
  globalThis.clearInterval = h => { if (h) h.on = false; };
  globalThis.setTimeout = (fn, ms) => { const h = { fn, ms, on: true }; timeouts.push(h); return h; };

  const saveGameMin = gameMin, saveStarted = started, saveDead = dead;
  const saveWon = won, saveOnRaft = onRaft;
  const saveCocos = palms.map((q) => q.cocos);
  const saveItems = items.length;
  const saveCooking = fires.map((f) => f.cooking);
  for (const f of fires) if (typeof f.cooking === 'string') f.cooking = null;
  const palmIdx = palms.findIndex((q) => q.cocos === 2);
  if (palmIdx < 0) throw new Error('M40: no palm with 2 coconuts to shake');
  const p0 = palms[palmIdx];

  try {
    const mp = await import(new URL('../lib/mp.js', import.meta.url).href);
    let timeSeen = null;
    let editSeen = null;
    const api = mp.attachMultiplayer({
      rig, url: '127.0.0.1:3003', seed: 1337, displayName: 'M40Tester', inWater: () => false,
      onEdit: (pid, eidx, kind, action, payload) => {
        editSeen = { pid, eidx, kind, action, payload };
        mpApplyWorldEdit(kind, eidx, payload);
      },
      onTime: (gm) => { if (Number.isFinite(gm)) timeSeen = gm; },
    });
    mpApi = api;

    /* 2. no authority API surface on the module (types 29/32 retired) */
    if ('authorityId' in api) throw new Error('M40: api.authorityId must be gone');
    if (typeof api.isAuthority === 'function') throw new Error('M40: api.isAuthority must be gone');
    if (typeof mp.MSG_VIVS_ANIMALS === 'number' || 'MSG_VIVS_ANIMALS' in mp)
      throw new Error('M40: MSG_VIVS_ANIMALS must be retired');
    if ('MSG_VIVS_TIME' in mp) throw new Error('M40: MSG_VIVS_TIME must be retired');

    wsInstances[0].readyState = 1;
    wsInstances[0].onopen();
    const jsBuf = new Uint8Array(5);
    new DataView(jsBuf.buffer).setUint32(1, 110, false);
    jsBuf[0] = 8;
    wsInstances[0].onmessage({ data: jsBuf.buffer.slice(0) });
    if (api.publicId !== 110 || api.connected() !== true)
      throw new Error('M40: the join success was not parsed');

    /* 3. the 30 Hz uplink is state-only: exactly one type-26 frame, never
       29 (animals, server-sim) or 32 (clock, server-owned) */
    {
      const sentN = wsInstances[0].sent.length;
      intervals[0].fn();
      const tail = wsInstances[0].sent.slice(sentN)
        .map((d) => (d instanceof Uint8Array ? d : new Uint8Array(d)));
      if (tail.length !== 1 || tail[0][0] !== 26 || tail[0].length !== 1 + 21)
        throw new Error('M40: the uplink is not state-only: ' + tail.map((d) => d[0]).join(','));
    }

    /* 4. tick wire v2: sections start at byte 2 - [27][flags][...]. A
       bit1 edits + bit4 time tick: the edit applies for THIS tab's
       sender id AND the server clock is adopted by this same tab (no
       authority self-exclusion) */
    {
      const edit = new Uint8Array(23);
      new DataView(edit.buffer).setUint32(0, 110, true);   /* sender = this tab */
      new DataView(edit.buffer).setUint32(4, p0.idx, true);
      edit[8] = 0;                                          /* kind palm */
      edit[9] = 0;                                          /* action */
      edit[10] = 1;                                         /* payload[0]: new coco count 1 */
      const b = new Uint8Array(2 + 4 + 23 + 4);
      b[0] = 27; b[1] = 0x12;
      new DataView(b.buffer).setUint32(2, 1, true);         /* 1 edit, right after flags */
      b.set(edit, 6);
      new DataView(b.buffer).setFloat32(6 + 23, 733.5, true);
      wsInstances[0].onmessage({ data: b.buffer.slice(0) });
      if (!editSeen || editSeen.eidx !== p0.idx || editSeen.kind !== 0)
        throw new Error('M40: the bit1 edit section (offset 2) was not parsed');
      if (p0.cocos !== 1)
        throw new Error('M40: the relayed edit was not applied: ' + p0.cocos);
      if (timeSeen === null || Math.abs(timeSeen - 733.5) > 1e-4)
        throw new Error('M40: the bit4 clock (offset 2) was not adopted: ' + timeSeen);
    }

    api.close();
    mpApi = null;
  } finally {
    globalThis.WebSocket = realWebSocket;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.setTimeout = realSetTimeout;
    mpApi = null;
    gameMin = saveGameMin;
    started = saveStarted; dead = saveDead; won = saveWon; onRaft = saveOnRaft;
    palms.forEach((q, i) => { q.cocos = saveCocos[i]; });
    items.length = saveItems;
    fires.forEach((f, i) => { f.cooking = saveCooking[i]; });
    for (const av of mpAvatars.values()) scene.remove(av.grp);
    mpAvatars.clear();
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
