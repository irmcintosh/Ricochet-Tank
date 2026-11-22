(() => {
  'use strict';

  // Vertical Portrait Tactical Arena (14 cols x 22 rows @ 40px = 560 x 880, ~9:14)
  const ARENA_W = 560;
  const ARENA_H = 880;
  const TILE = 40;
  const COLS = 14;
  const ROWS = 22;

  const MAX_HP = 3;
  const PLAYER_RADIUS = 15;
  const ENEMY_RADIUS = 15;
  const BULLET_RADIUS = 4.2;

  // =========================================================================
  // Web Audio API Synthesizer (No external audio files)
  // =========================================================================
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.sfxEnabled = true;
      this.musicEnabled = true;
      this.sfxGain = null;
      this.musicGain = null;
      this.noiseBuffer = null;
      this.musicTimer = null;
      this.musicStep = 0;
    }

    get muted() {
      return !this.sfxEnabled;
    }

    ensureContext(forMusic = false) {
      if (typeof state !== 'undefined' && state.phase === 'start') return null;
      if (!forMusic && !this.sfxEnabled) return null;
      if (forMusic && !this.musicEnabled) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
        this.noiseBuffer = this.createNoiseBuffer(this.ctx);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxEnabled ? 1 : 0;
        this.sfxGain.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicEnabled ? 0.14 : 0;
        this.musicGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    createNoiseBuffer(ctx) {
      const length = Math.floor(ctx.sampleRate * 0.6);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    }

    setSfxEnabled(enabled) {
      this.sfxEnabled = Boolean(enabled);
      if (this.sfxGain && this.ctx) {
        this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? 1 : 0, this.ctx.currentTime, 0.02);
      }
    }

    setMusicEnabled(enabled) {
      this.musicEnabled = Boolean(enabled);
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setTargetAtTime(this.musicEnabled ? 0.14 : 0, this.ctx.currentTime, 0.04);
      }
      if (this.musicEnabled && typeof state !== 'undefined' && (state.phase === 'playing' || state.phase === 'wave_transition')) {
        this.startMusic();
      } else {
        this.stopMusic();
      }
    }

    setMuted(muted) {
      this.setSfxEnabled(!muted);
    }

    startMusic() {
      if (!this.musicEnabled || this.musicTimer !== null) return;
      if (typeof state !== 'undefined' && state.phase !== 'playing' && state.phase !== 'wave_transition') return;
      const ctx = this.ensureContext(true);
      if (!ctx) return;
      this.scheduleMusicStep();
      this.musicTimer = window.setInterval(() => this.scheduleMusicStep(), 260);
    }

    stopMusic() {
      if (this.musicTimer !== null) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    }

    scheduleMusicStep() {
      if (!this.musicEnabled || document.hidden) return;
      if (typeof state !== 'undefined' && state.phase !== 'playing' && state.phase !== 'wave_transition') {
        this.stopMusic();
        return;
      }
      const ctx = this.ensureContext(true);
      if (!ctx || !this.musicGain) return;

      const now = ctx.currentTime;
      const step = this.musicStep % 16;
      this.musicStep += 1;

      // Dark D-minor tactical bass & radar pulse arpeggio
      const bassPattern = [73.42, 0, 73.42, 0, 87.31, 0, 82.41, 0, 65.41, 0, 65.41, 0, 98.0, 0, 87.31, 0];
      const leadPattern = [293.66, 349.23, 440.0, 349.23, 523.25, 440.0, 392.0, 349.23];

      const bassFreq = bassPattern[step];
      if (bassFreq > 0) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(bassFreq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(340, now);
        filter.frequency.exponentialRampToValueAtTime(140, now + 0.22);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.32, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.25);
      }

      if (step % 2 === 1) {
        const leadFreq = leadPattern[(step >> 1) % leadPattern.length];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(leadFreq, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.16, now + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    }

    playShot(isEnemy = false) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const dest = this.sfxGain || ctx.destination;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isEnemy ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(isEnemy ? 240 : 340, now);
      osc.frequency.exponentialRampToValueAtTime(isEnemy ? 65 : 85, now + 0.11);

      gain.gain.setValueAtTime(isEnemy ? 0.14 : 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.13);

      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(isEnemy ? 820 : 1250, now);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.12, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(dest);
        noise.start(now);
        noise.stop(now + 0.075);
      }
    }

    playBounce() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const dest = this.sfxGain || ctx.destination;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(1480, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.11);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.125);
    }

    playCrateHit() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const dest = this.sfxGain || ctx.destination;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.07);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.085);
    }

    playCrateBreak() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const dest = this.sfxGain || ctx.destination;
      const now = ctx.currentTime;

      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(580, now);
        filter.Q.value = 1.2;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        noise.start(now);
        noise.stop(now + 0.21);
      }

      const osc = ctx.createOscillator();
      const oGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.14);
      oGain.gain.setValueAtTime(0.16, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(oGain);
      oGain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.16);
    }

    playExplosion(big = false) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const dest = this.sfxGain || ctx.destination;
      const now = ctx.currentTime;
      const duration = big ? 0.54 : 0.38;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(big ? 125 : 150, now);
      osc.frequency.exponentialRampToValueAtTime(24, now + duration);

      gain.gain.setValueAtTime(big ? 0.34 : 0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + duration + 0.02);

      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(big ? 1050 : 850, now);
        filter.frequency.exponentialRampToValueAtTime(120, now + duration);

        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(big ? 0.36 : 0.28, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(dest);
        noise.start(now);
        noise.stop(now + duration + 0.02);
      }
    }

    playPlayerHit() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const dest = this.sfxGain || ctx.destination;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.25);
    }

    playWaveClear() {
      this.playArpeggio([440, 554.37, 659.25, 880], 0.08, 0.16);
    }

    playVictory() {
      this.playArpeggio([523.25, 659.25, 783.99, 1046.5], 0.1, 0.22);
    }

    playGameOver() {
      this.playArpeggio([311.13, 277.18, 233.08, 174.61], 0.12, 0.2);
    }

    playPowerUp() {
      this.playArpeggio([523.25, 659.25, 987.77], 0.055, 0.16);
    }

    playArpeggio(freqs, step, volume) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const dest = this.sfxGain || ctx.destination;
      const now = ctx.currentTime;
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * step;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + step * 1.9);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + step * 2.0);
      });
    }
  }

  // =========================================================================
  // 5 Progressive Portrait Wave Definitions (14 cols x 22 rows)
  // =========================================================================
  // Terrain Themes, Fallback Sector Blueprint & 1v1 Duel Arena
  // =========================================================================
  const TERRAIN_THEMES = [
    {
      id: 'concrete_fob',
      name: 'CONCRETE FOB',
      base: '#1e2328',
      apron: '#252b31',
      seam: 'rgba(10, 12, 15, 0.44)',
      grid: 'rgba(148, 163, 184, 0.055)',
      stripe: 'rgba(217, 119, 6, 0.16)',
      circle: 'rgba(203, 213, 225, 0.08)',
      stencil: 'rgba(203, 213, 225, 0.09)',
      footer: 'MOTORPOOL-A',
    },
    {
      id: 'desert_airfield',
      name: 'DESERT AIRFIELD',
      base: '#28231c',
      apron: '#332c22',
      seam: 'rgba(18, 14, 9, 0.45)',
      grid: 'rgba(217, 194, 140, 0.05)',
      stripe: 'rgba(234, 179, 8, 0.18)',
      circle: 'rgba(245, 222, 179, 0.08)',
      stencil: 'rgba(245, 222, 179, 0.1)',
      footer: 'RUNWAY-04',
    },
    {
      id: 'industrial_yard',
      name: 'INDUSTRIAL YARD',
      base: '#171c22',
      apron: '#1e252d',
      seam: 'rgba(6, 9, 14, 0.5)',
      grid: 'rgba(125, 211, 252, 0.05)',
      stripe: 'rgba(56, 189, 248, 0.15)',
      circle: 'rgba(148, 163, 184, 0.08)',
      stencil: 'rgba(148, 163, 184, 0.1)',
      footer: 'DEPOT-NORTH',
    },
    {
      id: 'radar_ridge',
      name: 'RADAR RIDGE',
      base: '#1b211f',
      apron: '#232a27',
      seam: 'rgba(8, 12, 10, 0.46)',
      grid: 'rgba(132, 204, 22, 0.055)',
      stripe: 'rgba(132, 204, 22, 0.17)',
      circle: 'rgba(190, 242, 100, 0.08)',
      stencil: 'rgba(190, 242, 100, 0.09)',
      footer: 'OUTPOST-7G',
    },
    {
      id: 'fortified_citadel',
      name: 'FORTIFIED CITADEL',
      base: '#1a1b20',
      apron: '#23252c',
      seam: 'rgba(8, 8, 12, 0.5)',
      grid: 'rgba(156, 163, 175, 0.05)',
      stripe: 'rgba(239, 68, 68, 0.16)',
      circle: 'rgba(229, 231, 235, 0.08)',
      stencil: 'rgba(229, 231, 235, 0.09)',
      footer: 'BASTION-CORE',
    },
  ];

  // Fallback Sector & Attract Blueprint (supports '#' Concrete, 'W' Crate, '1'-'4' 45-deg Deflectors)
  const FALLBACK_SECTOR_GRID = [
    '##############',
    '#............#',
    '#.E........E.#',
    '#..1.#..#.2..#',
    '#..W......W..#',
    '#.T........T.#',
    '#....#..#....#',
    '#....#..#....#',
    '#..W..WW..W..#',
    '#............#',
    '#..###..###..#',
    '#............#',
    '#.....WW.....#',
    '#..W......W..#',
    '#..3.#..#.4..#',
    '#............#',
    '#..W......W..#',
    '#....####....#',
    '#............#',
    '#......P.....#',
    '#............#',
    '##############',
  ];

  // Symmetrical 14x22 1v1 Duel Arena (Q = Player 2 top spawn, P = Player 1 bottom spawn)
  const DUEL_WAVE = {
    number: 1,
    name: 'Symmetry Proving Ground',
    themeId: 'concrete_fob',
    isBoss: false,
    bossType: null,
    bossName: '',
    grid: [
      '##############',
      '#............#',
      '#......Q.....#',
      '#............#',
      '#..1.#..#.2..#',
      '#..W......W..#',
      '#............#',
      '#....####....#',
      '#..W......W..#',
      '#.#........#.#',
      '#.#...WW...#.#',
      '#.#...WW...#.#',
      '#.#........#.#',
      '#..W......W..#',
      '#....####....#',
      '#............#',
      '#..W......W..#',
      '#..3.#..#.4..#',
      '#............#',
      '#......P.....#',
      '#............#',
      '##############',
    ],
  };

  // =========================================================================
  // Math & Collision Helpers (AABB & 45-Degree Triangular Deflectors)
  // =========================================================================
  const SQRT1_2 = Math.SQRT1_2;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function rotateTowards(current, target, maxStep) {
    const diff = normalizeAngle(target - current);
    if (Math.abs(diff) <= maxStep) return target;
    return normalizeAngle(current + Math.sign(diff) * maxStep);
  }

  function distSq(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  function circleIntersectsRect(cx, cy, r, rect) {
    const closestX = clamp(cx, rect.x, rect.x + rect.w);
    const closestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
  }

  function resolveCircleRect(entity, rect) {
    const closestX = clamp(entity.x, rect.x, rect.x + rect.w);
    const closestY = clamp(entity.y, rect.y, rect.y + rect.h);
    const dx = entity.x - closestX;
    const dy = entity.y - closestY;
    const d2 = dx * dx + dy * dy;
    const r = entity.radius;
    if (d2 >= r * r) return false;

    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const overlap = r - d;
      entity.x += (dx / d) * overlap;
      entity.y += (dy / d) * overlap;
    } else {
      const leftPen = entity.x - rect.x;
      const rightPen = rect.x + rect.w - entity.x;
      const topPen = entity.y - rect.y;
      const bottomPen = rect.y + rect.h - entity.y;
      const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
      if (minPen === leftPen) entity.x = rect.x - r;
      else if (minPen === rightPen) entity.x = rect.x + rect.w + r;
      else if (minPen === topPen) entity.y = rect.y - r;
      else entity.y = rect.y + rect.h + r;
    }
    return true;
  }

  function buildDeflector(x, y, size, kind) {
    // kind: '1'=tl, '2'=tr, '3'=bl, '4'=br
    let verts;
    let edges;
    if (kind === '1') {
      verts = [
        [x, y],
        [x + size, y],
        [x, y + size],
      ];
      edges = [
        { ax: x, ay: y, bx: x + size, by: y, nx: 0, ny: -1, isHyp: false },
        { ax: x + size, ay: y, bx: x, by: y + size, nx: SQRT1_2, ny: SQRT1_2, isHyp: true },
        { ax: x, ay: y + size, bx: x, by: y, nx: -1, ny: 0, isHyp: false },
      ];
    } else if (kind === '2') {
      verts = [
        [x, y],
        [x + size, y],
        [x + size, y + size],
      ];
      edges = [
        { ax: x, ay: y, bx: x + size, by: y, nx: 0, ny: -1, isHyp: false },
        { ax: x + size, ay: y, bx: x + size, by: y + size, nx: 1, ny: 0, isHyp: false },
        { ax: x + size, ay: y + size, bx: x, by: y, nx: -SQRT1_2, ny: SQRT1_2, isHyp: true },
      ];
    } else if (kind === '3') {
      verts = [
        [x, y],
        [x + size, y + size],
        [x, y + size],
      ];
      edges = [
        { ax: x, ay: y, bx: x + size, by: y + size, nx: SQRT1_2, ny: -SQRT1_2, isHyp: true },
        { ax: x + size, ay: y + size, bx: x, by: y + size, nx: 0, ny: 1, isHyp: false },
        { ax: x, ay: y + size, bx: x, by: y, nx: -1, ny: 0, isHyp: false },
      ];
    } else {
      verts = [
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
      ];
      edges = [
        { ax: x + size, ay: y, bx: x + size, by: y + size, nx: 1, ny: 0, isHyp: false },
        { ax: x + size, ay: y + size, bx: x, by: y + size, nx: 0, ny: 1, isHyp: false },
        { ax: x, ay: y + size, bx: x + size, by: y, nx: -SQRT1_2, ny: -SQRT1_2, isHyp: true },
      ];
    }
    return { x, y, w: size, h: size, kind, verts, edges };
  }

  function pointInsideDeflector(px, py, d) {
    if (px < d.x || px > d.x + d.w || py < d.y || py > d.y + d.h) return false;
    const lx = px - d.x;
    const ly = py - d.y;
    if (d.kind === '1') return lx + ly <= d.w;
    if (d.kind === '2') return lx >= ly;
    if (d.kind === '3') return lx <= ly;
    return lx + ly >= d.w;
  }

  function closestEdgePointOnDeflector(cx, cy, d) {
    let bestD2 = Infinity;
    let bestX = cx;
    let bestY = cy;
    let bestEdge = d.edges[0];
    for (let i = 0; i < d.edges.length; i++) {
      const ed = d.edges[i];
      const ex = ed.bx - ed.ax;
      const ey = ed.by - ed.ay;
      const len2 = ex * ex + ey * ey;
      const t = len2 > 0 ? clamp(((cx - ed.ax) * ex + (cy - ed.ay) * ey) / len2, 0, 1) : 0;
      const qx = ed.ax + ex * t;
      const qy = ed.ay + ey * t;
      const d2 = (cx - qx) * (cx - qx) + (cy - qy) * (cy - qy);
      if (d2 < bestD2) {
        bestD2 = d2;
        bestX = qx;
        bestY = qy;
        bestEdge = ed;
      }
    }
    return { d2: bestD2, x: bestX, y: bestY, edge: bestEdge };
  }

  function circleIntersectsDeflector(cx, cy, r, d) {
    if (cx + r < d.x || cx - r > d.x + d.w || cy + r < d.y || cy - r > d.y + d.h) return false;
    if (pointInsideDeflector(cx, cy, d)) return true;
    return closestEdgePointOnDeflector(cx, cy, d).d2 < r * r;
  }

  function resolveCircleDeflector(entity, d) {
    const r = entity.radius;
    if (entity.x + r < d.x || entity.x - r > d.x + d.w || entity.y + r < d.y || entity.y - r > d.y + d.h) {
      return null;
    }
    const inside = pointInsideDeflector(entity.x, entity.y, d);
    const closest = closestEdgePointOnDeflector(entity.x, entity.y, d);
    if (!inside && closest.d2 >= r * r) return null;

    let nx = closest.edge.nx;
    let ny = closest.edge.ny;
    if (inside) {
      const dist = Math.sqrt(closest.d2);
      entity.x = closest.x + nx * (r + 0.4);
      entity.y = closest.y + ny * (r + 0.4);
      if (dist < 0.001) {
        nx = closest.edge.nx;
        ny = closest.edge.ny;
      }
    } else if (closest.d2 > 0.0001) {
      const dist = Math.sqrt(closest.d2);
      const dx = entity.x - closest.x;
      const dy = entity.y - closest.y;
      const overlap = r - dist;
      entity.x += (dx / dist) * overlap;
      entity.y += (dy / dist) * overlap;
      // Use exact triangle face normal when striking near edge interior for crisp 45/90 ricochets
      const ed = closest.edge;
      const ex = ed.bx - ed.ax;
      const ey = ed.by - ed.ay;
      const len = Math.hypot(ex, ey);
      const proj = ((closest.x - ed.ax) * ex + (closest.y - ed.ay) * ey) / (len * len);
      if (proj > 0.08 && proj < 0.92) {
        nx = ed.nx;
        ny = ed.ny;
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }
    } else {
      entity.x += nx * r;
      entity.y += ny * r;
    }
    return { nx, ny };
  }

  // Deterministic PRNG for procedural asphalt/concrete weathering & sector generation
  function createRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // =========================================================================
  // DOM & Canvas References
  // =========================================================================
  const appShell = document.getElementById('app-shell');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const stageWrap = document.getElementById('stage-wrap');
  const radarHud = document.getElementById('radar-hud');
  const radarCanvas = document.getElementById('radar-canvas');
  const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;

  const hudWaveCell = document.querySelector('.hud-wave');
  const hudWave = document.getElementById('hud-wave');
  const hudScore = document.getElementById('hud-score');
  const hudHealthLabel = document.getElementById('hud-health-label');
  const hudHealth = document.getElementById('hud-health');
  const hudP2Cell = document.getElementById('hud-p2-cell');
  const hudHealthP2 = document.getElementById('hud-health-p2');
  const hudPing = document.getElementById('hud-ping');
  const btnMute = document.getElementById('btn-mute');
  const btnPause = document.getElementById('btn-pause');
  const btnSettings = document.getElementById('btn-settings');
  const btnTouchToggle = document.getElementById('btn-touch-toggle');
  const btnRestartHud = document.getElementById('btn-restart-hud');
  const radarLabel = document.getElementById('radar-label');
  const bossBanner = document.getElementById('boss-banner');
  const bossBannerTitle = document.getElementById('boss-banner-title');
  const bossBannerSub = document.getElementById('boss-banner-sub');

  const screenStart = document.getElementById('screen-start');
  const screenComms = document.getElementById('screen-comms');
  const screenIntel = document.getElementById('screen-intel');
  const screenSettings = document.getElementById('screen-settings');
  const screenPause = document.getElementById('screen-pause');
  const pauseSectorInfo = document.getElementById('pause-sector-info');
  const pauseScore = document.getElementById('pause-score');
  const pauseEnemies = document.getElementById('pause-enemies');
  const btnPauseResume = document.getElementById('btn-pause-resume');
  const btnPauseSettings = document.getElementById('btn-pause-settings');
  const btnPauseRestart = document.getElementById('btn-pause-restart');
  const btnPauseMenu = document.getElementById('btn-pause-menu');
  const screenGameOver = document.getElementById('screen-gameover');
  const screenVictory = document.getElementById('screen-victory');

  const btnStart = document.getElementById('btn-start');
  const btnIntel = document.getElementById('btn-intel');
  const btnIntelX = document.getElementById('btn-intel-x');
  const btnIntelClose = document.getElementById('btn-intel-close');
  const btnSettingsX = document.getElementById('btn-settings-x');
  const btnSettingsClose = document.getElementById('btn-settings-close');
  const btnSettingsMenu = document.getElementById('btn-settings-menu');
  const tabSettingsGeneral = document.getElementById('tab-settings-general');
  const tabSettingsLiveries = document.getElementById('tab-settings-liveries');
  const panelSettingsGeneral = document.getElementById('panel-settings-general');
  const panelSettingsLiveries = document.getElementById('panel-settings-liveries');
  const liveryActiveName = document.getElementById('livery-active-name');
  const liveryCardOlive = document.getElementById('livery-card-olive');
  const liveryCardDesert = document.getElementById('livery-card-desert');
  const liveryCardUrban = document.getElementById('livery-card-urban');
  const liveryCardArctic = document.getElementById('livery-card-arctic');
  const btnToggleMusic = document.getElementById('btn-toggle-music');
  const btnToggleSfx = document.getElementById('btn-toggle-sfx');
  const musicStateLabel = document.getElementById('music-state-label');
  const sfxStateLabel = document.getElementById('sfx-state-label');
  const sliderUiOpacity = document.getElementById('slider-ui-opacity');
  const settingsOpacityVal = document.getElementById('settings-opacity-val');
  const btnRestartGameOver = document.getElementById('btn-restart-gameover');
  const btnRestartVictory = document.getElementById('btn-restart-victory');
  const btnMenuGameOver = document.getElementById('btn-menu-gameover');
  const btnMenuVictory = document.getElementById('btn-menu-victory');
  const mode1pBtn = document.getElementById('mode-1p');
  const mode2pBtn = document.getElementById('mode-2p');
  const modeOmniBtn = document.getElementById('mode-omni');
  const modeTankBtn = document.getElementById('mode-tank');

  // Tactical Comms Link Modal Controls
  const btnCommsX = document.getElementById('btn-comms-x');
  const commsModeDuelBtn = document.getElementById('comms-mode-duel');
  const commsModeCoopBtn = document.getElementById('comms-mode-coop');
  const commsStatusBar = document.getElementById('comms-status-bar');
  const commsStatusBadge = document.getElementById('comms-status-badge');
  const commsRttEl = document.getElementById('comms-rtt');
  const tabCommsHost = document.getElementById('tab-comms-host');
  const tabCommsJoin = document.getElementById('tab-comms-join');
  const panelCommsHost = document.getElementById('panel-comms-host');
  const panelCommsJoin = document.getElementById('panel-comms-join');
  const btnHostGen = document.getElementById('btn-host-gen');
  const commsHostQrWrap = document.getElementById('comms-host-qr-wrap');
  const commsHostQr = document.getElementById('comms-host-qr');
  const outputHostOffer = document.getElementById('output-host-offer');
  const btnHostCopy = document.getElementById('btn-host-copy');
  const btnHostShare = document.getElementById('btn-host-share');
  const inputHostAnswer = document.getElementById('input-host-answer');
  const btnHostPaste = document.getElementById('btn-host-paste');
  const btnHostLink = document.getElementById('btn-host-link');
  const inputJoinOffer = document.getElementById('input-join-offer');
  const btnJoinPaste = document.getElementById('btn-join-paste');
  const btnJoinGen = document.getElementById('btn-join-gen');
  const commsJoinQrWrap = document.getElementById('comms-join-qr-wrap');
  const commsJoinQr = document.getElementById('comms-join-qr');
  const outputJoinAnswer = document.getElementById('output-join-answer');
  const btnJoinCopy = document.getElementById('btn-join-copy');
  const btnJoinShare = document.getElementById('btn-join-share');
  const btnCommsLaunch = document.getElementById('btn-comms-launch');
  const btnLocalSplit = document.getElementById('btn-local-split');

  const statLifetimeBest = document.getElementById('stat-lifetime-best');
  const statLifetimeKills = document.getElementById('stat-lifetime-kills');
  const statLifetimeWaves = document.getElementById('stat-lifetime-waves');
  const statLifetimeDeaths = document.getElementById('stat-lifetime-deaths');

  const gameoverC2Code = document.getElementById('gameover-c2-code');
  const gameoverC2Status = document.getElementById('gameover-c2-status');
  const gameoverTitle = document.getElementById('gameover-title');
  const gameoverSubtitle = document.getElementById('gameover-subtitle');
  const overWave = document.getElementById('over-wave');
  const overScore = document.getElementById('over-score');
  const overKills = document.getElementById('over-kills');

  const victoryC2Code = document.getElementById('victory-c2-code');
  const victoryC2Status = document.getElementById('victory-c2-status');
  const victoryTitle = document.getElementById('victory-title');
  const victorySubtitle = document.getElementById('victory-subtitle');
  const winScore = document.getElementById('win-score');
  const winHp = document.getElementById('win-hp');
  const winKills = document.getElementById('win-kills');

  const touchDeck = document.getElementById('touch-deck');
  const touchZoneLeft = document.getElementById('touch-zone-left');
  const touchZoneRight = document.getElementById('touch-zone-right');
  const driveStickBase = document.getElementById('drive-stick-base');
  const driveStickKnob = document.getElementById('drive-stick-knob');
  const aimStickBase = document.getElementById('aim-stick-base');
  const aimStickKnob = document.getElementById('aim-stick-knob');
  const aimReloadRing = document.getElementById('aim-reload-ring');

  const touchDeckP2 = document.getElementById('touch-deck-p2');
  const touchZoneP2Left = document.getElementById('touch-zone-p2-left');
  const touchZoneP2Right = document.getElementById('touch-zone-p2-right');
  const p2DriveStickBase = document.getElementById('p2-drive-stick-base');
  const p2DriveStickKnob = document.getElementById('p2-drive-stick-knob');
  const p2AimStickBase = document.getElementById('p2-aim-stick-base');
  const p2AimStickKnob = document.getElementById('p2-aim-stick-knob');
  const p2AimReloadRing = document.getElementById('p2-aim-reload-ring');

  const sfx = new SoundEngine();

  const LIVERY_CATALOG = {
    olive: {
      id: 'olive',
      label: 'OLIVE DRAB',
      camoMode: 'woodland',
      camoA: '#3d452c',
      camoB: '#736c4d',
      opticColor: '#84cc16',
      palette: {
        hullDark: '#444b31',
        hull: '#5a6342',
        era: '#8b7e5e',
        turretDark: '#4d5538',
        turret: '#68724d',
        barrelDark: '#3b412a',
        barrel: '#8b7e5e',
        accent: '#b5a782',
        seam: '#2b301f',
      },
    },
    desert: {
      id: 'desert',
      label: 'DESERT SAND',
      camoMode: 'desert',
      camoA: '#6e583b',
      camoB: '#c5ae83',
      opticColor: '#f59e0b',
      palette: {
        hullDark: '#7a6646',
        hull: '#9b835b',
        era: '#b8a074',
        turretDark: '#87714e',
        turret: '#aa9066',
        barrelDark: '#5e4e35',
        barrel: '#b59f75',
        accent: '#d6c196',
        seam: '#473a27',
      },
    },
    urban: {
      id: 'urban',
      label: 'URBAN SPLINTER',
      camoMode: 'splinter',
      camoA: '#2a313a',
      camoB: '#788494',
      opticColor: '#38bdf8',
      palette: {
        hullDark: '#353d47',
        hull: '#4b5563',
        era: '#64748b',
        turretDark: '#3d4652',
        turret: '#586474',
        barrelDark: '#262c34',
        barrel: '#7c899b',
        accent: '#94a3b8',
        seam: '#1e242b',
      },
    },
    arctic: {
      id: 'arctic',
      label: 'ARCTIC FROST',
      camoMode: 'arctic',
      camoA: '#5c6b7a',
      camoB: '#dbe4ed',
      opticColor: '#22d3ee',
      palette: {
        hullDark: '#7b8996',
        hull: '#a3b1be',
        era: '#cbd5e1',
        turretDark: '#8a99a8',
        turret: '#b8c5d1',
        barrelDark: '#556270',
        barrel: '#cbd5e1',
        accent: '#e2e8f0',
        seam: '#3b4652',
      },
    },
  };

  const liveryCards = {
    olive: liveryCardOlive,
    desert: liveryCardDesert,
    urban: liveryCardUrban,
    arctic: liveryCardArctic,
  };

  const SETTINGS_KEY = 'ricochet_tanks_settings_v1';
  let userSettings = loadSettings();
  let activeSettingsTab = 'general';

  function getLiveryConfig(id) {
    return LIVERY_CATALOG[id] || LIVERY_CATALOG.olive;
  }

  function loadSettings() {
    const defaults = { sfxEnabled: true, musicEnabled: true, uiOpacity: 100, livery: 'olive' };
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const livery = LIVERY_CATALOG[parsed.livery] ? parsed.livery : 'olive';
      return {
        sfxEnabled: parsed.sfxEnabled !== false,
        musicEnabled: parsed.musicEnabled !== false,
        uiOpacity: clamp(Math.round(Number(parsed.uiOpacity) || 100), 25, 100),
        livery,
      };
    } catch (_) {
      return defaults;
    }
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings));
    } catch (_) {
      // Ignore storage quota or private-mode errors
    }
  }

  function switchSettingsTab(tabKey) {
    activeSettingsTab = tabKey === 'liveries' ? 'liveries' : 'general';
    const isLiveries = activeSettingsTab === 'liveries';
    if (tabSettingsGeneral) {
      tabSettingsGeneral.classList.toggle('active', !isLiveries);
      tabSettingsGeneral.setAttribute('aria-selected', String(!isLiveries));
    }
    if (tabSettingsLiveries) {
      tabSettingsLiveries.classList.toggle('active', isLiveries);
      tabSettingsLiveries.setAttribute('aria-selected', String(isLiveries));
    }
    if (panelSettingsGeneral) panelSettingsGeneral.classList.toggle('hidden', isLiveries);
    if (panelSettingsLiveries) panelSettingsLiveries.classList.toggle('hidden', !isLiveries);
    if (isLiveries) {
      renderLiveryPreviews();
    }
  }

  function applySettings() {
    sfx.setSfxEnabled(userSettings.sfxEnabled);
    sfx.setMusicEnabled(userSettings.musicEnabled);

    const opacityNum = clamp(userSettings.uiOpacity, 25, 100);
    const opacityAlpha = opacityNum / 100;
    if (typeof state !== 'undefined') {
      state.uiOpacity = opacityAlpha;
    }
    if (appShell) {
      appShell.style.setProperty('--tac-ui-opacity', String(opacityAlpha));
    }

    if (btnMute) {
      btnMute.textContent = userSettings.sfxEnabled ? 'SFX' : 'MUTE';
      btnMute.classList.toggle('muted', !userSettings.sfxEnabled);
    }
    if (btnToggleMusic) {
      btnToggleMusic.classList.toggle('on', userSettings.musicEnabled);
      btnToggleMusic.setAttribute('aria-checked', String(userSettings.musicEnabled));
    }
    if (musicStateLabel) {
      musicStateLabel.textContent = userSettings.musicEnabled ? 'ON' : 'OFF';
    }
    if (btnToggleSfx) {
      btnToggleSfx.classList.toggle('on', userSettings.sfxEnabled);
      btnToggleSfx.setAttribute('aria-checked', String(userSettings.sfxEnabled));
    }
    if (sfxStateLabel) {
      sfxStateLabel.textContent = userSettings.sfxEnabled ? 'ON' : 'OFF';
    }
    if (sliderUiOpacity) {
      sliderUiOpacity.value = String(opacityNum);
    }
    if (settingsOpacityVal) {
      settingsOpacityVal.textContent = `${opacityNum}%`;
    }

    const activeLivery = getLiveryConfig(userSettings.livery);
    if (liveryActiveName) {
      liveryActiveName.textContent = activeLivery.label;
    }
    const liveryKeys = Object.keys(liveryCards);
    for (let i = 0; i < liveryKeys.length; i++) {
      const key = liveryKeys[i];
      const card = liveryCards[key];
      if (!card) continue;
      const isSelected = key === activeLivery.id;
      card.classList.toggle('active', isSelected);
      card.setAttribute('aria-checked', String(isSelected));
    }
    renderLiveryPreviews();
  }

  function openSettingsModal() {
    if (!screenSettings) return;
    state.settingsOpen = true;
    state.keys = Object.create(null);
    state.mouse.down = false;
    state.touch.canvasAimDown = false;
    state.touch.canvasTouchId = null;
    resetDriveStick();
    resetAimStick(false);
    resetP2DriveStick();
    resetP2AimStick(false);
    applySettings();
    switchSettingsTab(activeSettingsTab);
    screenSettings.classList.remove('hidden');
  }

  function closeSettingsModal() {
    if (!screenSettings) return;
    state.settingsOpen = false;
    screenSettings.classList.add('hidden');
  }

  const LIFETIME_STATS_KEY = 'ricochet_tanks_lifetime_stats_v1';
  let lifetimeStats = loadLifetimeStats();

  function loadLifetimeStats() {
    const defaults = { totalKills: 0, wavesCleared: 0, deaths: 0, bestSector: 0 };
    try {
      const raw = window.localStorage.getItem(LIFETIME_STATS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        totalKills: Math.max(0, Math.floor(Number(parsed.totalKills) || 0)),
        wavesCleared: Math.max(0, Math.floor(Number(parsed.wavesCleared) || 0)),
        deaths: Math.max(0, Math.floor(Number(parsed.deaths) || 0)),
        bestSector: Math.max(0, Math.floor(Number(parsed.bestSector) || 0)),
      };
    } catch (_) {
      return defaults;
    }
  }

  function saveLifetimeStats() {
    try {
      window.localStorage.setItem(LIFETIME_STATS_KEY, JSON.stringify(lifetimeStats));
    } catch (_) {
      // Ignore storage quota or private-mode errors
    }
  }

  function renderLifetimeStats() {
    if (statLifetimeBest) {
      statLifetimeBest.textContent = String(lifetimeStats.bestSector || 0).padStart(2, '0');
    }
    if (statLifetimeKills) statLifetimeKills.textContent = String(lifetimeStats.totalKills);
    if (statLifetimeWaves) statLifetimeWaves.textContent = String(lifetimeStats.wavesCleared);
    if (statLifetimeDeaths) statLifetimeDeaths.textContent = String(lifetimeStats.deaths);
  }

  function recordBestSector(sectorNum) {
    if (state.phase === 'start' || state.sessionMode === 'duel') return;
    if (sectorNum > (lifetimeStats.bestSector || 0)) {
      lifetimeStats.bestSector = sectorNum;
      saveLifetimeStats();
      renderLifetimeStats();
    }
  }

  function recordLifetimeKill() {
    if (state.phase === 'start') return;
    lifetimeStats.totalKills += 1;
    saveLifetimeStats();
    renderLifetimeStats();
  }

  function recordLifetimeWaveCleared() {
    if (state.phase === 'start' || state.sessionMode === 'duel') return;
    lifetimeStats.wavesCleared += 1;
    saveLifetimeStats();
    renderLifetimeStats();
  }

  function recordLifetimeDeath() {
    if (state.phase === 'start' || state.sessionMode === 'duel') return;
    lifetimeStats.deaths += 1;
    saveLifetimeStats();
    renderLifetimeStats();
  }

  function setBossBannerVisible(show, bossName = '', subText = '') {
    if (!bossBanner) return;
    if (show) {
      if (bossBannerTitle) bossBannerTitle.textContent = `⚠ HOSTILE COMMAND TANK DETECTED`;
      if (bossBannerSub) bossBannerSub.textContent = subText ? `${bossName} // ${subText}` : bossName;
      bossBanner.classList.remove('hidden');
    } else {
      bossBanner.classList.add('hidden');
    }
  }

  function clearActiveInputs() {
    state.keys = Object.create(null);
    state.mouse.down = false;
    state.touch.canvasAimDown = false;
    state.touch.canvasTouchId = null;
    resetDriveStick();
    resetAimStick(false);
    resetP2DriveStick();
    resetP2AimStick(false);
  }

  function togglePause(forceVal = null, fromRemote = false) {
    if (state.phase !== 'playing' && state.phase !== 'wave_transition') return;
    const nextPaused = forceVal !== null ? Boolean(forceVal) : !state.paused;
    if (nextPaused === state.paused) return;
    state.paused = nextPaused;
    clearActiveInputs();

    if (btnPause) {
      btnPause.classList.toggle('paused', state.paused);
    }

    if (state.paused) {
      sfx.stopMusic();
      const theme = getThemeById(state.themeId);
      const secPad = String(state.sectorNum).padStart(2, '0');
      if (pauseSectorInfo) {
        pauseSectorInfo.textContent =
          state.sessionMode === 'duel'
            ? '1v1 DUEL // PROVING GROUND'
            : `SECTOR ${secPad} // ${theme.name}${state.isBossSector ? ' [BOSS]' : ''}`;
      }
      if (pauseScore) {
        pauseScore.textContent =
          state.sessionMode === 'duel'
            ? `${state.duelScores.p1}:${state.duelScores.p2}`
            : String(state.score).padStart(4, '0');
      }
      if (pauseEnemies) {
        const aliveEn = state.enemies.filter((e) => e.alive).length;
        pauseEnemies.textContent = state.sessionMode === 'duel' ? 'PVP' : String(aliveEn);
      }
      if (btnPauseRestart) {
        btnPauseRestart.textContent =
          state.sessionMode === 'duel' ? 'RESTART DUEL' : `REDEPLOY SECTOR ${secPad}`;
      }
      if (screenPause) screenPause.classList.remove('hidden');
    } else {
      if (screenPause) screenPause.classList.add('hidden');
      sfx.startMusic();
    }

    if (!fromRemote && (state.netMode === 'p2p-host' || state.netMode === 'p2p-client') && peerComms && peerComms.connected) {
      peerComms.sendEvent({ t: 'pause', paused: state.paused });
    }
  }

  function returnToStartMenu() {
    closePeerSession();
    state.phase = 'start';
    state.paused = false;
    state.netMode = 'solo';
    state.sessionMode = state.playerCountPref === 2 ? state.preferred2pMode : '1p';
    state.player2 = null;
    state.settingsOpen = false;
    sfx.stopMusic();
    state.score = 0;
    state.kills = 0;
    state.damageFlash = 0;
    state.popups = [];
    if (appShell) {
      appShell.classList.add('is-home');
      appShell.classList.remove('has-p2-deck');
    }
    if (btnPause) btnPause.classList.remove('paused');
    if (screenPause) screenPause.classList.add('hidden');
    setBossBannerVisible(false);
    if (radarHud) {
      radarHud.classList.add('hidden');
      radarHud.classList.remove('boss-alert');
    }
    if (hudWaveCell) hudWaveCell.classList.remove('boss-sector');
    if (hudPing) hudPing.classList.add('hidden');
    if (hudP2Cell) hudP2Cell.classList.add('hidden');
    if (screenComms) screenComms.classList.add('hidden');
    if (screenIntel) screenIntel.classList.add('hidden');
    if (screenSettings) screenSettings.classList.add('hidden');
    screenGameOver.classList.add('hidden');
    screenVictory.classList.add('hidden');
    initAttractSkirmish();
    renderLifetimeStats();
    screenStart.classList.remove('hidden');
    syncTouchDeckVisibility();
    resizeCanvas();
  }

  // Offscreen static compound floor buffer + persistent scorch crater decal buffer
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = ARENA_W * 2;
  floorCanvas.height = ARENA_H * 2;
  const floorCtx = floorCanvas.getContext('2d');

  const decalCanvas = document.createElement('canvas');
  decalCanvas.width = ARENA_W * 2;
  decalCanvas.height = ARENA_H * 2;
  const decalCtx = decalCanvas.getContext('2d');

  const state = {
    phase: 'start', // 'start' | 'playing' | 'wave_transition' | 'gameover' | 'victory'
    paused: false,
    settingsOpen: false,
    uiOpacity: userSettings.uiOpacity / 100,
    driveMode: 'omni', // 'omni' | 'tank'
    playerCountPref: 1, // 1 | 2 (Home screen toggle)
    preferred2pMode: 'duel', // 'duel' | 'coop' (Comms lobby toggle)
    sessionMode: '1p', // '1p' | 'duel' | 'coop'
    netMode: 'solo', // 'solo' | 'p2p-host' | 'p2p-client' | 'local-split'
    duelScores: { p1: 0, p2: 0 },
    waveIndex: 0,
    sectorNum: 1,
    themeId: 'concrete_fob',
    isBossSector: false,
    bossType: null,
    bossName: '',
    bossBannerTimer: 0,
    sectorsSinceLastBoss: 0,
    lastBossType: null,
    currentSectorSpec: null,
    score: 0,
    kills: 0,
    transitionTimer: 0,
    gameOverDelay: 0,
    shakeTime: 0,
    shakeDuration: 0.001,
    shakeIntensity: 0,
    shakeDirX: 0,
    shakeDirY: 0,
    damageFlash: 0,
    damageFlashDuration: 0.24,
    damageFlashIntensity: 1.0,

    stones: [],
    deflectors: [],
    crates: [],
    mines: [],
    tempBarriers: [],
    powerUps: [],
    treadMarks: [],
    cratesSinceLastDrop: 0,
    lastDropType: null,
    player: null,
    player2: null,
    enemies: [],
    bullets: [],
    popups: [],
    nextBulletId: 1,

    p2Input: {
      mx: 0,
      my: 0,
      tankSteer: false,
      aimA: Math.PI / 2,
      aimOn: false,
      fireHeld: false,
      fireQueued: 0,
    },
    netTarget: null,
    netSyncAccum: 0,
    netInputAccum: 0,
    netSeq: 0,
    lastRecvSeq: -1,
    pingMs: null,

    keys: Object.create(null),
    mouse: { x: ARENA_W * 0.5, y: ARENA_H * 0.35, down: false, active: false },
    touch: {
      enabled: true,
      moveX: 0,
      moveY: 0,
      driveTouchId: null,
      driveMouseActive: false,
      driveOriginX: 0,
      driveOriginY: 0,
      aimTouchId: null,
      aimMouseActive: false,
      aimOriginX: 0,
      aimOriginY: 0,
      aimActive: false,
      aimArmed: false,
      aimAngle: -Math.PI / 2,
      hasCustomAim: false,
      fireReleaseQueued: 0,
      canvasTouchId: null,
      canvasAimDown: false,
      lastTouchTime: 0,
    },
    p2Touch: {
      moveX: 0,
      moveY: 0,
      driveTouchId: null,
      driveOriginX: 0,
      driveOriginY: 0,
      aimTouchId: null,
      aimOriginX: 0,
      aimOriginY: 0,
      aimActive: false,
      aimArmed: false,
      aimAngle: Math.PI / 2,
      hasCustomAim: false,
      fireReleaseQueued: 0,
    },
    renderScaleX: 1,
    renderScaleY: 1,
    dpr: 1,
  };

  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
      const r = Array.isArray(radii) ? radii[0] : (radii || 0);
      const radius = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) * 0.5));
      this.moveTo(x + radius, y);
      this.lineTo(x + w - radius, y);
      this.quadraticCurveTo(x + w, y, x + w, y + radius);
      this.lineTo(x + w, y + h - radius);
      this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      this.lineTo(x + radius, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - radius);
      this.lineTo(x, y + radius);
      this.quadraticCurveTo(x, y, x + radius, y);
      this.closePath();
      return this;
    };
  }

  function getThemeById(themeId) {
    for (let i = 0; i < TERRAIN_THEMES.length; i++) {
      if (TERRAIN_THEMES[i].id === themeId) return TERRAIN_THEMES[i];
    }
    return TERRAIN_THEMES[0];
  }

  // =========================================================================
  // Procedural Asphalt & Reinforced Concrete Compound Floor Baking (5 Themes)
  // =========================================================================
  function bakeCompoundFloor(sectorNum = 1, themeId = 'concrete_fob', isBoss = false) {
    const c = floorCtx;
    c.setTransform(2, 0, 0, 2, 0, 0);
    const rng = createRng(4099 + sectorNum * 131);
    const theme = getThemeById(themeId);

    // Base weathered asphalt / tarmac / basalt
    c.fillStyle = theme.base;
    c.fillRect(0, 0, ARENA_W, ARENA_H);

    // Concrete / plated apron slabs in central compound zones
    c.fillStyle = theme.apron;
    c.fillRect(TILE * 2, TILE * 3, ARENA_W - TILE * 4, ARENA_H - TILE * 6);

    // Poured expansion slab joints
    c.strokeStyle = theme.seam;
    c.lineWidth = 1.5;
    for (let x = TILE * 2; x <= ARENA_W - TILE * 2; x += TILE * 2) {
      c.beginPath();
      c.moveTo(x, TILE);
      c.lineTo(x, ARENA_H - TILE);
      c.stroke();
    }
    for (let y = TILE * 3; y <= ARENA_H - TILE * 3; y += TILE * 2) {
      c.beginPath();
      c.moveTo(TILE, y);
      c.lineTo(ARENA_W - TILE, y);
      c.stroke();
    }

    // Fine aggregate grain & weathering patches
    for (let i = 0; i < 1600; i++) {
      const gx = rng() * ARENA_W;
      const gy = rng() * ARENA_H;
      const sz = 0.8 + rng() * 1.4;
      c.fillStyle = rng() > 0.5 ? 'rgba(255, 255, 255, 0.032)' : 'rgba(0, 0, 0, 0.14)';
      c.fillRect(gx, gy, sz, sz);
    }

    // Subtle oil & wear blotches
    for (let i = 0; i < 22; i++) {
      const ox = TILE * 1.5 + rng() * (ARENA_W - TILE * 3);
      const oy = TILE * 1.5 + rng() * (ARENA_H - TILE * 3);
      const orad = 14 + rng() * 34;
      c.fillStyle = 'rgba(10, 12, 15, 0.17)';
      c.beginPath();
      c.arc(ox, oy, orad, 0, Math.PI * 2);
      c.fill();
    }

    // Hairline fracture lines
    c.strokeStyle = 'rgba(12, 14, 17, 0.35)';
    c.lineWidth = 0.9;
    for (let i = 0; i < 14; i++) {
      let cx = TILE * 1.5 + rng() * (ARENA_W - TILE * 3);
      let cy = TILE * 1.5 + rng() * (ARENA_H - TILE * 3);
      c.beginPath();
      c.moveTo(cx, cy);
      for (let s = 0; s < 4; s++) {
        cx += (rng() - 0.5) * 26;
        cy += (rng() - 0.5) * 26;
        c.lineTo(cx, cy);
      }
      c.stroke();
    }

    // Faint tactical sector grid lines
    c.strokeStyle = theme.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = TILE; x < ARENA_W; x += TILE) {
      c.moveTo(x, TILE);
      c.lineTo(x, ARENA_H - TILE);
    }
    for (let y = TILE; y < ARENA_H; y += TILE) {
      c.moveTo(TILE, y);
      c.lineTo(ARENA_W - TILE, y);
    }
    c.stroke();

    // Compound perimeter stripe (shifts crimson during Boss Intercepts)
    c.strokeStyle = isBoss ? 'rgba(239, 68, 68, 0.28)' : theme.stripe;
    c.lineWidth = 2;
    c.setLineDash([12, 10]);
    c.strokeRect(TILE + 8, TILE + 8, ARENA_W - (TILE + 8) * 2, ARENA_H - (TILE + 8) * 2);
    c.setLineDash([]);

    if (isBoss) {
      // Subtle crimson tactical threat vignette at arena perimeter
      const bossVig = c.createRadialGradient(ARENA_W * 0.5, ARENA_H * 0.45, 90, ARENA_W * 0.5, ARENA_H * 0.5, ARENA_H * 0.65);
      bossVig.addColorStop(0, 'rgba(127, 29, 29, 0)');
      bossVig.addColorStop(1, 'rgba(127, 29, 29, 0.16)');
      c.fillStyle = bossVig;
      c.fillRect(0, 0, ARENA_W, ARENA_H);
    }

    // Center compound tactical circle & crosshairs
    c.strokeStyle = isBoss ? 'rgba(239, 68, 68, 0.14)' : theme.circle;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(ARENA_W * 0.5, ARENA_H * 0.5, 58, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(ARENA_W * 0.5, ARENA_H * 0.5, 10, 0, Math.PI * 2);
    c.stroke();

    // Worn stencil labels
    const secStr = String(sectorNum).padStart(2, '0');
    c.fillStyle = isBoss ? 'rgba(248, 113, 113, 0.16)' : theme.stencil;
    c.font = '800 11px ui-monospace, SFMono-Regular, Menlo, sans-serif';
    c.textAlign = 'left';
    c.fillText(`SEC-${secStr} // ${theme.name}`, TILE + 14, TILE + 24);
    c.textAlign = 'right';
    c.fillText(isBoss ? 'BOSS INTERCEPT' : theme.footer, ARENA_W - TILE - 14, ARENA_H - TILE - 14);

    // Friendly staging pad chevron near bottom player spawn
    c.strokeStyle = 'rgba(132, 204, 22, 0.16)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ARENA_W * 0.5 - 18, ARENA_H - TILE * 2.5 + 8);
    c.lineTo(ARENA_W * 0.5, ARENA_H - TILE * 2.5 - 6);
    c.lineTo(ARENA_W * 0.5 + 18, ARENA_H - TILE * 2.5 + 8);
    c.stroke();
  }

  function clearDecals() {
    decalCtx.setTransform(1, 0, 0, 1, 0, 0);
    decalCtx.clearRect(0, 0, decalCanvas.width, decalCanvas.height);
  }

  function stampScorchCrater(x, y, radius = 26) {
    const c = decalCtx;
    c.save();
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.translate(x, y);

    // Outer blast soot halo
    const grad = c.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius);
    grad.addColorStop(0, 'rgba(8, 9, 11, 0.86)');
    grad.addColorStop(0.45, 'rgba(18, 20, 24, 0.62)');
    grad.addColorStop(0.8, 'rgba(24, 27, 31, 0.25)');
    grad.addColorStop(1, 'rgba(24, 27, 31, 0)');
    c.fillStyle = grad;
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.fill();

    // Inner crater pit rim & radial fracture lines
    c.strokeStyle = 'rgba(9, 10, 12, 0.72)';
    c.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + (Math.random() - 0.5) * 0.3;
      const len = radius * (0.55 + Math.random() * 0.45);
      c.beginPath();
      c.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      c.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      c.stroke();
    }

    // Warm dark ash core
    c.fillStyle = 'rgba(42, 34, 28, 0.55)';
    c.beginPath();
    c.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function addTreadMark(x, y, angle) {
    if (state.treadMarks.length >= 240) {
      state.treadMarks.shift();
    }
    state.treadMarks.push({
      x,
      y,
      angle,
      life: 4.5,
      maxLife: 4.5,
    });
  }

  // =========================================================================
  // Responsive High-DPI Canvas Sizing
  // =========================================================================
  function syncTouchDeckVisibility() {
    const showP2SplitDeck =
      state.phase !== 'start' && state.netMode === 'local-split' && state.touch.enabled;
    if (appShell) {
      appShell.classList.toggle('has-p2-deck', showP2SplitDeck);
    }
    if (touchDeckP2) {
      touchDeckP2.classList.toggle('visible', showP2SplitDeck);
      touchDeckP2.classList.toggle('hidden', !showP2SplitDeck);
    }

    if (state.phase === 'start') {
      touchDeck.classList.remove('visible');
      btnTouchToggle.textContent = state.touch.enabled ? 'PAD ON' : 'PAD';
      resizeCanvas();
      return;
    }
    if (state.touch.enabled) {
      touchDeck.classList.add('visible');
      btnTouchToggle.textContent = 'PAD ON';
    } else {
      touchDeck.classList.remove('visible');
      btnTouchToggle.textContent = 'PAD';
    }
    resizeCanvas();
  }

  let lastDisplayW = 0;
  let lastDisplayH = 0;
  let lastDpr = 0;
  let lastIsHome = null;

  function resizeCanvas() {
    const isHome = state.phase === 'start';
    const wrapRect = stageWrap.getBoundingClientRect();
    let displayW;
    let displayH;

    if (isHome) {
      displayW = Math.max(200, Math.floor(wrapRect.width));
      displayH = Math.max(240, Math.floor(wrapRect.height));
    } else {
      const availW = Math.max(200, wrapRect.width - 8);
      const availH = Math.max(240, wrapRect.height - 8);

      const aspect = ARENA_W / ARENA_H;
      displayW = availW;
      displayH = displayW / aspect;
      if (displayH > availH) {
        displayH = availH;
        displayW = displayH * aspect;
      }

      displayW = Math.floor(displayW);
      displayH = Math.floor(displayH);
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);

    if (displayW === lastDisplayW && displayH === lastDisplayH && dpr === lastDpr && isHome === lastIsHome) {
      return;
    }
    lastDisplayW = displayW;
    lastDisplayH = displayH;
    lastDpr = dpr;
    lastIsHome = isHome;

    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);

    state.dpr = dpr;
    state.displayW = displayW;
    state.displayH = displayH;
    state.renderScaleX = displayW / ARENA_W;
    state.renderScaleY = displayH / ARENA_H;

    if (radarCanvas && radarHud) {
      const rSize = radarHud.clientWidth || 86;
      radarCanvas.width = Math.round(rSize * dpr);
      radarCanvas.height = Math.round(rSize * dpr);
    }
  }

  function clientToArena(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * ARENA_W;
    const y = ((clientY - rect.top) / rect.height) * ARENA_H;
    return {
      x: clamp(x, 0, ARENA_W),
      y: clamp(y, 0, ARENA_H),
    };
  }

  // =========================================================================
  // Wave & Entity Setup
  // =========================================================================
  const POWERUP_DEFS = {
    rapid: {
      type: 'rapid',
      label: 'AUTOLOADER!',
      short: 'RAPID',
      duration: 8.5,
      color: '#0ea5e9',
      accent: '#bae6fd',
      glow: 'rgba(14, 165, 233, 0.32)',
    },
    spread: {
      type: 'spread',
      label: 'CANISTER 3X!',
      short: 'SPREAD',
      duration: 9.0,
      color: '#f59e0b',
      accent: '#fef08a',
      glow: 'rgba(245, 158, 11, 0.34)',
    },
    turbo: {
      type: 'turbo',
      label: 'OVERDRIVE!',
      short: 'TURBO',
      duration: 8.0,
      color: '#84cc16',
      accent: '#ecfccb',
      glow: 'rgba(132, 204, 22, 0.32)',
    },
  };

  function createPlayer(x, y, preserveHp = MAX_HP, prevBuffs = null, initialAngle = -Math.PI / 2) {
    return {
      x,
      y,
      radius: PLAYER_RADIUS,
      hullAngle: initialAngle,
      turretAngle: initialAngle,
      speed: 175,
      hp: preserveHp,
      alive: true,
      fireCooldown: 0,
      lastFireInterval: 0.28,
      recoil: 0,
      invulnTimer: 0.9,
      treadPhase: 0,
      treadDistAccum: 0,
      antennaSway: 0,
      buffs: prevBuffs
        ? { rapid: prevBuffs.rapid || 0, spread: prevBuffs.spread || 0, turbo: prevBuffs.turbo || 0 }
        : { rapid: 0, spread: 0, turbo: 0 },
    };
  }

  const BOSS_DEFS = {
    boss_juggernaut: {
      code: 'J',
      name: 'JUGGERNAUT HEAVY',
      sub: 'HEAVY REACTIVE ARMOR // TWIN BURST CANNON',
    },
    boss_sniper: {
      code: 'S',
      name: 'RICOCHET SNIPER',
      sub: 'STEALTH CHASSIS // 2-BOUNCE BANK LASER',
    },
    boss_vanguard: {
      code: 'V',
      name: 'VANGUARD ASSAULT',
      sub: 'DEPLOYABLE BARRIERS & PROXIMITY MINES',
    },
  };

  function isTileSolidForBfs(ch, treatCratesAsBlocked) {
    if (ch === '#' || ch === '1' || ch === '2' || ch === '3' || ch === '4') return true;
    if (treatCratesAsBlocked && ch === 'W') return true;
    return false;
  }

  function validateSectorConnectivity(grid) {
    const startR = 19;
    const startC = 6;
    if (grid[startR][startC] !== 'P') return false;

    // Guarantee open staging pocket around player spawns (P1 & P2 Co-Op)
    for (let rr = 18; rr <= 20; rr++) {
      for (let cc = 5; cc <= 8; cc++) {
        const ch = grid[rr][cc];
        if (ch !== '.' && ch !== 'P') return false;
      }
    }

    const targets = [];
    const crateCoords = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const ch = grid[r][c];
        if ('TEHCJSV'.includes(ch)) targets.push([r, c]);
        if (ch === 'W') crateCoords.push([r, c]);
      }
    }
    if (targets.length === 0) return false;

    const runBfs = (blockCrates) => {
      const visited = new Uint8Array(ROWS * COLS);
      const queue = [[startR, startC]];
      visited[startR * COLS + startC] = 1;
      let head = 0;
      let openCount = 0;
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      while (head < queue.length) {
        const [r, c] = queue[head++];
        openCount++;
        for (let d = 0; d < 4; d++) {
          const nr = r + dirs[d][0];
          const nc = c + dirs[d][1];
          if (nr <= 0 || nr >= ROWS - 1 || nc <= 0 || nc >= COLS - 1) continue;
          const idx = nr * COLS + nc;
          if (visited[idx]) continue;
          const ch = grid[nr][nc];
          if (isTileSolidForBfs(ch, blockCrates)) continue;
          visited[idx] = 1;
          queue.push([nr, nc]);
        }
      }
      return { visited, openCount };
    };

    // 1. Every enemy MUST be strictly reachable without even breaking crates (open firing/maneuver lanes)
    const strict = runBfs(true);
    if (strict.openCount < 110) return false;
    for (let i = 0; i < targets.length; i++) {
      const [tr, tc] = targets[i];
      if (!strict.visited[tr * COLS + tc]) return false;
      // Verify enemy isn't boxed in (< 2 open adjacent cells)
      let adj = 0;
      if (!isTileSolidForBfs(grid[tr - 1][tc], true)) adj++;
      if (!isTileSolidForBfs(grid[tr + 1][tc], true)) adj++;
      if (!isTileSolidForBfs(grid[tr][tc - 1], true)) adj++;
      if (!isTileSolidForBfs(grid[tr][tc + 1], true)) adj++;
      if (adj < 2) return false;
    }

    // 2. Every crate must be reachable (by treating crates as reachable endpoints)
    const withCrates = runBfs(false);
    for (let i = 0; i < crateCoords.length; i++) {
      const [wr, wc] = crateCoords[i];
      if (!withCrates.visited[wr * COLS + wc]) return false;
    }

    return true;
  }

  function generateProceduralSector(sectorNum, opts = {}) {
    const theme = TERRAIN_THEMES[Math.floor((sectorNum - 1) / 2) % TERRAIN_THEMES.length];

    // Strict Boss Intercept Rule:
    // Sectors 01-03: NEVER spawn a boss.
    // Sector 04+: 30% chance OR guaranteed if 4 sectors passed since last boss.
    let isBoss = false;
    let bossType = null;
    let bossName = '';
    if (opts.forceBoss !== undefined) {
      isBoss = Boolean(opts.forceBoss);
    } else if (sectorNum >= 4) {
      isBoss = state.sectorsSinceLastBoss >= 4 || Math.random() < 0.30;
    }

    if (isBoss) {
      const bossPool = ['boss_juggernaut', 'boss_sniper', 'boss_vanguard'];
      const filtered =
        opts.bossType ||
        bossPool.filter((bt) => bt !== state.lastBossType);
      const chosenPool = Array.isArray(filtered) && filtered.length > 0 ? filtered : bossPool;
      bossType =
        typeof opts.bossType === 'string' && BOSS_DEFS[opts.bossType]
          ? opts.bossType
          : chosenPool[Math.floor(Math.random() * chosenPool.length)];
      bossName = BOSS_DEFS[bossType].name;
    }

    const baseSeed = opts.seed !== undefined ? opts.seed : (Math.floor(Math.random() * 0x7fffffff) ^ (sectorNum * 2654435761)) >>> 0;

    for (let attempt = 0; attempt < 26; attempt++) {
      const rng = createRng((baseSeed + attempt * 7919) >>> 0);
      const cells = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? '#' : '.'))
      );

      const mirrorSet = (r, c, ch, mirrorCh = null) => {
        if (r <= 1 || r >= ROWS - 2 || c <= 0 || c >= COLS - 1) return;
        cells[r][c] = ch;
        const mc = COLS - 1 - c;
        cells[r][mc] = mirrorCh || ch;
      };

      const mirrorDeflector = (r, c, kind) => {
        const flip = kind === '1' ? '2' : kind === '2' ? '1' : kind === '3' ? '4' : '3';
        mirrorSet(r, c, kind, flip);
      };

      // Place symmetrical concrete Jersey-barrier clusters across upper/mid/lower tiers
      const bandRows = [3, 6, 9, 12, 15, 17];
      for (let bi = 0; bi < bandRows.length; bi++) {
        const br = bandRows[bi];
        const pattern = Math.floor(rng() * 5);
        if (pattern === 0) {
          //Twin flanking bar + optional deflector wing
          const cStart = 2 + Math.floor(rng() * 2);
          mirrorSet(br, cStart, '#');
          mirrorSet(br, cStart + 1, '#');
          if (rng() < 0.72) {
            mirrorDeflector(br, cStart + 2, br < 10 ? '1' : '3');
          }
        } else if (pattern === 1) {
          // Central split pillbox
          mirrorSet(br, 5, '#');
          if (rng() < 0.55) mirrorSet(br, 6, '#');
          if (rng() < 0.65 && br > 4 && br < 16) {
            mirrorDeflector(br + 1, 4, br < 10 ? '2' : '4');
          }
        } else if (pattern === 2) {
          // Vertical pillar + 45-degree corner reflector
          const cCol = 3 + Math.floor(rng() * 2);
          mirrorSet(br, cCol, '#');
          if (br + 1 < 17) mirrorSet(br + 1, cCol, '#');
          mirrorDeflector(br, cCol - 1, br < 11 ? '2' : '4');
        } else if (pattern === 3) {
          // Angled 45-degree bunker funnel
          const cCol = 2 + Math.floor(rng() * 3);
          mirrorDeflector(br, cCol, br < 10 ? '1' : '3');
          mirrorSet(br, cCol + 1, '#');
        } else {
          // Wide cover line leaving side & center gaps
          mirrorSet(br, 3, '#');
          mirrorSet(br, 4, '#');
        }
      }

      // Ensure at least two crisp 45-degree steel deflectors exist on every procedural sector
      if (rng() < 0.99) {
        mirrorDeflector(4, 2, '1');
        mirrorDeflector(14, 2, '3');
      }

      // Guarantee safe Player spawn corridor
      for (let rr = 17; rr <= 20; rr++) {
        for (let cc = 5; cc <= 8; cc++) {
          if (rr >= 18) cells[rr][cc] = '.';
        }
      }
      cells[19][6] = 'P';

      // Place Destructible Supply Crates ('W') in mid-arena lanes
      let cratesPlaced = 0;
      const targetCrates = 5 + Math.floor(rng() * 4); // 5-8 crates
      for (let tries = 0; tries < 40 && cratesPlaced < targetCrates; tries++) {
        const cr = 4 + Math.floor(rng() * 13);
        const cc = 2 + Math.floor(rng() * 5);
        if (cells[cr][cc] === '.' && cells[cr][COLS - 1 - cc] === '.') {
          if (cr >= 17 && cc >= 4 && cc <= 9) continue;
          cells[cr][cc] = 'W';
          cratesPlaced++;
          if (cratesPlaced < targetCrates && rng() < 0.75) {
            cells[cr][COLS - 1 - cc] = 'W';
            cratesPlaced++;
          }
        }
      }

      // Place Enemies (or Boss + Escorts) in upper tactical zone (rows 2..11)
      const spawnSlots = [];
      for (let r = 2; r <= 11; r++) {
        for (let c = 2; c <= COLS - 3; c++) {
          if (cells[r][c] === '.' && Math.hypot(c - 6, r - 19) >= 7.5) {
            spawnSlots.push([r, c]);
          }
        }
      }

      if (isBoss) {
        // Clear boss command pocket at top-center (r=2..3, c=5..7)
        for (let rr = 2; rr <= 3; rr++) {
          for (let cc = 5; cc <= 7; cc++) {
            cells[rr][cc] = '.';
          }
        }
        cells[2][6] = BOSS_DEFS[bossType].code;

        const escortCount = Math.min(3, 1 + Math.floor(sectorNum / 4));
        let placedEscorts = 0;
        const escortTypes = sectorNum >= 6 ? ['E', 'H', 'T'] : ['T', 'E'];
        for (let tries = 0; tries < 45 && placedEscorts < escortCount; tries++) {
          const slot = spawnSlots[Math.floor(rng() * spawnSlots.length)];
          if (!slot) break;
          const [er, ec] = slot;
          if (cells[er][ec] !== '.' || (er <= 4 && Math.abs(ec - 6) <= 2)) continue;
          cells[er][ec] = escortTypes[Math.floor(rng() * escortTypes.length)];
          placedEscorts++;
        }
      } else {
        const enemyCount = Math.min(7, 3 + Math.floor((sectorNum - 1) * 0.65));
        let pool;
        if (sectorNum === 1) pool = ['T', 'T', 'E'];
        else if (sectorNum === 2) pool = ['E', 'T', 'E', 'H'];
        else if (sectorNum === 3) pool = ['E', 'H', 'T', 'E'];
        else if (sectorNum <= 6) pool = ['E', 'H', 'T', 'C'];
        else pool = ['H', 'C', 'E', 'H', 'T'];

        let placed = 0;
        for (let tries = 0; tries < 60 && placed < enemyCount; tries++) {
          const slot = spawnSlots[Math.floor(rng() * spawnSlots.length)];
          if (!slot) break;
          const [er, ec] = slot;
          if (cells[er][ec] !== '.') continue;
          // Spread enemies so they don't stack directly on top of each other
          let tooClose = false;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if ('TEHCJSV'.includes(cells[er + dr]?.[ec + dc] || '')) tooClose = true;
            }
          }
          if (tooClose) continue;
          cells[er][ec] = pool[placed % pool.length];
          placed++;
        }
      }

      const grid = cells.map((row) => row.join(''));
      if (validateSectorConnectivity(grid)) {
        return {
          number: sectorNum,
          name: theme.name,
          themeId: theme.id,
          isBoss,
          bossType,
          bossName,
          grid,
        };
      }
    }

    // Fallback guaranteed-validated layout if random attempts fail
    const fallbackCells = FALLBACK_SECTOR_GRID.map((row) => row.split(''));
    if (isBoss) {
      fallbackCells[2][2] = 'T';
      fallbackCells[2][11] = 'T';
      fallbackCells[5][2] = '.';
      fallbackCells[5][11] = '.';
      fallbackCells[2][6] = BOSS_DEFS[bossType].code;
    }
    return {
      number: sectorNum,
      name: theme.name,
      themeId: theme.id,
      isBoss,
      bossType,
      bossName,
      grid: fallbackCells.map((row) => row.join('')),
    };
  }

  function createEnemy(type, x, y, sectorNum) {
    const scaleTier = Math.max(0, sectorNum - 1);
    const bossHpBonus = sectorNum >= 8 ? 2 : sectorNum >= 6 ? 1 : 0;
    const configs = {
      turret: {
        hp: 1,
        radius: ENEMY_RADIUS,
        speed: 0,
        bulletSpeed: Math.min(430, 290 + scaleTier * 11),
        fireInterval: Math.max(0.95, 1.8 - scaleTier * 0.08),
        rotSpeed: Math.min(2.6, 1.1 + scaleTier * 0.1),
        points: 100 + scaleTier * 15,
        twin: false,
        isBoss: false,
        bounces: 1,
      },
      patrol: {
        hp: 1,
        radius: ENEMY_RADIUS,
        speed: Math.min(138, 84 + scaleTier * 5),
        bulletSpeed: Math.min(450, 325 + scaleTier * 10),
        fireInterval: Math.max(0.9, 1.58 - scaleTier * 0.06),
        rotSpeed: Math.min(4.2, 2.8 + scaleTier * 0.08),
        points: 150 + scaleTier * 20,
        twin: false,
        isBoss: false,
        bounces: 1,
      },
      hunter: {
        hp: sectorNum >= 7 ? 2 : 1,
        radius: ENEMY_RADIUS,
        speed: Math.min(165, 118 + scaleTier * 4),
        bulletSpeed: Math.min(475, 360 + scaleTier * 9),
        fireInterval: Math.max(0.82, 1.18 - scaleTier * 0.04),
        rotSpeed: Math.min(5.0, 3.7 + scaleTier * 0.09),
        points: 200 + scaleTier * 25,
        twin: false,
        isBoss: false,
        bounces: 1,
      },
      commander: {
        hp: sectorNum >= 5 ? 2 : 1,
        radius: 16,
        speed: Math.min(132, 94 + scaleTier * 3.5),
        bulletSpeed: Math.min(460, 350 + scaleTier * 9),
        fireInterval: Math.max(0.9, 1.28 - scaleTier * 0.04),
        rotSpeed: Math.min(4.6, 3.3 + scaleTier * 0.08),
        points: 260 + scaleTier * 30,
        twin: true,
        isBoss: false,
        bounces: 1,
      },
      boss_juggernaut: {
        hp: 6 + bossHpBonus,
        radius: 19.5,
        speed: Math.min(82, 56 + scaleTier * 2),
        bulletSpeed: Math.min(455, 365 + scaleTier * 6),
        fireInterval: 1.38,
        rotSpeed: 2.7,
        points: 850 + scaleTier * 50,
        twin: true,
        isBoss: true,
        bounces: 1,
      },
      boss_sniper: {
        hp: 4 + (sectorNum >= 8 ? 1 : 0),
        radius: 16,
        speed: Math.min(115, 86 + scaleTier * 2.5),
        bulletSpeed: Math.min(545, 455 + scaleTier * 6),
        fireInterval: 1.45,
        rotSpeed: 3.4,
        points: 800 + scaleTier * 50,
        twin: false,
        isBoss: true,
        bounces: 2,
      },
      boss_vanguard: {
        hp: 5 + (sectorNum >= 8 ? 1 : 0),
        radius: 17,
        speed: Math.min(156, 118 + scaleTier * 3),
        bulletSpeed: Math.min(500, 415 + scaleTier * 6),
        fireInterval: 0.92,
        rotSpeed: 4.1,
        points: 800 + scaleTier * 50,
        twin: false,
        isBoss: true,
        bounces: 1,
      },
    };
    const cfg = configs[type] || configs.patrol;
    const startAngle = Math.PI / 2;
    return {
      type,
      x,
      y,
      radius: cfg.radius,
      hp: cfg.hp,
      maxHp: cfg.hp,
      hitFlash: 0,
      isBoss: cfg.isBoss,
      bounces: cfg.bounces,
      hullAngle: startAngle,
      turretAngle: startAngle + (Math.random() - 0.5) * 0.7,
      sweepDir: Math.random() < 0.5 ? 1 : -1,
      moveAngle: startAngle,
      moveTimer: 0.4 + Math.random() * 1.2,
      speed: cfg.speed,
      bulletSpeed: cfg.bulletSpeed,
      fireInterval: cfg.fireInterval,
      fireCooldown: 0.75 + Math.random() * 0.65,
      aimCharge: 0,
      burstRemaining: 0,
      burstTimer: 0,
      deployCooldown: type === 'boss_vanguard' ? 2.4 : 0,
      sniperLockAngle: null,
      rotSpeed: cfg.rotSpeed,
      points: cfg.points,
      twin: cfg.twin,
      alive: true,
      recoil: 0,
      treadPhase: 0,
      treadDistAccum: 0,
      antennaSway: 0,
    };
  }

  function loadWave(sectorOrSpec, keepHp, forceSessionMode = null) {
    const activeMode = forceSessionMode || (state.phase === 'start' ? '1p' : state.sessionMode);
    let sectorDef;
    if (activeMode === 'duel') {
      sectorDef = DUEL_WAVE;
    } else if (sectorOrSpec && typeof sectorOrSpec === 'object' && Array.isArray(sectorOrSpec.grid)) {
      sectorDef = sectorOrSpec;
    } else {
      const secNum = Math.max(1, Number(sectorOrSpec) || 1);
      sectorDef = generateProceduralSector(secNum, state.phase === 'start' ? { forceBoss: false, seed: 4049 } : {});
    }

    state.currentSectorSpec = sectorDef;
    state.sectorNum = activeMode === 'duel' ? 1 : sectorDef.number;
    state.waveIndex = Math.max(0, state.sectorNum - 1);
    state.themeId = sectorDef.themeId || 'concrete_fob';
    state.isBossSector = Boolean(sectorDef.isBoss && activeMode !== 'duel');
    state.bossType = state.isBossSector ? sectorDef.bossType : null;
    state.bossName = state.isBossSector ? sectorDef.bossName || '' : '';

    if (state.phase !== 'start' && activeMode !== 'duel') {
      if (state.isBossSector) {
        state.sectorsSinceLastBoss = 0;
        state.lastBossType = state.bossType;
        state.bossBannerTimer = 3.2;
        const bDef = BOSS_DEFS[state.bossType];
        setBossBannerVisible(true, state.bossName, bDef ? bDef.sub : '');
      } else {
        state.sectorsSinceLastBoss += 1;
        state.bossBannerTimer = 0;
        setBossBannerVisible(false);
      }
      recordBestSector(state.sectorNum);
    } else {
      state.bossBannerTimer = 0;
      setBossBannerVisible(false);
    }

    state.stones = [];
    state.deflectors = [];
    state.crates = [];
    state.mines = [];
    state.tempBarriers = [];
    state.powerUps = [];
    state.treadMarks = [];
    state.enemies = [];
    state.bullets = [];
    state.netTarget = null;
    particleSystem.clear();
    clearDecals();
    bakeCompoundFloor(state.sectorNum, state.themeId, state.isBossSector);

    state.shakeTime = 0;
    state.shakeDuration = 0.001;
    state.shakeIntensity = 0;
    state.damageFlash = 0;
    state.gameOverDelay = 0;

    let playerSpawn = { x: ARENA_W * 0.5, y: ARENA_H - TILE * 2.5 };
    let p2Spawn = { x: ARENA_W * 0.5, y: TILE * 2.5 };

    const grid = sectorDef.grid;
    for (let r = 0; r < ROWS; r++) {
      const rowStr = grid[r];
      for (let c = 0; c < COLS; c++) {
        const ch = rowStr[c];
        const x = c * TILE;
        const y = r * TILE;
        const cx = x + TILE * 0.5;
        const cy = y + TILE * 0.5;

        if (ch === '#') {
          const isPerimeter = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
          const leftWall = c > 0 && grid[r][c - 1] === '#';
          const rightWall = c < COLS - 1 && grid[r][c + 1] === '#';
          const upWall = r > 0 && grid[r - 1][c] === '#';
          const downWall = r < ROWS - 1 && grid[r + 1][c] === '#';
          const neighborCount = (leftWall ? 1 : 0) + (rightWall ? 1 : 0) + (upWall ? 1 : 0) + (downWall ? 1 : 0);
          const hazardCorner = !isPerimeter && neighborCount <= 1;
          state.stones.push({
            x,
            y,
            w: TILE,
            h: TILE,
            isPerimeter,
            hazardCorner,
            seed: (r * 31 + c * 17) & 255,
          });
        } else if (ch === '1' || ch === '2' || ch === '3' || ch === '4') {
          state.deflectors.push(buildDeflector(x, y, TILE, ch));
        } else if (ch === 'W') {
          state.crates.push({ x, y, w: TILE, h: TILE, hp: 2, maxHp: 2, hitFlash: 0 });
        } else if (ch === 'P') {
          playerSpawn = { x: cx, y: cy };
        } else if (ch === 'Q') {
          p2Spawn = { x: cx, y: cy };
        } else if (activeMode !== 'duel') {
          if (ch === 'T') {
            state.enemies.push(createEnemy('turret', cx, cy, state.sectorNum));
          } else if (ch === 'E') {
            state.enemies.push(createEnemy('patrol', cx, cy, state.sectorNum));
          } else if (ch === 'H') {
            state.enemies.push(createEnemy('hunter', cx, cy, state.sectorNum));
          } else if (ch === 'C') {
            state.enemies.push(createEnemy('commander', cx, cy, state.sectorNum));
          } else if (ch === 'J') {
            state.enemies.push(createEnemy('boss_juggernaut', cx, cy, state.sectorNum));
          } else if (ch === 'S') {
            state.enemies.push(createEnemy('boss_sniper', cx, cy, state.sectorNum));
          } else if (ch === 'V') {
            state.enemies.push(createEnemy('boss_vanguard', cx, cy, state.sectorNum));
          }
        }
      }
    }

    if (activeMode === 'coop') {
      const baseSpawnX = playerSpawn.x;
      playerSpawn = { x: baseSpawnX - 36, y: playerSpawn.y };
      p2Spawn = { x: baseSpawnX + 36, y: playerSpawn.y };
    } else if (activeMode === 'duel') {
      playerSpawn.x = ARENA_W * 0.5;
      p2Spawn.x = ARENA_W * 0.5;
    }

    const prevHp1 = keepHp && state.player ? Math.max(1, state.player.hp) : MAX_HP;
    const prevBuffs1 = keepHp && state.player ? state.player.buffs : null;
    state.player = createPlayer(playerSpawn.x, playerSpawn.y, prevHp1, prevBuffs1, -Math.PI / 2);

    if (activeMode === 'duel' || activeMode === 'coop') {
      const prevHp2 = keepHp && state.player2 ? Math.max(1, state.player2.hp) : MAX_HP;
      const prevBuffs2 = keepHp && state.player2 ? state.player2.buffs : null;
      const p2Angle = activeMode === 'duel' ? Math.PI / 2 : -Math.PI / 2;
      state.player2 = createPlayer(p2Spawn.x, p2Spawn.y, prevHp2, prevBuffs2, p2Angle);
    } else {
      state.player2 = null;
    }

    state.touch.hasCustomAim = false;
    state.touch.fireReleaseQueued = 0;
    state.p2Touch.hasCustomAim = false;
    state.p2Touch.fireReleaseQueued = 0;
    state.p2Touch.aimAngle = activeMode === 'duel' ? Math.PI / 2 : -Math.PI / 2;
    state.p2Input.fireQueued = 0;
    state.p2Input.aimA = state.p2Touch.aimAngle;
    updateHUD();
  }

  function initAttractSkirmish() {
    loadWave(
      {
        number: 2,
        name: 'CONCRETE FOB',
        themeId: 'concrete_fob',
        isBoss: false,
        bossType: null,
        bossName: '',
        grid: FALLBACK_SECTOR_GRID,
      },
      false,
      '1p'
    );
    if (state.player) {
      state.player.spawnX = state.player.x;
      state.player.spawnY = state.player.y;
      state.player.y = ARENA_H * 0.68;
      state.player.aiMoveAngle = -Math.PI * 0.35;
      state.player.aiMoveTimer = 0.8;
      state.player.aiRespawnTimer = 0;
      state.player.fireCooldown = 0.45;
      state.player.invulnTimer = 0.8;
    }
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      e.spawnX = e.x;
      e.spawnY = e.y;
      e.attractRespawnTimer = 0;
      e.fireCooldown = 0.4 + i * 0.28;
    }
  }

  function startNewGame(overrideSessionMode = null, overrideNetMode = null) {
    const sMode = overrideSessionMode || (state.playerCountPref === 2 ? state.preferred2pMode : '1p');
    const nMode = overrideNetMode || (sMode === '1p' ? 'solo' : state.netMode);
    if (sMode === '1p') {
      closePeerSession();
    }

    state.sessionMode = sMode;
    state.netMode = nMode;
    state.phase = 'playing';
    state.paused = false;
    state.settingsOpen = false;
    if (appShell) appShell.classList.remove('is-home');
    if (btnPause) btnPause.classList.remove('paused');
    if (screenPause) screenPause.classList.add('hidden');
    if (screenComms) screenComms.classList.add('hidden');
    if (screenIntel) screenIntel.classList.add('hidden');
    if (screenSettings) screenSettings.classList.add('hidden');
    sfx.ensureContext();
    sfx.startMusic();
    state.score = 0;
    state.kills = 0;
    state.sectorsSinceLastBoss = 0;
    state.lastBossType = null;
    state.cratesSinceLastDrop = 0;
    state.lastDropType = null;
    state.popups = [];
    state.lastRecvSeq = -1;
    screenStart.classList.add('hidden');
    screenGameOver.classList.add('hidden');
    screenVictory.classList.add('hidden');
    if (radarHud) {
      radarHud.classList.remove('hidden');
    }
    syncTouchDeckVisibility();
    resizeCanvas();
    loadWave(1, false, sMode);

    const theme = getThemeById(state.themeId);
    const bannerText =
      sMode === 'duel'
        ? '1v1 DUEL // ENGAGE!'
        : sMode === 'coop'
        ? `2P CO-OP // SECTOR 01 // ${theme.name}`
        : `SECTOR 01 // ${theme.name}`;
    addPopup(ARENA_W / 2, ARENA_H * 0.38, bannerText, '#84cc16', 1.7);

    if (state.netMode === 'p2p-host' && peerComms && peerComms.connected && state.currentSectorSpec) {
      peerComms.sendEvent({
        t: 'wave',
        sm: sMode,
        spec: state.currentSectorSpec,
        sc: 0,
        k: 0,
        ds: state.duelScores,
        txt: bannerText,
      });
    }
  }

  // =========================================================================
  // HUD Updates
  // =========================================================================
  function updateHealthPips(container, hp) {
    if (!container) return;
    container.setAttribute('aria-label', `Health ${hp} of ${MAX_HP}`);
    const pips = container.querySelectorAll('.health-pip');
    pips.forEach((pip, idx) => {
      pip.classList.remove('lost', 'critical');
      if (idx >= hp) {
        pip.classList.add('lost');
      } else if (hp === 1) {
        pip.classList.add('critical');
      }
    });
  }

  function updateHUD() {
    const is2P = state.sessionMode === 'duel' || state.sessionMode === 'coop';
    const theme = getThemeById(state.themeId);
    if (state.sessionMode === 'duel') {
      hudWave.textContent = '1v1 DUEL // PROVING';
      hudScore.textContent = `${state.duelScores.p1}:${state.duelScores.p2}`;
    } else {
      const secPad = String(state.sectorNum).padStart(2, '0');
      hudWave.textContent = `SECTOR ${secPad} // ${theme.name}`;
      hudScore.textContent = String(state.score).padStart(4, '0');
    }

    if (hudWaveCell) {
      hudWaveCell.classList.toggle('boss-sector', state.isBossSector);
    }
    if (radarHud) {
      radarHud.classList.toggle('boss-alert', state.isBossSector);
    }
    if (radarLabel) {
      radarLabel.textContent = state.isBossSector ? 'BOSS ALERT' : 'RADAR';
    }

    if (hudHealthLabel) {
      hudHealthLabel.textContent = is2P ? 'P1' : 'ARMOR';
    }
    updateHealthPips(hudHealth, state.player ? state.player.hp : MAX_HP);

    if (hudP2Cell) {
      hudP2Cell.classList.toggle('hidden', !is2P);
      if (is2P) {
        updateHealthPips(hudHealthP2, state.player2 ? state.player2.hp : MAX_HP);
      }
    }

    if (hudPing) {
      const showPing = state.netMode === 'p2p-host' || state.netMode === 'p2p-client';
      hudPing.classList.toggle('hidden', !showPing);
      if (showPing) {
        hudPing.textContent = state.pingMs != null ? `${state.pingMs}ms` : 'P2P';
      }
    }
  }

  // =========================================================================
  // Line of Sight, Raycast Laser Rangefinder & Obstacles (Rect + 45° Deflectors)
  // =========================================================================
  function getAllSolidObstacles() {
    const list = [];
    for (let i = 0; i < state.stones.length; i++) list.push(state.stones[i]);
    for (let i = 0; i < state.crates.length; i++) {
      if (state.crates[i].hp > 0) list.push(state.crates[i]);
    }
    for (let i = 0; i < state.tempBarriers.length; i++) {
      if (state.tempBarriers[i].hp > 0) list.push(state.tempBarriers[i]);
    }
    return list;
  }

  function pointInsideRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return true;
    const steps = Math.ceil(dist / 10);
    const obstacles = getAllSolidObstacles();
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      for (let i = 0; i < obstacles.length; i++) {
        if (pointInsideRect(px, py, obstacles[i])) {
          return false;
        }
      }
      for (let i = 0; i < state.deflectors.length; i++) {
        if (pointInsideDeflector(px, py, state.deflectors[i])) {
          return false;
        }
      }
    }
    return true;
  }

  // Exact ray-vs-AABB + ray-vs-45° Triangle intersection for crisp laser sights & ricochets
  function raycastObstacles(ox, oy, dx, dy, maxDist) {
    const obstacles = getAllSolidObstacles();
    let bestT = maxDist;
    let hitNormalX = 0;
    let hitNormalY = 0;
    let didHit = false;

    const invDx = Math.abs(dx) > 1e-6 ? 1 / dx : 1e9;
    const invDy = Math.abs(dy) > 1e-6 ? 1 / dy : 1e9;

    for (let i = 0; i < obstacles.length; i++) {
      const r = obstacles[i];
      const t1 = (r.x - ox) * invDx;
      const t2 = (r.x + r.w - ox) * invDx;
      const t3 = (r.y - oy) * invDy;
      const t4 = (r.y + r.h - oy) * invDy;

      const tminX = Math.min(t1, t2);
      const tmaxX = Math.max(t1, t2);
      const tminY = Math.min(t3, t4);
      const tmaxY = Math.max(t3, t4);

      const tEnter = Math.max(tminX, tminY);
      const tExit = Math.min(tmaxX, tmaxY);

      if (tExit >= Math.max(0, tEnter) && tEnter > 0.5 && tEnter < bestT) {
        bestT = tEnter;
        didHit = true;
        if (tminX > tminY) {
          hitNormalX = dx > 0 ? -1 : 1;
          hitNormalY = 0;
        } else {
          hitNormalX = 0;
          hitNormalY = dy > 0 ? -1 : 1;
        }
      }
    }

    // Ray vs 45-degree triangular steel deflectors
    for (let i = 0; i < state.deflectors.length; i++) {
      const defl = state.deflectors[i];
      for (let k = 0; k < defl.edges.length; k++) {
        const ed = defl.edges[k];
        // Ignore back-facing edge so exiting rays never re-hit
        if (dx * ed.nx + dy * ed.ny >= -1e-4) continue;
        const ex = ed.bx - ed.ax;
        const ey = ed.by - ed.ay;
        const denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-6) continue;
        const qpx = ed.ax - ox;
        const qpy = ed.ay - oy;
        const t = (qpx * ey - qpy * ex) / denom;
        const u = (qpx * dy - qpy * dx) / denom;
        if (t > 0.5 && t < bestT && u >= 0 && u <= 1) {
          bestT = t;
          didHit = true;
          hitNormalX = ed.nx;
          hitNormalY = ed.ny;
        }
      }
    }

    return {
      hit: didHit,
      dist: bestT,
      x: ox + dx * bestT,
      y: oy + dy * bestT,
      nx: hitNormalX,
      ny: hitNormalY,
    };
  }

  function probeClearDistance(x, y, angle, maxDist, radius) {
    const step = 12;
    const obstacles = getAllSolidObstacles();
    for (let d = step; d <= maxDist; d += step) {
      const px = x + Math.cos(angle) * d;
      const py = y + Math.sin(angle) * d;
      if (px - radius < TILE || px + radius > ARENA_W - TILE || py - radius < TILE || py + radius > ARENA_H - TILE) {
        return d - step;
      }
      for (let i = 0; i < obstacles.length; i++) {
        if (circleIntersectsRect(px, py, radius, obstacles[i])) {
          return d - step;
        }
      }
      for (let i = 0; i < state.deflectors.length; i++) {
        if (circleIntersectsDeflector(px, py, radius, state.deflectors[i])) {
          return d - step;
        }
      }
    }
    return maxDist;
  }

  // =========================================================================
  // Performance-Capped Particle System (Casings, Smoke, Sparks & Explosions)
  // =========================================================================
  class ParticleSystem {
    constructor(maxParticles = 280, maxShockwaves = 28) {
      this.maxParticles = maxParticles;
      this.maxShockwaves = maxShockwaves;
      this.particles = [];
      this.shockwaves = [];
    }

    clear() {
      this.particles.length = 0;
      this.shockwaves.length = 0;
    }

    addParticle(p) {
      if (this.particles.length >= this.maxParticles) {
        this.particles[0] = this.particles[this.particles.length - 1];
        this.particles.pop();
      }
      this.particles.push(p);
    }

    emitShockwave(x, y, maxRadius, life, color, lineWidth = 2.5) {
      if (this.shockwaves.length >= this.maxShockwaves) {
        this.shockwaves[0] = this.shockwaves[this.shockwaves.length - 1];
        this.shockwaves.pop();
      }
      this.shockwaves.push({
        x,
        y,
        radius: 5,
        maxRadius,
        life,
        maxLife: life,
        color,
        lineWidth,
      });
    }

    emitShotEffects(mx, my, tx, ty, angle, isEnemy) {
      // Directional muzzle flash cone
      const flashColors = isEnemy ? ['#fca5a5', '#f97316', '#ffffff'] : ['#fde68a', '#f59e0b', '#ffffff'];
      for (let i = 0; i < 6; i++) {
        const spread = angle + (Math.random() - 0.5) * 0.55;
        const spd = 95 + Math.random() * 130;
        const life = 0.08 + Math.random() * 0.06;
        this.addParticle({
          x: mx,
          y: my,
          vx: Math.cos(spread) * spd,
          vy: Math.sin(spread) * spd,
          drag: 0.84,
          size: 2.8 + Math.random() * 2.5,
          life,
          maxLife: life,
          color: flashColors[i % flashColors.length],
          shape: 'spark',
          rot: spread,
          vRot: 0,
        });
      }

      // Expanding smoke ring & soft gunsmoke puffs at muzzle brake
      this.emitShockwave(mx + Math.cos(angle) * 4, my + Math.sin(angle) * 4, 17, 0.22, 'rgba(203, 213, 225, 0.45)', 2.0);
      for (let i = 0; i < 4; i++) {
        const spread = angle + (Math.random() - 0.5) * 0.8;
        const spd = 28 + Math.random() * 48;
        const life = 0.26 + Math.random() * 0.16;
        this.addParticle({
          x: mx,
          y: my,
          vx: Math.cos(spread) * spd,
          vy: Math.sin(spread) * spd,
          drag: 0.92,
          size: 4 + Math.random() * 4.5,
          life,
          maxLife: life,
          color: 'rgba(148, 163, 184, 0.5)',
          shape: 'smoke',
          rot: 0,
          vRot: 0,
        });
      }

      // Ejecting spinning brass shell casing from turret breech side
      const ejectAngle = angle + Math.PI * 0.52 + (Math.random() - 0.5) * 0.35;
      const ejectSpd = 65 + Math.random() * 45;
      const casingLife = 0.42 + Math.random() * 0.16;
      this.addParticle({
        x: tx + Math.cos(ejectAngle) * 8,
        y: ty + Math.sin(ejectAngle) * 8,
        vx: Math.cos(ejectAngle) * ejectSpd,
        vy: Math.sin(ejectAngle) * ejectSpd,
        drag: 0.88,
        size: 4.2,
        life: casingLife,
        maxLife: casingLife,
        color: '#d97706',
        shape: 'casing',
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 10),
      });
    }

    emitSparks(x, y, color, count = 8, speedMax = 190, lifeMin = 0.14, lifeMax = 0.26) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 45 + Math.random() * speedMax;
        const life = lifeMin + Math.random() * (lifeMax - lifeMin);
        this.addParticle({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.88,
          size: 2.2 + Math.random() * 2.8,
          life,
          maxLife: life,
          color,
          shape: 'spark',
          rot: a,
          vRot: 0,
        });
      }
    }

    emitConcreteRicochet(x, y, normalX, normalY, isFinalHit = false) {
      const baseAngle =
        Math.abs(normalX) > 0.01 || Math.abs(normalY) > 0.01
          ? Math.atan2(normalY, normalX)
          : Math.random() * Math.PI * 2;

      // Metallic spark shower
      const sparkCount = isFinalHit ? 8 : 11;
      const sparkColors = isFinalHit ? ['#fb923c', '#fde047', '#ffffff'] : ['#fde047', '#fbbf24', '#ffffff'];
      for (let i = 0; i < sparkCount; i++) {
        const a = baseAngle + (Math.random() - 0.5) * 2.0;
        const spd = 110 + Math.random() * 190;
        const life = 0.13 + Math.random() * 0.11;
        this.addParticle({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.87,
          size: 2.0 + Math.random() * 2.4,
          life,
          maxLife: life,
          color: sparkColors[i % sparkColors.length],
          shape: 'spark',
          rot: a,
          vRot: 0,
        });
      }

      // Concrete chips & dust puff
      const chipColors = ['#9ca3af', '#6b7280', '#d1d5db'];
      for (let i = 0; i < 4; i++) {
        const a = baseAngle + (Math.random() - 0.5) * 1.8;
        const spd = 50 + Math.random() * 105;
        const life = 0.18 + Math.random() * 0.12;
        this.addParticle({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.89,
          size: 2.5 + Math.random() * 2.5,
          life,
          maxLife: life,
          color: chipColors[i % chipColors.length],
          shape: 'triangle',
          rot: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 14,
        });
      }

      for (let i = 0; i < 2; i++) {
        const a = baseAngle + (Math.random() - 0.5) * 1.2;
        const spd = 25 + Math.random() * 45;
        const life = 0.24 + Math.random() * 0.12;
        this.addParticle({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.91,
          size: 5 + Math.random() * 4,
          life,
          maxLife: life,
          color: 'rgba(156, 163, 175, 0.45)',
          shape: 'smoke',
          rot: 0,
          vRot: 0,
        });
      }

      this.emitShockwave(x, y, isFinalHit ? 14 : 18, 0.11, isFinalHit ? '#fb923c' : '#fde047', 2.0);
    }

    emitCrateHitDebris(x, y) {
      const colors = ['#4b5332', '#656e43', '#374151'];
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 65 + Math.random() * 135;
        const life = 0.18 + Math.random() * 0.12;
        this.addParticle({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.89,
          size: 4 + Math.random() * 3.5,
          life,
          maxLife: life,
          color: colors[i % colors.length],
          shape: 'plank',
          rot: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 14,
        });
      }
    }

    emitCrateExplosion(x, y) {
      // Multi-stage crate shatter: shockwave + dust cloud + wood/steel bracket debris + sparks
      this.emitShockwave(x, y, 36, 0.22, '#f59e0b', 2.4);
      stampScorchCrater(x, y, 16);

      // Dust clouds
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 25 + Math.random() * 65;
        const life = 0.28 + Math.random() * 0.16;
        this.addParticle({
          x: x + (Math.random() - 0.5) * 12,
          y: y + (Math.random() - 0.5) * 12,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.91,
          size: 7 + Math.random() * 7,
          life,
          maxLife: life,
          color: 'rgba(168, 162, 158, 0.45)',
          shape: 'smoke',
          rot: 0,
          vRot: 0,
        });
      }

      // Olive wood slats & dark steel bracket shards
      const debrisColors = ['#4b5332', '#656e43', '#363e22', '#374151', '#1f2937'];
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 70 + Math.random() * 170;
        const life = 0.22 + Math.random() * 0.16;
        this.addParticle({
          x: x + (Math.random() - 0.5) * 16,
          y: y + (Math.random() - 0.5) * 16,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.89,
          size: 4.5 + Math.random() * 4.5,
          life,
          maxLife: life,
          color: debrisColors[i % debrisColors.length],
          shape: i % 3 === 0 ? 'triangle' : 'plank',
          rot: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 15,
        });
      }

      this.emitSparks(x, y, '#fbbf24', 8, 160, 0.14, 0.24);
    }

    emitTankExplosion(x, y, primaryColor, accentColor, big = false) {
      // Multi-stage tank explosion + persistent scorch crater on floor
      stampScorchCrater(x, y, big ? 34 : 26);

      // Stage 1: Inner blinding shockwave & outer blast ring
      this.emitShockwave(x, y, big ? 36 : 26, 0.16, '#ffffff', 3.5);
      this.emitShockwave(x, y, big ? 70 : 50, big ? 0.34 : 0.25, '#f97316', 2.8);

      // Stage 2: Billowing dark smoke & fireball clouds
      const smokeCount = big ? 12 : 8;
      for (let i = 0; i < smokeCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 25 + Math.random() * (big ? 90 : 70);
        const life = (big ? 0.34 : 0.26) + Math.random() * 0.2;
        this.addParticle({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.91,
          size: 9 + Math.random() * 9,
          life,
          maxLife: life,
          color: i % 2 === 0 ? 'rgba(30, 34, 38, 0.7)' : 'rgba(234, 88, 12, 0.55)',
          shape: 'smoke',
          rot: 0,
          vRot: 0,
        });
      }

      // Stage 3: High-velocity armor shards & fiery sparks
      const shardCount = big ? 24 : 16;
      const colors = [primaryColor, accentColor, '#fbbf24', '#ffffff', '#374151'];
      for (let i = 0; i < shardCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 85 + Math.random() * (big ? 250 : 195);
        const life = (big ? 0.24 : 0.19) + Math.random() * (big ? 0.22 : 0.17);
        this.addParticle({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          drag: 0.89,
          size: 3.5 + Math.random() * 4.5,
          life,
          maxLife: life,
          color: colors[i % colors.length],
          shape: i % 3 === 0 ? 'triangle' : 'spark',
          rot: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 13,
        });
      }

      triggerScreenShake(big ? 11.0 : 6.8, big ? 0.42 : 0.26);
    }

    update(dt) {
      const frameScale = dt * 60;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life -= dt;
        if (pt.life <= 0) {
          this.particles[i] = this.particles[this.particles.length - 1];
          this.particles.pop();
          continue;
        }
        const damp = Math.pow(pt.drag, frameScale);
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= damp;
        pt.vy *= damp;
        pt.rot += pt.vRot * dt;
        if (pt.shape === 'smoke') {
          pt.size += 18 * dt;
        }
      }

      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.life -= dt;
        if (sw.life <= 0) {
          this.shockwaves[i] = this.shockwaves[this.shockwaves.length - 1];
          this.shockwaves.pop();
          continue;
        }
        const progress = 1 - sw.life / sw.maxLife;
        sw.radius = 5 + (sw.maxRadius - 5) * progress;
      }
    }

    render(c) {
      // Shockwave rings
      for (let i = 0; i < this.shockwaves.length; i++) {
        const sw = this.shockwaves[i];
        const ratio = clamp(sw.life / sw.maxLife, 0, 1);
        c.globalAlpha = ratio * 0.85;
        c.strokeStyle = sw.color;
        c.lineWidth = sw.lineWidth * ratio + 0.8;
        c.beginPath();
        c.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        c.stroke();
      }

      // Smoke, casings, sparks & armor shards
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        const ratio = clamp(pt.life / pt.maxLife, 0, 1);
        c.globalAlpha = pt.shape === 'smoke' ? ratio * 0.7 : ratio * ratio;
        c.fillStyle = pt.color;

        if (pt.shape === 'spark') {
          const s = pt.size * (0.45 + 0.55 * ratio);
          c.fillRect(pt.x - s * 0.5, pt.y - s * 0.5, s, s);
        } else if (pt.shape === 'smoke') {
          c.beginPath();
          c.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          c.fill();
        } else {
          c.save();
          c.translate(pt.x, pt.y);
          c.rotate(pt.rot);
          if (pt.shape === 'casing') {
            c.fillStyle = '#fbbf24';
            c.fillRect(-2.4, -1.1, 4.8, 2.2);
          } else if (pt.shape === 'plank') {
            c.fillRect(-pt.size * 0.7, -2.1, pt.size * 1.4, 4.2);
          } else {
            c.beginPath();
            c.moveTo(0, -pt.size);
            c.lineTo(pt.size * 0.85, pt.size * 0.7);
            c.lineTo(-pt.size * 0.85, pt.size * 0.7);
            c.closePath();
            c.fill();
          }
          c.restore();
        }
      }
      c.globalAlpha = 1;
    }
  }

  const particleSystem = new ParticleSystem(280, 28);

  let peerComms = null;

  function r1(n) {
    return Math.round(n * 10) / 10;
  }

  function r3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function closePeerSession() {
    if (peerComms) {
      peerComms.close();
      peerComms = null;
    }
    state.pingMs = null;
    if (commsRttEl) commsRttEl.textContent = '';
    if (hudPing) hudPing.classList.add('hidden');
  }

  function applyLocalOrNetFx(ev) {
    switch (ev.kind) {
      case 'shot':
        particleSystem.emitShotEffects(ev.mx, ev.my, ev.x, ev.y, ev.a, ev.owner === 'enemy');
        sfx.playShot(ev.owner === 'enemy');
        break;
      case 'bounce':
        if (ev.crate) {
          particleSystem.emitSparks(ev.x, ev.y, ev.col || '#fbbf24', 6, ev.final ? 130 : 150);
        } else {
          particleSystem.emitConcreteRicochet(ev.x, ev.y, ev.nx || 0, ev.ny || 0, Boolean(ev.final));
          triggerScreenShake(ev.final ? 2.6 : 2.2, 0.09);
        }
        if (!ev.final) sfx.playBounce();
        break;
      case 'crateHit':
        particleSystem.emitCrateHitDebris(ev.x, ev.y);
        sfx.playCrateHit();
        triggerScreenShake(3.2, 0.12);
        break;
      case 'crateBreak':
        particleSystem.emitCrateExplosion(ev.x, ev.y);
        sfx.playCrateBreak();
        triggerScreenShake(4.8, 0.18);
        if (ev.pts) addPopup(ev.x, ev.y - 12, `+${ev.pts}`, '#fbbf24', 0.7);
        break;
      case 'powerup':
        particleSystem.emitShockwave(ev.x, ev.y, 40, 0.26, ev.color);
        particleSystem.emitSparks(ev.x, ev.y, ev.accent, 10, 165);
        addPopup(ev.x, ev.y - 14, ev.label, ev.accent, 1.15);
        sfx.playPowerUp();
        break;
      case 'tankHit':
        particleSystem.emitSparks(ev.x, ev.y, '#f59e0b', 12, 200);
        triggerScreenShake(7.5, 0.24, ev.vx || 0, ev.vy || 0);
        sfx.playPlayerHit();
        if (ev.target === 'p2' || (!ev.target && ev.flash)) triggerHitFlash(1.0);
        addPopup(ev.x, ev.y - 18, '-1 ARMOR', '#f87171', 0.85);
        break;
      case 'tankExplode':
        particleSystem.emitTankExplosion(ev.x, ev.y, ev.pCol || '#ef4444', ev.aCol || '#f97316', Boolean(ev.big));
        sfx.playExplosion(Boolean(ev.big));
        if (ev.target === 'p2') {
          triggerScreenShake(9.0, 0.28);
          triggerHitFlash(1.25);
        }
        if (ev.txt) addPopup(ev.x, ev.y - 14, ev.txt, ev.tCol || '#e5e7eb', 0.95);
        break;
      case 'enemyHit':
        particleSystem.emitSparks(ev.x, ev.y, '#fbbf24', 8, 175);
        sfx.playCrateHit();
        triggerScreenShake(3.4, 0.1);
        if (ev.txt) addPopup(ev.x, ev.y - 18, ev.txt, ev.tCol || '#fbbf24', 0.65);
        break;
      case 'mineExplode':
        particleSystem.emitTankExplosion(ev.x, ev.y, '#ef4444', '#fbbf24', false);
        sfx.playExplosion(false);
        triggerScreenShake(6.5, 0.22);
        if (ev.txt) addPopup(ev.x, ev.y - 12, ev.txt, ev.tCol || '#fca5a5', 0.85);
        break;
      case 'barrierBreak':
        particleSystem.emitCrateExplosion(ev.x, ev.y);
        sfx.playCrateBreak();
        triggerScreenShake(4.2, 0.15);
        break;
      case 'intercept':
        particleSystem.emitSparks(ev.x, ev.y, '#fde047', 8, 150);
        triggerScreenShake(3.0, 0.11);
        sfx.playBounce();
        break;
      case 'popup':
        addPopup(ev.x, ev.y, ev.txt, ev.col || '#84cc16', ev.dur || 1.3);
        break;
      default:
        break;
    }
  }

  function emitNetFx(kind, x, y, extra = {}) {
    const payload = Object.assign({ t: 'fx', kind, x: r1(x), y: r1(y) }, extra);
    if (state.netMode === 'p2p-host' && peerComms && peerComms.connected) {
      peerComms.sendEvent(payload);
    }
  }

  function spawnBullet(owner, x, y, angle, speed, suppressMuzzle = false, bouncesLeft = 1) {
    const muzzleDist = 23;
    let bx = x + Math.cos(angle) * muzzleDist;
    let by = y + Math.sin(angle) * muzzleDist;

    const obstacles = getAllSolidObstacles();
    let blockedMuzzle = false;
    for (let i = 0; i < obstacles.length; i++) {
      if (circleIntersectsRect(bx, by, BULLET_RADIUS, obstacles[i])) {
        blockedMuzzle = true;
        break;
      }
    }
    if (!blockedMuzzle) {
      for (let i = 0; i < state.deflectors.length; i++) {
        if (circleIntersectsDeflector(bx, by, BULLET_RADIUS, state.deflectors[i])) {
          blockedMuzzle = true;
          break;
        }
      }
    }
    if (blockedMuzzle) {
      bx = x + Math.cos(angle) * 6;
      by = y + Math.sin(angle) * 6;
    }

    state.bullets.push({
      id: state.nextBulletId++,
      owner,
      x: bx,
      y: by,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: BULLET_RADIUS,
      bouncesLeft,
      bounced: false,
      age: 0,
      trail: [{ x: bx, y: by }],
    });

    if (!suppressMuzzle) {
      particleSystem.emitShotEffects(bx, by, x, y, angle, owner === 'enemy');
      emitNetFx('shot', x, y, { mx: r1(bx), my: r1(by), a: r3(angle), owner });
    }
  }

  function triggerScreenShake(intensity, duration = 0.18, dirX = 0, dirY = 0) {
    if (state.phase === 'start') return;
    const safeDuration = Math.max(0.05, duration);
    const currentRemainingMag =
      state.shakeTime > 0
        ? state.shakeIntensity * Math.pow(state.shakeTime / Math.max(0.001, state.shakeDuration), 2)
        : 0;

    if (intensity >= currentRemainingMag || state.shakeTime <= 0) {
      state.shakeIntensity = intensity;
      state.shakeDuration = safeDuration;
      state.shakeTime = safeDuration;
      const len = Math.hypot(dirX, dirY);
      if (len > 0.001) {
        state.shakeDirX = dirX / len;
        state.shakeDirY = dirY / len;
      } else {
        state.shakeDirX = 0;
        state.shakeDirY = 0;
      }
    }
  }

  const HIT_FLASH_DURATION = 0.24;
  function triggerHitFlash(intensity = 1.0) {
    if (state.phase === 'start') return;
    const prevIntensity = state.damageFlash > 0 ? state.damageFlashIntensity || 1.0 : 0;
    state.damageFlashDuration = HIT_FLASH_DURATION;
    state.damageFlash = HIT_FLASH_DURATION;
    state.damageFlashIntensity = Math.max(prevIntensity, intensity);
  }

  function addPopup(x, y, text, color, duration = 0.9) {
    state.popups.push({ x, y, text, color, life: duration, maxLife: duration });
  }

  function maybeSpawnPowerUp(x, y) {
    const shouldDrop = state.cratesSinceLastDrop >= 1 || Math.random() < 0.65;
    if (!shouldDrop) {
      state.cratesSinceLastDrop += 1;
      return;
    }

    state.cratesSinceLastDrop = 0;
    const keys = Object.keys(POWERUP_DEFS);
    const pool = keys.filter((k) => k !== state.lastDropType);
    const chosenKey = pool[Math.floor(Math.random() * pool.length)] || keys[0];
    state.lastDropType = chosenKey;

    state.powerUps.push({
      type: chosenKey,
      x,
      y,
      radius: 13,
      age: 0,
      life: 14.0,
      maxLife: 14.0,
    });
  }

  function updatePowerUps(dt) {
    const players = [state.player, state.player2];
    for (let i = state.powerUps.length - 1; i >= 0; i--) {
      const pu = state.powerUps[i];
      pu.age += dt;
      pu.life -= dt;
      if (pu.life <= 0) {
        state.powerUps.splice(i, 1);
        continue;
      }

      for (let pi = 0; pi < players.length; pi++) {
        const p = players[pi];
        if (!p || !p.alive) continue;
        const hitR = p.radius + pu.radius + 3;
        if (distSq(p.x, p.y, pu.x, pu.y) <= hitR * hitR) {
          const def = POWERUP_DEFS[pu.type];
          p.buffs[pu.type] = def.duration;
          if (state.phase !== 'start') {
            if (state.sessionMode !== 'duel') {
              state.score += 25;
            }
            updateHUD();
            addPopup(pu.x, pu.y - 14, def.label, def.accent, 1.15);
            sfx.playPowerUp();
            emitNetFx('powerup', pu.x, pu.y, {
              ptype: pu.type,
              label: def.label,
              accent: def.accent,
              color: def.color,
            });
          }
          particleSystem.emitShockwave(pu.x, pu.y, 40, 0.26, def.color);
          particleSystem.emitSparks(pu.x, pu.y, def.accent, 10, 165);
          state.powerUps.splice(i, 1);
          break;
        }
      }
    }
  }

  function updateAttractSkirmish(dt) {
    const p = state.player;
    const obstacles = getAllSolidObstacles();

    // Respawn AI NATO tank seamlessly if destroyed
    if (p && !p.alive) {
      p.aiRespawnTimer = (p.aiRespawnTimer || 0) - dt;
      if (p.aiRespawnTimer <= 0) {
        p.x = p.spawnX || ARENA_W * 0.5;
        p.y = ARENA_H * 0.68;
        p.hp = MAX_HP;
        p.alive = true;
        p.invulnTimer = 1.0;
        p.hullAngle = -Math.PI * 0.5;
        p.turretAngle = -Math.PI * 0.5;
        p.fireCooldown = 0.5;
        particleSystem.emitShockwave(p.x, p.y, 38, 0.35, '#84cc16');
      }
    }

    // Respawn Aggressor tanks so the skirmish stays lively
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (!e.alive) {
        e.attractRespawnTimer = (e.attractRespawnTimer || 2.2) - dt;
        if (e.attractRespawnTimer <= 0) {
          e.x = e.spawnX;
          e.y = e.spawnY;
          e.alive = true;
          e.fireCooldown = 0.7 + Math.random() * 0.5;
          e.aimCharge = 0;
          particleSystem.emitShockwave(e.x, e.y, 34, 0.32, '#ef4444');
        }
      }
    }

    // Replenish supply crates periodically if too many break
    let aliveCrates = 0;
    for (let i = 0; i < state.crates.length; i++) {
      if (state.crates[i].hp > 0) aliveCrates++;
    }
    if (aliveCrates < 3) {
      for (let i = 0; i < state.crates.length; i++) {
        const c = state.crates[i];
        if (c.hp <= 0) {
          const cx = c.x + c.w * 0.5;
          const cy = c.y + c.h * 0.5;
          const blockedByPlayer = p && p.alive && distSq(p.x, p.y, cx, cy) < 1600;
          if (!blockedByPlayer) {
            c.hp = c.maxHp;
            c.hitFlash = 0;
            break;
          }
        }
      }
    }

    // Autonomous NATO MBT steering, laser sweeping & ricochet firing
    if (p && p.alive) {
      p.fireCooldown = Math.max(0, p.fireCooldown - dt);
      p.recoil = Math.max(0, p.recoil - dt * 18);
      p.invulnTimer = Math.max(0, p.invulnTimer - dt);
      p.buffs.rapid = Math.max(0, p.buffs.rapid - dt);
      p.buffs.spread = Math.max(0, p.buffs.spread - dt);
      p.buffs.turbo = Math.max(0, p.buffs.turbo - dt);

      const prevX = p.x;
      const prevY = p.y;
      const prevHull = p.hullAngle;
      const activeSpeed = (p.buffs.turbo > 0 ? p.speed * 1.35 : p.speed) * 0.78;

      p.aiMoveTimer = (p.aiMoveTimer || 0) - dt;
      const ahead = probeClearDistance(p.x, p.y, p.aiMoveAngle || 0, 56, p.radius + 4);
      if (ahead < 28 || p.aiMoveTimer <= 0) {
        const candidates = [];
        for (let k = 0; k < 8; k++) {
          const ang = (k * Math.PI) / 4;
          const clear = probeClearDistance(p.x, p.y, ang, 130, p.radius + 4);
          if (clear >= 48) {
            const centerBias = Math.cos(ang - Math.atan2(ARENA_H * 0.5 - p.y, ARENA_W * 0.5 - p.x)) * 0.45;
            const keepMomentum = Math.cos(ang - (p.aiMoveAngle || 0)) * 0.45;
            candidates.push({ ang, score: clear * 0.02 + centerBias + keepMomentum + Math.random() * 1.6 });
          }
        }
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          p.aiMoveAngle = candidates[0].ang;
        } else {
          p.aiMoveAngle = normalizeAngle((p.aiMoveAngle || 0) + Math.PI);
        }
        p.aiMoveTimer = 1.0 + Math.random() * 1.4;
      }

      p.hullAngle = rotateTowards(p.hullAngle, p.aiMoveAngle, 5.4 * dt);
      p.x += Math.cos(p.aiMoveAngle) * activeSpeed * dt;
      p.y += Math.sin(p.aiMoveAngle) * activeSpeed * dt;
      p.treadPhase += dt * 11;

      for (let i = 0; i < obstacles.length; i++) {
        resolveCircleRect(p, obstacles[i]);
      }
      for (let i = 0; i < state.deflectors.length; i++) {
        resolveCircleDeflector(p, state.deflectors[i]);
      }
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (!e.alive) continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const minD = p.radius + e.radius + 2;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD * minD && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (minD - d);
          p.y += (dy / d) * (minD - d);
        }
      }
      p.x = clamp(p.x, TILE + p.radius, ARENA_W - TILE - p.radius);
      p.y = clamp(p.y, TILE + p.radius, ARENA_H - TILE - p.radius);

      p.treadDistAccum += Math.hypot(p.x - prevX, p.y - prevY);
      if (p.treadDistAccum >= 10) {
        p.treadDistAccum = 0;
        addTreadMark(p.x, p.y, p.hullAngle);
      }
      p.antennaSway = clamp(p.antennaSway * 0.88 + normalizeAngle(p.hullAngle - prevHull) * 1.4, -0.45, 0.45);

      // Target nearest live aggressor with subtle sweeping bank-shot oscillation
      let targetEnemy = null;
      let bestDist2 = Infinity;
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (!e.alive) continue;
        const d2 = distSq(p.x, p.y, e.x, e.y);
        if (d2 < bestDist2) {
          bestDist2 = d2;
          targetEnemy = e;
        }
      }

      const nowSec = performance.now() * 0.001;
      let desiredTurret = p.hullAngle + Math.sin(nowSec * 1.3) * 0.7;
      if (targetEnemy) {
        const directAngle = Math.atan2(targetEnemy.y - p.y, targetEnemy.x - p.x);
        const clearShot = hasLineOfSight(p.x, p.y, targetEnemy.x, targetEnemy.y);
        desiredTurret = clearShot ? directAngle : normalizeAngle(directAngle + Math.sin(nowSec * 1.8) * 0.42);
      }
      p.turretAngle = rotateTowards(p.turretAngle, desiredTurret, 3.2 * dt);

      const activePlayerBullets = state.bullets.filter((b) => b.owner === 'player').length;
      if (p.fireCooldown <= 0 && activePlayerBullets < 4 && targetEnemy) {
        const hasRapid = p.buffs.rapid > 0;
        const hasSpread = p.buffs.spread > 0;
        const bulletSpeed = hasRapid ? 485 : 420;
        if (hasSpread) {
          spawnBullet('player', p.x, p.y, p.turretAngle - 0.17, bulletSpeed, true);
          spawnBullet('player', p.x, p.y, p.turretAngle, bulletSpeed, false);
          spawnBullet('player', p.x, p.y, p.turretAngle + 0.17, bulletSpeed, true);
        } else {
          spawnBullet('player', p.x, p.y, p.turretAngle, bulletSpeed, false);
        }
        p.fireCooldown = hasRapid ? 0.35 : 0.75 + Math.random() * 0.35;
        p.recoil = hasSpread ? 7.0 : 5.6;
      }
    }

    updatePowerUps(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateEffects(dt);
  }

  // =========================================================================
  // Update Loop (Single Player, 1v1 Duel & 2P Co-Op)
  // =========================================================================
  function findNearestAlivePlayer(x, y) {
    const p1 = state.player && state.player.alive ? state.player : null;
    const p2 = state.player2 && state.player2.alive ? state.player2 : null;
    if (p1 && p2) {
      return distSq(x, y, p1.x, p1.y) <= distSq(x, y, p2.x, p2.y) ? p1 : p2;
    }
    return p1 || p2;
  }

  function stepPlayerTank(p, input, dt, bulletOwner, otherTank) {
    if (!p || !p.alive) return;

    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.recoil = Math.max(0, p.recoil - dt * 18);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);

    p.buffs.rapid = Math.max(0, p.buffs.rapid - dt);
    p.buffs.spread = Math.max(0, p.buffs.spread - dt);
    p.buffs.turbo = Math.max(0, p.buffs.turbo - dt);

    const activeSpeed = p.buffs.turbo > 0 ? p.speed * 1.4 : p.speed;
    const prevX = p.x;
    const prevY = p.y;
    const prevHull = p.hullAngle;

    if (input.tankSteer) {
      if (Math.abs(input.tankTurn) > 0.01) {
        p.hullAngle = normalizeAngle(p.hullAngle + input.tankTurn * 3.4 * dt);
        p.treadPhase += dt * 7 * Math.abs(input.tankTurn);
      }
      if (Math.abs(input.tankThrust) > 0.01) {
        p.x += Math.cos(p.hullAngle) * activeSpeed * input.tankThrust * dt;
        p.y += Math.sin(p.hullAngle) * activeSpeed * input.tankThrust * dt;
        p.treadPhase += dt * 13 * input.tankThrust;
      }
    } else {
      const mag = Math.hypot(input.moveX, input.moveY);
      if (mag > 0.12) {
        const nx = input.moveX / Math.max(1, mag);
        const ny = input.moveY / Math.max(1, mag);
        const targetAngle = Math.atan2(ny, nx);
        p.hullAngle = rotateTowards(p.hullAngle, targetAngle, 9.5 * dt);
        const moveScale = Math.min(1, mag);
        p.x += nx * activeSpeed * moveScale * dt;
        p.y += ny * activeSpeed * moveScale * dt;
        p.treadPhase += dt * 14 * moveScale;
      }
    }

    const obstacles = getAllSolidObstacles();
    for (let i = 0; i < obstacles.length; i++) {
      resolveCircleRect(p, obstacles[i]);
    }
    for (let i = 0; i < state.deflectors.length; i++) {
      resolveCircleDeflector(p, state.deflectors[i]);
    }
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (!e.alive) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const minD = p.radius + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = minD - d;
        p.x += (dx / d) * push;
        p.y += (dy / d) * push;
      }
    }
    if (otherTank && otherTank.alive) {
      const dx = p.x - otherTank.x;
      const dy = p.y - otherTank.y;
      const minD = p.radius + otherTank.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        p.x += (dx / d) * push;
        p.y += (dy / d) * push;
        otherTank.x -= (dx / d) * push;
        otherTank.y -= (dy / d) * push;
      }
    }
    p.x = clamp(p.x, TILE + p.radius, ARENA_W - TILE - p.radius);
    p.y = clamp(p.y, TILE + p.radius, ARENA_H - TILE - p.radius);

    const moved = Math.hypot(p.x - prevX, p.y - prevY);
    p.treadDistAccum += moved;
    if (p.treadDistAccum >= 9) {
      p.treadDistAccum = 0;
      addTreadMark(p.x, p.y, p.hullAngle);
    }
    const hullDelta = normalizeAngle(p.hullAngle - prevHull);
    p.antennaSway = clamp(p.antennaSway * 0.88 + hullDelta * 1.4, -0.45, 0.45);

    if (input.aimDirectAngle !== null && input.aimDirectAngle !== undefined) {
      p.turretAngle = rotateTowards(p.turretAngle, input.aimDirectAngle, 22 * dt);
    } else if (input.aimSnapAngle !== null && input.aimSnapAngle !== undefined) {
      p.turretAngle = input.aimSnapAngle;
    } else if (!input.keepCustomAim) {
      p.turretAngle = rotateTowards(p.turretAngle, p.hullAngle, 6 * dt);
    }

    const hasRapid = p.buffs.rapid > 0;
    const hasSpread = p.buffs.spread > 0;
    const fireInterval = hasRapid ? 0.115 : 0.28;
    const bulletSpeed = hasRapid ? 500 : 435;
    const maxPlayerBullets = hasRapid || hasSpread ? 12 : 5;
    const activeBullets = state.bullets.filter((b) => b.owner === bulletOwner).length;

    if (input.wantsFire && p.fireCooldown <= 0 && activeBullets < maxPlayerBullets) {
      if (hasSpread) {
        const spreadOffset = 0.17;
        spawnBullet(bulletOwner, p.x, p.y, p.turretAngle - spreadOffset, bulletSpeed, true);
        spawnBullet(bulletOwner, p.x, p.y, p.turretAngle, bulletSpeed, false);
        spawnBullet(bulletOwner, p.x, p.y, p.turretAngle + spreadOffset, bulletSpeed, true);
      } else {
        spawnBullet(bulletOwner, p.x, p.y, p.turretAngle, bulletSpeed, false);
      }
      p.fireCooldown = fireInterval;
      p.lastFireInterval = fireInterval;
      p.recoil = hasSpread ? 7.2 : 5.8;
      if (input.onFired) input.onFired();
      triggerScreenShake(hasSpread ? 2.0 : 1.4, 0.06, -Math.cos(p.turretAngle), -Math.sin(p.turretAngle));
      sfx.playShot(false);
    }
  }

  function stickToTreadAxes(stickX, stickY) {
    const dz = 0.16;
    const rawTurn = clamp(stickX, -1, 1);
    const rawThrust = clamp(-stickY, -1, 1);
    const turn = Math.abs(rawTurn) > dz ? (rawTurn - Math.sign(rawTurn) * dz) / (1 - dz) : 0;
    const thrust = Math.abs(rawThrust) > dz ? (rawThrust - Math.sign(rawThrust) * dz) / (1 - dz) : 0;
    return { turn, thrust };
  }

  function updatePlayers(dt) {
    const p1 = state.player;
    const p2 = state.player2;
    const isSplit = state.netMode === 'local-split';

    if (p1 && p1.alive) {
      let inX = state.touch.moveX;
      let inY = state.touch.moveY;
      const allowArrowsForP1 = !isSplit;

      if (state.keys['KeyW'] || (allowArrowsForP1 && state.keys['ArrowUp'])) inY -= 1;
      if (state.keys['KeyS'] || (allowArrowsForP1 && state.keys['ArrowDown'])) inY += 1;
      if (state.keys['KeyA'] || (allowArrowsForP1 && state.keys['ArrowLeft'])) inX -= 1;
      if (state.keys['KeyD'] || (allowArrowsForP1 && state.keys['ArrowRight'])) inX += 1;

      const touchDriving = Math.hypot(state.touch.moveX, state.touch.moveY) > 0.08;
      const touchTread = stickToTreadAxes(state.touch.moveX, state.touch.moveY);
      const keyTurn =
        (state.keys['KeyD'] || (allowArrowsForP1 && state.keys['ArrowRight']) ? 1 : 0) -
        (state.keys['KeyA'] || (allowArrowsForP1 && state.keys['ArrowLeft']) ? 1 : 0);
      const keyThrust =
        (state.keys['KeyW'] || (allowArrowsForP1 && state.keys['ArrowUp']) ? 1 : 0) -
        (state.keys['KeyS'] || (allowArrowsForP1 && state.keys['ArrowDown']) ? 1 : 0);
      const turn = clamp(touchTread.turn + keyTurn, -1, 1);
      const thrust = clamp(touchTread.thrust + keyThrust, -1, 1);

      let aimDirectAngle = null;
      let aimSnapAngle = null;
      if (state.touch.aimActive && state.touch.aimArmed) {
        aimDirectAngle = state.touch.aimAngle;
        state.touch.hasCustomAim = true;
      } else if (state.mouse.active || state.touch.canvasAimDown) {
        aimSnapAngle = Math.atan2(state.mouse.y - p1.y, state.mouse.x - p1.x);
        state.touch.hasCustomAim = true;
      }

      state.touch.fireReleaseQueued = Math.max(0, state.touch.fireReleaseQueued - dt);
      const wantsFire =
        state.mouse.down ||
        state.keys['Space'] ||
        state.touch.canvasAimDown ||
        state.touch.fireReleaseQueued > 0;

      stepPlayerTank(
        p1,
        {
          moveX: inX,
          moveY: inY,
          touchDriving,
          tankSteer: state.driveMode === 'tank',
          tankTurn: turn,
          tankThrust: thrust,
          aimDirectAngle,
          aimSnapAngle,
          keepCustomAim: state.touch.hasCustomAim,
          wantsFire,
          onFired: () => {
            state.touch.fireReleaseQueued = 0;
          },
        },
        dt,
        'player',
        p2
      );
    }

    if (p2 && p2.alive) {
      if (state.netMode === 'p2p-host') {
        state.p2Input.fireQueued = Math.max(0, state.p2Input.fireQueued - dt);
        const p2Tread = stickToTreadAxes(state.p2Input.mx, state.p2Input.my);
        stepPlayerTank(
          p2,
          {
            moveX: state.p2Input.mx,
            moveY: state.p2Input.my,
            touchDriving: true,
            tankSteer: Boolean(state.p2Input.tankSteer),
            tankTurn: p2Tread.turn,
            tankThrust: p2Tread.thrust,
            aimDirectAngle: state.p2Input.aimOn ? state.p2Input.aimA : null,
            aimSnapAngle: null,
            keepCustomAim: state.p2Input.aimOn,
            wantsFire: state.p2Input.fireHeld || state.p2Input.fireQueued > 0,
            onFired: () => {
              state.p2Input.fireQueued = 0;
            },
          },
          dt,
          'p2',
          p1
        );
      } else if (state.netMode === 'local-split') {
        let inX = state.p2Touch.moveX;
        let inY = state.p2Touch.moveY;
        if (state.keys['ArrowUp']) inY -= 1;
        if (state.keys['ArrowDown']) inY += 1;
        if (state.keys['ArrowLeft']) inX -= 1;
        if (state.keys['ArrowRight']) inX += 1;

        const touchDriving = Math.hypot(state.p2Touch.moveX, state.p2Touch.moveY) > 0.08;
        const p2Tread = stickToTreadAxes(state.p2Touch.moveX, state.p2Touch.moveY);
        const keyTurn = (state.keys['ArrowRight'] ? 1 : 0) - (state.keys['ArrowLeft'] ? 1 : 0);
        const keyThrust = (state.keys['ArrowUp'] ? 1 : 0) - (state.keys['ArrowDown'] ? 1 : 0);
        const turn = clamp(p2Tread.turn + keyTurn, -1, 1);
        const thrust = clamp(p2Tread.thrust + keyThrust, -1, 1);

        let aimDirectAngle = null;
        if (state.p2Touch.aimActive && state.p2Touch.aimArmed) {
          aimDirectAngle = state.p2Touch.aimAngle;
          state.p2Touch.hasCustomAim = true;
        }
        state.p2Touch.fireReleaseQueued = Math.max(0, state.p2Touch.fireReleaseQueued - dt);
        const wantsFire =
          state.keys['Enter'] ||
          state.keys['Slash'] ||
          state.keys['Period'] ||
          state.p2Touch.fireReleaseQueued > 0;

        stepPlayerTank(
          p2,
          {
            moveX: inX,
            moveY: inY,
            touchDriving,
            tankSteer: state.driveMode === 'tank',
            tankTurn: turn,
            tankThrust: thrust,
            aimDirectAngle,
            aimSnapAngle: null,
            keepCustomAim: state.p2Touch.hasCustomAim,
            wantsFire,
            onFired: () => {
              state.p2Touch.fireReleaseQueued = 0;
            },
          },
          dt,
          'p2',
          p1
        );
      }
    }
  }

  function findBankShotAngle(ox, oy, targetX, targetY, maxBounces = 2) {
    let bestAngle = null;
    let bestScore = Infinity;
    const directAngle = Math.atan2(targetY - oy, targetX - ox);
    const stepCount = 36;

    for (let i = 0; i < stepCount; i++) {
      const ang = normalizeAngle(directAngle + ((i - stepCount * 0.5) / stepCount) * Math.PI * 1.85);
      let cx = ox + Math.cos(ang) * 24;
      let cy = oy + Math.sin(ang) * 24;
      let dx = Math.cos(ang);
      let dy = Math.sin(ang);

      for (let b = 0; b <= maxBounces; b++) {
        const hit = raycastObstacles(cx, cy, dx, dy, 650);
        // Check closest distance from segment [cx,cy]->[hit.x,hit.y] to target
        const segX = hit.x - cx;
        const segY = hit.y - cy;
        const segLen2 = segX * segX + segY * segY;
        if (segLen2 > 4) {
          const u = clamp(((targetX - cx) * segX + (targetY - cy) * segY) / segLen2, 0, 1);
          const px = cx + segX * u;
          const py = cy + segY * u;
          const d = Math.hypot(targetX - px, targetY - py);
          if (d < 24 && b >= 1 && d < bestScore) {
            bestScore = d;
            bestAngle = ang;
          }
        }
        if (!hit.hit) break;
        const dot = dx * hit.nx + dy * hit.ny;
        dx = dx - 2 * dot * hit.nx;
        dy = dy - 2 * dot * hit.ny;
        cx = hit.x + hit.nx * 0.8;
        cy = hit.y + hit.ny * 0.8;
      }
    }
    return bestAngle;
  }

  function deployVanguardUtility(e) {
    if (state.phase === 'start') return;
    const deployMine = state.mines.length < 4 && (state.tempBarriers.length >= 3 || Math.random() < 0.6);
    if (deployMine) {
      const dropAngle = e.hullAngle + Math.PI;
      const mx = clamp(e.x + Math.cos(dropAngle) * 24, TILE + 18, ARENA_W - TILE - 18);
      const my = clamp(e.y + Math.sin(dropAngle) * 24, TILE + 18, ARENA_H - TILE - 18);
      state.mines.push({
        x: mx,
        y: my,
        radius: 10,
        armTimer: 0.85,
        life: 16,
        pulse: 0,
      });
      particleSystem.emitSparks(mx, my, '#f87171', 6, 100);
      addPopup(mx, my - 12, 'MINE DEPLOYED', '#fca5a5', 0.8);
      emitNetFx('popup', mx, my - 12, { txt: 'MINE DEPLOYED', col: '#fca5a5', dur: 0.8 });
    } else if (state.tempBarriers.length < 3) {
      const bw = 36;
      const bh = 16;
      const bx = clamp(e.x - bw * 0.5, TILE + 10, ARENA_W - TILE - bw - 10);
      const by = clamp(e.y + e.radius + 14, TILE + 40, ARENA_H - TILE * 4);
      const overlapsPlayer =
        (state.player && state.player.alive && circleIntersectsRect(state.player.x, state.player.y, state.player.radius + 6, { x: bx, y: by, w: bw, h: bh })) ||
        (state.player2 && state.player2.alive && circleIntersectsRect(state.player2.x, state.player2.y, state.player2.radius + 6, { x: bx, y: by, w: bw, h: bh }));
      const overlapsObstacles = getAllSolidObstacles().some((o) => o.x < bx + bw && o.x + o.w > bx && o.y < by + bh && o.y + o.h > by);
      if (!overlapsPlayer && !overlapsObstacles) {
        state.tempBarriers.push({ x: bx, y: by, w: bw, h: bh, hp: 3, maxHp: 3, hitFlash: 0 });
        particleSystem.emitSparks(bx + bw * 0.5, by + bh * 0.5, '#94a3b8', 8, 120);
        addPopup(bx + bw * 0.5, by - 8, 'SHIELD', '#93c5fd', 0.75);
        emitNetFx('popup', bx + bw * 0.5, by - 8, { txt: 'SHIELD', col: '#93c5fd', dur: 0.75 });
      }
    }
  }

  function updateEnemies(dt) {
    const obstacles = getAllSolidObstacles();

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (!e.alive) continue;

      const p = findNearestAlivePlayer(e.x, e.y);
      e.fireCooldown = Math.max(0, e.fireCooldown - dt);
      e.recoil = Math.max(0, e.recoil - dt * 16);
      e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);

      const canSeePlayer = p && p.alive && hasLineOfSight(e.x, e.y, p.x, p.y);

      if (e.type !== 'turret') {
        const prevX = e.x;
        const prevY = e.y;
        const prevHull = e.hullAngle;
        e.moveTimer -= dt;
        const ahead = probeClearDistance(e.x, e.y, e.moveAngle, 48, e.radius + 2);
        if (ahead < 22 || e.moveTimer <= 0) {
          const candidates = [];
          const toPlayer = p ? Math.atan2(p.y - e.y, p.x - e.x) : Math.PI / 2;
          for (let k = 0; k < 8; k++) {
            const ang = (k * Math.PI) / 4;
            const clear = probeClearDistance(e.x, e.y, ang, 110, e.radius + 2);
            if (clear >= 44) {
              const align = Math.cos(ang - toPlayer);
              const keepMomentum = Math.cos(ang - e.moveAngle) * 0.4;
              const distPref =
                e.type === 'boss_sniper' && p && distSq(e.x, e.y, p.x, p.y) < 42000 ? -0.9 : 0;
              const weight = e.type === 'hunter' || e.type === 'boss_vanguard' ? 1.4 : 0.7;
              const score = clear * 0.02 + align * (weight + distPref) + keepMomentum + Math.random() * 1.4;
              candidates.push({ ang, score });
            }
          }
          if (candidates.length > 0) {
            candidates.sort((a, b) => b.score - a.score);
            e.moveAngle = candidates[0].ang;
          } else {
            e.moveAngle = normalizeAngle(e.moveAngle + Math.PI);
          }
          e.moveTimer = e.type === 'boss_vanguard' ? 0.8 + Math.random() * 1.0 : 1.1 + Math.random() * 1.4;
        }

        e.hullAngle = rotateTowards(e.hullAngle, e.moveAngle, 5.2 * dt);
        e.x += Math.cos(e.moveAngle) * e.speed * dt;
        e.y += Math.sin(e.moveAngle) * e.speed * dt;
        e.treadPhase += dt * 10;

        for (let j = 0; j < obstacles.length; j++) {
          resolveCircleRect(e, obstacles[j]);
        }
        for (let j = 0; j < state.deflectors.length; j++) {
          resolveCircleDeflector(e, state.deflectors[j]);
        }
        for (let j = 0; j < state.enemies.length; j++) {
          if (i === j || !state.enemies[j].alive) continue;
          const other = state.enemies[j];
          const dx = e.x - other.x;
          const dy = e.y - other.y;
          const minD = e.radius + other.radius + 2;
          const d2 = dx * dx + dy * dy;
          if (d2 < minD * minD && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = (minD - d) * 0.5;
            e.x += (dx / d) * push;
            e.y += (dy / d) * push;
          }
        }
        e.x = clamp(e.x, TILE + e.radius, ARENA_W - TILE - e.radius);
        e.y = clamp(e.y, TILE + e.radius, ARENA_H - TILE - e.radius);

        e.treadDistAccum += Math.hypot(e.x - prevX, e.y - prevY);
        if (e.treadDistAccum >= 11) {
          e.treadDistAccum = 0;
          addTreadMark(e.x, e.y, e.hullAngle);
        }
        e.antennaSway = clamp(e.antennaSway * 0.88 + normalizeAngle(e.hullAngle - prevHull) * 1.2, -0.4, 0.4);
      }

      // Vanguard Boss: deploy mines & deployable barriers periodically
      if (e.type === 'boss_vanguard') {
        e.deployCooldown -= dt;
        if (e.deployCooldown <= 0) {
          e.deployCooldown = 4.2 + Math.random() * 1.4;
          deployVanguardUtility(e);
        }
      }

      // Juggernaut Boss: handle second twin-cannon burst shot
      if (e.burstRemaining > 0) {
        e.burstTimer -= dt;
        if (e.burstTimer <= 0) {
          e.burstRemaining -= 1;
          spawnBullet('enemy', e.x, e.y, e.turretAngle - 0.09, e.bulletSpeed, false, e.bounces);
          spawnBullet('enemy', e.x, e.y, e.turretAngle + 0.09, e.bulletSpeed, true, e.bounces);
          e.recoil = 6.5;
          sfx.playShot(true);
        }
      }

      if (e.type === 'turret') {
        if (canSeePlayer) {
          const targetAngle = Math.atan2(p.y - e.y, p.x - e.x);
          e.turretAngle = rotateTowards(e.turretAngle, targetAngle, e.rotSpeed * 1.6 * dt);
        } else {
          e.turretAngle = normalizeAngle(e.turretAngle + e.sweepDir * e.rotSpeed * dt);
        }

        const angleToPlayer = p
          ? Math.abs(normalizeAngle(Math.atan2(p.y - e.y, p.x - e.x) - e.turretAngle))
          : Math.PI;
        const readyToShoot = e.fireCooldown <= 0 && (canSeePlayer ? angleToPlayer < 0.25 : true);
        if (readyToShoot) {
          if (e.aimCharge < 0.18) {
            e.aimCharge += dt;
          } else {
            spawnBullet('enemy', e.x, e.y, e.turretAngle, e.bulletSpeed, false, e.bounces);
            e.fireCooldown = e.fireInterval;
            e.aimCharge = 0;
            e.recoil = 5;
            sfx.playShot(true);
          }
        }
      } else if (e.type === 'boss_sniper') {
        // Sniper Boss calculates direct shot OR 2-bounce bank shot with visible red laser
        let targetAngle = null;
        if (canSeePlayer && p) {
          targetAngle = Math.atan2(p.y - e.y, p.x - e.x);
          e.sniperLockAngle = targetAngle;
        } else if (p && p.alive) {
          if (e.fireCooldown < 0.9 || e.sniperLockAngle === null) {
            const found = findBankShotAngle(e.x, e.y, p.x, p.y, 2);
            if (found !== null) {
              e.sniperLockAngle = found;
            }
          }
          targetAngle = e.sniperLockAngle;
        }

        if (targetAngle !== null) {
          e.turretAngle = rotateTowards(e.turretAngle, targetAngle, e.rotSpeed * dt);
          const aimErr = Math.abs(normalizeAngle(targetAngle - e.turretAngle));
          if (e.fireCooldown <= 0 && aimErr < 0.12) {
            e.aimCharge += dt;
            if (e.aimCharge >= 0.36) {
              spawnBullet('enemy', e.x, e.y, e.turretAngle, e.bulletSpeed, false, 2);
              e.fireCooldown = e.fireInterval;
              e.aimCharge = 0;
              e.sniperLockAngle = null;
              e.recoil = 6.2;
              sfx.playShot(true);
            }
          }
        } else {
          e.aimCharge = Math.max(0, e.aimCharge - dt * 1.5);
          const desiredSweep = normalizeAngle(e.hullAngle + Math.sin(performance.now() * 0.002 + i) * 0.75);
          e.turretAngle = rotateTowards(e.turretAngle, desiredSweep, 2.2 * dt);
        }
      } else {
        if (canSeePlayer) {
          const targetAngle = Math.atan2(p.y - e.y, p.x - e.x);
          e.turretAngle = rotateTowards(e.turretAngle, targetAngle, e.rotSpeed * dt);
          const aimErr = Math.abs(normalizeAngle(targetAngle - e.turretAngle));

          if (e.fireCooldown <= 0 && aimErr < 0.24) {
            e.aimCharge += dt;
            if (e.aimCharge >= 0.24) {
              if (e.twin) {
                spawnBullet('enemy', e.x, e.y, e.turretAngle - 0.08, e.bulletSpeed, false, e.bounces);
                spawnBullet('enemy', e.x, e.y, e.turretAngle + 0.08, e.bulletSpeed, true, e.bounces);
                if (e.type === 'boss_juggernaut') {
                  e.burstRemaining = 1;
                  e.burstTimer = 0.22;
                }
              } else {
                spawnBullet('enemy', e.x, e.y, e.turretAngle, e.bulletSpeed, false, e.bounces);
              }
              e.fireCooldown = e.fireInterval;
              e.aimCharge = 0;
              e.recoil = 5.5;
              sfx.playShot(true);
            }
          }
        } else {
          e.aimCharge = Math.max(0, e.aimCharge - dt * 2);
          const desiredSweep = normalizeAngle(e.hullAngle + Math.sin(performance.now() * 0.002 + i) * 0.55);
          e.turretAngle = rotateTowards(e.turretAngle, desiredSweep, 2.0 * dt);
        }
      }
    }
  }

  function applyDamageToPlayerTank(tank, whoLabel, b) {
    if (tank.invulnTimer <= 0) {
      tank.hp = Math.max(0, tank.hp - 1);
      tank.invulnTimer = 1.35;
      const shouldLocalFlash = state.phase !== 'start' && (state.netMode === 'p2p-host' ? whoLabel === 'player' : true);
      if (state.phase !== 'start') {
        updateHUD();
      }

      if (tank.hp <= 0) {
        tank.alive = false;
        if (shouldLocalFlash) {
          triggerHitFlash(1.25);
        }
        if (state.phase === 'start') {
          tank.aiRespawnTimer = 2.2;
        } else if (state.sessionMode === 'duel') {
          if (whoLabel === 'p2') state.duelScores.p1 += 1;
          else state.duelScores.p2 += 1;
          updateHUD();
          state.gameOverDelay = 1.05;
        } else if (state.sessionMode === 'coop') {
          const p1Alive = state.player && state.player.alive;
          const p2Alive = state.player2 && state.player2.alive;
          if (!p1Alive && !p2Alive) {
            recordLifetimeDeath();
            state.gameOverDelay = 1.0;
          } else {
            addPopup(tank.x, tank.y - 18, `${whoLabel.toUpperCase()} DOWN!`, '#f87171', 1.2);
            emitNetFx('popup', tank.x, tank.y - 18, { txt: `${whoLabel.toUpperCase()} DOWN!`, col: '#f87171', dur: 1.2 });
          }
        } else {
          recordLifetimeDeath();
          state.gameOverDelay = 1.0;
        }
        const pCol = whoLabel === 'p2' && state.sessionMode === 'duel' ? '#ef4444' : whoLabel === 'p2' ? '#d97706' : '#84cc16';
        const aCol = whoLabel === 'p2' && state.sessionMode === 'duel' ? '#f97316' : '#f59e0b';
        particleSystem.emitTankExplosion(tank.x, tank.y, pCol, aCol, true);
        triggerScreenShake(9.0, 0.28, b.vx, b.vy);
        sfx.playExplosion(true);
        emitNetFx('tankExplode', tank.x, tank.y, { pCol, aCol, big: true, target: whoLabel });
      } else {
        if (shouldLocalFlash) {
          triggerHitFlash(1.0);
        }
        particleSystem.emitSparks(tank.x, tank.y, '#f59e0b', 12, 200);
        triggerScreenShake(7.5, 0.24, b.vx, b.vy);
        sfx.playPlayerHit();
        if (state.phase !== 'start') {
          addPopup(tank.x, tank.y - 18, '-1 ARMOR', '#f87171', 0.85);
          emitNetFx('tankHit', tank.x, tank.y, { vx: r1(b.vx), vy: r1(b.vy), target: whoLabel });
        }
      }
    } else {
      particleSystem.emitSparks(b.x, b.y, '#bef264', 5, 110);
      triggerScreenShake(2.4, 0.09, b.vx, b.vy);
    }
  }

  function updateBullets(dt) {
    const subSteps = 4;
    const stepDt = dt / subSteps;

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.age += dt;
      let removed = false;

      for (let step = 0; step < subSteps; step++) {
        const prevX = b.x;
        const prevY = b.y;
        b.x += b.vx * stepDt;
        b.y += b.vy * stepDt;

        const obstacles = getAllSolidObstacles();
        let hitObstacle = null;
        let hitCrate = null;
        let hitBarrier = null;
        let hitDeflectorNormal = null;

        for (let j = 0; j < obstacles.length; j++) {
          const rect = obstacles[j];
          if (circleIntersectsRect(b.x, b.y, b.radius, rect)) {
            hitObstacle = rect;
            if (rect.hp !== undefined) {
              if (rect.w === TILE && rect.h === TILE) hitCrate = rect;
              else hitBarrier = rect;
            }
            break;
          }
        }

        if (!hitObstacle) {
          for (let j = 0; j < state.deflectors.length; j++) {
            const defl = state.deflectors[j];
            if (circleIntersectsDeflector(b.x, b.y, b.radius, defl)) {
              const res = resolveCircleDeflector({ x: b.x, y: b.y, radius: b.radius }, defl);
              if (res) {
                hitDeflectorNormal = res;
              }
              break;
            }
          }
        }

        if (hitDeflectorNormal) {
          const nx = hitDeflectorNormal.nx;
          const ny = hitDeflectorNormal.ny;
          if (b.bouncesLeft > 0) {
            b.bouncesLeft -= 1;
            b.bounced = true;
            const dot = b.vx * nx + b.vy * ny;
            if (dot < 0) {
              b.vx = b.vx - 2 * dot * nx;
              b.vy = b.vy - 2 * dot * ny;
            }
            b.x = prevX + nx * 1.4;
            b.y = prevY + ny * 1.4;
            particleSystem.emitConcreteRicochet(b.x, b.y, nx, ny, false);
            triggerScreenShake(2.4, 0.09, -b.vx, -b.vy);
            emitNetFx('bounce', b.x, b.y, { nx: r1(nx), ny: r1(ny), crate: false, final: false });
            sfx.playBounce();
          } else {
            particleSystem.emitConcreteRicochet(prevX, prevY, nx, ny, true);
            triggerScreenShake(2.6, 0.1, b.vx, b.vy);
            emitNetFx('bounce', prevX, prevY, { nx: r1(nx), ny: r1(ny), crate: false, final: true });
            state.bullets.splice(i, 1);
            removed = true;
            break;
          }
        } else if (hitObstacle) {
          if (hitCrate) {
            hitCrate.hp -= 1;
            hitCrate.hitFlash = 0.14;
            if (hitCrate.hp <= 0) {
              const cx = hitCrate.x + TILE / 2;
              const cy = hitCrate.y + TILE / 2;
              particleSystem.emitCrateExplosion(cx, cy);
              sfx.playCrateBreak();
              triggerScreenShake(4.8, 0.18, b.vx, b.vy);
              maybeSpawnPowerUp(cx, cy);
              let pts = 0;
              if ((b.owner === 'player' || b.owner === 'p2') && state.phase !== 'start' && state.sessionMode !== 'duel') {
                pts = 15;
                state.score += 15;
                addPopup(cx, hitCrate.y + 8, '+15', '#fbbf24', 0.7);
                updateHUD();
              }
              emitNetFx('crateBreak', cx, cy, { pts });
            } else {
              particleSystem.emitCrateHitDebris(b.x, b.y);
              sfx.playCrateHit();
              triggerScreenShake(3.2, 0.12, b.vx, b.vy);
              emitNetFx('crateHit', b.x, b.y);
            }
          } else if (hitBarrier) {
            hitBarrier.hp -= 1;
            hitBarrier.hitFlash = 0.14;
            if (hitBarrier.hp <= 0) {
              const cx = hitBarrier.x + hitBarrier.w * 0.5;
              const cy = hitBarrier.y + hitBarrier.h * 0.5;
              particleSystem.emitCrateExplosion(cx, cy);
              sfx.playCrateBreak();
              emitNetFx('barrierBreak', cx, cy);
            } else {
              particleSystem.emitSparks(b.x, b.y, '#93c5fd', 5, 130);
              sfx.playCrateHit();
            }
          }

          const wasOutsideX = prevX + b.radius <= hitObstacle.x || prevX - b.radius >= hitObstacle.x + hitObstacle.w;
          const wasOutsideY = prevY + b.radius <= hitObstacle.y || prevY - b.radius >= hitObstacle.y + hitObstacle.h;
          let reflectX = false;
          if (wasOutsideX && !wasOutsideY) {
            reflectX = true;
          } else if (wasOutsideY && !wasOutsideX) {
            reflectX = false;
          } else {
            const penLeft = b.x + b.radius - hitObstacle.x;
            const penRight = hitObstacle.x + hitObstacle.w - (b.x - b.radius);
            const penTop = b.y + b.radius - hitObstacle.y;
            const penBottom = hitObstacle.y + hitObstacle.h - (b.y - b.radius);
            reflectX = Math.min(penLeft, penRight) < Math.min(penTop, penBottom);
          }

          const normX = reflectX ? (prevX < hitObstacle.x + hitObstacle.w * 0.5 ? -1 : 1) : 0;
          const normY = reflectX ? 0 : (prevY < hitObstacle.y + hitObstacle.h * 0.5 ? -1 : 1);

          if (b.bouncesLeft > 0) {
            b.bouncesLeft -= 1;
            b.bounced = true;
            if (reflectX) b.vx = -b.vx;
            else b.vy = -b.vy;

            b.x = prevX;
            b.y = prevY;
            if (hitCrate || hitBarrier) {
              particleSystem.emitSparks(b.x, b.y, '#fbbf24', 6, 150);
              emitNetFx('bounce', b.x, b.y, { crate: true, col: '#fbbf24', final: false });
            } else {
              particleSystem.emitConcreteRicochet(b.x, b.y, normX, normY, false);
              triggerScreenShake(2.2, 0.09, -b.vx, -b.vy);
              emitNetFx('bounce', b.x, b.y, { nx: normX, ny: normY, crate: false, final: false });
            }
            sfx.playBounce();
          } else {
            if (hitCrate || hitBarrier) {
              const col = b.owner === 'enemy' ? '#f87171' : '#fde68a';
              particleSystem.emitSparks(b.x, b.y, col, 6, 130);
              emitNetFx('bounce', b.x, b.y, { crate: true, col, final: true });
            } else {
              particleSystem.emitConcreteRicochet(prevX, prevY, normX, normY, true);
              triggerScreenShake(2.6, 0.1, b.vx, b.vy);
              emitNetFx('bounce', prevX, prevY, { nx: normX, ny: normY, crate: false, final: true });
            }
            state.bullets.splice(i, 1);
            removed = true;
            break;
          }
        }

        // Player / P2 bullet can shoot and clear proximity mines
        if (!removed && (b.owner === 'player' || b.owner === 'p2') && state.mines.length > 0) {
          for (let mIdx = state.mines.length - 1; mIdx >= 0; mIdx--) {
            const mine = state.mines[mIdx];
            const hitR = b.radius + mine.radius + 2;
            if (distSq(b.x, b.y, mine.x, mine.y) <= hitR * hitR) {
              state.mines.splice(mIdx, 1);
              particleSystem.emitTankExplosion(mine.x, mine.y, '#ef4444', '#fbbf24', false);
              sfx.playExplosion(false);
              triggerScreenShake(4.0, 0.14);
              if (state.phase !== 'start') {
                state.score += 10;
                updateHUD();
                addPopup(mine.x, mine.y - 10, '+10 MINE', '#fde047', 0.75);
                emitNetFx('mineExplode', mine.x, mine.y, { txt: '+10 MINE', tCol: '#fde047' });
              }
              state.bullets.splice(i, 1);
              removed = true;
              break;
            }
          }
        }

        // Player / P2 Co-Op tracer vs Aggressor tanks & Bosses (Multi-HP supported)
        if (!removed && (b.owner === 'player' || b.owner === 'p2') && state.sessionMode !== 'duel') {
          for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
            const e = state.enemies[eIdx];
            if (!e.alive) continue;
            const hitR = b.radius + e.radius;
            if (distSq(b.x, b.y, e.x, e.y) <= hitR * hitR) {
              e.hp = Math.max(0, (e.hp !== undefined ? e.hp : 1) - 1);
              e.hitFlash = 0.14;
              if (e.hp > 0) {
                particleSystem.emitSparks(b.x, b.y, '#fbbf24', 9, 175);
                sfx.playCrateHit();
                triggerScreenShake(3.4, 0.1);
                const hitTxt = e.isBoss ? `ARMOR ${e.hp}/${e.maxHp}` : 'ARMOR HIT';
                if (state.phase !== 'start') {
                  addPopup(e.x, e.y - e.radius - 8, hitTxt, '#fbbf24', 0.65);
                  emitNetFx('enemyHit', e.x, e.y - e.radius - 8, { txt: hitTxt, tCol: '#fbbf24' });
                }
              } else {
                e.alive = false;
                let txt = '';
                let tCol = '#e5e7eb';
                if (state.phase === 'start') {
                  e.attractRespawnTimer = 2.4;
                } else {
                  state.kills += 1;
                  recordLifetimeKill();
                  const bonus = b.bounced ? Math.round(e.points * 0.5) : 0;
                  const totalPts = e.points + bonus;
                  state.score += totalPts;
                  updateHUD();
                  txt = e.isBoss ? `BOSS DOWN! +${totalPts}` : bonus > 0 ? `+${totalPts} BANK!` : `+${totalPts}`;
                  tCol = e.isBoss ? '#fbbf24' : bonus > 0 ? '#fde047' : '#e5e7eb';
                  addPopup(e.x, e.y - 14, txt, tCol, e.isBoss ? 1.5 : 0.95);
                }

                particleSystem.emitTankExplosion(e.x, e.y, '#ef4444', '#f97316', Boolean(e.isBoss));
                sfx.playExplosion(Boolean(e.isBoss));
                emitNetFx('tankExplode', e.x, e.y, { pCol: '#ef4444', aCol: '#f97316', big: Boolean(e.isBoss), txt, tCol });
              }

              state.bullets.splice(i, 1);
              removed = true;
              break;
            }
          }
        }

        // 1v1 Duel PvP Tracer Hits
        if (!removed && state.sessionMode === 'duel') {
          if (b.owner === 'player' && state.player2 && state.player2.alive) {
            const p2 = state.player2;
            const hitR = b.radius + p2.radius;
            if (distSq(b.x, b.y, p2.x, p2.y) <= hitR * hitR) {
              state.bullets.splice(i, 1);
              removed = true;
              applyDamageToPlayerTank(p2, 'p2', b);
              break;
            }
          } else if (b.owner === 'p2' && state.player && state.player.alive) {
            const p1 = state.player;
            const hitR = b.radius + p1.radius;
            if (distSq(b.x, b.y, p1.x, p1.y) <= hitR * hitR) {
              state.bullets.splice(i, 1);
              removed = true;
              applyDamageToPlayerTank(p1, 'player', b);
              break;
            }
          }
        }

        // Aggressor tracer vs Player 1 / Player 2
        if (!removed && b.owner === 'enemy') {
          const targets = [
            { tank: state.player, label: 'player' },
            { tank: state.player2, label: 'p2' },
          ];
          for (let ti = 0; ti < targets.length; ti++) {
            const target = targets[ti];
            if (!target.tank || !target.tank.alive) continue;
            const hitR = b.radius + target.tank.radius;
            if (distSq(b.x, b.y, target.tank.x, target.tank.y) <= hitR * hitR) {
              state.bullets.splice(i, 1);
              removed = true;
              applyDamageToPlayerTank(target.tank, target.label, b);
              break;
            }
          }
        }
      }

      if (!removed) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();
      }
    }

    // Mid-air tracer interception
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const a = state.bullets[i];
      if (!a) continue;
      for (let j = i - 1; j >= 0; j--) {
        const b = state.bullets[j];
        if (!b || a.owner === b.owner) continue;
        if (state.sessionMode === 'coop' && a.owner !== 'enemy' && b.owner !== 'enemy') continue;
        const rSum = a.radius + b.radius + 1;
        if (distSq(a.x, a.y, b.x, b.y) <= rSum * rSum) {
          const ix = (a.x + b.x) * 0.5;
          const iy = (a.y + b.y) * 0.5;
          particleSystem.emitSparks(ix, iy, '#fde047', 8, 150);
          triggerScreenShake(3.0, 0.11);
          sfx.playBounce();
          emitNetFx('intercept', ix, iy);
          state.bullets.splice(i, 1);
          state.bullets.splice(j, 1);
          i--;
          break;
        }
      }
    }
  }

  function updateEffects(dt) {
    for (let i = 0; i < state.crates.length; i++) {
      if (state.crates[i].hitFlash > 0) {
        state.crates[i].hitFlash = Math.max(0, state.crates[i].hitFlash - dt);
      }
    }

    for (let i = state.tempBarriers.length - 1; i >= 0; i--) {
      const tb = state.tempBarriers[i];
      if (tb.hp <= 0) {
        state.tempBarriers.splice(i, 1);
        continue;
      }
      if (tb.hitFlash > 0) tb.hitFlash = Math.max(0, tb.hitFlash - dt);
    }

    // Proximity Mines update & detonation
    for (let i = state.mines.length - 1; i >= 0; i--) {
      const m = state.mines[i];
      m.armTimer = Math.max(0, m.armTimer - dt);
      m.life -= dt;
      m.pulse += dt * 7;
      if (m.life <= 0) {
        state.mines.splice(i, 1);
        continue;
      }
      if (m.armTimer <= 0 && state.phase === 'playing') {
        const checkTargets = [
          { tank: state.player, label: 'player' },
          { tank: state.player2, label: 'p2' },
        ];
        let triggered = false;
        for (let ti = 0; ti < checkTargets.length; ti++) {
          const t = checkTargets[ti];
          if (!t.tank || !t.tank.alive) continue;
          const trigR = m.radius + t.tank.radius + 7;
          if (distSq(m.x, m.y, t.tank.x, t.tank.y) <= trigR * trigR) {
            state.mines.splice(i, 1);
            particleSystem.emitTankExplosion(m.x, m.y, '#ef4444', '#fbbf24', false);
            sfx.playExplosion(false);
            emitNetFx('mineExplode', m.x, m.y);
            applyDamageToPlayerTank(t.tank, t.label, { vx: 0, vy: 0 });
            triggered = true;
            break;
          }
        }
        if (triggered) continue;
      }
    }

    if (state.bossBannerTimer > 0) {
      state.bossBannerTimer = Math.max(0, state.bossBannerTimer - dt);
      if (state.bossBannerTimer <= 0) {
        setBossBannerVisible(false);
      }
    }

    for (let i = state.treadMarks.length - 1; i >= 0; i--) {
      state.treadMarks[i].life -= dt;
      if (state.treadMarks[i].life <= 0) {
        state.treadMarks[i] = state.treadMarks[state.treadMarks.length - 1];
        state.treadMarks.pop();
      }
    }

    particleSystem.update(dt);

    for (let i = state.popups.length - 1; i >= 0; i--) {
      const pop = state.popups[i];
      pop.life -= dt;
      pop.y -= 24 * dt;
      if (pop.life <= 0) {
        state.popups.splice(i, 1);
      }
    }

    state.shakeTime = Math.max(0, state.shakeTime - dt);
    state.damageFlash = Math.max(0, state.damageFlash - dt);
  }

  function checkWaveProgress(dt) {
    if (state.gameOverDelay > 0) {
      state.gameOverDelay -= dt;
      if (state.gameOverDelay <= 0) {
        if (state.sessionMode === 'duel') {
          const p1Alive = state.player && state.player.alive;
          const winner = p1Alive ? 1 : 2;
          triggerDuelEnd(winner);
        } else {
          triggerGameOver();
        }
      }
      return;
    }

    if (state.sessionMode === 'duel') {
      return;
    }

    if (state.phase === 'playing') {
      const remaining = state.enemies.some((e) => e.alive);
      if (!remaining) {
        recordLifetimeWaveCleared();
        const clearBonus = state.isBossSector ? 300 : 100;
        state.score += clearBonus;
        updateHUD();
        sfx.playWaveClear();
        state.phase = 'wave_transition';
        state.transitionTimer = 1.9;
        const secStr = String(state.sectorNum).padStart(2, '0');
        const txt = `SECTOR ${secStr} SECURED! +${clearBonus}`;
        addPopup(ARENA_W / 2, ARENA_H * 0.42, txt, '#84cc16', 1.7);
        emitNetFx('popup', ARENA_W / 2, ARENA_H * 0.42, { txt, col: '#84cc16', dur: 1.7 });
      }
    } else if (state.phase === 'wave_transition') {
      state.transitionTimer -= dt;
      if (state.transitionTimer <= 0) {
        const nextSectorNum = state.sectorNum + 1;
        state.phase = 'playing';
        loadWave(nextSectorNum, true, state.sessionMode);
        const theme = getThemeById(state.themeId);
        const nextStr = String(nextSectorNum).padStart(2, '0');
        const txt = state.isBossSector
          ? `SECTOR ${nextStr} // BOSS INTERCEPT!`
          : `SECTOR ${nextStr} // ${theme.name}`;
        addPopup(
          ARENA_W / 2,
          ARENA_H * 0.36,
          txt,
          state.isBossSector ? '#f87171' : '#f59e0b',
          1.85
        );
        if (state.netMode === 'p2p-host' && peerComms && peerComms.connected && state.currentSectorSpec) {
          peerComms.sendEvent({
            t: 'wave',
            sm: state.sessionMode,
            spec: state.currentSectorSpec,
            sc: state.score,
            k: state.kills,
            ds: state.duelScores,
            txt,
          });
        }
      }
    }
  }

  function triggerDuelEnd(winner, remoteData = null) {
    state.phase = 'victory';
    state.paused = false;
    state.settingsOpen = false;
    sfx.stopMusic();
    setBossBannerVisible(false);
    if (screenPause) screenPause.classList.add('hidden');
    if (screenSettings) screenSettings.classList.add('hidden');
    if (radarHud) radarHud.classList.add('hidden');
    if (screenGameOver) screenGameOver.classList.add('hidden');

    const localIsWinner =
      state.netMode === 'p2p-client' ? winner === 2 : winner === 1 || state.netMode === 'local-split';
    if (localIsWinner) sfx.playVictory();
    else sfx.playGameOver();

    const ds = (remoteData && remoteData.ds) || state.duelScores;
    if (victoryC2Code) victoryC2Code.textContent = 'C2 // 1v1 DUEL COMPLETE';
    if (victoryC2Status) victoryC2Status.textContent = `MATCH ${ds.p1} : ${ds.p2}`;
    if (victoryTitle) victoryTitle.textContent = `PLAYER ${winner} VICTORY`;
    if (victorySubtitle) {
      victorySubtitle.textContent =
        winner === 1 ? 'NATO Olive MBT dominated the proving ground.' : 'Aggressor Crimson MBT secured the kill.';
    }
    winScore.textContent = `${ds.p1} : ${ds.p2}`;
    const p1Hp = remoteData ? remoteData.p1hp : state.player ? state.player.hp : 0;
    const p2Hp = remoteData ? remoteData.p2hp : state.player2 ? state.player2.hp : 0;
    winHp.textContent = `P1 ${p1Hp} / P2 ${p2Hp}`;
    winKills.textContent = `P${winner}`;
    if (btnRestartVictory) btnRestartVictory.textContent = 'REMATCH';
    screenVictory.classList.remove('hidden');

    if (state.netMode === 'p2p-host' && !remoteData && peerComms && peerComms.connected) {
      peerComms.sendEvent({
        t: 'end',
        kind: 'duel',
        winner,
        ds: state.duelScores,
        p1hp: state.player ? state.player.hp : 0,
        p2hp: state.player2 ? state.player2.hp : 0,
      });
    }
  }

  function triggerGameOver(remoteData = null) {
    state.phase = 'gameover';
    state.paused = false;
    state.settingsOpen = false;
    sfx.stopMusic();
    setBossBannerVisible(false);
    if (screenPause) screenPause.classList.add('hidden');
    if (screenSettings) screenSettings.classList.add('hidden');
    if (radarHud) radarHud.classList.add('hidden');
    sfx.playGameOver();
    if (gameoverC2Code) gameoverC2Code.textContent = 'ALERT // HULL BREACH';
    if (gameoverC2Status) gameoverC2Status.textContent = 'KIA';
    if (gameoverTitle) {
      gameoverTitle.textContent = state.sessionMode === 'coop' ? 'SQUAD LOST' : 'UNIT LOST';
    }
    if (gameoverSubtitle) {
      gameoverSubtitle.textContent =
        state.sessionMode === 'coop'
          ? 'Both NATO units neutralized. Review firing lanes and redeploy.'
          : 'Friendly armor neutralized. Review firing lanes and redeploy.';
    }
    const secVal = remoteData && remoteData.sec ? remoteData.sec : state.sectorNum;
    const sc = remoteData ? remoteData.sc : state.score;
    const kl = remoteData ? remoteData.k : state.kills;
    overWave.textContent = String(secVal).padStart(2, '0');
    overScore.textContent = String(sc).padStart(4, '0');
    overKills.textContent = String(kl);
    screenGameOver.classList.remove('hidden');

    if (state.netMode === 'p2p-host' && !remoteData && peerComms && peerComms.connected) {
      peerComms.sendEvent({ t: 'end', kind: 'gameover', sec: state.sectorNum, w: state.waveIndex, sc: state.score, k: state.kills });
    }
  }

  function triggerVictory(remoteData = null) {
    state.phase = 'victory';
    state.paused = false;
    state.settingsOpen = false;
    sfx.stopMusic();
    setBossBannerVisible(false);
    if (screenPause) screenPause.classList.add('hidden');
    if (screenSettings) screenSettings.classList.add('hidden');
    if (radarHud) radarHud.classList.add('hidden');
    if (victoryC2Code) victoryC2Code.textContent = 'C2 // SECTOR CLEARED';
    if (victoryC2Status) victoryC2Status.textContent = 'OBJ COMPLETE';
    if (victoryTitle) victoryTitle.textContent = state.sessionMode === 'coop' ? 'CO-OP VICTORY' : 'VICTORY';
    if (victorySubtitle) {
      victorySubtitle.textContent = 'Sector cleared. Tactical objective complete.';
    }
    if (btnRestartVictory) btnRestartVictory.textContent = 'NEW OPERATION';

    const sc = remoteData ? remoteData.sc : state.score;
    const kl = remoteData ? remoteData.k : state.kills;
    const p1Hp = remoteData ? remoteData.p1hp : state.player ? state.player.hp : 0;
    const p2Hp = remoteData ? remoteData.p2hp : state.player2 ? state.player2.hp : 0;
    winScore.textContent = String(sc).padStart(4, '0');
    winHp.textContent = state.sessionMode === 'coop' ? `P1 ${p1Hp} / P2 ${p2Hp}` : `${p1Hp} / ${MAX_HP}`;
    winKills.textContent = String(kl);
    screenVictory.classList.remove('hidden');

    if (state.netMode === 'p2p-host' && !remoteData && peerComms && peerComms.connected) {
      peerComms.sendEvent({
        t: 'end',
        kind: 'victory',
        sc: state.score,
        k: state.kills,
        p1hp: p1Hp,
        p2hp: p2Hp,
      });
    }
  }

  // =========================================================================
  // Realistic Tactical Rendering (Environment, Barriers, Crates, MBTs)
  // =========================================================================
  function renderFloorAndDecals() {
    ctx.drawImage(floorCanvas, 0, 0, ARENA_W, ARENA_H);
    ctx.drawImage(decalCanvas, 0, 0, ARENA_W, ARENA_H);

    // Fading rubberized tread track imprints
    for (let i = 0; i < state.treadMarks.length; i++) {
      const tm = state.treadMarks[i];
      const alpha = clamp(tm.life / tm.maxLife, 0, 1) * 0.36;
      ctx.save();
      ctx.translate(tm.x, tm.y);
      ctx.rotate(tm.angle);
      ctx.fillStyle = `rgba(10, 12, 14, ${alpha})`;
      ctx.fillRect(-3, -13, 5, 4);
      ctx.fillRect(-3, 9, 5, 4);
      ctx.restore();
    }
  }

  function renderObstacles() {
    const shX = 6;
    const shY = 8;

    // Consistent directional drop shadows from top-left sunlight
    ctx.fillStyle = 'rgba(6, 8, 10, 0.48)';
    for (let i = 0; i < state.stones.length; i++) {
      const s = state.stones[i];
      if (!s.isPerimeter) {
        ctx.fillRect(s.x + shX, s.y + shY, s.w, s.h);
      }
    }
    for (let i = 0; i < state.crates.length; i++) {
      const c = state.crates[i];
      if (c.hp > 0) ctx.fillRect(c.x + shX - 1, c.y + shY - 1, c.w - 2, c.h - 2);
    }
    for (let i = 0; i < state.tempBarriers.length; i++) {
      const tb = state.tempBarriers[i];
      if (tb.hp > 0) ctx.fillRect(tb.x + shX - 2, tb.y + shY - 2, tb.w, tb.h);
    }
    for (let i = 0; i < state.deflectors.length; i++) {
      const d = state.deflectors[i];
      const v = d.verts;
      ctx.beginPath();
      ctx.moveTo(v[0][0] + shX, v[0][1] + shY);
      ctx.lineTo(v[1][0] + shX, v[1][1] + shY);
      ctx.lineTo(v[2][0] + shX, v[2][1] + shY);
      ctx.closePath();
      ctx.fill();
    }

    // Proximity Mines on arena floor (Vanguard Boss hazard)
    for (let i = 0; i < state.mines.length; i++) {
      const m = state.mines[i];
      const armed = m.armTimer <= 0;
      const glow = 0.45 + 0.45 * Math.sin(m.pulse || 0);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.fillStyle = armed ? `rgba(239, 68, 68, ${(0.22 + glow * 0.2).toFixed(2)})` : 'rgba(245, 158, 11, 0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, m.radius + 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#181c20';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Radial prongs
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.8;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * -m.radius, Math.sin(a) * -m.radius);
        ctx.lineTo(Math.cos(a) * m.radius, Math.sin(a) * m.radius);
        ctx.stroke();
      }

      ctx.fillStyle = armed ? (glow > 0.5 ? '#ef4444' : '#fca5a5') : '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Deployable Ballistic Steel Barriers (Vanguard Boss cover)
    for (let i = 0; i < state.tempBarriers.length; i++) {
      const tb = state.tempBarriers[i];
      if (tb.hp <= 0) continue;
      ctx.save();
      ctx.fillStyle = tb.hitFlash > 0 ? '#bae6fd' : '#334155';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.6;
      ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
      ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(tb.x + 3, tb.y + 3, (tb.w - 6) * (tb.hp / tb.maxHp), 3);
      ctx.restore();
    }

    // Angled 45-Degree Brushed Steel Deflectors
    for (let i = 0; i < state.deflectors.length; i++) {
      const d = state.deflectors[i];
      const v = d.verts;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(v[0][0], v[0][1]);
      ctx.lineTo(v[1][0], v[1][1]);
      ctx.lineTo(v[2][0], v[2][1]);
      ctx.closePath();

      const cx = d.x + d.w * 0.5;
      const cy = d.y + d.h * 0.5;
      const steelGrad = ctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y + d.h);
      steelGrad.addColorStop(0, '#64748b');
      steelGrad.addColorStop(0.5, '#475569');
      steelGrad.addColorStop(1, '#334155');
      ctx.fillStyle = steelGrad;
      ctx.fill();

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Highlighted machined 45-degree ricochet hypotenuse face
      const hyp = d.edges.find((e) => e.isHyp);
      if (hyp) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(hyp.ax, hyp.ay);
        ctx.lineTo(hyp.bx, hyp.by);
        ctx.stroke();
      }

      // Corner rivet accent
      const rx = (v[0][0] + v[1][0] + v[2][0]) / 3;
      const ry = (v[0][1] + v[1][1] + v[2][1]) / 3;
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      void cx;
      void cy;
    }

    // Reinforced Concrete Blast Walls / Jersey Barriers
    for (let i = 0; i < state.stones.length; i++) {
      const s = state.stones[i];

      // Base poured concrete body
      ctx.fillStyle = '#3f454d';
      ctx.fillRect(s.x, s.y, s.w, s.h);

      // Sloped Jersey-barrier lower skirt
      ctx.fillStyle = '#535a64';
      ctx.fillRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);

      // Raised beveled top concrete crown
      ctx.fillStyle = '#626a75';
      ctx.fillRect(s.x + 6, s.y + 6, s.w - 12, s.h - 12);

      // Top & left sunlight edge highlight
      ctx.fillStyle = '#858e9b';
      ctx.fillRect(s.x + 1, s.y + 1, s.w - 2, 2.5);
      ctx.fillRect(s.x + 1, s.y + 1, 2.5, s.h - 2);
      ctx.fillRect(s.x + 6, s.y + 6, s.w - 12, 2);

      // Bottom & right shaded bevel
      ctx.fillStyle = '#292d33';
      ctx.fillRect(s.x + 1, s.y + s.h - 3.5, s.w - 2, 2.5);
      ctx.fillRect(s.x + s.w - 3.5, s.y + 1, 2.5, s.h - 2);

      // Weathering joints & tie-bolt recesses
      ctx.fillStyle = '#2f343b';
      ctx.fillRect(s.x + 9, s.y + 9, 3, 3);
      ctx.fillRect(s.x + s.w - 12, s.y + 9, 3, 3);
      ctx.fillRect(s.x + 9, s.y + s.h - 12, 3, 3);
      ctx.fillRect(s.x + s.w - 12, s.y + s.h - 12, 3, 3);

      // Muted yellow/black hazard striping on exposed barrier corners
      if (s.hazardCorner) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x + 2, s.y + s.h - 9, s.w - 4, 7);
        ctx.clip();
        ctx.fillStyle = '#181a1d';
        ctx.fillRect(s.x + 2, s.y + s.h - 9, s.w - 4, 7);
        ctx.fillStyle = '#ca8a04';
        for (let sx = -12; sx < s.w + 12; sx += 10) {
          ctx.beginPath();
          ctx.moveTo(s.x + sx, s.y + s.h - 2);
          ctx.lineTo(s.x + sx + 5, s.y + s.h - 2);
          ctx.lineTo(s.x + sx + 10, s.y + s.h - 9);
          ctx.lineTo(s.x + sx + 5, s.y + s.h - 9);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Military Olive-Drab Supply Crates with Steel Brackets & Ammo Stencils
    for (let i = 0; i < state.crates.length; i++) {
      const c = state.crates[i];
      if (c.hp <= 0) continue;

      const pad = 3;
      const x = c.x + pad;
      const y = c.y + pad;
      const w = c.w - pad * 2;
      const h = c.h - pad * 2;

      // Olive drab wooden body
      ctx.fillStyle = c.hitFlash > 0 ? '#d9f99d' : '#3a4227';
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = c.hitFlash > 0 ? '#bef264' : '#4b5532';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

      // Slat grooves
      ctx.strokeStyle = '#2d331d';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + h * 0.34);
      ctx.lineTo(x + w - 3, y + h * 0.34);
      ctx.moveTo(x + 3, y + h * 0.67);
      ctx.lineTo(x + w - 3, y + h * 0.67);
      ctx.stroke();

      // Dark gunmetal steel corner brackets + rivets
      const br = 7;
      ctx.fillStyle = '#23272d';
      // Top-left, top-right, bottom-left, bottom-right L-brackets
      ctx.fillRect(x, y, br, 3);
      ctx.fillRect(x, y, 3, br);
      ctx.fillRect(x + w - br, y, br, 3);
      ctx.fillRect(x + w - 3, y, 3, br);
      ctx.fillRect(x, y + h - 3, br, 3);
      ctx.fillRect(x, y + h - br, 3, br);
      ctx.fillRect(x + w - br, y + h - 3, br, 3);
      ctx.fillRect(x + w - 3, y + h - br, 3, br);

      // Steel rivets
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(x + 1, y + 1, 1.5, 1.5);
      ctx.fillRect(x + w - 2.5, y + 1, 1.5, 1.5);
      ctx.fillRect(x + 1, y + h - 2.5, 1.5, 1.5);
      ctx.fillRect(x + w - 2.5, y + h - 2.5, 1.5, 1.5);

      // Stenciled ammo markings (chevron + caliber bar)
      ctx.fillStyle = c.hitFlash > 0 ? '#365314' : 'rgba(217, 179, 86, 0.72)';
      ctx.fillRect(x + 9, y + 12, w - 18, 2.2);
      ctx.fillRect(x + 11, y + 16, w - 22, 2);
      ctx.fillRect(x + 13, y + 20, w - 26, 2);

      // Structural fracture if damaged (hp === 1)
      if (c.hp === 1) {
        ctx.strokeStyle = '#141612';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 9);
        ctx.lineTo(x + 15, y + 17);
        ctx.lineTo(x + 12, y + 27);
        ctx.moveTo(x + 15, y + 17);
        ctx.lineTo(x + 26, y + 22);
        ctx.stroke();
      }
    }
  }

  function drawCamoPattern(g, camoMode, camoA, camoB, isTurret) {
    if (!camoMode) return;
    g.save();
    g.clip();
    if (camoMode === 'splinter' || camoMode === 'arctic') {
      // Angular splinter geometry
      g.fillStyle = camoA;
      g.beginPath();
      if (isTurret) {
        g.moveTo(-10, -8);
        g.lineTo(-1, -8);
        g.lineTo(-4, 2);
        g.lineTo(-10, 0);
      } else {
        g.moveTo(-14, -9);
        g.lineTo(-2, -9);
        g.lineTo(-7, 3);
        g.lineTo(-14, 1);
      }
      g.closePath();
      g.fill();

      g.beginPath();
      if (isTurret) {
        g.moveTo(2, 1);
        g.lineTo(10, -1);
        g.lineTo(9, 7);
        g.lineTo(-1, 8);
      } else {
        g.moveTo(4, -1);
        g.lineTo(16, -5);
        g.lineTo(16, 4);
        g.lineTo(2, 6);
      }
      g.closePath();
      g.fill();

      g.fillStyle = camoB;
      g.beginPath();
      if (isTurret) {
        g.moveTo(-2, -8);
        g.lineTo(8, -5);
        g.lineTo(3, 2);
        g.lineTo(-5, -1);
      } else {
        g.moveTo(-3, -9);
        g.lineTo(9, -9);
        g.lineTo(4, 1);
        g.lineTo(-6, -2);
      }
      g.closePath();
      g.fill();

      if (!isTurret) {
        g.beginPath();
        g.moveTo(-13, 3);
        g.lineTo(1, 2);
        g.lineTo(-3, 9);
        g.lineTo(-14, 9);
        g.closePath();
        g.fill();
      }
    } else {
      // Organic woodland / desert camo blotches
      g.fillStyle = camoA;
      g.beginPath();
      g.ellipse(isTurret ? -4 : -7, isTurret ? -3 : -5, isTurret ? 5 : 6.5, isTurret ? 3.2 : 4, -0.35, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(isTurret ? 4 : 8, isTurret ? 3 : 4, isTurret ? 4.2 : 5.5, isTurret ? 2.6 : 3.4, 0.45, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = camoB;
      g.beginPath();
      g.ellipse(isTurret ? 3 : 7, isTurret ? -4 : -4.5, isTurret ? 3.8 : 5, isTurret ? 2.4 : 3.2, 0.3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(isTurret ? -4 : -6, isTurret ? 4 : 5.5, isTurret ? 3.5 : 5, isTurret ? 2.2 : 3, -0.25, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function drawModernMBT(x, y, hullAngle, turretAngle, recoil, palette, treadPhase, options = {}) {
    const g = options.ctx || ctx;
    // Angled directional ground shadow (sunlight from top-left -> offset +6, +8)
    g.save();
    g.translate(x + 6, y + 8);
    g.rotate(hullAngle);
    g.fillStyle = 'rgba(6, 8, 10, 0.48)';
    g.beginPath();
    if (typeof g.roundRect === 'function') {
      g.roundRect(-19, -15, 38, 30, 4);
    } else {
      g.rect(-19, -15, 38, 30);
    }
    g.fill();
    g.restore();

    if (options.stationaryBase) {
      // Reinforced charcoal concrete/steel turret emplacement
      g.save();
      g.translate(x, y);
      g.fillStyle = '#1b1f24';
      g.strokeStyle = '#3f454e';
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + Math.PI / 8;
        const px = Math.cos(a) * 18;
        const py = Math.sin(a) * 18;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      g.stroke();

      // Crimson aggressor warning ring
      g.strokeStyle = '#b91c1c';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, 12.5, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    } else {
      // Modern MBT Hull & Rubberized Tracks
      g.save();
      g.translate(x, y);
      g.rotate(hullAngle);

      // Left & right rubberized tracks
      g.fillStyle = '#17191c';
      g.fillRect(-18, -15.5, 36, 6);
      g.fillRect(-18, 9.5, 36, 6);

      // Animated rubber track pads
      g.fillStyle = '#2d3238';
      const offset = ((treadPhase % 5) + 5) % 5;
      for (let tx = -16 + offset; tx < 16; tx += 5) {
        g.fillRect(tx, -15, 2.2, 5);
        g.fillRect(tx, 10, 2.2, 5);
      }

      // Main hull chassis with sloped front glacis
      g.fillStyle = palette.hullDark;
      g.beginPath();
      g.moveTo(-16, -11);
      g.lineTo(13, -11);
      g.lineTo(18, -7);
      g.lineTo(18, 7);
      g.lineTo(13, 11);
      g.lineTo(-16, 11);
      g.closePath();
      g.fill();

      // Top composite hull deck + optional camo pattern
      g.fillStyle = palette.hull;
      g.beginPath();
      g.moveTo(-14, -9);
      g.lineTo(12, -9);
      g.lineTo(16, -5.5);
      g.lineTo(16, 5.5);
      g.lineTo(12, 9);
      g.lineTo(-14, 9);
      g.closePath();
      g.fill();
      if (options.camoMode) {
        drawCamoPattern(g, options.camoMode, options.camoA, options.camoB, false);
      }

      // Camo / accent patches on enemy aggressor or ERA blocks on player
      g.fillStyle = palette.era;
      for (let ex = -8; ex <= 6; ex += 7) {
        g.fillRect(ex, -11.5, 5, 2.5);
        g.fillRect(ex, 9, 5, 2.5);
      }

      // Sloped front glacis armor seam & driver periscope
      g.strokeStyle = palette.seam;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(11, -9);
      g.lineTo(11, 9);
      g.stroke();
      g.fillStyle = '#111827';
      g.fillRect(11.5, -2.5, 2.5, 5);

      // Rear engine deck grilles & twin exhaust ports
      g.fillStyle = '#181b1f';
      g.fillRect(-14, -6.5, 7, 13);
      g.fillStyle = palette.hullDark;
      for (let gy = -5; gy <= 5; gy += 3) {
        g.fillRect(-13.5, gy, 6, 1.3);
      }
      // Exhaust shrouds
      g.fillStyle = '#272b30';
      g.fillRect(-17.5, -7, 2.5, 3.5);
      g.fillRect(-17.5, 3.5, 2.5, 3.5);

      if (options.stripeColor) {
        g.fillStyle = options.stripeColor;
        g.fillRect(4, -7.5, 3, 15);
      }

      g.restore();
    }

    // Separate Rotating Turret, Bore Evacuator Cannon, Hatch & Whip Antenna
    g.save();
    g.translate(x, y);
    g.rotate(turretAngle);

    const kick = -recoil;

    // Aggressor lock-on laser warning glint
    if (options.aimCharge && options.aimCharge > 0.02) {
      g.strokeStyle = `rgba(239, 68, 68, ${Math.min(0.8, options.aimCharge * 3.2)})`;
      g.lineWidth = 1.2;
      g.setLineDash([5, 5]);
      g.beginPath();
      g.moveTo(26, 0);
      g.lineTo(140, 0);
      g.stroke();
      g.setLineDash([]);
    }

    // Main Cannon(s) with Bore Evacuator & Slotted Muzzle Brake
    const drawBarrel = (yOff) => {
      // Main barrel tube
      g.fillStyle = palette.barrelDark;
      g.fillRect(6 + kick, yOff - 2.3, 21, 4.6);
      g.fillStyle = palette.barrel;
      g.fillRect(6 + kick, yOff - 1.5, 20, 3);

      // Bore evacuator (fume extractor bulge mid-barrel)
      g.fillStyle = palette.era;
      g.fillRect(14 + kick, yOff - 3.1, 5.5, 6.2);
      g.fillStyle = palette.barrel;
      g.fillRect(14.5 + kick, yOff - 2.1, 4.5, 4.2);

      // Slotted muzzle brake
      g.fillStyle = '#1f2429';
      g.fillRect(25 + kick, yOff - 3.2, 4.2, 6.4);
      g.fillStyle = palette.accent;
      g.fillRect(26 + kick, yOff - 2.2, 1.6, 4.4);
    };

    if (options.twin) {
      drawBarrel(-4.2);
      drawBarrel(4.2);
    } else {
      drawBarrel(0);
    }

    // Angular Modern Composite Turret Silhouette (cheeks + rear bustle)
    g.fillStyle = palette.turretDark;
    g.beginPath();
    g.moveTo(-11, -7.5);
    g.lineTo(3, -9.5);
    g.lineTo(11, -4.5);
    g.lineTo(11, 4.5);
    g.lineTo(3, 9.5);
    g.lineTo(-11, 7.5);
    g.closePath();
    g.fill();

    g.fillStyle = palette.turret;
    g.beginPath();
    g.moveTo(-9.5, -6);
    g.lineTo(2.5, -7.8);
    g.lineTo(9.2, -3.5);
    g.lineTo(9.2, 3.5);
    g.lineTo(2.5, 7.8);
    g.lineTo(-9.5, 6);
    g.closePath();
    g.fill();
    if (options.camoMode) {
      drawCamoPattern(g, options.camoMode, options.camoA, options.camoB, true);
    }

    // Gunner optic sight housing (front-right cheek)
    const opticCol = options.opticColor || (options.isPlayer ? '#84cc16' : '#ef4444');
    g.fillStyle = '#111827';
    g.fillRect(3, 3.2, 4, 3);
    g.fillStyle = opticCol;
    g.fillRect(6, 3.8, 1.4, 1.8);

    // Commander Cupola Hatch
    g.fillStyle = palette.turretDark;
    g.beginPath();
    g.arc(-2.5, -2, 4.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = palette.accent;
    g.beginPath();
    g.arc(-2.5, -2, 2.8, 0, Math.PI * 2);
    g.fill();

    // Rear turret bustle rack
    g.strokeStyle = palette.seam;
    g.lineWidth = 1;
    g.strokeRect(-11, -5.5, 3.2, 11);

    // Whip antenna extending from rear bustle with dynamic sway
    const sway = options.antennaSway || 0;
    g.strokeStyle = 'rgba(209, 213, 219, 0.65)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-9, -6);
    g.quadraticCurveTo(-15, -8 + sway * 10, -21, -10 + sway * 18);
    g.stroke();
    g.fillStyle = opticCol;
    g.beginPath();
    g.arc(-21, -10 + sway * 18, 1.3, 0, Math.PI * 2);
    g.fill();

    g.restore();
  }

  function renderLiveryPreviews() {
    const keys = Object.keys(LIVERY_CATALOG);
    for (let i = 0; i < keys.length; i++) {
      const id = keys[i];
      const previewCanvas = document.getElementById(`livery-canvas-${id}`);
      if (!previewCanvas) continue;
      const pCtx = previewCanvas.getContext('2d');
      if (!pCtx) continue;
      const cfg = LIVERY_CATALOG[id];
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = 104;
      const cssH = 64;
      if (previewCanvas.width !== Math.round(cssW * dpr) || previewCanvas.height !== Math.round(cssH * dpr)) {
        previewCanvas.width = Math.round(cssW * dpr);
        previewCanvas.height = Math.round(cssH * dpr);
      }
      pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pCtx.clearRect(0, 0, cssW, cssH);
      pCtx.save();
      pCtx.translate(cssW * 0.48, cssH * 0.54);
      pCtx.scale(1.18, 1.18);
      drawModernMBT(0, 0, -0.32, -0.14, 0, cfg.palette, 1.5, {
        ctx: pCtx,
        isPlayer: true,
        camoMode: cfg.camoMode,
        camoA: cfg.camoA,
        camoB: cfg.camoB,
        opticColor: cfg.opticColor,
        antennaSway: 0.1,
      });
      pCtx.restore();
    }
  }

  function renderTanks() {
    // Aggressor Enemy MBTs & Command Bosses
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (!e.alive) continue;

      let palette;
      let stripeColor = '#991b1b';
      let opticColor = '#ef4444';
      let tankScale = 1.0;

      if (e.type === 'boss_juggernaut') {
        tankScale = 1.24;
        stripeColor = '#f59e0b';
        opticColor = '#fbbf24';
        palette = {
          hullDark: '#16181c',
          hull: '#252930',
          era: '#991b1b',
          turretDark: '#1a1d22',
          turret: '#2f353d',
          barrelDark: '#121418',
          barrel: '#525b66',
          accent: '#f59e0b',
          seam: '#0b0d10',
        };
      } else if (e.type === 'boss_sniper') {
        tankScale = 1.1;
        stripeColor = '#f43f5e';
        opticColor = '#ff2e4c';
        palette = {
          hullDark: '#1e242c',
          hull: '#313a46',
          era: '#be123c',
          turretDark: '#232a33',
          turret: '#3c4755',
          barrelDark: '#161b22',
          barrel: '#64748b',
          accent: '#fb7185',
          seam: '#0f1318',
        };
      } else if (e.type === 'boss_vanguard') {
        tankScale = 1.15;
        stripeColor = '#38bdf8';
        opticColor = '#38bdf8';
        palette = {
          hullDark: '#192129',
          hull: '#26323e',
          era: '#b91c1c',
          turretDark: '#1e2730',
          turret: '#30404f',
          barrelDark: '#141a20',
          barrel: '#4f6275',
          accent: '#38bdf8',
          seam: '#0d1116',
        };
      } else if (e.type === 'commander') {
        stripeColor = '#f59e0b';
        palette = {
          hullDark: '#1c2024',
          hull: '#2b3036',
          era: '#7f1d1d',
          turretDark: '#202429',
          turret: '#343a42',
          barrelDark: '#181b1f',
          barrel: '#48505a',
          accent: '#f59e0b',
          seam: '#111417',
        };
      } else if (e.type === 'hunter') {
        stripeColor = '#dc2626';
        palette = {
          hullDark: '#1b1e23',
          hull: '#282d33',
          era: '#991b1b',
          turretDark: '#1f2329',
          turret: '#31373f',
          barrelDark: '#171a1e',
          barrel: '#434a54',
          accent: '#ef4444',
          seam: '#0f1215',
        };
      } else {
        palette = {
          hullDark: '#1f2328',
          hull: '#2d3339',
          era: '#7f1d1d',
          turretDark: '#24292f',
          turret: '#363d45',
          barrelDark: '#191c20',
          barrel: '#4a525c',
          accent: '#dc2626',
          seam: '#131619',
        };
      }

      if (e.hitFlash > 0) {
        palette = {
          ...palette,
          hull: '#fde68a',
          turret: '#fef08a',
        };
      }

      ctx.save();
      if (tankScale !== 1.0) {
        ctx.translate(e.x, e.y);
        ctx.scale(tankScale, tankScale);
        drawModernMBT(0, 0, e.hullAngle, e.turretAngle, e.recoil, palette, e.treadPhase, {
          stationaryBase: e.type === 'turret',
          twin: e.twin,
          aimCharge: e.aimCharge,
          antennaSway: e.antennaSway,
          stripeColor,
          opticColor,
          isPlayer: false,
        });
      } else {
        drawModernMBT(e.x, e.y, e.hullAngle, e.turretAngle, e.recoil, palette, e.treadPhase, {
          stationaryBase: e.type === 'turret',
          twin: e.twin,
          aimCharge: e.aimCharge,
          antennaSway: e.antennaSway,
          stripeColor,
          opticColor,
          isPlayer: false,
        });
      }
      ctx.restore();

      // Boss Aura Ring & Floating Armor HP Bar for multi-HP enemies
      if (e.isBoss) {
        ctx.save();
        ctx.strokeStyle = e.type === 'boss_sniper' ? 'rgba(244, 63, 94, 0.55)' : e.type === 'boss_vanguard' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(245, 158, 11, 0.55)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (e.maxHp > 1) {
        const barW = e.isBoss ? 44 : 28;
        const barH = e.isBoss ? 5 : 4;
        const bx = e.x - barW * 0.5;
        const by = e.y - e.radius - (e.isBoss ? 14 : 11);
        ctx.save();
        ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
        const segGap = 1.5;
        const segW = (barW - segGap * (e.maxHp - 1)) / e.maxHp;
        for (let hpIdx = 0; hpIdx < e.maxHp; hpIdx++) {
          ctx.fillStyle = hpIdx < e.hp ? (e.isBoss ? '#ef4444' : '#f59e0b') : 'rgba(55, 65, 81, 0.5)';
          ctx.fillRect(bx + hpIdx * (segW + segGap), by, Math.max(1.5, segW), barH);
        }
        if (e.isBoss) {
          ctx.font = '800 8px ui-monospace, SFMono-Regular, Menlo, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fca5a5';
          ctx.fillText(BOSS_DEFS[e.type] ? BOSS_DEFS[e.type].name : 'COMMAND', e.x, by - 3);
        }
        ctx.restore();
      }
    }

    // Local Player Selected Camo Livery & Wingman (Complementary in Co-Op or Crimson in Duel)
    const myLivery = getLiveryConfig(userSettings.livery);
    const wingmanLivery = myLivery.id === 'desert' ? LIVERY_CATALOG.olive : LIVERY_CATALOG.desert;
    const localIsP2Coop = state.netMode === 'p2p-client' && state.sessionMode === 'coop';
    const playerUnits = [
      { tank: state.player, label: 'P1', isP2: false },
      { tank: state.player2, label: 'P2', isP2: true },
    ];
    for (let pi = 0; pi < playerUnits.length; pi++) {
      const { tank: p, label, isP2 } = playerUnits[pi];
      if (!p || !p.alive) continue;

      const isDuelP2 = isP2 && state.sessionMode === 'duel';
      const activeCfg = (isP2 === localIsP2Coop) ? myLivery : wingmanLivery;
      const palette = isDuelP2
        ? {
            hullDark: '#1b1e23',
            hull: '#282d33',
            era: '#991b1b',
            turretDark: '#1f2329',
            turret: '#31373f',
            barrelDark: '#171a1e',
            barrel: '#434a54',
            accent: '#ef4444',
            seam: '#0f1215',
          }
        : activeCfg.palette;

      const blinkHide = p.invulnTimer > 0 && Math.floor(p.invulnTimer * 14) % 2 === 0;
      if (!blinkHide) {
        drawModernMBT(p.x, p.y, p.hullAngle, p.turretAngle, p.recoil, palette, p.treadPhase, {
          antennaSway: p.antennaSway,
          isPlayer: !isDuelP2,
          stripeColor: isDuelP2 ? '#dc2626' : isP2 ? '#f59e0b' : null,
          camoMode: isDuelP2 ? null : activeCfg.camoMode,
          camoA: isDuelP2 ? null : activeCfg.camoA,
          camoB: isDuelP2 ? null : activeCfg.camoB,
          opticColor: isDuelP2 ? '#ef4444' : activeCfg.opticColor,
        });
      }

      if (p.buffs.rapid > 0 || p.buffs.spread > 0 || p.buffs.turbo > 0) {
        const ringColor =
          p.buffs.spread > 0
            ? 'rgba(245, 158, 11, 0.58)'
            : p.buffs.rapid > 0
            ? 'rgba(14, 165, 233, 0.58)'
            : 'rgba(132, 204, 22, 0.58)';
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (p.invulnTimer > 0) {
        ctx.strokeStyle = isDuelP2 ? 'rgba(248, 113, 113, 0.65)' : 'rgba(190, 242, 100, 0.6)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (state.sessionMode === 'duel' || state.sessionMode === 'coop') {
        ctx.save();
        ctx.font = '800 9px ui-monospace, SFMono-Regular, Menlo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(12, 16, 19, 0.78)';
        ctx.fillRect(p.x - 10, p.y - 29, 20, 11);
        ctx.fillStyle = isDuelP2 ? '#f87171' : isP2 ? '#fcd34d' : '#bef264';
        ctx.fillText(label, p.x, p.y - 21);
        ctx.restore();
      }
    }
  }

  function renderPowerUps() {
    for (let i = 0; i < state.powerUps.length; i++) {
      const pu = state.powerUps[i];
      if (pu.life < 3.0 && Math.floor(pu.life * 8) % 2 === 0) continue;

      const def = POWERUP_DEFS[pu.type];
      const bob = Math.sin(pu.age * 4.5) * 2.2;
      const pulse = 1 + Math.sin(pu.age * 6) * 0.08;

      ctx.save();
      ctx.translate(pu.x, pu.y + bob);

      ctx.fillStyle = def.glow;
      ctx.beginPath();
      ctx.arc(0, 0, (pu.radius + 5) * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.rotate(pu.age * 0.7);
      ctx.fillStyle = '#121619';
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + Math.PI / 8;
        const px = Math.cos(a) * pu.radius;
        const py = Math.sin(a) * pu.radius;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = def.accent;
      ctx.fillStyle = def.accent;
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pu.type === 'rapid') {
        ctx.beginPath();
        ctx.moveTo(-5, -5);
        ctx.lineTo(0, 0);
        ctx.lineTo(-5, 5);
        ctx.moveTo(1, -5);
        ctx.lineTo(6, 0);
        ctx.lineTo(1, 5);
        ctx.stroke();
      } else if (pu.type === 'spread') {
        const angles = [-0.5, 0, 0.5];
        for (let k = 0; k < angles.length; k++) {
          const ang = angles[k] - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(0, 5);
          ctx.lineTo(Math.cos(ang) * 7, Math.sin(ang) * 7 + 1);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * 7, Math.sin(ang) * 7 + 1, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(-6, 3);
        ctx.lineTo(0, -4);
        ctx.lineTo(6, 3);
        ctx.moveTo(-4, 7);
        ctx.lineTo(0, 2);
        ctx.lineTo(4, 7);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function renderActiveBuffBar() {
    const p = state.netMode === 'p2p-client' ? state.player2 : state.player;
    if (!p || !p.alive || state.phase !== 'playing') return;

    const active = [];
    ['rapid', 'spread', 'turbo'].forEach((key) => {
      if (p.buffs[key] > 0) {
        active.push({ def: POWERUP_DEFS[key], remaining: p.buffs[key] });
      }
    });
    if (active.length === 0) return;

    const pillW = 104;
    const pillH = 24;
    const gap = 6;
    let startX = 12;
    const y = 10;

    for (let i = 0; i < active.length; i++) {
      const { def, remaining } = active[i];
      const frac = clamp(remaining / def.duration, 0, 1);

      ctx.save();
      ctx.globalAlpha = state.uiOpacity;
      ctx.fillStyle = 'rgba(18, 22, 25, 0.94)';
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(startX, y, pillW, pillH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.font = '800 10px ui-monospace, SFMono-Regular, Menlo, sans-serif';
      ctx.fillStyle = def.accent;
      ctx.textAlign = 'left';
      ctx.fillText(def.short, startX + 7, y + 14);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(`${remaining.toFixed(1)}s`, startX + pillW - 7, y + 14);

      ctx.fillStyle = 'rgba(55, 65, 81, 0.7)';
      ctx.fillRect(startX + 6, y + pillH - 5, pillW - 12, 2.5);
      ctx.fillStyle = def.color;
      ctx.fillRect(startX + 6, y + pillH - 5, (pillW - 12) * frac, 2.5);
      ctx.restore();

      startX += pillW + gap;
    }
  }

  function renderTankLaserSight(p, aimAngle, touchState, isCrimson) {
    if (!p || !p.alive) return;
    const dx = Math.cos(aimAngle);
    const dy = Math.sin(aimAngle);
    const muzzleX = p.x + dx * 27;
    const muzzleY = p.y + dy * 27;

    const primary = raycastObstacles(muzzleX, muzzleY, dx, dy, 960);

    ctx.save();
    const isStickCancelled = touchState && touchState.aimActive && !touchState.aimArmed;
    const isStickArmed = touchState && touchState.aimActive && touchState.aimArmed;
    const beamAlpha = isStickCancelled ? 0.16 : isStickArmed ? 0.72 : 0.42;
    const bounceAlpha = isStickCancelled ? 0.08 : isStickArmed ? 0.52 : 0.28;

    const baseRgb = isCrimson ? '239, 68, 68' : p.buffs.spread > 0 || isStickArmed ? '245, 158, 11' : '132, 204, 22';
    ctx.strokeStyle = `rgba(${baseRgb}, ${beamAlpha})`;
    ctx.lineWidth = isStickArmed ? 1.7 : 1.3;
    ctx.setLineDash(isStickCancelled ? [3, 6] : [7, 5]);
    ctx.beginPath();
    ctx.moveTo(muzzleX, muzzleY);
    ctx.lineTo(primary.x, primary.y);
    ctx.stroke();

    if (primary.hit) {
      ctx.setLineDash([]);
      ctx.fillStyle = isCrimson ? '#f87171' : isStickArmed || p.buffs.spread > 0 ? '#fbbf24' : '#a3e635';
      ctx.beginPath();
      ctx.arc(primary.x, primary.y, isStickArmed ? 3.4 : 2.8, 0, Math.PI * 2);
      ctx.fill();

      const dot = dx * primary.nx + dy * primary.ny;
      const rx = dx - 2 * dot * primary.nx;
      const ry = dy - 2 * dot * primary.ny;
      const bounceRay = raycastObstacles(primary.x + primary.nx * 0.6, primary.y + primary.ny * 0.6, rx, ry, 260);

      ctx.strokeStyle = `rgba(${baseRgb}, ${bounceAlpha})`;
      ctx.lineWidth = isStickArmed ? 1.4 : 1.1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(primary.x, primary.y);
      ctx.lineTo(bounceRay.x, bounceRay.y);
      ctx.stroke();
    }

    if (p.buffs.spread > 0) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      [-0.17, 0.17].forEach((offset) => {
        const sx = Math.cos(aimAngle + offset);
        const sy = Math.sin(aimAngle + offset);
        const sideHit = raycastObstacles(p.x + sx * 24, p.y + sy * 24, sx, sy, 190);
        ctx.beginPath();
        ctx.moveTo(p.x + sx * 24, p.y + sy * 24);
        ctx.lineTo(sideHit.x, sideHit.y);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  // Tactical Laser Rangefinder with Primary Ricochet Trajectory & Sniper Boss 2-Bounce Laser
  function renderLaserRangefinder() {
    const isAttract = state.phase === 'start';
    if (!isAttract && state.phase !== 'playing') return;

    // Render Sniper Boss visible red targeting laser (up to 2 ricochet bounces) during combat
    if (!isAttract) {
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (!e.alive || e.type !== 'boss_sniper') continue;
        if (e.sniperLockAngle === null && e.aimCharge <= 0.02) continue;

        ctx.save();
        let ox = e.x + Math.cos(e.turretAngle) * 26;
        let oy = e.y + Math.sin(e.turretAngle) * 26;
        let dx = Math.cos(e.turretAngle);
        let dy = Math.sin(e.turretAngle);
        const locking = e.aimCharge > 0.05;

        for (let b = 0; b <= 2; b++) {
          const hit = raycastObstacles(ox, oy, dx, dy, b === 0 ? 520 : 280);
          const alpha = b === 0 ? (locking ? 0.72 : 0.42) : b === 1 ? (locking ? 0.5 : 0.28) : (locking ? 0.34 : 0.16);
          ctx.strokeStyle = `rgba(244, 63, 94, ${alpha})`;
          ctx.lineWidth = b === 0 && locking ? 1.8 : 1.1;
          ctx.setLineDash(b === 0 ? [8, 4] : [4, 5]);
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(hit.x, hit.y);
          ctx.stroke();

          if (!hit.hit) break;
          ctx.setLineDash([]);
          ctx.fillStyle = `rgba(251, 113, 133, ${Math.min(0.85, alpha + 0.2)})`;
          ctx.beginPath();
          ctx.arc(hit.x, hit.y, 2.5, 0, Math.PI * 2);
          ctx.fill();

          const dot = dx * hit.nx + dy * hit.ny;
          dx = dx - 2 * dot * hit.nx;
          dy = dy - 2 * dot * hit.ny;
          ox = hit.x + hit.nx * 0.6;
          oy = hit.y + hit.ny * 0.6;
        }
        ctx.restore();
      }
    }

    if (isAttract) {
      ctx.save();
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (!e.alive) continue;
        const edx = Math.cos(e.turretAngle);
        const edy = Math.sin(e.turretAngle);
        const emx = e.x + edx * 24;
        const emy = e.y + edy * 24;
        const hit = raycastObstacles(emx, emy, edx, edy, 440);

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.36)';
        ctx.lineWidth = 1.1;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(emx, emy);
        ctx.lineTo(hit.x, hit.y);
        ctx.stroke();

        if (hit.hit) {
          const edot = edx * hit.nx + edy * hit.ny;
          const erx = edx - 2 * edot * hit.nx;
          const ery = edy - 2 * edot * hit.ny;
          const bounce = raycastObstacles(hit.x + hit.nx * 0.6, hit.y + hit.ny * 0.6, erx, ery, 160);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
          ctx.setLineDash([3, 6]);
          ctx.beginPath();
          ctx.moveTo(hit.x, hit.y);
          ctx.lineTo(bounce.x, bounce.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (state.netMode === 'p2p-client') {
      const p2 = state.player2;
      if (p2 && p2.alive) {
        let localAim = p2.turretAngle;
        if (state.touch.aimActive && state.touch.aimArmed) localAim = state.touch.aimAngle;
        else if (state.mouse.active || state.touch.canvasAimDown) {
          localAim = Math.atan2(state.mouse.y - p2.y, state.mouse.x - p2.x);
        }
        renderTankLaserSight(p2, localAim, state.touch, state.sessionMode === 'duel');
      }
    } else {
      if (state.player && state.player.alive) {
        renderTankLaserSight(state.player, state.player.turretAngle, state.touch, false);
      }
      if (state.netMode === 'local-split' && state.player2 && state.player2.alive) {
        renderTankLaserSight(
          state.player2,
          state.player2.turretAngle,
          state.p2Touch,
          state.sessionMode === 'duel'
        );
      }
    }

    const activeLocalTank = state.netMode === 'p2p-client' ? state.player2 : state.player;
    if (activeLocalTank && activeLocalTank.alive && (state.mouse.active || state.touch.canvasAimDown)) {
      const mx = state.mouse.x;
      const my = state.mouse.y;
      ctx.save();
      ctx.strokeStyle =
        activeLocalTank.buffs.spread > 0 ? 'rgba(251, 191, 36, 0.85)' : 'rgba(163, 230, 53, 0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(mx, my, 8, 0, Math.PI * 2);
      ctx.moveTo(mx - 12, my);
      ctx.lineTo(mx - 5, my);
      ctx.moveTo(mx + 5, my);
      ctx.lineTo(mx + 12, my);
      ctx.moveTo(mx, my - 12);
      ctx.lineTo(mx, my - 5);
      ctx.moveTo(mx, my + 5);
      ctx.lineTo(mx, my + 12);
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderBullets() {
    for (let i = 0; i < state.bullets.length; i++) {
      const b = state.bullets[i];
      const isFriendly = b.owner === 'player' || (b.owner === 'p2' && state.sessionMode === 'coop');
      const tracerColor = b.bounced ? '#fde047' : isFriendly ? '#f59e0b' : '#ef4444';
      const glowColor = b.bounced
        ? 'rgba(253, 224, 71, 0.42)'
        : isFriendly
        ? 'rgba(245, 158, 11, 0.38)'
        : 'rgba(239, 68, 68, 0.38)';

      if (b.trail.length > 1) {
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.trail[0].x, b.trail[0].y);
        for (let t = 1; t < b.trail.length; t++) {
          ctx.lineTo(b.trail[t].x, b.trail[t].y);
        }
        ctx.stroke();
      }

      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tracerColor;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderEffects() {
    particleSystem.render(ctx);

    for (let i = 0; i < state.popups.length; i++) {
      const pop = state.popups[i];
      const alpha = clamp(pop.life / Math.min(0.45, pop.maxLife), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '800 15px ui-monospace, SFMono-Regular, Menlo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(12, 15, 18, 0.9)';
      ctx.fillText(pop.text, pop.x + 1.5, pop.y + 1.5);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }

  }

  function renderFullCanvasHitFlash() {
    if (state.damageFlash <= 0 || state.phase === 'start') return;

    const dpr = state.dpr || 1;
    const w = state.displayW || canvas.width / dpr;
    const h = state.displayH || canvas.height / dpr;
    const dur = Math.max(0.01, state.damageFlashDuration || HIT_FLASH_DURATION);
    const norm = clamp(state.damageFlash / dur, 0, 1);
    const ease = norm * norm;
    const strength = clamp(state.damageFlashIntensity || 1.0, 0.5, 1.35);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Brief high-energy kinetic impact spike over the initial ~50ms
    if (norm > 0.78) {
      const spikeAlpha = clamp(((norm - 0.78) / 0.22) * 0.22 * strength, 0, 0.28);
      ctx.fillStyle = `rgba(255, 215, 200, ${spikeAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Full-canvas crimson wash
    const washAlpha = clamp(0.28 * ease * strength, 0, 0.42);
    ctx.fillStyle = `rgba(220, 38, 38, ${washAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);

    // Tactical radial damage vignette across the entire canvas
    const cx = w * 0.5;
    const cy = h * 0.5;
    const outerR = Math.hypot(cx, cy);
    const vig = ctx.createRadialGradient(cx, cy, outerR * 0.32, cx, cy, outerR);
    vig.addColorStop(0, 'rgba(153, 27, 27, 0)');
    vig.addColorStop(0.7, `rgba(185, 28, 28, ${(0.24 * ease * strength).toFixed(3)})`);
    vig.addColorStop(1, `rgba(127, 29, 29, ${(0.56 * ease * strength).toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Crisp crimson perimeter alert border
    ctx.strokeStyle = `rgba(248, 113, 113, ${(0.65 * ease * strength).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, Math.max(1, w - 3), Math.max(1, h - 3));

    ctx.restore();
  }

  function render() {
    if (state.phase === 'start' && state.displayW && state.displayH) {
      const coverScale = Math.max(state.displayW / ARENA_W, state.displayH / ARENA_H);
      const offX = (state.displayW - ARENA_W * coverScale) * 0.5;
      const offY = (state.displayH - ARENA_H * coverScale) * 0.5;
      ctx.setTransform(
        state.dpr * coverScale,
        0,
        0,
        state.dpr * coverScale,
        state.dpr * offX,
        state.dpr * offY
      );
    } else {
      ctx.setTransform(state.dpr * state.renderScaleX, 0, 0, state.dpr * state.renderScaleY, 0, 0);
    }

    ctx.fillStyle = '#121619';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    ctx.save();
    if (state.shakeTime > 0) {
      const progress = clamp(state.shakeTime / Math.max(0.001, state.shakeDuration), 0, 1);
      const mag = state.shakeIntensity * progress * progress;
      const jitterX = (Math.random() - 0.5) * mag * 2;
      const jitterY = (Math.random() - 0.5) * mag * 2;
      const impulse = Math.sin(progress * Math.PI) * mag * 0.45;
      ctx.translate(jitterX + state.shakeDirX * impulse, jitterY + state.shakeDirY * impulse);
    }

    renderFloorAndDecals();
    renderObstacles();
    renderPowerUps();
    renderLaserRangefinder();
    renderTanks();
    renderBullets();
    renderEffects();
    if (state.phase !== 'start') {
      renderActiveBuffBar();
    }

    ctx.restore();

    renderFullCanvasHitFlash();
  }

  function renderRadar(now) {
    if (!radarCtx || !radarCanvas || (state.phase !== 'playing' && state.phase !== 'wave_transition')) {
      return;
    }

    const rSize = radarHud ? radarHud.clientWidth || 86 : 86;
    const dpr = state.dpr || 1;
    if (radarCanvas.width !== Math.round(rSize * dpr)) {
      radarCanvas.width = Math.round(rSize * dpr);
      radarCanvas.height = Math.round(rSize * dpr);
    }

    const rc = radarCtx;
    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    rc.clearRect(0, 0, rSize, rSize);

    const cx = rSize * 0.5;
    const cy = rSize * 0.5;
    const outerR = rSize * 0.46;

    rc.save();
    rc.beginPath();
    rc.arc(cx, cy, outerR, 0, Math.PI * 2);
    rc.clip();

    const bossAlert = state.isBossSector;
    rc.fillStyle = bossAlert ? 'rgba(24, 10, 12, 0.94)' : 'rgba(11, 16, 15, 0.92)';
    rc.fillRect(0, 0, rSize, rSize);

    rc.strokeStyle = bossAlert ? 'rgba(239, 68, 68, 0.22)' : 'rgba(132, 204, 22, 0.16)';
    rc.lineWidth = 0.8;
    [outerR * 0.36, outerR * 0.7, outerR * 0.98].forEach((r) => {
      rc.beginPath();
      rc.arc(cx, cy, r, 0, Math.PI * 2);
      rc.stroke();
    });

    rc.beginPath();
    rc.moveTo(cx - outerR, cy);
    rc.lineTo(cx + outerR, cy);
    rc.moveTo(cx, cy - outerR);
    rc.lineTo(cx, cy + outerR);
    rc.stroke();

    const sweepAngle = (now * 0.0022) % (Math.PI * 2);
    rc.fillStyle = bossAlert ? 'rgba(239, 68, 68, 0.14)' : 'rgba(132, 204, 22, 0.12)';
    rc.beginPath();
    rc.moveTo(cx, cy);
    rc.arc(cx, cy, outerR, sweepAngle - 0.52, sweepAngle);
    rc.closePath();
    rc.fill();

    rc.strokeStyle = bossAlert ? 'rgba(248, 113, 113, 0.55)' : 'rgba(163, 230, 53, 0.45)';
    rc.lineWidth = 1;
    rc.beginPath();
    rc.moveTo(cx, cy);
    rc.lineTo(cx + Math.cos(sweepAngle) * outerR, cy + Math.sin(sweepAngle) * outerR);
    rc.stroke();

    const arenaDiag = Math.hypot(ARENA_W, ARENA_H);
    const scale = (outerR * 1.84) / arenaDiag;
    const mapW = ARENA_W * scale;
    const mapH = ARENA_H * scale;
    const offX = cx - mapW * 0.5;
    const offY = cy - mapH * 0.5 - 2;

    rc.strokeStyle = bossAlert ? 'rgba(239, 68, 68, 0.35)' : 'rgba(132, 204, 22, 0.28)';
    rc.lineWidth = 0.9;
    rc.strokeRect(offX, offY, mapW, mapH);

    rc.fillStyle = 'rgba(148, 163, 184, 0.22)';
    for (let i = 0; i < state.stones.length; i++) {
      const s = state.stones[i];
      if (s.isPerimeter) continue;
      rc.fillRect(offX + s.x * scale, offY + s.y * scale, Math.max(1.6, s.w * scale), Math.max(1.6, s.h * scale));
    }
    rc.fillStyle = 'rgba(245, 158, 11, 0.35)';
    for (let i = 0; i < state.deflectors.length; i++) {
      const d = state.deflectors[i];
      rc.fillRect(offX + d.x * scale, offY + d.y * scale, Math.max(1.5, d.w * scale), Math.max(1.5, d.h * scale));
    }

    for (let i = 0; i < state.crates.length; i++) {
      const c = state.crates[i];
      if (c.hp <= 0) continue;
      const mx = offX + (c.x + TILE * 0.5) * scale;
      const my = offY + (c.y + TILE * 0.5) * scale;
      rc.fillStyle = c.hp === 1 ? '#fbbf24' : '#d97706';
      rc.fillRect(mx - 1.6, my - 1.6, 3.2, 3.2);
    }

    const pingPulse = 0.5 + 0.5 * Math.sin(now * 0.008);
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (!e.alive) continue;
      const ex = offX + e.x * scale;
      const ey = offY + e.y * scale;

      if (e.isBoss) {
        rc.strokeStyle = `rgba(251, 191, 36, ${0.4 + pingPulse * 0.45})`;
        rc.lineWidth = 1.1;
        rc.beginPath();
        rc.arc(ex, ey, 4.4 + pingPulse * 2.0, 0, Math.PI * 2);
        rc.stroke();

        rc.fillStyle = '#f59e0b';
        rc.beginPath();
        rc.moveTo(ex, ey - 3.6);
        rc.lineTo(ex + 3.6, ey);
        rc.lineTo(ex, ey + 3.6);
        rc.lineTo(ex - 3.6, ey);
        rc.closePath();
        rc.fill();
        continue;
      }

      if (e.type !== 'turret') {
        rc.strokeStyle = `rgba(239, 68, 68, ${0.22 + pingPulse * 0.35})`;
        rc.lineWidth = 0.9;
        rc.beginPath();
        rc.arc(ex, ey, 3.2 + pingPulse * 1.6, 0, Math.PI * 2);
        rc.stroke();
      }

      rc.fillStyle = e.type === 'commander' ? '#f97316' : '#ef4444';
      rc.beginPath();
      rc.arc(ex, ey, e.type === 'commander' ? 2.5 : 2.1, 0, Math.PI * 2);
      rc.fill();

      rc.fillStyle = '#fecaca';
      rc.beginPath();
      rc.arc(ex, ey, 0.85, 0, Math.PI * 2);
      rc.fill();
    }

    const drawRadarTankChevron = (t, fillCol, strokeCol) => {
      if (!t || !t.alive) return;
      const px = offX + t.x * scale;
      const py = offY + t.y * scale;
      rc.strokeStyle = strokeCol;
      rc.lineWidth = 0.9;
      rc.beginPath();
      rc.moveTo(px, py);
      rc.lineTo(px + Math.cos(t.turretAngle) * 8, py + Math.sin(t.turretAngle) * 8);
      rc.stroke();

      rc.save();
      rc.translate(px, py);
      rc.rotate(t.turretAngle);
      rc.fillStyle = fillCol;
      rc.strokeStyle = strokeCol;
      rc.lineWidth = 0.7;
      rc.beginPath();
      rc.moveTo(4.0, 0);
      rc.lineTo(-2.6, -2.7);
      rc.lineTo(-1.4, 0);
      rc.lineTo(-2.6, 2.7);
      rc.closePath();
      rc.fill();
      rc.stroke();
      rc.restore();
    };

    drawRadarTankChevron(state.player, '#84cc16', '#ecfccb');
    drawRadarTankChevron(
      state.player2,
      state.sessionMode === 'duel' ? '#ef4444' : '#f59e0b',
      state.sessionMode === 'duel' ? '#fecaca' : '#fef3c7'
    );

    rc.restore();
  }

  // =========================================================================
  // WebRTC Peer-to-Peer Host Broadcast & Client State Interpolation
  // =========================================================================
  function packTankState(t) {
    if (!t) return null;
    return [
      r1(t.x),
      r1(t.y),
      r3(t.hullAngle),
      r3(t.turretAngle),
      t.hp,
      t.alive ? 1 : 0,
      r1(t.fireCooldown),
      r1(t.recoil),
      r1(t.invulnTimer),
      r1(t.buffs.rapid),
      r1(t.buffs.spread),
      r1(t.buffs.turbo),
    ];
  }

  function applyTankPacket(t, pkt, lerpFactor) {
    if (!t || !pkt) return;
    if (lerpFactor >= 1) {
      t.x = pkt[0];
      t.y = pkt[1];
      t.hullAngle = pkt[2];
      t.turretAngle = pkt[3];
    } else {
      const dx = pkt[0] - t.x;
      const dy = pkt[1] - t.y;
      t.x += dx * lerpFactor;
      t.y += dy * lerpFactor;
      if (Math.hypot(dx, dy) > 1.2) {
        t.treadPhase += 0.35;
        t.treadDistAccum += Math.hypot(dx, dy) * lerpFactor;
        if (t.treadDistAccum >= 9) {
          t.treadDistAccum = 0;
          addTreadMark(t.x, t.y, t.hullAngle);
        }
      }
      t.hullAngle = normalizeAngle(t.hullAngle + normalizeAngle(pkt[2] - t.hullAngle) * lerpFactor);
      t.turretAngle = normalizeAngle(t.turretAngle + normalizeAngle(pkt[3] - t.turretAngle) * lerpFactor);
    }
    t.hp = pkt[4];
    t.alive = Boolean(pkt[5]);
    t.fireCooldown = pkt[6];
    t.recoil = pkt[7];
    t.invulnTimer = pkt[8];
    t.buffs.rapid = pkt[9];
    t.buffs.spread = pkt[10];
    t.buffs.turbo = pkt[11];
  }

  function hostBroadcastState() {
    if (!peerComms || !peerComms.connected) return;
    const msg = {
      t: 'st',
      seq: state.netSeq++,
      sm: state.sessionMode,
      ph: state.phase,
      w: state.waveIndex,
      sec: state.sectorNum,
      sc: state.score,
      k: state.kills,
      ds: state.duelScores,
      p1: packTankState(state.player),
      p2: packTankState(state.player2),
      en: state.enemies.map((e) => [
        r1(e.x),
        r1(e.y),
        r3(e.hullAngle),
        r3(e.turretAngle),
        e.alive ? 1 : 0,
        r1(e.recoil),
        r1(e.aimCharge),
        e.hp,
        e.sniperLockAngle !== null ? r3(e.sniperLockAngle) : null,
      ]),
      bu: state.bullets.map((b) => [b.id, b.owner, r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), b.bounced ? 1 : 0]),
      cr: state.crates.map((c) => c.hp),
      pu: state.powerUps.map((pu) => [pu.type, r1(pu.x), r1(pu.y), r1(pu.life)]),
      mn: state.mines.map((m) => [r1(m.x), r1(m.y), r1(m.armTimer)]),
      tb: state.tempBarriers.map((tb) => [r1(tb.x), r1(tb.y), tb.w, tb.h, tb.hp, tb.maxHp]),
    };
    peerComms.sendState(msg);
  }

  function clientSendInput() {
    if (!peerComms || !peerComms.connected) return;
    let inX = state.touch.moveX;
    let inY = state.touch.moveY;
    if (state.keys['KeyW'] || state.keys['ArrowUp']) inY -= 1;
    if (state.keys['KeyS'] || state.keys['ArrowDown']) inY += 1;
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) inX -= 1;
    if (state.keys['KeyD'] || state.keys['ArrowRight']) inX += 1;

    let aimOn = false;
    let aimA = state.player2 ? state.player2.turretAngle : 0;
    if (state.touch.aimActive && state.touch.aimArmed) {
      aimOn = true;
      aimA = state.touch.aimAngle;
      state.touch.hasCustomAim = true;
    } else if ((state.mouse.active || state.touch.canvasAimDown) && state.player2) {
      aimOn = true;
      aimA = Math.atan2(state.mouse.y - state.player2.y, state.mouse.x - state.player2.x);
      state.touch.hasCustomAim = true;
    } else if (state.touch.hasCustomAim) {
      aimOn = true;
      aimA = state.touch.aimAngle;
    }

    const fireHeld = Boolean(state.mouse.down || state.keys['Space'] || state.touch.canvasAimDown);
    peerComms.sendState({
      t: 'in',
      mx: r1(inX),
      my: r1(inY),
      ts: state.driveMode === 'tank' ? 1 : 0,
      aimA: r3(aimA),
      aimOn,
      fireHeld,
    });
  }

  function applyClientStateSnapshot(msg) {
    if (msg.seq <= state.lastRecvSeq && state.lastRecvSeq - msg.seq < 1000) return;
    state.lastRecvSeq = msg.seq;
    state.netTarget = msg;

    if (state.score !== msg.sc || state.kills !== msg.k) {
      state.score = msg.sc;
      state.kills = msg.k;
    }
    if (msg.ds) state.duelScores = msg.ds;

    if (Array.isArray(msg.cr)) {
      for (let i = 0; i < state.crates.length && i < msg.cr.length; i++) {
        state.crates[i].hp = msg.cr[i];
      }
    }
    if (Array.isArray(msg.mn)) {
      state.mines = msg.mn.map((arr) => ({
        x: arr[0],
        y: arr[1],
        radius: 10,
        armTimer: arr[2],
        life: 10,
        pulse: performance.now() * 0.007,
      }));
    }
    if (Array.isArray(msg.tb)) {
      state.tempBarriers = msg.tb.map((arr) => ({
        x: arr[0],
        y: arr[1],
        w: arr[2],
        h: arr[3],
        hp: arr[4],
        maxHp: arr[5],
        hitFlash: 0,
      }));
    }
    if (Array.isArray(msg.pu)) {
      state.powerUps = msg.pu.map((arr) => ({
        type: arr[0],
        x: arr[1],
        y: arr[2],
        radius: 13,
        age: performance.now() * 0.001,
        life: arr[3],
        maxLife: 14.0,
      }));
    }
    if (Array.isArray(msg.bu)) {
      const prevMap = new Map();
      for (let i = 0; i < state.bullets.length; i++) {
        prevMap.set(state.bullets[i].id, state.bullets[i]);
      }
      state.bullets = msg.bu.map((arr) => {
        const old = prevMap.get(arr[0]);
        const trail = old ? old.trail.slice(-7) : [];
        trail.push({ x: arr[2], y: arr[3] });
        return {
          id: arr[0],
          owner: arr[1],
          x: arr[2],
          y: arr[3],
          vx: arr[4],
          vy: arr[5],
          radius: BULLET_RADIUS,
          bounced: Boolean(arr[6]),
          trail,
        };
      });
    }
    updateHUD();
  }

  function updateNetworkClient(dt) {
    // Smooth projectile extrapolation between 25Hz snapshots
    for (let i = 0; i < state.bullets.length; i++) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 8) b.trail.shift();
    }

    const snap = state.netTarget;
    if (snap) {
      const alpha = Math.min(1, dt * 18);
      if (snap.p1) applyTankPacket(state.player, snap.p1, alpha);
      if (snap.p2) applyTankPacket(state.player2, snap.p2, alpha);
      if (Array.isArray(snap.en)) {
        for (let i = 0; i < state.enemies.length && i < snap.en.length; i++) {
          const e = state.enemies[i];
          const ep = snap.en[i];
          e.x += (ep[0] - e.x) * alpha;
          e.y += (ep[1] - e.y) * alpha;
          e.hullAngle = normalizeAngle(e.hullAngle + normalizeAngle(ep[2] - e.hullAngle) * alpha);
          e.turretAngle = normalizeAngle(e.turretAngle + normalizeAngle(ep[3] - e.turretAngle) * alpha);
          e.alive = Boolean(ep[4]);
          e.recoil = ep[5];
          e.aimCharge = ep[6];
          if (typeof ep[7] === 'number') e.hp = ep[7];
          if (ep[8] !== undefined) e.sniperLockAngle = ep[8];
        }
      }
    }

    state.netInputAccum += dt;
    if (state.netInputAccum >= 0.032) {
      state.netInputAccum = 0;
      clientSendInput();
    }
  }

  // =========================================================================
  // Animation Loop
  // =========================================================================
  let lastTime = performance.now();
  let rafId = null;

  function frame(now) {
    rafId = null;
    if (document.hidden) return;

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!state.settingsOpen && !state.paused) {
      if (state.phase === 'playing' || state.phase === 'wave_transition') {
        if (state.netMode === 'p2p-client') {
          updateNetworkClient(dt);
          updateEffects(dt);
        } else {
          updatePlayers(dt);
          updatePowerUps(dt);
          updateEnemies(dt);
          updateBullets(dt);
          updateEffects(dt);
          checkWaveProgress(dt);
          if (state.netMode === 'p2p-host') {
            state.netSyncAccum += dt;
            if (state.netSyncAccum >= 0.04) {
              state.netSyncAccum = 0;
              hostBroadcastState();
            }
          }
        }
      } else if (state.phase === 'start') {
        updateAttractSkirmish(dt * 0.52);
      } else {
        updateEffects(dt);
      }
    }

    render();
    renderRadar(now);
    updateReloadRingUI();
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (rafId === null && !document.hidden) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      sfx.stopMusic();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else {
      if ((state.phase === 'playing' || state.phase === 'wave_transition') && !state.paused) {
        sfx.startMusic();
      }
      startLoop();
    }
  });

  // =========================================================================
  // Input Handling (Keyboard, Mouse, & Android Touch)
  // =========================================================================
  window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isTyping = activeTag === 'TEXTAREA' || activeTag === 'INPUT';
    if (!isTyping) {
      state.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    }
    if (e.code === 'Escape' && state.settingsOpen) {
      closeSettingsModal();
      return;
    }
    if (e.code === 'Escape' && screenComms && !screenComms.classList.contains('hidden')) {
      closeCommsModal();
      return;
    }
    if (e.code === 'Escape' && screenIntel && !screenIntel.classList.contains('hidden')) {
      screenIntel.classList.add('hidden');
      return;
    }
    if (!isTyping && (e.code === 'KeyP' || e.code === 'Escape') && (state.phase === 'playing' || state.phase === 'wave_transition')) {
      togglePause();
      return;
    }
    if (state.settingsOpen || state.paused || (screenComms && !screenComms.classList.contains('hidden'))) {
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      if (screenIntel && !screenIntel.classList.contains('hidden')) {
        screenIntel.classList.add('hidden');
        return;
      }
      if (state.phase === 'start') {
        handleDeployPress();
      } else if (state.phase === 'gameover' || state.phase === 'victory') {
        handleRestartAction();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    state.keys[e.code] = false;
  });

  window.addEventListener('blur', () => {
    state.keys = Object.create(null);
    state.mouse.down = false;
    state.touch.canvasAimDown = false;
    state.touch.canvasTouchId = null;
    resetDriveStick();
    resetAimStick(false);
    resetP2DriveStick();
    resetP2AimStick(false);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (state.phase === 'start' || performance.now() - state.touch.lastTouchTime < 500) return;
    const pos = clientToArena(e.clientX, e.clientY);
    state.mouse.x = pos.x;
    state.mouse.y = pos.y;
    state.mouse.active = true;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (state.phase === 'start' || e.button !== 0 || performance.now() - state.touch.lastTouchTime < 500) return;
    sfx.ensureContext();
    const pos = clientToArena(e.clientX, e.clientY);
    state.mouse.x = pos.x;
    state.mouse.y = pos.y;
    state.mouse.active = true;
    state.mouse.down = true;
  });

  window.addEventListener('mouseup', () => {
    state.mouse.down = false;
  });

  // Upper-arena tap/drag fallback (ignores touches captured by bottom twin-stick zones)
  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      state.touch.lastTouchTime = performance.now();
      sfx.ensureContext();
      if (!state.touch.enabled) {
        state.touch.enabled = true;
        syncTouchDeckVisibility();
      }
      if (state.touch.canvasTouchId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        state.touch.canvasTouchId = t.identifier;
        const pos = clientToArena(t.clientX, t.clientY);
        state.mouse.x = pos.x;
        state.mouse.y = pos.y;
        state.mouse.active = true;
        state.touch.canvasAimDown = true;
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      if (state.touch.canvasTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === state.touch.canvasTouchId) {
          const pos = clientToArena(t.clientX, t.clientY);
          state.mouse.x = pos.x;
          state.mouse.y = pos.y;
          break;
        }
      }
    },
    { passive: false }
  );

  const endCanvasTouch = (e) => {
    e.preventDefault();
    if (state.touch.canvasTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === state.touch.canvasTouchId) {
        state.touch.canvasTouchId = null;
        state.touch.canvasAimDown = false;
        break;
      }
    }
  };
  canvas.addEventListener('touchend', endCanvasTouch, { passive: false });
  canvas.addEventListener('touchcancel', endCanvasTouch, { passive: false });

  // =========================================================================
  // Multi-Touch Twin-Stick Aim-and-Release System
  // =========================================================================
  const AIM_DEADZONE = 0.24;
  const RELOAD_CIRCUMFERENCE = 289.03;
  let lastReloadOffset = -1;
  let lastReloadActive = false;

  function updateReloadRingUI() {
    if (!aimReloadRing) return;
    const p = state.netMode === 'p2p-client' ? state.player2 : state.player;
    const cooling = p && p.alive && p.fireCooldown > 0;
    const frac = cooling ? clamp(1 - p.fireCooldown / Math.max(0.05, p.lastFireInterval), 0, 1) : 1;
    const offset = Math.round((1 - frac) * RELOAD_CIRCUMFERENCE * 10) / 10;

    if (offset !== lastReloadOffset) {
      lastReloadOffset = offset;
      aimReloadRing.style.strokeDashoffset = String(offset);
    }
    if (cooling !== lastReloadActive) {
      lastReloadActive = cooling;
      aimStickBase.classList.toggle('reloading', cooling);
    }

    if (p2AimReloadRing && p2AimStickBase && state.netMode === 'local-split') {
      const p2 = state.player2;
      const c2 = p2 && p2.alive && p2.fireCooldown > 0;
      const f2 = c2 ? clamp(1 - p2.fireCooldown / Math.max(0.05, p2.lastFireInterval), 0, 1) : 1;
      const o2 = Math.round((1 - f2) * RELOAD_CIRCUMFERENCE * 10) / 10;
      p2AimReloadRing.style.strokeDashoffset = String(o2);
      p2AimStickBase.classList.toggle('reloading', c2);
    }
  }

  function positionFloatingStick(zoneEl, stickEl, clientX, clientY) {
    const zoneRect = zoneEl.getBoundingClientRect();
    const stickSize = stickEl.offsetWidth || 96;
    const half = stickSize * 0.5;
    const cx = clamp(clientX - zoneRect.left, half + 4, Math.max(half + 4, zoneRect.width - half - 4));
    const cy = clamp(clientY - zoneRect.top, half + 4, Math.max(half + 4, zoneRect.height - half - 4));

    stickEl.style.left = `${cx - half}px`;
    stickEl.style.top = `${cy - half}px`;
    stickEl.style.right = 'auto';
    stickEl.style.bottom = 'auto';

    return {
      originX: zoneRect.left + cx,
      originY: zoneRect.top + cy,
    };
  }

  function updateDriveStickFromClient(clientX, clientY) {
    const stickSize = driveStickBase.offsetWidth || 96;
    const maxR = stickSize * 0.36;
    let dx = clientX - state.touch.driveOriginX;
    let dy = clientY - state.touch.driveOriginY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }

    driveStickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.touch.moveX = dx / maxR;
    state.touch.moveY = dy / maxR;
    driveStickBase.classList.add('engaged');
  }

  function resetDriveStick() {
    state.touch.driveTouchId = null;
    state.touch.driveMouseActive = false;
    state.touch.moveX = 0;
    state.touch.moveY = 0;
    driveStickKnob.style.transform = 'translate(0px, 0px)';
    driveStickBase.classList.remove('engaged');
    driveStickBase.style.left = '';
    driveStickBase.style.top = '';
    driveStickBase.style.right = '';
    driveStickBase.style.bottom = '';
  }

  function updateAimStickFromClient(clientX, clientY) {
    const stickSize = aimStickBase.offsetWidth || 96;
    const maxR = stickSize * 0.36;
    let dx = clientX - state.touch.aimOriginX;
    let dy = clientY - state.touch.aimOriginY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }

    const normDist = dist / maxR;
    aimStickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.touch.aimActive = true;
    aimStickBase.classList.add('engaged');

    if (normDist >= AIM_DEADZONE) {
      state.touch.aimArmed = true;
      state.touch.aimAngle = Math.atan2(dy, dx);
      aimStickBase.classList.add('armed');
    } else {
      state.touch.aimArmed = false;
      aimStickBase.classList.remove('armed');
    }
  }

  function resetAimStick(fireIfArmed = false) {
    const shouldFire = fireIfArmed && state.touch.aimArmed && state.phase === 'playing';
    const releaseAngle = state.touch.aimAngle;
    state.touch.aimTouchId = null;
    state.touch.aimMouseActive = false;
    state.touch.aimActive = false;
    state.touch.aimArmed = false;
    aimStickKnob.style.transform = 'translate(0px, 0px)';
    aimStickBase.classList.remove('engaged', 'armed');
    aimStickBase.style.left = '';
    aimStickBase.style.top = '';
    aimStickBase.style.right = '';
    aimStickBase.style.bottom = '';

    if (shouldFire) {
      if (state.netMode === 'p2p-client' && peerComms && peerComms.connected) {
        peerComms.sendEvent({ t: 'fire', a: r3(releaseAngle) });
      } else {
        state.touch.fireReleaseQueued = 0.14;
      }
    }
  }

  // Player 2 Top Twin-Stick Helpers (Local Split Same-Device Mode)
  function updateP2DriveStick(clientX, clientY) {
    if (!p2DriveStickBase || !p2DriveStickKnob) return;
    const stickSize = p2DriveStickBase.offsetWidth || 96;
    const maxR = stickSize * 0.36;
    let dx = clientX - state.p2Touch.driveOriginX;
    let dy = clientY - state.p2Touch.driveOriginY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    p2DriveStickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.p2Touch.moveX = dx / maxR;
    state.p2Touch.moveY = dy / maxR;
    p2DriveStickBase.classList.add('engaged');
  }

  function resetP2DriveStick() {
    if (!p2DriveStickBase || !p2DriveStickKnob) return;
    state.p2Touch.driveTouchId = null;
    state.p2Touch.moveX = 0;
    state.p2Touch.moveY = 0;
    p2DriveStickKnob.style.transform = 'translate(0px, 0px)';
    p2DriveStickBase.classList.remove('engaged');
    p2DriveStickBase.style.left = '';
    p2DriveStickBase.style.top = '';
    p2DriveStickBase.style.right = '';
    p2DriveStickBase.style.bottom = '';
  }

  function updateP2AimStick(clientX, clientY) {
    if (!p2AimStickBase || !p2AimStickKnob) return;
    const stickSize = p2AimStickBase.offsetWidth || 96;
    const maxR = stickSize * 0.36;
    let dx = clientX - state.p2Touch.aimOriginX;
    let dy = clientY - state.p2Touch.aimOriginY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    const normDist = dist / maxR;
    p2AimStickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.p2Touch.aimActive = true;
    p2AimStickBase.classList.add('engaged');

    if (normDist >= AIM_DEADZONE) {
      state.p2Touch.aimArmed = true;
      state.p2Touch.aimAngle = Math.atan2(dy, dx);
      p2AimStickBase.classList.add('armed');
    } else {
      state.p2Touch.aimArmed = false;
      p2AimStickBase.classList.remove('armed');
    }
  }

  function resetP2AimStick(fireIfArmed = false) {
    if (!p2AimStickBase || !p2AimStickKnob) return;
    const shouldFire = fireIfArmed && state.p2Touch.aimArmed && state.phase === 'playing';
    state.p2Touch.aimTouchId = null;
    state.p2Touch.aimActive = false;
    state.p2Touch.aimArmed = false;
    p2AimStickKnob.style.transform = 'translate(0px, 0px)';
    p2AimStickBase.classList.remove('engaged', 'armed');
    p2AimStickBase.style.left = '';
    p2AimStickBase.style.top = '';
    p2AimStickBase.style.right = '';
    p2AimStickBase.style.bottom = '';
    if (shouldFire) state.p2Touch.fireReleaseQueued = 0.14;
  }

  if (touchZoneP2Left && p2DriveStickBase) {
    touchZoneP2Left.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.touch.lastTouchTime = performance.now();
        sfx.ensureContext();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (state.p2Touch.driveTouchId === null) {
            state.p2Touch.driveTouchId = t.identifier;
            const origin = positionFloatingStick(touchZoneP2Left, p2DriveStickBase, t.clientX, t.clientY);
            state.p2Touch.driveOriginX = origin.originX;
            state.p2Touch.driveOriginY = origin.originY;
            updateP2DriveStick(t.clientX, t.clientY);
            break;
          }
        }
      },
      { passive: false }
    );
    touchZoneP2Left.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.p2Touch.driveTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === state.p2Touch.driveTouchId) {
            updateP2DriveStick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
            break;
          }
        }
      },
      { passive: false }
    );
    const endP2Drive = (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === state.p2Touch.driveTouchId) {
          resetP2DriveStick();
          break;
        }
      }
    };
    touchZoneP2Left.addEventListener('touchend', endP2Drive, { passive: false });
    touchZoneP2Left.addEventListener('touchcancel', endP2Drive, { passive: false });
  }

  if (touchZoneP2Right && p2AimStickBase) {
    touchZoneP2Right.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.touch.lastTouchTime = performance.now();
        sfx.ensureContext();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (state.p2Touch.aimTouchId === null) {
            state.p2Touch.aimTouchId = t.identifier;
            const origin = positionFloatingStick(touchZoneP2Right, p2AimStickBase, t.clientX, t.clientY);
            state.p2Touch.aimOriginX = origin.originX;
            state.p2Touch.aimOriginY = origin.originY;
            updateP2AimStick(t.clientX, t.clientY);
            break;
          }
        }
      },
      { passive: false }
    );
    touchZoneP2Right.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.p2Touch.aimTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === state.p2Touch.aimTouchId) {
            updateP2AimStick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
            break;
          }
        }
      },
      { passive: false }
    );
    touchZoneP2Right.addEventListener(
      'touchend',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === state.p2Touch.aimTouchId) {
            resetP2AimStick(true);
            break;
          }
        }
      },
      { passive: false }
    );
    touchZoneP2Right.addEventListener(
      'touchcancel',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === state.p2Touch.aimTouchId) {
            resetP2AimStick(false);
            break;
          }
        }
      },
      { passive: false }
    );
  }

  // Left Zone: Floating Omni-Directional Drive Stick (Multi-Touch tracked by identifier)
  touchZoneLeft.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.touch.lastTouchTime = performance.now();
      sfx.ensureContext();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (state.touch.driveTouchId === null) {
          state.touch.driveTouchId = t.identifier;
          const origin = positionFloatingStick(touchZoneLeft, driveStickBase, t.clientX, t.clientY);
          state.touch.driveOriginX = origin.originX;
          state.touch.driveOriginY = origin.originY;
          updateDriveStickFromClient(t.clientX, t.clientY);
          break;
        }
      }
    },
    { passive: false }
  );

  touchZoneLeft.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.touch.driveTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === state.touch.driveTouchId) {
          updateDriveStickFromClient(t.clientX, t.clientY);
          break;
        }
      }
    },
    { passive: false }
  );

  const endDriveTouch = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state.touch.driveTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === state.touch.driveTouchId) {
        resetDriveStick();
        break;
      }
    }
  };
  touchZoneLeft.addEventListener('touchend', endDriveTouch, { passive: false });
  touchZoneLeft.addEventListener('touchcancel', endDriveTouch, { passive: false });

  // Right Zone: Floating Aim-and-Release Stick (Multi-Touch tracked by identifier)
  touchZoneRight.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.touch.lastTouchTime = performance.now();
      sfx.ensureContext();
      state.mouse.active = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (state.touch.aimTouchId === null) {
          state.touch.aimTouchId = t.identifier;
          const origin = positionFloatingStick(touchZoneRight, aimStickBase, t.clientX, t.clientY);
          state.touch.aimOriginX = origin.originX;
          state.touch.aimOriginY = origin.originY;
          updateAimStickFromClient(t.clientX, t.clientY);
          break;
        }
      }
    },
    { passive: false }
  );

  touchZoneRight.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.touch.aimTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === state.touch.aimTouchId) {
          updateAimStickFromClient(t.clientX, t.clientY);
          break;
        }
      }
    },
    { passive: false }
  );

  touchZoneRight.addEventListener(
    'touchend',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.touch.aimTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === state.touch.aimTouchId) {
          resetAimStick(true);
          break;
        }
      }
    },
    { passive: false }
  );

  touchZoneRight.addEventListener(
    'touchcancel',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.touch.aimTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === state.touch.aimTouchId) {
          resetAimStick(false);
          break;
        }
      }
    },
    { passive: false }
  );

  // Mouse fallback for testing virtual sticks when PAD is toggled on desktop
  touchZoneLeft.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || performance.now() - state.touch.lastTouchTime < 600) return;
    e.preventDefault();
    sfx.ensureContext();
    state.touch.driveMouseActive = true;
    const origin = positionFloatingStick(touchZoneLeft, driveStickBase, e.clientX, e.clientY);
    state.touch.driveOriginX = origin.originX;
    state.touch.driveOriginY = origin.originY;
    updateDriveStickFromClient(e.clientX, e.clientY);
  });

  touchZoneRight.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || performance.now() - state.touch.lastTouchTime < 600) return;
    e.preventDefault();
    sfx.ensureContext();
    state.mouse.active = false;
    state.touch.aimMouseActive = true;
    const origin = positionFloatingStick(touchZoneRight, aimStickBase, e.clientX, e.clientY);
    state.touch.aimOriginX = origin.originX;
    state.touch.aimOriginY = origin.originY;
    updateAimStickFromClient(e.clientX, e.clientY);
  });

  window.addEventListener('mousemove', (e) => {
    if (state.touch.driveMouseActive) updateDriveStickFromClient(e.clientX, e.clientY);
    if (state.touch.aimMouseActive) updateAimStickFromClient(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', () => {
    if (state.touch.driveMouseActive) resetDriveStick();
    if (state.touch.aimMouseActive) resetAimStick(true);
  });

  // =========================================================================
  // Tactical Comms Link (WebRTC DataChannel Lobby & Local Split Controls)
  // =========================================================================
  function setCommsStatus(kind, text) {
    if (commsStatusBadge) commsStatusBadge.textContent = text;
    if (commsStatusBar) {
      commsStatusBar.classList.remove('idle', 'searching', 'connected', 'error');
      commsStatusBar.classList.add(kind === 'connected' ? 'connected' : kind === 'error' ? 'error' : kind === 'idle' ? 'idle' : 'searching');
    }
    if (btnCommsLaunch) {
      const isHostConnected = kind === 'connected' && peerComms && peerComms.role === 'host';
      btnCommsLaunch.classList.toggle('hidden', !isHostConnected);
    }
  }

  function ensurePeerComms() {
    if (peerComms) return peerComms;
    if (!window.RicochetComms || !window.RicochetComms.PeerComms) {
      throw new Error('Comms module unavailable');
    }
    peerComms = new window.RicochetComms.PeerComms({
      onStatus: (code, text) => {
        if (code === 'connected') {
          if (peerComms.role === 'host') {
            setCommsStatus('connected', 'P2P LINK ESTABLISHED // READY TO LAUNCH');
          } else {
            setCommsStatus('connected', 'P2P LINK ESTABLISHED // AWAITING HOST...');
          }
        } else if (code === 'disconnected') {
          setCommsStatus('error', text);
          if (state.phase === 'playing' || state.phase === 'wave_transition') {
            addPopup(ARENA_W / 2, ARENA_H * 0.45, 'P2P LINK LOST', '#f87171', 2.0);
          }
        } else {
          setCommsStatus('searching', text);
        }
      },
      onRtt: (rtt) => {
        state.pingMs = rtt;
        if (commsRttEl) commsRttEl.textContent = `${rtt}ms`;
        updateHUD();
      },
      onStateMessage: (msg) => {
        if (msg.t === 'in' && state.netMode === 'p2p-host') {
          state.p2Input.mx = clamp(Number(msg.mx) || 0, -1, 1);
          state.p2Input.my = clamp(Number(msg.my) || 0, -1, 1);
          state.p2Input.tankSteer = Boolean(msg.ts);
          if (typeof msg.aimA === 'number') state.p2Input.aimA = msg.aimA;
          state.p2Input.aimOn = Boolean(msg.aimOn);
          state.p2Input.fireHeld = Boolean(msg.fireHeld);
        } else if (msg.t === 'st' && state.netMode === 'p2p-client') {
          applyClientStateSnapshot(msg);
        }
      },
      onEventMessage: (msg) => {
        if (msg.t === 'fire' && state.netMode === 'p2p-host') {
          if (typeof msg.a === 'number') {
            state.p2Input.aimA = msg.a;
            state.p2Input.aimOn = true;
          }
          state.p2Input.fireQueued = 0.16;
        } else if (msg.t === 'rematch' && state.netMode === 'p2p-host') {
          startNewGame(state.sessionMode, 'p2p-host');
        } else if (msg.t === 'wave') {
          // Client receives authoritative sector spec & match start
          state.sessionMode = msg.sm;
          state.netMode = 'p2p-client';
          state.phase = 'playing';
          state.paused = false;
          state.settingsOpen = false;
          state.score = msg.sc || 0;
          state.kills = msg.k || 0;
          if (msg.ds) state.duelScores = msg.ds;
          state.lastRecvSeq = -1;
          if (appShell) appShell.classList.remove('is-home');
          if (btnPause) btnPause.classList.remove('paused');
          if (screenPause) screenPause.classList.add('hidden');
          if (screenStart) screenStart.classList.add('hidden');
          if (screenComms) screenComms.classList.add('hidden');
          if (screenGameOver) screenGameOver.classList.add('hidden');
          if (screenVictory) screenVictory.classList.add('hidden');
          if (radarHud) radarHud.classList.remove('hidden');
          sfx.ensureContext();
          sfx.startMusic();
          syncTouchDeckVisibility();
          resizeCanvas();
          const sectorSpec = msg.spec || (msg.w || 0) + 1;
          const isKeepHp = msg.spec ? msg.spec.number > 1 : (msg.w || 0) > 0;
          loadWave(sectorSpec, isKeepHp, msg.sm);
          const secNum = state.sectorNum;
          const label =
            msg.txt ||
            (msg.sm === 'duel'
              ? '1v1 DUEL // ENGAGE!'
              : `2P CO-OP // SECTOR ${String(secNum).padStart(2, '0')}`);
          addPopup(ARENA_W / 2, ARENA_H * 0.38, label, state.isBossSector ? '#f87171' : '#84cc16', 1.7);
        } else if (msg.t === 'pause') {
          togglePause(Boolean(msg.paused), true);
        } else if (msg.t === 'fx' && state.netMode === 'p2p-client') {
          applyLocalOrNetFx(msg);
        } else if (msg.t === 'end' && state.netMode === 'p2p-client') {
          if (msg.kind === 'duel') triggerDuelEnd(msg.winner, msg);
          else if (msg.kind === 'victory') triggerVictory(msg);
          else triggerGameOver(msg);
        }
      },
    });
    return peerComms;
  }

  function openCommsModal() {
    if (!screenComms) return;
    setCommsStatus('idle', 'STANDBY // SELECT HOST OR JOIN');
    if (commsRttEl) commsRttEl.textContent = '';
    if (commsHostQrWrap) commsHostQrWrap.classList.add('hidden');
    if (commsJoinQrWrap) commsJoinQrWrap.classList.add('hidden');
    if (outputHostOffer) outputHostOffer.value = '';
    if (inputHostAnswer) inputHostAnswer.value = '';
    if (inputJoinOffer) inputJoinOffer.value = '';
    if (outputJoinAnswer) outputJoinAnswer.value = '';
    screenComms.classList.remove('hidden');
  }

  function closeCommsModal() {
    if (screenComms) screenComms.classList.add('hidden');
  }

  function handleDeployPress() {
    if (state.playerCountPref === 2) {
      openCommsModal();
    } else {
      state.duelScores = { p1: 0, p2: 0 };
      startNewGame('1p', 'solo');
    }
  }

  function handleRestartAction() {
    if (state.netMode === 'p2p-client' && peerComms && peerComms.connected) {
      peerComms.sendEvent({ t: 'rematch' });
      addPopup(ARENA_W / 2, ARENA_H * 0.45, 'REMATCH REQUESTED', '#f59e0b', 1.2);
      return;
    }
    if (state.sessionMode === 'duel' || state.sessionMode === 'coop') {
      startNewGame(state.sessionMode, state.netMode);
    } else {
      startNewGame('1p', 'solo');
    }
  }

  async function copyText(text, btnEl) {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }
      if (btnEl) {
        const prev = btnEl.textContent;
        btnEl.textContent = 'COPIED';
        setTimeout(() => {
          btnEl.textContent = prev;
        }, 1100);
      }
    } catch (_) {}
  }

  async function shareText(text, title) {
    if (!text) return;
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
      } else {
        await copyText(text, null);
      }
    } catch (_) {}
  }

  async function pasteInto(textareaEl) {
    if (!textareaEl) return;
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const txt = await navigator.clipboard.readText();
        if (txt) textareaEl.value = txt.trim();
      }
    } catch (_) {}
  }

  if (mode1pBtn && mode2pBtn) {
    mode1pBtn.addEventListener('click', () => {
      state.playerCountPref = 1;
      mode1pBtn.classList.add('active');
      mode2pBtn.classList.remove('active');
    });
    mode2pBtn.addEventListener('click', () => {
      state.playerCountPref = 2;
      mode2pBtn.classList.add('active');
      mode1pBtn.classList.remove('active');
    });
  }

  if (commsModeDuelBtn && commsModeCoopBtn) {
    commsModeDuelBtn.addEventListener('click', () => {
      state.preferred2pMode = 'duel';
      commsModeDuelBtn.classList.add('active');
      commsModeCoopBtn.classList.remove('active');
    });
    commsModeCoopBtn.addEventListener('click', () => {
      state.preferred2pMode = 'coop';
      commsModeCoopBtn.classList.add('active');
      commsModeDuelBtn.classList.remove('active');
    });
  }

  if (tabCommsHost && tabCommsJoin && panelCommsHost && panelCommsJoin) {
    tabCommsHost.addEventListener('click', () => {
      tabCommsHost.classList.add('active');
      tabCommsJoin.classList.remove('active');
      panelCommsHost.classList.remove('hidden');
      panelCommsJoin.classList.add('hidden');
    });
    tabCommsJoin.addEventListener('click', () => {
      tabCommsJoin.classList.add('active');
      tabCommsHost.classList.remove('active');
      panelCommsJoin.classList.remove('hidden');
      panelCommsHost.classList.add('hidden');
    });
  }

  if (btnCommsX) btnCommsX.addEventListener('click', closeCommsModal);
  if (screenComms) {
    screenComms.addEventListener('click', (e) => {
      if (e.target === screenComms) closeCommsModal();
    });
  }

  if (btnHostGen) {
    btnHostGen.addEventListener('click', async () => {
      try {
        const pc = ensurePeerComms();
        const { code } = await pc.hostCreateOffer();
        if (outputHostOffer) outputHostOffer.value = code;
        if (commsHostQrWrap) commsHostQrWrap.classList.remove('hidden');
        if (commsHostQr && window.RicochetComms) {
          window.RicochetComms.renderQrToCanvas(commsHostQr, code);
        }
      } catch (err) {
        setCommsStatus('error', err && err.message ? err.message : 'HOST CODE FAILED');
      }
    });
  }

  if (btnHostCopy && outputHostOffer) {
    btnHostCopy.addEventListener('click', () => copyText(outputHostOffer.value, btnHostCopy));
  }
  if (btnHostShare && outputHostOffer) {
    btnHostShare.addEventListener('click', () => shareText(outputHostOffer.value, 'Ricochet Tanks Host Code'));
  }
  if (btnHostPaste && inputHostAnswer) {
    btnHostPaste.addEventListener('click', () => pasteInto(inputHostAnswer));
  }
  if (btnHostLink && inputHostAnswer) {
    btnHostLink.addEventListener('click', async () => {
      try {
        const pc = ensurePeerComms();
        await pc.hostAcceptAnswer(inputHostAnswer.value);
      } catch (err) {
        setCommsStatus('error', err && err.message ? err.message : 'INVALID RESPONSE CODE');
      }
    });
  }

  if (btnJoinPaste && inputJoinOffer) {
    btnJoinPaste.addEventListener('click', () => pasteInto(inputJoinOffer));
  }
  if (btnJoinGen && inputJoinOffer) {
    btnJoinGen.addEventListener('click', async () => {
      try {
        const pc = ensurePeerComms();
        const { code } = await pc.joinCreateAnswer(inputJoinOffer.value);
        if (outputJoinAnswer) outputJoinAnswer.value = code;
        if (commsJoinQrWrap) commsJoinQrWrap.classList.remove('hidden');
        if (commsJoinQr && window.RicochetComms) {
          window.RicochetComms.renderQrToCanvas(commsJoinQr, code);
        }
      } catch (err) {
        setCommsStatus('error', err && err.message ? err.message : 'INVALID HOST CODE');
      }
    });
  }
  if (btnJoinCopy && outputJoinAnswer) {
    btnJoinCopy.addEventListener('click', () => copyText(outputJoinAnswer.value, btnJoinCopy));
  }
  if (btnJoinShare && outputJoinAnswer) {
    btnJoinShare.addEventListener('click', () => shareText(outputJoinAnswer.value, 'Ricochet Tanks Response Code'));
  }

  if (btnCommsLaunch) {
    btnCommsLaunch.addEventListener('click', () => {
      if (peerComms && peerComms.connected && peerComms.role === 'host') {
        state.duelScores = { p1: 0, p2: 0 };
        startNewGame(state.preferred2pMode, 'p2p-host');
      }
    });
  }

  if (btnLocalSplit) {
    btnLocalSplit.addEventListener('click', () => {
      closePeerSession();
      state.duelScores = { p1: 0, p2: 0 };
      startNewGame(state.preferred2pMode, 'local-split');
    });
  }

  btnStart.addEventListener('click', handleDeployPress);
  btnRestartGameOver.addEventListener('click', handleRestartAction);
  btnRestartVictory.addEventListener('click', handleRestartAction);
  btnMenuGameOver.addEventListener('click', returnToStartMenu);
  btnMenuVictory.addEventListener('click', returnToStartMenu);
  btnRestartHud.addEventListener('click', () => {
    if (state.phase !== 'start') handleRestartAction();
  });

  if (btnIntel && screenIntel) {
    btnIntel.addEventListener('click', () => {
      screenIntel.classList.remove('hidden');
    });
    if (btnIntelX) {
      btnIntelX.addEventListener('click', () => {
        screenIntel.classList.add('hidden');
      });
    }
    if (btnIntelClose) {
      btnIntelClose.addEventListener('click', () => {
        screenIntel.classList.add('hidden');
      });
    }
    screenIntel.addEventListener('click', (e) => {
      if (e.target === screenIntel) {
        screenIntel.classList.add('hidden');
      }
    });
  }

  btnMute.addEventListener('click', () => {
    userSettings.sfxEnabled = !userSettings.sfxEnabled;
    saveSettings();
    applySettings();
  });

  if (btnPause) {
    btnPause.addEventListener('click', () => togglePause());
  }
  if (btnPauseResume) {
    btnPauseResume.addEventListener('click', () => togglePause(false));
  }
  if (btnPauseSettings) {
    btnPauseSettings.addEventListener('click', openSettingsModal);
  }
  if (btnPauseRestart) {
    btnPauseRestart.addEventListener('click', () => {
      togglePause(false);
      handleRestartAction();
    });
  }
  if (btnPauseMenu) {
    btnPauseMenu.addEventListener('click', returnToStartMenu);
  }

  if (btnSettings) {
    btnSettings.addEventListener('click', openSettingsModal);
  }
  if (btnSettingsX) {
    btnSettingsX.addEventListener('click', closeSettingsModal);
  }
  if (btnSettingsClose) {
    btnSettingsClose.addEventListener('click', closeSettingsModal);
  }
  if (btnSettingsMenu) {
    btnSettingsMenu.addEventListener('click', () => {
      closeSettingsModal();
      returnToStartMenu();
    });
  }
  if (screenSettings) {
    screenSettings.addEventListener('click', (e) => {
      if (e.target === screenSettings) {
        closeSettingsModal();
      }
    });
  }
  if (tabSettingsGeneral) {
    tabSettingsGeneral.addEventListener('click', () => switchSettingsTab('general'));
  }
  if (tabSettingsLiveries) {
    tabSettingsLiveries.addEventListener('click', () => switchSettingsTab('liveries'));
  }
  const liveryCardKeys = Object.keys(liveryCards);
  for (let i = 0; i < liveryCardKeys.length; i++) {
    const key = liveryCardKeys[i];
    const card = liveryCards[key];
    if (!card) continue;
    card.addEventListener('click', () => {
      userSettings.livery = key;
      saveSettings();
      applySettings();
      if (!document.hidden) render();
    });
  }
  if (btnToggleMusic) {
    btnToggleMusic.addEventListener('click', () => {
      userSettings.musicEnabled = !userSettings.musicEnabled;
      saveSettings();
      applySettings();
    });
  }
  if (btnToggleSfx) {
    btnToggleSfx.addEventListener('click', () => {
      userSettings.sfxEnabled = !userSettings.sfxEnabled;
      saveSettings();
      applySettings();
    });
  }
  if (sliderUiOpacity) {
    const onOpacityChange = () => {
      userSettings.uiOpacity = clamp(Math.round(Number(sliderUiOpacity.value) || 100), 25, 100);
      saveSettings();
      applySettings();
    };
    sliderUiOpacity.addEventListener('input', onOpacityChange);
    sliderUiOpacity.addEventListener('change', onOpacityChange);
  }

  btnTouchToggle.addEventListener('click', () => {
    state.touch.enabled = !state.touch.enabled;
    syncTouchDeckVisibility();
  });

  modeOmniBtn.addEventListener('click', () => {
    state.driveMode = 'omni';
    modeOmniBtn.classList.add('active');
    modeTankBtn.classList.remove('active');
  });

  modeTankBtn.addEventListener('click', () => {
    state.driveMode = 'tank';
    modeTankBtn.classList.add('active');
    modeOmniBtn.classList.remove('active');
  });

  let resizeQueued = false;
  function scheduleResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      resizeCanvas();
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(scheduleResize);
    ro.observe(stageWrap);
  }
  window.addEventListener('resize', scheduleResize);

  // Boot: Apply Saved Settings, Lifetime Stats & Slow-Motion Live Skirmish behind Home Screen
  applySettings();
  renderLifetimeStats();
  initAttractSkirmish();
  syncTouchDeckVisibility();
  resizeCanvas();
  startLoop();
})();
