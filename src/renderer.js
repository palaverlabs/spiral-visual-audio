import { TAU } from './constants.js';
import { SKINS } from './skin.js';

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
  return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '255,255,255';
};

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
    this._layerVersion = (this._layerVersion || 0) + 1;
    if (groovePoints) {
      this._groovePoints = groovePoints;
      this._grooveGeom = geom;
      this.preRenderGroove(groovePoints, geom);
    }
  }

  drawEmptyDisc({ Rout = 220, Rin = 40, cx = 260, cy = 260 } = {}, freqData = null) {
    const { canvas } = this;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;

    const baseScale = W / 520;
    const fs = this.skin.frameScale ?? 1.0;
    const scale = baseScale * fs;
    const cxs = cx * baseScale, cys = cy * baseScale;
    const Routs = (Rout + 8) * scale;
    const Rins = Math.max(12, Rin - 8) * scale;
    const labelR = 45 * scale;

    ctx.clearRect(0, 0, W, W);
    if (this.skin.theme === 'spectrum') this._drawRadialEQ(ctx, W, cxs, cys, Routs, scale, freqData);
    if (this.skin.frame === 'alien') this._drawAlienHeadBg(ctx, W, cxs, cys, Routs, scale);
    this._drawDiscBody(ctx, W, scale, cxs, cys, Routs, Rins);
    this._drawLabel(ctx, scale, cxs, cys, labelR, false);
    this._drawSheen(ctx, W, cxs, cys, Routs, scale);
    if (this.skin.frame === 'alien') this._drawAlienVisor(ctx, W, cxs, cys, Routs, scale);
  }

  // ── Encoding animation: the groove is laid down behind a glowing cutter head ──
  beginCut() {
    const W = this.canvas.width;
    this._cut = document.createElement('canvas');
    this._cut.width = this._cut.height = W;
    this._cutHead = null;
  }

  // pts: Float32Array of x,y groove vertices (disc coords), the next stretch of the cut.
  cutPoints(pts, { cx = 260, cy = 260 } = {}) {
    const n = pts.length / 2;
    if (!this._cut || !n) return;
    const W = this.canvas.width, b = W / 520, scale = b * (this.skin.frameScale ?? 1);
    const cxs = cx * b, cys = cy * b;
    const px = x => cxs + (x - cx) * scale, py = y => cys + (y - cy) * scale;
    const c = this._cut.getContext('2d');
    const g = this.skin.groove;
    const step = Math.max(1, Math.floor(n / 4000));
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    if (this._cutHead) c.moveTo(this._cutHead[0], this._cutHead[1]);
    else c.moveTo(px(pts[0]), py(pts[1]));
    for (let i = 0; i < n; i += step) c.lineTo(px(pts[i * 2]), py(pts[i * 2 + 1]));
    c.lineTo(px(pts[n * 2 - 2]), py(pts[n * 2 - 1]));
    c.strokeStyle = g.base; c.lineWidth = 0.55 * scale; c.stroke();
    const m = (n >> 1) * 2;
    const hue = ((((Math.atan2(pts[m + 1] - cy, pts[m] - cx) / TAU) * 360 + 360) % 360) * g.hueMult + g.hueShift) % 360;
    c.strokeStyle = `hsla(${hue}, 85%, 68%, 0.28)`; c.lineWidth = 1.0 * scale; c.stroke();
    c.strokeStyle = g.glowCore; c.lineWidth = 0.3 * scale; c.stroke();
    this._cutHead = [px(pts[n * 2 - 2]), py(pts[n * 2 - 1])];
  }

  drawCut({ Rout = 220, Rin = 40, cx = 260, cy = 260 } = {}) {
    if (!this._cut) return;
    const ctx = this.canvas.getContext('2d'), W = this.canvas.width;
    const b = W / 520, scale = b * (this.skin.frameScale ?? 1);
    const cxs = cx * b, cys = cy * b;
    const Routs = (Rout + 8) * scale, Rins = Math.max(12, Rin - 8) * scale, labelR = 45 * scale;
    const key = `${Rout},${Rin},${cx},${cy}`;
    ctx.clearRect(0, 0, W, W);
    if (this.skin.theme === 'spectrum') this._drawRadialEQ(ctx, W, cxs, cys, Routs, scale, null);
    if (this.skin.frame === 'alien') ctx.drawImage(this._layer('alienBg', key, W, c => this._drawAlienHeadBg(c, W, cxs, cys, Routs, scale)), 0, 0);
    ctx.drawImage(this._layer('cutBody', key, W, c => this._drawDiscBody(c, W, scale, cxs, cys, Routs, Rins)), 0, 0);
    ctx.drawImage(this._cut, 0, 0);
    this._drawLabel(ctx, scale, cxs, cys, labelR, true);
    ctx.drawImage(this._layer('sheen', key, W, c => this._drawSheen(c, W, cxs, cys, Routs, scale)), 0, 0);
    if (this._cutHead) {
      const [hx, hy] = this._cutHead;
      const [r, g, bl] = this.skin.stylus.bloomFill;
      const ang = Math.atan2(hy - cys, hx - cxs);
      const armR = Routs + 40 * scale;
      ctx.save();
      // Cutter arm reaching in from beyond the rim
      ctx.strokeStyle = `rgba(${r},${g},${bl},0.4)`; ctx.lineWidth = 1.5 * scale;
      ctx.beginPath(); ctx.moveTo(cxs + Math.cos(ang) * armR, cys + Math.sin(ang) * armR); ctx.lineTo(hx, hy); ctx.stroke();
      const gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, 28 * scale);
      gr.addColorStop(0, `rgba(${r},${g},${bl},0.95)`);
      gr.addColorStop(0.2, `rgba(${r},${g},${bl},0.4)`);
      gr.addColorStop(1, `rgba(${r},${g},${bl},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(hx, hy, 28 * scale, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 2.2 * scale, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (this.skin.frame === 'alien') ctx.drawImage(this._layer('alienVisor', key, W, c => this._drawAlienVisor(c, W, cxs, cys, Routs, scale)), 0, 0);
  }

  endCut() { this._cut = null; this._cutHead = null; }

  preRenderGroove(groovePoints, { cx = 260, cy = 260 } = {}) {
    const { canvas } = this;
    const W = canvas.width;
    const baseScale = W / 520;
    const fs = this.skin.frameScale ?? 1.0;
    const scale = baseScale * fs;
    const points = groovePoints;
    const N = points.length / 2;
    if (N === 0) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = W;
    const ctx = offscreen.getContext('2d');
    // Centre stays fixed at the base-scale canvas position regardless of frameScale.
    const cxs = cx * baseScale, cys = cy * baseScale;
    const px = x => cxs + (x - cx) * scale;
    const py = y => cys + (y - cy) * scale;
    const g = this.skin.groove;

    // Decimate for rendering — cap at 200k drawn segments regardless of point count.
    const step = Math.max(1, Math.floor(N / 200000));

    // --- Pass 1: base groove ---
    ctx.lineWidth = 0.55 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = g.base;
    ctx.beginPath();
    ctx.moveTo(px(points[0]), py(points[1]));
    for (let i = step; i < N; i += step) {
      ctx.lineTo(px(points[i * 2]), py(points[i * 2 + 1]));
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
      ctx.moveTo(px(points[start * 2]), py(points[start * 2 + 1]));
      for (let j = start + step; j < end; j += step) {
        ctx.lineTo(px(points[j * 2]), py(points[j * 2 + 1]));
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
    ctx.moveTo(px(points[0]), py(points[1]));
    for (let i = step; i < N; i += step) {
      ctx.lineTo(px(points[i * 2]), py(points[i * 2 + 1]));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    this.grooveImage = offscreen;
    this._layerVersion = (this._layerVersion || 0) + 1;
  }

  // Static artwork (disc body + groove + label, sheens, alien frame) is drawn once into
  // offscreen layers; each frame only composites them. Rebuilt when skin, groove or size changes.
  _layer(name, key, W, draw) {
    this._layers ??= {};
    const fullKey = `${this._layerVersion || 0}|${W}|${key}`;
    const hit = this._layers[name];
    if (hit && hit.key === fullKey) return hit.canvas;
    const canvas = hit?.canvas ?? document.createElement('canvas');
    canvas.width = W;
    canvas.height = W;
    draw(canvas.getContext('2d'));
    this._layers[name] = { key: fullKey, canvas };
    return canvas;
  }

  drawDiscWithGroove(rotation, stylusProgress, { Rout = 220, Rin = 40, cx = 260, cy = 260 } = {}, amplitude = 0, freqData = null) {
    const { canvas } = this;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;

    const baseScale = W / 520;
    const fs = this.skin.frameScale ?? 1.0;
    const scale = baseScale * fs;
    const cxs = cx * baseScale, cys = cy * baseScale;
    const Routs = (Rout + 8) * scale;
    const Rins = Math.max(12, Rin - 8) * scale;
    const labelR = 45 * scale;

    const geomKey = `${Rout},${Rin},${cx},${cy}`;
    const alien = this.skin.frame === 'alien';

    ctx.clearRect(0, 0, W, W);
    if (this.skin.theme === 'spectrum') this._drawRadialEQ(ctx, W, cxs, cys, Routs, scale, freqData);
    if (alien) ctx.drawImage(this._layer('alienBg', geomKey, W, c => this._drawAlienHeadBg(c, W, cxs, cys, Routs, scale)), 0, 0);

    // --- Rotating disc: body, groove, surface sheen and label, pre-composited once ---
    const disc = this._layer('disc', geomKey, W, c => {
      this._drawDiscBody(c, W, scale, cxs, cys, Routs, Rins);
      if (this.grooveImage) c.drawImage(this.grooveImage, 0, 0);
      const sheenX = cxs + Routs * 0.28;
      const sheenY = cys - Routs * 0.42;
      const sheenGrad = c.createRadialGradient(sheenX, sheenY, 0, sheenX, sheenY, Routs * 0.75);
      sheenGrad.addColorStop(0, 'rgba(255,255,255,0.055)');
      sheenGrad.addColorStop(0.45, 'rgba(255,255,255,0.018)');
      sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
      c.save();
      c.beginPath();
      c.arc(cxs, cys, Routs - scale, 0, TAU);
      c.clip();
      c.fillStyle = sheenGrad;
      c.fillRect(cxs - Routs, cys - Routs, Routs * 2, Routs * 2);
      c.restore();
      if (this.skin.spiralArms) this._drawSpiralArms(c, scale, cxs, cys, Routs, labelR);
      this._drawLabel(c, scale, cxs, cys, labelR, true);
    });
    const frame = this.skin.frame;
    if (frame === 'hypno') this._drawHypnoBack(ctx, W, geomKey);
    if (frame === 'jar') this._drawJarBack(ctx, W, geomKey, rotation, amplitude);

    // The disc can appear more than once (eyes) or in perspective (a whirlpool).
    for (const p of this.placements(W, cxs, cys)) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.kx, p.ky);
    ctx.translate(-cxs, -cys);

    ctx.save();
    ctx.translate(cxs, cys);
    ctx.rotate(rotation);
    ctx.translate(-cxs, -cys);
    ctx.drawImage(disc, 0, 0);
    ctx.restore();

    const playing = stylusProgress >= 0 && stylusProgress <= 1;
    const r = playing ? (Rout - stylusProgress * (Rout - Rin)) * scale : 0;

    // --- Active groove ring: layered strokes stand in for shadowBlur (far cheaper per frame) ---
    if (playing) {
      const ar = this.skin.activeRing;
      ctx.save();
      ctx.strokeStyle = ar.glow;
      ctx.globalAlpha = 0.05; ctx.lineWidth = 14 * scale;
      ctx.beginPath(); ctx.arc(cxs, cys, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.1; ctx.lineWidth = 6 * scale;
      ctx.beginPath(); ctx.arc(cxs, cys, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ar.outer; ctx.lineWidth = 2.5 * scale;
      ctx.beginPath(); ctx.arc(cxs, cys, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = ar.inner; ctx.lineWidth = 1.0 * scale;
      ctx.beginPath(); ctx.arc(cxs, cys, r, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // --- Fixed outer sheen (viewer's perspective) ---
    ctx.drawImage(this._layer('sheen', geomKey, W, c => this._drawSheen(c, W, cxs, cys, Routs, scale)), 0, 0);

    // --- Stylus: radial-gradient glows instead of shadowBlur ---
    if (playing) {
      const fixedAngle = -Math.PI * 0.25;
      const sx = cxs + r * Math.cos(fixedAngle);
      const sy = cys + r * Math.sin(fixedAngle);
      const s = this.skin.stylus;
      const pulse = 1 + amplitude * 3.0;   // 1.0 at silence, up to ~4.0 on loud transients
      const [br, bgc, bb] = s.bloomFill;
      // Approximates a filled dot with shadowBlur: solid to the dot's edge, then a soft falloff over ~blur px.
      const glow = (coreR, blur, rgb, alpha) => {
        const outer = coreR + blur * 0.75;
        const k = coreR / outer;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, outer);
        gr.addColorStop(0, `rgba(${rgb},${Math.min(1, alpha)})`);
        gr.addColorStop(k, `rgba(${rgb},${Math.min(1, alpha * 0.9)})`);
        gr.addColorStop(k + (1 - k) * 0.3, `rgba(${rgb},${alpha * 0.4})`);
        gr.addColorStop(k + (1 - k) * 0.65, `rgba(${rgb},${alpha * 0.12})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(sx, sy, outer, 0, TAU); ctx.fill();
      };
      ctx.save();
      glow(6 * pulse * scale, (28 + amplitude * 45) * scale, `${br},${bgc},${bb}`, 0.28 + amplitude * 0.17);
      glow(4 * pulse * scale, (16 + amplitude * 28) * scale, `${br},${s.midG + (amplitude * 60 | 0)},${bb}`, 0.5 + amplitude * 0.2);
      glow(2.5 * Math.max(1, pulse * 0.7) * scale, (7 + amplitude * 14) * scale, hexToRgb(s.coreGlow), 0.6);
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5 * Math.max(1, pulse * 0.7) * scale, 0, TAU);
      ctx.fillStyle = s.core;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2 * scale, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Beam — lengthens and widens on transients.
      const beamLen = (24 + amplitude * 26) * scale;
      const beamW   = (2.2 + amplitude * 2.8) * scale;
      const [bR, bG, bB] = s.beamRGB;
      const beamGrad = ctx.createLinearGradient(sx, sy, sx, sy - beamLen);
      beamGrad.addColorStop(0,   `rgba(${bR},${bG},${bB},${0.5 + amplitude * 0.4})`);
      beamGrad.addColorStop(0.3, `rgba(${bR},${bG},${bB},${0.1 + amplitude * 0.2})`);
      beamGrad.addColorStop(1,   `rgba(${bR},${bG},${bB},0)`);
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

    ctx.restore();
    }

    if (frame === 'hypno') this._drawHypnoFront(ctx, W, geomKey, amplitude);
    if (frame === 'jar') this._drawJarFront(ctx, W, geomKey);
    if (alien) ctx.drawImage(this._layer('alienVisor', geomKey, W, c => this._drawAlienVisor(c, W, cxs, cys, Routs, scale)), 0, 0);
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

  // EQ skin: a ring of LED segments around the record, driven by the live spectrum.
  // Mirrored left/right with bass at the top, so the ring reads as one symmetric shape.
  _drawRadialEQ(ctx, W, cxs, cys, Routs, scale, freqData) {
    const BANDS = 36;            // per side
    const SEGS = 12;
    const bars = BANDS * 2;
    const r0 = Routs + 10 * scale;
    const len = Math.max(0, W / 2 - r0 - 6 * scale);
    const segLen = len / SEGS;
    const barArc = TAU / bars;
    const barW = Math.max(2, r0 * barArc * 0.62);

    if (!this._eqLevels || this._eqLevels.length !== BANDS) {
      this._eqLevels = new Float32Array(BANDS);
      this._eqPeaks = new Float32Array(BANDS);
      this._eqHold = new Uint8Array(BANDS);
    }
    const levels = this._eqLevels, peaks = this._eqPeaks, hold = this._eqHold;

    // Log-spaced bands from ~40 Hz to ~16 kHz (bin width ≈ 46 Hz at fftSize 1024).
    for (let i = 0; i < BANDS; i++) {
      let v = 0;
      if (freqData) {
        const binHz = 46;
        const f0 = 40 * Math.pow(400, i / BANDS), f1 = 40 * Math.pow(400, (i + 1) / BANDS);
        const b0 = Math.min(freqData.length - 1, Math.floor(f0 / binHz));
        const b1 = Math.min(freqData.length, Math.max(b0 + 1, Math.ceil(f1 / binHz)));
        let max = 0;
        for (let b = b0; b < b1; b++) if (freqData[b] > max) max = freqData[b];
        // Highs carry less energy; tilt them up so the whole ring moves.
        v = Math.min(1, Math.pow(max / 255, 1.6) * (1 + 0.9 * i / BANDS));
      }
      if (!freqData) { levels[i] = peaks[i] = 0; continue; } // stopped: ring rests dark
      // Fast attack, slow release.
      levels[i] = v > levels[i] ? v : Math.max(v, levels[i] - 0.035);
      if (levels[i] >= peaks[i]) { peaks[i] = levels[i]; hold[i] = 20; }
      else if (hold[i] > 0) hold[i]--;
      else peaks[i] = Math.max(0, peaks[i] - 0.012);
    }

    const color = t => t < 0.6 ? '#00e060' : t < 0.85 ? '#d8e000' : '#ff3c14';
    ctx.save();
    ctx.translate(cxs, cys);
    for (let k = 0; k < bars; k++) {
      const band = k < BANDS ? k : bars - 1 - k;
      const lit = Math.round(levels[band] * SEGS);
      const pk = Math.min(SEGS - 1, Math.round(peaks[band] * SEGS));
      ctx.save();
      ctx.rotate(-Math.PI / 2 + (k + 0.5) * barArc);
      for (let sgm = 0; sgm < SEGS; sgm++) {
        const t = sgm / SEGS;
        const on = sgm < lit;
        const isPeak = !on && sgm === pk && peaks[band] > 0.05;
        ctx.globalAlpha = on ? 1 : isPeak ? 0.85 : 0.07;
        ctx.fillStyle = isPeak ? '#ff3c14' : color(t);
        ctx.fillRect(r0 + sgm * segLen, -barW / 2, segLen * 0.72, barW);
      }
      ctx.restore();
    }
    // Soft bloom under the lit ring.
    const avg = levels.reduce((a, b) => a + b, 0) / BANDS;
    if (avg > 0.02) {
      const g = ctx.createRadialGradient(0, 0, r0, 0, 0, r0 + len);
      g.addColorStop(0, `rgba(0,224,96,${(0.10 + avg * 0.25).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,224,96,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r0 + len, 0, TAU); ctx.arc(0, 0, r0, 0, TAU, true); ctx.fill();
    }
    ctx.restore();
  }

  _drawAlienHeadBg(ctx, W, cxs, cys, Routs, scale) {
    const headR = W * 0.492;

    // Skull body
    const headGrad = ctx.createRadialGradient(cxs, cys - W * 0.04, W * 0.08, cxs, cys, headR);
    headGrad.addColorStop(0,   '#001800');
    headGrad.addColorStop(0.5, '#000b00');
    headGrad.addColorStop(1,   '#000000');
    ctx.beginPath();
    ctx.ellipse(cxs, cys, headR, headR * 1.04, 0, 0, TAU);
    ctx.fillStyle = headGrad;
    ctx.fill();

    // Skull outline glow
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 10 * scale;
    ctx.beginPath();
    ctx.ellipse(cxs, cys, headR - scale, headR * 1.04 - scale, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(57,255,20,0.45)';
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Circuit traces radiating from disc edge to skull edge
    const numTraces = 16;
    for (let i = 0; i < numTraces; i++) {
      const angle = (i / numTraces) * TAU;
      const x1 = cxs + (Routs + 10 * scale) * Math.cos(angle);
      const y1 = cys + (Routs + 10 * scale) * Math.sin(angle);
      const x2 = cxs + headR * 0.97 * Math.cos(angle);
      const y2 = cys + headR * 0.97 * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(57,255,20,0.18)' : 'rgba(57,255,20,0.07)';
      ctx.lineWidth = (i % 4 === 0 ? 1.2 : 0.6) * scale;
      ctx.stroke();
    }

    // Antenna nubs at top
    const antY = cys - headR * 1.04 + 10 * scale;
    for (const dx of [-28 * scale, 28 * scale]) {
      // Stem
      ctx.beginPath();
      ctx.moveTo(cxs + dx, antY + 20 * scale);
      ctx.lineTo(cxs + dx * 0.55, antY + 55 * scale);
      ctx.strokeStyle = 'rgba(57,255,20,0.55)';
      ctx.lineWidth = 1.8 * scale;
      ctx.stroke();
      // Tip dot
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 8 * scale;
      ctx.beginPath();
      ctx.arc(cxs + dx, antY + 14 * scale, 4 * scale, 0, TAU);
      ctx.fillStyle = '#39ff14';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Jaw / chin arc at bottom
    ctx.beginPath();
    ctx.arc(cxs, cys, headR * 0.80, Math.PI * 0.72, Math.PI * 0.28, false);
    ctx.strokeStyle = 'rgba(57,255,20,0.12)';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();
  }

  _drawAlienVisor(ctx, W, cxs, cys, Routs, scale) {
    const bezelR = Routs + 8 * scale;
    const fontUI = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'monospace';

    // Outer glow ring
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 12 * scale;
    ctx.beginPath();
    ctx.arc(cxs, cys, bezelR, 0, TAU);
    ctx.strokeStyle = 'rgba(57,255,20,0.75)';
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke();

    // Inner dim ring
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cxs, cys, bezelR - 5 * scale, 0, TAU);
    ctx.strokeStyle = 'rgba(57,255,20,0.15)';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();

    // Tick marks around bezel
    const numTicks = 72;
    for (let i = 0; i < numTicks; i++) {
      const angle = (i / numTicks) * TAU - Math.PI / 2;
      const isMain = i % 18 === 0;
      const isMid  = i % 9 === 0;
      const tickLen   = isMain ? 14 * scale : isMid ? 8 * scale : 4 * scale;
      const tickAlpha = isMain ? 0.9 : isMid ? 0.55 : 0.22;
      const r1 = bezelR + 4 * scale;
      ctx.beginPath();
      ctx.moveTo(cxs + r1 * Math.cos(angle), cys + r1 * Math.sin(angle));
      ctx.lineTo(cxs + (r1 + tickLen) * Math.cos(angle), cys + (r1 + tickLen) * Math.sin(angle));
      ctx.strokeStyle = `rgba(57,255,20,${tickAlpha})`;
      ctx.lineWidth = (isMain ? 2 : 1) * scale;
      ctx.stroke();
    }

    // Targeting brackets at four diagonal positions
    const bktR   = bezelR + 30 * scale;
    const bktLen = 18 * scale;
    ctx.strokeStyle = 'rgba(57,255,20,0.85)';
    ctx.lineWidth = 2 * scale;
    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 6 * scale;
    for (let q = 0; q < 4; q++) {
      const angle = (q + 0.5) * Math.PI * 0.5;
      const bx = cxs + bktR * Math.cos(angle);
      const by = cys + bktR * Math.sin(angle);
      const tang = { x: -Math.sin(angle), y: Math.cos(angle) };
      const norm = { x: -Math.cos(angle), y: -Math.sin(angle) };
      ctx.beginPath();
      ctx.moveTo(bx + tang.x * bktLen, by + tang.y * bktLen);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + norm.x * bktLen, by + norm.y * bktLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - tang.x * bktLen, by - tang.y * bktLen);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + norm.x * bktLen, by + norm.y * bktLen);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // "OMITRON" label at bottom of bezel
    ctx.font = `bold ${8 * scale}px ${fontUI}`;
    ctx.fillStyle = 'rgba(57,255,20,0.65)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OMITRON', cxs, cys + bezelR + 28 * scale);
  }

  // ─── Disc placement and hit testing ─────────────────────────────────────────

  // Where the disc is drawn: centre (canvas px) and scale. HYPNO has two (the eyes);
  // SPECIMEN squashes it into a whirlpool seen from above at an angle.
  placements(W, cxs, cys) {
    const u = W / 1000;
    if (this.skin.frame === 'hypno') return [
      { x: 355 * u, y: 445 * u, kx: 0.24, ky: 0.24 },
      { x: 645 * u, y: 445 * u, kx: 0.24, ky: 0.24 },
    ];
    if (this.skin.frame === 'jar') return [{ x: 500 * u, y: 318 * u, kx: 0.58, ky: 0.2 }];
    return [{ x: cxs, y: cys, kx: 1, ky: 1 }];
  }

  // Canvas-pixel point → { index, angle } of the disc under it (on the groove), or null.
  hitTest(x, y, { Rout = 220, Rin = 40, cx = 260, cy = 260 } = {}) {
    const W = this.canvas.width, b = W / 520, scale = b * (this.skin.frameScale ?? 1);
    const outer = (Rout + 8) * scale, inner = Math.max(12, Rin - 8) * scale;
    const ps = this.placements(W, cx * b, cy * b);
    for (let i = 0; i < ps.length; i++) {
      const { angle, dist } = this._local(ps[i], x, y);
      if (dist >= inner && dist <= outer) return { index: i, angle };
    }
    return null;
  }

  angleOn(index, x, y, { cx = 260, cy = 260 } = {}) {
    const W = this.canvas.width, b = W / 520;
    const ps = this.placements(W, cx * b, cy * b);
    return this._local(ps[index] ?? ps[0], x, y).angle;
  }

  _local(p, x, y) {
    const lx = (x - p.x) / p.kx, ly = (y - p.y) / p.ky;
    return { angle: Math.atan2(ly, lx), dist: Math.hypot(lx, ly) };
  }

  // Bold spiral arms over the groove (rotate with the disc): hypnotic eyes, whirlpool currents.
  _drawSpiralArms(ctx, scale, cxs, cys, Routs, labelR) {
    const { count = 2, turns = 3, color, width = 0.45 } = this.skin.spiralArms;
    const span = Routs - labelR;
    ctx.save();
    ctx.beginPath(); ctx.arc(cxs, cys, Routs, 0, TAU); ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = (span / turns / count) * width;
    ctx.lineCap = 'round';
    for (let k = 0; k < count; k++) {
      const off = (k / count) * TAU;
      ctx.beginPath();
      for (let i = 0; i <= 400; i++) {
        const th = (i / 400) * turns * TAU;
        const r = labelR + span * (i / 400);
        const x = cxs + r * Math.cos(th + off), y = cys + r * Math.sin(th + off);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─── HYPNO: a face whose eyes are the spinning record ──────────────────────

  _drawHypnoBack(ctx, W, key) {
    ctx.drawImage(this._layer('hypnoBack', key, W, c => {
      const u = W / 1000;
      const P = '255,63,164';
      const bg = c.createRadialGradient(500 * u, 430 * u, 40 * u, 500 * u, 500 * u, 760 * u);
      bg.addColorStop(0, '#2a0f2e'); bg.addColorStop(1, '#07030a');
      c.fillStyle = bg; c.fillRect(0, 0, W, W);
      for (let i = 1; i < 14; i++) {
        c.beginPath(); c.arc(500 * u, 445 * u, i * 62 * u, 0, TAU);
        c.strokeStyle = `rgba(${P},${Math.max(0, 0.06 - i * 0.004)})`; c.lineWidth = 2 * u; c.stroke();
      }

      // Shoulders and neck
      c.fillStyle = '#12080f';
      c.beginPath();
      c.moveTo(30 * u, W);
      c.bezierCurveTo(80 * u, 930 * u, 260 * u, 905 * u, 410 * u, 890 * u);
      c.lineTo(425 * u, 780 * u); c.lineTo(575 * u, 780 * u); c.lineTo(590 * u, 890 * u);
      c.bezierCurveTo(740 * u, 905 * u, 920 * u, 930 * u, 970 * u, W);
      c.closePath(); c.fill();
      c.strokeStyle = `rgba(${P},0.35)`; c.lineWidth = 2 * u; c.stroke();

      // Ears
      for (const ex of [205, 795]) {
        c.beginPath(); c.ellipse(ex * u, 490 * u, 40 * u, 72 * u, 0, 0, TAU);
        c.fillStyle = '#2c1724'; c.fill();
        c.strokeStyle = `rgba(${P},0.4)`; c.lineWidth = 2 * u; c.stroke();
      }

      // Head
      const skin = c.createRadialGradient(470 * u, 400 * u, 60 * u, 500 * u, 470 * u, 420 * u);
      skin.addColorStop(0, '#45283a'); skin.addColorStop(1, '#1a0d17');
      c.beginPath(); c.ellipse(500 * u, 470 * u, 300 * u, 385 * u, 0, 0, TAU);
      c.fillStyle = skin; c.fill();
      c.save();
      c.shadowColor = `rgb(${P})`; c.shadowBlur = 18 * u;
      c.strokeStyle = `rgba(${P},0.7)`; c.lineWidth = 3 * u; c.stroke();
      c.restore();

      // Cheeks
      for (const bx of [290, 710]) {
        const g = c.createRadialGradient(bx * u, 640 * u, 0, bx * u, 640 * u, 80 * u);
        g.addColorStop(0, `rgba(${P},0.18)`); g.addColorStop(1, `rgba(${P},0)`);
        c.fillStyle = g; c.fillRect((bx - 80) * u, 560 * u, 160 * u, 160 * u);
      }

      // Hair, with a scalloped fringe
      c.beginPath();
      c.moveTo(196 * u, 520 * u);
      c.bezierCurveTo(165 * u, 250 * u, 330 * u, 60 * u, 500 * u, 66 * u);
      c.bezierCurveTo(690 * u, 60 * u, 845 * u, 240 * u, 804 * u, 520 * u);
      c.bezierCurveTo(790 * u, 360 * u, 720 * u, 250 * u, 650 * u, 290 * u);
      c.bezierCurveTo(610 * u, 220 * u, 530 * u, 220 * u, 500 * u, 280 * u);
      c.bezierCurveTo(470 * u, 220 * u, 390 * u, 220 * u, 350 * u, 290 * u);
      c.bezierCurveTo(280 * u, 250 * u, 210 * u, 360 * u, 196 * u, 520 * u);
      c.fillStyle = '#0b040b'; c.fill();
      c.strokeStyle = `rgba(${P},0.45)`; c.lineWidth = 2 * u; c.stroke();
      c.strokeStyle = `rgba(${P},0.12)`;
      for (let i = 0; i < 9; i++) {
        c.beginPath();
        c.moveTo((260 + i * 60) * u, 120 * u + Math.abs(i - 4) * 18 * u);
        c.quadraticCurveTo((280 + i * 55) * u, 200 * u, (250 + i * 62) * u, 290 * u);
        c.stroke();
      }

      // Eye sockets (the discs sit in these)
      for (const ex of [355, 645]) {
        const g = c.createRadialGradient(ex * u, 445 * u, 90 * u, ex * u, 445 * u, 140 * u);
        g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(ex * u, 445 * u, 140 * u, 0, TAU); c.fill();
      }

      // Nose
      c.strokeStyle = `rgba(${P},0.45)`; c.lineWidth = 3 * u; c.lineCap = 'round';
      c.beginPath(); c.moveTo(500 * u, 500 * u); c.quadraticCurveTo(470 * u, 600 * u, 478 * u, 630 * u);
      c.quadraticCurveTo(500 * u, 648 * u, 528 * u, 630 * u); c.stroke();
    }), 0, 0);
  }

  _drawHypnoFront(ctx, W, key, amplitude) {
    const u = W / 1000;
    const P = '255,63,164';
    // Eyelids and lashes, static
    ctx.drawImage(this._layer('hypnoFront', key, W, c => {
      c.lineCap = 'round';
      for (const [ex, dir] of [[355, -1], [645, 1]]) {
        c.strokeStyle = `rgb(${P})`; c.lineWidth = 6 * u;
        c.beginPath(); c.arc(ex * u, 445 * u, 112 * u, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
        c.strokeStyle = `rgba(${P},0.35)`; c.lineWidth = 3 * u;
        c.beginPath(); c.arc(ex * u, 445 * u, 112 * u, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
        c.strokeStyle = `rgb(${P})`; c.lineWidth = 4 * u;
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (1.15 + i * 0.17);
          const x1 = ex * u + 112 * u * Math.cos(a), y1 = 445 * u + 112 * u * Math.sin(a);
          const lean = dir * (i - 2) * 0.12;
          c.beginPath(); c.moveTo(x1, y1);
          c.lineTo(x1 + 26 * u * Math.cos(a + lean), y1 + 26 * u * Math.sin(a + lean)); c.stroke();
        }
      }
    }), 0, 0);

    // Brows lift and the mouth opens with the music
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgb(${P})`;
    ctx.lineWidth = 9 * u;
    const lift = amplitude * 30 * u;
    for (const [ex, tilt] of [[355, 1], [645, -1]]) {
      ctx.beginPath();
      ctx.moveTo((ex - 95) * u, 300 * u - lift + tilt * 8 * u);
      ctx.quadraticCurveTo(ex * u, 255 * u - lift * 1.4, (ex + 95) * u, 300 * u - lift - tilt * 8 * u);
      ctx.stroke();
    }
    const open = (8 + amplitude * 75) * u;
    ctx.beginPath(); ctx.ellipse(500 * u, 728 * u, (70 + amplitude * 12) * u, open, 0, 0, TAU);
    ctx.fillStyle = '#14030d'; ctx.fill();
    ctx.lineWidth = 6 * u; ctx.stroke();
    if (open > 22 * u) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = `rgba(${P},0.35)`;
      ctx.beginPath(); ctx.ellipse(500 * u, 728 * u + open * 0.7, 40 * u, open * 0.5, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // ─── SPECIMEN: a head in a jar, the record is the whirlpool ────────────────

  _drawJarBack(ctx, W, key, rotation, amplitude) {
    const u = W / 1000;
    ctx.drawImage(this._layer('jarBack', key, W, c => {
      const bg = c.createRadialGradient(500 * u, 450 * u, 60 * u, 500 * u, 500 * u, 760 * u);
      bg.addColorStop(0, '#141c10'); bg.addColorStop(1, '#030502');
      c.fillStyle = bg; c.fillRect(0, 0, W, W);
      // Shelf
      c.fillStyle = '#1a1d15'; c.fillRect(0, 905 * u, W, 30 * u);
      c.fillStyle = 'rgba(200,230,150,0.12)'; c.fillRect(0, 905 * u, W, 2 * u);
      // Glow from the jar onto the wall
      const halo = c.createRadialGradient(500 * u, 560 * u, 100 * u, 500 * u, 560 * u, 520 * u);
      halo.addColorStop(0, 'rgba(150,220,60,0.16)'); halo.addColorStop(1, 'rgba(150,220,60,0)');
      c.fillStyle = halo; c.fillRect(0, 0, W, W);
      // Back glass and liquid
      this._jarPath(c, u);
      c.fillStyle = 'rgba(190,240,200,0.04)'; c.fill();
      c.save(); this._jarPath(c, u); c.clip();
      const liquid = c.createLinearGradient(0, 318 * u, 0, 900 * u);
      liquid.addColorStop(0, 'rgba(160,215,70,0.32)'); liquid.addColorStop(1, 'rgba(50,95,15,0.62)');
      c.fillStyle = liquid; c.fillRect(0, 318 * u, W, W);
      for (let i = 0; i < 6; i++) {
        const x = (260 + i * 95) * u;
        const ray = c.createLinearGradient(0, 330 * u, 0, 880 * u);
        ray.addColorStop(0, 'rgba(220,255,160,0.07)'); ray.addColorStop(1, 'rgba(220,255,160,0)');
        c.fillStyle = ray;
        c.beginPath(); c.moveTo(x, 330 * u); c.lineTo(x + 30 * u, 330 * u); c.lineTo(x + 70 * u, 880 * u); c.lineTo(x + 20 * u, 880 * u); c.fill();
      }
      c.restore();
      // Surface sheet the whirlpool sits in
      c.beginPath(); c.ellipse(500 * u, 318 * u, 288 * u, 100 * u, 0, 0, TAU);
      c.fillStyle = 'rgba(175,230,90,0.22)'; c.fill();
    }), 0, 0);

    // The head drifts and turns in the current; bubbles rise faster when the music's loud.
    const t = rotation;
    const now = performance.now() / 1000;
    ctx.save();
    this._jarPath(ctx, u); ctx.clip();
    for (let i = 0; i < 16; i++) {
      const speed = 60 + (i * 37) % 70;
      const y = 890 * u - ((now * speed * (1 + amplitude * 2) + i * 131) % 560) * u;
      const x = (260 + (i * 211) % 480) * u + Math.sin(now * 2 + i) * 10 * u;
      const r = (3 + (i % 4) * 2) * u;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.strokeStyle = `rgba(220,255,170,${0.25 + amplitude * 0.5})`; ctx.lineWidth = 1.5 * u; ctx.stroke();
    }
    const hx = 500 * u + Math.cos(t * 0.35) * 70 * u;
    const hy = 615 * u + Math.sin(t * 0.7) * 16 * u - amplitude * 14 * u;
    this._drawJarHead(ctx, u, hx, hy, t * 0.22, now, amplitude);
    // Liquid tint over the head so it reads as submerged
    ctx.fillStyle = 'rgba(120,180,40,0.16)'; ctx.fillRect(0, 330 * u, W, W);
    ctx.restore();
  }

  _jarPath(c, u) {
    c.beginPath();
    c.roundRect(210 * u, 160 * u, 580 * u, 740 * u, [40 * u, 40 * u, 80 * u, 80 * u]);
  }

  _drawJarHead(ctx, u, x, y, angle, now, amplitude) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    // Hair floating up and swaying
    ctx.strokeStyle = 'rgba(40,30,20,0.75)'; ctx.lineWidth = 5 * u; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const bx = (-70 + i * 17.5) * u;
      const sway = Math.sin(now * 1.6 + i * 0.8) * 22 * u;
      ctx.beginPath(); ctx.moveTo(bx, -95 * u);
      ctx.bezierCurveTo(bx + sway, -150 * u, bx - sway, -185 * u, bx + sway * 1.4, -225 * u);
      ctx.stroke();
    }
    // Neck stump
    ctx.fillStyle = '#7d9a64';
    ctx.beginPath(); ctx.roundRect(-38 * u, 90 * u, 76 * u, 60 * u, 12 * u); ctx.fill();
    ctx.strokeStyle = '#4a2a2a'; ctx.lineWidth = 3 * u;
    for (let i = 0; i < 5; i++) { const sx = (-28 + i * 14) * u; ctx.beginPath(); ctx.moveTo(sx, 140 * u); ctx.lineTo(sx + 7 * u, 152 * u); ctx.stroke(); }
    // Face
    const face = ctx.createRadialGradient(-20 * u, -30 * u, 10 * u, 0, 0, 130 * u);
    face.addColorStop(0, '#d6ecbe'); face.addColorStop(1, '#7c9e66');
    ctx.beginPath(); ctx.ellipse(0, 0, 95 * u, 122 * u, 0, 0, TAU);
    ctx.fillStyle = face; ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,20,0.6)'; ctx.lineWidth = 2.5 * u; ctx.stroke();
    // Ears
    ctx.fillStyle = '#89aa70';
    for (const ex of [-95, 95]) { ctx.beginPath(); ctx.ellipse(ex * u, 0, 14 * u, 26 * u, 0, 0, TAU); ctx.fill(); }
    // Stitched scar across the forehead
    ctx.strokeStyle = '#4a2a2a'; ctx.lineWidth = 3 * u;
    ctx.beginPath(); ctx.moveTo(-60 * u, -62 * u); ctx.quadraticCurveTo(0, -80 * u, 62 * u, -58 * u); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const sx = (-50 + i * 17) * u, sy = (-66 - Math.sin((i / 6) * Math.PI) * 10) * u;
      ctx.beginPath(); ctx.moveTo(sx - 4 * u, sy - 8 * u); ctx.lineTo(sx + 4 * u, sy + 8 * u); ctx.stroke();
    }
    // Closed eyes, nose, mouth that puffs bubbles with the beat
    ctx.strokeStyle = '#2b3a22'; ctx.lineWidth = 3.5 * u;
    for (const ex of [-36, 36]) { ctx.beginPath(); ctx.arc(ex * u, -10 * u, 16 * u, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-12 * u, 30 * u, 4 * u, 36 * u); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 66 * u, (10 + amplitude * 8) * u, (6 + amplitude * 14) * u, 0, 0, TAU);
    ctx.fillStyle = '#2b1a1a'; ctx.fill();
    ctx.restore();
  }

  _drawJarFront(ctx, W, key) {
    ctx.drawImage(this._layer('jarFront', key, W, c => {
      const u = W / 1000;
      // Glass edge and highlights
      this._jarPath(c, u);
      c.strokeStyle = 'rgba(210,255,220,0.35)'; c.lineWidth = 4 * u; c.stroke();
      for (const [x, w, a] of [[240, 26, 0.16], [278, 8, 0.1], [742, 14, 0.12]]) {
        const g = c.createLinearGradient(0, 200 * u, 0, 860 * u);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.6, `rgba(255,255,255,${a * 0.4})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.roundRect(x * u, 200 * u, w * u, 640 * u, w * u / 2); c.fill();
      }
      // Lid
      const lid = c.createLinearGradient(0, 100 * u, 0, 170 * u);
      lid.addColorStop(0, '#5a6052'); lid.addColorStop(0.5, '#33372d'); lid.addColorStop(1, '#1c1f18');
      c.fillStyle = lid; c.beginPath(); c.roundRect(225 * u, 105 * u, 550 * u, 62 * u, 10 * u); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2 * u;
      for (let i = 0; i < 26; i++) { const x = (245 + i * 20) * u; c.beginPath(); c.moveTo(x, 112 * u); c.lineTo(x, 160 * u); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(230 * u, 110 * u, 540 * u, 4 * u);
      // Paper label
      c.save();
      c.translate(500 * u, 830 * u); c.rotate(-0.03);
      c.fillStyle = 'rgba(220,208,172,0.88)'; c.fillRect(-150 * u, -42 * u, 300 * u, 84 * u);
      c.strokeStyle = 'rgba(80,60,30,0.6)'; c.lineWidth = 2 * u; c.strokeRect(-140 * u, -32 * u, 280 * u, 64 * u);
      c.fillStyle = '#3a2c18'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `600 ${26 * u}px 'IBM Plex Mono', monospace`; c.fillText('SPECIMEN', 0, -8 * u);
      c.font = `${15 * u}px 'IBM Plex Mono', monospace`; c.fillText('Nº 07 · SPIRAL RECORDS', 0, 18 * u);
      c.restore();
    }), 0, 0);
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
