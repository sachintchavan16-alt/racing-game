import { Vector3 } from 'three';
import { clamp, damp } from '../core/MathUtils.js';
import { createFrame } from '../world/Track.js';
import { WHEEL_RADIUS } from './BikeStyles.js';

export const BIKE = {
  MAX_SPEED: 43,
  ENGINE: 14.5,
  BRAKE: 26,
  DRAG_K: 0.0058,
  ROLLING: 0.75,
  STEER_AUTHORITY: 8.5,
  /**
   * How hard a corner pushes a rider wide. Tuned so the tightest corners on the
   * course (~86 m radius) cannot be taken flat out: the drift exceeds the lateral
   * grip long before top speed, so both the player and the AI have to brake and
   * steer into the turn.
   */
  CENTRIFUGAL: 0.7,
  GRAVITY: 9.81,
  AIR_GRAVITY: 21,
  LATERAL_MARGIN: 5.0,
};

/**
 * Steady-state lateral velocity produced by full steering lock.
 * Shared by the handling model and the AI so both reason about identical numbers.
 */
export function steeringAuthority(grip, speed) {
  const speedFactor = clamp(speed / 9, 0, 1);
  const authority = BIKE.STEER_AUTHORITY * grip * (0.55 + 0.45 * clamp(speed / BIKE.MAX_SPEED, 0, 1));
  return authority * speedFactor;
}

/** Lateral drift acceleration a rider must counter to hold a line through a corner. */
export function centrifugalDrift(curvature, speed) {
  return curvature * speed * speed * BIKE.CENTRIFUGAL;
}

export class BikePhysics {
  constructor(track) {
    this.track = track;
    this.frame = createFrame();
    this.position = new Vector3();
    this.lookAhead = new Vector3();
    this.reset();
  }

  reset() {
    this.s = 0;
    this.lateral = 0;
    this.speed = 0;
    this.height = 0;
    this.vy = 0;
    this.airborne = false;
    this.airTime = 0;
    this.totalAirTime = 0;
    this.landedTimer = 0;
    this.lean = 0;
    this.latVelocity = 0;
    this.steerVisual = 0;
    this.wheelSpin = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.slope = 0;
    this.slip = 0;
    this.offRoad = 0;
    this.surface = this.track.surfaceAt(0, 0);
    this.topSpeed = 0;
    this.syncTransform();
  }

  get progress() {
    return clamp(this.s / this.track.length, 0, 1);
  }

  get kmh() {
    return this.speed * 3.6;
  }

  get finished() {
    return this.s >= this.track.length - 0.6;
  }

  update(dt, input) {
    const track = this.track;
    const throttle = input.throttle;
    const brake = input.brake;
    const steer = input.steer;

    const surf = track.surfaceAt(this.s, this.lateral);
    this.surface = surf;
    const grip = surf.grip;

    const slope = track.slopeAt(this.s, 3);
    this.slope = slope;

    if (!this.airborne) {
      const speedRatio = clamp(this.speed / BIKE.MAX_SPEED, 0, 1);
      const engineFalloff = 1 - Math.pow(speedRatio, 2.4) * 0.78;
      this.speed += BIKE.ENGINE * throttle * grip * engineFalloff * dt;
      this.speed -= BIKE.BRAKE * brake * grip * dt;
      this.speed -= slope * BIKE.GRAVITY * 0.95 * dt;

      const drag = BIKE.DRAG_K * this.speed * this.speed + BIKE.ROLLING;
      this.speed -= drag * surf.drag * dt;

      if (this.landedTimer > 0) this.speed *= 0.995;
    } else {
      this.speed -= BIKE.DRAG_K * this.speed * this.speed * 0.4 * dt;
      this.speed *= 1 - 0.06 * dt;
    }

    this.speed = clamp(this.speed, 0, BIKE.MAX_SPEED);
    if (this.speed > this.topSpeed) this.topSpeed = this.speed;

    const gain = steeringAuthority(grip, this.speed);
    this.latVelocity = damp(this.latVelocity, steer * gain, 9, dt);
    this.lateral += this.latVelocity * dt;

    const curvature = track.curvatureAt(this.s);
    this.lateral -= centrifugalDrift(curvature, this.speed) * dt;

    const limit = surf.zone.halfWidth + BIKE.LATERAL_MARGIN;
    if (Math.abs(this.lateral) > limit) {
      this.lateral = Math.sign(this.lateral) * limit;
      this.latVelocity *= -0.2;
      this.speed *= 1 - 2.2 * dt;
    }

    this.s += this.speed * dt;
    if (this.s > track.length) this.s = track.length;

    const aheadSlope = track.slopeAt(this.s + 7, 3);
    if (!this.airborne && slope > 0.13 && aheadSlope < slope * 0.4 && this.speed > 13) {
      this.airborne = true;
      this.vy = clamp(this.speed * slope * 0.6, 1.4, 9);
    }

    if (this.airborne) {
      this.vy -= BIKE.AIR_GRAVITY * dt;
      this.height += this.vy * dt;
      this.airTime += dt;
      this.totalAirTime += dt;
      if (this.height <= 0) {
        this.height = 0;
        this.airborne = false;
        const impact = Math.min(1, Math.abs(this.vy) / 9);
        this.speed *= 1 - impact * 0.08;
        this.vy = 0;
        this.airTime = 0;
        this.landedTimer = 0.5;
      }
    } else {
      this.height = 0;
      this.vy = 0;
    }
    if (this.landedTimer > 0) this.landedTimer -= dt;

    const leanTarget = clamp(steer * 0.5 + curvature * this.speed * 0.55, -0.6, 0.6);
    this.lean = damp(this.lean, leanTarget * (this.airborne ? 0.4 : 1), 7, dt);

    this.steerVisual = damp(this.steerVisual, steer, 10, dt);
    this.wheelSpin += (this.speed / WHEEL_RADIUS) * dt;

    this.slip = clamp(Math.abs(this.latVelocity) / 6.5, 0, 1) * (1 - grip);
    this.offRoad = surf.offroad;

    this.syncTransform();
  }

  syncTransform() {
    const frame = this.track.frameAt(this.s, this.frame);
    this.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    this.bank = frame.bank;
    this.pitch = -Math.asin(clamp(frame.tangent.y, -1, 1));

    if (this.airborne) {
      this.pitch += clamp(this.vy * 0.022, -0.28, 0.28);
    }

    const bankLift = this.lateral * Math.sin(frame.bank);
    this.position
      .copy(frame.position)
      .addScaledVector(frame.right, this.lateral)
      .addScaledVector(frame.up, 0.06 + this.height + bankLift);
  }
}
