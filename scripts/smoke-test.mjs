/**
 * Headless smoke test.
 *
 * Runs the full world-building pipeline (everything except the WebGL renderer and
 * the DOM UI) under Node, then simulates a complete race. Useful as a fast
 * pre-build sanity check, and in CI before `npm run build`.
 *
 *   npm run smoke
 */

function makeGradient() {
  return { addColorStop() {} };
}

function makeContext2D() {
  const noop = () => {};
  return {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    fillText: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient,
    createPattern: () => null,
    drawImage: noop,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: noop,
  };
}

function makeCanvas() {
  return new FakeElement('canvas');
}

class FakeClassList {
  constructor() {
    this.items = new Set();
  }
  add(...names) {
    for (const n of names) if (n) this.items.add(n);
  }
  remove(...names) {
    for (const n of names) this.items.delete(n);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.items.has(name) : Boolean(force);
    if (on) this.items.add(name);
    else this.items.delete(name);
    return on;
  }
  contains(name) {
    return this.items.has(name);
  }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.dataset = {};
    this.offsetWidth = 120;
    this.width = 0;
    this.height = 0;
    this.disabled = false;
    this.type = '';
    this._text = '';
    this._html = '';
  }

  get className() {
    return [...this.classList.items].join(' ');
  }
  set className(value) {
    this.classList.items = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get textContent() {
    if (this.children.length) return this._text + this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get innerHTML() {
    return this._html;
  }
  set innerHTML(value) {
    this._html = String(value);
  }
  get firstChild() {
    return this.children[0] || null;
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    for (const n of nodes) this.appendChild(n);
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  dispatch(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) fn({ preventDefault() {}, ...event });
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 138, height: 138 };
  }
  getContext() {
    return makeContext2D();
  }
  querySelector() {
    return null;
  }
  /** Recursively collect every descendant matching a class name. */
  find(predicate, out = []) {
    for (const child of this.children) {
      if (predicate(child)) out.push(child);
      child.find?.(predicate, out);
    }
    return out;
  }
}

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

defineGlobal('document', {
  createElement: (tag) => new FakeElement(tag),
  getElementById: () => new FakeElement('div'),
  addEventListener() {},
  removeEventListener() {},
  documentElement: { requestFullscreen: async () => {} },
  fullscreenElement: null,
  hidden: false,
});
defineGlobal('window', {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  location: { search: '' },
  localStorage: { getItem: () => null, setItem() {} },
  setTimeout,
  requestAnimationFrame: (cb) => setTimeout(() => cb(0), 0),
});
defineGlobal('screen', { orientation: null });
defineGlobal('navigator', { getGamepads: () => [] });
defineGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(0), 0));
defineGlobal('self', globalThis);

const t0 = Date.now();
const failures = [];

function check(label, ok, detail = '') {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

const { buildTextureLibrary } = await import('../src/assets/textures.js');
const { Track, createFrame } = await import('../src/world/Track.js');
const { Terrain } = await import('../src/world/Terrain.js');
const { River } = await import('../src/world/Water.js');
const { Scenery } = await import('../src/world/Scenery.js');
const { AnimalSystem } = await import('../src/world/Animals.js');
const { Obstacles } = await import('../src/world/Obstacles.js');
const { Sky } = await import('../src/world/Sky.js');
const { Bike } = await import('../src/bike/Bike.js');
const { BikePhysics, BIKE, centrifugalDrift } = await import('../src/bike/Physics.js');
const { AIDriver } = await import('../src/bike/AIDriver.js');
const { resolveContacts, CONTACT_LONG, CONTACT_LAT } = await import('../src/bike/Contacts.js');
const { RACER_STYLES, PLAYER_STYLE_ID, getStyle } = await import('../src/bike/BikeStyles.js');
const { Scene, Vector3 } = await import('three');

const scene = new Scene();

console.log('\n[ textures ]');
const textures = buildTextureLibrary();
check('texture library generated', Object.keys(textures).length >= 8, `${Object.keys(textures).length} entries`);
const surfaceKinds = [...Object.values(textures.road), ...Object.values(textures.ground)];
check(
  'every surface ships albedo + normal + packed roughness',
  surfaceKinds.every((s) => s.map && s.normalMap && s.orm),
  `${surfaceKinds.length} surfaces`
);
check(
  'ORM maps share the albedo uv channel',
  surfaceKinds.every((s) => s.orm.channel === 0)
);
check('animal fur detail normal present', !!textures.fur.map);

console.log('\n[ track ]');
const track = new Track({ step: 1.5 });
console.log(`  length ${track.length.toFixed(1)} m · ${track.sampleCount} samples · ${track.zones.length} zones`);
check('track length plausible', track.length > 1800 && track.length < 3400, `${track.length.toFixed(1)} m`);
check('zones cover the whole course', Math.abs(track.zones.at(-1).toS - track.length) < 1);
check(
  'zone ranges monotonic',
  track.zones.every((z, i) => z.toS > z.fromS && (i === 0 || z.fromS >= track.zones[i - 1].fromS))
);

const frame = createFrame();
let frameOk = true;
let yawFlip = 0;
let prevHeading = null;
for (let s = -20; s <= track.length + 20; s += 7) {
  track.frameAt(s, frame);
  const values = [
    frame.position.x,
    frame.position.y,
    frame.position.z,
    frame.tangent.x,
    frame.right.x,
    frame.up.x,
    frame.bank,
  ];
  if (values.some((v) => !Number.isFinite(v))) frameOk = false;
  if (Math.abs(frame.tangent.length() - 1) > 0.01) frameOk = false;
  if (Math.abs(frame.right.length() - 1) > 0.01) frameOk = false;
  if (Math.abs(frame.up.length() - 1) > 0.01) frameOk = false;
  if (Math.abs(frame.tangent.dot(frame.right)) > 0.02) frameOk = false;
  if (Math.abs(frame.tangent.dot(frame.up)) > 0.02) frameOk = false;
  const heading = Math.atan2(frame.tangent.x, frame.tangent.z);
  if (prevHeading !== null) {
    let d = heading - prevHeading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 0.5) yawFlip++;
  }
  prevHeading = heading;
}
check('frames finite + orthonormal', frameOk);
check('no tangent discontinuities', yawFlip === 0, `${yawFlip} jumps`);

console.log('\n[ terrain ]');
const terrain = new Terrain(track);
terrain.build(textures);
check('terrain mesh per zone', terrain.group.children.length === track.zones.length);

let terrainFinite = true;
let underRoadOk = true;
let minH = Infinity;
let maxH = -Infinity;
for (let s = 5; s < track.length; s += 23) {
  const half = track.halfWidthAt(s);
  const roadY = track.frameAt(s, frame).position.y;
  if (Math.abs(terrain.heightAt(s, 0) - (roadY - 0.45)) > 0.6) underRoadOk = false;
  for (const side of [-1, 1]) {
    for (const extra of [0.6, 2, 8, 30, 60, 90]) {
      const h = terrain.heightAt(s, side * (half + extra));
      if (!Number.isFinite(h)) terrainFinite = false;
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
    }
  }
}
check('terrain heights finite', terrainFinite);
check('terrain tucks under the road', underRoadOk);
check(
  'terrain height range sane',
  minH > -40 && maxH < 220,
  `${minH.toFixed(1)} .. ${maxH.toFixed(1)}`
);

console.log('\n[ road ]');
const road = track.buildRoad(textures);
check('road mesh per zone', road.children.length === track.zones.length);
let roadFinite = true;
let roadVerts = 0;
for (const mesh of road.children) {
  const pos = mesh.geometry.attributes.position;
  roadVerts += pos.count;
  for (let i = 0; i < pos.count; i += 37) {
    if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
      roadFinite = false;
    }
  }
}
check('road vertices finite', roadFinite, `${roadVerts} verts`);

console.log('\n[ river ]');
const river = new River(track, terrain);
river.build();
check('river parts built', river.group.children.length === 3, `${river.group.children.length}`);
check(
  'water surface below the road',
  river.waterY < track.frameAt(river.zone.fromS, frame).position.y - 4,
  `y=${river.waterY.toFixed(1)}`
);
check('ford sits inside the descent zone', river.fordCenterS > track.length * 0.8);

console.log('\n[ scenery ]');
const scenery = new Scenery(track, terrain, textures, 1337);
scenery.build();
check('scenery instances placed', scenery.stats.instances > 3000, `${scenery.stats.instances} instances`);
let chunkCount = 0;
scenery.group.traverse((obj) => {
  if (obj.isInstancedMesh) chunkCount++;
});
check('scenery is chunked for culling', chunkCount >= 15, `${chunkCount} instanced chunks`);

console.log('\n[ animals ]');
const animals = new AnimalSystem(track, terrain, { textures, seed: 90210 });
animals.build();
check('all three species present', animals.systems.length === 3);
check('animals placed', animals.stats.total >= 20, `${animals.stats.total} animals`);
check(
  'wildlife picks up the fur detail normal',
  animals.materials.every((m) => m.normalMap && m.normalScale.x > 0)
);

console.log('\n[ sky / light / bike ]');
const sky = new Sky(scene, { shadowMapSize: 1024 });
check('sky dome + sun + hemi light', !!sky.dome && !!sky.sun && !!sky.hemi);

const bike = new Bike();
bike.place(new Vector3(), 0, 0, 0, 0);
bike.update(1 / 60, { wheelSpin: 5, steerVisual: 0.3, speed: 12, airborne: false });
check('bike hierarchy intact', bike.rollGroup.children.length >= 4);
check('bike defaults to the player livery', bike.style.id === PLAYER_STYLE_ID, bike.style.id);

console.log('\n[ sportbike models ]');
const modelReport = [];
let allModelsOk = true;
const geometryKeys = new Set();
for (const style of RACER_STYLES) {
  const instance = new Bike(style);
  const body = instance.rollGroup.children[0];
  const rider = instance.rollGroup.children[1];
  const tris = (body.geometry.attributes.position.count + rider.geometry.attributes.position.count) / 3;
  geometryKeys.add(
    [
      body.geometry.attributes.position.count,
      instance.frontGroup.children[0].geometry.attributes.position.count,
      instance.rearWheel.geometry.attributes.position.count,
    ].join(':')
  );
  if (tris < 100 || instance.frontGroup.children.length < 2) allModelsOk = false;
  modelReport.push(`${style.brand} ${style.model} ${Math.round(tris)} tris`);
}
check('all five liveries build', RACER_STYLES.length === 5 && allModelsOk);
check(
  'liveries have distinct silhouettes',
  geometryKeys.size === RACER_STYLES.length,
  `${geometryKeys.size}/${RACER_STYLES.length} unique`
);
check('brand references present', ['HONDA', 'YAMAHA', 'KAWASAKI', 'KTM'].every((b) => RACER_STYLES.some((s) => s.brand === b)));
console.log(`  ${modelReport.join('\n  ')}`);

console.log('\n[ shading pipeline ]');

/** Every `uniform <type> <name>;` written in a shader source. */
function declaredUniforms(source) {
  const names = [];
  const re = /^[ \t]*uniform[ \t]+\w+[ \t]+(\w+)[ \t]*;/gm;
  let match;
  while ((match = re.exec(source || ''))) names.push(match[1]);
  return names;
}

function shaderIssues(material) {
  const vertex = material.vertexShader || '';
  const fragment = material.fragmentShader || '';
  const declared = new Set([...declaredUniforms(vertex), ...declaredUniforms(fragment)]);
  const provided = new Set(Object.keys(material.uniforms || {}));
  const missing = [...declared].filter((name) => !provided.has(name));

  let unbalanced = false;
  for (const source of [vertex, fragment]) {
    let depth = 0;
    for (const ch of source) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth < 0) unbalanced = true;
      }
    }
    if (depth !== 0) unbalanced = true;
  }
  return { missing, unbalanced };
}

const stubRenderer = {
  capabilities: { isWebGL2: true },
  extensions: { has: () => true },
};
const { PostFX, POST_QUALITY } = await import('../src/render/PostFX.js');
const { Environment } = await import('../src/render/Environment.js');

const postFX = new PostFX(stubRenderer);
check('post pipeline constructs', postFX.available === true);
check(
  'quality tiers scale monotonically',
  POST_QUALITY.off.enabled === false &&
    POST_QUALITY.medium.enabled === true &&
    POST_QUALITY.high.aoSamples > POST_QUALITY.medium.aoSamples &&
    POST_QUALITY.high.motionSamples > POST_QUALITY.medium.motionSamples &&
    POST_QUALITY.high.bloomLevels > POST_QUALITY.medium.bloomLevels
);
postFX.setQuality(POST_QUALITY.high);
check(
  'quality tier reaches the composite uniforms',
  postFX.compositeMaterial.uniforms.uAOSamples.value === POST_QUALITY.high.aoSamples &&
    postFX.enabled === true
);
check('post can be disabled', (postFX.setQuality(POST_QUALITY.off), postFX.enabled === false));

const texturedRiver = new River(track, terrain, textures);
const shaderMaterials = [
  ['bright pass', postFX.brightMaterial],
  ['bloom blur', postFX.blurMaterial],
  ['bloom combine', postFX.addMaterial],
  ['composite', postFX.compositeMaterial],
  ['river water', texturedRiver.riverMaterial],
  ['ford water', texturedRiver.fordMaterial],
  ['sky dome', sky.material],
];
const shaderProblems = [];
for (const [label, material] of shaderMaterials) {
  const { missing, unbalanced } = shaderIssues(material);
  if (missing.length) shaderProblems.push(`${label}: missing uniforms ${missing.join(', ')}`);
  if (unbalanced) shaderProblems.push(`${label}: unbalanced braces`);
}
check(
  'every declared shader uniform is supplied',
  shaderProblems.length === 0,
  shaderProblems.join(' | ') || `${shaderMaterials.length} materials clean`
);
check(
  'the composite applies tone mapping and the sRGB transfer once',
  /acesFilmic/.test(postFX.compositeMaterial.fragmentShader) &&
    /sRGBTransferOETF/.test(postFX.compositeMaterial.fragmentShader)
);
check('depth-based AO is present in the composite', /ambientOcclusion/.test(postFX.compositeMaterial.fragmentShader));

const env = new Environment(stubRenderer, { intensity: 0.5 });
check('environment module exposes a PMREM refresh API', typeof env.refresh === 'function' && typeof env.build === 'function');
check('environment starts empty', env.texture === null && env.zoneId === null);
env.dispose();

// Guard against the class of bug that once broke the boot screen: a scratch buffer
// used by a method called from the constructor but allocated further down.
const { readFileSync, existsSync } = await import('node:fs');
const gameSource = readFileSync(new URL('../src/core/Game.js', import.meta.url), 'utf8');
const physicsSource = readFileSync(new URL('../src/bike/Physics.js', import.meta.url), 'utf8');
const tmpSizeAt = gameSource.indexOf('this._tmpSize =');
const applyQualityAt = gameSource.indexOf('this.applyQuality(');
check(
  'constructor scratch buffers are allocated before first use',
  tmpSizeAt > 0 && applyQualityAt > 0 && tmpSizeAt < applyQualityAt,
  `_tmpSize at ${tmpSizeAt}, applyQuality at ${applyQualityAt}`
);

// Particle effects must stay gone: no emitter module, no emitter calls, no state.
const particleRefs = /Spray|emitSpray|emitExhaustSmoke|exhaustAnchor|sprayAccumulator|smokeAccumulator/.test(
  gameSource
);
const particleState = /mudSpray|waterSpray/.test(physicsSource);
check(
  'no particle system remains',
  !existsSync(new URL('../src/world/Spray.js', import.meta.url)) && !particleRefs && !particleState,
  `module=${existsSync(new URL('../src/world/Spray.js', import.meta.url))} refs=${particleRefs} state=${particleState}`
);

console.log('\n[ soundtrack ]');
const { Music } = await import('../src/audio/Music.js');
const music = new Music({ volume: 0.3 });
check('music constructs without touching Web Audio', music.ctx === null && music.playing === false);
const started = await music.start();
check('music degrades gracefully with no AudioContext', started === false && music.playing === false);
music.setIntensity(0.85);
music.setPaused(true);
music.setPaused(false);
music.setMuted(true);
check('mute preference is tracked and persisted', music.muted === true);
music.stop();
music.dispose();
check('music teardown is safe', music.ctx === null && music.timer === null);

console.log('\n[ hazards ]');
const obstacles = new Obstacles(track);
obstacles.build();
check('hazards placed', obstacles.list.length >= 6, `${obstacles.list.length} hazards`);
const ramps = track.rampPositions();
const gates = [0, 0.25, 0.5, 0.75, 1].map((f) => f * track.length);
check(
  'hazards stay clear of jump ramps',
  obstacles.list.every((o) => ramps.every((r) => Math.abs(r - o.s) >= 29)),
  '30 m clearance'
);
check(
  'hazards stay clear of checkpoint gates',
  obstacles.list.every((o) => gates.every((g) => Math.abs(g - o.s) >= 21)),
  '22 m clearance'
);
let hazardsOnRoad = true;
for (const o of obstacles.list) {
  const half = track.halfWidthAt(o.s);
  if (Math.abs(o.lateral) > half - 1) hazardsOnRoad = false;
}
check('hazards sit on the racing surface', hazardsOnRoad);
check('hazard types mixed', new Set(obstacles.list.map((o) => o.type)).size === 2);

console.log('\n[ race simulation: solo physics regression ]');
const physics = new BikePhysics(track);
const dt = 1 / 60;
let simTime = 0;
let nanSeen = false;
let offRoadFrames = 0;
let airFrames = 0;
let maxSlip = 0;
let steering = 0;

while (!physics.finished && simTime < 400) {
  const feed = centrifugalDrift(track.curvatureAt(physics.s), physics.speed);
  const desired = clampf(-physics.lateral * 0.16 + feed, -1, 1);
  steering = approach(steering, desired, 9, dt);

  physics.update(dt, { throttle: 1, brake: 0, steer: steering });
  bike.place(physics.position, physics.yaw, physics.bank, physics.lean, physics.pitch);
  bike.update(dt, physics);

  const p = physics.position;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) || !Number.isFinite(physics.speed)) {
    nanSeen = true;
    break;
  }
  if (physics.surface.offroad > 0.3) offRoadFrames++;
  if (physics.airborne) airFrames++;
  maxSlip = Math.max(maxSlip, physics.slip);
  simTime += dt;
}

console.log(
  `  finished=${physics.finished} in ${simTime.toFixed(1)}s · top ${(physics.topSpeed * 3.6).toFixed(1)} km/h · ` +
    `air ${physics.totalAirTime.toFixed(2)}s · off-road frames ${offRoadFrames} · max slip ${maxSlip.toFixed(2)}`
);
check('no NaN during the race', !nanSeen);
check('course is completable', physics.finished, `progress ${(physics.progress * 100).toFixed(1)}%`);
check(
  'top speed in design range',
  physics.topSpeed * 3.6 > 90 && physics.topSpeed * 3.6 < 165,
  `${(physics.topSpeed * 3.6).toFixed(0)} km/h`
);
check('mud/water produce slip', maxSlip > 0, `max slip ${maxSlip.toFixed(2)}`);
check('jump ramps launch the bike', physics.totalAirTime > 0.15, `${physics.totalAirTime.toFixed(2)}s airborne`);

console.log('\n[ ai field race ]');
const { RACE_FIELD } = await import('../src/core/Game.js');

function buildField() {
  return RACE_FIELD.map((entry, index) => {
    const style = getStyle(entry.player ? PLAYER_STYLE_ID : entry.ai.styleId);
    const body = new BikePhysics(track);
    body.reset();
    body.s = entry.s;
    body.lateral = entry.lateral;
    body.surface = track.surfaceAt(body.s, body.lateral);
    body.syncTransform();
    return {
      id: `${index}-${style.id}`,
      name: entry.player ? 'YOU' : entry.ai.name,
      style,
      isPlayer: Boolean(entry.player),
      physics: body,
      slot: { s: entry.s, lateral: entry.lateral },
      finished: false,
      finishTime: 0,
      hitFlash: 0,
      hazardHits: 0,
      position: index + 1,
      driver: entry.player ? null : new AIDriver(track, body, { ...entry.ai }),
    };
  });
}

const field = buildField();
const bodies = field.map((r) => r.physics);
const playerRacer = field.find((r) => r.isPlayer);

// A max-skill reference driver stands in for a competent human on the controls.
const reference = new AIDriver(track, playerRacer.physics, {
  name: 'REFERENCE',
  skill: 1,
  lane: 0,
  cornerCaution: 0.95,
  avoidStrength: 1.2,
  rampBravery: 1,
  rubberBand: false,
});

let fieldTime = 0;
let fieldNaN = false;
let trackLimitBreach = 0;
let overlapFrames = 0;
let frames = 0;
let aiBrakeFrames = 0;
let aiSteerFrames = 0;
let maxAbsSteer = 0;
const aiHits = new Map();

while (fieldTime < 400 && field.some((r) => !r.finished)) {
  const refS = playerRacer.physics.s;
  for (const racer of field) {
    const input = racer.isPlayer
      ? reference.update(dt, bodies, obstacles.list, refS)
      : racer.driver.update(dt, bodies, obstacles.list, refS);
    racer.physics.update(dt, input);
    if (!racer.isPlayer) {
      if (input.brake > 0.05) aiBrakeFrames++;
      if (Math.abs(input.steer) > 0.15) aiSteerFrames++;
      maxAbsSteer = Math.max(maxAbsSteer, Math.abs(input.steer));
    }
  }
  resolveContacts(field, obstacles, dt);
  fieldTime += dt;
  frames++;

  for (const racer of field) {
    const p = racer.physics;
    if (!Number.isFinite(p.s) || !Number.isFinite(p.lateral) || !Number.isFinite(p.speed)) fieldNaN = true;
    if (Math.abs(p.lateral) > p.surface.zone.halfWidth + BIKE.LATERAL_MARGIN + 0.01) trackLimitBreach++;
    if (!racer.finished && p.finished) {
      racer.finished = true;
      racer.finishTime = fieldTime;
    }
  }

  for (let i = 0; i < field.length; i++) {
    for (let j = i + 1; j < field.length; j++) {
      const a = field[i].physics;
      const b = field[j].physics;
      if (
        Math.abs(a.s - b.s) < CONTACT_LONG * 0.5 &&
        Math.abs(a.lateral - b.lateral) < CONTACT_LAT * 0.5
      ) {
        overlapFrames++;
      }
    }
  }
}

const finished = field.filter((r) => r.finished);
const times = finished.map((r) => r.finishTime);
const spread = times.length ? Math.max(...times) - Math.min(...times) : Infinity;
const order = field.slice().sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity));

console.log(`  field of ${field.length} · race decided in ${fieldTime.toFixed(1)}s`);
for (let i = 0; i < order.length; i++) {
  const racer = order[i];
  const hits = racer.hazardHits || 0;
  if (!racer.isPlayer && hits > 0) aiHits.set(racer.name, hits);
  console.log(
    `  P${i + 1}  ${racer.name.padEnd(9)} ${racer.finished ? `${racer.finishTime.toFixed(2)}s` : 'DNF'.padEnd(6)}` +
      `  top ${(racer.physics.topSpeed * 3.6).toFixed(0)} km/h  hazards ${hits}`
  );
}
console.log(
  `  finish spread ${spread.toFixed(2)}s · AI braking ${aiBrakeFrames} frames · AI steering ${aiSteerFrames} frames · peak steer ${maxAbsSteer.toFixed(2)}`
);

check('every rider finishes', finished.length === field.length, `${finished.length}/${field.length}`);
check('no NaN across the field', !fieldNaN);
check('nobody is pushed off the road', trackLimitBreach === 0, `${trackLimitBreach} frames over the limit`);
check('riders do not pass through each other', overlapFrames < frames * 0.08, `${overlapFrames}/${frames} overlap frames`);
check('AI brakes for corners', aiBrakeFrames > 20, `${aiBrakeFrames} frames on the brakes`);
check('AI steers meaningfully', maxAbsSteer > 0.5 && aiSteerFrames > 500, `peak ${maxAbsSteer.toFixed(2)}`);
check('the field finishes close together', spread < 30, `${spread.toFixed(2)}s spread`);
check('positions resolve to a full ranking', new Set(order.map((_, i) => i + 1)).size === field.length);
check(
  'AI mostly avoids the hazards',
  [...aiHits.values()].reduce((a, b) => a + b, 0) < 12,
  `${[...aiHits.values()].reduce((a, b) => a + b, 0)} hits`
);
check(
  'liveries in the field are unique',
  new Set(field.map((r) => r.style.id)).size === field.length,
  field.map((r) => r.style.id).join(', ')
);

console.log('\n[ animal behaviour ]');
let animalNaN = false;
let animalsOnRoad = 0;
let minLat = Infinity;
let everFled = 0;
const player = { position: new Vector3(), s: 0, lateral: 0 };
const sweepFrame = createFrame();
const playerPositionFromTrack = (s) => {
  track.frameAt(s, sweepFrame);
  player.position.copy(sweepFrame.position);
  player.s = s;
};

for (let i = 0; i < 900; i++) {
  playerPositionFromTrack((i * 2.6) % track.length);
  animals.update(dt, player);
  for (const sys of animals.systems) {
    if (sys.fleeing > 0) everFled += sys.fleeing;
    for (const a of sys.animals) {
      if (!Number.isFinite(a.s) || !Number.isFinite(a.lat)) animalNaN = true;
      const half = track.halfWidthAt(a.s);
      if (Math.abs(a.lat) < half + 3.4) animalsOnRoad++;
      minLat = Math.min(minLat, Math.abs(a.lat) - half);
    }
  }
}
check('animals never enter the track', animalsOnRoad === 0, `${animalsOnRoad} violations`);
check('animal state finite', !animalNaN, `closest lateral margin ${minLat.toFixed(2)} m`);
check('animals flee from a riding player', everFled > 0, `${everFled} flee events`);

console.log('\n[ jump geometry ]');
let maxSlope = 0;
let maxSlopeS = 0;
let steepestDrop = 0;
let maxCurvature = 0;
for (let s = 4; s < track.length - 4; s += 2) {
  const slope = track.slopeAt(s, 3);
  if (slope > maxSlope) {
    maxSlope = slope;
    maxSlopeS = s;
  }
  maxCurvature = Math.max(maxCurvature, Math.abs(track.curvatureAt(s)));
  const ahead = track.slopeAt(s + 7, 3);
  steepestDrop = Math.max(steepestDrop, slope - ahead);
}
console.log(
  `  steepest climb ${(maxSlope * 100).toFixed(1)}% at s=${maxSlopeS.toFixed(0)}m · steepest crest delta ${(steepestDrop * 100).toFixed(1)}%`
);
console.log(
  `  peak curvature ${maxCurvature.toFixed(4)} rad/m (radius ${(1 / maxCurvature).toFixed(0)} m) · implied corner limit ${Math.sqrt(13.5 / maxCurvature).toFixed(1)} m/s`
);

console.log('\n[ ui: hud + touch controls ]');
const { HUD } = await import('../src/ui/HUD.js');
const { TouchControls } = await import('../src/ui/TouchControls.js');
const { Input } = await import('../src/core/Input.js');

const uiRoot = new FakeElement('div');
const hudCalls = [];
const hud = new HUD(uiRoot, {
  onPause: () => hudCalls.push('pause'),
  onTiltToggle: () => hudCalls.push('tilt'),
  onRestart: () => hudCalls.push('restart'),
  onResumeFreeRide: () => hudCalls.push('free'),
});
hud.setCheckpoints([0.25, 0.5, 0.75], ['SPLIT 1', 'SPLIT 2', 'SPLIT 3']);
hud.setRacers([
  { id: '0-r15', name: 'YAMAHA', color: '#0b3d91', isPlayer: false },
  { id: '1-ninja', name: 'KAWASAKI', color: '#6cbe2a', isPlayer: false },
  { id: '2-fireblade', name: 'YOU', color: '#d8202a', isPlayer: true },
  { id: '3-duke', name: 'KTM', color: '#ef6a00', isPlayer: false },
]);
hud.update({
  kmh: 87.4,
  time: 42.5,
  progress: 0.42,
  zoneName: 'Mud Flats',
  surfaceKey: 'mud',
  surfaceLabel: 'MUDDY',
  checkpointHits: [true, false, false],
  splitTimes: [12.1, 0, 0],
  playerPosition: 2,
  fieldSize: 4,
  playerGap: '+3 m',
  standings: [
    { id: '1-ninja', position: 1, gap: '—', isPlayer: false },
    { id: '2-fireblade', position: 2, gap: '+3m', isPlayer: true },
    { id: '0-r15', position: 3, gap: '+34m', isPlayer: false },
    { id: '3-duke', position: 4, gap: '+112m', isPlayer: false },
  ],
  debug: 'fps 58',
});
hud.popCountdown('3');
hud.toast('SPLIT 1');
hud.setTiltState(true, true);
hud.setMusicState(true);
hud.setPaused(true);
hud.showResults({
  title: 'P2 · SO CLOSE',
  time: 74.12,
  best: 74.12,
  isBest: true,
  standings: [
    { position: 1, name: 'KAWASAKI', color: '#6cbe2a', isPlayer: false, time: '01:13.90' },
    { position: 2, name: 'YOU', color: '#d8202a', isPlayer: true, time: '01:14.12' },
    { position: 3, name: 'YAMAHA', color: '#0b3d91', isPlayer: false, time: '01:14.80' },
    { position: 4, name: 'KTM', color: '#ef6a00', isPlayer: false, time: '01:15.55' },
  ],
  rows: [{ label: 'Finishing position', value: 'P2 of 4' }],
});

const speedText = uiRoot.find((n) => n.className === 'hud__value')[0];
const progressFill = uiRoot.find((n) => n.className === 'hud__track')[0];
const markers = uiRoot.find((n) => n.className.startsWith('hud__marker'));
const overlay = uiRoot.find((n) => n.className === 'results')[0];

check('hud renders speed', /87/.test(speedText?.textContent || ''), speedText?.textContent);
check('hud renders zone', uiRoot.find((n) => n.textContent === 'Mud Flats').length === 1);
check('hud applies surface badge class', uiRoot.find((n) => n.className === 'hud__badge hud__badge--mud').length === 1);
check('hud sets progress bar width', progressFill?.children[0]?.style?.width === '42.0%', progressFill?.children[0]?.style?.width);
check('hud marks the hit checkpoint', markers.filter((m) => m.className.includes('--hit')).length === 1, `${markers.length} markers`);
check('hud shows split times', uiRoot.find((n) => n.textContent === '00:12.10').length === 1);

const hasClass = (name) => (n) => n.className.split(' ').includes(name);
const positionNumber = uiRoot.find(hasClass('hud__posvalue'))[0];
check('hud shows the race position', positionNumber?.textContent?.startsWith('2/4'), positionNumber?.textContent);
check(
  'hud lists every racer in the standings',
  uiRoot.find(hasClass('hud__standing')).length === 4,
  `${uiRoot.find(hasClass('hud__standing')).length} rows`
);
check('hud highlights the player row', uiRoot.find(hasClass('hud__standing--player')).length === 1);
check('standings show gaps to the leader', uiRoot.find((n) => n.textContent === '+34m').length === 1);

check('results classification board', uiRoot.find(hasClass('results__boardrow')).length === 4);
check('results highlight the player', uiRoot.find(hasClass('results__boardrow--player')).length === 1);
check('results overlay shown', !!overlay);
check(
  'hud exposes a music toggle',
  uiRoot.find((n) => typeof n.textContent === 'string' && n.textContent.includes('MUSIC')).length >= 1
);
hud.hideResults();
check('results overlay dismissed', uiRoot.find((n) => n.className === 'results').length === 0);

const input = new Input({
  addEventListener() {},
  removeEventListener() {},
});
const controls = new TouchControls(input, uiRoot);
const stick = controls.stick;
const gas = controls.gas;

stick.getBoundingClientRect = () => ({ left: 0, top: 0, width: 138, height: 138 });
stick.dispatch('pointerdown', { pointerId: 1, clientX: 110, clientY: 69 });
check('joystick reports raw input immediately', input.touch.steer > 0.6, `raw=${input.touch.steer.toFixed(2)}`);
for (let i = 0; i < 24; i++) input.update(dt);
check('joystick steers right', input.steer > 0.65, `steer=${input.steer.toFixed(2)}`);
stick.dispatch('pointerup', { pointerId: 1 });
for (let i = 0; i < 45; i++) input.update(dt);
check('joystick self-centres', Math.abs(input.steer) < 0.05, `steer=${input.steer.toFixed(2)}`);

gas.dispatch('pointerdown', { pointerId: 2 });
input.update(dt);
check('gas pedal applies throttle', input.throttle === 1);
gas.dispatch('pointerup', { pointerId: 2 });
input.update(dt);
check('gas pedal releases', input.throttle === 0);

controls.brake.dispatch('pointerdown', { pointerId: 3 });
input.update(dt);
check('brake pedal applies brake', input.brake === 1);
controls.brake.dispatch('pointerup', { pointerId: 3 });
input.update(dt);
check('brake pedal releases', input.brake === 0);
check('touch controls expose all surfaces', !!stick && !!controls.brake && !!gas);

controls.setVisible(false);
check('controls can be hidden', controls.container.classList.contains('controls--hidden'));
controls.setVisible(true);

console.log('\n[ module graph ]');
const gameModule = await import('../src/core/Game.js');
check('Game module resolves (renderer not instantiated)', typeof gameModule.Game === 'function');

console.log('\n[ physics edge cases ]');
physics.reset();
check('reset restores the start', physics.s === 0 && physics.speed === 0 && !physics.airborne);
physics.update(dt, { throttle: 0, brake: 1, steer: 0 });
check('braking from standstill stays stable', physics.speed === 0 && Number.isFinite(physics.lateral));

for (let i = 0; i < 600; i++) physics.update(dt, { throttle: 1, brake: 0, steer: 1 });
const limit = track.halfWidthAt(physics.s) + BIKE.LATERAL_MARGIN;
check('full-lock steering stays bounded', Math.abs(physics.lateral) <= limit + 0.01, `lateral ${physics.lateral.toFixed(2)}`);

const drawCalls =
  scenery.group.children.length +
  terrain.group.children.length +
  road.children.length +
  river.group.children.length +
  animals.group.children.length;

console.log(`\nApproximate draw calls (culled chunks allow far fewer): ~${drawCalls}`);
console.log(`Build + simulation wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
