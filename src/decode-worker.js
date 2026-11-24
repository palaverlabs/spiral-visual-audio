// Fetches and decodes a groove off the main thread so the page stays responsive.
import { unpackToCoords } from './groovepack.js';
import { parseGrooveHeader, decodeFromCoords } from './codec.js';

self.onmessage = async ({ data: { id, url, buf, defaults } }) => {
  try {
    let bytes = buf;
    if (!bytes) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      bytes = await resp.arrayBuffer();
    }
    const u = await unpackToCoords(bytes);
    if (u.svgText) { self.postMessage({ id, legacySvg: u.svgText }); return; }
    const r = decodeFromCoords(u.xs, u.ys, parseGrooveHeader(u.header, defaults));
    const transfer = [...new Set([r.samples.buffer, r.samplesR?.buffer, r.groovePoints.buffer].filter(Boolean))];
    self.postMessage({ id, result: r }, transfer);
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
