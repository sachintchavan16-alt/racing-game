import {
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { clamp, damp, dampAngle, makeRng, smoothstep } from '../core/MathUtils.js';
import { part, mergeParts } from './GeoHelpers.js';
import { createFrame } from './Track.js';

const UP = new Vector3(0, 1, 0);
const TIGER_STRIPE = new Color(0x241a12);
const TIGER_BELLY = new Color(0xf4e3c8);
const DEER_BELLY = new Color(0xf1e6d2);
const DEER_SPOT = new Color(0xd8c3a1);

function tigerBodyColor(x, y, z, base, out) {
  const stripe = smoothstep(0.5, 0.88, 0.5 + 0.5 * Math.sin(x * 4.6));
  const c = out.copy(base).lerp(TIGER_STRIPE, stripe * 0.92);
  return y < 0.62 ? c.lerp(TIGER_BELLY, 0.55) : c;
}

function deerBodyColor(x, y, z, base, out) {
  const c = out.copy(base);
  if (y < 0.95) c.lerp(DEER_BELLY, 0.6);
  const spot = smoothstep(0.6, 0.95, 0.5 + 0.5 * Math.sin(x * 7.5) * Math.sin(y * 9.0));
  return c.lerp(DEER_SPOT, spot * 0.35);
}

function buildTiger() {
  const body = mergeParts([
    part(new CapsuleGeometry(0.36, 1.5, 3, 9), {
      position: [0, 0.82, 0],
      rotation: [0, 0, Math.PI / 2],
      color: 0xd97706,
      colorFn: tigerBodyColor,
    }),
    part(new SphereGeometry(0.34, 9, 7), { position: [1.16, 0.9, 0], color: 0xdd8226, colorFn: tigerBodyColor }),
    part(new SphereGeometry(0.17, 7, 6), { position: [1.45, 0.82, 0], scale: [1.2, 0.8, 0.9], color: 0xf0d9b8 }),
    part(new ConeGeometry(0.1, 0.16, 5), { position: [1.05, 1.2, 0.19], color: 0x3a2a1c }),
    part(new ConeGeometry(0.1, 0.16, 5), { position: [1.05, 1.2, -0.19], color: 0x3a2a1c }),
    part(new CapsuleGeometry(0.07, 0.85, 2, 6), {
      position: [-1.25, 0.95, 0],
      rotation: [0, 0, Math.PI / 2 - 0.35],
      color: 0xd97706,
      colorFn: tigerBodyColor,
    }),
  ]);
  const legs = mergeParts([
    part(new CapsuleGeometry(0.11, 0.42, 2, 6), { position: [0.72, 0.32, 0.26], color: 0xc06a08 }),
    part(new CapsuleGeometry(0.11, 0.42, 2, 6), { position: [0.72, 0.32, -0.26], color: 0xc06a08 }),
    part(new CapsuleGeometry(0.12, 0.4, 2, 6), { position: [-0.68, 0.3, 0.27], color: 0xc06a08 }),
    part(new CapsuleGeometry(0.12, 0.4, 2, 6), { position: [-0.68, 0.3, -0.27], color: 0xc06a08 }),
  ]);
  return { body, legs, hipY: 0.62, walkAmp: 0.4 };
}

function buildDeer() {
  const body = mergeParts([
    part(new CapsuleGeometry(0.3, 1.05, 3, 9), {
      position: [0, 1.02, 0],
      rotation: [0, 0, Math.PI / 2],
      color: 0xb0865b,
      colorFn: deerBodyColor,
    }),
    part(new CylinderGeometry(0.12, 0.16, 0.72, 6), {
      position: [0.72, 1.4, 0],
      rotation: [0, 0, -0.6],
      color: 0xa87c53,
    }),
    part(new SphereGeometry(0.2, 8, 6), { position: [1.02, 1.72, 0], scale: [1.25, 0.9, 0.85], color: 0xbb9166 }),
    part(new SphereGeometry(0.08, 6, 5), { position: [1.24, 1.66, 0], scale: [1.1, 0.8, 0.8], color: 0x2a1f16 }),
    part(new ConeGeometry(0.06, 0.2, 5), { position: [1.0, 1.86, 0.13], rotation: [0.3, 0, 0], color: 0x8f6a44 }),
    part(new ConeGeometry(0.06, 0.2, 5), { position: [1.0, 1.86, -0.13], rotation: [-0.3, 0, 0], color: 0x8f6a44 }),
    part(new CylinderGeometry(0.03, 0.05, 0.5, 5), { position: [1.02, 2.0, 0.13], rotation: [0, 0, 0.35], color: 0xd8cdb6 }),
    part(new CylinderGeometry(0.03, 0.05, 0.5, 5), { position: [1.02, 2.0, -0.13], rotation: [0, 0, 0.35], color: 0xd8cdb6 }),
    part(new ConeGeometry(1.1, 0.5, 5), { position: [-0.05, 1.05, 0], rotation: [0, 0, Math.PI / 2], color: 0xf2ece0 }),
    part(new CapsuleGeometry(0.07, 0.28, 2, 6), {
      position: [-0.85, 1.15, 0],
      rotation: [0, 0, Math.PI / 2],
      color: 0xf4f0e6,
    }),
  ]);
  const legs = mergeParts([
    part(new CapsuleGeometry(0.06, 0.72, 2, 6), { position: [0.45, 0.44, 0.2], color: 0xa87c53 }),
    part(new CapsuleGeometry(0.06, 0.72, 2, 6), { position: [0.45, 0.44, -0.2], color: 0xa87c53 }),
    part(new CapsuleGeometry(0.06, 0.72, 2, 6), { position: [-0.42, 0.44, 0.2], color: 0xa87c53 }),
    part(new CapsuleGeometry(0.06, 0.72, 2, 6), { position: [-0.42, 0.44, -0.2], color: 0xa87c53 }),
  ]);
  return { body, legs, hipY: 0.82, walkAmp: 0.5 };
}

function buildBear() {
  const body = mergeParts([
    part(new CapsuleGeometry(0.58, 1.05, 3, 9), {
      position: [0, 1.05, 0],
      rotation: [0, 0, Math.PI / 2],
      color: 0x4a3222,
    }),
    part(new SphereGeometry(0.42, 9, 7), { position: [1.02, 1.16, 0], scale: [1.1, 1, 1], color: 0x543a27 }),
    part(new SphereGeometry(0.2, 7, 6), { position: [1.34, 1.05, 0], scale: [1.3, 0.9, 0.9], color: 0x8a7258 }),
    part(new SphereGeometry(0.12, 6, 5), { position: [1.16, 1.44, 0.24], color: 0x3a2718 }),
    part(new SphereGeometry(0.12, 6, 5), { position: [1.16, 1.44, -0.24], color: 0x3a2718 }),
    part(new SphereGeometry(0.14, 6, 5), { position: [0.86, 1.1, 0.34], color: 0x35241a }),
    part(new SphereGeometry(0.14, 6, 5), { position: [0.86, 1.1, -0.34], color: 0x35241a }),
    part(new SphereGeometry(0.16, 6, 5), { position: [-1.05, 1.12, 0], color: 0x3d2a1d }),
  ]);
  const legs = mergeParts([
    part(new CapsuleGeometry(0.19, 0.34, 2, 7), { position: [0.6, 0.36, 0.32], color: 0x3f2b1d }),
    part(new CapsuleGeometry(0.19, 0.34, 2, 7), { position: [0.6, 0.36, -0.32], color: 0x3f2b1d }),
    part(new CapsuleGeometry(0.2, 0.3, 2, 7), { position: [-0.56, 0.34, 0.33], color: 0x3f2b1d }),
    part(new CapsuleGeometry(0.2, 0.3, 2, 7), { position: [-0.56, 0.34, -0.33], color: 0x3f2b1d }),
  ]);
  return { body, legs, hipY: 0.55, walkAmp: 0.32 };
}

export const SPECIES = [
  {
    id: 'tiger',
    label: 'Tiger',
    zones: ['jungle', 'river', 'descent'],
    count: 9,
    walkSpeed: 1.5,
    fleeSpeed: 7.5,
    fleeRadius: 30,
    alertRadius: 52,
    build: buildTiger,
  },
  {
    id: 'deer',
    label: 'Deer',
    zones: ['jungle', 'mud', 'river', 'descent'],
    count: 12,
    walkSpeed: 1.9,
    fleeSpeed: 9.5,
    fleeRadius: 34,
    alertRadius: 58,
    build: buildDeer,
  },
  {
    id: 'bear',
    label: 'Bear',
    zones: ['climb', 'summit', 'descent'],
    count: 7,
    walkSpeed: 1.2,
    fleeSpeed: 5.6,
    fleeRadius: 24,
    alertRadius: 42,
    build: buildBear,
  },
];

export class AnimalSystem {
  /**
   * @param {object} [options]
   * @param {object|null} [options.textures] texture library; supplies the fur
   *   detail normal that gives the merged bodies a hide-like surface.
   * @param {number} [options.seed]
   */
  constructor(track, terrain, options = {}) {
    this.track = track;
    this.terrain = terrain;
    this.textures = options.textures ?? null;
    this.rng = makeRng(options.seed ?? 90210);
    this.group = new Group();
    this.group.name = 'animals';
    this.systems = [];
    this.materials = [];
    this._frame = createFrame();
    this.stats = { total: 0 };
    this.nearest = { distance: Infinity, label: '', flees: 0 };
  }

  build() {
    // Every primitive already carries usable UVs, so one high-frequency fur normal
    // reads as hide across the whole merged body without any UV authoring.
    const furNormal = this.textures?.fur?.map ?? null;

    for (const species of SPECIES) {
      const built = species.build();
      const mat = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0,
        flatShading: true,
      });
      if (furNormal) {
        mat.normalMap = furNormal;
        mat.normalScale = new Vector2(0.55, 0.55);
      }
      this.materials.push(mat);

      const animals = this._place(species);
      const body = new InstancedMesh(built.body, mat, animals.length);
      const legs = new InstancedMesh(built.legs, mat, animals.length);
      body.castShadow = true;
      legs.castShadow = true;
      body.frustumCulled = false;
      legs.frustumCulled = false;

      this.group.add(body, legs);
      this.systems.push({ species, built, animals, body, legs });
      this.stats.total += animals.length;
    }
    return this.group;
  }

  _place(species) {
    const rng = this.rng;
    const zones = this.track.zones.filter((z) => species.zones.includes(z.id));
    const totalSpan = zones.reduce((sum, z) => sum + (z.toS - z.fromS), 0) || 1;
    const list = [];

    for (const zone of zones) {
      const share = (zone.toS - zone.fromS) / totalSpan;
      const n = Math.max(1, Math.round(species.count * share));
      for (let i = 0; i < n; i++) {
        const minLat = zone.halfWidth + 4.5 + rng.range(0, 3);
        const maxLat = zone.halfWidth + 42;
        const lat = (rng.next() < 0.5 ? -1 : 1) * rng.range(minLat, maxLat);
        const s = zone.fromS + rng.range(6, Math.max(7, zone.toS - zone.fromS - 6));
        list.push({
          s,
          lat,
          minLat,
          maxLat,
          minAllowed: zone.halfWidth + 3.5,
          yaw: rng.range(0, Math.PI * 2),
          phase: rng.range(0, Math.PI * 2),
          state: 'wander',
          timer: rng.range(1, 4),
          wander: rng.range(-Math.PI, Math.PI),
          speed: 0,
          scale: rng.range(0.9, 1.12),
        });
      }
    }
    return list;
  }

  /**
   * @param {number} dt seconds
   * @param {object|Array} threats a rider (or several) the wildlife reacts to.
   *   Accepts a single `{ position, s }` for backwards compatibility.
   */
  update(dt, threats) {
    const contenders = Array.isArray(threats) ? threats : [threats];
    const track = this.track;
    const terrain = this.terrain;
    const frame = this._frame;
    const matrix = new Matrix4();
    const legMatrix = new Matrix4();
    const legLocal = new Matrix4();
    const rot = new Matrix4();
    const toHip = new Matrix4();
    const fromHip = new Matrix4();
    const quat = new Quaternion();
    const pos = new Vector3();
    const scaleV = new Vector3();

    let nearest = Infinity;
    let nearestLabel = '';
    let flees = 0;

    for (const sys of this.systems) {
      const { species, animals, body, legs, built } = sys;
      flees = 0;

      for (let i = 0; i < animals.length; i++) {
        const a = animals[i];

        track.frameAt(a.s, frame);
        const gx = frame.position.x + frame.right.x * a.lat;
        const gz = frame.position.z + frame.right.z * a.lat;
        const gy = terrain.heightAt(a.s, a.lat);

        // React to whichever rider is closest, so every bike gets the same
        // startled-wildlife reaction as the player.
        let dx = 0;
        let dy = 0;
        let dz = 0;
        let dist = Infinity;
        let threatX = 0;
        let threatZ = 0;
        for (const contender of contenders) {
          const cdx = gx - contender.position.x;
          const cdy = gy - contender.position.y;
          const cdz = gz - contender.position.z;
          const d2 = cdx * cdx + cdy * cdy + cdz * cdz;
          if (d2 < dist) {
            dist = d2;
            dx = cdx;
            dy = cdy;
            dz = cdz;
            threatX = contender.position.x;
            threatZ = contender.position.z;
          }
        }
        dist = Math.sqrt(dist);
        if (dist < nearest) {
          nearest = dist;
          nearestLabel = species.label;
        }

        let velS = 0;
        let velLat = 0;

        if (dist < species.fleeRadius) {
          a.state = 'flee';
          a.timer = 2.6;
          flees++;
          [velS, velLat] = this._fleeVector(dx, dz, frame, species.fleeSpeed);
        } else if (a.state === 'flee' && a.timer > 0) {
          a.timer -= dt;
          flees++;
          [velS, velLat] = this._fleeVector(dx, dz, frame, species.fleeSpeed * 0.75);
        } else if (dist < species.alertRadius && a.state !== 'flee') {
          a.state = 'alert';
          a.speed = damp(a.speed, 0, 6, dt);
          a.yaw = dampAngle(a.yaw, Math.atan2(threatX - gx, threatZ - gz), 5, dt);
        } else {
          if (a.state !== 'wander') {
            a.state = 'wander';
            a.timer = 2 + this.rng.next() * 4;
            a.wander = this.rng.range(-Math.PI, Math.PI);
          }
          a.timer -= dt;
          if (a.timer <= 0) {
            a.timer = 3 + this.rng.next() * 5;
            a.wander += (this.rng.next() - 0.5) * 2.4;
          }
          const bias = this._edgeBias(a);
          const dir = a.wander * 0.55 + bias;
          velS = Math.cos(dir) * species.walkSpeed;
          velLat = Math.sin(dir) * species.walkSpeed;
        }

        if (a.state !== 'alert') {
          a.s += velS * dt;
          a.lat += velLat * dt;
          a.s = clamp(a.s, 4, track.length - 4);

          const zone = track.zoneAt(a.s);
          a.minAllowed = zone.halfWidth + 3.5;
          a.maxLat = zone.halfWidth + 42;
          const sign = a.lat >= 0 ? 1 : -1;
          const magnitude = clamp(Math.abs(a.lat), a.minAllowed, a.maxLat);
          a.lat = sign * magnitude;

          track.frameAt(a.s, frame);
          const wx = frame.tangent.x * velS + frame.right.x * velLat;
          const wz = frame.tangent.z * velS + frame.right.z * velLat;
          if (wx * wx + wz * wz > 1e-4) {
            a.yaw = dampAngle(a.yaw, Math.atan2(wx, wz), 6, dt);
          }
          a.speed = damp(a.speed, Math.hypot(velS, velLat), 5, dt);
        }

        track.frameAt(a.s, frame);
        pos.set(frame.position.x + frame.right.x * a.lat, 0, frame.position.z + frame.right.z * a.lat);
        pos.y = terrain.heightAt(a.s, a.lat);

        a.phase += a.speed * dt * 3.6;

        quat.setFromAxisAngle(UP, a.yaw);
        pos.y += Math.sin(a.phase * 2) * 0.03 * a.scale;
        scaleV.set(a.scale, a.scale, a.scale);
        matrix.compose(pos, quat, scaleV);

        const swing = Math.sin(a.phase) * built.walkAmp * clamp(a.speed / 2.2, 0, 1.3);
        rot.makeRotationX(swing);
        toHip.makeTranslation(0, built.hipY, 0);
        fromHip.makeTranslation(0, -built.hipY, 0);
        legLocal.copy(toHip).multiply(rot).multiply(fromHip);
        legMatrix.multiplyMatrices(matrix, legLocal);

        body.setMatrixAt(i, matrix);
        legs.setMatrixAt(i, legMatrix);
      }

      body.instanceMatrix.needsUpdate = true;
      legs.instanceMatrix.needsUpdate = true;
      sys.fleeing = flees;
    }

    this.nearest.distance = nearest;
    this.nearest.label = nearestLabel;
  }

  _fleeVector(dx, dz, frame, speed) {
    const along = dx * frame.tangent.x + dz * frame.tangent.z;
    const across = dx * frame.right.x + dz * frame.right.z;
    const len = Math.hypot(along, across) || 1;
    return [(along / len) * speed, (across / len) * speed];
  }

  _edgeBias(a) {
    const mid = (a.minAllowed + a.maxLat) * 0.5;
    if (a.lat > mid) return -Math.sign(a.lat) * 0.9;
    if (Math.abs(a.lat) < a.minAllowed * 1.15) return Math.sign(a.lat || 1) * 0.9;
    return 0;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.group.clear();
  }
}
