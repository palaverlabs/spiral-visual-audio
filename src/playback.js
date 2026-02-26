import { MIN_PLAYBACK_RATE, SPIN_SPEED } from './constants.js';
import { cubicInterpolate } from './dsp.js';

export class PlaybackManager {
  constructor({ onFrame, onStop, onDebug }) {
    this.onFrame = onFrame;
    this.onStop = onStop;
    this.onDebug = onDebug;
    this.isPlaying = false;
    this.animationId = null;
    this.audioSource = null;
  }

  start(audioData, sampleRate, speed) {
    this.isPlaying = true;

    let playbackData = audioData;
    let playbackRate = sampleRate;

    if (sampleRate < MIN_PLAYBACK_RATE) {
      this.onDebug(`Upsampling from ${sampleRate}Hz to ${MIN_PLAYBACK_RATE}Hz for playback`);
      playbackData = this._resample(audioData, sampleRate, MIN_PLAYBACK_RATE);
      playbackRate = MIN_PLAYBACK_RATE;
    }

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = audioContext.createBuffer(1, playbackData.length, playbackRate);
      buffer.copyToChannel(playbackData, 0);

      this.audioSource = audioContext.createBufferSource();
      this.audioSource.buffer = buffer;
      this.audioSource.playbackRate.value = speed;
      this.audioSource.connect(audioContext.destination);
      this.audioSource.start();
      this.audioSource.onended = () => this.stop();

      const expectedDuration = (audioData.length / sampleRate) / speed;
      this.onDebug(`Audio playback: ${speed}x rate, ${expectedDuration.toFixed(2)}s expected duration`);
    } catch (error) {
      this.onDebug(`Audio playback error: ${error.message}`);
    }

    this._animate(speed, audioData.length, sampleRate);
  }

  stop() {
    this.isPlaying = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.audioSource) {
      try { this.audioSource.stop(); } catch (e) {}
      this.audioSource = null;
    }

    this.onStop();
  }

  createWAVBlob(audioData, sampleRate) {
    let samples = audioData;
    let rate = sampleRate;

    if (rate < MIN_PLAYBACK_RATE) {
      samples = this._resample(audioData, rate, MIN_PLAYBACK_RATE);
      rate = MIN_PLAYBACK_RATE;
    }

    const length = samples.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    const write = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    write(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, length * 2, true);

    for (let i = 0; i < length; i++) {
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7FFF, true);
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

  _animate(speed, audioLength, sampleRate) {
    const playbackDuration = (audioLength / sampleRate) / speed;
    const startTime = performance.now();

    const frame = (currentTime) => {
      if (!this.isPlaying) return;
      const elapsed = (currentTime - startTime) / 1000;
      const progress = Math.min(elapsed / playbackDuration, 1);

      this.onFrame({
        rotation: elapsed * SPIN_SPEED,
        progress,
        audioTimePosition: elapsed * speed,
      });

      if (progress < 1) {
        this.animationId = requestAnimationFrame(frame);
      } else {
        this.stop();
      }
    };

    this.animationId = requestAnimationFrame(frame);
  }
}
