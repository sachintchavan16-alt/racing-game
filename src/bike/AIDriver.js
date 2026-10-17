import { clamp, damp } from '../core/MathUtils.js';
import { BIKE, centrifugalDrift, steeringAuthority } from './Physics.js';

const HORIZON_BASE = 13;
const HORIZON_PER_SPEED = 1.0;
const LATERAL_STIFFNESS = 1.35;
const MAX_LAT_COMMAND = 9;
const RIVAL_LOOKAHEAD = 16;
const OBSTACLE_LOOKAHEAD = 38;
const RAMP_LOOKAHEAD = 34;
/** Fraction of the available lateral grip the AI is willing to commit mid-corner. */
const GRIP_MARGIN = 0.88;

/**
 * Autonomous rider.
 *
 * The driver, like the handling model, works in track space (distance along the
 * spline + lateral offset). It picks a racing line, feeds forward the centrifugal
 * drift the tyres must cancel, brakes for corner speed limits derived from the
 * available steering authority, keeps momentum on climbs and commits to jumps.
 */
export class AIDriver {
  constructor(track, physics, config = {}) {
    this.track = track;
    this.physics = physics;
    this.name = config.name || 'RIVAL';
    this.skill = clamp(config.skill ?? 0.94, 0.55, 1.05);
    this.lane = clamp(config.lane ?? 0, -1, 1);
    this.cornerCaution = clamp(config.cornerCaution ?? 1, 0.7, 1.5);
    this.avoidStrength = clamp(config.avoidStrength ?? 1, 0, 2);
    this.rampBravery = clamp(config.rampBravery ?? 0.95, 0.6, 1.05);
    this.rubberBand = config.rubberBand !== false;

    this.ramps = track.rampPositions();
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.targetSpeed = 0;
    this.stuckTimer = 0;
    this.blockTimer = 0;
    this.wanderPhase = (config.lane ?? 0) * 3.1 + 0.7;
    this.time = 0;
    this.input = { throttle: 0, brake: 0, steer: 0 };
  }

  reset() {
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.targetSpeed = 0;
    this.stuckTimer = 0;
    this.blockTimer = 0;
    this.time = 0;
  }

  /**
   * @param {number} dt seconds
   * @param {Array} rivals every physics body on track, including this one
   * @param {Array} obstacles on-track hazards ({ s, lateral, radius })
   * @param {number} playerS the player's distance, for the pack-keeping band
   * @returns {{throttle:number, brake:number, steer:number}}
   */
  update(dt, rivals, obstacles, playerS) {
    const track = this.track;
    const p = this.physics;
    const surf = p.surface;
    const half = surf.zone.halfWidth;
    const grip = surf.grip;

    this.time += dt;

    // ---- look ahead for the sharpest thing coming up ---------------------
    const horizon = clamp(HORIZON_BASE + p.speed * HORIZON_PER_SPEED, 16, 62);
    let peakK = 0;
    for (let i = 1; i <= 5; i++) {
      const k = track.curvatureAt(p.s + (horizon * i) / 5);
      if (Math.abs(k) > Math.abs(peakK)) peakK = k;
    }
    const nearK = track.curvatureAt(p.s + clamp(p.speed * 0.35, 4, 16));

    // ---- racing line: cut the inside of the corner, hold a preferred lane --
    const insidePull = clamp(Math.abs(peakK) / 0.018, 0, 1);
    let target = Math.sign(peakK) * half * 0.55 * insidePull + this.lane * half * 0.28;
    target += Math.sin(this.time * 0.42 + this.wanderPhase) * half * 0.07;

    // square up for a jump ramp
    const rampGap = this._rampGap(p.s);
    if (Number.isFinite(rampGap) && rampGap < RAMP_LOOKAHEAD && p.speed > 12) {
      target *= 1 - 0.55 * (1 - rampGap / RAMP_LOOKAHEAD);
    }

    // ---- avoid the other riders -----------------------------------------
    let avoid = 0;
    let blocked = 0;
    for (const r of rivals) {
      if (r === p) continue;
      const ds = r.s - p.s;
      if (ds < -4 || ds > RIVAL_LOOKAHEAD) continue;
      const dl = r.lateral - p.lateral;
      if (Math.abs(dl) > 2.6) continue;
      const closeness = 1 - clamp(ds / RIVAL_LOOKAHEAD, 0, 1);
      avoid += (dl >= 0 ? -1 : 1) * closeness * 2.4 * this.avoidStrength;
      if (ds > -4 && ds < 6 && Math.abs(dl) < 1.5) {
        blocked = Math.max(blocked, 1 - clamp(ds / 6, 0, 1));
      }
    }
    this.blockTimer = Math.max(0, this.blockTimer - dt);
    if (blocked > 0) this.blockTimer = 0.35;

    // ---- avoid hazards on the road --------------------------------------
    for (const obstacle of obstacles) {
      const ds = obstacle.s - p.s;
      if (ds < -3 || ds > OBSTACLE_LOOKAHEAD) continue;
      const dl = obstacle.lateral - p.lateral;
      if (Math.abs(dl) > obstacle.radius + 1.6) continue;
      const closeness = 1 - clamp(ds / OBSTACLE_LOOKAHEAD, 0, 1);
      avoid += (dl >= 0 ? -1 : 1) * closeness * 3.4 * this.avoidStrength;
    }

    target = clamp(target + avoid, -half + 0.95, half - 0.95);

    // ---- steering: track the line and cancel centrifugal drift ----------
    const gain = steeringAuthority(grip, p.speed);
    const want =
      clamp((target - p.lateral) * LATERAL_STIFFNESS, -MAX_LAT_COMMAND, MAX_LAT_COMMAND) +
      centrifugalDrift(nearK, p.speed);
    const steerCmd = gain > 0.15 ? want / gain : 0;
    this.steer = damp(this.steer, clamp(steerCmd, -1, 1), 13, dt);

    // ---- speed target ---------------------------------------------------
    const kAbs = Math.max(Math.abs(peakK), 1e-4);

    // Physical limits, derived from the handling model and identical for every
    // rider, so the field behaves like a spec class. Drag — not MAX_SPEED — is
    // what actually caps straight-line speed, so the corner limit is the one
    // that bites: the fastest the tyres can go while still cancelling the
    // centrifugal drift of the tightest corner ahead.
    const gripRef = steeringAuthority(grip, BIKE.MAX_SPEED);
    const physicalCorner = Math.sqrt((gripRef * GRIP_MARGIN) / Math.max(kAbs * BIKE.CENTRIFUGAL, 1e-5));
    const physicalSurface = BIKE.MAX_SPEED * (0.6 + 0.4 * grip) * (surf.offroad > 0.25 ? 0.55 : 1);

    // How much of that this rider is prepared to use. `skill` is overall
    // commitment; `cornerCaution` only bites in the twisty bits.
    const pace = physicalSurface * this.skill;
    let targetSpeed = Math.min(physicalCorner / this.cornerCaution, physicalSurface) * this.skill;

    // A climb costs speed later, so hold momentum — but only when the corner
    // ahead is gentle, otherwise the limit above would never bite uphill.
    const slope = track.slopeAt(p.s + 9, 3);
    if (slope > 0.05 && kAbs < 0.02) {
      targetSpeed = Math.max(targetSpeed, pace * (0.6 + 0.4 * clamp(slope / 0.2, 0, 1)));
    }
    // commit to a jump rather than arriving short
    if (Number.isFinite(rampGap) && rampGap < RAMP_LOOKAHEAD) {
      targetSpeed = Math.max(targetSpeed, pace * this.rampBravery);
    }
    // keep the field together over a 2.1 km stage
    if (this.rubberBand && Number.isFinite(playerS)) {
      const lead = p.s - playerS;
      if (lead < -90) targetSpeed *= 1 + Math.min(0.06, (-lead - 90) / 1300);
      else if (lead > 100) targetSpeed *= 1 - Math.min(0.05, (lead - 100) / 1600);
    }
    if (this.blockTimer > 0) targetSpeed *= 0.88;
    this.targetSpeed = targetSpeed;

    // ---- pedals ---------------------------------------------------------
    if (p.airborne) {
      this.throttle = 0;
      this.brake = 0;
    } else if (p.speed < targetSpeed - 1.5) {
      this.throttle = 1;
      this.brake = 0;
    } else if (p.speed > targetSpeed + 2) {
      this.throttle = 0;
      this.brake = clamp((p.speed - targetSpeed) / 6, 0, 1);
    } else {
      this.throttle = 0.45;
      this.brake = 0;
    }

    // ---- wedge recovery -------------------------------------------------
    if (!p.airborne && p.speed < 2.5) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }
    if (this.stuckTimer > 1.2) {
      this.throttle = 1;
      this.brake = 0;
      this.steer *= 0.3;
    }

    this.input.throttle = this.throttle;
    this.input.brake = this.brake;
    this.input.steer = this.steer;
    return this.input;
  }

  _rampGap(s, max = 140) {
    let best = Infinity;
    for (const rampS of this.ramps) {
      const d = rampS - s;
      if (d > 0 && d < best) best = d;
    }
    return best > max ? Infinity : best;
  }
}
