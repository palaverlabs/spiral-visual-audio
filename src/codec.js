import { TAU, QUALITY_MAX_POINTS, DITHER_SCALE, RC_KERNEL_RADIUS, RC_KERNEL_SD_COEFF, FADE_LEN_FRACTION } from './constants.js';
import { clamp, archBase, muLawCompress, muLawExpand, antiAliasFilter, preEmphasis, deEmphasis, cubicInterpolate } from './dsp.js';

export function encodeToSVG(samples, opts = {}) {
  const {
    sr: originalSr = 44100,
    quality = 3,
    turns = 6,
    sensitivity = 5,
    Rout = 220,
    Rin = 40,
    cx = 260,
    cy = 260,
  } = opts;

  const totalSamples = samples.length;
  const maxPoints = QUALITY_MAX_POINTS[quality - 1];
  const N = Math.min(totalSamples, maxPoints);
  const decimationFactor = totalSamples / N;

  const duration = totalSamples / originalSr;
  const effectiveSr = Math.round(N / duration);

  const filtered = decimationFactor > 1 ? antiAliasFilter(samples, decimationFactor) : samples;
  const emphasized = preEmphasis(filtered);

  let emphPeak = 0;
  for (let i = 0; i < emphasized.length; i++) {
    const a = Math.abs(emphasized[i]);
    if (a > emphPeak) emphPeak = a;
  }
  if (emphPeak > 1.0) {
    const scale = 1.0 / emphPeak;
    for (let i = 0; i < emphasized.length; i++) emphasized[i] *= scale;
  }

  const downsampled = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const srcIdx = Math.min(Math.floor(i * decimationFactor), totalSamples - 1);
    downsampled[i] = muLawCompress(clamp(emphasized[srcIdx], -1, 1));
  }

  const drPerTurn = (Rout - Rin) / Math.max(1, turns);
  const kMax = 0.45 * drPerTurn;
  const k = Math.min(sensitivity, kMax);

  const pts = new Array(N);
  const groovePoints = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const theta = t * turns * TAU;
    const rBase = archBase(t, Rout, Rin);
    const r = rBase + k * clamp(downsampled[i], -1, 1);
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    const dx = (Math.random() + Math.random() - 1) * DITHER_SCALE;
    const dy = (Math.random() + Math.random() - 1) * DITHER_SCALE;
    pts[i] = `${(x + dx).toFixed(3)},${(y + dy).toFixed(3)}`;
    groovePoints[i * 2] = x + dx;
    groovePoints[i * 2 + 1] = y + dy;
  }

  const outerR = Rout + 8;
  const innerR = Math.max(12, Rin - 8);
  const ptsPerTurn = Math.round(N / turns);
  const sizeMB = (N * 17 / 1024 / 1024).toFixed(1);
  const pipeline = decimationFactor > 1
    ? `pre-emph → anti-alias → ${decimationFactor.toFixed(1)}x decimate → mu-law → dither`
    : 'pre-emph → mu-law → dither';

  const debugMsg = `Encoded ${totalSamples} samples → ${N} vertices [${pipeline}] (~${ptsPerTurn} pts/turn, ${turns} turns, k=${k.toFixed(4)}, sr=${effectiveSr}Hz, ~${sizeMB} MB)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520" viewBox="0 0 520 520" role="img" aria-label="Geometry-only spiral record">
  <defs>
    <radialGradient id="discGrad" r="60%">
      <stop offset="0%" stop-color="#0e1217"/>
      <stop offset="100%" stop-color="#0b0f14"/>
    </radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="url(#discGrad)" stroke="#233242" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#0a0d11" stroke="#22303b" stroke-width="2"/>
  <polyline id="audioGroove" fill="none" stroke="#5ad8cf" stroke-width="0.8" stroke-linecap="round" points="${pts.join(' ')}" />
  <desc>Geometry-only spiral audio. sr=${effectiveSr}; Rout=${Rout}; Rin=${Rin}; turns=${turns}; k=${k.toFixed(6)}; originalLength=${N}; mulaw=1; preemph=1.</desc>
</svg>`;

  return { svg, groovePoints, debugMsg };
}

export function decodeFromSVG(svgString, defaults = {}) {
  const {
    cx: defaultCx = 260,
    cy: defaultCy = 260,
    Rout: defaultRout = 220,
    Rin: defaultRin = 40,
  } = defaults;

  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const poly = doc.querySelector('polyline#audioGroove');
  if (!poly) throw new Error('No groove polyline found in SVG');

  let cx = defaultCx, cy = defaultCy;
  const firstCircle = doc.querySelector('circle');
  if (firstCircle) {
    cx = parseFloat(firstCircle.getAttribute('cx')) || defaultCx;
    cy = parseFloat(firstCircle.getAttribute('cy')) || defaultCy;
  }

  const pointsStr = (poly.getAttribute('points') || '').trim();
  if (!pointsStr) throw new Error('Empty points attribute in polyline');
  const rawParts = pointsStr.split(/\s+/);
  const coords = new Array(rawParts.length);
  const groovePoints = new Float32Array(rawParts.length * 2);
  for (let i = 0; i < rawParts.length; i++) {
    const [x, y] = rawParts[i].split(',').map(Number);
    coords[i] = { x, y };
    groovePoints[i * 2] = x;
    groovePoints[i * 2 + 1] = y;
  }
  const N = coords.length;

  const circles = doc.querySelectorAll('circle');
  let Rout = defaultRout, Rin = defaultRin;
  if (circles.length >= 2) {
    const rOutCircle = parseFloat(circles[0].getAttribute('r')) || 228;
    const rInCircle = parseFloat(circles[1].getAttribute('r')) || 32;
    Rout = Math.max(30, rOutCircle - 8);
    Rin = Math.max(12, rInCircle + 8);
  }

  let totalAngle = 0;
  let prevA = Math.atan2(coords[0].y - cy, coords[0].x - cx);
  for (let i = 1; i < N; i++) {
    const a = Math.atan2(coords[i].y - cy, coords[i].x - cx);
    let d = a - prevA;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    totalAngle += d;
    prevA = a;
  }
  const turns = Math.abs(totalAngle) / TAU;

  let sr = 22050, originalLength = 0, storedK = 0;
  let useMulaw = false, usePreemph = false;
  const descEl = doc.querySelector('desc');
  if (descEl) {
    const descText = descEl.textContent || '';
    const srMatch = descText.match(/sr=(\d+)/);
    if (srMatch) sr = parseInt(srMatch[1]);
    const olMatch = descText.match(/originalLength=(\d+)/);
    if (olMatch) originalLength = parseInt(olMatch[1]);
    const kMatch = descText.match(/k=([\d.]+)/);
    if (kMatch) storedK = parseFloat(kMatch[1]);
    useMulaw = /mulaw=1/.test(descText);
    usePreemph = /preemph=1/.test(descText);
  }

  const k = storedK > 0 ? storedK : (() => {
    const sampleWindow = Math.min(2000, Math.floor(N / 10));
    let accum = 0, count = 0;
    for (let i = 0; i < sampleWindow; i++) {
      const t = i / (N - 1);
      const rBase = archBase(t, Rout, Rin);
      const dx = coords[i].x - cx, dy = coords[i].y - cy;
      accum += Math.abs(Math.hypot(dx, dy) - rBase);
      count++;
    }
    const mad = (accum / Math.max(1, count)) || 1.0;
    return Math.max(0.5, mad / 0.25);
  })();

  const rawDecoded = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const dx = coords[i].x - cx, dy = coords[i].y - cy;
    const r = Math.hypot(dx, dy);
    const t = i / (N - 1);
    const rBase = archBase(t, Rout, Rin);
    const raw = clamp((r - rBase) / k, -1, 1);
    rawDecoded[i] = useMulaw ? muLawExpand(raw) : raw;
  }

  let decoded = usePreemph ? deEmphasis(rawDecoded) : rawDecoded;

  const rcRadius = RC_KERNEL_RADIUS;
  const rcSize = rcRadius * 2 + 1;
  const rcKernel = new Float32Array(rcSize);
  let rcSum = 0;
  for (let i = 0; i < rcSize; i++) {
    rcKernel[i] = Math.exp(-0.5 * ((i - rcRadius) / (rcRadius * RC_KERNEL_SD_COEFF)) ** 2);
    rcSum += rcKernel[i];
  }
  for (let i = 0; i < rcSize; i++) rcKernel[i] /= rcSum;

  const smoothed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let j = 0; j < rcSize; j++) {
      const idx = Math.min(N - 1, Math.max(0, i + j - rcRadius));
      acc += decoded[idx] * rcKernel[j];
    }
    smoothed[i] = acc;
  }
  decoded = smoothed;

  let out = decoded;
  if (originalLength > 0 && originalLength !== N) {
    out = new Float32Array(originalLength);
    for (let i = 0; i < originalLength; i++) {
      const srcIdx = (i / originalLength) * (N - 1);
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;
      const i0 = Math.max(0, idx - 1);
      const i1 = idx;
      const i2 = Math.min(N - 1, idx + 1);
      const i3 = Math.min(N - 1, idx + 2);
      out[i] = cubicInterpolate(decoded[i0], decoded[i1], decoded[i2], decoded[i3], frac);
    }
  }

  let dcSum = 0;
  for (let i = 0; i < out.length; i++) dcSum += out[i];
  const dcOffset = dcSum / out.length;
  if (Math.abs(dcOffset) > 0.001) {
    for (let i = 0; i < out.length; i++) out[i] -= dcOffset;
  }

  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.001 && peak < 0.99) {
    const gain = 1.0 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= gain;
  }

  const fadeLen = Math.min(256, Math.floor(out.length * FADE_LEN_FRACTION));
  for (let i = 0; i < fadeLen; i++) {
    const g = i / fadeLen;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }

  return { samples: out, sampleRate: sr, turns, vertices: N, Rout, Rin, cx, cy, k, groovePoints };
}
