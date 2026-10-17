/**
 * Reports the built web bundle footprint and estimates the packaged Android APK.
 *
 *   npm run size
 *
 * The web payload is what ships inside the APK (android/app/src/main/assets/public),
 * so keeping it small is the whole file-size story.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const BUDGET_MB = 15;
/** Capacitor + AndroidX runtime, resources and manifest overhead for a release APK. */
const NATIVE_OVERHEAD_MB = 3.6;

if (!existsSync(DIST)) {
  console.error(`No "${DIST}" directory. Run "npm run build" first.`);
  process.exit(1);
}

/** Assets inside an APK are stored compressed, so gzip is the honest estimate. */
const MB = 1024 * 1024;
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg', '.xml', '.txt', '.map']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(DIST)
  .map((path) => {
    const raw = statSync(path).size;
    const ext = extname(path).toLowerCase();
    let packaged = raw;
    if (COMPRESSIBLE.has(ext) && raw > 0) {
      packaged = gzipSync(readFileSync(path), { level: 9 }).length;
    }
    return { path, raw, packaged };
  })
  .sort((a, b) => b.packaged - a.packaged);

const rawTotal = files.reduce((sum, f) => sum + f.raw, 0);
const packagedTotal = files.reduce((sum, f) => sum + f.packaged, 0);
const estimatedApk = packagedTotal / MB + NATIVE_OVERHEAD_MB;

const mb = (bytes) => `${(bytes / MB).toFixed(3)} MB`;

console.log('\nBuilt web bundle (dist/)');
console.log('─'.repeat(64));
for (const file of files) {
  const ratio = file.raw > 0 ? ((1 - file.packaged / file.raw) * 100).toFixed(0) : '0';
  console.log(
    `  ${file.path.replace(/\\/g, '/').padEnd(42)} ${mb(file.raw).padStart(10)}  →  ${mb(file.packaged).padStart(10)}  (-${ratio}%)`
  );
}
console.log('─'.repeat(64));
console.log(`  ${files.length} files`.padEnd(45) + `${mb(rawTotal).padStart(10)}  →  ${mb(packagedTotal).padStart(10)}`);
console.log('');
console.log(`Estimated release APK    ~${estimatedApk.toFixed(1)} MB  (web payload + ~${NATIVE_OVERHEAD_MB} MB native runtime)`);
console.log(`Budget                   < ${BUDGET_MB} MB`);
console.log(`Headroom                 ~${(BUDGET_MB - estimatedApk).toFixed(1)} MB`);

const ok = rawTotal / MB < BUDGET_MB && estimatedApk < BUDGET_MB;
console.log(`\n${ok ? 'PASS' : 'FAIL'} — ${ok ? 'well under the 15 MB target' : 'over the 15 MB target'}`);
process.exit(ok ? 0 : 1);
