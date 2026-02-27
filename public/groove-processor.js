// AudioWorklet processor — runs on the audio render thread.
// Reads from Float32Array(s) at a variable advance rate (pos += adv each sample).
// adv = 1.0: normal 1x forward playback
// adv = -1.0: 1x backward (scratch)
// adv = 0: paused/held
// adv = 2.0: 2x forward, etc.
// Supports mono (left only) and stereo (left + right) buffers.
class GrooveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = null;
    this.right = null;
    this.pos = 0;
    this.adv = 1.0;
    this.tick = 0;

    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case 'load':
          this.left = new Float32Array(data.left);
          this.right = data.right ? new Float32Array(data.right) : null;
          this.pos = data.startPos;
          this.adv = data.adv;
          break;
        case 'adv':
          this.adv = data.adv;
          break;
        case 'seek':
          this.pos = Math.max(0, Math.min(this.left ? this.left.length - 1 : 0, data.pos));
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
      if (p >= N - 1) {
        outL.fill(0, i);
        if (outR) outR.fill(0, i);
        if (this.adv > 0) this.port.postMessage({ type: 'ended' });
        return true;
      }

      // Linear interpolation between adjacent samples.
      const j = p | 0;
      const f = p - j;
      outL[i] = left[j] + f * (left[j + 1] - left[j]);
      if (outR) outR[i] = right[j] + f * (right[j + 1] - right[j]);
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
