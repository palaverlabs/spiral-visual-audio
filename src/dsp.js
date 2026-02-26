import { TAU, MU, PREEMPH_COEFF, RIAA_CORNER_HZ, RIAA_GAIN_DB } from './constants.js';

export function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
export function archBase(t, Rout, Rin) { return Rout + (Rin - Rout) * t; }

export function muLawCompress(x) {
  const sign = x < 0 ? -1 : 1;
  return sign * Math.log(1 + MU * Math.abs(x)) / Math.log(1 + MU);
}

export function muLawExpand(y) {
  const sign = y < 0 ? -1 : 1;
  return sign * ((1 + MU) ** Math.abs(y) - 1) / MU;
}

export function antiAliasFilter(samples, decimationFactor) {
  if (decimationFactor <= 1) return samples;
  const kernelRadius = Math.min(Math.ceil(decimationFactor * 2), 64);
  const kernelSize = kernelRadius * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  const cutoff = 0.5 / decimationFactor;
  let sum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const n = i - kernelRadius;
    kernel[i] = n === 0 ? cutoff : Math.sin(Math.PI * cutoff * n) / (Math.PI * n);
    const w = 0.42 - 0.5 * Math.cos(TAU * i / (kernelSize - 1)) + 0.08 * Math.cos(2 * TAU * i / (kernelSize - 1));
    kernel[i] *= w;
    sum += kernel[i];
  }
  for (let i = 0; i < kernelSize; i++) kernel[i] /= sum;

  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let acc = 0;
    for (let j = 0; j < kernelSize; j++) {
      const idx = i + j - kernelRadius;
      if (idx >= 0 && idx < samples.length) acc += samples[idx] * kernel[j];
    }
    out[i] = acc;
  }
  return out;
}

export function preEmphasis(samples) {
  const out = new Float32Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = samples[i] - PREEMPH_COEFF * samples[i - 1];
  }
  return out;
}

export function deEmphasis(samples) {
  const out = new Float32Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = samples[i] + PREEMPH_COEFF * out[i - 1];
  }
  return out;
}

// ─── RIAA equalization ──────────────────────────────────────────────────────
// Implements the Audio EQ Cookbook high-shelf biquad (R. Bristow-Johnson).
// highShelf(+G) and highShelf(-G) at the same corner are exact inverses,
// so encode→decode round-trips to perfectly flat response.
// Corner at 2122 Hz (RIAA τ3 = 75µs) with ±20 dB shelf:
//   Encoding: bass untouched, treble boosted +20 dB → highs dominate groove
//   Decoding: treble cut −20 dB → restores flat response AND suppresses
//             high-frequency coordinate-quantization noise (same as vinyl surface noise)
function applyBiquad(samples, b0, b1, b2, a1, a2) {
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const y = b0 * samples[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = samples[i];
    y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

export function highShelf(samples, sampleRate, dBgain, cornerHz = RIAA_CORNER_HZ) {
  const A = Math.pow(10, dBgain / 40); // amplitude = sqrt(power gain)
  const w0 = 2 * Math.PI * cornerHz / sampleRate;
  const cosW = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.sqrt(2); // S=1 shelf slope
  const sqA2 = 2 * Math.sqrt(A) * alpha;

  const b0 =      A * ((A + 1) + (A - 1) * cosW + sqA2);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
  const b2 =      A * ((A + 1) + (A - 1) * cosW - sqA2);
  const a0 =          ((A + 1) - (A - 1) * cosW + sqA2);
  const a1 =  2 *     ((A - 1) - (A + 1) * cosW);
  const a2 =          ((A + 1) - (A - 1) * cosW - sqA2);

  return applyBiquad(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

export function riaaPreEmphasis(samples, sampleRate, cornerHz = RIAA_CORNER_HZ) {
  return highShelf(samples, sampleRate, +RIAA_GAIN_DB, cornerHz);
}

export function riaaDeEmphasis(samples, sampleRate, cornerHz = RIAA_CORNER_HZ) {
  return highShelf(samples, sampleRate, -RIAA_GAIN_DB, cornerHz);
}
// ────────────────────────────────────────────────────────────────────────────

export function cubicInterpolate(y0, y1, y2, y3, t) {
  const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c = -0.5 * y0 + 0.5 * y2;
  const d = y1;
  return a * t * t * t + b * t * t + c * t + d;
}

// One-pole soft limiter: prevents a single loud transient from crushing post-emphasis gain.
// Fast attack (10ms), slow release (500ms).
export function softLimit(samples, sampleRate, threshold = 0.85) {
  const attackCoeff = 1 - Math.exp(-1 / (sampleRate * 0.010));
  const releaseCoeff = 1 - Math.exp(-1 / (sampleRate * 0.500));
  const out = new Float32Array(samples.length);
  let env = 0;
  for (let i = 0; i < samples.length; i++) {
    const level = Math.abs(samples[i]);
    const coeff = level > env ? attackCoeff : releaseCoeff;
    env = coeff * level + (1 - coeff) * env;
    const gain = env > threshold ? threshold / env : 1.0;
    out[i] = samples[i] * gain;
  }
  return out;
}

// Lanczos-3 resampler: sharper rolloff and better stopband rejection (-30 dB) than
// cubic interpolation (-13 dB). Passband flat to ±0.2 dB vs cubic's ±1.5 dB.
function lanczos3Kernel(x) {
  const ax = Math.abs(x);
  if (ax >= 3) return 0;
  if (ax < 1e-8) return 1;
  const px = Math.PI * x;
  return (Math.sin(px) / px) * (Math.sin(px / 3) / (px / 3));
}

export function lanczos3Resample(input, outputLen) {
  const N = input.length;
  const out = new Float32Array(outputLen);
  const ratio = (N - 1) / Math.max(1, outputLen - 1);
  for (let i = 0; i < outputLen; i++) {
    const src = i * ratio;
    const center = Math.floor(src);
    let sum = 0, wSum = 0;
    for (let j = center - 2; j <= center + 3; j++) {
      if (j < 0 || j >= N) continue;
      const w = lanczos3Kernel(src - j);
      sum += input[j] * w;
      wSum += w;
    }
    out[i] = wSum > 1e-8 ? sum / wSum : 0;
  }
  return out;
}
