import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2 } from '../core/MathUtils.js';

const _matrix = new Matrix4();
const _quat = new Quaternion();
const _euler = new Euler();
const _pos = new Vector3();
const _scale = new Vector3();

function toNonIndexed(geometry) {
  return geometry.index ? geometry.toNonIndexed() : geometry.clone();
}

/**
 * Clones a primitive, transforms it, and bakes a per-vertex colour so an entire
 * prop can be merged into one vertex-coloured geometry (one draw call, no textures).
 */
export function part(geometry, opts = {}) {
  const {
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    color = 0xffffff,
    colorFn = null,
  } = opts;

  const g = toNonIndexed(geometry);
  _pos.set(position[0], position[1], position[2]);
  _euler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
  _quat.setFromEuler(_euler);
  _scale.set(scale[0], scale[1], scale[2]);
  _matrix.compose(_pos, _quat, _scale);
  g.applyMatrix4(_matrix);

  const posAttr = g.attributes.position;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  const base = new Color(color);
  const out = new Color();

  for (let i = 0; i < count; i++) {
    let c = base;
    if (colorFn) c = colorFn(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i), base, out) || base;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export function mergeParts(parts) {
  const list = parts.filter(Boolean);
  if (list.length === 0) return null;
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged;
}

export function jitter(geometry, amount, seed = 1, axisMask = [1, 1, 1]) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise2(x * 0.7 + seed * 13.7, z * 0.7 + y * 0.3 + seed * 3.1) - 0.5;
    pos.setXYZ(i, x + n * amount * axisMask[0], y + n * amount * axisMask[1], z + n * amount * axisMask[2]);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds a quad-grid surface from a rows x cols matrix of positions.
 * `onVertex(point, r, k, outVec, outColor)` writes colour into `outColor`.
 */
export function gridGeometry(rows, cols, positions, colors, uvs) {
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
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
