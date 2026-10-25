// M41 E2E: server-payload performance check. A FRESH relay (this script
// owns it: own CWD in /tmp, port 3013, the live :3003 relay is never
// touched) is loaded with 3 clients (one slow mover + two keepalive tabs)
// and the LIVE bytes are measured over a ~12 s steady window. No server
// changes; this script is measurement + budget asserts, kept in the repo
// so the numbers stay re-runnable:
//   - join: world block payload must be 29220 B
//   - steady tick: max < 2048 B (per-client, full relay tick)
//   - steady downlink per client: < 60 KB/s
//   - steady uplink per client: < 1 KB/s
// and it prints the measured table plus a 10/25-client extrapolation
// (one relay tick goes to every connected client, so relay cost scales
// linearly with clients at the per-client tick rate).
//
// Usage:
//   node smoke/e2e-perf.mjs
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

const PLUGIN_DIR = fileURLToPath(
  new URL('../../ServerBase/build-linux/VibeSurvivorsPlugin', import.meta.url));
const BIN = join(PLUGIN_DIR, 'VibeSurvivorsPlugin');
const PORT = 3013;
const url = `wss://127.0.0.1:${PORT}`;

const TYPE_JOIN = 3;
const TYPE_JOIN_SUCCESS = 8;
const TYPE_JOIN_ERROR = 255;
const TYPE_STATE = 26;
const TYPE_TICK = 27;
const TYPE_EDIT_SYNC = 30;
const TYPE_WORLD = 33;
const STATE_BYTES = 21;
const WORLD_MSG_BYTES = 29220;   // full type-33 message length (type byte + 29219 B)

const CAMP = { x: 142.634, z: 146.969 };
const SPAWN = { x: 143.382, z: 147.632 };

const UPLINK_BUDGET = 1000;        // B/s per client
const DOWNLINK_BUDGET = 60000;     // B/s per client
const MAX_TICK_BUDGET = 2048;      // B per relay tick

class Client {
  constructor(tag, cx, cz, r, moving) {
    this.tag = tag;
    this.ws = null;
    this.publicId = null;
    this.joinError = null;
    this.worldLen = null;          // full type-33 message length
    this.editSyncLen = null;       // total message length, or null if absent
    this.tickLens = [];            // full relay-tick message lengths, capture window
    this.received = 0;             // bytes received in the capture window
    this.sent = 0;                 // bytes sent in the capture window
    this.capturing = false;
    /* slow-circle mover (like e2e-play): plausible ~1 m/s */
    this.cx = cx; this.cz = cz; this.r = moving ? r : 0;
    this.moving = moving;
    this.angle = 0;
    this.x = cx + this.r; this.z = cz;
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
        else if (type === TYPE_WORLD) this.worldLen = buf.length;
        else if (type === TYPE_EDIT_SYNC) this.editSyncLen = buf.length;
        else if (type === TYPE_TICK && this.capturing) this.tickLens.push(buf.length);
        if (this.capturing) this.received += buf.length;
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buf);
      if (this.capturing) this.sent += buf.byteLength;
    }
  }
  /* 30 Hz state upload (what every real tab does in sendStateLoop); the
     mover additionally walks a slow circle so the stamp stays live. */
  startUpload() {
    this.sendState(this.x, 1, this.z, 0);
    this.uploader = setInterval(() => {
      if (this.moving) {
        this.angle += 0.5 / 30;
        this.x = this.cx + this.r * Math.cos(this.angle);
        this.z = this.cz + this.r * Math.sin(this.angle);
      }
      this.sendState(this.x, 1, this.z, this.angle);
    }, 33);
  }
  stopUpload() { if (this.uploader) { clearInterval(this.uploader); this.uploader = null; } }
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
  close() { this.stopUpload(); if (this.ws) this.ws.close(); }
}

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
  const dir = mkdtempSync('/tmp/vivs-perf-');
  const relay = new Relay(dir);
  const clients = [];
  try {
    /* set up the relay CWD: binary + certs + cfg (port 3013) */
    cpSync(BIN, join(dir, 'VibeSurvivorsPlugin'));
    cpSync(join(PLUGIN_DIR, 'certs'), join(dir, 'certs'), { recursive: true });
    mkdirSync(join(dir, 'web'), { recursive: true });
    writeFileSync(join(dir, 'Server.cfg'),
      `port = ${PORT}\nwebRoot = web\nserverTickRate = 30.0f\n` +
      `useCompression = true\nreconnectTimeoutSeconds = 30\n`);

    await relay.start();

    const A = new Client('A', CAMP.x, CAMP.z, 3, true);   // the slow mover
    const B = new Client('B', SPAWN.x, SPAWN.z, 0, false);
    const C = new Client('C', 146, 150, 0, false);
    clients.push(A, B, C);
    await Promise.all([A.connect(), B.connect(), C.connect()]);
    await Promise.all([A, B, C].map((c) =>
      c.waitFor(() => c.publicId !== null || c.joinError !== null, `${c.tag} join result`)));
    for (const c of [A, B, C]) {
      if (c.joinError) throw new Error(`${c.tag} join error: ${c.joinError}`);
      await c.waitFor(() => c.worldLen !== null, 'world block');
      if (c.worldLen !== WORLD_MSG_BYTES)
        throw new Error(`${c.tag}: join world block is ${c.worldLen} B, expected ${WORLD_MSG_BYTES}`);
    }
    for (const c of [A, B, C]) c.startUpload();
    await sleep(3000);   // settle: animals/clock steady, first uploads accepted

    /* ---- steady capture window ---- */
    const durMs = 12000;
    for (const c of clients) c.capturing = true;
    const t0 = Date.now();
    await sleep(durMs);
    for (const c of clients) c.capturing = false;
    const secs = (Date.now() - t0) / 1000;

    const stats = clients.map((c) => {
      const lens = c.tickLens;
      const min = Math.min(...lens);
      const max = Math.max(...lens);
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const tickBytes = lens.reduce((a, b) => a + b, 0);
      return {
        tag: c.tag,
        ticks: lens.length,
        tickMin: min, tickMax: max, tickMean: mean,
        downlink: c.received / secs,
        uplink: c.sent / secs,
        tickBps: tickBytes / secs,
      };
    });

    console.log('M41 payload perf (fresh relay :3013, 3 clients: 1 mover + 2 keepalive, ' +
      `${secs.toFixed(1)} s steady window):`);
    console.log(`  join: world block = ${WORLD_MSG_BYTES} B (type 33 message) on all 3 clients; ` +
      `EDIT_SYNC = ${[A, B, C].map((c) => c.editSyncLen ?? 'absent (empty)').join(' / ')}`);
    for (const s of stats) {
      console.log(`  ${s.tag}: ticks=${s.ticks}  tick min/mean/max = ${s.tickMin} / ${s.tickMean.toFixed(0)} / ${s.tickMax} B  ` +
        `downlink = ${s.downlink.toFixed(0)} B/s  uplink = ${s.uplink.toFixed(0)} B/s`);
    }
    const maxTick = Math.max(...stats.map((s) => s.tickMax));
    const maxDown = Math.max(...stats.map((s) => s.downlink));
    const maxUp = Math.max(...stats.map((s) => s.uplink));
    const avgTickBps = stats.reduce((a, s) => a + s.tickBps, 0) / stats.length;
    console.log(`  relay tick extrapolation (one tick is broadcast to every client): ` +
      `10 clients ~ ${(avgTickBps * 10 / 1024).toFixed(1)} KB/s, ` +
      `25 clients ~ ${(avgTickBps * 25 / 1024).toFixed(1)} KB/s`);

    /* ---- budget asserts ---- */
    if (maxTick >= MAX_TICK_BUDGET)
      throw new Error(`max tick ${maxTick} B exceeds the ${MAX_TICK_BUDGET} B budget`);
    if (maxDown >= DOWNLINK_BUDGET)
      throw new Error(`max per-client downlink ${maxDown.toFixed(0)} B/s exceeds the ${DOWNLINK_BUDGET} B/s budget`);
    if (maxUp >= UPLINK_BUDGET)
      throw new Error(`max per-client uplink ${maxUp.toFixed(0)} B/s exceeds the ${UPLINK_BUDGET} B/s budget`);
    for (const s of stats)
      if (s.ticks < 200)
        throw new Error(`${s.tag}: only ${s.ticks} ticks in ${secs.toFixed(1)} s - the capture window is not steady`);

    console.log(`E2E_OK - M41: payload perf within budget (tick max ${maxTick} B < ${MAX_TICK_BUDGET}, ` +
      `downlink ${maxDown.toFixed(0)} B/s < ${DOWNLINK_BUDGET} per client, uplink ${maxUp.toFixed(0)} B/s < ${UPLINK_BUDGET} per client)`);
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
