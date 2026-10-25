// VibeSurvivors multiplayer client (M27: connect + relay; M29: world edits
// + the authority's game clock; M30: the authority's animal snapshot;
// M33: protocol v2 ‒ the server ships its island placement block, type 33,
// to every (re)joining client).
//
// Enable by loading the page with ?mp=host:port (or a full wss:// URL).
// Protocol v2 (keep in sync with
// ServerBase/VibeSurvivorsPlugin/include/VibeSurvivorsPlugin/WorldGen.hpp):
//   type 3   MSG_JOIN          utf8 "playerId|2|seed"
//   type 8   MSG_JOIN_SUCCESS  u32 publicId (big-endian — the one BE field)
//   type 255 MSG_JOIN_ERROR    utf8 message
//   type 26  MSG_VIVS_STATE    u32 publicId LE (server overwrites),
//                              f32 x,y,z,yaw LE, u8 state (bit0 underwater)  [21B]
//   type 27  MSG_VIVS_TICK     u8 flags, u32 authorityPublicId LE, then sections:
//                                bit0: u32 tickId, u32 count, count * 21B state  (players)
//                                bit1: u32 count, count * 23B edit   (M29)
//                                bit2: u32 count, count * 24B animal (M30)
//                                bit3: u32 count, u32 publicId, u32 len, utf8   (names)
//                                bit4: f32 gameMin LE (M29/M37: the SERVER's
//                                      clock - the server owns time, always
//                                      present, every tab adopts it)
//                                bit5: u8 state, u32 nEvents, nEvents *
//                                      (u8 kind, f32 t, f32 a, f32 b) (M37:
//                                      the server-owned weather schedule;
//                                      state 0=clear 1=cloudy 2=rain
//                                      3=storm; kind 0=strike a=x b=z,
//                                      1=wind drop a=palmIdx b=0; t is the
//                                      ABSOLUTE gameMin; nEvents=0 outside
//                                      storms - the active storm seg's full
//                                      event list, so every tab fires the
//                                      identical storm beats)
//   type 28  MSG_VIVS_EDIT     u32 publicId LE, u32 entityIndex LE, u8 kind,
//                              u8 action, 12B kind-specific payload   [23B]
//   type 29  MSG_VIVS_ANIMALS  u32 count, count * 24B animal (authority upload, M30);
//                              animal 24B: u16 slot LE, u8 type, u8 flags,
//                              f32 x,y,z,yaw LE, u8 state (bit0 dead), 3 pad
//   type 30  MSG_VIVS_EDIT_SYNC u32 count, count * 23B edit (join catch-up, M29)
//   type 31  MSG_VIVS_NAME     utf8 display name
//   type 32  MSG_VIVS_TIME     f32 gameMin LE (30 Hz upload; M37: plausibility
//                              only - the server no longer adopts it)
//   type 33  MSG_VIVS_WORLD    island placement block (server-owned, M33), one-shot
//                              per join: [u32 seed][u32 palmCount][palm 6xf64: x,z,
//                              groundH,trunkH,tx,tz][u32 treeCount][tree 11xf64: x,z,
//                              groundH,trunkH,canopyS,off0..2,len0..2][u32 rockCount]
//                              [rock 5xf64: x,z,groundH,s,sy][u16 speciesCount]
//                              [species: u16 keyLen, utf8 key, u32 ptCount, 3xf64 x,z,h]
//
// Relay model: the server does not simulate. The FIRST joined client with a
// fresh state is the world authority; the island is generated locally from the
// shared seed. Presence rendering of the remotes map is M28. M29: the
// authority uploads every world edit (sendEdit) + its clock; the server
// relays both (tick bit1/bit4) and replays the full edit history to
// late joiners (EDIT_SYNC). The page wires onEdit/onEditSync/onTime into
// deterministic apply functions and locks followers out of world mutations.
// M30: the authority also uploads its whole animal snapshot 30 Hz
// (MSG_VIVS_ANIMALS); the server relays it in tick bit2 and followers
// overwrite their local animals from it (the animals ARE the events: panic,
// steals and strikes ride on the snapshot).
//
// Every VIVS field is little-endian except the MSG_JOIN_SUCCESS publicId.

const MSG_JOIN = 3;
const MSG_JOIN_SUCCESS = 8;
const MSG_JOIN_ERROR = 255;
const MSG_VIVS_STATE = 26;
const MSG_VIVS_TICK = 27;
const MSG_VIVS_EDIT = 28;
const MSG_VIVS_ANIMALS = 29;
const MSG_VIVS_EDIT_SYNC = 30;
const MSG_VIVS_NAME = 31;
const MSG_VIVS_TIME = 32;
const MSG_VIVS_WORLD = 33;   // M33: server island placement block
const PROTOCOL_VERSION = 2;   // M33: hard bump ‒ the server refuses v1 joins
const STATE_BYTES = 21;
const EDIT_BYTES = 23;       // M29 VivsWorldEdit
const EDIT_PAYLOAD_BYTES = 12; // kind-specific edit payload (camp = 3xf32)
const ANIMAL_BYTES = 24;     // M30 VivsAnimalState
const WEATHER_EVENT_BYTES = 13; // M37 u8 kind + 3 LE f32 (must match NetState.hpp)
const TICK_PLAYERS = 1 << 0;
const TICK_EDITS = 1 << 1;
const TICK_ANIMALS = 1 << 2;
const TICK_NAMES = 1 << 3;
const TICK_TIME = 1 << 4;
const TICK_WEATHER = 1 << 5;   // M37: server-owned weather schedule
const STATE_UNDERWATER = 1 << 0;
const SEND_RATE = 30;

const NAMES = [
  'Mossy', 'Gravel', 'Sunny', 'Wooly', 'Snappy', 'Pebble', 'Dusty', 'Zesty',
  'Cranky', 'Bubbly', 'Steady', 'Wobbly', 'Gritty', 'Fluffy', 'Chatty', 'Salty',
];
const CREATURES = ['Hermit', 'Mariner', 'Castaway', 'Drifter', 'Shoal', 'Tide'];

export function attachMultiplayer(
    { rig, url, seed, displayName: chosenName, inWater, gameMin,
      onTick, onEdit, onEditSync, onTime, animals, onAnimals, onWorld }) {
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

  // M38: the SERVER's stamped transform for THIS tab (null until the first
  // own entry in a tick bit0 section). The server is the single source of
  // truth for player transforms: the page's mpSelfFrame() reconciles the
  // local rig to this stamp (lerp, or snap on >30u divergence) exactly like
  // mpRemotesFrame() does for remotes. {x, y, z, yaw, underwater}
  let selfState = null;

  // M30: latest relayed animal snapshot, keyed by slot (slot = type*64 +
  // populationIndex, deterministic per world seed). Wholesale-replaced on
  // every tick that carries the bit-2 section; the page's M30 layer reads
  // it. {slot, type, x, y, z, yaw, dead} (dead = state bit0).
  const animalMap = new Map();
  const isAuthority = () => publicId !== 0 && authorityId === publicId;

  // M33: the last island placement block received (type 33). The server
  // re-sends it on every (re)join, so it is always the current world.
  let world = null;

  // M37: the last relayed server weather state (null until the first
  // bit-5 section). {state: 'clear'|'cloudy'|'rain'|'storm',
  // events: [{kind, t, a, b}]} (events = the active storm seg's full list,
  // sorted by t; empty outside storms). The page's updateWeather fires the
  // event list (per-index done set, keyed by list identity) and
  // effectiveWeather() adopts the state.
  let weather = null;

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

  // Reads the [u32 publicId][u32 entityIndex][u8 kind][u8 action][12B payload]
  // fields of one 23B VivsWorldEdit at `off` and dispatches it.
  function dispatchEdit(dv, off, handler) {
    if (!handler) return;
    handler(
      dv.getUint32(off, true),
      dv.getUint32(off + 4, true),
      dv.getUint8(off + 8),
      dv.getUint8(off + 9),
      new Uint8Array(dv.buffer, dv.byteOffset + off + 10, EDIT_PAYLOAD_BYTES));
  }

  // M33: island placement block (see the header for the layout; keep in
  // sync with ServerBase VibeSurvivorsPlugin/include/WorldGen.hpp).
  function parseVivsWorld(dv, len) {
    const w = { seed: 0, palms: [], trees: [], rocks: [], species: [] };
    let off = 1;
    if (off + 4 > len) return w;
    w.seed = dv.getUint32(off, true); off += 4;
    let count = dv.getUint32(off, true); off += 4;
    for (let i = 0; i < count && off + 48 <= len; i++) {   // palm: 6 f64
      w.palms.push({
        x: dv.getFloat64(off, true), z: dv.getFloat64(off + 8, true),
        groundH: dv.getFloat64(off + 16, true), trunkH: dv.getFloat64(off + 24, true),
        tx: dv.getFloat64(off + 32, true), tz: dv.getFloat64(off + 40, true),
      });
      off += 48;
    }
    count = dv.getUint32(off, true); off += 4;
    for (let i = 0; i < count && off + 88 <= len; i++) {   // tree: 11 f64
      w.trees.push({
        x: dv.getFloat64(off, true), z: dv.getFloat64(off + 8, true),
        groundH: dv.getFloat64(off + 16, true), trunkH: dv.getFloat64(off + 24, true),
        canopyS: dv.getFloat64(off + 32, true),
        off: [dv.getFloat64(off + 40, true), dv.getFloat64(off + 48, true),
              dv.getFloat64(off + 56, true)],
        len: [dv.getFloat64(off + 64, true), dv.getFloat64(off + 72, true),
              dv.getFloat64(off + 80, true)],
      });
      off += 88;
    }
    count = dv.getUint32(off, true); off += 4;
    for (let i = 0; i < count && off + 40 <= len; i++) {   // rock: 5 f64
      w.rocks.push({
        x: dv.getFloat64(off, true), z: dv.getFloat64(off + 8, true),
        groundH: dv.getFloat64(off + 16, true), s: dv.getFloat64(off + 24, true),
        sy: dv.getFloat64(off + 32, true),
      });
      off += 40;
    }
    const spCount = dv.getUint16(off, true); off += 2;
    const dec = new TextDecoder();
    for (let i = 0; i < spCount; i++) {
      if (off + 2 > len) break;
      const keyLen = dv.getUint16(off, true); off += 2;
      if (off + keyLen + 4 > len) break;
      const key = dec.decode(new Uint8Array(dv.buffer, dv.byteOffset + off, keyLen));
      off += keyLen;
      const ptCount = dv.getUint32(off, true); off += 4;
      const pts = [];
      for (let j = 0; j < ptCount && off + 24 <= len; j++) {
        pts.push({
          x: dv.getFloat64(off, true), z: dv.getFloat64(off + 8, true),
          h: dv.getFloat64(off + 16, true),
        });
        off += 24;
      }
      w.species.push({ key, pts });
    }
    return w;
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
        if (id === publicId) {                 // M38: server-stamped self (captured BEFORE the self-exclusion drop loop)
          selfState = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, underwater: p.underwater };
        }
        off += STATE_BYTES;
      }
      // Section order is fixed even for skipped sections; tickId is
      // reported once per tick, after the players section it belongs to.
      onTick && onTick(tickId, remotes, authorityId);
    }
    if (flags & TICK_EDITS) {
      if (off + 4 > len) return;
      const count = dv.getUint32(off, true); off += 4;
      for (let i = 0; i < count && off + EDIT_BYTES <= len; i++) {
        dispatchEdit(dv, off, onEdit);
        off += EDIT_BYTES;
      }
      if (off > len) return;
    }
    if (flags & TICK_ANIMALS) {                          // M30: authority animals
      if (off + 4 > len) return;
      const count = dv.getUint32(off, true); off += 4;
      animalMap.clear();
      for (let i = 0; i < count && off + ANIMAL_BYTES <= len; i++) {
        const slot = dv.getUint16(off, true);
        animalMap.set(slot, {
          slot,
          type: dv.getUint8(off + 2),
          x: dv.getFloat32(off + 4, true),
          y: dv.getFloat32(off + 8, true),
          z: dv.getFloat32(off + 12, true),
          yaw: dv.getFloat32(off + 16, true),
          dead: (dv.getUint8(off + 20) & 1) !== 0,
          state: dv.getUint8(off + 20),   /* M36: raw byte ‒ fish schools carry n (0..12) */
        });
        off += ANIMAL_BYTES;
      }
      if (off > len) return;
      onAnimals && onAnimals(animalMap);
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
    if (flags & TICK_TIME) {                              // M29/M37: server clock
      if (off + 4 > len) return;
      const gm = dv.getFloat32(off, true); off += 4;
      onTime && onTime(gm);
    }
    if (flags & TICK_WEATHER) {                           // M37: server weather
      if (off + 5 > len) return;
      const wstates = ['clear', 'cloudy', 'rain', 'storm'];
      const wstate = dv.getUint8(off); off += 1;
      const nEv = dv.getUint32(off, true); off += 4;
      const evs = [];
      for (let i = 0; i < nEv && off + WEATHER_EVENT_BYTES <= len; i++) {
        evs.push({
          kind: dv.getUint8(off),
          t: dv.getFloat32(off + 1, true),
          a: dv.getFloat32(off + 5, true),
          b: dv.getFloat32(off + 9, true),
        });
        off += WEATHER_EVENT_BYTES;
      }
      weather = { state: wstates[wstate] || 'clear', events: evs };
    }
    // Drop remotes the server no longer relays (left the session).
    for (const id of remotes.keys())
      if (id === publicId || !seen.has(id)) remotes.delete(id);
  }

  function onBinary(data) {
    if (!(data instanceof ArrayBuffer) || data.byteLength < 2) return;
    const dv = new DataView(data);
    const type = dv.getUint8(0);
    const len = data.byteLength;
    if (type === MSG_VIVS_WORLD) {                              // M33: island placement block
      world = parseVivsWorld(dv, len);
      onWorld && onWorld(world);
      return;
    }
    if (type === MSG_JOIN_SUCCESS) {
      publicId = dv.getUint32(1, false);       // the one big-endian field
      selfState = null;                        // M38: the server has no state for us yet
      joined = true;                           // M28: presence visibility gate
      setStatus(`MP connected as ${displayName} (id ${publicId})`);
      sendName();
      // M31: the close handler cancels the uplink interval; restart it after
      // every rejoin so state/time/animals (and thus authority liveness on
      // the server) resume. sendStateLoop clears any live interval first.
      if (sendTimer === 0) sendStateLoop();
      return;
    }
    if (type === MSG_JOIN_ERROR) {
      const msg = new TextDecoder().decode(new Uint8Array(data, 1));
      setStatus(`MP join failed: ${msg}`);
      return;
    }
    if (type === MSG_VIVS_TICK) onTickMessage(dv, len);
    if (type === MSG_VIVS_EDIT_SYNC) {                    // M29 join catch-up
      if (len < 5) return;
      const count = dv.getUint32(1, true);
      for (let i = 0; i < count; i++) {
        const off = 5 + i * EDIT_BYTES;
        if (off + EDIT_BYTES > len) break;
        dispatchEdit(dv, off, onEditSync);
      }
    }
  }

  // M30: animal snapshot upload [29][u32 count][count * 24B VivsAnimalState].
  // The `animals` option returns [{slot, type, x, y, z, yaw, dead, flags?}].
  function buildAnimals(list) {
    const buf = new ArrayBuffer(1 + 4 + list.length * ANIMAL_BYTES);
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    u8[0] = MSG_VIVS_ANIMALS;
    dv.setUint32(1, list.length, true);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const o = 5 + i * ANIMAL_BYTES;
      dv.setUint16(o, a.slot, true);
      u8[o + 2] = a.type & 0xff;
      u8[o + 3] = (a.flags ?? 0) & 0xff;
      dv.setFloat32(o + 4, a.x, true);
      dv.setFloat32(o + 8, a.y, true);
      dv.setFloat32(o + 12, a.z, true);
      dv.setFloat32(o + 16, a.yaw, true);
      u8[o + 20] = a.dead ? 1 : 0;
    }
    return buf;
  }

  // M29: 30 Hz clock upload [32][f32 gameMin LE]; the server keeps only
  // the current authority's value and relays it in tick bit4.
  function buildTime() {
    const buf = new ArrayBuffer(1 + 4);
    const dv = new DataView(buf);
    dv.setUint8(0, MSG_VIVS_TIME);
    dv.setFloat32(1, gameMin(), true);
    return buf;
  }

  function sendStateLoop() {
    clearInterval(sendTimer);
    sendTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(buildState());
      if (typeof gameMin === 'function') {
        const v = gameMin();
        if (Number.isFinite(v)) ws.send(buildTime());
      }
      // M30: only the authority uploads the animal snapshot; the server
      // double-gates and drops anyone else's.
      if (typeof animals === 'function' && isAuthority()) {
        const list = animals();
        if (Array.isArray(list) && list.length > 0) ws.send(buildAnimals(list));
      }
    }, 1000 / SEND_RATE);
  }

  // M29: upload one world edit. No-op unless connected. kind: 0=palm
  // (payload[0]=u8 cocos set), 1=plant (payload[0]=u8 chargesLeft set),
  // 2=camp (payload = f32 x,z,rot), 3..7=structures (payload unused).
  function sendEdit(kind, entityIndex, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !publicId) return false;
    const buf = new Uint8Array(1 + EDIT_BYTES);
    const dv = new DataView(buf.buffer);
    buf[0] = MSG_VIVS_EDIT;
    dv.setUint32(1, publicId, true);
    dv.setUint32(5, entityIndex, true);
    buf[9] = kind;
    buf[10] = 0;                                          // action 0 = set
    if (payload) buf.set(payload.subarray(0, EDIT_PAYLOAD_BYTES), 11);
    ws.send(buf);
    return true;
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
      selfState = null;                        // M38: no server stamp while disconnected
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
    get self() { return selfState; },           // M38: server-stamped own transform (null until first own tick entry)
    animals: animalMap,                          // M30: slot -> {slot,type,x,y,z,yaw,dead}
    get world() { return world; },               // M33: island placement block (type 33)
    get weather() { return weather; },           // M37: server weather state + storm events
    isAuthority,                                  // M30
    connected: () => joined && !!ws && ws.readyState === WebSocket.OPEN,   // M28: presence gate
    status: () => statusText,
    sendEdit,                                   // M29: [28][23B VivsWorldEdit]
    close() {
      closedByUs = true;
      clearInterval(sendTimer);
      if (ws) ws.close();
      hud.remove();
    },
  };
}
