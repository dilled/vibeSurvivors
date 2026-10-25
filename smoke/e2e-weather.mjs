// M37 E2E: the live relay (ServerBase VibeSurvivorsPlugin, port 3003) must
// carry the SERVER-OWNED clock (bit4) and weather schedule (bit5) in every
// tick's tail, BYTE-IDENTICAL across all tabs (the server builds one relay
// tick and sends it to everyone), with the clock monotonically advancing
// (the server steps its own sim clock; no client drives it).
// Data-level convergence, the M27-M36 precedent (no chrome).
//
// The storm beats themselves (firing the server's event list) are covered by
// the M37 block in smoke/run.mjs; this E2E proves the wire carries the
// server clock + weather identically to every tab.
//
// Usage:
//   # from ServerBase (branch feature/auto-milestones-20260914-215319):
//   #   cmake --build build-linux --target VibeSurvivorsPlugin
//   #   ./build-linux/VibeSurvivorsPlugin/VibeSurvivorsPlugin   # stays up on :3003
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node smoke/e2e-weather.mjs [wss://127.0.0.1:3003]
//
// The E2E never starts the server. Node 22+ global WebSocket; the self-
// signed cert needs NODE_TLS_REJECT_UNAUTHORIZED=0.

const url = process.argv[2] ?? 'wss://127.0.0.1:3003';

const TYPE_JOIN = 3;
const TYPE_JOIN_SUCCESS = 8;
const TYPE_JOIN_ERROR = 255;
const TYPE_TICK = 27;

const TICK_PLAYERS = 1 << 0;
const TICK_EDITS   = 1 << 1;
const TICK_ANIMALS = 1 << 2;
const TICK_NAMES   = 1 << 3;
const TICK_TIME    = 1 << 4;
const TICK_WEATHER = 1 << 5;
const STATE_BYTES = 21;
const EDIT_BYTES = 23;
const ANIMAL_BYTES = 24;
const WEATHER_EVENT_BYTES = 13; // u8 kind + 3 LE f32 (must match NetState.hpp)

/* Walk the fixed section order (players, edits, animals, names) to the tail,
 * where TIME (f32) + WEATHER (u8 state, u32 count, count*13B) live LAST.
 * Returns the byte slice from the start of TIME to end-of-buffer (so time +
 * the whole weather section are captured for cross-tab byte-identity). */
function timeWeatherTail(buf) {
  const flags = buf[1];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 2; // M40: type(1) + flags(1) - sections right after flags
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
  if (flags & TICK_ANIMALS) {
    if (off + 4 > buf.length) return null;
    const count = dv.getUint32(off, true);
    off += 4 + count * ANIMAL_BYTES;
  }
  if (flags & TICK_NAMES) {
    if (off + 4 > buf.length) return null;
    const count = dv.getUint32(off, true);
    off += 4;
    for (let i = 0; i < count; i++) {
      if (off + 8 > buf.length) return null;
      const nameLen = dv.getUint32(off + 4, true); // after u32 publicId
      if (off + 8 + nameLen > buf.length) return null;
      off += 8 + nameLen;
    }
  }
  if (!(flags & TICK_TIME) && !(flags & TICK_WEATHER)) return null;
  if (off > buf.length) return null;
  return { tail: buf.slice(off, buf.length), flags, t: Date.now() };
}

/* Decode the clock (first f32 of the tail) + weather state for sanity. */
function decodeTail(tail, flags) {
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const out = { time: null, state: null, nEv: null };
  let off = 0;
  if (flags & TICK_TIME) {
    out.time = dv.getFloat32(off, true); off += 4;
  }
  if (flags & TICK_WEATHER) {
    out.state = dv.getUint8(off); off += 1;
    out.nEv = dv.getUint32(off, true); off += 4;
    const end = off + out.nEv * WEATHER_EVENT_BYTES;
    if (end > tail.length) throw new Error(`weather events overflow: ${end} > ${tail.length}`);
  }
  return out;
}

class Client {
  constructor(tag) {
    this.tag = tag;
    this.ws = null;
    this.publicId = null;
    this.joinError = null;
    this.tails = [];   // {tail, flags, t} per time/weather-bearing tick, in order
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
          const sec = timeWeatherTail(buf);
          if (sec) {
            if (!(sec.flags & TICK_TIME)) throw new Error(`${this.tag}: tick lacks the clock bit`);
            if (!(sec.flags & TICK_WEATHER)) throw new Error(`${this.tag}: tick lacks the weather bit`);
            const d = decodeTail(sec.tail, sec.flags);
            if (d.state !== null && !(d.state >= 0 && d.state <= 3))
              throw new Error(`${this.tag}: bad weather state ${d.state}`);
            if (d.time !== null && !Number.isFinite(d.time))
              throw new Error(`${this.tag}: non-finite clock ${d.time}`);
            this.tails.push(sec);
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

/* 2. accumulate enough clock/weather tails to compare across the ~2 s span. */
const MIN_TAILS = 80;   /* 30 Hz relay: 80 tails span ~2.6 s, enough for a 1.5 s window */
for (const cl of [a, b, c])
  await cl.waitFor(() => cl.tails.length >= MIN_TAILS, MIN_TAILS + ' clock/weather tails', 30000);

/* 3. cross-tab byte-identity: the relay broadcasts ONE tick to every tab, so
 *    the time+weather tail is byte-identical across A, B, C. Several must match. */
const sameBytes = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
const bSet = new Map();
for (const s of b.tails) if (!bSet.has(s.tail.toString())) bSet.set(s.tail.toString(), s.tail);
const cSet = new Map();
for (const s of c.tails) if (!cSet.has(s.tail.toString())) cSet.set(s.tail.toString(), s.tail);
let common = 0;
for (const s of a.tails) {
  const inB = bSet.get(s.tail.toString());
  if (!inB) continue;
  const inC = cSet.get(s.tail.toString());
  if (!inC) continue;
  if (sameBytes(s.tail, inB) && sameBytes(s.tail, inC)) common++;
}
if (common < 5)
  throw new Error(`only ${common} clock/weather tails were byte-identical across A/B/C, expected >= 5`);
console.log(`${common} clock+weather tails byte-identical across all three tabs`);

/* 4. the server clock ADVANCES: on tab A, two tails ~1.5 s apart must show a
 *    strictly larger gameMin (the server steps its own sim clock). */
const first = decodeTail(a.tails[0].tail, a.tails[0].flags).time;
let advanced = false, advancedPair = null;
for (let i = 0; i < a.tails.length && !advanced; i++)
  for (let j = i + 1; j < a.tails.length; j++) {
    if (a.tails[j].t - a.tails[i].t >= 1500) {
      const ti = decodeTail(a.tails[i].tail, a.tails[i].flags).time;
      const tj = decodeTail(a.tails[j].tail, a.tails[j].flags).time;
      if (tj > ti) { advanced = true; advancedPair = [i, j, ti, tj]; }
      break;
    }
  }
if (!advanced)
  throw new Error(`tab A: the server clock did not advance over a 1.5 s span (first=${first})`);
console.log(`tab A: server clock advanced ${advancedPair[2].toFixed(4)} -> ${advancedPair[3].toFixed(4)} gameMin (tails #${advancedPair[0]}..#${advancedPair[1]})`);

a.close(); b.close(); c.close();
console.log('E2E_OK - M37: server clock (bit4) + weather (bit5) byte-identical across 3 tabs, clock advancing');
process.exit(0);
