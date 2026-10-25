// M40 E2E: server-restart resilience. A FRESH relay (this script owns it:
// own CWD in /tmp, port 3011, the live :3003 relay is never touched) must:
//   (a) accept + relay valid edits (camp + palm shake) on the first run;
//   (b) persist them to vibsurvivors-worldstore.bin in its CWD on shutdown;
//   (c) on restart in the SAME CWD: rejoiners receive the pre-restart edit
//       history byte-identically (type-30 EDIT_SYNC) and the server clock
//       resumes from the persisted value (no divergence, no fresh start).
// Data-level convergence, the M27-M39 precedent (no chrome).
//
// Usage:
//   node smoke/e2e-restart.mjs
//
// Node 22+ global WebSocket; self-signed cert needs NODE_TLS_REJECT_UNAUTHORIZED=0
// (set by the runner, harmless here).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync,
         existsSync, statSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = fileURLToPath(
  new URL('../../ServerBase/build-linux/VibeSurvivorsPlugin', import.meta.url));
const BIN = join(PLUGIN_DIR, 'VibeSurvivorsPlugin');
const PORT = 3011;
const url = `wss://127.0.0.1:${PORT}`;

const TYPE_JOIN = 3;
const TYPE_JOIN_SUCCESS = 8;
const TYPE_JOIN_ERROR = 255;
const TYPE_STATE = 26;
const TYPE_TICK = 27;
const TYPE_EDIT = 28;
const TYPE_EDIT_SYNC = 30;
const TYPE_WORLD = 33;
const TYPE_EDIT_REJECT = 34;
const TICK_PLAYERS = 1 << 0;
const TICK_EDITS   = 1 << 1;
const TICK_ANIMALS = 1 << 2;
const TICK_NAMES   = 1 << 3;
const TICK_TIME    = 1 << 4;
const TICK_WEATHER = 1 << 5;
const STATE_BYTES = 21;
const EDIT_BYTES = 23;
const ANIMAL_BYTES = 24;
const WEATHER_EVENT_BYTES = 13;

/* The seed-1337 island's camp spot (same constants as e2e-edits.mjs). */
const CAMP = { x: 142.634, z: 146.969, rot: 0.4 };

function parseEdits(buf) {
  const flags = buf[1];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 2;   // M40: type(1) + flags(1) - sections right after flags
  if (flags & TICK_PLAYERS) {
    if (off + 8 > buf.length) return null;
    const count = dv.getUint32(off + 4, true);
    off += 8 + count * STATE_BYTES;
  }
  if (off + 4 > buf.length) return null;
  if (!(flags & TICK_EDITS)) return [];
  const count = dv.getUint32(off, true);
  off += 4;
  const out = [];
  for (let i = 0; i < count; i++) {
    if (off + EDIT_BYTES > buf.length) return null;
    out.push(buf.slice(off, off + EDIT_BYTES));
    off += EDIT_BYTES;
  }
  return out;
}

/* Walk all sections to the tail and return the bit4 time (f32, if present). */
function tickTime(buf) {
  const flags = buf[1];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 2;
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
  if (flags & TICK_TIME) {
    if (off + 4 > buf.length) return null;
    return dv.getFloat32(off, true);
  }
  return null;
}

const f32 = (v) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, v, true);
  return b;
};
const campPayload = () => {
  const p = new Uint8Array(12);
  p.set(f32(CAMP.x), 0);
  p.set(f32(CAMP.z), 4);
  p.set(f32(CAMP.rot), 8);
  return p;
};
function editBody(publicId, kind, entityIndex, payload = []) {
  const b = new Uint8Array(EDIT_BYTES);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, publicId, true);
  dv.setUint32(4, entityIndex, true);
  b[8] = kind;
  b[9] = 0;
  for (let i = 0; i < payload.length; i++) b[10 + i] = payload[i];
  return b;
}
function bufEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

class Client {
  constructor(tag, x0, z0) {
    this.tag = tag;
    this.ws = null;
    this.publicId = null;
    this.joinError = null;
    this.ticks = [];
    this.rejects = [];
    this.world = null;
    this.editSync = null;
    this.x = x0; this.z = z0;
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
        else if (type === TYPE_WORLD) this.world = buf;
        else if (type === TYPE_EDIT_SYNC) {
          const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
          const count = dv.getUint32(1, true);
          this.editSync = [];
          for (let i = 0; i < count && 5 + (i + 1) * EDIT_BYTES <= buf.length; i++)
            this.editSync.push(buf.slice(5 + i * EDIT_BYTES, 5 + (i + 1) * EDIT_BYTES));
        }
        else if (type === TYPE_EDIT_REJECT) {
          const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
          const reasonLen = dv.getUint16(1 + EDIT_BYTES, true);
          this.rejects.push({
            publicId: dv.getUint32(1, true),
            entityIndex: dv.getUint32(5, true),
            kind: dv.getUint8(9),
            reason: new TextDecoder().decode(
              new Uint8Array(buf.buffer, buf.byteOffset + 1 + EDIT_BYTES + 2, reasonLen)),
            t: Date.now(),
          });
        }
        else if (type === TYPE_TICK)
          this.ticks.push({ edits: parseEdits(buf), time: tickTime(buf), t: Date.now() });
      };
    });
  }
  sendState(x, y, z, yaw) {
    const buf = new ArrayBuffer(1 + STATE_BYTES);
    const dv = new DataView(buf);
    new Uint8Array(buf)[0] = TYPE_STATE;
    dv.setUint32(1, this.publicId ?? 0, true);
    dv.setFloat32(5, x, true);
    dv.setFloat32(9, y, true);
    dv.setFloat32(13, z, true);
    dv.setFloat32(17, yaw, true);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(buf);
  }
  sendEdit(kind, entityIndex, payload = []) {
    const buf = new Uint8Array(1 + EDIT_BYTES);
    const dv = new DataView(buf.buffer);
    buf[0] = TYPE_EDIT;
    dv.setUint32(1, this.publicId, true);
    dv.setUint32(5, entityIndex, true);
    buf[9] = kind;
    buf[10] = 0;
    for (let i = 0; i < payload.length; i++) buf[11 + i] = payload[i];
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(buf);
  }
  recentEdits(n) {
    const out = [];
    for (const tk of this.ticks.slice(-n))
      if (tk.edits && tk.edits.length) out.push(...tk.edits);
    return out;
  }
  waitFor(fn, what, ms = 10000) {
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
  close() { if (this.ws) this.ws.close(); }
}

/* Own the relay: fresh CWD under /tmp, port 3011, the :3003 relay untouched. */
class Relay {
  constructor(dir) {
    this.dir = dir;
    this.proc = null;
  }
  async start() {
    const logFd = openSync(join(this.dir, 'relay-' + (Relay.n = (Relay.n || 0) + 1) + '.log'), 'a');
    const proc = spawn(BIN, [], { cwd: this.dir, stdio: ['ignore', logFd, logFd] });
    this.proc = proc;
    // wait for the port to be ready: poll with a plain WS connect
    const t0 = Date.now();
    for (;;) {
      try {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => {
          ws.onopen = res;
          ws.onerror = rej;
          setTimeout(rej, 500);
        });
        ws.close();
        return;
      } catch {
        if (proc.exitCode !== null)
          throw new Error('the relay exited during startup');
        if (Date.now() - t0 > 10000)
          throw new Error('relay did not come up on :' + PORT);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
  /* SIGTERM and wait for the actual exit (the port must be released before
     the next relay may start in the same CWD) */
  stop() {
    if (!this.proc) return Promise.resolve();
    const p = this.proc;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      p.once('exit', finish);
      p.kill('SIGTERM');
      setTimeout(() => { if (p.exitCode === null) p.kill('SIGKILL'); }, 4000);
      setTimeout(finish, 5000);
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!existsSync(BIN)) throw new Error('relay binary not found: ' + BIN);
  const dir = mkdtempSync('/tmp/vivs-restart-');
  const relays = [];
  const clients = [];
  try {
    /* set up the relay CWD: binary + certs + cfg (port 3011) */
    cpSync(BIN, join(dir, 'VibeSurvivorsPlugin'));
    cpSync(join(PLUGIN_DIR, 'certs'), join(dir, 'certs'), { recursive: true });
    mkdirSync(join(dir, 'web'), { recursive: true });
    writeFileSync(join(dir, 'Server.cfg'),
      `port = ${PORT}\nwebRoot = web\nserverTickRate = 30.0f\n` +
      `useCompression = true\nreconnectTimeoutSeconds = 30\n`);

    /* ---- (a) first run: accept + relay a camp and a palm shake ---- */
    const r1 = new Relay(dir);
    relays.push(r1);
    await r1.start();
    const A = new Client('A', CAMP.x, CAMP.z);
    clients.push(A);
    await A.connect();
    await A.waitFor(() => A.publicId !== null || A.joinError !== null, 'join result');
    if (A.joinError) throw new Error(`A join error: ${A.joinError}`);
    await A.waitFor(() => A.world !== null, 'world block');
    A.sendState(A.x, 1, A.z, 0.5);
    await A.waitFor(() => A.ticks.length > 0, 'first tick');

    const campBody = editBody(A.publicId, 2, 0, campPayload());
    A.sendEdit(2, 0, campPayload());
    await A.waitFor(() => A.recentEdits(6).some((e) => bufEq(e, campBody)),
      'camp relay');
    const palmBody = editBody(A.publicId, 0, 0, [1]);
    A.sendEdit(0, 0, [1]);
    await A.waitFor(() => A.recentEdits(6).some((e) => bufEq(e, palmBody)),
      'palm shake relay');
    await A.waitFor(() => A.ticks.filter((tk) => tk.time !== null).length >= 3,
      'clocked ticks');
    const times = A.ticks.map((tk) => tk.time).filter((t) => t !== null);
    const lastBefore = times[times.length - 1];
    if (!(lastBefore > 0))
      throw new Error('the server clock was not observed: ' + lastBefore);
    console.log(`run 1: camp + palm shake relayed; server clock at ${lastBefore.toFixed(3)}`);
    A.close();

    /* ---- (b) shutdown: the world store lands in the relay CWD ---- */
    await r1.stop();
    const storePath = join(dir, 'vibsurvivors-worldstore.bin');
    if (!existsSync(storePath))
      throw new Error('vibsurvivors-worldstore.bin was not written on shutdown');
    const storeBytes = statSync(storePath).size;
    /* header 20B + 31B per edit: camp + palm = 82B expected */
    if (storeBytes !== 20 + 2 * 31)
      throw new Error('world store size is ' + storeBytes + ', expected ' + (20 + 2 * 31));
    console.log(`shutdown: world store persisted (${storeBytes} bytes, 2 edits + clock + seed)`);

    /* ---- (c) restart in the SAME CWD: history replays, clock resumes ---- */
    const r2 = new Relay(dir);
    relays.push(r2);
    await r2.start();
    const B = new Client('B', CAMP.x, CAMP.z);
    clients.push(B);
    await B.connect();
    await B.waitFor(() => B.publicId !== null || B.joinError !== null, 'join result');
    if (B.joinError) throw new Error(`B join error: ${B.joinError}`);
    await B.waitFor(() => B.world !== null, 'world block');
    await B.waitFor(() => B.editSync !== null, 'EDIT_SYNC catch-up');
    if (B.editSync.length !== 2)
      throw new Error(`B's edit sync has ${B.editSync.length} edits, expected 2`);
    if (!bufEq(B.editSync[0], campBody))
      throw new Error('edit sync[0] is not the pre-restart camp edit');
    if (!bufEq(B.editSync[1], palmBody))
      throw new Error('edit sync[1] is not the pre-restart palm shake');
    console.log('restart: the 2 pre-restart edits replayed byte-identically (type-30)');

    /* the server clock resumes from the persisted value - not a fresh start */
    await B.waitFor(() => B.ticks.filter((tk) => tk.time !== null).length >= 5,
      'clocked ticks after restart');
    const after = B.ticks.map((tk) => tk.time).filter((t) => t !== null);
    const lastAfter = after[after.length - 1];
    for (let i = 1; i < after.length; i++)
      if (after[i] <= after[i - 1])
        throw new Error('the post-restart clock is not monotonically advancing');
    /* the persisted clock lags the pre-kill clock by at most one persist
       interval (~1 s at 30 Hz) plus tick latency - a fresh start would be ~0 */
    if (lastAfter < lastBefore - 1.5)
      throw new Error(`post-restart clock ${lastAfter.toFixed(3)} regressed past the ` +
        `persisted value (pre-restart ${lastBefore.toFixed(3)})`);
    console.log(`restart: clock resumed at ${lastAfter.toFixed(3)} (pre-restart ${lastBefore.toFixed(3)}) - no divergence`);

    console.log('E2E_OK - M40: world store survives a server restart; edit history replays byte-identically; the clock resumes, not resets');
  } finally {
    for (const r of relays) r.stop();
    for (const c of clients) c.close();
    await sleep(300);
    for (const r of relays) { if (r.proc && r.proc.exitCode === null) r.proc.kill('SIGKILL'); }
    if (process.env.KEEP) console.log('KEEP: relay CWD preserved at ' + dir);
    else try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('E2E_FAIL:', e.message);
  process.exit(1);
});
