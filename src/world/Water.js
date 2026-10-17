import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { part, mergeParts } from './GeoHelpers.js';
import { createFrame } from './Track.js';

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float w = sin(position.x * 0.085 + uTime * 1.15) * 0.30
            + sin(position.y * 0.125 - uTime * 1.55) * 0.24
            + sin((position.x + position.y) * 0.048 + uTime * 0.75) * 0.34;
    transformed.z += w * uAmp;

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vWorldPos = worldPos.xyz;
    vViewDir = worldPos.xyz - cameraPosition;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform sampler2D uNormalMap;
  uniform float uNormalScale;
  uniform float uOpacity;
  uniform float uFoamAmount;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  #include <fog_pars_fragment>

  void main() {
    // Two ripple layers drifting at different speeds and scales; the cross-flow
    // keeps the surface from ever looking like a static tiled repeat.
    vec2 flowA = vWorldPos.xz * 0.021 + vec2(uTime * 0.012, uTime * 0.019);
    vec2 flowB = vWorldPos.xz * 0.033 + vec2(-uTime * 0.016, uTime * 0.009);
    vec3 nA = texture2D(uNormalMap, flowA).xyz * 2.0 - 1.0;
    vec3 nB = texture2D(uNormalMap, flowB).xyz * 2.0 - 1.0;

    // The surface is horizontal, so the map's two in-plane channels tilt the
    // world-space normal directly. No tangent basis needed.
    vec3 N = normalize(vec3((nA.x + nB.x) * uNormalScale, 1.0, (nA.y + nB.y) * uNormalScale));
    vec3 V = normalize(-vViewDir);

    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = mix(0.04, 1.0, pow(1.0 - facing, 4.0));

    // Analytic sky + sun reflection: cheaper than a second scene render and it
    // tracks the biome, because the sky colours are shared with the sky dome.
    vec3 R = reflect(-V, N);
    float skyT = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.44, 0.92, skyT));
    float sun = max(dot(normalize(R), normalize(uSunDir)), 0.0);
    sky += uSunColor * pow(sun, 460.0) * 2.4;
    sky += uSunColor * pow(sun, 22.0) * 0.30;

    // Body colour dips in the wave troughs, so the surface reads as water volume.
    float trough = clamp(nA.x * 0.5 + 0.5, 0.0, 1.0);
    vec3 body = mix(uDeep, uShallow, trough * 0.65);

    // Wave-crest foam, strongest at grazing angles.
    float crest = clamp(1.0 - facing, 0.0, 1.0);
    vec3 col = mix(body, sky, fresnel) + uFoam * pow(crest, 5.0) * uFoamAmount;

    gl_FragColor = vec4(col, clamp(uOpacity + fresnel * 0.14, 0.0, 1.0));
    #include <fog_fragment>
  }
`;

export function createWaterMaterial(opts = {}) {
  const {
    shallow = 0x5f9fb8,
    deep = 0x0f3348,
    foam = 0xe6f2f6,
    skyTop = 0x4a86c4,
    skyBottom = 0xcfe4b8,
    sun = 0xfff3d6,
    sunDir = null,
    opacity = 0.86,
    amp = 1,
    normalScale = 0.5,
    foamAmount = 0.3,
    normalMap = null,
  } = opts;

  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uAmp: { value: amp },
      uOpacity: { value: opacity },
      uNormalScale: { value: normalScale },
      uFoamAmount: { value: foamAmount },
      uNormalMap: { value: null },
      uShallow: { value: new Color(0xffffff) },
      uDeep: { value: new Color(0x000000) },
      uFoam: { value: new Color(0xffffff) },
      uSkyTop: { value: new Color(0xffffff) },
      uSkyBottom: { value: new Color(0xffffff) },
      uSunColor: { value: new Color(0xffffff) },
      uSunDir: { value: new Vector3(0, 1, 0) },
    },
  ]);
  uniforms.uShallow.value.set(shallow);
  uniforms.uDeep.value.set(deep);
  uniforms.uFoam.value.set(foam);
  uniforms.uSkyTop.value.set(skyTop);
  uniforms.uSkyBottom.value.set(skyBottom);
  uniforms.uSunColor.value.set(sun);
  if (sunDir) uniforms.uSunDir.value.copy(sunDir);
  uniforms.uNormalMap.value = normalMap;

  return new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
}

function ribbonGeometry(track, fromS, toS, latOffsets, yFn, uvScale = 8, step = 4) {
  const span = toS - fromS;
  const rows = Math.max(2, Math.round(span / step)) + 1;
  const cols = latOffsets.length;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const colors = new Float32Array(rows * cols * 3).fill(1);
  const frame = createFrame();

  for (let r = 0; r < rows; r++) {
    const s = fromS + (span * r) / (rows - 1);
    track.frameAt(s, frame);
    for (let k = 0; k < cols; k++) {
      const lat = latOffsets[k];
      const idx = (r * cols + k) * 3;
      positions[idx] = frame.position.x + frame.right.x * lat;
      positions[idx + 1] = yFn(s, lat, frame);
      positions[idx + 2] = frame.position.z + frame.right.z * lat;
      const uvidx = (r * cols + k) * 2;
      uvs[uvidx] = lat / uvScale;
      uvs[uvidx + 1] = s / uvScale;
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
  return geometry;
}

export class River {
  constructor(track, terrain, textures = null) {
    this.track = track;
    this.terrain = terrain;
    this.group = new Group();
    this.group.name = 'river';

    this.zone = track.zones.find((z) => z.id === 'river');
    this.waterY = terrain.lowestRoadY(this.zone, 6) - 8;

    const normalMap = textures?.waterNormal?.map ?? null;

    this.riverMaterial = createWaterMaterial({
      shallow: 0x5aa8bf,
      deep: 0x0d3346,
      foam: 0xe8f6fa,
      opacity: 0.82,
      amp: 1,
      normalScale: 0.55,
      foamAmount: 0.34,
      normalMap,
    });
    this.fordMaterial = createWaterMaterial({
      shallow: 0x9dc4ae,
      deep: 0x3d6653,
      foam: 0xf2f8f0,
      opacity: 0.58,
      amp: 0.24,
      normalScale: 0.3,
      foamAmount: 0.6,
      normalMap,
    });
    this.materials = [this.riverMaterial, this.fordMaterial];
    this.skyTargets = {
      top: new Color(0x4a86c4),
      bottom: new Color(0xcfe4b8),
      sun: new Color(0xfff3d6),
    };
  }

  /** Water reflects the sky, so it has to follow the biome like the sky dome does. */
  applyZone(zone) {
    this.skyTargets.top.set(zone.skyTop);
    this.skyTargets.bottom.set(zone.skyBottom);
    this.skyTargets.sun.set(zone.sun);
  }

  build() {
    this.group.add(this._buildRiverSurface());
    this.group.add(this._buildBridge());
    this.group.add(this._buildFord());
    return this.group;
  }

  _buildRiverSurface() {
    const pad = 30;
    const lats = [];
    for (let l = -96; l <= 96.001; l += 8) lats.push(l);
    const geometry = ribbonGeometry(
      this.track,
      this.zone.fromS - pad,
      this.zone.toS + pad,
      lats,
      () => this.waterY,
      8,
      7
    );
    const mesh = new Mesh(geometry, this.riverMaterial);
    mesh.name = 'river-surface';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = 4;
    return mesh;
  }

  _buildBridge() {
    const group = new Group();
    group.name = 'bridge';
    const fromS = this.track.length * 0.352;
    const toS = this.track.length * 0.418;
    const span = toS - fromS;
    const frame = createFrame();
    const half = this.zone.halfWidth;

    const postGeo = mergeParts([
      part(new BoxGeometry(0.12, 1.3, 0.12), {
        position: [0, 0.65, 0],
        color: 0xf2f2ea,
      }),
      part(new BoxGeometry(0.14, 0.22, 0.14), {
        position: [0, 1.16, 0],
        color: 0xcc2f22,
      }),
    ]);

    const postStep = 3.4;
    const postCount = Math.floor(span / postStep);
    const instanced = new InstancedMesh(postGeo, new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.05,
      flatShading: true,
    }), postCount * 2 + 4);

    const matrix = new Matrix4();
    const quat = new Quaternion();
    const scaleOne = new Vector3(1, 1, 1);
    const pos = new Vector3();
    let count = 0;

    for (let i = 0; i < postCount; i++) {
      const s = fromS + i * postStep;
      this.track.frameAt(s, frame);
      const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
      quat.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      for (const side of [-1, 1]) {
        pos
          .copy(frame.position)
          .addScaledVector(frame.right, side * (half + 0.75))
          .add(new Vector3(0, 0.03, 0));
        matrix.compose(pos, quat, scaleOne);
        instanced.setMatrixAt(count++, matrix);
      }
    }
    instanced.count = count;
    instanced.instanceMatrix.needsUpdate = true;
    instanced.castShadow = true;
    instanced.frustumCulled = false;
    group.add(instanced);

    const railGeo = this._tubeRibbon(fromS, toS, half + 0.75, 1.28, 0.1, 0.13);
    const railMat = new MeshStandardMaterial({
      color: 0xf7f7ef,
      roughness: 0.55,
      metalness: 0.15,
      flatShading: true,
      side: DoubleSide,
    });
    const rails = new Mesh(railGeo, railMat);
    rails.castShadow = true;
    group.add(rails);

    const pillarGeo = new BoxGeometry(0.7, 1, 0.7);
    const pillarMat = new MeshStandardMaterial({ color: 0x5f6259, roughness: 0.95, flatShading: true });
    const pillarStep = 13;
    const pillarCount = Math.max(2, Math.floor(span / pillarStep)) * 2;
    const pillars = new InstancedMesh(pillarGeo, pillarMat, pillarCount);
    let pIndex = 0;
    for (let s = fromS + pillarStep * 0.5; s < toS && pIndex < pillarCount; s += pillarStep) {
      this.track.frameAt(s, frame);
      const roadY = frame.position.y;
      const height = Math.max(2, roadY - (this.waterY - 2.5));
      for (const side of [-1, 1]) {
        pos
          .copy(frame.position)
          .addScaledVector(frame.right, side * half * 0.45);
        pos.y = (this.waterY - 2.5 + roadY) * 0.5;
        matrix.compose(pos, quat.identity(), new Vector3(1, height, 1));
        pillars.setMatrixAt(pIndex++, matrix);
      }
    }
    pillars.count = pIndex;
    pillars.instanceMatrix.needsUpdate = true;
    pillars.castShadow = true;
    pillars.frustumCulled = false;
    group.add(pillars);

    return group;
  }

  _tubeRibbon(fromS, toS, lat, height, halfW, halfH) {
    const step = 3.5;
    const rows = Math.max(2, Math.round((toS - fromS) / step)) + 1;
    const cols = 4;
    const positions = new Float32Array(rows * cols * 3);
    const uvs = new Float32Array(rows * cols * 2);
    const colors = new Float32Array(rows * cols * 3).fill(0.97);
    const frame = createFrame();

    const local = [
      [-halfW, -halfH],
      [halfW, -halfH],
      [-halfW, halfH],
      [halfW, halfH],
    ];

    for (let r = 0; r < rows; r++) {
      const s = fromS + ((toS - fromS) * r) / (rows - 1);
      this.track.frameAt(s, frame);
      for (let k = 0; k < cols; k++) {
        const idx = (r * cols + k) * 3;
        positions[idx] = frame.position.x + frame.right.x * (lat + local[k][0]);
        positions[idx + 1] = frame.position.y + height + local[k][1];
        positions[idx + 2] = frame.position.z + frame.right.z * (lat + local[k][0]);
        const uvidx = (r * cols + k) * 2;
        uvs[uvidx] = local[k][0];
        uvs[uvidx + 1] = s;
      }
    }

    const indices = [];
    for (let r = 0; r < rows - 1; r++) {
      const a = r * cols;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const na = (r + 1) * cols;
      const nb = na + 1;
      const nc = na + 2;
      const nd = na + 3;
      indices.push(a, na, b, b, na, nb);
      indices.push(c, nc, d, d, nc, nd);
      indices.push(b, nb, d, d, nb, nd);
      indices.push(a, na, c, c, na, nc);
    }

    const geometry = new BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  _buildFord() {
    const center = this.track.length * 0.856;
    const half = this.track.length * 0.008;
    const geometry = ribbonGeometry(
      this.track,
      center - half,
      center + half,
      [-6.6, -3.3, 0, 3.3, 6.6],
      (s, lat, frame) => frame.position.y + 0.14 + Math.abs(lat) * 0.006,
      6,
      2.2
    );
    const mesh = new Mesh(geometry, this.fordMaterial);
    mesh.name = 'ford';
    mesh.renderOrder = 5;
    return mesh;
  }

  get fordCenterS() {
    return this.track.length * 0.856;
  }

  get fordHalfLength() {
    return this.track.length * 0.008;
  }

  update(dt, sunDir = null) {
    const k = 1 - Math.exp(-1.7 * dt);
    for (const material of this.materials) {
      const u = material.uniforms;
      u.uTime.value += dt;
      u.uSkyTop.value.lerp(this.skyTargets.top, k);
      u.uSkyBottom.value.lerp(this.skyTargets.bottom, k);
      u.uSunColor.value.lerp(this.skyTargets.sun, k);
      if (sunDir) u.uSunDir.value.copy(sunDir);
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material && !this.materials.includes(obj.material)) obj.material.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.group.clear();
  }
}
