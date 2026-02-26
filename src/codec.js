import { TAU, QUALITY_TARGET_SR, QUALITY_VERTEX_CAP, FADE_LEN_FRACTION, ENC_RIAA_CORNER_HZ, RIAA_CORNER_HZ, COORD_SCALE } from './constants.js';
import { clamp, archBase, muLawCompress, muLawExpand, antiAliasFilter, preEmphasis, deEmphasis, riaaPreEmphasis, riaaDeEmphasis, softLimit, lanczos3Resample, cubicInterpolate } from './dsp.js';

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
  const duration = totalSamples / originalSr;

  // Compute N from target effective SR so bandwidth is consistent for any song length.
  const targetSr = QUALITY_TARGET_SR[quality - 1];
  const N = Math.min(Math.round(targetSr * duration), QUALITY_VERTEX_CAP, totalSamples);
  const decimationFactor = totalSamples / N;
  const effectiveSr = Math.round(N / duration);

  // Anti-alias before decimation.
  const filtered = decimationFactor > 1 ? antiAliasFilter(samples, decimationFactor) : samples;

  // Decimate first.
  const decimated = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const srcIdx = Math.min(Math.floor(i * decimationFactor), totalSamples - 1);
    decimated[i] = clamp(filtered[srcIdx], -1, 1);
  }

  // Soft limit before pre-emphasis: prevents one loud transient from globally crushing
  // the post-emphasis normalization gain, which would reduce all quieter content.
  const limited = softLimit(decimated, effectiveSr);

  // RIAA-style pre-emphasis at effectiveSr with ENC_RIAA_CORNER_HZ (1 kHz).
  // Shelf at 1 kHz covers the full 1–5 kHz presence/clarity region (vs 2.1 kHz which
  // left 1–2 kHz unprotected through coordinate quantization).
  const emphasized = riaaPreEmphasis(limited, effectiveSr, ENC_RIAA_CORNER_HZ);

  let emphPeak = 0;
  for (let i = 0; i < emphasized.length; i++) {
    const a = Math.abs(emphasized[i]);
    if (a > emphPeak) emphPeak = a;
  }
  if (emphPeak > 1.0) {
    const scale = 1.0 / emphPeak;
    for (let i = 0; i < emphasized.length; i++) emphasized[i] *= scale;
  }

  const compressed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    compressed[i] = muLawCompress(emphasized[i]);
  }

  const drPerTurn = (Rout - Rin) / Math.max(1, turns);
  const kMax = 0.45 * drPerTurn;
  const k = Math.min(sensitivity, kMax);

  // Scale all geometry to COORD_SCALE (100x) for integer SVG coordinates.
  // Each integer step = 1/COORD_SCALE original unit → ~14.7-bit radial amplitude resolution.
  const s = COORD_SCALE;
  const cx_s = Math.round(cx * s);
  const cy_s = Math.round(cy * s);
  const Rout_s = Rout * s;
  const Rin_s = Rin * s;
  const k_s = k * s;

  // Error diffusion coordinate quantization (carry-forward, provably stable).
  // Feeds unresolved fractional error into the next sample, concentrating noise
  // at high spatial frequencies where RIAA de-emphasis attenuates it.
  const pts = new Array(N);
  const groovePoints = new Float32Array(N * 2);
  let xErr = 0, yErr = 0;

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const theta = t * turns * TAU;
    const rBase_s = archBase(t, Rout_s, Rin_s);
    const r_s = rBase_s + k_s * clamp(compressed[i], -1, 1);

    const xRaw = cx_s + r_s * Math.cos(theta) + xErr;
    const yRaw = cy_s + r_s * Math.sin(theta) + yErr;
    const xQ = Math.round(xRaw);
    const yQ = Math.round(yRaw);
    xErr = xRaw - xQ;
    yErr = yRaw - yQ;

    pts[i] = `${xQ},${yQ}`;
    groovePoints[i * 2]     = xQ / s;  // 1x space for renderer
    groovePoints[i * 2 + 1] = yQ / s;
  }

  const outerR_s = Math.round((Rout + 8) * s);
  const innerR_s = Math.max(12 * s, Math.round((Rin - 8) * s));
  const ptsPerTurn = Math.round(N / turns);
  const sizeMB = (N * 10 / 1024 / 1024).toFixed(1);  // integer coords avg ~10 chars/pt
  const pipeline = decimationFactor > 1
    ? `anti-alias → ${decimationFactor.toFixed(1)}x decimate → soft-limit → RIAA@${ENC_RIAA_CORNER_HZ}Hz → mu-law → err-diffuse`
    : `soft-limit → RIAA@${ENC_RIAA_CORNER_HZ}Hz → mu-law → err-diffuse`;

  const debugMsg = `Encoded ${totalSamples} samples → ${N} vertices [${pipeline}] (~${ptsPerTurn} pts/turn, ${turns} turns, k=${k.toFixed(4)}, sr=${effectiveSr}Hz, ~${sizeMB} MB)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520" viewBox="0 0 ${520 * s} ${520 * s}" role="img" aria-label="Geometry-only spiral record">
  <defs>
    <radialGradient id="discGrad" r="60%">
      <stop offset="0%" stop-color="#0e1217"/>
      <stop offset="100%" stop-color="#0b0f14"/>
    </radialGradient>
  </defs>
  <circle cx="${cx_s}" cy="${cy_s}" r="${outerR_s}" fill="url(#discGrad)" stroke="#233242" stroke-width="${2 * s}"/>
  <circle cx="${cx_s}" cy="${cy_s}" r="${innerR_s}" fill="#0a0d11" stroke="#22303b" stroke-width="${2 * s}"/>
  <polyline id="audioGroove" fill="none" stroke="#5ad8cf" stroke-width="${0.8 * s}" stroke-linecap="round" points="${pts.join(' ')}" />
  <desc>Geometry-only spiral audio. sr=${effectiveSr}; Rout=${Rout}; Rin=${Rin}; turns=${turns}; k=${k.toFixed(6)}; originalLength=${N}; mulaw=1; riaa=1; riaaHz=${ENC_RIAA_CORNER_HZ}; scale=${s}.</desc>
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

  // Parse desc first — coordScale and riaaHz are needed before any coordinate parsing.
  let sr = 22050, originalLength = 0, storedK = 0;
  let useMulaw = false, useRiaa = false, usePreemph = false;
  let coordScale = 1, decodeRiaaHz = RIAA_CORNER_HZ;
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
    useRiaa = /riaa=1/.test(descText);
    usePreemph = !useRiaa && /preemph=1/.test(descText);
    const scaleMatch = descText.match(/scale=(\d+)/);
    if (scaleMatch) coordScale = parseInt(scaleMatch[1]);
    const riaaHzMatch = descText.match(/riaaHz=(\d+)/);
    if (riaaHzMatch) decodeRiaaHz = parseInt(riaaHzMatch[1]);
  }

  // Parse cx, cy from first circle (divide by coordScale to normalize to 1x space).
  let cx = defaultCx, cy = defaultCy;
  const firstCircle = doc.querySelector('circle');
  if (firstCircle) {
    cx = (parseFloat(firstCircle.getAttribute('cx')) || defaultCx * coordScale) / coordScale;
    cy = (parseFloat(firstCircle.getAttribute('cy')) || defaultCy * coordScale) / coordScale;
  }

  // Parse polyline points, normalizing to 1x space.
  const pointsStr = (poly.getAttribute('points') || '').trim();
  if (!pointsStr) throw new Error('Empty points attribute in polyline');
  const rawParts = pointsStr.split(/\s+/);
  const coords = new Array(rawParts.length);
  const groovePoints = new Float32Array(rawParts.length * 2);
  for (let i = 0; i < rawParts.length; i++) {
    const [x, y] = rawParts[i].split(',').map(Number);
    coords[i] = { x: x / coordScale, y: y / coordScale };
    groovePoints[i * 2]     = x / coordScale;
    groovePoints[i * 2 + 1] = y / coordScale;
  }
  const N = coords.length;

  // Parse Rout, Rin from circles (normalize to 1x space).
  const circles = doc.querySelectorAll('circle');
  let Rout = defaultRout, Rin = defaultRin;
  if (circles.length >= 2) {
    const rOutCircle = (parseFloat(circles[0].getAttribute('r')) || 228 * coordScale) / coordScale;
    const rInCircle  = (parseFloat(circles[1].getAttribute('r')) || 32 * coordScale)  / coordScale;
    Rout = Math.max(30, rOutCircle - 8);
    Rin  = Math.max(12, rInCircle  + 8);
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

  // De-emphasis: exact inverse of encoding pre-emphasis.
  // riaa=1 with riaaHz=N → high-shelf at stored corner frequency
  // preemph=1 only       → legacy 0.97 first-order IIR (backward compat for old SVGs)
  let decoded = rawDecoded;
  if (useRiaa) {
    decoded = riaaDeEmphasis(rawDecoded, sr, decodeRiaaHz);
  } else if (usePreemph) {
    decoded = deEmphasis(rawDecoded);
  }

  // Note: the 3-tap [0.25, 0.5, 0.25] smoother that was here is intentionally removed.
  // It was cutting ~2 kHz of content at 11 kHz effective SR. The Blackman-sinc
  // anti-imaging filter below already handles staircase artifacts from upsampling.

  let out = decoded;
  if (originalLength > 0 && originalLength !== N) {
    // Lanczos-3 resampler: sharper rolloff (-30 dB stopband) and flatter passband
    // (±0.2 dB) vs the previous Catmull-Rom cubic (±1.5 dB, -13 dB stopband).
    out = lanczos3Resample(decoded, originalLength);
    // Anti-imaging: remove spectral images created by the upsampling process.
    const upsampleRatio = originalLength / N;
    if (upsampleRatio > 1) out = antiAliasFilter(out, upsampleRatio);
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
