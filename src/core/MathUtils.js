export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const saturate = (v) => clamp(v, 0, 1);

export function smoothstep(edge0, edge1, x) {
  const d = edge1 - edge0;
  const t = saturate(d === 0 ? 0 : (x - edge0) / d);
  return t * t * (3 - 2 * t);
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function shortestAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dampAngle(current, target, lambda, dt) {
  return current + shortestAngle(current, target) * (1 - Math.exp(-lambda * dt));
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    chance: (p) => next() < p,
  };
}

function hash2i(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2i(xi, yi);
  const b = hash2i(xi + 1, yi);
  const c = hash2i(xi, yi + 1);
  const d = hash2i(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

export function noise1(x, seed = 0) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = xf * xf * (3 - 2 * xf);
  return lerp(hash2i(xi, seed), hash2i(xi + 1, seed), u);
}

/** Lattice-wrapped value noise: the result repeats seamlessly every `period` cells. */
function wrappedNoise2(x, y, period) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = ((xi + 1) % period + period) % period;
  const y1 = ((yi + 1) % period + period) % period;
  const a = hash2i(x0, y0);
  const b = hash2i(x1, y0);
  const c = hash2i(x0, y1);
  const d = hash2i(x1, y1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/**
 * Seamless fBm over a `basePeriod` x `basePeriod` domain. Every octave doubles its
 * lattice period so the whole stack still wraps — no visible seams when a texture
 * is repeated across a road that runs for two kilometres.
 */
export function tileableFbm2(u, v, basePeriod = 4, octaves = 5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * wrappedNoise2(u * freq, v * freq, basePeriod * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
