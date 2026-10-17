/**
 * Procedural soundtrack.
 *
 * There is deliberately no audio file in this project: the track is synthesised
 * with the Web Audio API from oscillators and a generated noise buffer, so it
 * costs zero bytes in the APK. A look-ahead scheduler queues notes against
 * `AudioContext.currentTime` (the timer alone is far too jittery for music).
 *
 * Nothing is allocated until `start()` is called from a user gesture, which is
 * what browser autoplay policies require, and every failure path is swallowed so
 * a device with no audio can never stop the game booting.
 */

const midiToFreq = (note) => 440 * Math.pow(2, (note - 69) / 12);

const BPM = 124;
const STEPS_PER_BAR = 16;
const BARS = 4;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;

/** Am – F – C – G, as MIDI triads. */
const PROGRESSION = [
  [57, 60, 64],
  [53, 57, 60],
  [60, 64, 67],
  [55, 59, 62],
];

const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const HAT = [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1];
const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 2];

const LOOKAHEAD = 0.12;
const TIMER_MS = 25;

export class Music {
  constructor({ volume = 0.38, storageKey = 'jungle-rider:music' } = {}) {
    this.volume = volume;
    this.storageKey = storageKey;
    this.ctx = null;
    this.playing = false;
    this.muted = this._loadMuted();
    this.intensity = 0;
    this.step = 0;
    this.nextStepTime = 0;
    this.stepDuration = 60 / BPM / 4;
    this.timer = null;
    this._suspendTimer = null;
  }

  get state() {
    return {
      available: Boolean(this.ctx),
      playing: this.playing,
      muted: this.muted,
    };
  }

  /**
   * Must be called synchronously from a user gesture. Returns whether audio is
   * actually running; safe to call more than once.
   */
  start() {
    if (this.playing) {
      this._resume();
      return Promise.resolve(true);
    }

    const Ctor =
      typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!Ctor) return Promise.resolve(false);

    try {
      if (!this.ctx) this._build(Ctor);
      this.playing = true;
      this.step = 0;
      this.nextStepTime = this.ctx.currentTime + 0.08;
      this._applyVolume(0.5);
      this._startTimer();
    } catch {
      this.playing = false;
      return Promise.resolve(false);
    }

    return this._resume();
  }

  _build(Ctor) {
    let ctx;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      ctx = new Ctor();
    }
    this.ctx = ctx;

    this.stepDuration = 60 / BPM / 4;

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;

    // Speed opens this filter, so the track brightens as the rider accelerates.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 6200;
    this.tone.Q.value = 0.35;

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.bus.connect(this.tone);
    this.tone.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    // A short feedback delay gives the arpeggio some space cheaply.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = this.stepDuration * 3;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0.2;
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.bus);

    this.noise = this._noiseBuffer(ctx);
  }

  _noiseBuffer(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _resume() {
    if (!this.ctx) return Promise.resolve(false);
    const resume = () => {
      if (this.ctx.state === 'running') return true;
      if (typeof this.ctx.resume !== 'function') return true;
      return this.ctx.resume().then(
        () => true,
        () => false
      );
    };
    return Promise.resolve(resume()).then((ok) => {
      if (ok && !this.timer) this._startTimer();
      return Boolean(ok);
    });
  }

  _startTimer() {
    if (!this.ctx || this.timer) return;
    this.timer = setInterval(() => this._scheduler(), TIMER_MS);
  }

  _stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _scheduler() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // If the context stalled (suspended or backgrounded) do not race ahead.
    if (this.nextStepTime < now - 0.5) this.nextStepTime = now + 0.02;

    while (this.nextStepTime < now + LOOKAHEAD) {
      this._scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += this.stepDuration;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
  }

  _scheduleStep(step, time) {
    const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
    const local = step % STEPS_PER_BAR;
    const chord = PROGRESSION[bar];

    if (KICK[local]) this._kick(time);
    if (SNARE[local]) this._snare(time);
    if (HAT[local]) this._hat(time, local % 4 === 2 ? 0.16 : 0.09);
    if (BASS[local]) this._bass(midiToFreq(chord[0] - 12), time);

    const tone = chord[ARP[local] % chord.length] + 12;
    this._arp(midiToFreq(tone), time);
  }

  _envelope(gain, time, peak, attack, decay) {
    gain.setValueAtTime(0.0001, time);
    gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
    gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  }

  _kick(time) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.11);
    this._envelope(gain.gain, time, 0.85, 0.006, 0.24);
    osc.connect(gain).connect(this.bus);
    osc.start(time);
    osc.stop(time + 0.32);
  }

  _snare(time) {
    const { ctx } = this;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1850;
    band.Q.value = 0.9;
    const gain = ctx.createGain();
    this._envelope(gain.gain, time, 0.4, 0.004, 0.15);
    source.connect(band).connect(gain).connect(this.bus);
    source.start(time);
    source.stop(time + 0.22);

    // A little tonal body makes it read as a drum rather than a hiss.
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(196, time);
    body.frequency.exponentialRampToValueAtTime(150, time + 0.08);
    this._envelope(bodyGain.gain, time, 0.16, 0.004, 0.09);
    body.connect(bodyGain).connect(this.bus);
    body.start(time);
    body.stop(time + 0.16);
  }

  _hat(time, level) {
    const { ctx } = this;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 7600;
    const gain = ctx.createGain();
    this._envelope(gain.gain, time, level, 0.002, 0.045);
    source.connect(high).connect(gain).connect(this.bus);
    source.start(time);
    source.stop(time + 0.08);
  }

  _bass(freq, time) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(190, time);
    filter.frequency.exponentialRampToValueAtTime(520, time + 0.05);
    this._envelope(gain.gain, time, 0.32, 0.008, 0.19);
    osc.connect(filter).connect(gain).connect(this.bus);
    osc.start(time);
    osc.stop(time + 0.24);
  }

  _arp(freq, time) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    this._envelope(gain.gain, time, 0.13, 0.005, 0.12);
    osc.connect(filter).connect(gain);
    gain.connect(this.bus);
    gain.connect(this.delay);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  _applyVolume(ramp = 0.25, target = null) {
    if (!this.ctx) return;
    const gain = this.master.gain;
    const now = this.ctx.currentTime;
    const value = target !== null ? target : this.muted ? 0 : this.volume;
    try {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(value, now + ramp);
    } catch {
      gain.value = value;
    }
  }

  /** 0 = stationary, 1 = flat out. Opens the bus filter. */
  setIntensity(value) {
    const next = Math.max(0, Math.min(1, value));
    if (Math.abs(next - this.intensity) < 0.04) return;
    this.intensity = next;
    if (!this.ctx || !this.tone) return;
    try {
      this.tone.frequency.setTargetAtTime(5200 + 11000 * next, this.ctx.currentTime, 0.3);
    } catch {
      /* filter gone */
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._saveMuted();
    if (this.playing) this._applyVolume(0.18);
  }

  setPaused(paused) {
    if (!this.ctx || !this.playing) return;
    if (paused) {
      this._stopTimer();
      this._applyVolume(0.12, 0);
      clearTimeout(this._suspendTimer);
      this._suspendTimer = setTimeout(() => {
        try {
          this.ctx.suspend();
        } catch {
          /* ignore */
        }
      }, 200);
    } else {
      clearTimeout(this._suspendTimer);
      Promise.resolve(this._resume()).then(() => {
        if (!this.ctx) return;
        this.nextStepTime = this.ctx.currentTime + 0.06;
        this._applyVolume(0.3);
        this._startTimer();
      });
    }
  }

  stop() {
    this._stopTimer();
    this.playing = false;
    if (this.ctx) {
      this._applyVolume(0.2, 0);
      clearTimeout(this._suspendTimer);
      this._suspendTimer = setTimeout(() => {
        try {
          this.ctx.suspend();
        } catch {
          /* ignore */
        }
      }, 220);
    }
  }

  _loadMuted() {
    try {
      return window.localStorage.getItem(this.storageKey) === 'off';
    } catch {
      return false;
    }
  }

  _saveMuted() {
    try {
      window.localStorage.setItem(this.storageKey, this.muted ? 'off' : 'on');
    } catch {
      /* storage unavailable */
    }
  }

  dispose() {
    this._stopTimer();
    clearTimeout(this._suspendTimer);
    this.playing = false;
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      try {
        ctx.close();
      } catch {
        /* already closed */
      }
    }
  }
}
