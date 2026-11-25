// Fetches and decodes a groove off the main thread so the page stays responsive.
// Master-quality (SPG3) grooves stream: the header, then decoded stretches as they download,
// so playback can start long before the file finishes.
import { unpackToCoords } from './groovepack.js';
import { parseGrooveHeader, decodeFromCoords, losslessResult, losslessGeometry } from './codec.js';
import { MAGIC3, createSampleReader } from './losslesspack.js';

const PLACEHOLDER = '@@GROOVE@@';

async function* byteChunks(url, buf) {
  if (buf) { yield new Uint8Array(buf); return; }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  if (!resp.body) { yield new Uint8Array(await resp.arrayBuffer()); return; }
  const reader = resp.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

function decodeWhole(id, bytes, defaults) {
  return unpackToCoords(bytes).then(u => {
    if (u.svgText) { self.postMessage({ id, legacySvg: u.svgText }); return; }
    const meta = parseGrooveHeader(u.header, defaults);
    const r = u.mid ? losslessResult(u.mid, u.side, u.xs, u.ys, meta) : decodeFromCoords(u.xs, u.ys, meta);
    const transfer = [...new Set([r.samples.buffer, r.samplesR?.buffer, r.groovePoints.buffer, r.intL?.buffer, r.intR?.buffer].filter(Boolean))];
    self.postMessage({ id, result: r }, transfer);
  });
}

async function stream(id, chunks, first, defaults) {
  const rd = createSampleReader();
  rd.push(first);
  let meta = null, geo = null, full = 0, sent = 0;
  const flush = () => {
    if (!rd.pump() && sent === rd.decoded) return;
    if (!meta && rd.template) {
      meta = parseGrooveHeader(rd.template.replace(PLACEHOLDER, ''), defaults);
      geo = losslessGeometry({ N: rd.N, turns: meta.turns, Rout: meta.Rout, Rin: meta.Rin, cx: meta.cx, cy: meta.cy, S: meta.coordScale, q: meta.q });
      full = 2 ** (meta.bits - 1);
      const k = Math.min(10, 0.45 * (meta.Rout - meta.Rin) / Math.max(1, meta.turns));
      self.postMessage({ id, head: {
        N: rd.N, sampleRate: meta.sr, stereo: !!rd.side, bits: meta.bits, turns: meta.turns,
        Rout: meta.Rout, Rin: meta.Rin, cx: meta.cx, cy: meta.cy, k,
      } });
    }
    if (!meta || rd.decoded === sent) return;
    const from = sent, to = rd.decoded, n = to - from;
    const left = new Float32Array(n), right = rd.side ? new Float32Array(n) : null;
    const points = new Float32Array(n * 2);
    const S = meta.coordScale;
    for (let j = 0; j < n; j++) {
      const i = from + j, mid = rd.mid[i], side = rd.side ? rd.side[i] : 0;
      if (rd.side) {
        const sum = 2 * mid + (side & 1);
        left[j] = ((sum + side) >> 1) / full;
        right[j] = ((sum - side) >> 1) / full;
      } else {
        left[j] = mid / full;
      }
      const [x, y] = geo.vertex(i, mid, side);
      points[j * 2] = x / S;
      points[j * 2 + 1] = y / S;
    }
    sent = to;
    self.postMessage({ id, chunk: { from, to, left, right, points } }, [left.buffer, right?.buffer, points.buffer].filter(Boolean));
  };
  flush();
  for await (const c of chunks) { rd.push(c); flush(); }
  flush();
  if (!rd.done) throw new Error('Groove download was cut short');
  self.postMessage({ id, end: true });
}

self.onmessage = async ({ data: { id, url, buf, defaults } }) => {
  try {
    const chunks = byteChunks(url, buf);
    // Peek at the first bytes to pick a path: stream SPG3, or collect everything for older formats.
    let first = new Uint8Array(0);
    while (first.length < 4) {
      const { done, value } = await chunks.next();
      if (done) break;
      const merged = new Uint8Array(first.length + value.length);
      merged.set(first); merged.set(value, first.length);
      first = merged;
    }
    if (MAGIC3.every((b, i) => first[i] === b)) {
      await stream(id, chunks, first, defaults);
      return;
    }
    const parts = [first];
    for await (const c of chunks) parts.push(c);
    const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    await decodeWhole(id, all.buffer, defaults);
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
