// AudioWorklet processor — runs on the audio render thread.
// Reads from Float32Array(s) at a variable advance rate (pos += adv each sample).
// adv = 1.0: normal 1x forward playback
// adv = -1.0: 1x backward (scratch)
// adv = 0: paused/held
// adv = 2.0: 2x forward, etc.
// Supports mono (left only) and stereo (left + right) buffers.
// Streaming: only the first `ready` samples exist yet; 'append' fills in more as they decode.
// If the stylus catches up with the download it holds in place (silence) until more arrives.
// Resampling: a 32-tap Kaiser-windowed sinc (polyphase table, blended between phases). The record's
// sample rate rarely matches the device's (44.1k vs 48k), and linear interpolation there leaves
// audible grit in the treble (~15 dB clean at 10 kHz vs ~80 dB with this). At adv = 1 it's exact.
const TAPS = 32, HALF = TAPS / 2, PHASES = 256;

function bessel0(x) { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; }

function buildKernel(adv) {
  // Low-pass below the lower of the two Nyquists so downsampling (adv > 1) doesn't alias.
  const cut = Math.min(1, 1 / Math.max(1e-3, Math.abs(adv))) * 0.95;
  const beta = 8.6, norm = bessel0(beta);
  const table = new Float32Array((PHASES + 1) * TAPS);
  for (let ph = 0; ph <= PHASES; ph++) {
    const t = ph / PHASES;
    let sum = 0;
    for (let k = 0; k < TAPS; k++) {
      const d = (k - (HALF - 1)) - t;               // distance from the read position
      const x = Math.PI * cut * d;
      const sinc = Math.abs(d) < 1e-9 ? 1 : Math.sin(x) / x;
      const r = d / HALF;
      const w = Math.abs(r) >= 1 ? 0 : bessel0(beta * Math.sqrt(1 - r * r)) / norm;
      table[ph * TAPS + k] = sinc * w;
      sum += sinc * w;
    }
    for (let k = 0; k < TAPS; k++) table[ph * TAPS + k] /= sum;
  }
  return table;
}

class GrooveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = null;
    this.right = null;
    this.pos = 0;
    this.adv = 1.0;
    this.tick = 0;
    this.ready = 0;

    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case 'load':
          this.left = new Float32Array(data.left);
          this.right = data.right ? new Float32Array(data.right) : null;
          this.ready = data.ready ?? this.left.length;
          this.kernel = buildKernel(data.adv || 1);
          this.pos = Math.min(data.startPos, Math.max(0, this.ready - 1));
          this.adv = data.adv;
          break;
        case 'append':
          if (!this.left) break;
          this.left.set(new Float32Array(data.left), data.from);
          if (this.right && data.right) this.right.set(new Float32Array(data.right), data.from);
          this.ready = Math.max(this.ready, data.ready);
          break;
        case 'adv':
          this.adv = data.adv;
          break;
        case 'seek':
          this.pos = Math.max(0, Math.min(this.left ? this.ready - 1 : 0, data.pos));
          break;
      }
    };
  }

  process(inputs, outputs) {
    const outL = outputs[0][0];
    const outR = outputs[0][1] || null;

    if (!this.left) {
      outL.fill(0);
      if (outR) outR.fill(0);
      return true;
    }

    const left = this.left;
    const right = this.right || this.left; // fall back to left for mono output
    const N = left.length;

    for (let i = 0; i < outL.length; i++) {
      const p = this.pos;

      if (p < 0) {
        outL[i] = 0;
        if (outR) outR[i] = 0;
        this.pos = 0;
        continue;
      }
      if (this.ready < N && p >= this.ready - HALF - 1 && this.adv > 0) {
        // Still downloading: hold here until the groove reaches us.
        outL[i] = 0;
        if (outR) outR[i] = 0;
        continue;
      }
      if (p >= N - 1) {
        outL.fill(0, i);
        if (outR) outR.fill(0, i);
        if (this.adv > 0) this.port.postMessage({ type: 'ended' });
        return true;
      }

      const j = p | 0;
      if (p === j && this.adv === 1) {
        // Rates match and we're on a sample: play it as-is (bit-exact for Master grooves).
        outL[i] = left[j];
        if (outR) outR[i] = right[j];
        this.pos += 1;
        continue;
      }
      // Windowed-sinc interpolation around the read position.
      const fp = (p - j) * PHASES, ph = fp | 0, blend = fp - ph;
      const k0 = ph * TAPS, k1 = k0 + TAPS, kern = this.kernel;
      const base = j - (HALF - 1);
      let sl = 0, sr = 0;
      if (base >= 0 && base + TAPS <= N) {
        for (let k = 0; k < TAPS; k++) {
          const w = kern[k0 + k] + blend * (kern[k1 + k] - kern[k0 + k]);
          sl += w * left[base + k];
          sr += w * right[base + k];
        }
      } else {
        for (let k = 0; k < TAPS; k++) {
          const idx = base + k;
          if (idx < 0 || idx >= N) continue;
          const w = kern[k0 + k] + blend * (kern[k1 + k] - kern[k0 + k]);
          sl += w * left[idx];
          sr += w * right[idx];
        }
      }
      outL[i] = sl;
      if (outR) outR[i] = sr;
      this.pos += this.adv;
    }

    // Compute block RMS (left channel) and report position every 4 render quanta (~12ms).
    let rms = 0;
    for (let i = 0; i < outL.length; i++) rms += outL[i] * outL[i];
    rms = Math.sqrt(rms / outL.length);

    if ((++this.tick & 3) === 0) {
      this.port.postMessage({ type: 'pos', v: Math.max(0, Math.min(1, this.pos / N)), amp: rms });
    }

    return true;
  }
}

registerProcessor('groove-processor', GrooveProcessor);
