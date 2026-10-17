import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  Vector3,
} from 'three';
import { clamp, noise2 } from '../core/MathUtils.js';

export const ROAD_UV_SCALE = 6;
const SHOULDER = 0.55;
const SHOULDER_DROP = 0.42;
const BANK_GAIN = 8.5;
const MAX_BANK = 0.14;

/**
 * Course layout. Fractions are of total track length; they define which
 * environment, grip level and scenery profile applies at any point.
 */
export const ZONES = [
  {
    id: 'jungle',
    name: 'Jungle Trail',
    from: 0.0,
    to: 0.16,
    halfWidth: 7.2,
    grip: 0.94,
    drag: 1.0,
    mud: 0.0,
    water: 0.0,
    road: 'dirt',
    ground: 0x3f6b2c,
    groundTex: 'jungle',
    fog: 0x9dc98c,
    fogDensity: 0.0062,
    skyTop: 0x4a86c4,
    skyBottom: 0xcfe4b8,
    sun: 0xfff3d6,
    profile: 'jungle',
    density: 1.0,
    animals: ['tiger', 'deer'],
  },
  {
    id: 'mud',
    name: 'Mud Flats',
    from: 0.16,
    to: 0.31,
    halfWidth: 7.8,
    grip: 0.5,
    drag: 1.32,
    mud: 1.0,
    water: 0.0,
    road: 'mud',
    ground: 0x6b5433,
    groundTex: 'mud',
    fog: 0x94825c,
    fogDensity: 0.0082,
    skyTop: 0x6f8fb5,
    skyBottom: 0xd8c79a,
    sun: 0xffeec2,
    profile: 'flat',
    density: 0.55,
    animals: ['deer'],
  },
  {
    id: 'river',
    name: 'River Valley',
    from: 0.31,
    to: 0.45,
    halfWidth: 6.6,
    grip: 0.8,
    drag: 1.14,
    mud: 0.1,
    water: 1.0,
    road: 'gravel',
    ground: 0x466b34,
    groundTex: 'grass',
    fog: 0x9fbcc9,
    fogDensity: 0.0056,
    skyTop: 0x3f86c8,
    skyBottom: 0xc3e2ec,
    sun: 0xfff8e2,
    profile: 'valley',
    density: 1.1,
    animals: ['deer', 'tiger'],
  },
  {
    id: 'climb',
    name: 'Mountain Climb',
    from: 0.45,
    to: 0.68,
    halfWidth: 5.8,
    grip: 0.86,
    drag: 1.06,
    mud: 0.15,
    water: 0.0,
    road: 'gravel',
    ground: 0x7a7263,
    groundTex: 'rock',
    fog: 0xa7b7c6,
    fogDensity: 0.005,
    skyTop: 0x2f6fb8,
    skyBottom: 0xd2e2ee,
    sun: 0xfff6e0,
    profile: 'climb',
    density: 0.8,
    animals: ['bear'],
  },
  {
    id: 'summit',
    name: 'Summit Ridge',
    from: 0.68,
    to: 0.78,
    halfWidth: 5.0,
    grip: 0.82,
    drag: 1.02,
    mud: 0.0,
    water: 0.0,
    road: 'rock',
    ground: 0x9aa3ad,
    groundTex: 'snow',
    fog: 0xc6d6e2,
    fogDensity: 0.0042,
    skyTop: 0x1f5aa8,
    skyBottom: 0xe2eef8,
    sun: 0xffffff,
    profile: 'ridge',
    density: 0.35,
    animals: ['bear'],
  },
  {
    id: 'descent',
    name: 'Jungle Descent',
    from: 0.78,
    to: 1.0,
    halfWidth: 7.0,
    grip: 0.9,
    drag: 1.02,
    mud: 0.45,
    water: 0.25,
    road: 'mud',
    ground: 0x35602a,
    groundTex: 'jungle',
    fog: 0x93bd85,
    fogDensity: 0.0058,
    skyTop: 0x4a86c4,
    skyBottom: 0xcfe4b8,
    sun: 0xfff3d6,
    profile: 'jungle',
    density: 1.15,
    animals: ['tiger', 'deer'],
  },
];

const CONTROL_POINTS = [
  [0, 0.0, 0],
  [7, 0.6, 55],
  [-3, 1.4, 110],
  [-15, 2.2, 165],
  [-8, 2.8, 225],
  [7, 2.6, 285],
  [16, 2.0, 340],
  [8, 1.1, 398],
  [-7, 0.6, 452],
  [-19, 0.3, 505],
  [-12, -0.2, 562],
  [3, 0.2, 618],
  [17, 0.9, 672],
  [23, 2.0, 725],
  [15, 3.0, 782],
  [1, 3.6, 838],
  [-13, 3.8, 892],
  [-24, 5.0, 930],
  [-31, 9.0, 980],
  [-21, 15.0, 1022],
  [-5, 22.0, 1062],
  [10, 30.0, 1104],
  [19, 38.0, 1152],
  [9, 46.0, 1202],
  [-7, 52.0, 1252],
  [-15, 58.0, 1312],
  [-7, 64.0, 1372],
  [8, 68.0, 1432],
  [18, 70.0, 1492],
  [10, 68.0, 1552],
  [-4, 60.0, 1612],
  [-16, 48.0, 1672],
  [-10, 36.0, 1726],
  [6, 26.0, 1786],
  [15, 18.0, 1846],
  [7, 10.0, 1906],
  [-6, 5.0, 1966],
  [-2, 2.0, 2026],
  [0, 0.0, 2086],
];

const UP = new Vector3(0, 1, 0);
const _slopeA = createFrame();
const _slopeB = createFrame();

/**
 * Designed dirt-jump kickers. `at` is a fraction of total track length.
 * Each ramp rises steeply to a lip and drops sharply behind it, so a fast rider
 * goes airborne while a slow one rolls over. Baked into the sample elevations,
 * which keeps the road mesh, terrain and physics perfectly in sync.
 */
const RAMPS = [
  { at: 0.245, length: 17, height: 2.2 },
  { at: 0.335, length: 15, height: 1.7 },
  { at: 0.585, length: 18, height: 2.4 },
  { at: 0.735, length: 14, height: 1.5 },
  { at: 0.815, length: 18, height: 2.6 },
  { at: 0.905, length: 16, height: 2.2 },
];

export function createFrame() {
  return {
    position: new Vector3(),
    tangent: new Vector3(0, 0, 1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    bank: 0,
  };
}

export class Track {
  constructor({ step = 1.5 } = {}) {
    this.step = step;
    this.curve = new CatmullRomCurve3(
      CONTROL_POINTS.map((p) => new Vector3(p[0], p[1], p[2])),
      false,
      'centripetal',
      0.5
    );
    this.curve.arcLengthDivisions = 4000;
    this.length = this.curve.getLength();

    this.zones = ZONES.map((z, index) => ({
      ...z,
      index,
      fromS: z.from * this.length,
      toS: z.to * this.length,
    }));

    this._frame = createFrame();
    this._buildSamples();
    this.startFrame = this.frameAt(0, createFrame());
    this.finishFrame = this.frameAt(this.length, createFrame());
  }

  _buildSamples() {
    const count = Math.max(2, Math.ceil(this.length / this.step)) + 1;
    this.sampleCount = count;
    this.positions = new Float32Array(count * 3);
    this.tangents = new Float32Array(count * 3);
    this.rights = new Float32Array(count * 3);
    this.ups = new Float32Array(count * 3);
    this.curvatures = new Float32Array(count);
    this.banks = new Float32Array(count);

    this.ramps = RAMPS.map((ramp) => ({
      startS: ramp.at * this.length - ramp.length * 0.5,
      length: ramp.length,
      height: ramp.height,
    }));

    const p = new Vector3();
    const t = new Vector3();
    const r = new Vector3();
    const u = new Vector3();
    const a = new Vector3();
    const b = new Vector3();

    for (let i = 0; i < count; i++) {
      const uu = i / (count - 1);
      this.curve.getPointAt(uu, p);
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y + this._rampHeight(uu * this.length);
      this.positions[i * 3 + 2] = p.z;
    }

    // Derive tangents from the real sample elevations so jump ramps are honoured.
    const last = count - 1;
    for (let i = 0; i < count; i++) {
      const i0 = i > 0 ? i - 1 : 0;
      const i1 = i < last ? i + 1 : last;
      a.set(this.positions[i0 * 3], this.positions[i0 * 3 + 1], this.positions[i0 * 3 + 2]);
      b.set(this.positions[i1 * 3], this.positions[i1 * 3 + 1], this.positions[i1 * 3 + 2]);
      t.subVectors(b, a);
      if (t.lengthSq() < 1e-8) t.set(0, 0, 1);
      t.normalize();
      r.crossVectors(UP, t).normalize();
      if (r.lengthSq() < 1e-8) r.set(1, 0, 0);
      u.crossVectors(t, r).normalize();

      this.tangents[i * 3] = t.x;
      this.tangents[i * 3 + 1] = t.y;
      this.tangents[i * 3 + 2] = t.z;
      this.rights[i * 3] = r.x;
      this.rights[i * 3 + 1] = r.y;
      this.rights[i * 3 + 2] = r.z;
      this.ups[i * 3] = u.x;
      this.ups[i * 3 + 1] = u.y;
      this.ups[i * 3 + 2] = u.z;
    }

    const ds = this.length / (count - 1);
    const raw = new Float32Array(count);
    for (let i = 1; i < count - 1; i++) {
      const h0 = Math.atan2(this.tangents[(i - 1) * 3], this.tangents[(i - 1) * 3 + 2]);
      const h1 = Math.atan2(this.tangents[(i + 1) * 3], this.tangents[(i + 1) * 3 + 2]);
      let d = h1 - h0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      raw[i] = d / (2 * ds);
    }
    raw[0] = raw[1] || 0;
    raw[count - 1] = raw[count - 2] || 0;

    const smooth = 6;
    for (let i = 0; i < count; i++) {
      let sum = 0;
      let n = 0;
      for (let k = -smooth; k <= smooth; k++) {
        const idx = clamp(i + k, 0, count - 1);
        sum += raw[idx];
        n++;
      }
      const k = sum / n;
      this.curvatures[i] = k;
      this.banks[i] = clamp(-k * BANK_GAIN, -MAX_BANK, MAX_BANK);
    }
  }

  /** Extra elevation contributed by the designed jump ramps at track distance s. */
  _rampHeight(s) {
    if (!this.ramps) return 0;
    let total = 0;
    for (const ramp of this.ramps) {
      const local = (s - ramp.startS) / ramp.length;
      if (local <= 0 || local >= 1) continue;
      total +=
        local < 0.5
          ? ramp.height * Math.pow(local * 2, 1.7)
          : ramp.height * Math.pow((1 - local) * 2, 1.7);
    }
    return total;
  }

  /** Distance along the track of each jump ramp, for HUD cues. */
  rampPositions() {
    return this.ramps.map((ramp) => ramp.startS + ramp.length * 0.5);
  }

  halfWidthAt(s) {
    return this.zoneAt(s).halfWidth;
  }

  curvatureAt(s) {
    const f = clamp(s / this.length, 0, 1) * (this.sampleCount - 1);
    const i = clamp(Math.round(f), 0, this.sampleCount - 1);
    return this.curvatures[i];
  }

  zoneAt(s) {
    const zones = this.zones;
    for (let i = 0; i < zones.length; i++) {
      if (s < zones[i].toS) return zones[i];
    }
    return zones[zones.length - 1];
  }

  slopeAt(s, delta = 2.5) {
    const a = this.frameAt(s - delta, _slopeA);
    const b = this.frameAt(s + delta, _slopeB);
    return (b.position.y - a.position.y) / (2 * delta);
  }

  /** Interpolated centre-line frame. `out` should be a reusable frame object. */
  frameAt(s, out = this._frame) {
    const count = this.sampleCount;
    const last = count - 1;

    if (s <= 0) {
      out.position.set(this.positions[0], this.positions[1], this.positions[2]).addScaledVector(
        this._vec(this.tangents, 0, out.tangent),
        s
      );
      this._vec(this.tangents, 0, out.tangent);
      this._vec(this.rights, 0, out.right);
      this._vec(this.ups, 0, out.up);
      out.bank = this.banks[0];
      return out;
    }

    if (s >= this.length) {
      const over = s - this.length;
      this._vec(this.tangents, last, out.tangent);
      this._vec(this.positions, last, out.position).addScaledVector(out.tangent, over);
      this._vec(this.rights, last, out.right);
      this._vec(this.ups, last, out.up);
      out.bank = this.banks[last];
      return out;
    }

    const f = (s / this.length) * last;
    const i = Math.floor(f);
    const j = Math.min(i + 1, last);
    const a = f - i;

    out.position.set(
      this.positions[i * 3] + (this.positions[j * 3] - this.positions[i * 3]) * a,
      this.positions[i * 3 + 1] + (this.positions[j * 3 + 1] - this.positions[i * 3 + 1]) * a,
      this.positions[i * 3 + 2] + (this.positions[j * 3 + 2] - this.positions[i * 3 + 2]) * a
    );
    out.tangent
      .set(
        this.tangents[i * 3] + (this.tangents[j * 3] - this.tangents[i * 3]) * a,
        this.tangents[i * 3 + 1] + (this.tangents[j * 3 + 1] - this.tangents[i * 3 + 1]) * a,
        this.tangents[i * 3 + 2] + (this.tangents[j * 3 + 2] - this.tangents[i * 3 + 2]) * a
      )
      .normalize();
    out.right.crossVectors(UP, out.tangent).normalize();
    out.up.crossVectors(out.tangent, out.right).normalize();
    out.bank = this.banks[i] + (this.banks[j] - this.banks[i]) * a;
    return out;
  }

  _vec(array, index, out) {
    return out.set(array[index * 3], array[index * 3 + 1], array[index * 3 + 2]);
  }

  /** Grip / drag / surface info for a track-space position. */
  surfaceAt(s, lateral) {
    const zone = this.zoneAt(s);
    const edge = Math.abs(lateral) - zone.halfWidth;
    const offroad = edge > 0.15 ? clamp(edge / 3.5, 0, 1) : 0;
    const grip = zone.grip * (1 - offroad * 0.45);
    const drag = zone.drag + offroad * 4.2;

    const edgeNoise = noise2(s * 0.08, lateral * 0.05);
    const mud = clamp(zone.mud * (0.55 + edgeNoise * 0.75), 0, 1);
    const water = zone.water > 0 && Math.abs(lateral) < zone.halfWidth * 0.95 ? zone.water : zone.water * 0.35;

    return { zone, grip: clamp(grip, 0.22, 1), drag, offroad, mud, water };
  }

  /** Road ribbon, one mesh per zone so each surface can use its own texture. */
  buildRoad(textures) {
    const group = new Group();
    group.name = 'road';

    for (const zone of this.zones) {
      const span = zone.toS - zone.fromS;
      const segments = Math.max(2, Math.round(span / this.step));
      const rows = segments + 1;
      const cols = 4;
      const half = zone.halfWidth;

      const offsets = [
        -half - SHOULDER,
        -half,
        half,
        half + SHOULDER,
      ];
      const drops = [-SHOULDER_DROP, 0, 0, -SHOULDER_DROP];

      const positions = new Float32Array(rows * cols * 3);
      const uvs = new Float32Array(rows * cols * 2);
      const colors = new Float32Array(rows * cols * 3);
      const frame = createFrame();
      const edgeR = new Vector3();
      const cosB = new Vector3();
      const sinB = new Vector3();

      for (let r = 0; r < rows; r++) {
        const s = zone.fromS + (span * r) / segments;
        this.frameAt(s, frame);
        cosB.copy(frame.right).multiplyScalar(Math.cos(frame.bank));
        sinB.copy(frame.up).multiplyScalar(Math.sin(frame.bank));
        edgeR.copy(cosB).add(sinB).normalize();

        for (let k = 0; k < cols; k++) {
          const off = offsets[k];
          const idx = (r * cols + k) * 3;
          positions[idx] = frame.position.x + edgeR.x * off + frame.up.x * drops[k];
          positions[idx + 1] = frame.position.y + edgeR.y * off + frame.up.y * drops[k] + 0.06;
          positions[idx + 2] = frame.position.z + edgeR.z * off + frame.up.z * drops[k];

          const uvidx = (r * cols + k) * 2;
          uvs[uvidx] = off / ROAD_UV_SCALE;
          uvs[uvidx + 1] = s / ROAD_UV_SCALE;

          const wear = 0.86 + noise2(s * 0.35, off * 0.4) * 0.28;
          const shoulderness = k === 0 || k === cols - 1 ? 0.72 : 1;
          const tint = wear * shoulderness;
          colors[idx] = tint;
          colors[idx + 1] = tint;
          colors[idx + 2] = tint;
        }
      }

      const indices = [];
      for (let r = 0; r < rows - 1; r++) {
        for (let k = 0; k < cols - 1; k++) {
          const a = r * cols + k;
          const b = a + 1;
          const d = a + cols;
          const e = d + 1;
          indices.push(a, d, b, b, d, e);
        }
      }

      const geometry = new BufferGeometry();
      geometry.setIndex(indices);
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new BufferAttribute(colors, 3));
      geometry.computeVertexNormals();

      const surface = textures.road[zone.road];
      const material = new MeshStandardMaterial({
        map: surface.map,
        normalMap: surface.normalMap,
        roughnessMap: surface.orm,
        aoMap: surface.orm,
        normalScale: new Vector2(0.9, 0.9),
        vertexColors: true,
        roughness: 1,
        metalness: 0.0,
      });

      const mesh = new Mesh(geometry, material);
      mesh.name = `road-${zone.id}`;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      group.add(mesh);
    }

    return group;
  }

  dispose() {
    this.curve = null;
  }
}
