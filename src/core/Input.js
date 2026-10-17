import { clamp, damp } from './MathUtils.js';

const KEY_THROTTLE = ['KeyW', 'ArrowUp', 'Space'];
const KEY_BRAKE = ['KeyS', 'ArrowDown'];
const KEY_LEFT = ['KeyA', 'ArrowLeft'];
const KEY_RIGHT = ['KeyD', 'ArrowRight'];

export class Input {
  constructor(target = window) {
    this.target = target;
    this.keys = new Set();
    this.touch = { steer: 0, throttle: 0, brake: 0, touches: 0 };
    this.tilt = { supported: false, enabled: false, needsPermission: false, raw: 0, value: 0, calibrate: 0 };
    this.pad = { steer: 0, throttle: 0, brake: 0 };
    this.steerSmoothing = 14;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.onAction = null;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (KEY_THROTTLE.includes(e.code) || KEY_BRAKE.includes(e.code)) e.preventDefault();
      if (this.onAction) this.onAction('key', e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => this.keys.clear();
    this._onOrientation = (e) => {
      if (e.gamma === null || e.gamma === undefined) return;
      this.tilt.raw = clamp(e.gamma, -60, 60) / 60;
    };

    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
    this.detectTilt();
  }

  detectTilt() {
    const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    this.tilt.supported = supported;
    const needsPermission =
      supported && typeof window.DeviceOrientationEvent.requestPermission === 'function';
    this.tilt.needsPermission = needsPermission;
  }

  async enableTilt() {
    if (!this.tilt.supported) return false;
    try {
      if (this.tilt.needsPermission) {
        const res = await window.DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      }
      if (!this._tiltBound) {
        window.addEventListener('deviceorientation', this._onOrientation);
        this._tiltBound = true;
      }
      this.tilt.enabled = true;
      this.tilt.calibrate = this.tilt.raw;
      return true;
    } catch {
      return false;
    }
  }

  disableTilt() {
    this.tilt.enabled = false;
    this.tilt.value = 0;
  }

  registerGamepad(poll) {
    this._pollGamepad = poll;
  }

  get anyTouch() {
    return this.touch.touches > 0;
  }

  update(dt) {
    const keys = this.keys;
    let tThrottle = 0;
    let tBrake = 0;
    let kSteer = 0;

    if (KEY_THROTTLE.some((k) => keys.has(k))) tThrottle = 1;
    if (KEY_BRAKE.some((k) => keys.has(k))) tBrake = 1;
    if (KEY_LEFT.some((k) => keys.has(k))) kSteer -= 1;
    if (KEY_RIGHT.some((k) => keys.has(k))) kSteer += 1;

    if (this._pollGamepad) this._pollGamepad(this.pad);

    const tiltSteer = this.tilt.enabled ? clamp((this.tilt.raw - this.tilt.calibrate) * 1.9, -1, 1) : 0;
    this.tilt.value = damp(this.tilt.value, tiltSteer, 10, dt);

    let steerTarget = clamp(this.touch.steer + kSteer + this.pad.steer, -1, 1);
    if (Math.abs(steerTarget) < 0.02 && this.tilt.enabled) steerTarget = this.tilt.value;

    this.steer = damp(this.steer, clamp(steerTarget, -1, 1), this.steerSmoothing, dt);
    this.throttle = clamp(Math.max(this.touch.throttle, tThrottle, this.pad.throttle), 0, 1);
    this.brake = clamp(Math.max(this.touch.brake, tBrake, this.pad.brake), 0, 1);
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('blur', this._onBlur);
    if (this._tiltBound) window.removeEventListener('deviceorientation', this._onOrientation);
  }
}
