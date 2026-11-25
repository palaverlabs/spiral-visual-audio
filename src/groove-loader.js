// loadGroove({ url } | { buf }, defaults) → decoded groove (same shape as decodeFromSVG).
// Runs in a Web Worker; falls back to the main thread if workers are unavailable.
// Master-quality grooves arrive as a *streaming* groove: full-length arrays that fill in as the
// file downloads. They resolve once a few seconds are ready, with:
//   complete (false until the end), loaded (samples ready), onChunk(fn(from, to)) → unsubscribe,
//   done (Promise that settles when complete).
import { unpackToCoords } from './groovepack.js';
import { parseGrooveHeader, decodeFromCoords, decodeFromSVGLegacy, losslessResult } from './codec.js';

const START_SECONDS = 2;

function streamingGroove(head) {
  const { N, sampleRate, stereo } = head;
  const fns = new Set();
  let settle;
  const g = {
    ...head,
    samples: new Float32Array(N),
    samplesR: stereo ? new Float32Array(N) : null,
    groovePoints: new Float32Array(N * 2),
    vertices: N, lossless: true, complete: false, loaded: 0,
    onChunk(fn) { fns.add(fn); return () => fns.delete(fn); },
    done: new Promise((ok, bad) => { settle = { ok, bad }; }),
  };
  if (stereo) g.samplesL = g.samples;
  g.done.catch(() => {});
  g._chunk = c => {
    g.samples.set(c.left, c.from);
    if (c.right) g.samplesR.set(c.right, c.from);
    g.groovePoints.set(c.points, c.from * 2);
    g.loaded = c.to;
    for (const fn of fns) fn(c.from, c.to);
  };
  g._end = () => { g.complete = true; for (const fn of fns) fn(g.loaded, g.loaded); settle.ok(g); };
  g._fail = err => { g.error = err; settle.bad(err); };
  g._ready = () => g.loaded >= Math.min(N, sampleRate * START_SECONDS);
  return g;
}

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./decode-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      if (data.head) { p.live = streamingGroove(data.head); return; }
      if (data.chunk) {
        p.live._chunk(data.chunk);
        if (!p.resolved && p.live._ready()) { p.resolved = true; p.resolve(p.live); }
        return;
      }
      pending.delete(data.id);
      if (data.end) { p.live._end(); if (!p.resolved) p.resolve(p.live); return; }
      if (data.error) {
        const err = new Error(data.error);
        if (p.live) p.live._fail(err);
        if (!p.resolved) p.reject(err);
      }
      else if (data.legacySvg) p.resolve(decodeFromSVGLegacy(data.legacySvg, p.defaults));
      else p.resolve(data.result);
    };
    worker.onerror = () => { worker = false; for (const p of pending.values()) if (!p.resolved) p.retry(); pending.clear(); };
  } catch {
    worker = false;
  }
  return worker;
}

async function decodeOnMainThread({ url, buf }, defaults) {
  let bytes = buf;
  if (!bytes) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    bytes = await resp.arrayBuffer();
  }
  const u = await unpackToCoords(bytes);
  if (u.svgText) return decodeFromSVGLegacy(u.svgText, defaults);
  const meta = parseGrooveHeader(u.header, defaults);
  return u.mid ? losslessResult(u.mid, u.side, u.xs, u.ys, meta) : decodeFromCoords(u.xs, u.ys, meta);
}

export function loadGroove(src, defaults = {}) {
  const w = getWorker();
  if (!w) return decodeOnMainThread(src, defaults);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, defaults, retry: () => decodeOnMainThread(src, defaults).then(resolve, reject) });
    // Don't transfer a prefetched buffer: the caller may keep it cached.
    w.postMessage({ id, url: src.url, buf: src.buf ? src.buf.slice(0) : undefined, defaults });
  });
}

// Download only (for prefetching the next record); decode happens on play.
export async function fetchGrooveBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.arrayBuffer();
}
