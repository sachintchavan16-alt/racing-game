/**
 * Generates the Android launcher icon and splash screen procedurally, so the
 * repository stays free of committed binary art.
 *
 *   npm run assets
 *
 * Produces assets/icon.png (1024x1024) and assets/splash.png (2732x2732), then
 * `npx @capacitor/assets generate --android` turns them into the full
 * Android mipmap/drawable set.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/* ---------- minimal PNG encoder ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const rawData = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(rawData, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rawData, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- drawing helpers (unit space: -1..1) ---------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function renderIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  const half = size / 2;

  const SUN = { x: 0.34, y: -0.34, r: 0.17 };
  const PEAK_A = { apex: [-0.34, -0.02], spread: 0.62, baseY: 0.5, color: [0.05, 0.14, 0.08] };
  const PEAK_B = { apex: [0.44, 0.16], spread: 0.55, baseY: 0.5, color: [0.09, 0.24, 0.12] };
  const SKY_DEEP = [0.05, 0.16, 0.12];
  const SKY_HAZE = [0.32, 0.55, 0.28];
  const GROUND = [0.045, 0.13, 0.06];
  const WHEEL = { x: 0, y: 0.2, outer: 0.4, inner: 0.31, hub: 0.085 };

  for (let py = 0; py < size; py++) {
    const v = (py / (size - 1)) * 2 - 1;
    for (let px = 0; px < size; px++) {
      const u = (px / (size - 1)) * 2 - 1;
      const cov = (d) => clamp01(0.5 - d * half);

      let r = 0;
      let g = 0;
      let b = 0;

      const t = clamp01((v + 1) * 0.5);
      const hazeAmount = Math.pow(t, 1.7);
      r = SKY_DEEP[0] + (SKY_HAZE[0] - SKY_DEEP[0]) * hazeAmount;
      g = SKY_DEEP[1] + (SKY_HAZE[1] - SKY_DEEP[1]) * hazeAmount;
      b = SKY_DEEP[2] + (SKY_HAZE[2] - SKY_DEEP[2]) * hazeAmount;

      const glow = Math.pow(clamp01(1 - Math.hypot(u - SUN.x, v - SUN.y) / 0.9), 2.4);
      r += glow * 0.3;
      g += glow * 0.19;
      b += glow * 0.05;

      for (const peak of [PEAK_A, PEAK_B]) {
        const [ax, ay] = peak.apex;
        const edgeX = u >= ax ? ax + peak.spread : ax - peak.spread;
        const span = edgeX - ax;
        if (Math.abs(span) < 1e-6) continue;
        const k = (u - ax) / span;
        if (k < 0 || k > 1) continue;
        const ridgeY = ay + (peak.baseY - ay) * k;
        const a = cov(ridgeY - v);
        if (a > 0) {
          r = r * (1 - a) + peak.color[0] * a;
          g = g * (1 - a) + peak.color[1] * a;
          b = b * (1 - a) + peak.color[2] * a;
        }
      }

      const groundA = cov(0.5 - v);
      if (groundA > 0) {
        r = r * (1 - groundA) + GROUND[0] * groundA;
        g = g * (1 - groundA) + GROUND[1] * groundA;
        b = b * (1 - groundA) + GROUND[2] * groundA;
      }

      const sunD = Math.hypot(u - SUN.x, v - SUN.y) - SUN.r;
      const sunA = cov(sunD);
      if (sunA > 0) {
        r = r * (1 - sunA) + 1.0 * sunA;
        g = g * (1 - sunA) + 0.7 * sunA;
        b = b * (1 - sunA) + 0.14 * sunA;
      }

      const wx = u - WHEEL.x;
      const wy = v - WHEEL.y;
      const wd = Math.hypot(wx, wy);
      const tireA = cov(Math.abs(wd - (WHEEL.outer + WHEEL.inner) * 0.5) - (WHEEL.outer - WHEEL.inner) * 0.5);
      if (tireA > 0) {
        const shade = 0.75 + 0.25 * clamp01(1 - wd);
        r = r * (1 - tireA) + 0.56 * shade * tireA;
        g = g * (1 - tireA) + 0.94 * shade * tireA;
        b = b * (1 - tireA) + 0.29 * shade * tireA;
      }

      const hubA = cov(wd - WHEEL.hub);
      if (hubA > 0) {
        r = r * (1 - hubA) + 0.85 * hubA;
        g = g * (1 - hubA) + 0.9 * hubA;
        b = b * (1 - hubA) + 0.87 * hubA;
      }

      if (wd < WHEEL.outer && wd > WHEEL.hub) {
        const ang = Math.atan2(wy, wx);
        for (let i = 0; i < 6; i++) {
          const a0 = (i * Math.PI) / 6;
          let diff = Math.abs(((ang - a0 + Math.PI) % Math.PI) - Math.PI / 2);
          diff = Math.PI / 2 - diff;
          const radial = wd * Math.abs(Math.sin(diff)) * 2;
          const spokeA = cov(radial - 0.016) * clamp01((wd - WHEEL.hub) / 0.05) * clamp01((WHEEL.outer - wd) / 0.05);
          if (spokeA > 0) {
            r = r * (1 - spokeA) + 0.72 * spokeA;
            g = g * (1 - spokeA) + 0.96 * spokeA;
            b = b * (1 - spokeA) + 0.5 * spokeA;
          }
        }
      }

      const i = (py * size + px) * 4;
      rgba[i] = Math.round(clamp01(r) * 255);
      rgba[i + 1] = Math.round(clamp01(g) * 255);
      rgba[i + 2] = Math.round(clamp01(b) * 255);
      rgba[i + 3] = 255;
    }
  }

  return rgba;
}

function renderSplash(size) {
  const rgba = new Uint8Array(size * size * 4);
  const logoSize = Math.round(size * 0.26);
  const logo = renderIcon(logoSize);
  const offset = Math.round((size - logoSize) / 2);

  for (let py = 0; py < size; py++) {
    const v = (py / (size - 1)) * 2 - 1;
    for (let px = 0; px < size; px++) {
      const u = (px / (size - 1)) * 2 - 1;
      const d = Math.hypot(u * 0.9, v);
      const t = clamp01(d);
      const r = 0.043 + (1 - t) * 0.07;
      const g = 0.14 + (1 - t) * 0.16;
      const b = 0.06 + (1 - t) * 0.05;

      const i = (py * size + px) * 4;
      rgba[i] = Math.round(clamp01(r) * 255);
      rgba[i + 1] = Math.round(clamp01(g) * 255);
      rgba[i + 2] = Math.round(clamp01(b) * 255);
      rgba[i + 3] = 255;
    }
  }

  for (let y = 0; y < logoSize; y++) {
    for (let x = 0; x < logoSize; x++) {
      const li = (y * logoSize + x) * 4;
      const alpha = logo[li + 3] / 255;
      if (alpha <= 0) continue;
      const di = ((y + offset) * size + (x + offset)) * 4;
      rgba[di] = Math.round(rgba[di] * (1 - alpha) + logo[li] * alpha);
      rgba[di + 1] = Math.round(rgba[di + 1] * (1 - alpha) + logo[li + 1] * alpha);
      rgba[di + 2] = Math.round(rgba[di + 2] * (1 - alpha) + logo[li + 2] * alpha);
    }
  }

  return rgba;
}

/* ---------- write ---------- */

mkdirSync(OUT_DIR, { recursive: true });

const ICON = 1024;
const SPLASH = 2732;

const outputs = [
  ['icon.png', ICON, renderIcon(ICON)],
  ['splash.png', SPLASH, renderSplash(SPLASH)],
];

for (const [name, size, pixels] of outputs) {
  const png = encodePNG(size, size, pixels);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`  assets/${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log('\nGenerated. Next:');
console.log("  npx @capacitor/assets generate --android --iconBackgroundColor '#0d2a14'");
console.log('(or keep the Capacitor default icons and skip this step entirely)');
