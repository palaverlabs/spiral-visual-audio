import { MIN_PLAYBACK_RATE, SPIN_SPEED } from './constants.js';
import { cubicInterpolate } from './dsp.js';

export class PlaybackManager {
  constructor({ onFrame, onStop, onDebug }) {
    this.onFrame = onFrame;
    this.onStop = onStop;
    this.onDebug = onDebug;
    this.isPlaying = false;
    this.animationId = null;
    this._ctx = null;
    this._node = null;
    this._latestProgress = 0;
    this._amplitude = 0;  // envelope-followed amplitude for stylus pulse
    this._totalDuration = 0;
    this._baseAdv = 1; // advance per output sample at 1x speed
  }

  // audio: { left, right?, sampleRate } — right is null for mono.
  async start(audio, speed, startProgress = 0) {
    this.stop();
    this.isPlaying = true;

    let left = audio.left || audio.samples;
    let right = audio.right || null;
    let rate = audio.sampleRate;

    if (rate < MIN_PLAYBACK_RATE) {
      this.onDebug(`Upsampling ${rate}Hz → ${MIN_PLAYBACK_RATE}Hz`);
      left = this._resample(left, rate, MIN_PLAYBACK_RATE);
      if (right) right = this._resample(right, rate, MIN_PLAYBACK_RATE);
      rate = MIN_PLAYBACK_RATE;
    }

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();

      await ctx.audioWorklet.addModule('/groove-processor.js');

      this._ctx = ctx;
      this._totalDuration = left.length / rate;
      this._baseAdv = rate / ctx.sampleRate;
      this._latestProgress = startProgress;

      const isStereo = right !== null;
      this._node = new AudioWorkletNode(ctx, 'groove-processor', {
        outputChannelCount: [isStereo ? 2 : 1],
      });
      this._node.connect(ctx.destination);

      this._node.port.onmessage = ({ data }) => {
        if (data.type === 'pos') {
          this._latestProgress = data.v;
          // Envelope follower: fast attack (~12ms), slow release (~200ms).
          const raw = data.amp || 0;
          if (raw > this._amplitude) {
            this._amplitude = 0.6 * raw + 0.4 * this._amplitude; // attack
          } else {
            this._amplitude = 0.04 * raw + 0.96 * this._amplitude; // release
          }
        } else if (data.type === 'ended') {
          this.stop();
        }
      };

      // Transfer copies so the caller's arrays stay intact.
      const leftCopy = left.buffer.slice(0);
      const rightCopy = right ? right.buffer.slice(0) : null;
      const transferList = rightCopy ? [leftCopy, rightCopy] : [leftCopy];

      this._node.port.postMessage({
        type: 'load',
        left: leftCopy,
        right: rightCopy,
        startPos: Math.round(startProgress * left.length),
        adv: this._baseAdv * speed,
      }, transferList);

      this._animate();
      this.onDebug(`Scratch playback ready: ${speed}x, ${this._totalDuration.toFixed(2)}s, adv=${this._baseAdv.toFixed(4)}${isStereo ? ' [stereo]' : ''}`);
    } catch (err) {
      this.isPlaying = false;
      this.onDebug(`Playback error: ${err.message}`);
      console.error(err);
      this.onStop();
    }
  }

  // rate = 1.0 → normal speed  rate = 0 → freeze  rate = -1 → backward scratch
  setRate(rate) {
    if (!this._node) return;
    this._node.port.postMessage({ type: 'adv', adv: this._baseAdv * rate });
  }

  stop() {
    this.isPlaying = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this._node) {
      this._node.disconnect();
      this._node = null;
    }
    if (this._ctx) {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }

    this.onStop();
  }

  get latestProgress() { return this._latestProgress; }

  // audio: { left, right?, sampleRate } — exports stereo WAV if right is present.
  createWAVBlob(audio) {
    let left = audio.left || audio.samples;
    let right = audio.right || null;
    let rate = audio.sampleRate;

    if (rate < MIN_PLAYBACK_RATE) {
      left = this._resample(left, rate, MIN_PLAYBACK_RATE);
      if (right) right = this._resample(right, rate, MIN_PLAYBACK_RATE);
      rate = MIN_PLAYBACK_RATE;
    }

    const channels = right ? 2 : 1;
    const length = left.length;
    const buffer = new ArrayBuffer(44 + length * channels * 2);
    const view = new DataView(buffer);
    const write = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    write(0, 'RIFF');
    view.setUint32(4, 36 + length * channels * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);           // PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, length * channels * 2, true);

    for (let i = 0; i < length; i++) {
      view.setInt16(44 + i * channels * 2, Math.max(-1, Math.min(1, left[i])) * 0x7FFF, true);
      if (right) {
        view.setInt16(44 + i * channels * 2 + 2, Math.max(-1, Math.min(1, right[i])) * 0x7FFF, true);
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  _resample(samples, fromRate, toRate) {
    if (fromRate === toRate) return samples;
    const ratio = fromRate / toRate;
    const newLen = Math.round(samples.length / ratio);
    const out = new Float32Array(newLen);
    const len = samples.length;
    for (let i = 0; i < newLen; i++) {
      const srcPos = i * ratio;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      out[i] = cubicInterpolate(
        samples[Math.max(0, idx - 1)],
        samples[idx],
        samples[Math.min(len - 1, idx + 1)],
        samples[Math.min(len - 1, idx + 2)],
        frac
      );
    }
    return out;
  }

  _animate() {
    const frame = (now) => {
      if (!this.isPlaying) return;
      this.onFrame({
        progress: this._latestProgress,
        audioTimePosition: this._latestProgress * this._totalDuration,
        amplitude: this._amplitude,
      });
      this.animationId = requestAnimationFrame(frame);
    };
    this.animationId = requestAnimationFrame(frame);
  }
}
