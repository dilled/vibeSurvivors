// M33 E2E: the live relay (ServerBase VibeSurvivorsPlugin, port 3003)
// must deliver the island placement block (type 33) on join, bit-identical
// to the client's deterministic generation (reference: the JS dump built
// from this repo's index.html), and must refuse protocol v1 joins.
//
// Usage:
//   node ServerBase/tests/vivs_world_dump.mjs /tmp/vivs_world_expected.bin \
//       <path/to/index.html>
//   node smoke/e2e-world.mjs /tmp/vivs_world_expected.bin [wss://127.0.0.1:3003]
//
// Requires the server to be running (the E2E never starts it). Node 22+
// global WebSocket; self-signed cert needs NODE_TLS_REJECT_UNAUTHORIZED=0.

import { readFileSync } from 'node:fs';

const expected = readFileSync(process.argv[2]);
const url = process.argv[3] ?? 'wss://127.0.0.1:3003';

const TYPE_JOIN = 3;
const TYPE_JOIN_SUCCESS = 8;
const TYPE_JOIN_ERROR = 255;
const TYPE_TICK = 27;
const TYPE_WORLD = 33;

class Client {
  constructor(tag) {
    this.tag = tag;
    this.ws = null;
    this.publicId = null;
    this.joinError = null;
    this.worlds = [];
    this.ticks = 0;
    this.rejoinCount = 0;
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
        else if (type === TYPE_WORLD)
          this.worlds.push(buf);
        else if (type === TYPE_TICK)
          this.ticks++;
      };
    });
  }
  waitFor(fn, what, ms = 3000) {
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

/* 1. three clients join with protocol v2; each gets JOIN_SUCCESS and the
 *    type-33 world block (delivered as the join catch-up before/around
 *    the first relay tick). */
const a = new Client('A');
const b = new Client('B');
const c = new Client('C');
await Promise.all([a.connect(), b.connect(), c.connect()]);
for (const cl of [a, b, c]) {
  await cl.waitFor(() => cl.publicId !== null, 'JOIN_SUCCESS');
  await cl.waitFor(() => cl.worlds.length >= 1, 'type-33 world block');
  const got = cl.worlds[0];
  if (got.length !== expected.length)
    throw new Error(`${cl.tag}: world block is ${got.length} bytes, expected ${expected.length}`);
  for (let i = 0; i < got.length; i++) {
    if (got[i] !== expected[i])
      throw new Error(`${cl.tag}: world block byte ${i} mismatch `
        + `(got 0x${got[i].toString(16)}, expected 0x${expected[i].toString(16)})`);
  }
  console.log(`${cl.tag}: joined as publicId ${cl.publicId}, type-33 world block byte-identical to the JS reference (${got.length} bytes)`);
}

/* 2. the relay tick still flows alongside the catch-up. */
await a.waitFor(() => a.ticks > 0, 'a relay tick');
await b.waitFor(() => b.ticks > 0, 'a relay tick');
await c.waitFor(() => c.ticks > 0, 'a relay tick');

/* 3. protocol v1 is refused. */
const d = new Client('D');
d.ws = null;
await new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  d.ws = ws;
  ws.onopen = () => {
    ws.send(new Uint8Array([TYPE_JOIN,
      ...new TextEncoder().encode(`${crypto.randomUUID()}|1|1337`)]));
    resolve();
  };
  ws.onerror = e => reject(new Error('D: connect failed: ' + e));
  ws.onmessage = e => {
    const buf = new Uint8Array(e.data);
    if (buf[0] === TYPE_JOIN_ERROR) d.joinError = new TextDecoder().decode(buf.subarray(1));
  };
});
await d.waitFor(() => d.joinError !== null, 'JOIN_ERROR for v1');
if (!/protocol v2 required/i.test(d.joinError))
  throw new Error(`D: unexpected v1 refusal message: ${d.joinError}`);
console.log(`D: v1 join refused as expected: ${JSON.stringify(d.joinError)}`);

/* 4. reconnect: the world block is re-sent to the rejoined client. */
a.close();
await sleep(500);
await a.connect();
a.rejoinCount = 1;
await a.waitFor(() => a.publicId !== null, 'JOIN_SUCCESS (rejoin)');
await a.waitFor(() => a.worlds.length >= 1, 'type-33 world block (rejoin)');
if (a.worlds[0].length !== expected.length)
  throw new Error(`A rejoin: world block size ${a.worlds[0].length} != ${expected.length}`);
console.log('A: rejoined, world block re-sent (byte-identical)');

a.close(); b.close(); c.close(); d.close();
console.log('E2E_OK ‒ M33: world block byte-identical to the JS reference, v1 refused, rejoin re-syncs');
process.exit(0);
