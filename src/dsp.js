import { TAU, MU, PREEMPH_COEFF } from './constants.js';

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

export function cubicInterpolate(y0, y1, y2, y3, t) {
  const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c = -0.5 * y0 + 0.5 * y2;
  const d = y1;
  return a * t * t * t + b * t * t + c * t + d;
}
