import { formatTime } from '../core/MathUtils.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class HUD {
  constructor(root, { onPause, onTiltToggle, onMusicToggle, onRestart, onResumeFreeRide } = {}) {
    this.root = root;
    this.callbacks = { onPause, onTiltToggle, onMusicToggle, onRestart, onResumeFreeRide };
    this._cache = new Map();
    this.checkpoints = [];
    this.markers = [];

    this.hud = el('div', 'hud');
    root.appendChild(this.hud);

    const top = el('div', 'hud__top');
    this.hud.appendChild(top);

    const speedCluster = el('div', 'hud__cluster hud__speed');
    speedCluster.appendChild(el('div', 'hud__label', 'Speed'));
    this.speedValue = el('div', 'hud__value');
    this.speedNumber = el('span', undefined, '0');
    this.speedValue.appendChild(this.speedNumber);
    this.speedValue.appendChild(el('small', undefined, 'km/h'));
    speedCluster.appendChild(this.speedValue);
    this.timerValue = el('div', 'hud__label', '00:00.00');
    this.timerValue.style.fontSize = '0.85rem';
    this.timerValue.style.color = 'var(--ink)';
    speedCluster.appendChild(this.timerValue);
    top.appendChild(speedCluster);

    const positionCluster = el('div', 'hud__cluster hud__position');
    positionCluster.appendChild(el('div', 'hud__label', 'Position'));
    this.positionValue = el('div', 'hud__value hud__posvalue');
    this.positionNumber = el('span', undefined, '--');
    this.positionValue.appendChild(this.positionNumber);
    this.positionField = el('small', undefined, '/--');
    this.positionValue.appendChild(this.positionField);
    positionCluster.appendChild(this.positionValue);
    this.positionGap = el('div', 'hud__label hud__posgap', '');
    positionCluster.appendChild(this.positionGap);
    top.appendChild(positionCluster);

    const zoneCluster = el('div', 'hud__cluster hud__zone');
    zoneCluster.appendChild(el('div', 'hud__label', 'Zone'));
    this.zoneValue = el('div', 'hud__value', 'Jungle Trail');
    zoneCluster.appendChild(this.zoneValue);
    this.surfaceBadge = el('span', 'hud__badge', 'CLEAN');
    zoneCluster.appendChild(this.surfaceBadge);
    top.appendChild(zoneCluster);

    this.standingsBox = el('div', 'hud__standings');
    this.hud.appendChild(this.standingsBox);
    this.standingRows = new Map();

    this.debug = el('div', 'debug');
    this.debug.style.display = 'none';
    this.hud.appendChild(this.debug);

    const side = el('div', 'hud__side');
    this.pauseBtn = el('button', 'chip', 'II  PAUSE');
    this.pauseBtn.type = 'button';
    this.pauseBtn.addEventListener('click', () => this.callbacks.onPause && this.callbacks.onPause());
    side.appendChild(this.pauseBtn);

    this.tiltBtn = el('button', 'chip', 'TILT STEER');
    this.tiltBtn.type = 'button';
    this.tiltBtn.addEventListener('click', () => this.callbacks.onTiltToggle && this.callbacks.onTiltToggle());
    side.appendChild(this.tiltBtn);

    this.musicBtn = el('button', 'chip', '♪  MUSIC');
    this.musicBtn.type = 'button';
    this.musicBtn.addEventListener('click', () => this.callbacks.onMusicToggle && this.callbacks.onMusicToggle());
    side.appendChild(this.musicBtn);
    this.hud.appendChild(side);

    const speedo = el('div', 'hud__speedo');
    this.trackBar = el('div', 'hud__track');
    this.trackFill = el('i');
    this.trackBar.appendChild(this.trackFill);

    for (const fraction of [0.25, 0.5, 0.75]) {
      const gate = el('div', 'hud__gate');
      gate.style.left = `${fraction * 100}%`;
      this.trackBar.appendChild(gate);
    }
    speedo.appendChild(this.trackBar);

    this.splitsRow = el('div', 'hud__splits');
    speedo.appendChild(this.splitsRow);
    this.hud.appendChild(speedo);

    this.toastBox = el('div', 'hud__toast');
    this.hud.appendChild(this.toastBox);

    const center = el('div', 'hud__center');
    this.countdown = el('div', 'hud__count');
    center.appendChild(this.countdown);
    this.hud.appendChild(center);

    const rotate = el('div', 'rotate-hint', 'Rotate to landscape for the best view');
    this.hud.appendChild(rotate);

    this.results = null;
  }

  setCheckpoints(fractions, labels) {
    this.checkpoints = fractions;
    for (const marker of this.markers) marker.remove();
    this.markers = [];
    this.splitsRow.innerHTML = '';
    this.splitEls = [];

    fractions.forEach((fraction, i) => {
      const marker = el('div', 'hud__marker');
      marker.style.left = `${fraction * 100}%`;
      this.trackBar.appendChild(marker);
      this.markers.push(marker);

      const span = el('span', undefined, labels[i] || `S${i + 1}`);
      this.splitsRow.appendChild(span);
      this.splitEls.push(span);
    });
  }

  /** Builds one live standings row per racer. Call once after the grid is set. */
  setRacers(racers) {
    this.standingsBox.textContent = '';
    this.standingRows = new Map();

    for (const racer of racers) {
      const row = el('div', 'hud__standing');
      const pos = el('b', 'hud__standingpos', '-');
      const swatch = el('i', 'hud__swatch');
      swatch.style.background = racer.color;
      const name = el('span', 'hud__standingname', racer.name);
      const gap = el('em', 'hud__standinggap', '');
      row.appendChild(pos);
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(gap);
      if (racer.isPlayer) row.classList.add('hud__standing--player');
      this.standingsBox.appendChild(row);
      this.standingRows.set(racer.id, { row, pos, gap });
    }
  }

  _set(node, key, value) {
    if (this._cache.get(key) === value) return;
    this._cache.set(key, value);
    node.textContent = value;
  }

  update(state) {
    this._set(this.speedNumber, 'kmh', String(Math.round(state.kmh)));
    this._set(this.timerValue, 'time', formatTime(state.time));
    this._set(this.zoneValue, 'zone', state.zoneName);
    this._set(this.surfaceBadge, 'surface', state.surfaceLabel);
    const badgeClass = `hud__badge hud__badge--${state.surfaceKey}`;
    if (this.surfaceBadge.className !== badgeClass) this.surfaceBadge.className = badgeClass;

    if (state.playerPosition) {
      this._set(this.positionNumber, 'posnum', String(state.playerPosition));
      this._set(this.positionField, 'posfield', `/${state.fieldSize}`);
      this._set(this.positionGap, 'posgap', state.playerGap || '');
      const posClass = state.playerPosition === 1 ? 'hud__value hud__posvalue hud__posvalue--lead' : 'hud__value hud__posvalue';
      if (this.positionValue.className !== posClass) this.positionValue.className = posClass;
    }

    if (state.standings) {
      for (const entry of state.standings) {
        const row = this.standingRows.get(entry.id);
        if (!row) continue;
        this._set(row.pos, `pos-${entry.id}`, `P${entry.position}`);
        this._set(row.gap, `gap-${entry.id}`, entry.gap);
        const cls = entry.isPlayer ? 'hud__standing hud__standing--player' : 'hud__standing';
        if (row.row.className !== cls) row.row.className = cls;
      }
    }

    const pct = `${(state.progress * 100).toFixed(1)}%`;
    if (this._cache.get('progress') !== pct) {
      this._cache.set('progress', pct);
      this.trackFill.style.width = pct;
    }

    for (let i = 0; i < this.markers.length; i++) {
      const hit = state.checkpointHits ? state.checkpointHits[i] : false;
      const cls = `hud__marker${hit ? ' hud__marker--hit' : ''}`;
      if (this.markers[i].className !== cls) this.markers[i].className = cls;
    }

    if (state.splitTimes) {
      for (let i = 0; i < this.splitEls.length; i++) {
        const text = state.splitTimes[i] ? formatTime(state.splitTimes[i]) : `S${i + 1}  --:--`;
        this._set(this.splitEls[i], `split${i}`, text);
      }
    }

    if (state.debug) {
      if (this.debug.style.display !== 'block') this.debug.style.display = 'block';
      this._set(this.debug, 'debugText', state.debug);
    }
  }

  popCountdown(text) {
    this.countdown.textContent = text;
    this.countdown.classList.remove('hud__count--pop');
    void this.countdown.offsetWidth;
    this.countdown.classList.add('hud__count--pop');
  }

  toast(text) {
    const item = el('div', 'hud__toastitem', text);
    this.toastBox.appendChild(item);
    window.setTimeout(() => item.remove(), 2200);
  }

  setTiltState(enabled, supported) {
    this.tiltBtn.textContent = enabled ? 'TILT ON' : 'TILT STEER';
    this.tiltBtn.classList.toggle('chip--on', enabled);
    this.tiltBtn.disabled = !supported;
    if (!supported) {
      this.tiltBtn.textContent = 'NO TILT';
      this.tiltBtn.style.opacity = '0.5';
    }
  }

  setPaused(paused) {
    this.pauseBtn.textContent = paused ? '▶  RESUME' : 'II  PAUSE';
  }

  setMusicState(enabled) {
    this.musicBtn.textContent = enabled ? '♪  MUSIC' : '♪  MUTED';
    this.musicBtn.classList.toggle('chip--on', enabled);
  }

  showResults(data) {
    if (this.results) this.results.remove();
    const overlay = el('div', 'results');
    const card = el('div', 'results__card');

    card.appendChild(el('div', 'results__title', data.title || 'FINISHED'));
    card.appendChild(el('div', 'results__time', formatTime(data.time)));
    card.appendChild(
      el(
        'div',
        'results__best',
        data.isBest ? `NEW BEST · previous ${formatTime(data.best)}` : `BEST ${formatTime(data.best)}`
      )
    );

    if (data.standings && data.standings.length) {
      const board = el('div', 'results__board');
      for (const entry of data.standings) {
        const line = el('div', 'results__boardrow');
        const swatch = el('i', 'results__swatch');
        swatch.style.background = entry.color;
        line.appendChild(el('b', undefined, `P${entry.position}`));
        line.appendChild(swatch);
        line.appendChild(el('span', undefined, entry.name));
        line.appendChild(el('em', undefined, entry.time));
        if (entry.isPlayer) line.classList.add('results__boardrow--player');
        board.appendChild(line);
      }
      card.appendChild(board);
    }

    const rows = el('div', 'results__rows');
    for (const row of data.rows || []) {
      const line = el('div', 'results__row');
      line.appendChild(el('span', undefined, row.label));
      line.appendChild(el('b', undefined, row.value));
      rows.appendChild(line);
    }
    card.appendChild(rows);

    const actions = el('div', 'results__actions');
    const restart = el('button', 'btn btn--primary', 'RIDE AGAIN');
    restart.type = 'button';
    restart.addEventListener('click', () => this.callbacks.onRestart && this.callbacks.onRestart());
    actions.appendChild(restart);

    const free = el('button', 'btn btn--ghost', 'FREE RIDE');
    free.type = 'button';
    free.addEventListener('click', () => this.callbacks.onResumeFreeRide && this.callbacks.onResumeFreeRide());
    actions.appendChild(free);

    card.appendChild(actions);
    overlay.appendChild(card);
    this.root.appendChild(overlay);
    this.results = overlay;
  }

  hideResults() {
    if (this.results) {
      this.results.remove();
      this.results = null;
    }
  }

  dispose() {
    this.hud.remove();
    this.hideResults();
  }
}
