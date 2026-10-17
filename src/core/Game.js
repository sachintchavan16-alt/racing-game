import {
  ACESFilmicToneMapping,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { clamp, damp, formatTime } from './MathUtils.js';
import { Input } from './Input.js';
import { buildTextureLibrary } from '../assets/textures.js';
import { Track, createFrame } from '../world/Track.js';
import { Terrain } from '../world/Terrain.js';
import { River } from '../world/Water.js';
import { Scenery } from '../world/Scenery.js';
import { AnimalSystem } from '../world/Animals.js';
import { Obstacles } from '../world/Obstacles.js';
import { Sky } from '../world/Sky.js';
import { Environment } from '../render/Environment.js';
import { POST_QUALITY, PostFX } from '../render/PostFX.js';
import { Music } from '../audio/Music.js';
import { Bike, disposeBikeMaterials } from '../bike/Bike.js';
import { BikePhysics, BIKE } from '../bike/Physics.js';
import { AIDriver } from '../bike/AIDriver.js';
import { resolveContacts } from '../bike/Contacts.js';
import {
  PLAYER_STYLE_ID,
  disposeSportbikeGeometry,
  getStyle,
  styleColorCss,
} from '../bike/BikeStyles.js';
import { HUD } from '../ui/HUD.js';
import { TouchControls } from '../ui/TouchControls.js';

/**
 * Quality tiers. Everything expensive is scaled here: render resolution, shadow
 * map size and reach, the resolution of the generated surface textures, image-based
 * lighting, and the whole post-processing chain.
 */
const QUALITY_LEVELS = [
  {
    name: 'LOW',
    maxPixelRatio: 1.0,
    shadows: false,
    shadowMap: 512,
    shadowArea: 42,
    surfaceSize: 256,
    envMap: false,
    post: POST_QUALITY.off,
  },
  {
    name: 'MEDIUM',
    maxPixelRatio: 1.3,
    shadows: true,
    shadowMap: 1024,
    shadowArea: 55,
    surfaceSize: 512,
    envMap: true,
    post: POST_QUALITY.medium,
  },
  {
    name: 'HIGH',
    maxPixelRatio: 2.0,
    shadows: true,
    shadowMap: 2048,
    shadowArea: 66,
    surfaceSize: 512,
    envMap: true,
    post: POST_QUALITY.high,
  },
];

const CHECKPOINTS = [0.25, 0.5, 0.75];
const CHECKPOINT_LABELS = ['SPLIT 1', 'SPLIT 2', 'SPLIT 3'];
const BEST_KEY = 'jungle-rider:best';

/**
 * The starting grid, front row first. Exactly one entry is the player; the rest
 * become AI rivals. Add a fifth entry (style `phantom`) if you want four AI.
 * `skill` is overall pace commitment and `cornerCaution` only affects cornering,
 * both as fractions of what the bike can physically do.
 */
export const RACE_FIELD = [
  {
    s: 0,
    lateral: -3.4,
    ai: { name: 'YAMAHA', styleId: 'r15', skill: 0.95, lane: -0.35, cornerCaution: 1.05, avoidStrength: 0.9, rampBravery: 0.94 },
  },
  {
    s: 0,
    lateral: 3.4,
    ai: { name: 'KAWASAKI', styleId: 'ninja', skill: 0.965, lane: 0.3, cornerCaution: 1.0, avoidStrength: 1.0, rampBravery: 0.99 },
  },
  { s: -6, lateral: -3.4, player: true },
  {
    s: -6,
    lateral: 3.4,
    ai: { name: 'KTM', styleId: 'duke', skill: 0.94, lane: 0.15, cornerCaution: 1.12, avoidStrength: 1.1, rampBravery: 0.9 },
  },
];

const ZERO_INPUT = { throttle: 0, brake: 0, steer: 0 };

export class Game {
  constructor(canvas, report = () => {}) {
    this.canvas = canvas;
    this.report = report;
    this.isTouch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    this.maxQualityIndex = this.isTouch ? 1 : 2;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(64, 1, 0.35, 1400);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: !this.isTouch,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x0b1d10, 1);

    this.postFX = new PostFX(this.renderer);
    this.env = new Environment(this.renderer, { intensity: 0.5 });
    // Constructing the soundtrack is free; the AudioContext is only created from
    // the first user gesture inside start().
    this.music = new Music({ volume: 0.38 });
    this.usePost = false;
    // Scratch buffers must exist before applyQuality(): it calls resize(), which
    // reads the drawing-buffer size into _tmpSize.
    this._tmpSize = new Vector2();

    this.qualityIndex = this.maxQualityIndex;
    this.applyQuality(this.qualityIndex, true);

    this.clock = { last: 0, elapsed: 0 };
    this.state = 'idle';
    this.mode = 'race';
    this.paused = false;
    this.stateBeforePause = 'racing';
    this.raceTime = 0;
    this.countdownValue = 3;
    this.countdownTimer = 0;
    this.splits = new Array(CHECKPOINTS.length).fill(0);
    this.splitHits = new Array(CHECKPOINTS.length).fill(false);
    this.rampAnnounced = new Set();
    this.racers = [];
    this.standings = [];
    this.player = null;
    this.playerPosition = 1;
    this.playerGap = '';
    this.debugEnabled = /[?&]debug/.test(window.location.search);
    this.fpsSamples = 0;
    this.fpsTimer = 0;
    this.fps = 60;
    this.best = this.loadBest();
    this.qualityCooldown = 0;

    this._frame = createFrame();
    this._camFrame = createFrame();
    this._camDesired = new Vector3();
    this._camLook = new Vector3();
    this._camLookCurrent = new Vector3();
    this._orderScratch = [];
    this._lastZone = null;
    this.envMaterial = null;

    this._onResize = () => this.resize();
    this._onVisibility = () => {
      if (document.hidden && this.state === 'racing') this.setPaused(true);
    };
  }

  async init() {
    const { report } = this;

    report(0.06, 'Generating surface maps...');
    await frame();
    this.textures = buildTextureLibrary({
      surfaceSize: QUALITY_LEVELS[this.qualityIndex].surfaceSize,
    });

    report(0.26, 'Surveying the course...');
    await frame();
    this.track = new Track({ step: 1.5 });

    report(0.4, 'Carving terrain...');
    await frame();
    this.terrain = new Terrain(this.track);
    this.scene.add(this.terrain.build(this.textures));

    report(0.52, 'Paving the road...');
    await frame();
    this.scene.add(this.track.buildRoad(this.textures));

    report(0.6, 'Filling the river...');
    await frame();
    this.river = new River(this.track, this.terrain, this.textures);
    this.scene.add(this.river.build());

    report(0.7, 'Planting the jungle...');
    await frame();
    this.scenery = new Scenery(this.track, this.terrain, this.textures, 1337);
    this.scene.add(this.scenery.build());

    report(0.8, 'Dropping rocks on the trail...');
    await frame();
    this.obstacles = new Obstacles(this.track);
    this.scene.add(this.obstacles.build());

    report(0.88, 'Releasing the wildlife...');
    await frame();
    this.animals = new AnimalSystem(this.track, this.terrain, {
      textures: this.textures,
      seed: 90210,
    });
    this.scene.add(this.animals.build());

    report(0.94, 'Raising the sky...');
    await frame();
    this.sky = new Sky(this.scene, { shadowMapSize: QUALITY_LEVELS[this.qualityIndex].shadowMap });
    this.sky.setShadowArea(QUALITY_LEVELS[this.qualityIndex].shadowArea);
    this.sky.setShadowEnabled(QUALITY_LEVELS[this.qualityIndex].shadows);

    report(0.96, 'Capturing the environment...');
    await frame();
    this.envMaterial = this.sky.createEnvMaterial();
    this.env.refresh(this.envMaterial, this.track.zones[0]);
    this.env.applyTo(this.scene);

    this.input = new Input(window);
    this.bindGamepad();
    this.hud = new HUD(document.getElementById('ui-root'), {
      onPause: () => this.setPaused(!this.paused),
      onTiltToggle: () => this.toggleTilt(),
      onMusicToggle: () => this.toggleMusic(),
      onRestart: () => this.restart(),
      onResumeFreeRide: () => this.resumeFreeRide(),
    });
    this.hud.setCheckpoints(CHECKPOINTS, CHECKPOINT_LABELS);
    this.hud.setTiltState(false, this.input.tilt.supported);
    this.hud.setMusicState(!this.music.muted);

    this.controls = new TouchControls(this.input, document.getElementById('ui-root'));

    report(0.98, 'Gridding the field...');
    await frame();
    this.buildRacers();

    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);

    this.resize();
    this.applyQuality(this.qualityIndex, true);
    this.sky.applyZone(this.track.zones[0]);
    this.river.applyZone(this.track.zones[0]);
    this.sky.fog.color.set(this.track.zones[0].fog);
    this.sky.fog.density = this.track.zones[0].fogDensity;

    this.resetRace();

    report(1, 'Ready.');
    return this;
  }

  buildRacers() {
    this.racers = [];
    this.player = null;
    this._physicsList = [];

    RACE_FIELD.forEach((entry, index) => {
      const style = getStyle(entry.player ? PLAYER_STYLE_ID : entry.ai.styleId);
      const bike = new Bike(style);
      this.scene.add(bike.object3D);

      const physics = new BikePhysics(this.track);
      const racer = {
        id: `${index}-${style.id}`,
        name: entry.player ? 'YOU' : entry.ai.name,
        model: style.model,
        color: styleColorCss(style),
        isPlayer: Boolean(entry.player),
        style,
        bike,
        physics,
        driver: null,
        slot: { s: entry.s, lateral: entry.lateral },
        position: index + 1,
        finalPosition: index + 1,
        finished: false,
        finishTime: 0,
        projectedTime: 0,
        hitFlash: 0,
      };

      if (entry.player) {
        this.player = racer;
      } else {
        racer.driver = new AIDriver(this.track, physics, { ...entry.ai });
      }

      this.racers.push(racer);
      this._physicsList.push(physics);
    });

    // Convenience aliases: the camera, HUD and wildlife all key off the player.
    this.physics = this.player.physics;
    this.bike = this.player.bike;

    this.hud.setRacers(
      this.racers.map((racer) => ({
        id: racer.id,
        name: racer.name,
        color: racer.color,
        isPlayer: racer.isPlayer,
      }))
    );

    this.updateStandings();
  }

  bindGamepad() {
    this.input.registerGamepad((pad) => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && pads[0];
      if (!gp) {
        pad.steer = 0;
        pad.throttle = 0;
        pad.brake = 0;
        return;
      }
      const axis = gp.axes[0] || 0;
      pad.steer = Math.abs(axis) > 0.16 ? clamp(axis, -1, 1) : 0;
      pad.throttle = gp.buttons[7] && gp.buttons[7].pressed ? 1 : 0;
      pad.brake = gp.buttons[6] && gp.buttons[6].pressed ? 1 : 0;
    });
  }

  applyQuality(index, force = false) {
    const level = QUALITY_LEVELS[index];
    if (!level) return;
    if (!force && this.qualityIndex === index) return;
    this.qualityIndex = index;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level.maxPixelRatio));
    this.renderer.shadowMap.enabled = level.shadows;

    if (this.sky) {
      this.sky.setShadowEnabled(level.shadows);
      this.sky.setShadowMapSize(level.shadowMap);
      this.sky.setShadowArea(level.shadowArea);
      this.sky.setEnvLighting(Boolean(this.env?.texture) && level.envMap);
    }

    if (this.postFX) this.postFX.setQuality(level.post);
    this.usePost = Boolean(this.postFX?.enabled);
    this.postFX?.setExposure(this.renderer.toneMappingExposure);

    // Size first: creating the render targets is what decides whether the scene
    // pass can stay in HDR. Tone mapping only belongs in the composite when it
    // does; on an LDR fallback target the scene pass has to tone map itself.
    this.resize();

    const sceneToneMapped = this.usePost ? !this.postFX.hdr : true;
    const desiredToneMapping = sceneToneMapped ? ACESFilmicToneMapping : NoToneMapping;
    if (this.renderer.toneMapping !== desiredToneMapping) {
      this.renderer.toneMapping = desiredToneMapping;
    }
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);

    if (this.postFX?.enabled) {
      if (!this._tmpSize) this._tmpSize = new Vector2();
      this.renderer.getDrawingBufferSize(this._tmpSize);
      this.postFX.setSize(this._tmpSize.x, this._tmpSize.y);
    }
  }

  loadBest() {
    try {
      const raw = window.localStorage.getItem(BEST_KEY);
      const value = raw === null ? NaN : Number(raw);
      return Number.isFinite(value) && value > 0 ? value : Infinity;
    } catch {
      return Infinity;
    }
  }

  saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch {
      /* storage unavailable */
    }
  }

  resetRace() {
    for (const racer of this.racers) {
      racer.physics.reset();
      racer.physics.s = racer.slot.s;
      racer.physics.lateral = racer.slot.lateral;
      racer.physics.surface = this.track.surfaceAt(racer.physics.s, racer.physics.lateral);
      racer.physics.syncTransform();
      racer.finished = false;
      racer.finishTime = 0;
      racer.projectedTime = 0;
      racer.finalPosition = racer.position;
      racer.hitFlash = 0;
      if (racer.driver) racer.driver.reset();
      racer.bike.place(
        racer.physics.position,
        racer.physics.yaw,
        racer.physics.bank,
        racer.physics.lean,
        racer.physics.pitch
      );
    }

    this.raceTime = 0;
    this.splits.fill(0);
    this.splitHits.fill(false);
    this.rampAnnounced = new Set();
    this._lastZone = null;
    this.hud.hideResults();
    this.updateStandings();
    this.updateCamera(1, true);
    this.hud.update(this.buildHudState());
  }

  async start() {
    // Autoplay policy: the AudioContext has to be created/resumed inside the
    // click gesture, so this runs before the first await.
    this.music.start();
    await this.requestImmersive();
    this.state = 'countdown';
    this.countdownValue = 3;
    this.countdownTimer = 0;
    this.hud.popCountdown('3');
    this.hud.toast(`${this.racers.length} riders on the grid — GO on zero`);
    this.clock.last = performance.now();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  async requestImmersive() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      /* fullscreen declined */
    }
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch {
      /* orientation lock unsupported */
    }
  }

  toggleMusic() {
    const muted = !this.music.muted;
    this.music.setMuted(muted);
    this.hud.setMusicState(!muted);
    this.hud.toast(muted ? 'Music muted' : 'Music on');
  }

  async toggleTilt() {
    if (!this.input.tilt.supported) {
      this.hud.toast('Tilt steering unavailable on this device');
      return;
    }
    if (this.input.tilt.enabled) {
      this.input.disableTilt();
      this.hud.setTiltState(false, true);
      return;
    }
    const ok = await this.input.enableTilt();
    this.hud.setTiltState(ok, true);
    this.hud.toast(ok ? 'Tilt steering on — hold the phone flat' : 'Tilt permission denied');
  }

  setPaused(paused) {
    if (this.state === 'finished' || this.state === 'idle' || this.state === 'countdown') return;
    if (paused) {
      this.stateBeforePause = this.state === 'paused' ? this.stateBeforePause : this.state;
    }
    this.paused = paused;
    this.state = paused ? 'paused' : this.stateBeforePause;
    this.hud.setPaused(paused);
    this.music.setPaused(paused);
    if (!paused) this.clock.last = performance.now();
  }

  restart() {
    this.mode = 'race';
    this.resetRace();
    this.state = 'countdown';
    this.countdownValue = 3;
    this.countdownTimer = 0;
    this.hud.popCountdown('3');
  }

  resumeFreeRide() {
    this.mode = 'freeride';
    this.hud.hideResults();
    this.state = 'racing';
    this.paused = false;
    this.hud.setPaused(false);
    this.clock.last = performance.now();
  }

  tick() {
    const now = performance.now();
    const dt = clamp((now - this.clock.last) / 1000, 0, 0.05);
    this.clock.last = now;

    this.trackFps(dt);

    if (this.state === 'paused') {
      this.renderFrame();
      return;
    }

    this.input.update(dt);
    const playerLocked = this.state === 'countdown' || this.state === 'finished';

    this.updateRacers(dt, playerLocked);
    this.resolveAllContacts(dt);

    if (this.state === 'countdown') {
      this.countdownTimer += dt;
      const remaining = 3 - Math.floor(this.countdownTimer);
      if (remaining !== this.countdownValue && remaining > 0) {
        this.countdownValue = remaining;
        this.hud.popCountdown(String(remaining));
      }
      if (this.countdownTimer >= 3) {
        this.state = 'racing';
        this.hud.popCountdown('GO');
        this.hud.toast('Go! Hold the inside line');
      }
    }

    if (this.state === 'racing' && this.mode === 'race') {
      this.raceTime += dt;
      this.checkCheckpoints();
      this.announceRamps();
      this.recordFinishers();
      if (this.player.finished && this.state !== 'finished') this.finishRace();
    }

    this.updateStandings();

    for (const racer of this.racers) {
      const body = racer.physics;
      racer.bike.place(body.position, body.yaw, body.bank, body.lean, body.pitch);
      racer.bike.update(dt, body);
    }

    this.updateCamera(dt, false);

    // Biome change: re-tint the sky, the water reflection colours and — because
    // reflections come from the sky — the image-based lighting too.
    const zone = this.player.physics.surface.zone;
    if (zone !== this._lastZone) {
      this._lastZone = zone;
      this.sky.applyZone(zone);
      this.river.applyZone(zone);
      if (this.env.refresh(this.envMaterial, zone)) {
        this.env.applyTo(this.scene);
        this.sky.setEnvLighting(QUALITY_LEVELS[this.qualityIndex].envMap);
      }
    }

    this.sky.update(dt, this.camera.position, this.player.physics.position);
    this.river.update(dt, this.sky.sunDir);
    this.animals.update(dt, this._physicsList);
    this.maybeReactToWildlife();

    this.hud.update(this.buildHudState());
    this.adaptQuality(dt);

    // The soundtrack opens up as the rider gets on the gas.
    this.music.setIntensity(clamp(this.player.physics.speed / BIKE.MAX_SPEED, 0, 1));

    this.renderFrame();
  }

  /** Post-processed when the tier allows and the device can supply the targets. */
  renderFrame() {
    const speed01 = clamp(this.player.physics.speed / BIKE.MAX_SPEED, 0, 1);
    if (this.usePost && this.postFX.render(this.scene, this.camera, { speed01 })) return;
    this.renderer.render(this.scene, this.camera);
  }

  updateRacers(dt, playerLocked) {
    const rivals = this._physicsList;
    const playerS = this.player.physics.s;
    const holding = this.state === 'countdown';

    for (const racer of this.racers) {
      let input;
      if (racer.isPlayer) {
        input = playerLocked
          ? ZERO_INPUT
          : { throttle: this.input.throttle, brake: this.input.brake, steer: this.input.steer };
      } else {
        const commanded = racer.driver.update(dt, rivals, this.obstacles.list, playerS);
        input = holding ? ZERO_INPUT : commanded;
      }
      racer.physics.update(dt, input);
    }
  }

  /** Body-to-body contact plus hazards on the racing surface. */
  resolveAllContacts(dt) {
    resolveContacts(this.racers, this.obstacles, dt, (racer, hazard) => {
      if (racer.isPlayer) {
        this.hud.toast(`${hazard.type === 'log' ? 'Log' : 'Rock'} — watch the line!`);
      }
    });
  }

  updateStandings() {
    const order = this._orderScratch;
    order.length = 0;
    for (const racer of this.racers) order.push(racer);

    order.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return b.physics.s - a.physics.s;
    });

    for (let i = 0; i < order.length; i++) order[i].position = i + 1;
    this.standings = order.slice();
    this.playerPosition = this.player ? this.player.position : 1;
  }

  trackFps(dt) {
    if (dt <= 0) return;
    this.fpsTimer += dt;
    this.fpsSamples++;
    if (this.fpsTimer >= 0.5) {
      this.fps = this.fpsSamples / this.fpsTimer;
      this.fpsTimer = 0;
      this.fpsSamples = 0;
    }
  }

  adaptQuality(dt) {
    this.qualityCooldown -= dt;
    if (this.qualityCooldown > 0 || this.state === 'countdown') return;

    if (this.fps < 38 && this.qualityIndex > 0) {
      this.applyQuality(this.qualityIndex - 1);
      this.qualityCooldown = 3;
      this.hud.toast(`Graphics lowered to ${QUALITY_LEVELS[this.qualityIndex].name} for smooth play`);
    } else if (this.fps > 57 && this.qualityIndex < this.maxQualityIndex) {
      this.applyQuality(this.qualityIndex + 1);
      this.qualityCooldown = 8;
    }
  }

  checkCheckpoints() {
    const progress = this.player.physics.progress;
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (!this.splitHits[i] && progress >= CHECKPOINTS[i]) {
        this.splitHits[i] = true;
        this.splits[i] = this.raceTime;
        this.hud.toast(`${CHECKPOINT_LABELS[i]} · ${formatTime(this.raceTime)} · P${this.player.position}`);
      }
    }
  }

  announceRamps() {
    const s = this.player.physics.s;
    for (const rampS of this.track.rampPositions()) {
      const gap = rampS - s;
      if (gap > 22 && gap < 62 && !this.rampAnnounced.has(rampS)) {
        this.rampAnnounced.add(rampS);
        this.hud.toast('JUMP AHEAD — hold GAS');
      }
    }
  }

  recordFinishers() {
    for (const racer of this.racers) {
      if (racer.finished || !racer.physics.finished) continue;
      racer.finished = true;
      racer.finishTime = this.raceTime;
    }
  }

  finishRace() {
    const time = this.player.finishTime || this.raceTime;
    this.state = 'finished';

    const isBest = time < this.best;
    if (isBest) {
      this.best = time;
      this.saveBest(time);
    }

    // Anyone still out on course gets a projected time, so the classification is
    // complete the instant the player crosses the line.
    for (const racer of this.racers) {
      if (racer.finished) continue;
      const travelled = Math.max(1, racer.physics.s - racer.slot.s);
      const average = travelled / Math.max(0.001, time);
      const remaining = Math.max(0, this.track.length - racer.physics.s);
      racer.projectedTime = time + remaining / Math.max(average, 8);
    }

    const classification = this.racers.slice().sort((a, b) => {
      const at = a.finished ? a.finishTime : a.projectedTime;
      const bt = b.finished ? b.finishTime : b.projectedTime;
      return at - bt;
    });
    classification.forEach((racer, i) => {
      racer.finalPosition = i + 1;
    });

    const rank = this.player.finalPosition;
    const field = this.racers.length;
    const title = rank === 1 ? 'VICTORY' : rank === 2 ? 'P2 · SO CLOSE' : rank === 3 ? 'P3 · PODIUM' : `P${rank} · ${field}TH`;

    this.hud.showResults({
      title,
      time,
      best: isBest ? time : this.best,
      isBest,
      standings: classification.map((racer) => ({
        position: racer.finalPosition,
        name: racer.isPlayer ? 'YOU' : racer.name,
        color: racer.color,
        isPlayer: racer.isPlayer,
        time: formatTime(racer.finished ? racer.finishTime : racer.projectedTime),
      })),
      rows: [
        { label: 'Finishing position', value: `P${rank} of ${field}` },
        { label: 'Average speed', value: `${((this.track.length / time) * 3.6).toFixed(1)} km/h` },
        { label: 'Top speed', value: `${(this.player.physics.topSpeed * 3.6).toFixed(1)} km/h` },
        ...this.splits.map((split, i) => ({ label: CHECKPOINT_LABELS[i], value: formatTime(split) })),
        { label: 'Air time', value: `${this.player.physics.totalAirTime.toFixed(2)}s` },
      ],
    });

    this.hud.toast(rank === 1 ? `You beat all ${field - 1} rivals` : `Finished P${rank} of ${field}`);
  }

  updateCamera(dt, snap) {
    const phys = this.player.physics;
    const speedNorm = clamp(phys.speed / BIKE.MAX_SPEED, 0, 1);
    const back = 6.4 + speedNorm * 2.6;
    const height = 2.55 + speedNorm * 0.45;

    const camFrame = this.track.frameAt(phys.s - back, this._camFrame);
    this._camDesired
      .copy(camFrame.position)
      .addScaledVector(camFrame.up, height)
      .addScaledVector(camFrame.right, phys.lateral * 0.34);

    if (!snap) {
      const jumpShake = phys.landedTimer > 0 ? phys.landedTimer * 0.22 : 0;
      const rough = phys.offRoad * speedNorm * 0.05 + jumpShake * 0.12;
      if (rough > 0.001) {
        this._camDesired.x += (Math.random() - 0.5) * rough * 2;
        this._camDesired.y += (Math.random() - 0.5) * rough * 2;
        this._camDesired.z += (Math.random() - 0.5) * rough * 2;
      }
    }

    const smooth = snap ? 1 : 1 - Math.exp(-9.5 * dt);
    this.camera.position.lerp(this._camDesired, smooth);

    const ahead = this.track.frameAt(phys.s + 9, this._frame);
    this._camLook
      .copy(phys.position)
      .addScaledVector(ahead.tangent, 7.5)
      .addScaledVector(ahead.up, 1.15);

    const lookSmooth = snap ? 1 : 1 - Math.exp(-11 * dt);
    this._camLookCurrent.lerp(this._camLook, lookSmooth);
    this.camera.lookAt(this._camLookCurrent);

    const targetFov = 64 + speedNorm * 14 + (phys.airborne ? 3 : 0);
    const nextFov = snap ? targetFov : damp(this.camera.fov, targetFov, 4, dt);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }

  maybeReactToWildlife() {
    const nearest = this.animals.nearest;
    if (!nearest || !nearest.label) return;
    if (nearest.distance < 22 && this._lastAnimalToast !== nearest.label) {
      this._lastAnimalToast = nearest.label;
      this.hud.toast(`${nearest.label} nearby — it's spooked!`);
      window.setTimeout(() => {
        if (this._lastAnimalToast === nearest.label) this._lastAnimalToast = null;
      }, 4500);
    }
  }

  buildStandingRows() {
    const leader = this.standings[0];
    return this.standings.map((racer) => {
      let gap = '—';
      if (racer !== leader && leader) {
        if (racer.finished && leader.finished) {
          gap = `+${(racer.finishTime - leader.finishTime).toFixed(2)}s`;
        } else {
          const metres = Math.max(0, leader.physics.s - racer.physics.s);
          gap = metres < 950 ? `+${Math.round(metres)}m` : `+${(metres / 1000).toFixed(2)}km`;
        }
      }
      return { id: racer.id, position: racer.position, gap, isPlayer: racer.isPlayer };
    });
  }

  playerGapLabel() {
    const leader = this.standings[0];
    if (!this.player || !leader) return '';
    if (this.player === leader) return this.player.finished ? 'WINNER' : 'LEADER';
    const metres = Math.max(0, leader.physics.s - this.player.physics.s);
    return metres < 950 ? `+${Math.round(metres)} m` : `+${(metres / 1000).toFixed(2)} km`;
  }

  buildHudState() {
    const surf = this.player.physics.surface;
    let surfaceKey = 'clean';
    let surfaceLabel = 'CLEAN';
    if (surf.offroad > 0.35) {
      surfaceKey = 'offroad';
      surfaceLabel = 'OFF-ROAD';
    } else if (surf.water > 0.5) {
      surfaceKey = 'water';
      surfaceLabel = 'SHALLOW WATER';
    } else if (surf.mud > 0.45) {
      surfaceKey = 'mud';
      surfaceLabel = 'MUDDY';
    } else if (surf.mud > 0.2) {
      surfaceKey = 'mud';
      surfaceLabel = 'SLIPPERY';
    }

    return {
      kmh: this.player.physics.kmh,
      time: this.raceTime,
      progress: this.player.physics.progress,
      zoneName: surf.zone.name,
      surfaceKey,
      surfaceLabel,
      checkpointHits: this.splitHits,
      splitTimes: this.splits,
      playerPosition: this.playerPosition,
      fieldSize: this.racers.length,
      playerGap: this.playerGapLabel(),
      standings: this.buildStandingRows(),
      debug: this.debugEnabled
        ? [
            `fps      ${this.fps.toFixed(0)}`,
            `quality  ${QUALITY_LEVELS[this.qualityIndex].name}`,
            `post     ${this.usePost ? 'on' : 'off'}${this.postFX?.available ? '' : ' (unsupported)'}`,
            `env IBL  ${this.env?.texture ? 'on' : 'off'}`,
            `surfaces ${QUALITY_LEVELS[this.qualityIndex].surfaceSize}px`,
            `calls    ${this.renderer.info.render.calls}`,
            `tris     ${(this.renderer.info.render.triangles / 1000).toFixed(1)}k`,
            `speed    ${this.player.physics.kmh.toFixed(0)} km/h`,
            `position P${this.playerPosition} of ${this.racers.length}`,
            ...this.racers.map(
              (r) =>
                `${r.isPlayer ? '*' : ' '}${r.name.padEnd(9)} P${r.position} s=${r.physics.s.toFixed(0).padStart(4)}`
            ),
            `hazards  ${this.obstacles.list.length}`,
            `air      ${this.player.physics.airborne ? 'yes' : 'no'}`,
          ].join('\n')
        : null,
    };
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.input.dispose();
    this.controls.dispose();
    this.hud.dispose();
    this.animals.dispose();
    this.obstacles.dispose();
    this.scenery.dispose();
    this.river.dispose();
    this.terrain.dispose();
    this.track.dispose();
    this.sky.dispose();
    this.postFX.dispose();
    this.env.dispose();
    this.envMaterial?.dispose();
    disposeSportbikeGeometry();
    disposeBikeMaterials();
    this.music.dispose();
    this.renderer.dispose();
  }
}

function frame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
