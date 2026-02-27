import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #0a0a0c; display: flex; gap: 0; }
  .panel { display: flex; flex-direction: column; align-items: center; justify-content: center;
           padding: 32px; gap: 16px; }
  .label { font-family: 'Courier New', monospace; font-size: 13px; letter-spacing: 0.15em;
           text-transform: uppercase; }
  .owl-label { color: #d4880a; }
  .eq-label  { color: #00e060; }
  .divider { width: 1px; background: rgba(255,255,255,0.08); margin: 20px 0; }
</style>
</head>
<body>
<div class="panel">
  <canvas id="owl" width="500" height="500"></canvas>
  <span class="label owl-label">OWL</span>
</div>
<div class="divider"></div>
<div class="panel">
  <canvas id="eq" width="500" height="500"></canvas>
  <span class="label eq-label">EQ</span>
</div>

<script>
const TAU = Math.PI * 2;

function drawOwl(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const scale = W / 520;
  const cx = 260 * scale, cy = 260 * scale;
  const Rout = 228 * scale;
  const Rin  = 32  * scale;
  const labelR = 45 * scale;

  ctx.clearRect(0, 0, W, W);

  // --- Disc body ---
  const discGrad = ctx.createRadialGradient(cx, cy, Rin, cx, cy, Rout);
  discGrad.addColorStop(0,   '#100c06');
  discGrad.addColorStop(0.5, '#0a0805');
  discGrad.addColorStop(1,   '#070502');
  ctx.beginPath(); ctx.arc(cx, cy, Rout, 0, TAU);
  ctx.fillStyle = discGrad; ctx.fill();
  ctx.strokeStyle = '#2a1c08'; ctx.lineWidth = 3 * scale; ctx.stroke();

  // Concentric rings (warm amber micro-rings)
  for (let i = 0; i < 14; i++) {
    const r = Rin + (Rout - Rin) * (i / 14);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(170,95,8,0.048)' : 'rgba(130,70,4,0.030)';
    ctx.lineWidth = 0.4 * scale; ctx.stroke();
  }

  // Outer rim highlight
  ctx.beginPath(); ctx.arc(cx, cy, Rout - scale, 0, TAU);
  ctx.strokeStyle = 'rgba(160,95,12,0.16)'; ctx.lineWidth = 1.5 * scale; ctx.stroke();

  // Fake groove lines (visual warmth)
  for (let i = 0; i < 60; i++) {
    const r = Rin + (Rout - Rin) * 0.12 + (Rout - Rin) * 0.78 * (i / 60);
    const alpha = 0.10 + 0.08 * Math.sin(i * 0.4);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = \`rgba(180,100,15,\${alpha})\`;
    ctx.lineWidth = 0.55 * scale; ctx.stroke();
  }

  // --- Viewer sheen (fixed) ---
  const sheenGrad = ctx.createRadialGradient(cx - Rout*0.22, cy - Rout*0.38, 0, cx - Rout*0.22, cy - Rout*0.38, Rout*0.95);
  sheenGrad.addColorStop(0, 'rgba(255,255,255,0.042)');
  sheenGrad.addColorStop(0.5, 'rgba(255,255,255,0.010)');
  sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, Rout - scale, 0, TAU); ctx.clip();
  ctx.fillStyle = sheenGrad; ctx.fillRect(0, 0, W, W); ctx.restore();

  // --- Owl Eye label ---
  const irisR = labelR * 0.92;

  const irisGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, irisR);
  irisGrad.addColorStop(0,    '#1a0800');
  irisGrad.addColorStop(0.28, '#5c2200');
  irisGrad.addColorStop(0.58, '#9e5a08');
  irisGrad.addColorStop(0.80, '#c47c12');
  irisGrad.addColorStop(1,    '#d49018');
  ctx.beginPath(); ctx.arc(cx, cy, irisR, 0, TAU);
  ctx.fillStyle = irisGrad; ctx.fill();

  // Iris fibers
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, irisR, 0, TAU); ctx.clip();
  for (let i = 0; i < 90; i++) {
    const angle = (i / 90) * TAU;
    const innerR = labelR * 0.15;
    const fiberAlpha = 0.07 + (Math.sin(i * 3.73 + 1.1) * 0.5 + 0.5) * 0.14;
    const thick = (0.3 + (Math.sin(i * 7.31) * 0.5 + 0.5) * 0.5) * scale;
    ctx.beginPath();
    ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
    ctx.lineTo(cx + irisR  * Math.cos(angle), cy + irisR  * Math.sin(angle));
    ctx.strokeStyle = \`rgba(255,210,90,\${fiberAlpha})\`;
    ctx.lineWidth = thick; ctx.stroke();
  }
  // Limbal ring
  ctx.beginPath(); ctx.arc(cx, cy, irisR, 0, TAU);
  const limbal = ctx.createRadialGradient(cx, cy, irisR*0.75, cx, cy, irisR);
  limbal.addColorStop(0, 'rgba(0,0,0,0)'); limbal.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = limbal; ctx.fill();
  ctx.restore();

  ctx.beginPath(); ctx.arc(cx, cy, irisR, 0, TAU);
  ctx.strokeStyle = 'rgba(200,140,25,0.55)'; ctx.lineWidth = 1.2 * scale; ctx.stroke();

  // Pupil
  const pupilR = labelR * 0.40;
  const pupilGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pupilR);
  pupilGrad.addColorStop(0, '#0d0500'); pupilGrad.addColorStop(0.6, '#070300'); pupilGrad.addColorStop(1, '#000000');
  ctx.beginPath(); ctx.arc(cx, cy, pupilR, 0, TAU);
  ctx.fillStyle = pupilGrad; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, pupilR, 0, TAU);
  ctx.strokeStyle = 'rgba(160,90,15,0.45)'; ctx.lineWidth = 0.9 * scale; ctx.stroke();

  // Corneal highlight
  const hx = cx - pupilR * 0.38, hy = cy - pupilR * 0.48;
  const hilite = ctx.createRadialGradient(hx, hy, 0, hx, hy, pupilR * 0.38);
  hilite.addColorStop(0, 'rgba(255,255,255,0.72)'); hilite.addColorStop(0.5, 'rgba(255,255,240,0.18)'); hilite.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(hx, hy, pupilR * 0.38, 0, TAU); ctx.fillStyle = hilite; ctx.fill();

  // Spindle
  ctx.beginPath(); ctx.arc(cx, cy, 4 * scale, 0, TAU); ctx.fillStyle = '#000'; ctx.fill();

  // Stylus dot (NW position like real needle)
  const fixedAngle = -Math.PI * 0.25;
  const stylusR = (Rout * 0.82);
  const sx = cx + stylusR * Math.cos(fixedAngle), sy = cy + stylusR * Math.sin(fixedAngle);
  ctx.save();
  ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 30 * scale;
  ctx.beginPath(); ctx.arc(sx, sy, 6 * scale, 0, TAU);
  ctx.fillStyle = 'rgba(255,100,0,0.3)'; ctx.fill();
  ctx.shadowBlur = 14 * scale;
  ctx.beginPath(); ctx.arc(sx, sy, 3.5 * scale, 0, TAU);
  ctx.fillStyle = '#ffaa00'; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(sx, sy, 1.5 * scale, 0, TAU);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
}

function drawEQ(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const scale = W / 520;
  const cx = 260 * scale, cy = 260 * scale;
  const Rout = 228 * scale;
  const Rin  = 32  * scale;
  const labelR = 45 * scale;

  ctx.clearRect(0, 0, W, W);

  // --- Disc body ---
  const discGrad = ctx.createRadialGradient(cx, cy, Rin, cx, cy, Rout);
  discGrad.addColorStop(0,   '#020e06');
  discGrad.addColorStop(0.5, '#010904');
  discGrad.addColorStop(1,   '#010603');
  ctx.beginPath(); ctx.arc(cx, cy, Rout, 0, TAU);
  ctx.fillStyle = discGrad; ctx.fill();
  ctx.strokeStyle = '#032812'; ctx.lineWidth = 3 * scale; ctx.stroke();

  for (let i = 0; i < 14; i++) {
    const r = Rin + (Rout - Rin) * (i / 14);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,200,80,0.032)' : 'rgba(0,150,60,0.020)';
    ctx.lineWidth = 0.4 * scale; ctx.stroke();
  }

  ctx.beginPath(); ctx.arc(cx, cy, Rout - scale, 0, TAU);
  ctx.strokeStyle = 'rgba(0,200,80,0.10)'; ctx.lineWidth = 1.5 * scale; ctx.stroke();

  // --- EQ Bars ---
  const numBars = 24;
  const gap = 0.07;
  const barAngle = TAU / numBars;
  const span = Rout - Rin;
  const heights = Array.from({ length: numBars }, (_, i) => {
    const t = i / numBars;
    return Math.max(0.06, Math.min(0.92, Math.abs(
      Math.sin(t * Math.PI * 4.1)       * 0.45 +
      Math.sin(t * Math.PI * 9.3 + 1.2) * 0.30 +
      Math.cos(t * Math.PI * 2.7 + 0.5) * 0.25
    )));
  });

  ctx.save();
  for (let i = 0; i < numBars; i++) {
    const a0 = i * barAngle + gap / 2;
    const a1 = (i + 1) * barAngle - gap / 2;
    const h  = heights[i];
    const outerR = Rin + span * h;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a0, a1);
    ctx.arc(cx, cy, Rin, a1, a0, true);
    ctx.closePath();
    const fillGrad = ctx.createRadialGradient(cx, cy, Rin, cx, cy, outerR);
    fillGrad.addColorStop(0,   'rgba(0,200,80,0.0)');
    fillGrad.addColorStop(0.5, \`rgba(0,210,80,\${0.04 + h*0.08})\`);
    fillGrad.addColorStop(1,   \`rgba(0,230,90,\${0.08 + h*0.12})\`);
    ctx.fillStyle = fillGrad; ctx.fill();

    ctx.beginPath(); ctx.arc(cx, cy, outerR, a0, a1);
    ctx.strokeStyle = \`rgba(0,255,100,\${0.22 + h*0.38})\`;
    ctx.lineWidth = 1.4 * scale;
    ctx.shadowColor = 'rgba(0,255,100,0.6)'; ctx.shadowBlur = 3 * scale;
    ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.restore();

  // Fake groove lines
  for (let i = 0; i < 60; i++) {
    const r = Rin + (Rout - Rin) * 0.12 + (Rout - Rin) * 0.78 * (i / 60);
    const alpha = 0.08 + 0.06 * Math.sin(i * 0.4);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = \`rgba(0,200,80,\${alpha})\`;
    ctx.lineWidth = 0.55 * scale; ctx.stroke();
  }

  // Sheen
  const sheenGrad = ctx.createRadialGradient(cx - Rout*0.22, cy - Rout*0.38, 0, cx - Rout*0.22, cy - Rout*0.38, Rout*0.95);
  sheenGrad.addColorStop(0, 'rgba(255,255,255,0.032)');
  sheenGrad.addColorStop(0.5, 'rgba(255,255,255,0.008)');
  sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, Rout - scale, 0, TAU); ctx.clip();
  ctx.fillStyle = sheenGrad; ctx.fillRect(0, 0, W, W); ctx.restore();

  // Label
  const labelGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, labelR);
  labelGrad.addColorStop(0,   '#041a0a');
  labelGrad.addColorStop(0.7, '#020e06');
  labelGrad.addColorStop(1,   '#010a04');
  ctx.beginPath(); ctx.arc(cx, cy, labelR, 0, TAU);
  ctx.fillStyle = labelGrad; ctx.fill();
  ctx.strokeStyle = '#044020'; ctx.lineWidth = 1.5 * scale; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, labelR * 0.6, 0, TAU);
  ctx.strokeStyle = 'rgba(0,220,80,0.3)'; ctx.lineWidth = 0.8 * scale; ctx.stroke();

  ctx.font = \`bold \${9 * scale}px 'Courier New', monospace\`;
  ctx.fillStyle = 'rgba(0,230,90,0.85)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('EQ', cx, cy - 4 * scale);

  ctx.beginPath(); ctx.arc(cx, cy, 4 * scale, 0, TAU);
  ctx.fillStyle = '#000'; ctx.fill();

  // Stylus (blue, contrasting)
  const fixedAngle = -Math.PI * 0.25;
  const stylusR = Rout * 0.82;
  const sx = cx + stylusR * Math.cos(fixedAngle), sy = cy + stylusR * Math.sin(fixedAngle);
  ctx.save();
  ctx.shadowColor = '#0088ff'; ctx.shadowBlur = 30 * scale;
  ctx.beginPath(); ctx.arc(sx, sy, 6 * scale, 0, TAU);
  ctx.fillStyle = 'rgba(0,136,255,0.3)'; ctx.fill();
  ctx.shadowBlur = 14 * scale;
  ctx.beginPath(); ctx.arc(sx, sy, 3.5 * scale, 0, TAU);
  ctx.fillStyle = '#44aaff'; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(sx, sy, 1.5 * scale, 0, TAU);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
}

drawOwl(document.getElementById('owl'));
drawEQ(document.getElementById('eq'));
</script>
</body>
</html>`;

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 580, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.waitForTimeout(200);

const screenshot = await page.screenshot({ type: 'png' });
writeFileSync('/Users/will/dev/spiral-visual-audio/skin-preview.png', screenshot);
await browser.close();
console.log('done');
