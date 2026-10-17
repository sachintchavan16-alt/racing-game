import {
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { lerp, makeRng } from '../core/MathUtils.js';
import { part, mergeParts, jitter } from './GeoHelpers.js';
import { signTexture } from '../assets/textures.js';
import { createFrame } from './Track.js';

const UP = new Vector3(0, 1, 0);
const _pos = new Vector3();
const _scale = new Vector3();
const _quat = new Quaternion();
const _yawQuat = new Quaternion();
const _matrix = new Matrix4();
const _color = new Color();

function chunkedInstances(geometry, material, placements, chunkSize, opts = {}) {
  const { castShadow = true, receiveShadow = false } = opts;
  const group = new Group();
  for (let i = 0; i < placements.length; i += chunkSize) {
    const slice = placements.slice(i, i + chunkSize);
    if (slice.length === 0) continue;
    const mesh = new InstancedMesh(geometry, material, slice.length);
    let hasColor = false;
    for (let k = 0; k < slice.length; k++) {
      mesh.setMatrixAt(k, slice[k].matrix);
      if (slice[k].color) {
        mesh.setColorAt(k, slice[k].color);
        hasColor = true;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

export class Scenery {
  constructor(track, terrain, textures, seed = 1337) {
    this.track = track;
    this.terrain = terrain;
    this.textures = textures;
    this.rng = makeRng(seed);
    this.group = new Group();
    this.group.name = 'scenery';
    this.materials = [];
    this._frame = createFrame();
    this.stats = { instances: 0 };
  }

  build() {
    const t = this.textures;

    const barkMat = new MeshStandardMaterial({
      map: t.bark.map,
      normalMap: t.bark.normalMap,
      normalScale: new Vector2(0.85, 0.85),
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
      flatShading: true,
    });
    const foliageMat = new MeshStandardMaterial({
      normalMap: t.foliage.map,
      normalScale: new Vector2(0.6, 0.6),
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
      flatShading: true,
    });
    const rockMat = new MeshStandardMaterial({
      map: t.terrainDetail.map,
      normalMap: t.rockDetail.map,
      normalScale: new Vector2(1.0, 1.0),
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const grassMat = new MeshStandardMaterial({
      map: t.blade.map,
      alphaTest: 0.42,
      side: DoubleSide,
      roughness: 1,
      metalness: 0,
      vertexColors: true,
    });
    const propMat = new MeshStandardMaterial({
      normalMap: t.rockDetail.map,
      normalScale: new Vector2(0.7, 0.7),
      vertexColors: true,
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
    });
    this.materials.push(barkMat, foliageMat, rockMat, grassMat, propMat);

    const broad = this._buildBroadTree();
    const pine = this._buildPineTree();
    const rockGeo = this._buildRock();
    const bushGeo = this._buildBush();
    const logGeo = this._buildLog();
    const postGeo = this._buildPost();
    const grassGeo = this._buildGrassTuft();

    const placements = {
      bark: [],
      canopy: [],
      pineBark: [],
      pineCanopy: [],
      rocks: [],
      bushes: [],
      logs: [],
      posts: [],
      grass: [],
      ferns: [],
    };

    const track = this.track;
    const terrain = this.terrain;
    const frame = this._frame;
    const rng = this.rng;
    const normal = new Vector3();

    for (const zone of track.zones) {
      const span = zone.toS - zone.fromS;
      const density = zone.density;

      const treeCount = Math.round(span * 0.42 * density);
      for (let i = 0; i < treeCount; i++) {
        const s = zone.fromS + rng.next() * span;
        const lat = this._pickLateral(zone, rng, 4.5, 92);
        if (terrain.slopeNormalAt(s, lat, normal).y < 0.5) continue;

        const y = terrain.heightAt(s, lat);
        track.frameAt(s, frame);
        const scale = rng.range(0.75, 1.5) * (zone.profile === 'climb' ? 0.75 : 1);
        const tint = 0.78 + rng.next() * 0.35;

        _pos.set(frame.position.x + frame.right.x * lat, y - 0.15, frame.position.z + frame.right.z * lat);
        _matrix.compose(
          _pos,
          _yawQuat.setFromAxisAngle(UP, rng.next() * Math.PI * 2),
          _scale.set(scale, scale * rng.range(0.9, 1.2), scale)
        );

        const isPine =
          zone.profile === 'climb' || zone.profile === 'ridge' || (zone.profile === 'jungle' && rng.next() < 0.3);
        if (isPine) {
          placements.pineBark.push({ matrix: _matrix.clone(), color: _color.clone().setScalar(tint) });
          placements.pineCanopy.push({
            matrix: _matrix.clone(),
            color: _color.clone().setRGB(tint * 0.82, tint, tint * 0.7),
          });
        } else {
          placements.bark.push({ matrix: _matrix.clone(), color: _color.clone().setScalar(tint) });
          placements.canopy.push({
            matrix: _matrix.clone(),
            color: _color
              .clone()
              .setRGB(tint * rng.range(0.8, 1.05), tint * rng.range(0.95, 1.25), tint * 0.72),
          });
        }
      }

      const bushCount = Math.round(span * 0.5 * density);
      for (let i = 0; i < bushCount; i++) {
        const s = zone.fromS + rng.next() * span;
        const lat = this._pickLateral(zone, rng, 1.2, 46);
        if (terrain.slopeNormalAt(s, lat, normal).y < 0.35) continue;
        const y = terrain.heightAt(s, lat);
        track.frameAt(s, frame);
        const scale = rng.range(0.5, 1.35);
        _pos.set(frame.position.x + frame.right.x * lat, y - 0.25, frame.position.z + frame.right.z * lat);
        _matrix.compose(
          _pos,
          _yawQuat.setFromAxisAngle(UP, rng.next() * Math.PI * 2),
          _scale.set(scale, scale * 0.8, scale)
        );
        const tint = 0.8 + rng.next() * 0.4;
        placements.bushes.push({
          matrix: _matrix.clone(),
          color: _color.clone().setRGB(tint * 0.7, tint, tint * 0.55),
        });
      }

      const rocky = zone.profile === 'climb' || zone.profile === 'ridge';
      const rockCount = Math.round(span * 0.22 * (rocky ? 2.2 : 0.7));
      for (let i = 0; i < rockCount; i++) {
        const s = zone.fromS + rng.next() * span;
        const lat = this._pickLateral(zone, rng, 2.5, 78);
        const y = terrain.heightAt(s, lat);
        track.frameAt(s, frame);
        terrain.slopeNormalAt(s, lat, normal);
        const scale = rng.range(0.5, 2.6);
        _pos.set(frame.position.x + frame.right.x * lat, y - scale * 0.25, frame.position.z + frame.right.z * lat);
        _quat.setFromUnitVectors(UP, normal).multiply(_yawQuat.setFromAxisAngle(UP, rng.next() * Math.PI * 2));
        _matrix.compose(
          _pos,
          _quat,
          _scale.set(scale, scale * rng.range(0.55, 0.9), scale * rng.range(0.8, 1.15))
        );
        const tint = 0.72 + rng.next() * 0.5;
        placements.rocks.push({ matrix: _matrix.clone(), color: _color.clone().setScalar(tint) });
      }

      const logCount = Math.round(span * 0.035 * density);
      for (let i = 0; i < logCount; i++) {
        const s = zone.fromS + rng.next() * span;
        const lat = this._pickLateral(zone, rng, 1.0, 26);
        const y = terrain.heightAt(s, lat);
        track.frameAt(s, frame);
        const scale = rng.range(0.8, 1.6);
        _pos.set(frame.position.x + frame.right.x * lat, y - 0.1, frame.position.z + frame.right.z * lat);
        _matrix.compose(
          _pos,
          _yawQuat.setFromAxisAngle(UP, rng.next() * Math.PI * 2),
          _scale.set(scale, scale, scale)
        );
        const tint = 0.8 + rng.next() * 0.35;
        placements.logs.push({ matrix: _matrix.clone(), color: _color.clone().setScalar(tint) });
      }

      if (zone.profile === 'jungle') {
        const fernCount = Math.round(span * 1.1 * density);
        for (let i = 0; i < fernCount; i++) {
          const s = zone.fromS + rng.next() * span;
          const lat = this._pickLateral(zone, rng, 0.8, 24);
          const y = terrain.heightAt(s, lat);
          track.frameAt(s, frame);
          const scale = rng.range(1.4, 2.9);
          _pos.set(frame.position.x + frame.right.x * lat, y - 0.14, frame.position.z + frame.right.z * lat);
          _matrix.compose(
            _pos,
            _yawQuat.setFromAxisAngle(UP, rng.next() * Math.PI * 2),
            _scale.set(scale, scale, scale)
          );
          const tint = 0.5 + rng.next() * 0.3;
          placements.ferns.push({
            matrix: _matrix.clone(),
            color: _color.clone().setRGB(tint * 0.72, tint, tint * 0.5),
          });
        }
      }

      if (zone.profile !== 'ridge') {
        const grassCount = Math.round(span * 4.2 * density);
        for (let i = 0; i < grassCount; i++) {
          const s = zone.fromS + rng.next() * span;
          const lat = this._pickLateral(zone, rng, 0.4, 30);
          const y = terrain.heightAt(s, lat);
          track.frameAt(s, frame);
          const scale = rng.range(0.45, 1.25);
          _pos.set(frame.position.x + frame.right.x * lat, y - 0.08, frame.position.z + frame.right.z * lat);
          _matrix.compose(
            _pos,
            _yawQuat.setFromAxisAngle(UP, rng.next() * Math.PI * 2),
            _scale.set(scale, scale, scale)
          );
          const tint = 0.7 + rng.next() * 0.5;
          placements.grass.push({
            matrix: _matrix.clone(),
            color: _color.clone().setRGB(tint * 0.8, tint, tint * 0.6),
          });
        }
      }

      if (rocky) {
        const step = 9;
        const off = zone.halfWidth + 1.35;
        for (let s = zone.fromS; s < zone.toS; s += step) {
          track.frameAt(s, frame);
          const yaw = _yawQuat.setFromAxisAngle(UP, Math.atan2(frame.tangent.x, frame.tangent.z));
          for (const side of [-1, 1]) {
            const x = frame.position.x + frame.right.x * side * off;
            const z = frame.position.z + frame.right.z * side * off;
            const y = terrain.heightAt(s, side * off);
            _pos.set(x, y - 0.06, z);
            _matrix.compose(_pos, yaw, _scale.set(1, 1, 1));
            placements.posts.push({ matrix: _matrix.clone(), color: null });
          }
        }
      }
    }

    this.group.add(chunkedInstances(broad.trunk, barkMat, placements.bark, 140));
    this.group.add(chunkedInstances(broad.canopy, foliageMat, placements.canopy, 140));
    this.group.add(chunkedInstances(pine.trunk, barkMat, placements.pineBark, 140));
    this.group.add(chunkedInstances(pine.canopy, foliageMat, placements.pineCanopy, 140));
    this.group.add(chunkedInstances(rockGeo, rockMat, placements.rocks, 90, { castShadow: true, receiveShadow: true }));
    this.group.add(chunkedInstances(bushGeo, foliageMat, placements.bushes, 160));
    this.group.add(chunkedInstances(logGeo, propMat, placements.logs, 120));
    this.group.add(chunkedInstances(postGeo, propMat, placements.posts, 180));
    this.group.add(chunkedInstances(grassGeo, grassMat, placements.grass, 420, { castShadow: false }));
    this.group.add(chunkedInstances(grassGeo, grassMat, placements.ferns, 260, { castShadow: false }));

    this.group.add(this._buildGates());

    this.stats.instances = Object.values(placements).reduce((sum, list) => sum + list.length, 0);

    this.group.traverse((obj) => {
      if (obj.isMesh) {
        if (!obj.isInstancedMesh) obj.updateMatrix();
        obj.matrixAutoUpdate = false;
      }
    });

    return this.group;
  }

  _pickLateral(zone, rng, min, max) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const t = Math.pow(rng.next(), 1.7);
    return side * (zone.halfWidth + lerp(min, max, t));
  }

  _buildBroadTree() {
    const trunk = mergeParts([
      part(new CylinderGeometry(0.2, 0.44, 4.4, 7), { position: [0, 2.2, 0], color: 0x5a4028 }),
      part(new CylinderGeometry(0.09, 0.15, 1.9, 5), {
        position: [0.52, 4.0, 0.2],
        rotation: [0, 0, -0.52],
        color: 0x4e3621,
      }),
      part(new CylinderGeometry(0.08, 0.13, 1.6, 5), {
        position: [-0.46, 3.7, -0.26],
        rotation: [0, 0, 0.46],
        color: 0x4a3320,
      }),
      part(new CylinderGeometry(0.16, 0.26, 0.5, 6), { position: [0, 0.2, 0], color: 0x3f2c1a }),
    ]);
    const canopy = mergeParts([
      part(new SphereGeometry(1.55, 8, 6), { position: [0, 4.7, 0], scale: [1, 0.84, 1], color: 0x2f6b2a }),
      part(new SphereGeometry(1.18, 7, 6), { position: [1.18, 4.0, 0.5], color: 0x3a7d31 }),
      part(new SphereGeometry(1.05, 7, 6), { position: [-1.08, 4.2, -0.62], color: 0x275c24 }),
      part(new SphereGeometry(0.98, 7, 6), { position: [0.22, 5.85, -0.3], color: 0x418a37 }),
      part(new SphereGeometry(0.9, 6, 5), { position: [-0.62, 5.2, 0.72], color: 0x356f2c }),
      part(new SphereGeometry(0.82, 6, 5), { position: [0.86, 5.3, -0.62], color: 0x2b6227 }),
      part(new SphereGeometry(0.74, 6, 5), { position: [-1.35, 4.9, 0.5], color: 0x3f8434 }),
    ]);
    return { trunk, canopy };
  }

  _buildPineTree() {
    const trunk = mergeParts([
      part(new CylinderGeometry(0.16, 0.3, 3.2, 6), { position: [0, 1.6, 0], color: 0x4a3421 }),
    ]);
    const canopy = mergeParts([
      part(new ConeGeometry(1.5, 2.4, 7), { position: [0, 2.6, 0], color: 0x27552a }),
      part(new ConeGeometry(1.2, 2.2, 7), { position: [0, 3.9, 0], color: 0x2e6531 }),
      part(new ConeGeometry(0.85, 1.9, 7), { position: [0, 5.1, 0], color: 0x356f36 }),
    ]);
    return { trunk, canopy };
  }

  _buildRock() {
    const geometry = mergeParts([
      part(jitter(new IcosahedronGeometry(0.95, 1), 0.3, 21), { color: 0xffffff }),
      part(jitter(new IcosahedronGeometry(0.62, 0), 0.26, 43), {
        position: [0.46, -0.22, 0.3],
        rotation: [0.6, 0.9, 0.2],
        color: 0xffffff,
      }),
    ]);
    // Colour pass runs after the merge so both lobes share one stone palette.
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const v = lerp(0.32, 0.64, pos.getY(i) * 0.5 + 0.5);
      const fleck = 0.94 + ((i * 37) % 13) / 90;
      colors[i * 3] = v * fleck;
      colors[i * 3 + 1] = v * 0.98;
      colors[i * 3 + 2] = v * 0.94;
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    return geometry;
  }

  _buildBush() {
    return mergeParts([
      part(new SphereGeometry(0.75, 6, 5), { position: [0, 0.55, 0], scale: [1, 0.85, 1], color: 0x2c5c26 }),
      part(new SphereGeometry(0.55, 6, 5), { position: [0.6, 0.45, 0.35], color: 0x356b2b }),
      part(new SphereGeometry(0.5, 6, 5), { position: [-0.55, 0.42, -0.3], color: 0x244f20 }),
    ]);
  }

  _buildLog() {
    return mergeParts([
      part(new CylinderGeometry(0.24, 0.3, 2.6, 6), {
        position: [0, 0.28, 0],
        rotation: [0, 0, Math.PI / 2],
        color: 0x53402a,
      }),
      part(new CylinderGeometry(0.27, 0.27, 0.1, 6), {
        position: [1.2, 0.28, 0],
        rotation: [0, 0, Math.PI / 2],
        color: 0x6b5537,
      }),
    ]);
  }

  _buildPost() {
    return mergeParts([
      part(new BoxGeometry(0.16, 1.15, 0.16), { position: [0, 0.57, 0], color: 0xf0f0e6 }),
      part(new BoxGeometry(0.18, 0.22, 0.18), { position: [0, 0.86, 0], color: 0xd23a25 }),
    ]);
  }

  _buildGrassTuft() {
    const plane = new PlaneGeometry(1, 1);
    return mergeParts([
      part(plane, { position: [0, 0.5, 0], color: 0xffffff }),
      part(plane, { position: [0, 0.5, 0], rotation: [0, Math.PI / 2, 0], color: 0xffffff }),
    ]);
  }

  _buildGates() {
    const group = new Group();
    group.name = 'gates';

    const frame = createFrame();
    const postMat = new MeshStandardMaterial({ color: 0xe9e9dd, roughness: 0.7, flatShading: true });
    const beamMat = new MeshStandardMaterial({ color: 0x2a4a22, roughness: 0.75, flatShading: true });
    this.materials.push(postMat, beamMat);

    const gates = [
      { s: 3, label: 'START', accent: '#7ce23a' },
      { s: this.track.length * 0.25, label: 'SPLIT 1', accent: '#7ce23a' },
      { s: this.track.length * 0.5, label: 'SPLIT 2', accent: '#7ce23a' },
      { s: this.track.length * 0.75, label: 'SPLIT 3', accent: '#7ce23a' },
      { s: this.track.length - 4, label: 'FINISH', accent: '#ffb020' },
    ];

    for (const gate of gates) {
      const g = new Group();
      const half = this.track.halfWidthAt(gate.s) + 1.9;
      this.track.frameAt(gate.s, frame);
      g.position.copy(frame.position);
      g.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);

      const postGeo = new BoxGeometry(0.42, 6.2, 0.42);
      for (const side of [-1, 1]) {
        const post = new Mesh(postGeo, postMat);
        post.position.set(side * half, 3.15, 0);
        post.castShadow = true;
        g.add(post);
      }

      const beam = new Mesh(new BoxGeometry(half * 2 + 0.42, 0.6, 0.5), beamMat);
      beam.position.set(0, 5.85, 0);
      beam.castShadow = true;
      g.add(beam);

      const bannerMat = new MeshStandardMaterial({
        map: signTexture(gate.label, { accent: gate.accent }),
        roughness: 0.85,
        side: DoubleSide,
      });
      this.materials.push(bannerMat);
      const banner = new Mesh(new PlaneGeometry(half * 1.5, 1.35), bannerMat);
      banner.position.set(0, 4.75, 0.02);
      g.add(banner);

      g.updateMatrix();
      g.matrixAutoUpdate = false;
      g.traverse((obj) => {
        if (obj.isMesh) {
          obj.updateMatrix();
          obj.matrixAutoUpdate = false;
        }
      });
      group.add(g);
    }

    return group;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.group.clear();
  }
}
