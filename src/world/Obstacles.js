import {
  BufferAttribute,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { makeRng } from '../core/MathUtils.js';
import { jitter, part, mergeParts } from './GeoHelpers.js';
import { createFrame } from './Track.js';

const MIN_HALF_WIDTH = 6.0;
const RAMP_CLEARANCE = 30;
const GATE_CLEARANCE = 22;
const OBSTACLE_SPACING = 9;

const TYPES = {
  rock: { halfS: 1.0, halfLat: 0.9, radius: 0.85 },
  log: { halfS: 0.55, halfLat: 1.5, radius: 1.3 },
};

/**
 * Hazards sitting on the racing surface: fallen rocks and logs.
 * Deterministic placement, with clear rules so nothing ever lands in a spot
 * that would make the course unfair (right on a jump ramp or a checkpoint gate).
 */
export class Obstacles {
  constructor(track, seed = 20260217) {
    this.track = track;
    this.rng = makeRng(seed);
    this.list = [];
    this.group = new Group();
    this.group.name = 'obstacles';
    this.material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    });
    this.frame = createFrame();
  }

  build() {
    const track = this.track;
    const rng = this.rng;
    const ramps = track.rampPositions();
    const gates = [0, 0.25, 0.5, 0.75, 1].map((f) => f * track.length);

    for (const zone of track.zones) {
      if (zone.halfWidth < MIN_HALF_WIDTH) continue;
      const span = zone.toS - zone.fromS;
      const wanted = Math.max(1, Math.round(span / 150));
      let placed = 0;
      let attempts = 0;

      while (placed < wanted && attempts < wanted * 24) {
        attempts++;
        const s = zone.fromS + rng.range(span * 0.08, span * 0.92);
        if (ramps.some((r) => Math.abs(r - s) < RAMP_CLEARANCE)) continue;
        if (gates.some((g) => Math.abs(g - s) < GATE_CLEARANCE)) continue;
        if (this.list.some((o) => Math.abs(o.s - s) < OBSTACLE_SPACING)) continue;

        const lane = (rng.next() < 0.5 ? -1 : 1) * rng.range(1.4, Math.max(1.6, zone.halfWidth - 1.9));
        const type = rng.next() < 0.45 ? 'log' : 'rock';
        const spec = TYPES[type];
        this.list.push({
          s,
          lateral: lane,
          type,
          halfS: spec.halfS,
          halfLat: spec.halfLat,
          radius: spec.radius,
        });
        placed++;
      }
    }

    this.list.sort((a, b) => a.s - b.s);
    this._buildMeshes();
    return this.group;
  }

  _buildMeshes() {
    const rng = makeRng(5150);

    const rockGeometry = (() => {
      const geo = jitter(new IcosahedronGeometry(0.82, 0), 0.34, 11);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const v = 0.34 + (pos.getY(i) * 0.5 + 0.5) * 0.26;
        colors[i * 3] = v;
        colors[i * 3 + 1] = v * 0.97;
        colors[i * 3 + 2] = v * 0.93;
      }
      geo.setAttribute('color', new BufferAttribute(colors, 3));
      return geo;
    })();

    const logGeometry = mergeParts([
      part(new CylinderGeometry(0.23, 0.26, 2.8, 7), {
        rotation: [0, 0, Math.PI / 2],
        position: [0, 0.24, 0],
        color: 0x5b4227,
      }),
      part(new CylinderGeometry(0.2, 0.2, 0.1, 7), {
        rotation: [0, 0, Math.PI / 2],
        position: [1.42, 0.24, 0],
        color: 0x7d6242,
      }),
      part(new CylinderGeometry(0.2, 0.2, 0.1, 7), {
        rotation: [0, 0, Math.PI / 2],
        position: [-1.42, 0.24, 0],
        color: 0x7d6242,
      }),
      part(new CylinderGeometry(0.245, 0.245, 0.22, 7), {
        rotation: [0, 0, Math.PI / 2],
        position: [0.7, 0.24, 0],
        color: 0xd8d2c4,
      }),
      part(new CylinderGeometry(0.245, 0.245, 0.22, 7), {
        rotation: [0, 0, Math.PI / 2],
        position: [-0.7, 0.24, 0],
        color: 0xd8d2c4,
      }),
    ]);

    const buckets = { rock: [], log: [] };
    const matrix = new Matrix4();
    const quat = new Quaternion();
    const position = new Vector3();
    const scale = new Vector3();
    const frame = this.frame;

    for (const obstacle of this.list) {
      this.track.frameAt(obstacle.s, frame);
      quat.setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(frame.tangent.x, frame.tangent.z));
      position
        .copy(frame.position)
        .addScaledVector(frame.right, obstacle.lateral)
        .addScaledVector(frame.up, 0.06 + obstacle.lateral * Math.sin(frame.bank));
      const shapeScale = rng.range(0.85, 1.2);
      scale.set(shapeScale, shapeScale * rng.range(0.8, 1.1), shapeScale);
      matrix.compose(position, quat, scale);
      buckets[obstacle.type].push(matrix.clone());
    }

    for (const [type, matrices] of Object.entries(buckets)) {
      if (matrices.length === 0) continue;
      const mesh = new InstancedMesh(
        type === 'rock' ? rockGeometry : logGeometry,
        this.material,
        matrices.length
      );
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  /** Returns the hazard overlapping this body, or null. */
  hit(body) {
    for (const obstacle of this.list) {
      const ds = body.s - obstacle.s;
      if (ds < -obstacle.halfS || ds > obstacle.halfS) continue;
      const dl = body.lateral - obstacle.lateral;
      if (dl < -obstacle.halfLat || dl > obstacle.halfLat) continue;
      return obstacle;
    }
    return null;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    this.material.dispose();
    this.group.clear();
  }
}
