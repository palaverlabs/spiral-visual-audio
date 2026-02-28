import { MIN_PLAYBACK_RATE, SPIN_SPEED } from './constants.js';
import { cubicInterpolate } from './dsp.js';

export class PlaybackManager {
  constructor({ onFrame, onStop, onDebug }) {
    this.onFrame = onFrame;
    this.onStop = onStop;
    this.onDebug = onDebug;
    this.isPlaying = false;
    this.animationId = null;
    this._ctx = null;          // persistent — never closed after creation
    this._workletLoaded = false;
    this._node = null;
    this._latestProgress = 0;
    this._amplitude = 0;
    this._totalDuration = 0;
    this._baseAdv = 1;
  }

  // Call this synchronously inside a user-gesture handler (before any await).
  // iOS Safari loses gesture context after the first await, so resume() must
  // happen here, not inside the async start() chain.
  unlock() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume(); // intentionally not awaited
    }
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
      // Ensure context exists (fallback if unlock() wasn't called).
      if (!this._ctx) {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this._ctx;

      // Load worklet only once per context lifetime.
      if (!this._workletLoaded) {
        await ctx.audioWorklet.addModule('/groove-processor.js');
        this._workletLoaded = true;
      }

      // Ensure context is running (belt-and-suspenders for non-iOS).
      if (ctx.state === 'suspended') await ctx.resume();

      this._totalDuration = left.length / rate;
      this._baseAdv = rate / ctx.sampleRate;
      this._latestProgress = startProgress;

      const isStereo = right !== null;
      // outputChannelCount option omitted — causes errors on some iOS Safari versions.
      this._node = new AudioWorkletNode(ctx, 'groove-processor');
      this._node.connect(ctx.destination);

      this._node.port.onmessage = ({ data }) => {
        if (data.type === 'pos') {
          this._latestProgress = data.v;
          const raw = data.amp || 0;
          if (raw > this._amplitude) {
            this._amplitude = 0.6 * raw + 0.4 * this._amplitude;
          } else {
            this._amplitude = 0.04 * raw + 0.96 * this._amplitude;
          }
        } else if (data.type === 'ended') {
          this.stop();
        }
      };

      // Float32Array.slice() creates a clean copy in its own buffer at byteOffset=0.
      // Using .buffer.slice() is unsafe if the array shares a buffer with other channels.
      const leftCopy = left.slice(0).buffer;
      const rightCopy = right ? right.slice(0).buffer : null;
      const transferList = rightCopy ? [leftCopy, rightCopy] : [leftCopy];

      this._node.port.postMessage({
        type: 'load',
        left: leftCopy,
        right: rightCopy,
        startPos: Math.round(startProgress * left.length),
        adv: this._baseAdv * speed,
      }, transferList);

      this._animate();
      this.onDebug(`Playback ready: ${speed}x, ${this._totalDuration.toFixed(2)}s${isStereo ? ' [stereo]' : ''}`);
    } catch (err) {
      this.isPlaying = false;
      const msg = `Playback error: ${err.message}`;
      this.onDebug(msg);
      this.onError?.(msg);
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
    // Keep this._ctx alive — iOS requires reuse of the same context.

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
    view.setUint16(20, 1, true);
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
    const frame = () => {
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
