// VibeSurvivors multiplayer client (M27: connect + relay protocol only).
//
// Enable by loading the page with ?mp=host:port (or a full wss:// URL).
// Protocol v1 (keep in sync with
// ServerBase/VibeSurvivorsPlugin/include/VibeSurvivorsPlugin/NetState.hpp):
//   type 3   MSG_JOIN          utf8 "playerId|1|seed"
//   type 8   MSG_JOIN_SUCCESS  u32 publicId (big-endian — the one BE field)
//   type 255 MSG_JOIN_ERROR    utf8 message
//   type 26  MSG_VIVS_STATE    u32 publicId LE (server overwrites),
//                              f32 x,y,z,yaw LE, u8 state (bit0 underwater)  [21B]
//   type 27  MSG_VIVS_TICK     u8 flags, u32 authorityPublicId LE, then sections:
//                                bit0: u32 tickId, u32 count, count * 21B state  (players)
//                                bit1: u32 count, count * 19B edit    (M29, skipped)
//                                bit2: u32 count, count * 24B animal (M30, skipped)
//                                bit3: u32 count, u32 publicId, u32 len, utf8   (names)
//                                bit4: reserved (time authority, M28+)
//   type 31  MSG_VIVS_NAME     utf8 display name
//
// Relay model: the server does not simulate. The FIRST joined client with a
// fresh state is the world authority; the island is generated locally from the
// shared seed. Presence rendering of the remotes map is M28; this module only
// connects, uploads 30 Hz state, and stores the latest tick data.
//
// Every VIVS field is little-endian except the MSG_JOIN_SUCCESS publicId.

const MSG_JOIN = 3;
const MSG_JOIN_SUCCESS = 8;
const MSG_JOIN_ERROR = 255;
const MSG_VIVS_STATE = 26;
const MSG_VIVS_TICK = 27;
const MSG_VIVS_NAME = 31;
const PROTOCOL_VERSION = 1;
const STATE_BYTES = 21;
const EDIT_BYTES = 19;       // M29 VivsWorldEdit — skipped
const ANIMAL_BYTES = 24;     // M30 VivsAnimalState — skipped
const TICK_PLAYERS = 1 << 0;
const TICK_EDITS = 1 << 1;
const TICK_ANIMALS = 1 << 2;
const TICK_NAMES = 1 << 3;
const TICK_TIME = 1 << 4;
const STATE_UNDERWATER = 1 << 0;
const SEND_RATE = 30;

const NAMES = [
  'Mossy', 'Gravel', 'Sunny', 'Wooly', 'Snappy', 'Pebble', 'Dusty', 'Zesty',
  'Cranky', 'Bubbly', 'Steady', 'Wobbly', 'Gritty', 'Fluffy', 'Chatty', 'Salty',
];
const CREATURES = ['Hermit', 'Mariner', 'Castaway', 'Drifter', 'Shoal', 'Tide'];

export function attachMultiplayer(
    { rig, url, seed, displayName: chosenName, inWater, onTick }) {
  const wsUrl = /^wss?:\/\//i.test(url) ? url : `wss://${url}`;

  let ws = null;
  let publicId = 0;
  let sendTimer = 0;
  let reconnectDelay = 1000;
  let closedByUs = false;
  let joined = false;

  // Per-TAB identity (NOT localStorage): two tabs in the same browser are
  // two different players and must not collide in the server's player map.
  const remoteId = crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  // Player-chosen name (first-time prompt, stored in localStorage by the
  // caller); empty means "give me a random one".
  const displayName = (chosenName ?? '').trim().slice(0, 24)
    || `${NAMES[(Math.random() * NAMES.length) | 0]} ${CREATURES[(Math.random() * CREATURES.length) | 0]} ${100 + ((Math.random() * 900) | 0)}`;

  // Latest relayed remote players, keyed by publicId (excludes self; the
  // M28 presence renderer reads this). {x, y, z, yaw, underwater, name}
  const remotes = new Map();
  let authorityId = 0;

  /* ------------------------------ HUD ------------------------------ */
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;right:8px;z-index:15;color:#9fd87a;'
    + 'font-family:monospace;font-size:13px;pointer-events:none;text-shadow:0 0 4px #000;';
  document.body.appendChild(hud);
  let statusText = 'MP connecting…';
  const setStatus = s => {
    statusText = s;
    hud.textContent = s;
  };

  /* ---------------------------- messaging --------------------------- */
  function buildState() {
    const buf = new ArrayBuffer(1 + STATE_BYTES);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    u8[0] = MSG_VIVS_STATE;
    dv.setUint32(1, publicId, true);          // server overwrites
    dv.setFloat32(5, rig.position.x, true);
    dv.setFloat32(9, rig.position.y, true);
    dv.setFloat32(13, rig.position.z, true);
    dv.setFloat32(17, rig.rotation.y, true);
    u8[1 + STATE_BYTES - 1] = inWater() ? STATE_UNDERWATER : 0;
    return buf;
  }

  function sendName() {
    const bytes = new TextEncoder().encode(displayName);
    const buf = new Uint8Array(1 + bytes.length);
    buf[0] = MSG_VIVS_NAME;
    buf.set(bytes, 1);
    ws.send(buf);
  }

  function onTickMessage(dv, len) {
    const flags = dv.getUint8(1);
    authorityId = dv.getUint32(2, true);
    let off = 6;
    const seen = new Set();
    if (flags & TICK_PLAYERS) {
      const tickId = dv.getUint32(off, true); off += 4;
      const count = dv.getUint32(off, true); off += 4;
      for (let i = 0; i < count && off + STATE_BYTES <= len; i++) {
        const id = dv.getUint32(off, true);
        seen.add(id);
        const p = remotes.get(id) || {};
        p.x = dv.getFloat32(off + 4, true);
        p.y = dv.getFloat32(off + 8, true);
        p.z = dv.getFloat32(off + 12, true);
        p.yaw = dv.getFloat32(off + 16, true);
        p.underwater = (dv.getUint8(off + 20) & STATE_UNDERWATER) !== 0;
        remotes.set(id, p);
        off += STATE_BYTES;
      }
      // Section order is fixed even for skipped sections; tickId is
      // reported once per tick, after the players section it belongs to.
      onTick && onTick(tickId, remotes, authorityId);
    }
    if (flags & TICK_EDITS) {
      if (off + 4 > len) return;
      off += 4 + dv.getUint32(off, true) * EDIT_BYTES;   // M29 — skip
      if (off > len) return;
    }
    if (flags & TICK_ANIMALS) {
      if (off + 4 > len) return;
      off += 4 + dv.getUint32(off, true) * ANIMAL_BYTES; // M30 — skip
      if (off > len) return;
    }
    if (flags & TICK_NAMES) {
      if (off + 4 > len) return;
      const count = dv.getUint32(off, true); off += 4;
      for (let i = 0; i < count && off + 8 <= len; i++) {
        const id = dv.getUint32(off, true); off += 4;
        const nameLen = dv.getUint32(off, true); off += 4;
        if (off + nameLen > len) break;
        const name = new TextDecoder().decode(new Uint8Array(dv.buffer, dv.byteOffset + off, nameLen));
        if (remotes.has(id)) remotes.get(id).name = name;
        off += nameLen;
      }
    }
    // flags bit4 (TICK_TIME) has no payload yet — nothing to consume.
    // Drop remotes the server no longer relays (left the session).
    for (const id of remotes.keys())
      if (id === publicId || !seen.has(id)) remotes.delete(id);
  }

  function onBinary(data) {
    if (!(data instanceof ArrayBuffer) || data.byteLength < 2) return;
    const dv = new DataView(data);
    const type = dv.getUint8(0);
    const len = data.byteLength;
    if (type === MSG_JOIN_SUCCESS) {
      publicId = dv.getUint32(1, false);       // the one big-endian field
      joined = true;                           // M28: presence visibility gate
      setStatus(`MP connected as ${displayName} (id ${publicId})`);
      sendName();
      return;
    }
    if (type === MSG_JOIN_ERROR) {
      const msg = new TextDecoder().decode(new Uint8Array(data, 1));
      setStatus(`MP join failed: ${msg}`);
      return;
    }
    if (type === MSG_VIVS_TICK) onTickMessage(dv, len);
  }

  function sendStateLoop() {
    clearInterval(sendTimer);
    sendTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(buildState());
    }, 1000 / SEND_RATE);
  }

  function connect() {
    try { ws = new WebSocket(wsUrl); } catch (e) { return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      const payload = new TextEncoder().encode(`${remoteId}|${PROTOCOL_VERSION}|${seed}`);
      const buf = new Uint8Array(1 + payload.length);
      buf[0] = MSG_JOIN;
      buf.set(payload, 1);
      ws.send(buf);
    };
    ws.onmessage = async e => {
      let data = e.data;
      if (data && data.arrayBuffer) data = await data.arrayBuffer();   // Node/undici deliver Blobs
      if (data instanceof ArrayBuffer) onBinary(data);
    };
    ws.onclose = () => {
      clearInterval(sendTimer);
      sendTimer = 0;
      joined = false;                          // M28: hide presence while rejoining
      if (closedByUs) return;
      setStatus('MP disconnected…');
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.6, 10000);
    };
    ws.onerror = () => {};
  }

  connect();
  sendStateLoop();

  return {
    remoteId,
    displayName,
    get publicId() { return publicId; },
    get authorityId() { return authorityId; },
    remotes,
    connected: () => joined && !!ws && ws.readyState === WebSocket.OPEN,   // M28: presence gate
    status: () => statusText,
    close() {
      closedByUs = true;
      clearInterval(sendTimer);
      if (ws) ws.close();
      hud.remove();
    },
  };
}
