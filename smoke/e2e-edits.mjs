// M39 E2E: server applies + validates world edits against its world store.
// The live relay (ServerBase VibeSurvivorsPlugin, port 3003) must:
//   (a) ACCEPT valid edits (camp, shelter, palm shakes, plant harvests) and
//       relay them in every tick's bit-1 section, byte-identical across tabs
//       (publicId server-stamped - the convergence check);
//   (b) REJECT invalid edits with an explicit reason (type 34 to the sender
//       only) and NEVER relay them: a spent-palm shake, a wrong-payload shake,
//       a harvest of a depleted plant, and a structure build >10u from the
//       camp are all refused against the server's own world store;
//   (c) drop follower edits outright (M29 authority gate, no type-34);
//   (d) replay the ACCEPTED edits (and only them) as the type-30 EDIT_SYNC
//       catch-up for a late-joining 4th tab.
// Data-level convergence, the M27-M38 precedent (no chrome).
//
// Usage:
//   # from ServerBase (branch feat/vibecraft-server-authoritative):
//   #   cmake --build build-linux --target VibeSurvivorsPlugin
//   #   ./build-linux/VibeSurvivorsPlugin/VibeSurvivorsPlugin   # stays up on :3003
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node smoke/e2e-edits.mjs [wss://127.0.0.1:3003]
//
// The E2E never starts the server. Node 22+ global WebSocket; the self-
// signed cert needs NODE_TLS_REJECT_UNAUTHORIZED=0.

const url = process.argv[2] ?? 'wss://127.0.0.1:3003';

const TYPE_JOIN = 3;
const TYPE_JOIN_SUCCESS = 8;
const TYPE_JOIN_ERROR = 255;
const TYPE_STATE = 26;
const TYPE_TICK = 27;
const TYPE_EDIT = 28;
const TYPE_EDIT_SYNC = 30;
const TYPE_WORLD = 33;
const TYPE_EDIT_REJECT = 34;   // M39: [34][23B edit (stamped)][u16 reasonLen LE][utf8]

const TICK_PLAYERS = 1 << 0;
const TICK_EDITS   = 1 << 1;
const STATE_BYTES = 21;
const EDIT_BYTES = 23;

/* The seed-1337 island: the camp spot found by the smoke-side campCheck scan
 * (the client's campCheck ported to a plain scan), and the spawn next door. */
const CAMP = { x: 142.634, z: 146.969, rot: 0.4 };
const SPAWN = { x: 143.382, z: 147.632 };

/* Parse the tick's bit-1 edit section -> array of 23B Uint8Array slices. */
function parseEdits(buf) {
  const flags = buf[1];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 6;   // type(1) + flags(1) + authority(4)
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

function buildEdit(publicId, kind, entityIndex, payload = []) {
  const buf = new Uint8Array(1 + EDIT_BYTES);
  const dv = new DataView(buf.buffer);
  buf[0] = TYPE_EDIT;
  dv.setUint32(1, publicId, true);
  dv.setUint32(5, entityIndex, true);
  buf[9] = kind;
  buf[10] = 0;
  for (let i = 0; i < payload.length; i++) buf[11 + i] = payload[i];
  return buf;
}
const f32 = (v) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, v, true);   // LITTLE-endian (server wire format)
  return b;   // Uint8Array, so `+` is still string - concat via .set below
};
const campPayload = () => {
  const p = new Uint8Array(12);
  p.set(f32(CAMP.x), 0);
  p.set(f32(CAMP.z), 4);
  p.set(f32(CAMP.rot), 8);
  return p;
};

/* The relayed (server-stamped) 23B edit body, for byte comparisons. */
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
    this.ticks = [];          // {edits: [23B] | null, t}
    this.rejects = [];        // {entityIndex, kind, reason, t}
    this.world = null;
    this.editSync = null;     // [23B] from the type-30 catch-up
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
          this.ticks.push({ edits: parseEdits(buf), t: Date.now() });
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      this.ws.send(buildEdit(this.publicId, kind, entityIndex, payload));
  }
  /* All edit bodies relayed in the last `n` ticks of this tab. */
  recentEdits(n) {
    const out = [];
    for (const tk of this.ticks.slice(-n))
      if (tk.edits && tk.edits.length) out.push(...tk.edits);
    return out;
  }
  waitFor(fn, what, ms = 8000) {
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
  close() {
    if (this.ws) this.ws.close();
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const A = new Client('A', CAMP.x, CAMP.z);      // authority: at the camp spot
  const B = new Client('B', SPAWN.x, SPAWN.z);    // follower 1
  const C = new Client('C', SPAWN.x, SPAWN.z);    // follower 2
  const allClients = [A, B, C];   // closed in finally so a failed run leaks no authority
  await Promise.all([A.connect(), B.connect(), C.connect()]);
  await Promise.all([A, B, C].map((c) =>
    c.waitFor(() => c.publicId !== null || c.joinError !== null, `${c.tag} join result`)));
  for (const c of [A, B, C]) {
    if (c.joinError) throw new Error(`${c.tag} join error: ${c.joinError}`);
    if (c.publicId === null) throw new Error(`${c.tag} did not join`);
  }
  // A keeps its state fresh (authority liveness + the structures' 10u gate
  // read A's last ACCEPTED transform).
  A.sendState(A.x, 1, A.z, 0.5);
  B.sendState(B.x, 1, B.z, 0);
  C.sendState(C.x, 1, C.z, 0);
  let aState = setInterval(() => A.sendState(A.x, 1, A.z, 0.5), 100);
  try {
  await A.waitFor(() => A.ticks.length > 0, 'first tick');

  const relayTabs = [A, B, C];
  /* A valid edit is done when ALL three tabs relay the exact stamped body. */
  const expectRelay = (c, tag, body, what) =>
    Promise.all(relayTabs.map((t) =>
      t.waitFor(() => t.recentEdits(6).some((e) => bufEq(e, body)),
        `${tag}: relayed ${what}`))).then(() => body);

  const accepted = [];   // relayed stamped 23B bodies, in send order

  /* ---- (a) valid edits: accepted + relayed byte-identical across tabs ---- */

  // camp: f32 x,z,rot payload
  const campBody = editBody(A.publicId, 2, 0, campPayload());
  A.sendEdit(2, 0, campPayload());
  await expectRelay(A, 'camp', campBody, 'the camp edit');
  accepted.push(campBody);

  // shelter while A stands at the camp (0u away <= 10u)
  const shelterBody = editBody(A.publicId, 3, 0);
  A.sendEdit(3, 0);
  await expectRelay(A, 'shelter', shelterBody, 'the shelter edit');
  accepted.push(shelterBody);

  // palm 0: two valid shakes (2 -> 1 -> 0), each relayed
  for (const want of [1, 0]) {
    const body = editBody(A.publicId, 0, 0, [want]);
    A.sendEdit(0, 0, [want]);
    await expectRelay(A, `palm shake (${want})`, body, `the palm shake to ${want}`);
    accepted.push(body);
  }

  // plant 0 (first fiber: ready at init, 3 charges): harvest down to depleted
  for (const want of [2, 1, 0]) {
    const body = editBody(A.publicId, 1, 0, [want]);
    A.sendEdit(1, 0, [want]);
    await expectRelay(A, `plant harvest (${want})`, body, `the harvest to ${want}`);
    accepted.push(body);
  }

  /* ---- (b) invalid edits: rejected with a reason, NEVER relayed ---- */

  const expectReject = (tag, what, kindMatch, reasonSub) =>
    A.waitFor(() => A.rejects.some((r) =>
        (kindMatch === null || r.kind === kindMatch) && r.reason.includes(reasonSub)),
      `${tag}: rejected ${what}`)
      .then(() => {
        const r = A.rejects.find((r) =>
          (kindMatch === null || r.kind === kindMatch) && r.reason.includes(reasonSub));
        if (r.publicId !== A.publicId)
          throw new Error(`${tag}: reject carries the wrong publicId`);
        return r;
      });

  const expectNotRelayed = async (what, body) => {
    const idx = relayTabs.map((t) => t.ticks.length);
    await sleep(400);   // a few ticks: the relay (had it happened) would be in
    for (const t of relayTabs) {
      if (!t.ticks.slice(idx[relayTabs.indexOf(t)]).some((tk) =>
            tk.edits && tk.edits.some((e) => bufEq(e, body))))
        continue;
      throw new Error(`${what} WAS relayed to ${t.tag} - rejected edits must never be relayed`);
    }
  };

  // 1. shake the spent palm (0 cocos): "has 0 coconuts"
  const spent = editBody(A.publicId, 0, 0, [1]);
  A.sendEdit(0, 0, [1]);
  await expectReject('spent palm', 'palm 0 (already dry)', 0, 'has 0 coconuts');
  await expectNotRelayed('the spent-palm shake', spent);

  // 2. wrong payload on a live palm (palm 1 has 2): "edit says"
  const wrong = editBody(A.publicId, 0, 1, [5]);
  A.sendEdit(0, 1, [5]);
  await expectReject('wrong payload', 'palm 1 (payload 5)', 0, 'edit says');
  await expectNotRelayed('the wrong-payload shake', wrong);

  // 3. harvest the depleted plant 0: "is not ready"
  const notReady = editBody(A.publicId, 1, 0, [0]);
  A.sendEdit(1, 0, [0]);
  await expectReject('depleted plant', 'plant 0 (depleted)', 1, 'is not ready');
  await expectNotRelayed('the depleted-plant harvest', notReady);

  // 4. a second camp: "a camp already exists"
  const secondCamp = editBody(A.publicId, 2, 0, campPayload());
  A.sendEdit(2, 0, campPayload());
  await expectReject('second camp', 'a duplicate camp', 2, 'a camp already exists');
  await expectNotRelayed('the second camp', secondCamp);

  // 5. walk A 12.5u from the camp, then build the bed: "build by your camp".
  //    The 100ms keepalive would re-broadcast each 2.5u increment at 25u/s
  //    (implausible), so it is paused during the walk; the walk itself sends
  //    a state every 250ms (2.5u per 0.25s = 10u/s, under the 12u/s budget).
  clearInterval(aState);
  await sleep(300);   // let the dt from the last accepted state grow so the first 2.5u step is < 12u/s
  for (let k = 1; k <= 5; k++) {
    A.x += 2.5;
    A.sendState(A.x, 1, A.z, 0.5);
    await sleep(250);
  }
  aState = setInterval(() => A.sendState(A.x, 1, A.z, 0.5), 100);
  const farBuild = editBody(A.publicId, 4, 0);
  A.sendEdit(4, 0);
  await expectReject('far build', 'the bed 12.5u from camp', 4, 'build by your camp');
  await expectNotRelayed('the far bed build', farBuild);

  // 6. a spent-palm wind drop can only come from a storm; out of scope here,
  //    but the store's cocos>0 guard keeps the two sides in sync (gtest).

  /* ---- (c) follower edits are dropped outright (M29) ---- */
  const followerCamp = editBody(B.publicId, 2, 0, campPayload());
  B.sendEdit(2, 0, campPayload());
  await sleep(400);
  if (relayTabs.some((t) => t.recentEdits(6).some((e) => bufEq(e, followerCamp))))
    throw new Error('a follower edit was relayed - the M29 authority gate is gone');
  if (B.rejects.length > 0)
    throw new Error('a follower edit got a type-34 - non-authority edits are dropped, not rejected');

  /* ---- (d) the late joiner replays the ACCEPTED history only ---- */
  const D = new Client('D', SPAWN.x, SPAWN.z);
  allClients.push(D);
  await D.connect();
  await D.waitFor(() => D.publicId !== null || D.joinError !== null, 'D join result');
  if (D.joinError) throw new Error(`D join error: ${D.joinError}`);
  await D.waitFor(() => D.editSync !== null, 'EDIT_SYNC catch-up');
  if (!D.world || D.world[0] !== TYPE_WORLD)
    throw new Error('D did not receive the world block before the edit sync');
  if (D.editSync.length !== accepted.length)
    throw new Error(`D's edit sync has ${D.editSync.length} edits, expected ${accepted.length}`);
  accepted.forEach((body, i) => {
    if (!bufEq(D.editSync[i], body))
      throw new Error(`D's edit sync[${i}] is not byte-identical to the relayed edit #${i + 1}`);
  });

  console.log(`${accepted.length} valid edits relayed byte-identical across all three tabs`);
  console.log('5 invalid edits rejected with explicit reasons (palm dry / wrong payload / plant depleted / duplicate camp / build 12.5u from camp) - none relayed');
  console.log('follower edit dropped by the M29 authority gate (no relay, no type-34)');
  console.log(`late joiner D replayed all ${accepted.length} accepted edits byte-identically (type-30)`);
  console.log('E2E_OK - M39: edits validated server-side against the world store; invalid edits rejected + never relayed; valid edits converge identically');
  } finally {
    clearInterval(aState);
    for (const c of allClients) c.close();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('E2E_FAIL:', e.message);
  process.exit(1);
});
