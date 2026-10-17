const DEADZONE = 0.06;

export class TouchControls {
  constructor(input, root) {
    this.input = input;
    this.root = root;
    this.visible = true;

    this.container = document.createElement('div');
    this.container.className = 'controls';

    this.stick = document.createElement('div');
    this.stick.className = 'stick';
    this.knob = document.createElement('div');
    this.knob.className = 'stick__knob';
    const hint = document.createElement('span');
    hint.className = 'stick__hint';
    hint.textContent = 'STEER';
    this.stick.append(this.knob, hint);
    this.container.appendChild(this.stick);

    this.pedals = document.createElement('div');
    this.pedals.className = 'pedals';

    this.brake = document.createElement('div');
    this.brake.className = 'pedal pedal--brake';
    this.brake.innerHTML = 'BRAKE<span class="pedal__sub">HOLD</span>';

    this.gas = document.createElement('div');
    this.gas.className = 'pedal pedal--gas';
    this.gas.innerHTML = 'GAS<span class="pedal__sub">HOLD</span>';

    this.pedals.append(this.brake, this.gas);
    this.container.appendChild(this.pedals);

    this.hintBar = document.createElement('div');
    this.hintBar.className = 'hint';
    this.hintBar.textContent = 'Left stick steers · hold GAS · BRAKE to slow';
    this.container.appendChild(this.hintBar);

    root.appendChild(this.container);

    this._stickPointer = null;
    this._pedalPointers = new Map();

    this._bindStick();
    this._bindPedal(this.gas, 'throttle');
    this._bindPedal(this.brake, 'brake');
  }

  _bindStick() {
    const stick = this.stick;

    const update = (event) => {
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = rect.width / 2 - 12;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.knob.style.margin = '-29px 0 0 -29px';

      let value = dx / radius;
      if (Math.abs(value) < DEADZONE) value = 0;
      this.input.touch.steer = value;
    };

    stick.addEventListener('pointerdown', (event) => {
      if (this._stickPointer !== null) return;
      this._stickPointer = event.pointerId;
      this.input.touch.touches++;
      try {
        stick.setPointerCapture(event.pointerId);
      } catch {
        /* capture not available */
      }
      stick.classList.add('stick--active');
      update(event);
      event.preventDefault();
    });

    stick.addEventListener('pointermove', (event) => {
      if (this._stickPointer !== event.pointerId) return;
      update(event);
      event.preventDefault();
    });

    const release = (event) => {
      if (this._stickPointer !== event.pointerId) return;
      this._stickPointer = null;
      this.input.touch.touches = Math.max(0, this.input.touch.touches - 1);
      this.input.touch.steer = 0;
      this.knob.style.transform = 'translate(0px, 0px)';
      stick.classList.remove('stick--active');
      event.preventDefault();
    };

    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    stick.addEventListener('lostpointercapture', release);
  }

  _bindPedal(element, key) {
    const press = (event) => {
      this._pedalPointers.set(event.pointerId, key);
      this.input.touch.touches++;
      this._recount();
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        /* capture not available */
      }
      element.classList.add('pedal--active');
      event.preventDefault();
    };

    const release = (event) => {
      if (!this._pedalPointers.has(event.pointerId)) return;
      this._pedalPointers.delete(event.pointerId);
      this.input.touch.touches = Math.max(0, this.input.touch.touches - 1);
      this._recount();
      element.classList.remove('pedal--active');
      event.preventDefault();
    };

    element.addEventListener('pointerdown', press);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('lostpointercapture', release);
  }

  _recount() {
    let throttle = 0;
    let brake = 0;
    for (const key of this._pedalPointers.values()) {
      if (key === 'throttle') throttle = 1;
      if (key === 'brake') brake = 1;
    }
    this.input.touch.throttle = throttle;
    this.input.touch.brake = brake;
  }

  setVisible(visible) {
    this.visible = visible;
    this.container.classList.toggle('controls--hidden', !visible);
  }

  dispose() {
    this.container.remove();
  }
}
