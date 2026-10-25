// M41 E2E (the M41 gate): NORMAL 3-tab play + MID-PLAY RECONNECT with zero
// world divergence. A FRESH relay (this script owns it: own CWD in /tmp,
// port 3012, the live :3003 relay is never touched) must:
//   (a) join all three tabs, each receiving the same world block
//       (29220 B payload, byte-identical across tabs);
//   (b) during ~22 s of concurrent play (all three tabs uploading plausible
//       moving state at 30 Hz) relay edits from DIFFERENT tabs (camp from A,
//       shelter from B, palm shake from C) byte-identically in bit1, with
//       zero type-34 rejects;
//   (c) for every common relay tick during play: the bit0 players section,
//       the bit2 animals section, and the time+weather tail are BYTE-
//       IDENTICAL across all three tabs (tickId-aligned); stamps of all
//       three movers must visibly advance (no teleporting - plausible
//       12 m/s-bounded walk);
//   (d) TAB C DROPS mid-play; A/B keep converging byte-identically; one more
//       accepted edit (palm 1 shake from A) lands;
//   (e) tab C REJOINS: same world block, EDIT_SYNC catch-up byte-identical
//       to the exact accepted edit sequence (in order), clock >= pre-drop
//       clock; afterwards A/B/C ticks are byte-identical again.
// "Zero world divergence" = byte-identity in the sense of the M27-M40 e2e
// suite (no chrome).
//
// Usage:
//   node smoke/e2e-play.mjs
//
// Node 22+ global WebSocket; the self-signed cert needs
// NODE_TLS_REJECT_UNAUTHORIZED=0 (set below, like e2e-restart).

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync,
         existsSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = fileURLToPath(
  new URL('../../ServerBase/build-linux/VibeSurvivorsPlugin', import.meta.url));
const BIN = join(PLUGIN_DIR, 'VibeSurvivorsPlugin');
const PORT = 3012;
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
const WORLD_MSG_BYTES = 29220;   // full type-33 message length (type byte + 29219 B)

/* The seed-1337 island's camp spot + spawn (same constants as e2e-edits.mjs). */
const CAMP = { x: 142.634, z: 146.969, rot: 0.4 };
const SPAWN = { x: 143.382, z: 147.632 };

/* Capture one tick's sections as raw byte slices keyed by tickId so that
 * cross-tab comparisons are aligned on the relay tick (the players section
 * carries the u32 tickId). Returns null on a malformed tick. */
function captureTick(buf) {
  const flags = buf[1];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 2;   // M40: type(1) + flags(1) - sections right after flags
  const info = { tickId: null, players: null, animals: null, tail: null,
                 time: null, edits: [] };
  if (flags & TICK_PLAYERS) {
    if (off + 8 > buf.length) return null;
    info.tickId = dv.getUint32(off, true);
    const count = dv.getUint32(off + 4, true);
    const end = off + 8 + count * STATE_BYTES;
    if (end > buf.length) return null;
    info.players = buf.slice(off, end);
    off = end;
  }
  if (flags & TICK_EDITS) {
    if (off + 4 > buf.length) return null;
    const count = dv.getUint32(off, true);
    off += 4;
    for (let i = 0; i < count; i++) {
      if (off + EDIT_BYTES > buf.length) return null;
      info.edits.push(buf.slice(off, off + EDIT_BYTES));
      off += EDIT_BYTES;
    }
  }
  if (flags & TICK_ANIMALS) {
    if (off + 4 > buf.length) return null;
    const count = dv.getUint32(off, true);
    const end = off + 4 + count * ANIMAL_BYTES;
    if (end > buf.length) return null;
    info.animals = buf.slice(off, end);
    off = end;
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
  if (flags & (TICK_TIME | TICK_WEATHER)) {
    if (off > buf.length) return null;
    info.tail = buf.slice(off, buf.length);
    if (flags & TICK_TIME)
      info.time = dv.getFloat32(off, true);
  }
  return info;
}

/* Decode one player's (x, z) from a stamped 21 B state slice. */
function statePos(s) {
  const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
  return { x: dv.getFloat32(4, true), z: dv.getFloat32(12, true) };
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
  constructor(tag, cx, cz, r) {
    this.tag = tag;
    this.ws = null;
    this.publicId = null;
    this.joinError = null;
    this.world = null;
    this.editSync = null;       // [23B] from the type-30 catch-up
    this.rejects = [];
    this.ticks = [];            // every captured tick, in arrival order
    this.byTickId = new Map();  // tickId -> captured tick (for aligned compare)
    this.maxTickLen = 0;
    /* slow-circle mover: center (cx,cz), radius r, 0.5 rad/s (~1 m/s) */
    this.cx = cx; this.cz = cz; this.r = r;
    this.angle = 0;
    this.x = cx + r; this.z = cz;
    this.uploader = null;
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
            kind: dv.getUint8(9),
            reason: new TextDecoder().decode(
              new Uint8Array(buf.buffer, buf.byteOffset + 1 + EDIT_BYTES + 2, reasonLen)),
          });
        }
        else if (type === TYPE_TICK) {
          this.maxTickLen = Math.max(this.maxTickLen, buf.length);
          const info = captureTick(buf);
          if (!info) {
            reject(new Error(`${this.tag}: malformed tick (len ${buf.length})`));
            return;
          }
          this.ticks.push(info);
          if (info.tickId !== null) this.byTickId.set(info.tickId, info);
        }
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
  /* Start uploading plausible state at 30 Hz: a slow circle (~1 m/s, far
     under the server's 12 m/s plausibility budget). */
  startMoving() {
    this.sendState(this.x, 1, this.z, this.angle);
    this.uploader = setInterval(() => {
      this.angle += 0.5 / 30;
      this.x = this.cx + this.r * Math.cos(this.angle);
      this.z = this.cz + this.r * Math.sin(this.angle);
      this.sendState(this.x, 1, this.z, this.angle + Math.PI / 2);
    }, 33);
  }
  stopMoving() {
    if (this.uploader) { clearInterval(this.uploader); this.uploader = null; }
  }
  recentEdits(n) {
    const out = [];
    for (const tk of this.ticks.slice(-n)) out.push(...tk.edits);
    return out;
  }
  lastTimes() {
    const ts = this.ticks.map((t) => t.time).filter((t) => t !== null);
    return ts;
  }
  /* Max distance (u) any stamp of `id` moved across this tab's captured
     ticks - the "it is really moving" evidence. */
  stampTravel(id) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, n = 0;
    for (const t of this.ticks) {
      if (!t.players) continue;
      const dv = new DataView(t.players.buffer, t.players.byteOffset, t.players.byteLength);
      const count = dv.getUint32(4, true);
      for (let i = 0; i < count; i++) {
        const off = 8 + i * STATE_BYTES;
        if (dv.getUint32(off, true) !== id) continue;
        const { x, z } = statePos(t.players.slice(off, off + STATE_BYTES));
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        n++;
      }
    }
    if (n === 0) return { n: 0, dist: 0 };
    return { n, dist: Math.hypot(maxX - minX, maxZ - minZ) };
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
  close() { this.stopMoving(); if (this.ws) this.ws.close(); }
}

/* Own the relay: fresh CWD under /tmp, port 3012, the :3003 relay untouched. */
class Relay {
  constructor(dir) {
    this.dir = dir;
    this.proc = null;
  }
  async start() {
    const logFd = openSync(join(this.dir, 'relay.log'), 'a');
    const proc = spawn(BIN, [], { cwd: this.dir, stdio: ['ignore', logFd, logFd] });
    this.proc = proc;
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
  /* SIGTERM and wait for the actual exit (the port must be released) */
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

/* Cross-tab byte-identity over the `n` most recent tickIds ALL clients saw:
 * players section, animals section, and the time+weather tail must match. */
function assertTicksIdentical(clients, n, label) {
  const sets = clients.map((c) => c.byTickId);
  const common = [...sets[0].keys()].filter((id) =>
    sets.every((s) => s.has(id)));
  common.sort((a, b) => a - b);
  if (common.length < n)
    throw new Error(`${label}: only ${common.length} common ticks, needed ${n}`);
  const window = common.slice(-n);
  for (const id of window) {
    const [base, ...others] = sets.map((s) => s.get(id));
    for (const c of others) {
      if (!bufEq(base.players, c.players))
        throw new Error(`${label}: tick ${id} bit0 players section differs across tabs`);
      if (!bufEq(base.animals, c.animals))
        throw new Error(`${label}: tick ${id} bit2 animals section differs across tabs`);
      if (!bufEq(base.tail, c.tail))
        throw new Error(`${label}: tick ${id} time+weather tail differs across tabs`);
    }
  }
  return window.length;
}

async function main() {
  if (!existsSync(BIN)) throw new Error('relay binary not found: ' + BIN);
  const dir = mkdtempSync('/tmp/vivs-play-');
  const relay = new Relay(dir);
  const clients = [];
  let C = null;
  try {
    /* set up the relay CWD: binary + certs + cfg (port 3012) */
    cpSync(BIN, join(dir, 'VibeSurvivorsPlugin'));
    cpSync(join(PLUGIN_DIR, 'certs'), join(dir, 'certs'), { recursive: true });
    mkdirSync(join(dir, 'web'), { recursive: true });
    writeFileSync(join(dir, 'Server.cfg'),
      `port = ${PORT}\nwebRoot = web\nserverTickRate = 30.0f\n` +
      `useCompression = true\nreconnectTimeoutSeconds = 30\n`);

    await relay.start();

    /* ---- (a) three tabs join; world blocks byte-identical ---- */
    const A = new Client('A', CAMP.x, CAMP.z, 3);
    const B = new Client('B', SPAWN.x, SPAWN.z, 2);
    C = new Client('C', 146, 150, 2);
    clients.push(A, B, C);
    await Promise.all([A.connect(), B.connect(), C.connect()]);
    await Promise.all([A, B, C].map((c) =>
      c.waitFor(() => c.publicId !== null || c.joinError !== null, `${c.tag} join result`)));
    for (const c of [A, B, C]) {
      if (c.joinError) throw new Error(`${c.tag} join error: ${c.joinError}`);
      await c.waitFor(() => c.world !== null, 'world block');
      if (c.world.length !== WORLD_MSG_BYTES)
        throw new Error(`${c.tag}: world block message is ${c.world.length} B, expected ${WORLD_MSG_BYTES}`);
    }
    if (!bufEq(A.world, B.world) || !bufEq(A.world, C.world))
      throw new Error('the three world blocks are not byte-identical');
    console.log(`join: 3 tabs; world block ${WORLD_MSG_BYTES} B, byte-identical across tabs`);

    /* ---- (b) + (c) ~22 s of concurrent play ---- */
    A.startMoving();
    B.startMoving();
    C.startMoving();

    const accepted = [];   // relayed stamped 23 B bodies, in accept order
    const expectRelay = (liveTabs, body, what) =>
      Promise.all(liveTabs.map((t) =>
        t.waitFor(() => t.recentEdits(10).some((e) => bufEq(e, body)),
          `${t.tag}: relayed ${what}`)));

    // camp from A
    const campBody = editBody(A.publicId, 2, 0, campPayload());
    A.sendEdit(2, 0, campPayload());
    await expectRelay([A, B, C], campBody, 'the camp edit (from A)');
    accepted.push(campBody);

    // shelter from B
    const shelterBody = editBody(B.publicId, 3, 0);
    B.sendEdit(3, 0);
    await expectRelay([A, B, C], shelterBody, 'the shelter edit (from B)');
    accepted.push(shelterBody);

    // palm 0 shake from C
    const palm0Body = editBody(C.publicId, 0, 0, [1]);
    C.sendEdit(0, 0, [1]);
    await expectRelay([A, B, C], palm0Body, 'the palm-0 shake (from C)');
    accepted.push(palm0Body);
    console.log(`play: 3 edits from 3 different tabs (camp A, shelter B, palm C) relayed byte-identical`);

    await sleep(12000);   // let all three movers walk (~12 s of play so far)

    // stamps of every mover visibly advanced (the walk is plausible, the
    // server accepted the uploads - a rejected/teleported mover would show ~0)
    for (const c of [A, B, C]) {
      const id = c.publicId;
      const travel = A.stampTravel(id);
      if (travel.n < 20 || travel.dist < 1.0)
        throw new Error(`mover ${c.tag}'s stamp barely moved (${travel.dist.toFixed(2)} u over ${travel.n} stamps) - uploads are being rejected`);
    }
    let window = assertTicksIdentical([A, B, C], 60, 'play window');
    console.log(`play: ${window} common ticks (22 s of play): bit0 + bit2 + time/weather byte-identical across all 3 tabs; stamps advancing`);

    /* ---- (d) tab C drops mid-play; play continues ---- */
    const preDrop = A.lastTimes().pop();
    C.close();
    C = null;
    await sleep(2000);

    // one more accepted edit while C is gone (palm 1 shake from A)
    const palm1Body = editBody(A.publicId, 0, 1, [1]);
    A.sendEdit(0, 1, [1]);
    await expectRelay([A, B], palm1Body, 'the palm-1 shake (from A, C dropped)');
    accepted.push(palm1Body);
    await sleep(3000);
    window = assertTicksIdentical([A, B], 60, 'C-dropped window');
    console.log(`drop: tab C dropped at clock ${preDrop.toFixed(3)}; A/B kept converging byte-identically (${window} ticks); one more edit landed`);

    /* ---- (e) tab C rejoins mid-play ---- */
    const C2 = new Client('C2', 146, 150, 2);
    C = C2;
    clients.push(C2);
    await C2.connect();
    await C2.waitFor(() => C2.publicId !== null || C2.joinError !== null, 'C2 join result');
    if (C2.joinError) throw new Error(`C2 join error: ${C2.joinError}`);
    await C2.waitFor(() => C2.world !== null, 'world block');
    await C2.waitFor(() => C2.editSync !== null, 'EDIT_SYNC catch-up');
    if (!bufEq(A.world, C2.world))
      throw new Error('the rejoiner\u2019s world block is not byte-identical to the live tabs\u2019');
    if (C2.editSync.length !== accepted.length)
      throw new Error(`C2's edit sync has ${C2.editSync.length} edits, expected ${accepted.length}`);
    accepted.forEach((body, i) => {
      if (!bufEq(C2.editSync[i], body))
        throw new Error(`C2's edit sync[${i}] is not byte-identical to the accepted edit #${i + 1}`);
    });
    await C2.waitFor(() => C2.lastTimes().length > 0, 'clocked tick');
    const postJoin = C2.lastTimes().pop();
    if (postJoin < preDrop - 0.01)
      throw new Error(`post-rejoin clock ${postJoin.toFixed(3)} < pre-drop clock ${preDrop.toFixed(3)} - the clock regressed`);
    console.log(`rejoin: world block identical; EDIT_SYNC = the exact ${accepted.length} accepted edits byte-identically (in order); clock ${postJoin.toFixed(3)} >= ${preDrop.toFixed(3)}`);

    C2.startMoving();
    await sleep(10000);
    window = assertTicksIdentical([A, B, C2], 60, 'post-rejoin window');
    const rejects = [A, B, C2].reduce((n, c) => n + c.rejects.length, 0);
    if (rejects !== 0)
      throw new Error(`${rejects} type-34 rejects observed - every edit sent was valid`);
    const maxTick = Math.max(A.maxTickLen, B.maxTickLen, C2.maxTickLen);
    console.log(`post-rejoin: ${window} common ticks byte-identical across A/B/C2 again; zero type-34 rejects over the whole run; max tick ${maxTick} B`);

    console.log('E2E_OK - M41: 3-tab play + mid-play reconnect, zero world divergence');
  } finally {
    for (const c of clients) c.close();
    await relay.stop();
    if (process.env.KEEP) console.log('KEEP: relay CWD preserved at ' + dir);
    else try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('E2E_FAIL:', e.message);
  process.exit(1);
});
