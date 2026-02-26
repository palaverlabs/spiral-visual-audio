import { TAU } from './constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.grooveImage = null;
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

    // Decimate for rendering — cap at 200k drawn segments regardless of point count.
    const step = Math.max(1, Math.floor(N / 200000));

    // --- Pass 1: base groove (dim teal) ---
    ctx.lineWidth = 0.55 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(90, 216, 207, 0.35)';
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
      // Shift palette toward vinyl-like: teals, blues, purples, magentas.
      const shiftedHue = (hue * 0.75 + 150) % 360;

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
    ctx.shadowColor = '#5ad8cf';
    ctx.shadowBlur = 4 * scale;
    ctx.lineWidth = 0.3 * scale;
    ctx.strokeStyle = 'rgba(90, 216, 207, 0.18)';
    ctx.beginPath();
    ctx.moveTo(points[0] * scale, points[1] * scale);
    for (let i = step; i < N; i += step) {
      ctx.lineTo(points[i * 2] * scale, points[i * 2 + 1] * scale);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    this.grooveImage = offscreen;
  }

  drawDiscWithGroove(rotation, stylusProgress, { Rout = 220, Rin = 40, cx = 260, cy = 260 } = {}) {
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
    // It sweeps around as the disc spins, like light catching a physical groove.
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

      ctx.save();
      ctx.shadowColor = '#5ad8cf';
      ctx.shadowBlur = 18 * scale;
      ctx.beginPath();
      ctx.arc(cxs, cys, grooveR, 0, TAU);
      ctx.strokeStyle = 'rgba(90, 216, 207, 0.22)';
      ctx.lineWidth = 2.5 * scale;
      ctx.stroke();
      ctx.shadowBlur = 8 * scale;
      ctx.beginPath();
      ctx.arc(cxs, cys, grooveR, 0, TAU);
      ctx.strokeStyle = 'rgba(160, 240, 235, 0.12)';
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

      // Tonearm line from edge to stylus
      const armStartX = cxs + (Routs + 12 * scale) * Math.cos(fixedAngle);
      const armStartY = cys + (Routs + 12 * scale) * Math.sin(fixedAngle);
      ctx.save();
      ctx.strokeStyle = 'rgba(180, 180, 200, 0.35)';
      ctx.lineWidth = 1.5 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(armStartX, armStartY);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.restore();

      // Stylus glow
      ctx.save();
      ctx.shadowColor = '#ff2200';
      ctx.shadowBlur = 35 * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, 6 * scale, 0, TAU);
      ctx.fillStyle = 'rgba(255, 30, 0, 0.4)';
      ctx.fill();

      ctx.shadowBlur = 20 * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, 4 * scale, 0, TAU);
      ctx.fillStyle = 'rgba(255, 60, 20, 0.7)';
      ctx.fill();

      ctx.shadowColor = '#ff6644';
      ctx.shadowBlur = 12 * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5 * scale, 0, TAU);
      ctx.fillStyle = '#ff4422';
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2 * scale, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Beam
      const beamLen = 25 * scale;
      const beamGrad = ctx.createLinearGradient(sx, sy, sx, sy - beamLen);
      beamGrad.addColorStop(0, 'rgba(255, 50, 20, 0.5)');
      beamGrad.addColorStop(0.3, 'rgba(255, 50, 20, 0.15)');
      beamGrad.addColorStop(1, 'rgba(255, 50, 20, 0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(sx - 2.5 * scale, sy);
      ctx.lineTo(sx - 0.8 * scale, sy - beamLen);
      ctx.lineTo(sx + 0.8 * scale, sy - beamLen);
      ctx.lineTo(sx + 2.5 * scale, sy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  _drawDiscBody(ctx, W, scale, cxs, cys, Routs, Rins) {
    // Main disc
    const discGrad = ctx.createRadialGradient(cxs, cys, Rins, cxs, cys, Routs);
    discGrad.addColorStop(0, '#151920');
    discGrad.addColorStop(0.5, '#0e1217');
    discGrad.addColorStop(1, '#0b0f14');
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs, 0, TAU);
    ctx.fillStyle = discGrad;
    ctx.fill();
    ctx.strokeStyle = '#1e2d3d';
    ctx.lineWidth = 3 * scale;
    ctx.stroke();

    // Subtle concentric groove rings (vinyl microstructure at a distance)
    for (let i = 0; i < 10; i++) {
      const r = Rins + (Routs - Rins) * (i / 10);
      ctx.beginPath();
      ctx.arc(cxs, cys, r, 0, TAU);
      ctx.strokeStyle = i % 2 === 0
        ? 'rgba(90, 216, 207, 0.025)'
        : 'rgba(100, 140, 200, 0.018)';
      ctx.lineWidth = 0.4 * scale;
      ctx.stroke();
    }

    // Outer rim highlight
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs - scale, 0, TAU);
    ctx.strokeStyle = 'rgba(100, 160, 220, 0.12)';
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();
  }

  _drawLabel(ctx, scale, cxs, cys, labelR, hasGroove) {
    const labelGrad = ctx.createRadialGradient(cxs, cys, 0, cxs, cys, labelR);
    labelGrad.addColorStop(0, '#2a1a3a');
    labelGrad.addColorStop(0.7, '#1e1030');
    labelGrad.addColorStop(1, '#150a22');
    ctx.beginPath();
    ctx.arc(cxs, cys, labelR, 0, TAU);
    ctx.fillStyle = labelGrad;
    ctx.fill();
    ctx.strokeStyle = '#4a3060';
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    // Inner ring on label
    ctx.beginPath();
    ctx.arc(cxs, cys, labelR * 0.6, 0, TAU);
    ctx.strokeStyle = 'rgba(120, 80, 180, 0.25)';
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();

    ctx.font = `bold ${9 * scale}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = hasGroove ? 'rgba(200,170,255,0.55)' : 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hasGroove ? 'VAGC' : 'DROP AUDIO', cxs, cys - 4 * scale);
    if (!hasGroove) {
      ctx.font = `${7 * scale}px 'Segoe UI', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
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
