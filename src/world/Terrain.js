import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  Vector3,
} from 'three';
import { fbm2, lerp, smoothstep } from '../core/MathUtils.js';
import { createFrame } from './Track.js';

const EDGE_BASE = [0, 1.2, 3, 5.5, 9, 14, 20, 28, 38, 50, 64, 80, 96];
const ROW_STEP = 5;

const PROFILES = {
  jungle: (d) => smoothstep(0, 26, d) * 7.5,
  flat: (d) => smoothstep(0, 30, d) * 2.4,
  valley: (d) => -smoothstep(0, 24, d) * 15 - smoothstep(24, 70, d) * 7,
  climb: (d, side) => (side < 0 ? -smoothstep(0, 30, d) * 30 : smoothstep(0, 30, d) * 26),
  ridge: (d) => -smoothstep(0, 20, d) * 34,
};

const NOISE_AMP = {
  jungle: 6.5,
  flat: 1.6,
  valley: 1.8,
  climb: 9,
  ridge: 6,
};

export class Terrain {
  constructor(track) {
    this.track = track;
    this._frame = createFrame();
    this._scratch = createFrame();
    this.group = new Group();
    this.group.name = 'terrain';
  }

  /** World-space ground height for a track-space coordinate. */
  heightAt(s, lateral) {
    const frame = this.track.frameAt(s, this._scratch);
    const zone = this.track.zoneAt(s);
    const roadY = frame.position.y;
    const half = zone.halfWidth;
    const raw = Math.abs(lateral) - half;
    const d = raw > 0 ? raw : 0;

    const side = lateral >= 0 ? 1 : -1;
    const profile = PROFILES[zone.profile] || PROFILES.jungle;
    const noiseAmp = (NOISE_AMP[zone.profile] ?? 5) * smoothstep(0, 14, d);
    const n = (fbm2(s * 0.017, lateral * 0.021, 4) - 0.5) * 2;
    const detail = (fbm2(s * 0.11, lateral * 0.13, 2) - 0.5) * 0.7 * smoothstep(1, 8, d);

    const drop = lerp(-0.45, -0.14, smoothstep(0.4, 3.5, d));
    const rim = smoothstep(45, 92, d) * 36;

    return roadY + drop + profile(d, side) + noiseAmp * n + detail + rim;
  }

  /** Eye height of a slope, used to orient props. */
  slopeNormalAt(s, lateral, out = new Vector3()) {
    const ds = 2.5;
    const dl = 1.5;
    const hL = this.heightAt(s, lateral - dl);
    const hR = this.heightAt(s, lateral + dl);
    const hB = this.heightAt(s - ds, lateral);
    const hF = this.heightAt(s + ds, lateral);

    const frame = this.track.frameAt(s, this._scratch);
    const across = frame.right.clone().multiplyScalar(2 * dl).addScaledVector(frame.up, hR - hL);
    const along = frame.tangent.clone().multiplyScalar(2 * ds).addScaledVector(frame.up, hF - hB);
    const normal = new Vector3().crossVectors(along, across);
    if (normal.lengthSq() < 1e-6) return out.set(0, 1, 0);
    return out.copy(normal.normalize());
  }

  build(textures) {
    const track = this.track;

    for (const zone of this.zones()) {
      const half = zone.halfWidth;
      const offsets = [];
      for (let i = EDGE_BASE.length - 1; i >= 0; i--) offsets.push(-(half + EDGE_BASE[i]));
      for (let i = 0; i < EDGE_BASE.length; i++) offsets.push(half + EDGE_BASE[i]);

      const cols = offsets.length;
      const span = zone.toS - zone.fromS;
      const rows = Math.max(2, Math.round(span / ROW_STEP)) + 1;

      const positions = new Float32Array(rows * cols * 3);
      const uvs = new Float32Array(rows * cols * 2);
      const colors = new Float32Array(rows * cols * 3);
      const frame = createFrame();
      const color = new Color();
      const base = new Color(zone.ground);
      const shoulderColor = new Color(0x5a4026);
      const snowColor = new Color(0xe6edf5);

      for (let r = 0; r < rows; r++) {
        const s = zone.fromS + (span * r) / (rows - 1);
        track.frameAt(s, frame);

        for (let k = 0; k < cols; k++) {
          const lateral = offsets[k];
          const y = this.heightAt(s, lateral);
          const idx = (r * cols + k) * 3;

          positions[idx] = frame.position.x + frame.right.x * lateral;
          positions[idx + 1] = y;
          positions[idx + 2] = frame.position.z + frame.right.z * lateral;

          const uvidx = (r * cols + k) * 2;
          uvs[uvidx] = lateral / 9;
          uvs[uvidx + 1] = s / 9;

          const damp01 = fbm2(s * 0.045, lateral * 0.05, 3);
          color.copy(base).multiplyScalar(lerp(0.72, 1.28, damp01));

          const shoulderT = 1 - smoothstep(0, 7, Math.abs(lateral) - half);
          color.lerp(shoulderColor, shoulderT * 0.55);

          const snowT = smoothstep(46, 74, y);
          if (snowT > 0) color.lerp(snowColor, snowT * 0.85);

          colors[idx] = color.r;
          colors[idx + 1] = color.g;
          colors[idx + 2] = color.b;
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

      const surface = textures.ground[zone.groundTex];
      const material = new MeshStandardMaterial({
        map: surface.map,
        normalMap: surface.normalMap,
        roughnessMap: surface.orm,
        aoMap: surface.orm,
        normalScale: new Vector2(1.1, 1.1),
        vertexColors: true,
        roughness: 1.0,
        metalness: 0.0,
      });

      const mesh = new Mesh(geometry, material);
      mesh.name = `terrain-${zone.id}`;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }

    return this.group;
  }

  zones() {
    return this.track.zones;
  }

  /** Lowest road height across a zone, used to place water surfaces. */
  lowestRoadY(zone, step = 8) {
    let min = Infinity;
    const frame = createFrame();
    for (let s = zone.fromS; s <= zone.toS; s += step) {
      this.track.frameAt(s, frame);
      if (frame.position.y < min) min = frame.position.y;
    }
    return min;
  }

  dispose() {
    this.group.children.forEach((child) => {
      child.geometry.dispose();
      child.material.dispose();
    });
    this.group.clear();
  }
}
