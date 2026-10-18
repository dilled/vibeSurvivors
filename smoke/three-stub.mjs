// Minimal three.js stub for headless smoke-testing index.html's game module.
// Only the API surface the game uses; real math where the game depends on it
// (Vector3, Color lerp), no-ops elsewhere.
export const StaticDrawUsage = 1;
export const DynamicDrawUsage = 2;
export const DoubleSide = 2;
export const FrontSide = 1;

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setX(x) { this.x = x; return this; }
  setY(y) { this.y = y; return this; }
  setZ(z) { this.z = z; return this; }
  setScalar(v) { this.x = this.y = this.z = v; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
}

export class Color {
  constructor(hex = 0xffffff) { this.r = ((hex >> 16) & 255) / 255; this.g = ((hex >> 8) & 255) / 255; this.b = (hex & 255) / 255; }
  set(hex) { return this.copy(new Color(hex)); }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
}

class PositionAttr {
  constructor(count) { this.count = count; this._y = {}; }
  getX(i) { return 0; }
  getZ(i) { return 0; }
  setY(i, v) { this._y[i] = v; }
}

class Geo {
  constructor() {
    this.count = 1200;
    this.attributes = { position: new PositionAttr(this.count) };
  }
  setAttribute() {}
  computeVertexNormals() {}
  translate() {}
  scale() {}
  rotateX() {}
  rotateZ() {}
}
export class BoxGeometry extends Geo {}
export class PlaneGeometry extends Geo {}
export class CylinderGeometry extends Geo {}
export class ConeGeometry extends Geo {}
export class IcosahedronGeometry extends Geo {}
export class SphereGeometry extends Geo {}

export class BufferAttribute { constructor(a, n) { this.array = a; this.itemSize = n; } }

export class Euler {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
export class Quaternion { constructor() { this.setFromEuler(() => {}); } setFromEuler() {} }
/* M29: compose records the translation so smoke can read instance positions */
export class Matrix4 { compose(v, q, s) { this._p = { x: v.x, y: v.y, z: v.z }; } }

class Mat {
  constructor(p = {}) {
    const { color, map, ...rest } = p;
    Object.assign(this, rest);
    this.color = color !== undefined ? new Color(color) : new Color(0xffffff);
  }
}
export class MeshLambertMaterial extends Mat {}
export class MeshBasicMaterial extends Mat {}
export class LineBasicMaterial extends Mat {}
export class SpriteMaterial extends Mat {}   // M28: remote-player name tags

export class CanvasTexture { constructor(image) { this.image = image; this.needsUpdate = false; } }   // M28

class Node {
  constructor() {
    this.position = new Vector3();
    this.rotation = new Vector3();
    this.scale = new Vector3();
    this.children = [];
    this.visible = true;
    this.userData = {};
  }
  add(c) { this.children.push(c); }
  addMany(cs) { this.children.push(...cs); }
  remove(c) { this.children = this.children.filter((x) => x !== c); }
}

export class Group extends Node {}
export class LOD extends Node {
  constructor() { super(); this.levels = []; }
  addLevel(obj, distance) { this.levels.push({ distance, level: obj }); this.children.push(obj); }
  update() {}
}
export class Mesh extends Node {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
export class Sprite extends Node { constructor(material) { super(); this.material = material; } }   // M28
export class InstancedMesh extends Node {
  constructor(geometry, material, count) {
    super();
    this.count = count;
    this.geometry = geometry;
    this.material = material;
    this.instanceMatrix = { setUsage: () => {}, count, mats: {} };
  }
  setMatrixAt(i, m) { this._count = (this._count || 0) + 1; this.instanceMatrix.mats[i] = m._p || null; }   // M29: record the translation
  setColorAt(i, c) { if (!this.instanceColor) this.instanceColor = { needsUpdate: false, n: 0 }; this.instanceColor.n = (this.instanceColor.n || 0) + 1; }
}
export class Scene extends Node {
  constructor() { super(); this.background = null; this.fog = null; }
}

class Light extends Node {
  constructor(color, intensity) { super(); this.color = color !== undefined ? new Color(color) : new Color(); this.intensity = intensity; }
}
export class HemisphereLight extends Light {}
export class DirectionalLight extends Light {}
export class PointLight extends Light { constructor(color, intensity, distance = 0) { super(color, intensity); this.distance = distance; } }

export class Fog { constructor(color, near, far) { this.color = color instanceof Color ? color : new Color(color); this.near = near; this.far = far; } }

export class PerspectiveCamera extends Node {
  constructor(fov, aspect, near, far) { super(); this.fov = fov; this.aspect = aspect; this.near = near; this.far = far; this.updateProjectionMatrix = () => {}; this.lookAt = () => {}; }
}

export class WebGLRenderer {
  constructor(opts) { this.domElement = { style: {} }; }
  setPixelRatio() {}
  setSize() {}
  setClearColor() {}
  render() {}
  dispose() {}
}
