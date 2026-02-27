import { TAU } from './constants.js';
import { SKINS } from './skin.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.grooveImage = null;
    this.skin = SKINS.classic.canvas;
    this._groovePoints = null;
    this._grooveGeom = {};
  }

  setSkin(canvasSkin, groovePoints = null, geom = {}) {
    this.skin = canvasSkin;
    if (groovePoints) {
      this._groovePoints = groovePoints;
      this._grooveGeom = geom;
      this.preRenderGroove(groovePoints, geom);
    }
  }

  drawEmptyDisc({ Rout = 220, Rin = 40, cx = 260, cy = 260 } = {}) {
    const { canvas } = this;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const scale = W / 520;
    const cxs = cx * scale, cys = cy * scale;
    const Routs = (Rout + 8) * scale;
    const Rins = Math.max(12, Rin - 8) * scale;
    const labelR = 45 * scale;

    ctx.clearRect(0, 0, W, W);
    this._drawDiscBody(ctx, W, scale, cxs, cys, Routs, Rins);
    this._drawLabel(ctx, scale, cxs, cys, labelR, false);
    this._drawSheen(ctx, W, cxs, cys, Routs, scale);
  }

  preRenderGroove(groovePoints, { cx = 260, cy = 260 } = {}) {
    const { canvas } = this;
    const W = canvas.width;
    const scale = W / 520;
    const points = groovePoints;
    const N = points.length / 2;
    if (N === 0) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = W;
    const ctx = offscreen.getContext('2d');
    const cxs = cx * scale, cys = cy * scale;
    const g = this.skin.groove;

    // Decimate for rendering — cap at 200k drawn segments regardless of point count.
    const step = Math.max(1, Math.floor(N / 200000));

    // --- Pass 1: base groove ---
    ctx.lineWidth = 0.55 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = g.base;
    ctx.beginPath();
    ctx.moveTo(points[0] * scale, points[1] * scale);
    for (let i = step; i < N; i += step) {
      ctx.lineTo(points[i * 2] * scale, points[i * 2 + 1] * scale);
    }
    ctx.stroke();

    // --- Pass 2: iridescent color overlay ---
    // Chunk the groove into ~1500 segments, each colored by the midpoint's angle.
    // When the disc image rotates, the hues sweep around — exactly like vinyl iridescence.
    const chunkPts = Math.max(step * 2, Math.floor(N / 1500));
    ctx.lineWidth = 1.0 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let start = 0; start < N - 1; start += chunkPts) {
      const mid = Math.min(start + Math.floor(chunkPts / 2), N - 1);
      const mx = points[mid * 2] - cx;
      const my = points[mid * 2 + 1] - cy;
      const angle = Math.atan2(my, mx); // -π to π
      // Map angle to a hue that sweeps the full spectrum once per revolution.
      const hue = ((angle / TAU) * 360 + 360) % 360;
      // Shift palette using skin-defined hue shift and multiplier.
      const shiftedHue = (hue * g.hueMult + g.hueShift) % 360;

      const end = Math.min(start + chunkPts + 1, N);
      ctx.beginPath();
      ctx.moveTo(points[start * 2] * scale, points[start * 2 + 1] * scale);
      for (let j = start + step; j < end; j += step) {
        ctx.lineTo(points[j * 2] * scale, points[j * 2 + 1] * scale);
      }
      ctx.strokeStyle = `hsla(${shiftedHue}, 85%, 68%, 0.28)`;
      ctx.stroke();
    }

    // --- Pass 3: tight bright glow core ---
    ctx.shadowColor = g.glow;
    ctx.shadowBlur = 4 * scale;
    ctx.lineWidth = 0.3 * scale;
    ctx.strokeStyle = g.glowCore;
    ctx.beginPath();
    ctx.moveTo(points[0] * scale, points[1] * scale);
    for (let i = step; i < N; i += step) {
      ctx.lineTo(points[i * 2] * scale, points[i * 2 + 1] * scale);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    this.grooveImage = offscreen;
  }

  drawDiscWithGroove(rotation, stylusProgress, { Rout = 220, Rin = 40, cx = 260, cy = 260 } = {}, amplitude = 0) {
    const { canvas } = this;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const scale = W / 520;
    const cxs = cx * scale, cys = cy * scale;
    const Routs = (Rout + 8) * scale;
    const Rins = Math.max(12, Rin - 8) * scale;
    const labelR = 45 * scale;

    ctx.clearRect(0, 0, W, W);

    // --- Rotating disc body + groove ---
    ctx.save();
    ctx.translate(cxs, cys);
    ctx.rotate(rotation);
    ctx.translate(-cxs, -cys);

    this._drawDiscBody(ctx, W, scale, cxs, cys, Routs, Rins);
    if (this.grooveImage) ctx.drawImage(this.grooveImage, 0, 0);

    // Rotating sheen: a soft radial highlight fixed to the disc surface.
    const sheenX = cxs + Routs * 0.28;
    const sheenY = cys - Routs * 0.42;
    const sheenGrad = ctx.createRadialGradient(sheenX, sheenY, 0, sheenX, sheenY, Routs * 0.75);
    sheenGrad.addColorStop(0, 'rgba(255,255,255,0.055)');
    sheenGrad.addColorStop(0.45, 'rgba(255,255,255,0.018)');
    sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs - scale, 0, TAU);
    ctx.clip();
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(cxs - Routs, cys - Routs, Routs * 2, Routs * 2);
    ctx.restore();

    this._drawLabel(ctx, scale, cxs, cys, labelR, true);

    ctx.restore(); // end rotation

    // --- Active groove ring (fixed, underneath stylus) ---
    if (stylusProgress >= 0 && stylusProgress <= 1) {
      const t = stylusProgress;
      const grooveR = (Rout - t * (Rout - Rin)) * scale;
      const ar = this.skin.activeRing;

      ctx.save();
      ctx.shadowColor = ar.glow;
      ctx.shadowBlur = 18 * scale;
      ctx.beginPath();
      ctx.arc(cxs, cys, grooveR, 0, TAU);
      ctx.strokeStyle = ar.outer;
      ctx.lineWidth = 2.5 * scale;
      ctx.stroke();
      ctx.shadowBlur = 8 * scale;
      ctx.beginPath();
      ctx.arc(cxs, cys, grooveR, 0, TAU);
      ctx.strokeStyle = ar.inner;
      ctx.lineWidth = 1.0 * scale;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // --- Fixed outer sheen (viewer's perspective) ---
    this._drawSheen(ctx, W, cxs, cys, Routs, scale);

    // --- Stylus ---
    if (stylusProgress >= 0 && stylusProgress <= 1) {
      const t = stylusProgress;
      const fixedAngle = -Math.PI * 0.25;
      const r = (Rout - t * (Rout - Rin)) * scale;
      const sx = cxs + r * Math.cos(fixedAngle);
      const sy = cys + r * Math.sin(fixedAngle);
      const s = this.skin.stylus;

      // pulse: 1.0 at silence, up to ~4.0 on loud transients.
      const pulse = 1 + amplitude * 5.0;
      ctx.save();

      // Outer bloom — grows dramatically on hits.
      ctx.shadowColor = s.bloom;
      ctx.shadowBlur = (35 + amplitude * 80) * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, 6 * pulse * scale, 0, TAU);
      ctx.fillStyle = `rgba(${s.bloomFill[0]},${s.bloomFill[1]},${s.bloomFill[2]},${0.25 + amplitude * 0.25})`;
      ctx.fill();

      // Mid glow.
      ctx.shadowBlur = (20 + amplitude * 40) * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 * pulse * scale, 0, TAU);
      ctx.fillStyle = `rgba(${s.bloomFill[0]},${s.midG + (amplitude * 80 | 0)},${s.bloomFill[2]},${0.6 + amplitude * 0.3})`;
      ctx.fill();

      // Core dot — tight, bright.
      ctx.shadowColor = s.coreGlow;
      ctx.shadowBlur = (8 + amplitude * 20) * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5 * Math.max(1, pulse * 0.7) * scale, 0, TAU);
      ctx.fillStyle = s.core;
      ctx.fill();

      // White hot center.
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2 * scale, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Beam — lengthens and widens on transients.
      const beamLen = (25 + amplitude * 40) * scale;
      const beamW   = (2.5 + amplitude * 4) * scale;
      const [br, bg, bb] = s.beamRGB;
      const beamGrad = ctx.createLinearGradient(sx, sy, sx, sy - beamLen);
      beamGrad.addColorStop(0,   `rgba(${br},${bg},${bb},${0.5 + amplitude * 0.4})`);
      beamGrad.addColorStop(0.3, `rgba(${br},${bg},${bb},${0.1 + amplitude * 0.2})`);
      beamGrad.addColorStop(1,   `rgba(${br},${bg},${bb},0)`);
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(sx - beamW, sy);
      ctx.lineTo(sx - beamW * 0.3, sy - beamLen);
      ctx.lineTo(sx + beamW * 0.3, sy - beamLen);
      ctx.lineTo(sx + beamW, sy);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  _drawDiscBody(ctx, W, scale, cxs, cys, Routs, Rins) {
    const d = this.skin.disc;

    // Main disc
    const discGrad = ctx.createRadialGradient(cxs, cys, Rins, cxs, cys, Routs);
    discGrad.addColorStop(0,   d.bg[0]);
    discGrad.addColorStop(0.5, d.bg[1]);
    discGrad.addColorStop(1,   d.bg[2]);
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs, 0, TAU);
    ctx.fillStyle = discGrad;
    ctx.fill();
    ctx.strokeStyle = d.rim;
    ctx.lineWidth = 3 * scale;
    ctx.stroke();

    // Subtle concentric groove rings (vinyl microstructure at a distance)
    for (let i = 0; i < 10; i++) {
      const r = Rins + (Routs - Rins) * (i / 10);
      ctx.beginPath();
      ctx.arc(cxs, cys, r, 0, TAU);
      ctx.strokeStyle = i % 2 === 0 ? d.rings[0] : d.rings[1];
      ctx.lineWidth = 0.4 * scale;
      ctx.stroke();
    }

    // Outer rim highlight
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs - scale, 0, TAU);
    ctx.strokeStyle = d.outerRim;
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    // Theme-specific disc art
    if (this.skin.theme === 'eq') this._drawEqBars(ctx, scale, cxs, cys, Routs, Rins);
  }

  _drawLabel(ctx, scale, cxs, cys, labelR, hasGroove) {
    if (this.skin.theme === 'owl') {
      this._drawOwlEye(ctx, scale, cxs, cys, labelR);
      return;
    }

    const l = this.skin.label;
    const fontUI = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim();

    const labelGrad = ctx.createRadialGradient(cxs, cys, 0, cxs, cys, labelR);
    labelGrad.addColorStop(0,   l.bg[0]);
    labelGrad.addColorStop(0.7, l.bg[1]);
    labelGrad.addColorStop(1,   l.bg[2]);
    ctx.beginPath();
    ctx.arc(cxs, cys, labelR, 0, TAU);
    ctx.fillStyle = labelGrad;
    ctx.fill();
    ctx.strokeStyle = l.border;
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    // Inner ring on label
    ctx.beginPath();
    ctx.arc(cxs, cys, labelR * 0.6, 0, TAU);
    ctx.strokeStyle = l.innerRing;
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();

    const labelText = l.labelText || 'SPIRAL';
    ctx.font = `bold ${9 * scale}px ${fontUI}`;
    ctx.fillStyle = hasGroove ? l.text : l.textEmpty;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hasGroove ? labelText : 'DROP AUDIO', cxs, cys - 4 * scale);
    if (!hasGroove) {
      ctx.font = `${7 * scale}px ${fontUI}`;
      ctx.fillStyle = l.textEmpty;
      ctx.fillText('TO GENERATE', cxs, cys + 7 * scale);
    }

    // Spindle hole
    ctx.beginPath();
    ctx.arc(cxs, cys, 4 * scale, 0, TAU);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();
  }

  _drawOwlEye(ctx, scale, cxs, cys, _labelR) {
    const eyeR  = 90 * scale;   // 2× larger than stock label
    const irisR = eyeR * 0.88;
    const pupilR = eyeR * 0.42;

    // Feathery dark mask surrounding the eye (owl facial disc)
    ctx.save();
    ctx.beginPath(); ctx.arc(cxs, cys, eyeR * 1.05, 0, TAU); ctx.clip();
    const maskGrad = ctx.createRadialGradient(cxs, cys, irisR, cxs, cys, eyeR * 1.05);
    maskGrad.addColorStop(0,   'rgba(0,0,0,0)');
    maskGrad.addColorStop(0.5, 'rgba(6,3,1,0.55)');
    maskGrad.addColorStop(1,   'rgba(4,2,0,0.92)');
    ctx.fillStyle = maskGrad;
    ctx.fillRect(cxs - eyeR * 1.1, cys - eyeR * 1.1, eyeR * 2.2, eyeR * 2.2);
    ctx.restore();

    // Sclera — faint cream ring just outside iris
    const scleraGrad = ctx.createRadialGradient(cxs, cys, irisR * 0.96, cxs, cys, irisR * 1.10);
    scleraGrad.addColorStop(0, 'rgba(200,170,110,0.0)');
    scleraGrad.addColorStop(0.6, 'rgba(160,130,80,0.22)');
    scleraGrad.addColorStop(1, 'rgba(100,75,40,0.10)');
    ctx.beginPath(); ctx.arc(cxs, cys, irisR * 1.10, 0, TAU);
    ctx.fillStyle = scleraGrad; ctx.fill();

    // Main iris fill
    const irisGrad = ctx.createRadialGradient(cxs, cys, 0, cxs, cys, irisR);
    irisGrad.addColorStop(0,    '#1c0900');
    irisGrad.addColorStop(0.22, '#4e1c00');
    irisGrad.addColorStop(0.48, '#904c08');
    irisGrad.addColorStop(0.70, '#c07010');
    irisGrad.addColorStop(0.88, '#d88c1a');
    irisGrad.addColorStop(1,    '#e89c20');
    ctx.beginPath(); ctx.arc(cxs, cys, irisR, 0, TAU);
    ctx.fillStyle = irisGrad; ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cxs, cys, irisR, 0, TAU); ctx.clip();

    // Iris fibers — coarse layer (120 lines, varying length + opacity)
    for (let i = 0; i < 120; i++) {
      const angle = (i / 120) * TAU;
      const innerR = pupilR * 1.08;
      const outerR = irisR * (0.82 + (Math.sin(i * 5.73) * 0.5 + 0.5) * 0.18);
      const alpha  = 0.06 + (Math.sin(i * 3.73 + 1.1) * 0.5 + 0.5) * 0.13;
      const thick  = (0.35 + (Math.sin(i * 7.31) * 0.5 + 0.5) * 0.65) * scale;
      ctx.beginPath();
      ctx.moveTo(cxs + innerR * Math.cos(angle), cys + innerR * Math.sin(angle));
      ctx.lineTo(cxs + outerR * Math.cos(angle), cys + outerR * Math.sin(angle));
      ctx.strokeStyle = `rgba(255,215,95,${alpha})`;
      ctx.lineWidth = thick; ctx.stroke();
    }
    // Iris fibers — fine layer (80 lines, offset half-step)
    for (let i = 0; i < 80; i++) {
      const angle = (i / 80) * TAU + (TAU / 160);
      const innerR = pupilR * 1.04;
      const alpha  = 0.04 + (Math.cos(i * 4.91 + 0.7) * 0.5 + 0.5) * 0.09;
      ctx.beginPath();
      ctx.moveTo(cxs + innerR * Math.cos(angle), cys + innerR * Math.sin(angle));
      ctx.lineTo(cxs + irisR  * 0.95 * Math.cos(angle), cys + irisR * 0.95 * Math.sin(angle));
      ctx.strokeStyle = `rgba(200,155,55,${alpha})`;
      ctx.lineWidth = 0.28 * scale; ctx.stroke();
    }

    // Iris crypts — dark irregular patches
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * TAU + i * 0.31;
      const r     = pupilR * 1.25 + (irisR - pupilR * 1.25) * (0.15 + (Math.sin(i * 2.7) * 0.5 + 0.5) * 0.65);
      const cr    = (2.5 + (Math.sin(i * 5.1) * 0.5 + 0.5) * 6) * scale;
      const alpha = 0.14 + (Math.sin(i * 3.3) * 0.5 + 0.5) * 0.22;
      ctx.beginPath();
      ctx.ellipse(
        cxs + r * Math.cos(angle), cys + r * Math.sin(angle),
        cr, cr * 0.65, angle, 0, TAU
      );
      ctx.fillStyle = `rgba(8,3,0,${alpha})`; ctx.fill();
    }

    // Collarette — jagged ring at inner pupil border
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      const r = pupilR * (1.12 + (Math.sin(i * 7 + 2) * 0.5 + 0.5) * 0.14);
      ctx.beginPath();
      ctx.arc(cxs + r * Math.cos(a), cys + r * Math.sin(a), 2.2 * scale, 0, TAU);
      ctx.fillStyle = `rgba(25,10,0,${0.28 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 0.28})`; ctx.fill();
    }

    // Limbal darkening (dark ring at outer iris edge)
    ctx.beginPath(); ctx.arc(cxs, cys, irisR, 0, TAU);
    const limbal = ctx.createRadialGradient(cxs, cys, irisR * 0.76, cxs, cys, irisR);
    limbal.addColorStop(0, 'rgba(0,0,0,0)');
    limbal.addColorStop(1, 'rgba(0,0,0,0.84)');
    ctx.fillStyle = limbal; ctx.fill();

    ctx.restore();

    // Iris border
    ctx.beginPath(); ctx.arc(cxs, cys, irisR, 0, TAU);
    ctx.strokeStyle = 'rgba(170,110,18,0.65)'; ctx.lineWidth = 1.8 * scale; ctx.stroke();

    // Pupil
    const pupilGrad = ctx.createRadialGradient(cxs, cys, 0, cxs, cys, pupilR);
    pupilGrad.addColorStop(0,   '#140800');
    pupilGrad.addColorStop(0.55, '#080300');
    pupilGrad.addColorStop(1,   '#000000');
    ctx.beginPath(); ctx.arc(cxs, cys, pupilR, 0, TAU);
    ctx.fillStyle = pupilGrad; ctx.fill();

    // Pupil edge glow
    ctx.beginPath(); ctx.arc(cxs, cys, pupilR, 0, TAU);
    ctx.strokeStyle = 'rgba(130,70,10,0.55)'; ctx.lineWidth = 1.4 * scale; ctx.stroke();

    // Primary corneal highlight — large, offset upper-left
    const hx = cxs - pupilR * 0.38, hy = cys - pupilR * 0.50;
    const h1 = ctx.createRadialGradient(hx, hy, 0, hx, hy, pupilR * 0.44);
    h1.addColorStop(0,   'rgba(255,255,255,0.80)');
    h1.addColorStop(0.4, 'rgba(255,248,225,0.24)');
    h1.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(hx, hy, pupilR * 0.44, 0, TAU);
    ctx.fillStyle = h1; ctx.fill();

    // Secondary corneal highlight — small, lower-right
    const hx2 = cxs + pupilR * 0.38, hy2 = cys + pupilR * 0.40;
    const h2 = ctx.createRadialGradient(hx2, hy2, 0, hx2, hy2, pupilR * 0.16);
    h2.addColorStop(0, 'rgba(255,255,255,0.35)');
    h2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(hx2, hy2, pupilR * 0.16, 0, TAU);
    ctx.fillStyle = h2; ctx.fill();

    // Spindle hole
    ctx.beginPath(); ctx.arc(cxs, cys, 4 * scale, 0, TAU);
    ctx.fillStyle = '#000'; ctx.fill();
  }

  _drawEqBars(ctx, scale, cxs, cys, Routs, Rins) {
    const numBars = 24;
    const gap = 0.07; // radians gap between bars
    const barAngle = TAU / numBars;
    const span = Routs - Rins;

    // Deterministic fake spectrum — blend of harmonics
    const heights = Array.from({ length: numBars }, (_, i) => {
      const t = i / numBars;
      return Math.max(0.06, Math.min(0.92, Math.abs(
        Math.sin(t * Math.PI * 4.1)       * 0.45 +
        Math.sin(t * Math.PI * 9.3 + 1.2) * 0.30 +
        Math.cos(t * Math.PI * 2.7 + 0.5) * 0.25
      )));
    });

    ctx.save();

    // Pass 1 — wide diffuse bloom behind each bar
    for (let i = 0; i < numBars; i++) {
      const a0 = i * barAngle + gap / 2;
      const a1 = (i + 1) * barAngle - gap / 2;
      const h  = heights[i];
      const outerR = Rins + span * h;

      ctx.beginPath();
      ctx.arc(cxs, cys, outerR, a0, a1);
      ctx.arc(cxs, cys, Rins,   a1, a0, true);
      ctx.closePath();
      ctx.shadowColor = `rgba(0,255,90,${0.5 + h * 0.3})`;
      ctx.shadowBlur  = 20 * scale;
      ctx.fillStyle   = `rgba(0,200,70,${0.08 + h * 0.12})`;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Pass 2 — solid sector fill
    for (let i = 0; i < numBars; i++) {
      const a0 = i * barAngle + gap / 2;
      const a1 = (i + 1) * barAngle - gap / 2;
      const h  = heights[i];
      const outerR = Rins + span * h;

      ctx.beginPath();
      ctx.arc(cxs, cys, outerR, a0, a1);
      ctx.arc(cxs, cys, Rins,   a1, a0, true);
      ctx.closePath();

      const fillGrad = ctx.createRadialGradient(cxs, cys, Rins, cxs, cys, outerR);
      fillGrad.addColorStop(0,   `rgba(0,200,80,0.0)`);
      fillGrad.addColorStop(0.5, `rgba(0,220,85,${0.12 + h * 0.16})`);
      fillGrad.addColorStop(1,   `rgba(0,255,100,${0.22 + h * 0.26})`);
      ctx.fillStyle = fillGrad;
      ctx.fill();
    }

    // Pass 3 — bright glowing tip edge
    for (let i = 0; i < numBars; i++) {
      const a0 = i * barAngle + gap / 2;
      const a1 = (i + 1) * barAngle - gap / 2;
      const h  = heights[i];
      const outerR = Rins + span * h;

      ctx.beginPath();
      ctx.arc(cxs, cys, outerR, a0, a1);
      ctx.strokeStyle = `rgba(140,255,170,${0.60 + h * 0.38})`;
      ctx.lineWidth   = 2.0 * scale;
      ctx.shadowColor = 'rgba(0,255,100,1.0)';
      ctx.shadowBlur  = 14 * scale;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _drawSheen(ctx, W, cxs, cys, Routs, scale) {
    // Viewer-perspective sheen — fixed in world space (doesn't rotate).
    const sheenGrad = ctx.createRadialGradient(
      cxs - Routs * 0.22, cys - Routs * 0.38, 0,
      cxs - Routs * 0.22, cys - Routs * 0.38, Routs * 0.95
    );
    sheenGrad.addColorStop(0, 'rgba(255,255,255,0.038)');
    sheenGrad.addColorStop(0.5, 'rgba(255,255,255,0.010)');
    sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs - scale, 0, TAU);
    ctx.clip();
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(0, 0, W, W);
    ctx.restore();
  }
}
