// loadGroove({ url } | { buf }, defaults) → decoded groove (same shape as decodeFromSVG).
// Runs in a Web Worker; falls back to the main thread if workers are unavailable.
import { unpackToCoords } from './groovepack.js';
import { parseGrooveHeader, decodeFromCoords, decodeFromSVGLegacy } from './codec.js';

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
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else if (data.legacySvg) p.resolve(decodeFromSVGLegacy(data.legacySvg, p.defaults));
      else p.resolve(data.result);
    };
    worker.onerror = () => { worker = false; for (const p of pending.values()) p.retry(); pending.clear(); };
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
  return decodeFromCoords(u.xs, u.ys, parseGrooveHeader(u.header, defaults));
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
