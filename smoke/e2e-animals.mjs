// M35 E2E: the live relay (ServerBase VibeSurvivorsPlugin, port 3003) must
// carry the SERVER-SIMULATED animal snapshot in every tick's bit2 section:
// exactly 28 entries (5 fish, 15 crabs, 3 tigers, 5 gulls; slots
// {0..4, 64..78, 128..130, 192..196}), byte-identical across all tabs, and
// evolving over time (the server owns the sim clock; nothing local drives
// it). Data-level convergence, the M27‒M34 precedent (no chrome).
//
// Usage:
//   # from ServerBase (branch feature/auto-milestones-20260914-215319):
//   #   cmake --build build-linux --target VibeSurvivorsPlugin
//   #   ./build-linux/VibeSurvivorsPlugin/VibeSurvivorsPlugin   # stays up on :3003
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node smoke/e2e-animals.mjs [wss://127.0.0.1:3003]
//
// The E2E never starts the server. Node 22+ global WebSocket; the self-
// signed cert needs NODE_TLS_REJECT_UNAUTHORIZED=0.

const url = process.argv[2] ?? 'wss://127.0.0.1:3003';

const TYPE_JOIN = 3;
const TYPE_JOIN_SUCCESS = 8;
const TYPE_JOIN_ERROR = 255;
const TYPE_TICK = 27;

const TICK_PLAYERS = 1 << 0;
const TICK_EDITS = 1 << 1;
const TICK_ANIMALS = 1 << 2;
const STATE_BYTES = 21;
const EDIT_BYTES = 23;
const ANIMAL_BYTES = 24;

const EXPECTED_SLOTS = [
  ...[0, 1, 2, 3, 4],
  ...Array.from({ length: 15 }, (_, i) => 64 + i),
  128, 129, 130,
  ...Array.from({ length: 5 }, (_, i) => 192 + i),
];
const EXPECTED_TYPE = (slot) =>
  slot < 64 ? 0 : slot < 128 ? 1 : slot < 192 ? 2 : 3;

/* Extract the animals-section payload ([u32 count][count*24B]) from a raw
 * tick, walking the fixed section order (players, edits, animals). */
function animalsSection(buf) {
  const flags = buf[1];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 6;
  if (flags & TICK_PLAYERS) {
    if (off + 8 > buf.length) return null;
    const count = dv.getUint32(off + 4, true);
    off += 8 + count * STATE_BYTES;
  }
  if (flags & TICK_EDITS) {
    if (off + 4 > buf.length) return null;
    const count = dv.getUint32(off, true);
    off += 4 + count * EDIT_BYTES;
  }
  if (!(flags & TICK_ANIMALS)) return null;
  if (off + 4 > buf.length) return null;
  const count = dv.getUint32(off, true);
  const end = off + 4 + count * ANIMAL_BYTES;
  if (end > buf.length) return null;
  return { buf: buf.slice(off, end), count };
}

function assertRoster(tag, sec) {
  const dv = new DataView(sec.buf.buffer, sec.buf.byteOffset, sec.buf.byteLength);
  if (sec.count !== 28)
    throw new Error(`${tag}: the server snapshot has ${sec.count} entries, expected 28`);
  for (let i = 0; i < sec.count; i++) {
    const o = 4 + i * ANIMAL_BYTES;
    const slot = dv.getUint16(o, true);
    const type = sec.buf[o + 2];
    const x = dv.getFloat32(o + 4, true);
    const y = dv.getFloat32(o + 8, true);
    const z = dv.getFloat32(o + 12, true);
    const yaw = dv.getFloat32(o + 16, true);
    const idx = EXPECTED_SLOTS.indexOf(slot);
    if (idx < 0)
      throw new Error(`${tag}: unexpected slot ${slot} in the server snapshot`);
    if (idx !== i)
      throw new Error(`${tag}: snapshot entry ${i} is not in roster order (slot ${slot})`);
    if (type !== EXPECTED_TYPE(slot))
      throw new Error(`${tag}: slot ${slot} has wrong type ${type}`);
    for (const v of [x, y, z, yaw])
      if (!Number.isFinite(v))
        throw new Error(`${tag}: slot ${slot} has a non-finite transform`);
  }
}

const sameBytes = (a, b) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

class Client {
  constructor(tag) {
    this.tag = tag;
    this.ws = null;
    this.publicId = null;
    this.joinError = null;
    this.sections = [];   // {buf, t} per animals-bearing tick, in order
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const fail = e => reject(new Error(`${this.tag}: connect failed: ${e}`));
      ws.onopen = () => {
        ws.send(new Uint8Array([TYPE_JOIN,
          ...new TextEncoder().encode(`${crypto.randomUUID()}|2|1337`)]));
        resolve();
      };
      ws.onerror = fail;
      ws.onmessage = e => {
        const buf = new Uint8Array(e.data);
        const type = buf[0];
        if (type === TYPE_JOIN_SUCCESS)
          this.publicId = new DataView(buf.buffer).getUint32(1, false);
        else if (type === TYPE_JOIN_ERROR)
          this.joinError = new TextDecoder().decode(buf.subarray(1));
        else if (type === TYPE_TICK) {
          const sec = animalsSection(buf);
          if (sec) {
            assertRoster(this.tag, sec);
            this.sections.push({ buf: sec.buf, t: Date.now() });
          }
        }
      };
    });
  }
  waitFor(fn, what, ms = 20000) {
    return new Promise((resolve, reject) => {
      if (fn()) return resolve();
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (fn()) { clearInterval(iv); resolve(); }
        else if (Date.now() - t0 > ms) {
          clearInterval(iv);
          reject(new Error(`${this.tag}: timed out waiting for ${what}`));
        }
      }, 25);
    });
  }
  close() { this.ws?.close(); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 1. three tabs join the live relay with protocol v2. */
const a = new Client('A');
const b = new Client('B');
const c = new Client('C');
await Promise.all([a.connect(), b.connect(), c.connect()]);
for (const cl of [a, b, c])
  await cl.waitFor(() => cl.publicId !== null, 'JOIN_SUCCESS');
console.log(`A/B/C joined as publicId ${a.publicId}/${b.publicId}/${c.publicId}`);

/* 2. every tick carries the 28-entry snapshot (assertRoster ran on receipt);
 *    let each tab accumulate enough ticks to compare across the ~2 s span. */
const MIN_SECTIONS = 65;   /* 30 Hz relay: 65 ticks > 2 s span */
for (const cl of [a, b, c])
  await cl.waitFor(() => cl.sections.length >= MIN_SECTIONS,
    MIN_SECTIONS + ' animal snapshots');

/* 3. cross-tab byte-identity: the relay broadcasts the same animals section
 *    to every tab; several snapshots must be byte-identical across A, B, C. */
const bSet = new Map();
for (const s of b.sections)
  if (!bSet.has(s.buf.toString())) bSet.set(s.buf.toString(), s.buf);
const cSet = new Map();
for (const s of c.sections)
  if (!cSet.has(s.buf.toString())) cSet.set(s.buf.toString(), s.buf);
let common = 0;
for (const s of a.sections) {
  const inB = bSet.get(s.buf.toString());
  if (!inB) continue;
  const inC = cSet.get(s.buf.toString());
  if (!inC) continue;
  if (sameBytes(s.buf, inB) && sameBytes(s.buf, inC)) common++;
}
if (common < 5)
  throw new Error(`only ${common} snapshots were byte-identical across A/B/C, expected >= 5`);
console.log(`${common} animal snapshots byte-identical across all three tabs`);

/* 4. the sim EVOLVES: on tab A, two snapshots ~2 s apart must differ in at
 *    least one transform (the server is stepping its own clock). */
let evolved = false, evolvedPair = null;
for (let i = 0; i < a.sections.length && !evolved; i++)
  for (let j = i + 1; j < a.sections.length; j++) {
    if (a.sections[j].t - a.sections[i].t >= 2000) {
      if (!sameBytes(a.sections[i].buf, a.sections[j].buf)) {
        evolved = true;
        evolvedPair = [i, j];
      }
      break;   // first ~2 s span is the reference
    }
  }
if (!evolved)
  throw new Error('tab A: the animal snapshot did not change over a 2 s span');
console.log(`tab A: the snapshot evolved between snapshot #${evolvedPair[0]} and #${evolvedPair[1]}`);

a.close(); b.close(); c.close();
console.log('E2E_OK ‒ M35: 28-entry server animal snapshot, byte-identical across 3 tabs, evolving over time');
process.exit(0);
