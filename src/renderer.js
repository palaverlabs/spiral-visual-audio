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

    const discGrad = ctx.createRadialGradient(cxs, cys, 0, cxs, cys, Routs);
    discGrad.addColorStop(0, '#1a1e25');
    discGrad.addColorStop(0.85, '#0e1217');
    discGrad.addColorStop(1, '#0b0f14');
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs, 0, TAU);
    ctx.fillStyle = discGrad;
    ctx.fill();
    ctx.strokeStyle = '#233242';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const r = Rins + (Routs - Rins) * (i / 8);
      ctx.beginPath();
      ctx.arc(cxs, cys, r, 0, TAU);
      ctx.strokeStyle = 'rgba(90, 216, 207, 0.04)';
      ctx.lineWidth = 0.5 * scale;
      ctx.stroke();
    }

    const labelGrad = ctx.createRadialGradient(cxs, cys, 0, cxs, cys, labelR);
    labelGrad.addColorStop(0, '#2a1a3a');
    labelGrad.addColorStop(1, '#1a0e2a');
    ctx.beginPath();
    ctx.arc(cxs, cys, labelR, 0, TAU);
    ctx.fillStyle = labelGrad;
    ctx.fill();
    ctx.strokeStyle = '#4a3060';
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cxs, cys, 4 * scale, 0, TAU);
    ctx.fillStyle = '#333';
    ctx.fill();

    ctx.font = `${11 * scale}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'center';
    ctx.fillText('DROP AUDIO', cxs, cys - 4 * scale);
    ctx.font = `${8 * scale}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillText('TO GENERATE GROOVE', cxs, cys + 8 * scale);
  }

  preRenderGroove(groovePoints) {
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

    const step = Math.max(1, Math.floor(N / 200000));

    ctx.lineWidth = 0.6 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(90, 216, 207, 0.55)';
    ctx.beginPath();
    ctx.moveTo(points[0] * scale, points[1] * scale);
    for (let i = step; i < N; i += step) {
      ctx.lineTo(points[i * 2] * scale, points[i * 2 + 1] * scale);
    }
    ctx.stroke();

    ctx.shadowColor = '#5ad8cf';
    ctx.shadowBlur = 3 * scale;
    ctx.strokeStyle = 'rgba(90, 216, 207, 0.12)';
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

    ctx.save();
    ctx.translate(cxs, cys);
    ctx.rotate(rotation);
    ctx.translate(-cxs, -cys);

    const discGrad = ctx.createRadialGradient(cxs, cys, Rins, cxs, cys, Routs);
    discGrad.addColorStop(0, '#151920');
    discGrad.addColorStop(0.5, '#0e1217');
    discGrad.addColorStop(1, '#0b0f14');
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs, 0, TAU);
    ctx.fillStyle = discGrad;
    ctx.fill();
    ctx.strokeStyle = '#233242';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    if (this.grooveImage) ctx.drawImage(this.grooveImage, 0, 0);

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

    ctx.font = `bold ${9 * scale}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(200,170,255,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('VAGC', cxs, cys + 3 * scale);

    ctx.beginPath();
    ctx.arc(cxs, cys, 4 * scale, 0, TAU);
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();

    ctx.restore();

    // Sheen stays fixed (not rotated)
    const sheenGrad = ctx.createRadialGradient(
      cxs - Routs * 0.25, cys - Routs * 0.25, 0,
      cxs - Routs * 0.25, cys - Routs * 0.25, Routs * 0.9
    );
    sheenGrad.addColorStop(0, 'rgba(255,255,255,0.04)');
    sheenGrad.addColorStop(0.5, 'rgba(255,255,255,0.01)');
    sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cxs, cys, Routs - 2 * scale, 0, TAU);
    ctx.clip();
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(0, 0, W, W);
    ctx.restore();

    if (stylusProgress >= 0 && stylusProgress <= 1) {
      const t = stylusProgress;
      const fixedAngle = -Math.PI * 0.25;
      const r = (Rout - t * (Rout - Rin)) * scale;
      const sx = cxs + r * Math.cos(fixedAngle);
      const sy = cys + r * Math.sin(fixedAngle);

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
}
