import { TAU, QUALITY_TARGET_SR, FADE_LEN_FRACTION, ENC_RIAA_CORNER_HZ, RIAA_CORNER_HZ, COORD_SCALE } from './constants.js';
import { clamp, archBase, muLawExpand, antiAliasFilter, preEmphasis, deEmphasis, riaaPreEmphasis, riaaDeEmphasis, softLimit, lanczos3Resample, cubicInterpolate } from './dsp.js';

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
    rightChannel = null,
  } = opts;

  const isStereo = rightChannel !== null;
  const totalSamples = samples.length;
  const duration = totalSamples / originalSr;

  const targetSr = QUALITY_TARGET_SR[quality - 1];
  const N = Math.min(Math.round(targetSr * duration), totalSamples);
  const decimationFactor = totalSamples / N;
  const effectiveSr = Math.round(N / duration);

  // Pipeline: filter → decimate → soft-limit → RIAA pre-emphasis
  const runPipeline = (ch) => {
    const filtered = decimationFactor > 1 ? antiAliasFilter(ch, decimationFactor) : ch;
    const dec = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      dec[i] = clamp(filtered[Math.min(Math.floor(i * decimationFactor), totalSamples - 1)], -1, 1);
    }
    return riaaPreEmphasis(softLimit(dec, effectiveSr), effectiveSr, ENC_RIAA_CORNER_HZ);
  };

  // Compute M/S channels (or mono)
  let midSamples, sideSamples;
  if (isStereo) {
    const rLen = rightChannel.length;
    midSamples = new Float32Array(totalSamples);
    sideSamples = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      const r = i < rLen ? rightChannel[i] : 0;
      midSamples[i] = (samples[i] + r) * 0.5;
      sideSamples[i] = (samples[i] - r) * 0.5;
    }
  } else {
    midSamples = samples;
    sideSamples = null;
  }

  const emphMid = runPipeline(midSamples);
  const emphSide = isStereo ? runPipeline(sideSamples) : null;

  // Joint normalize across both channels so M/S balance is preserved.
  let emphPeak = 0;
  for (let i = 0; i < N; i++) {
    emphPeak = Math.max(emphPeak, Math.abs(emphMid[i]));
    if (emphSide) emphPeak = Math.max(emphPeak, Math.abs(emphSide[i]));
  }
  if (emphPeak > 1.0) {
    const sc = 1.0 / emphPeak;
    for (let i = 0; i < N; i++) {
      emphMid[i] *= sc;
      if (emphSide) emphSide[i] *= sc;
    }
  }

  const drPerTurn = (Rout - Rin) / Math.max(1, turns);
  const kMax = 0.45 * drPerTurn;
  const k = Math.min(sensitivity, kMax);

  // Scale all geometry to COORD_SCALE (100x) for integer SVG coordinates.
  const s = COORD_SCALE;
  const cx_s = Math.round(cx * s);
  const cy_s = Math.round(cy * s);
  const Rout_s = Rout * s;
  const Rin_s = Rin * s;
  const k_s = k * s;

  // Stereo M/S encoding:
  //   x = cx + (rBase + k·mid)·cosθ - k·side·sinθ
  //   y = cy + (rBase + k·mid)·sinθ + k·side·cosθ
  // This is a rotation of (rBase+k·mid, k·side) by θ — exact inverse via dot products.
  // Mono: standard radial displacement only.
  const pathParts = new Array(N);
  const groovePoints = new Float32Array(N * 2);
  let xErr = 0, yErr = 0;
  let prevXQ = 0, prevYQ = 0;

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const theta = t * turns * TAU;
    const rBase_s = archBase(t, Rout_s, Rin_s);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    let xRaw, yRaw;
    if (isStereo) {
      const midVal = clamp(emphMid[i], -1, 1);
      const sideVal = clamp(emphSide[i], -1, 1);
      xRaw = cx_s + (rBase_s + k_s * midVal) * cosT - k_s * sideVal * sinT + xErr;
      yRaw = cy_s + (rBase_s + k_s * midVal) * sinT + k_s * sideVal * cosT + yErr;
    } else {
      const r_s = rBase_s + k_s * clamp(emphMid[i], -1, 1);
      xRaw = cx_s + r_s * cosT + xErr;
      yRaw = cy_s + r_s * sinT + yErr;
    }

    const xQ = Math.round(xRaw + 0.5 * (Math.random() - Math.random()));
    const yQ = Math.round(yRaw + 0.5 * (Math.random() - Math.random()));
    xErr = xRaw - xQ;
    yErr = yRaw - yQ;

    pathParts[i] = i === 0 ? `${xQ},${yQ}` : `${xQ - prevXQ},${yQ - prevYQ}`;
    prevXQ = xQ;
    prevYQ = yQ;
    groovePoints[i * 2]     = xQ / s;
    groovePoints[i * 2 + 1] = yQ / s;
  }

  const outerR_s = Math.round((Rout + 8) * s);
  const innerR_s = Math.max(12 * s, Math.round((Rin - 8) * s));
  const ptsPerTurn = Math.round(N / turns);
  const sizeMB = (N * 10 / 1024 / 1024).toFixed(1);
  const pipelineStr = decimationFactor > 1
    ? `anti-alias → ${decimationFactor.toFixed(1)}x decimate → soft-limit → RIAA@${ENC_RIAA_CORNER_HZ}Hz → err-diffuse`
    : `soft-limit → RIAA@${ENC_RIAA_CORNER_HZ}Hz → err-diffuse`;

  const debugMsg = `Encoded ${totalSamples} samples → ${N} vertices [${pipelineStr}] (~${ptsPerTurn} pts/turn, ${turns} turns, k=${k.toFixed(4)}, sr=${effectiveSr}Hz, ~${sizeMB} MB)${isStereo ? ' [STEREO M/S]' : ''}`;

  const stereoFlag = isStereo ? '; stereo=1' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520" viewBox="0 0 ${520 * s} ${520 * s}" role="img" aria-label="Geometry-only spiral record">
  <defs>
    <radialGradient id="discGrad" r="60%">
      <stop offset="0%" stop-color="#0e1217"/>
      <stop offset="100%" stop-color="#0b0f14"/>
    </radialGradient>
  </defs>
  <circle cx="${cx_s}" cy="${cy_s}" r="${outerR_s}" fill="url(#discGrad)" stroke="#233242" stroke-width="${2 * s}"/>
  <circle cx="${cx_s}" cy="${cy_s}" r="${innerR_s}" fill="#0a0d11" stroke="#22303b" stroke-width="${2 * s}"/>
  <path id="audioGroove" fill="none" stroke="#5ad8cf" stroke-width="${0.8 * s}" stroke-linecap="round" d="M ${pathParts[0]} l ${pathParts.slice(1).join(' ')}" />
  <desc>Geometry-only spiral audio. sr=${effectiveSr}; Rout=${Rout}; Rin=${Rin}; turns=${turns}; k=${k.toFixed(6)}; originalLength=${N}; riaa=1; riaaHz=${ENC_RIAA_CORNER_HZ}; scale=${s}${stereoFlag}.</desc>
</svg>`;

  return { svg, groovePoints, debugMsg };
}

// Original DOM-based decoder. Still used for legacy polyline grooves.
export function decodeFromSVGLegacy(svgString, defaults = {}) {
  const {
    cx: defaultCx = 260,
    cy: defaultCy = 260,
    Rout: defaultRout = 220,
    Rin: defaultRin = 40,
  } = defaults;

  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const pathEl = doc.querySelector('path#audioGroove');
  const polyEl = doc.querySelector('polyline#audioGroove');
  if (!pathEl && !polyEl) throw new Error('No groove element found in SVG');

  // Parse desc first — coordScale and riaaHz are needed before any coordinate parsing.
  let sr = 22050, originalLength = 0, storedK = 0;
  let useMulaw = false, useRiaa = false, usePreemph = false, isStereo = false;
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
    isStereo = /stereo=1/.test(descText);
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

  // Parse coordinates — path with relative deltas (new) or absolute polyline (legacy).
  let coords, groovePoints;
  if (pathEl) {
    const nums = (pathEl.getAttribute('d') || '').match(/-?\d+/g);
    if (!nums || nums.length < 2) throw new Error('Invalid path d attribute');
    const N = nums.length >> 1;
    coords = new Array(N);
    groovePoints = new Float32Array(N * 2);
    let x = parseInt(nums[0]), y = parseInt(nums[1]);
    coords[0] = { x: x / coordScale, y: y / coordScale };
    groovePoints[0] = x / coordScale;
    groovePoints[1] = y / coordScale;
    for (let i = 1; i < N; i++) {
      x += parseInt(nums[i * 2]);
      y += parseInt(nums[i * 2 + 1]);
      coords[i] = { x: x / coordScale, y: y / coordScale };
      groovePoints[i * 2]     = x / coordScale;
      groovePoints[i * 2 + 1] = y / coordScale;
    }
  } else {
    const rawParts = (polyEl.getAttribute('points') || '').trim().split(/\s+/);
    const N = rawParts.length;
    coords = new Array(N);
    groovePoints = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const [x, y] = rawParts[i].split(',').map(Number);
      coords[i] = { x: x / coordScale, y: y / coordScale };
      groovePoints[i * 2]     = x / coordScale;
      groovePoints[i * 2 + 1] = y / coordScale;
    }
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

  // Decode raw M/S (stereo) or radial (mono).
  const rawMid = new Float32Array(N);
  const rawSide = isStereo ? new Float32Array(N) : null;

  for (let i = 0; i < N; i++) {
    const dx = coords[i].x - cx;
    const dy = coords[i].y - cy;
    const t = i / (N - 1);
    const rBase = archBase(t, Rout, Rin);

    if (isStereo) {
      // Project onto radial and tangential axes using the known encoding angle θ.
      // Radial  = dx·cosθ + dy·sinθ = rBase + k·mid   (exact inverse)
      // Tangential = -dx·sinθ + dy·cosθ = k·side       (exact inverse)
      const theta = t * turns * TAU;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const radial = dx * cosT + dy * sinT;
      const tangential = -dx * sinT + dy * cosT;
      const midRaw = clamp((radial - rBase) / k, -1, 1);
      const sideRaw = clamp(tangential / k, -1, 1);
      rawMid[i] = useMulaw ? muLawExpand(midRaw) : midRaw;
      rawSide[i] = useMulaw ? muLawExpand(sideRaw) : sideRaw;
    } else {
      const r = Math.hypot(dx, dy);
      const raw = clamp((r - rBase) / k, -1, 1);
      rawMid[i] = useMulaw ? muLawExpand(raw) : raw;
    }
  }

  // De-emphasis: exact inverse of encoding pre-emphasis.
  const deEmph = (ch) => {
    if (useRiaa) return riaaDeEmphasis(ch, sr, decodeRiaaHz);
    if (usePreemph) return deEmphasis(ch);
    return ch;
  };

  let outMid = deEmph(rawMid);
  let outSide = isStereo ? deEmph(rawSide) : null;

  // Lanczos-3 upsample + anti-imaging.
  if (originalLength > 0 && originalLength !== N) {
    const upsampleRatio = originalLength / N;
    outMid = lanczos3Resample(outMid, originalLength);
    if (upsampleRatio > 1) outMid = antiAliasFilter(outMid, upsampleRatio);
    if (outSide) {
      outSide = lanczos3Resample(outSide, originalLength);
      if (upsampleRatio > 1) outSide = antiAliasFilter(outSide, upsampleRatio);
    }
  }

  if (isStereo) {
    // DC remove on mid (side should be near zero DC).
    let dcSum = 0;
    for (let i = 0; i < outMid.length; i++) dcSum += outMid[i];
    const dcOffset = dcSum / outMid.length;
    if (Math.abs(dcOffset) > 0.001) {
      for (let i = 0; i < outMid.length; i++) outMid[i] -= dcOffset;
    }

    // M/S → L/R
    const samplesL = new Float32Array(outMid.length);
    const samplesR = new Float32Array(outMid.length);
    for (let i = 0; i < outMid.length; i++) {
      samplesL[i] = outMid[i] + outSide[i];
      samplesR[i] = outMid[i] - outSide[i];
    }

    // Joint normalize (L+S or L-S can sum to > 1.0).
    let peak = 0;
    for (let i = 0; i < samplesL.length; i++) {
      peak = Math.max(peak, Math.abs(samplesL[i]), Math.abs(samplesR[i]));
    }
    if (peak > 0.001 && peak < 0.99) {
      const g = 1.0 / peak;
      for (let i = 0; i < samplesL.length; i++) { samplesL[i] *= g; samplesR[i] *= g; }
    }

    const fadeLen = Math.min(256, Math.floor(samplesL.length * FADE_LEN_FRACTION));
    const fadeDiv = Math.max(1, fadeLen - 1);
    for (let i = 0; i < fadeLen; i++) {
      const g = i / fadeDiv;
      samplesL[i] *= g; samplesL[samplesL.length - 1 - i] *= g;
      samplesR[i] *= g; samplesR[samplesR.length - 1 - i] *= g;
    }

    return { samples: samplesL, samplesL, samplesR, sampleRate: sr, turns, vertices: N, Rout, Rin, cx, cy, k, groovePoints };
  }

  // Mono path (unchanged).
  let out = outMid;

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
  const fadeDiv = Math.max(1, fadeLen - 1);
  for (let i = 0; i < fadeLen; i++) {
    const g = i / fadeDiv;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }

  return { samples: out, sampleRate: sr, turns, vertices: N, Rout, Rin, cx, cy, k, groovePoints };
}


// ── Fast decode path ─────────────────────────────────────────────────
// Parses only the small SVG header with regexes (no DOMParser, so it runs in a Worker)
// and decodes from integer coordinate arrays instead of millions of {x,y} objects.
// Output is identical to decodeFromSVGLegacy for <path> grooves.

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };

// header: the SVG with the groove's path data removed (or a groovepack template).
export function parseGrooveHeader(header, defaults = {}) {
  const { cx: dCx = 260, cy: dCy = 260, Rout: dRout = 220, Rin: dRin = 40 } = defaults;
  const desc = (header.match(/<desc>([\s\S]*?)<\/desc>/) || [])[1] || '';
  const num = (re, fallback) => { const m = desc.match(re); return m ? Number(m[1]) : fallback; };
  const meta = {
    sr: num(/sr=(\d+)/, 22050),
    originalLength: num(/originalLength=(\d+)/, 0),
    storedK: num(/k=([\d.]+)/, 0),
    useMulaw: /mulaw=1/.test(desc),
    useRiaa: /riaa=1/.test(desc),
    isStereo: /stereo=1/.test(desc),
    coordScale: num(/scale=(\d+)/, 1),
    decodeRiaaHz: num(/riaaHz=(\d+)/, RIAA_CORNER_HZ),
  };
  meta.usePreemph = !meta.useRiaa && /preemph=1/.test(desc);
  const cs = meta.coordScale;
  const circles = header.match(/<circle\b[^>]*>/g) || [];
  meta.cx = dCx; meta.cy = dCy; meta.Rout = dRout; meta.Rin = dRin;
  if (circles[0]) {
    meta.cx = (parseFloat(attr(circles[0], 'cx')) || dCx * cs) / cs;
    meta.cy = (parseFloat(attr(circles[0], 'cy')) || dCy * cs) / cs;
  }
  if (circles.length >= 2) {
    meta.Rout = Math.max(30, (parseFloat(attr(circles[0], 'r')) || 228 * cs) / cs - 8);
    meta.Rin = Math.max(12, (parseFloat(attr(circles[1], 'r')) || 32 * cs) / cs + 8);
  }
  return meta;
}

// Scans "M x0,y0 l dx,dy ..." between [start, end) of text into absolute integer coordinates.
export function parsePathCoords(text, start = 0, end = text.length) {
  let count = 0;
  for (let i = start; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c >= 48 && c <= 57 && (i === start || (text.charCodeAt(i - 1) < 48 || text.charCodeAt(i - 1) > 57))) count++;
  }
  const N = count >> 1;
  const xs = new Int32Array(N), ys = new Int32Array(N);
  let k = 0, v = 0, neg = false, inNum = false, x = 0, y = 0;
  const flush = () => {
    const n = neg ? -v : v;
    const idx = k >> 1;
    if (idx < N) {
      if (k & 1) { y = idx === 0 ? n : y + n; ys[idx] = y; }
      else { x = idx === 0 ? n : x + n; xs[idx] = x; }
    }
    k++; v = 0; neg = false; inNum = false;
  };
  for (let i = start; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c >= 48 && c <= 57) { v = v * 10 + (c - 48); inNum = true; }
    else { if (inNum) flush(); neg = c === 45; }
  }
  if (inNum) flush();
  return { xs, ys };
}

export function decodeFromCoords(xs, ys, meta) {
  const { sr, originalLength, storedK, useMulaw, useRiaa, usePreemph, isStereo, coordScale: cs, decodeRiaaHz, cx, cy, Rout, Rin } = meta;
  const N = xs.length;
  if (N < 2) throw new Error('Groove has no audio');
  const px = new Float64Array(N), py = new Float64Array(N);
  const groovePoints = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    px[i] = xs[i] / cs; py[i] = ys[i] / cs;
    groovePoints[i * 2] = px[i]; groovePoints[i * 2 + 1] = py[i];
  }

  let totalAngle = 0;
  let prevA = Math.atan2(py[0] - cy, px[0] - cx);
  for (let i = 1; i < N; i++) {
    const a = Math.atan2(py[i] - cy, px[i] - cx);
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
      const rBase = archBase(i / (N - 1), Rout, Rin);
      accum += Math.abs(Math.hypot(px[i] - cx, py[i] - cy) - rBase);
      count++;
    }
    const mad = (accum / Math.max(1, count)) || 1.0;
    return Math.max(0.5, mad / 0.25);
  })();

  const rawMid = new Float32Array(N);
  const rawSide = isStereo ? new Float32Array(N) : null;
  for (let i = 0; i < N; i++) {
    const dx = px[i] - cx, dy = py[i] - cy;
    const t = i / (N - 1);
    const rBase = archBase(t, Rout, Rin);
    if (isStereo) {
      const theta = t * turns * TAU;
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      const midRaw = clamp((dx * cosT + dy * sinT - rBase) / k, -1, 1);
      const sideRaw = clamp((-dx * sinT + dy * cosT) / k, -1, 1);
      rawMid[i] = useMulaw ? muLawExpand(midRaw) : midRaw;
      rawSide[i] = useMulaw ? muLawExpand(sideRaw) : sideRaw;
    } else {
      const raw = clamp((Math.hypot(dx, dy) - rBase) / k, -1, 1);
      rawMid[i] = useMulaw ? muLawExpand(raw) : raw;
    }
  }

  const deEmph = (ch) => {
    if (useRiaa) return riaaDeEmphasis(ch, sr, decodeRiaaHz);
    if (usePreemph) return deEmphasis(ch);
    return ch;
  };
  let outMid = deEmph(rawMid);
  let outSide = isStereo ? deEmph(rawSide) : null;

  if (originalLength > 0 && originalLength !== N) {
    const upsampleRatio = originalLength / N;
    outMid = lanczos3Resample(outMid, originalLength);
    if (upsampleRatio > 1) outMid = antiAliasFilter(outMid, upsampleRatio);
    if (outSide) {
      outSide = lanczos3Resample(outSide, originalLength);
      if (upsampleRatio > 1) outSide = antiAliasFilter(outSide, upsampleRatio);
    }
  }

  const removeDC = (a) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i];
    const dc = sum / a.length;
    if (Math.abs(dc) > 0.001) for (let i = 0; i < a.length; i++) a[i] -= dc;
  };
  const fade = (...chs) => {
    const len = chs[0].length;
    const fadeLen = Math.min(256, Math.floor(len * FADE_LEN_FRACTION));
    const fadeDiv = Math.max(1, fadeLen - 1);
    for (let i = 0; i < fadeLen; i++) {
      const g = i / fadeDiv;
      for (const ch of chs) { ch[i] *= g; ch[len - 1 - i] *= g; }
    }
  };
  const geom = { turns, vertices: N, Rout, Rin, cx, cy, k, groovePoints };

  if (isStereo) {
    removeDC(outMid);
    const samplesL = new Float32Array(outMid.length);
    const samplesR = new Float32Array(outMid.length);
    let peak = 0;
    for (let i = 0; i < outMid.length; i++) {
      samplesL[i] = outMid[i] + outSide[i];
      samplesR[i] = outMid[i] - outSide[i];
      const a = Math.abs(samplesL[i]), b = Math.abs(samplesR[i]);
      if (a > peak) peak = a;
      if (b > peak) peak = b;
    }
    if (peak > 0.001 && peak < 0.99) {
      const g = 1.0 / peak;
      for (let i = 0; i < samplesL.length; i++) { samplesL[i] *= g; samplesR[i] *= g; }
    }
    fade(samplesL, samplesR);
    return { samples: samplesL, samplesL, samplesR, sampleRate: sr, ...geom };
  }

  const out = outMid;
  removeDC(out);
  let peak = 0;
  for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  if (peak > 0.001 && peak < 0.99) { const g = 1.0 / peak; for (let i = 0; i < out.length; i++) out[i] *= g; }
  fade(out);
  return { samples: out, sampleRate: sr, ...geom };
}

// Locates the groove path's d="..." in SVG text. Returns null for legacy polyline grooves.
export function findPathData(svg) {
  const id = svg.indexOf('id="audioGroove"');
  if (id < 0) return null;
  const tagStart = svg.lastIndexOf('<', id);
  if (!svg.startsWith('<path', tagStart)) return null;
  const dStart = svg.indexOf(' d="', tagStart) + 4;
  if (dStart < 4) return null;
  const dEnd = svg.indexOf('"', dStart);
  return { dStart, dEnd, header: svg.slice(0, dStart) + svg.slice(dEnd) };
}

export function decodeFromSVG(svgString, defaults = {}) {
  const loc = findPathData(svgString);
  if (!loc) return decodeFromSVGLegacy(svgString, defaults);
  const meta = parseGrooveHeader(loc.header, defaults);
  const { xs, ys } = parsePathCoords(svgString, loc.dStart, loc.dEnd);
  return decodeFromCoords(xs, ys, meta);
}
