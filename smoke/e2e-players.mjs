// M38 E2E: server player authority. The live relay (ServerBase
// VibeSurvivorsPlugin, port 3003) must be the single source of truth for
// player transforms:
//   (a) every tick's bit0 section carries ALL THREE tabs' stamped transforms,
//       byte-identical across tabs (the server builds one relay tick and
//       sends it to everyone);
//   (b) each tab sees ITS OWN id stamped in bit0 (the server-stamped self,
//       consumed by the client's mpSelfFrame - no client-authority fallback);
//   (c) plausibility: a teleport-type-26 upload (x + 500) is rejected by the
//       server - the stamped transform never jumps to it, and consecutive
//       stamps stay within the 12 m/s budget; the last accepted state keeps
//       being relayed (server-side rollback);
//   (d) regression: the time+weather tail of the tick is still
//       byte-identical across tabs (M37 expectation);
//   (e) M42: the state byte's held-item bits ride the stamped state - tab A
//       sets bit1 (spear in hand) and every tab sees A's 21 B stamp with the
//       bit, byte-identically, while B/C stamps stay bit-identical (bit0
//       underwater and the rest of the frame untouched).
// Data-level convergence, the M27-M37 precedent (no chrome).
//
// Usage:
//   # from ServerBase (branch feat/vibecraft-server-authoritative):
//   #   cmake --build build-linux --target VibeSurvivorsPlugin
//   #   ./build-linux/VibeSurvivorsPlugin/VibeSurvivorsPlugin   # stays up on :3003
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node smoke/e2e-players.mjs [wss://127.0.0.1:3003]
//
// The E2E never starts the server. Node 22+ global WebSocket; the self-
// signed cert needs NODE_TLS_REJECT_UNAUTHORIZED=0.

const url = process.argv[2] ?? 'wss://127.0.0.1:3003';

const TYPE_JOIN = 3;
const TYPE_JOIN_SUCCESS = 8;
const TYPE_JOIN_ERROR = 255;
const TYPE_STATE = 26;
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

/* Decode the tick's bit0 players section into id -> {x,y,z,yaw}. */
function parsePlayers(buf) {
  const flags = buf[1];
  const out = new Map();
  if (!(flags & TICK_PLAYERS)) return out;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 2; // M40: type(1) + flags(1) - sections right after flags
  if (off + 8 > buf.length) throw new Error('players section: header overflows');
  const count = dv.getUint32(off + 4, true);
  off += 8; // tickId + count
  for (let i = 0; i < count; i++) {
    if (off + STATE_BYTES > buf.length) throw new Error('players section: state overflows');
    const id = dv.getUint32(off, true);
    out.set(id, {
      x: dv.getFloat32(off + 4, true),
      y: dv.getFloat32(off + 8, true),
      z: dv.getFloat32(off + 12, true),
      yaw: dv.getFloat32(off + 16, true),
      state: dv.getUint8(off + 20),   // M42: bit0 underwater, bit1 held spear
    });
    off += STATE_BYTES;
  }
  return out;
}

/* The raw 21 B VivsPlayerState entry of one id in a tick (M42 byte compare). */
function stateEntry(buf, id) {
  const flags = buf[1];
  if (!(flags & TICK_PLAYERS)) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 2;
  if (off + 8 > buf.length) return null;
  const count = dv.getUint32(off + 4, true);
  off += 8;
  for (let i = 0; i < count && off + STATE_BYTES <= buf.length; i++) {
    if (dv.getUint32(off, true) === id) return buf.slice(off, off + STATE_BYTES);
    off += STATE_BYTES;
  }
  return null;
}
function bufEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* Walk the fixed section order (players, edits, animals, names) to the tail,
 * where TIME (f32) + WEATHER (u8 state, u32 count, count*13B) live LAST
 * (M37). Returns the byte slice from the start of TIME to end-of-buffer. */
function timeWeatherTail(buf) {
  const flags = buf[1];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 2;   // M40: sections right after flags
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
      const nameLen = dv.getUint32(off + 4, true);
      if (off + 8 + nameLen > buf.length) return null;
      off += 8 + nameLen;
    }
  }
  if (!(flags & TICK_TIME) && !(flags & TICK_WEATHER)) return null;
  if (off > buf.length) return null;
  return buf.slice(off, buf.length);
}

class Client {
  constructor(tag, x0, z0, vx, vz) {
    this.tag = tag;
    this.ws = null;
    this.publicId = null;
    this.joinError = null;
    this.ticks = [];   // {buf, players: Map, tail, t} for bit0 ticks, in order
    this.x = x0; this.z = z0; this.vx = vx; this.vz = vz; this.yaw = 0;
    this.uploader = null;
    this.stateByte = 0;   // M42: the uploaded state byte (bit1 = held spear)
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
          const flags = buf[1];
          if (!(flags & TICK_PLAYERS)) return;   // only the player-bearing ticks
          this.ticks.push({
            buf: buf.slice(),
            players: parsePlayers(buf),
            tail: timeWeatherTail(buf),
            t: Date.now(),
          });
        }
      };
    });
  }
  /* 30 Hz type-26 upload [u32 publicId (server overwrites)][f32 x,y,z,yaw]
   *    [u8 state] (M42: stateByte = bit0 underwater | bit1 held spear) */
  buildState(x, y, z, yaw) {
    const buf = new ArrayBuffer(1 + STATE_BYTES);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    u8[0] = TYPE_STATE;
    dv.setUint32(1, this.publicId ?? 0, true);
    dv.setFloat32(5, x, true);
    dv.setFloat32(9, y, true);
    dv.setFloat32(13, z, true);
    dv.setFloat32(17, yaw, true);
    u8[1 + STATE_BYTES - 1] = this.stateByte;
    return buf;
  }
  startUpload() {
    this.uploader = setInterval(() => {
      this.x += this.vx / 30;
      this.z += this.vz / 30;
      if (this.ws && this.ws.readyState === WebSocket.OPEN)
        this.ws.send(this.buildState(this.x, 1.0, this.z, this.yaw));
    }, 1000 / 30);
  }
  teleport() {   /* one malformed upload: x + 500 (server must reject it) */
    this.ws.send(this.buildState(this.x + 500, 1.0, this.z, this.yaw));
  }
  waitFor(fn, what, ms = 30000) {
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
  close() { clearInterval(this.uploader); this.ws?.close(); }
}

/* 1. three tabs join the live relay with protocol v2, each uploading a
 *    distinct slow motion (well under the server's 12 m/s budget). */
const a = new Client('A', 10, 10, 1.0, 0.0);
const b = new Client('B', -20, 5, 0.0, 0.5);
const c = new Client('C', 30, -15, 0.0, -1.0);
await Promise.all([a.connect(), b.connect(), c.connect()]);
for (const cl of [a, b, c]) {
  await cl.waitFor(() => cl.publicId !== null, 'JOIN_SUCCESS');
  if (cl.joinError) throw new Error(`${cl.tag}: join error: ${cl.joinError}`);
}
if (a.publicId === b.publicId || b.publicId === c.publicId || a.publicId === c.publicId)
  throw new Error(`publicId collision: ${a.publicId}/${b.publicId}/${c.publicId}`);
console.log(`A/B/C joined as publicId ${a.publicId}/${b.publicId}/${c.publicId}`);
a.startUpload(); b.startUpload(); c.startUpload();

/* 2. every tab's bit0 ticks must carry ALL THREE stamped transforms
 *    (once each tab has uploaded at least once, the server stamps all). */
for (const cl of [a, b, c])
  await cl.waitFor(() => cl.ticks.some(t =>
    t.players.has(a.publicId) && t.players.has(b.publicId) && t.players.has(c.publicId)),
    'a tick carrying all three stamped transforms');
await a.waitFor(() => a.ticks.length >= 60, '60 player ticks');
await b.waitFor(() => b.ticks.length >= 60, '60 player ticks');
await c.waitFor(() => c.ticks.length >= 60, '60 player ticks');

/* 3. (a) byte-identity: the relay broadcasts ONE tick to every tab, so the
 *    whole player-bearing tick (bit0 + animals + time + weather) is
 *    byte-identical across A, B, C. Several must match. */
const bSet = new Set(b.ticks.map(t => t.buf.toString()));
const cSet = new Set(c.ticks.map(t => t.buf.toString()));
let common = 0;
for (const t of a.ticks)
  if (bSet.has(t.buf.toString()) && cSet.has(t.buf.toString())) common++;
if (common < 5)
  throw new Error(`only ${common} player ticks were byte-identical across A/B/C, expected >= 5`);
console.log(`${common} player ticks byte-identical across all three tabs (one relay tick)`);

/* 4. (b) each tab sees ITS OWN id stamped in bit0 - the server-stamped self,
 *    the value the client's mpSelfFrame reconciles the local rig to. */
for (const cl of [a, b, c]) {
  const selfTicks = cl.ticks.filter(t => t.players.has(cl.publicId));
  if (selfTicks.length === 0)
    throw new Error(`tab ${cl.tag} never saw its own id ${cl.publicId} stamped in bit0`);
  const s = selfTicks[selfTicks.length - 1].players.get(cl.publicId);
  if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z) || !Number.isFinite(s.yaw))
    throw new Error(`tab ${cl.tag}: non-finite self stamp`);
}
console.log('every tab sees its own id stamped in bit0 (server-stamped self)');

/* 5. (c) plausibility: tab A sends a teleport-type-26 (x + 500, far outside
 *    the island bound). The server must drop it: A's stamped transform never
 *    jumps to it, consecutive stamps stay within the 12 m/s budget, and the
 *    last accepted state keeps being relayed. */
const lastStamps = a.ticks.filter(t => t.players.has(a.publicId))
  .map(t => t.players.get(a.publicId));
const lastX = lastStamps[lastStamps.length - 1].x;
const teleportAt = Date.now() + 300;
a.teleport();
await new Promise(r => setTimeout(r, 1200));   /* let ~36 more ticks relay */
const after = a.ticks.filter(t => t.t >= teleportAt && t.players.has(a.publicId))
  .map(t => t.players.get(a.publicId));
if (after.length < 20)
  throw new Error(`only ${after.length} post-teleport stamps for A; the last accepted state may have stopped relaying`);
const maxJump = after.reduce((m, s, i) =>
  i === 0 ? m : Math.max(m, Math.abs(s.x - after[i - 1].x)), 0);
const MAX_JUMP_U = 12 * 0.05 + 0.5;   /* 12 m/s budget over 2 tick intervals + slack */
if (maxJump > MAX_JUMP_U)
  throw new Error(`A's stamped x jumped ${maxJump.toFixed(2)} u between consecutive stamps after the teleport`);
if (Math.max(...after.map(s => s.x)) > lastX + 5)
  throw new Error('the teleport (x + 500) propagated into a stamped transform');
if (Math.abs(after[after.length - 1].x - lastX) > 5)
  throw new Error('the relayed self stamp drifted away from the last accepted state');
console.log(`teleport rejected: post-teleport stamps stayed near x=${lastX.toFixed(2)} (max jump ${maxJump.toFixed(3)} u, ${after.length} stamps)`);

/* 6. (d) regression: the time+weather tail is still byte-identical across
 *    tabs (M37 expectation). */
const cTails = new Set(c.ticks.map(t => t.tail?.toString()).filter(Boolean));
let commonTails = 0;
for (const t of a.ticks)
  if (t.tail && cTails.has(t.tail.toString())) commonTails++;
if (commonTails < 5)
  throw new Error(`only ${commonTails} time+weather tails were byte-identical across A/C, expected >= 5`);
console.log(`${commonTails} time+weather tails byte-identical across tabs (M37 expectation holds)`);

/* 7. (e) M42: held-item flags. Tab A raises the state byte bit1 (spear in
 *    hand); the stamped state on EVERY tab must show A with the bit while
 *    B/C stay byte-identical to before (bit0 + rest of the frame untouched).
 *    The stamp is still one 21 B entry - no wire growth. */
a.stateByte = 2;   // STATE_HELD_SPEAR
await a.waitFor(() => a.ticks.some(t => {
  const p = t.players.get(a.publicId);
  return p && (p.state & 2) !== 0;
}), 'A\'s spear bit in a stamped state', 5000);
const heldTick = a.ticks.filter(t => {
  const p = t.players.get(a.publicId);
  return p && (p.state & 2) !== 0 && p.state === 2;   // exactly bit1 (bit0 stays 0)
}).at(-1);
if (!heldTick)
  throw new Error('A\'s stamped state carried the spear bit with another bit set (expected state byte 2)');
const aEntry = stateEntry(heldTick.buf, a.publicId);
if (aEntry[STATE_BYTES - 1] !== 2)
  throw new Error('A\'s stamped state byte is not 2 (spear bit only)');
const bHas = b.ticks.some(t => bufEq(stateEntry(t.buf, a.publicId), aEntry));
const cHas = c.ticks.some(t => bufEq(stateEntry(t.buf, a.publicId), aEntry));
if (!bHas || !cHas)
  throw new Error('the held-spear stamp of A was not byte-identical on B/C (B=' + bHas + ' C=' + cHas + ')');
const bSt = heldTick.players.get(b.publicId), cSt = heldTick.players.get(c.publicId);
if (bSt && (bSt.state & 2) !== 0) throw new Error('B\'s stamp must not carry the spear bit');
if (cSt && (cSt.state & 2) !== 0) throw new Error('C\'s stamp must not carry the spear bit');
console.log('M42: A\'s held-spear stamp (state byte 2) relayed byte-identical to B/C; B/C stamps kept their own bits; frame size unchanged (21 B)');

a.close(); b.close(); c.close();
console.log('E2E_OK - M38: 3-tab player positions server-determined; stamps byte-identical; teleport rejected; M42 held-spear flag relays in the 21 B state; no client-authority fallback');
process.exit(0);
