// Renders a vertical (9:16) video of the deck playing a slice of a record, for Stories/Reels/TikTok.
// Records in real time with MediaRecorder: canvas frames + the clip's audio.
import { Renderer } from './renderer.js';
import { SPIN_SPEED } from './constants.js';

export const CLIP_W = 1080, CLIP_H = 1920;
export const CLIP_SECONDS = 15;
const FADE = 0.35;

const MIMES = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
];
const pickMime = () => MIMES.find(t => MediaRecorder.isTypeSupported(t)) || '';
export const canRecordClip = () =>
  typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && !!pickMime();

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function loadImage(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

// Cheap, Safari-safe blur: draw tiny, scale up with smoothing.
function blurredBackdrop(img) {
  const c = document.createElement('canvas');
  c.width = CLIP_W; c.height = CLIP_H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b0a';
  g.fillRect(0, 0, CLIP_W, CLIP_H);
  if (img) {
    const t = document.createElement('canvas');
    t.width = 18; t.height = 32;
    const tg = t.getContext('2d');
    const s = Math.max(t.width / img.width, t.height / img.height);
    tg.drawImage(img, (t.width - img.width * s) / 2, (t.height - img.height * s) / 2, img.width * s, img.height * s);
    g.globalAlpha = 0.55;
    g.imageSmoothingQuality = 'high';
    g.drawImage(t, -40, -40, CLIP_W + 80, CLIP_H + 80);
    g.globalAlpha = 1;
  }
  const v = g.createLinearGradient(0, 0, 0, CLIP_H);
  v.addColorStop(0, 'rgba(8,8,7,0.55)');
  v.addColorStop(0.45, 'rgba(8,8,7,0.15)');
  v.addColorStop(1, 'rgba(8,8,7,0.85)');
  g.fillStyle = v;
  g.fillRect(0, 0, CLIP_W, CLIP_H);
  return c;
}

function fitText(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function resample(src, from, to) {
  if (from === to) return src;
  const n = Math.round(src.length * to / from), out = new Float32Array(n), k = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * k, j = x | 0, f = x - j;
    out[i] = (src[j] ?? 0) * (1 - f) + (src[j + 1] ?? src[j] ?? 0) * f;
  }
  return out;
}

// Builds the scene once; frame(t) paints the composite for clip-time t (seconds).
export async function createClipScene({ canvas, record, groove, geom, skin, coverSrc, start, seconds }) {
  canvas.width = CLIP_W; canvas.height = CLIP_H;
  const g = canvas.getContext('2d');
  const disc = document.createElement('canvas');
  disc.width = disc.height = 1000;
  const renderer = new Renderer(disc);
  renderer.setSkin(skin.canvas, groove.groovePoints, geom);
  const backdrop = blurredBackdrop(await loadImage(coverSrc));
  const accent = css('--accent', '#d4880a');
  const duration = groove.samples.length / groove.sampleRate;
  const by = record.artist || (record.users?.username ? `@${record.users.username}` : '');
  const D = 980, dx = (CLIP_W - D) / 2, dy = 300;

  const frame = (t, amplitude = 0, freq = null) => {
    const pos = Math.min(duration, start + t);
    renderer.drawDiscWithGroove(t * SPIN_SPEED, pos / duration, geom, amplitude, freq);
    g.drawImage(backdrop, 0, 0);
    g.drawImage(disc, dx, dy, D, D);

    g.textBaseline = 'alphabetic';
    g.fillStyle = accent;
    g.font = `500 30px 'IBM Plex Mono', ui-monospace, monospace`;
    g.textAlign = 'left';
    g.fillText('SPIRAL AUDIO', 80, 180);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(237,235,228,0.55)';
    g.fillText('● NOW SPINNING', CLIP_W - 80, 180);

    g.textAlign = 'left';
    g.fillStyle = '#EDEBE4';
    g.font = `600 76px 'IBM Plex Sans', system-ui, sans-serif`;
    g.fillText(fitText(g, record.title || 'Untitled', CLIP_W - 160), 80, 1440);
    if (by) {
      g.fillStyle = 'rgba(237,235,228,0.65)';
      g.font = `400 44px 'IBM Plex Sans', system-ui, sans-serif`;
      g.fillText(fitText(g, by, CLIP_W - 160), 80, 1510);
    }

    const bx = 80, bw = CLIP_W - 160, barY = 1600;
    g.fillStyle = 'rgba(237,235,228,0.18)';
    g.fillRect(bx, barY, bw, 6);
    g.fillStyle = accent;
    g.fillRect(bx, barY, bw * Math.min(1, t / seconds), 6);
    g.font = `400 30px 'IBM Plex Mono', ui-monospace, monospace`;
    g.fillStyle = 'rgba(237,235,228,0.65)';
    g.fillText(fmt(pos), bx, barY + 56);
    g.textAlign = 'right';
    g.fillText(fmt(duration), bx + bw, barY + 56);

    g.textAlign = 'center';
    g.fillStyle = 'rgba(237,235,228,0.8)';
    g.font = `500 34px 'IBM Plex Mono', ui-monospace, monospace`;
    g.fillText('SPIRALAUD.IO', CLIP_W / 2, 1810);
  };
  return { frame };
}

// ctx must be created/resumed inside the tap that started this (iOS).
export async function recordClip({ ctx, scene, canvas, groove, start, seconds, onProgress }) {
  const sr = ctx.sampleRate;
  const from = Math.floor(start * groove.sampleRate), to = Math.floor((start + seconds) * groove.sampleRate);
  const chans = [groove.samples, groove.samplesR].filter(Boolean).map(ch => resample(ch.subarray(from, to), groove.sampleRate, sr));
  const buf = ctx.createBuffer(chans.length, chans[0].length, sr);
  chans.forEach((d, i) => buf.copyToChannel(d, i));

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;
  const dest = ctx.createMediaStreamDestination();
  src.connect(gain).connect(analyser);
  analyser.connect(dest);
  analyser.connect(ctx.destination);
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);

  if (ctx.state !== 'running') await ctx.resume();
  scene.frame(0);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5e6, audioBitsPerSecond: 160e3 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { rec.onstop = res; });

  rec.start(250);
  const t0 = ctx.currentTime + 0.05;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(1, t0 + FADE);
  gain.gain.setValueAtTime(1, t0 + seconds - FADE);
  gain.gain.linearRampToValueAtTime(0, t0 + seconds);
  src.start(t0);

  let amp = 0;
  await new Promise(done => {
    const tick = () => {
      const t = Math.max(0, ctx.currentTime - t0);
      analyser.getByteFrequencyData(freq);
      analyser.getFloatTimeDomainData(wave);
      let peak = 0;
      for (let i = 0; i < wave.length; i++) { const a = Math.abs(wave[i]); if (a > peak) peak = a; }
      amp = peak > amp ? 0.35 * peak + 0.65 * amp : 0.06 * peak + 0.94 * amp;
      scene.frame(Math.min(t, seconds), amp, freq);
      onProgress?.(Math.min(1, t / seconds));
      if (t >= seconds + 0.15) return done();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  rec.stop();
  await stopped;
  try { src.disconnect(); analyser.disconnect(); } catch {}
  stream.getTracks().forEach(t => t.stop());
  const type = rec.mimeType || mimeType || 'video/webm';
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}
