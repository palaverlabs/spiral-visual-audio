// Lossless compact storage for groove SVGs.
//
// The SVG's path data is replaced by a binary stream of order-2 prediction residuals
// (A[i] - (2·A[i-1] - A[i-2])) of the integer vertex coordinates, zigzag + varint encoded,
// then the whole file is gzipped. Unpacking reproduces the exact same vertices and SVG,
// so the stored record is still pure geometry — just ~33% smaller than gzipped SVG text.
//
// Layout (before gzip): "SPG2" | u32 template byte length | template UTF-8 | u32 vertex count | varints
// The template is the original SVG with the path's d="" contents replaced by PLACEHOLDER.

import { findPathData, parsePathCoords, parseGrooveHeader, losslessSamplesFromCoords, losslessGeometry } from './codec.js';
import { MAGIC3, packSamples, unpackSamples } from './losslesspack.js';

const MAGIC = [0x53, 0x50, 0x47, 0x32]; // "SPG2"
const PLACEHOLDER = '@@GROOVE@@';
const isMagic = (bytes, m) => m.every((b, i) => bytes[i] === b);

// Master-quality grooves: store the samples (SPG3) when they rebuild the exact same vertices.
function packLossless(svg) {
  const loc = findPathData(svg);
  if (!loc || !/lossless=1/.test(loc.header)) return null;
  const meta = parseGrooveHeader(loc.header);
  const { xs, ys } = parsePathCoords(svg, loc.dStart, loc.dEnd, Float64Array);
  const { mid, side, geo } = losslessSamplesFromCoords(xs, ys, meta);
  for (let i = 0; i < xs.length; i++) {
    const [x, y] = geo.vertex(i, mid[i], side ? side[i] : 0);
    if (x !== xs[i] || y !== ys[i]) return null;
  }
  const template = svg.slice(0, loc.dStart) + PLACEHOLDER + svg.slice(loc.dEnd);
  return packSamples(template, mid, side);
}

// SPG3 → template, header and rebuilt integer vertices.
function rebuildLossless(bytes) {
  const { template, mid, side } = unpackSamples(bytes);
  const header = template.replace(PLACEHOLDER, '');
  const meta = parseGrooveHeader(header);
  const N = mid.length;
  const geo = losslessGeometry({ N, turns: meta.turns, Rout: meta.Rout, Rin: meta.Rin, cx: meta.cx, cy: meta.cy, S: meta.coordScale, q: meta.q });
  const xs = new Float64Array(N), ys = new Float64Array(N);
  for (let i = 0; i < N; i++) [xs[i], ys[i]] = geo.vertex(i, mid[i], side ? side[i] : 0);
  return { template, header, xs, ys, mid, side };
}

async function gzip(bytes) {
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gunzip(bytes) {
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

// Returns gzipped packed bytes, or gzipped SVG text if the SVG has no groove path to pack.
export async function packGroove(svg) {
  const lossless = packLossless(svg);
  if (lossless) return lossless; // Rice-coded already; gzip can't shrink it further
  const m = svg.match(/(<path id="audioGroove"[^>]*? d=")([^"]*)(")/);
  if (!m) return gzip(new TextEncoder().encode(svg));

  const nums = m[2].match(/-?\d+/g) || [];
  const N = nums.length >> 1;
  const template = new TextEncoder().encode(
    svg.slice(0, m.index) + m[1] + PLACEHOLDER + m[3] + svg.slice(m.index + m[0].length)
  );

  // Worst case 5 bytes per varint (|residual| < 2^34).
  const out = new Uint8Array(12 + template.length + N * 2 * 5);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  dv.setUint32(4, template.length, true);
  out.set(template, 8);
  let o = 8 + template.length;
  dv.setUint32(o, N, true);
  o += 4;

  // Path is "M x0,y0 l dx,dy ..." — accumulate to absolute coordinates.
  let x = 0, y = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  for (let i = 0; i < N; i++) {
    x += +nums[i * 2];
    y += +nums[i * 2 + 1];
    const px = i === 0 ? 0 : i === 1 ? x1 : 2 * x1 - x2;
    const py = i === 0 ? 0 : i === 1 ? y1 : 2 * y1 - y2;
    for (const r of [x - px, y - py]) {
      let z = r >= 0 ? r * 2 : -r * 2 - 1;
      while (z >= 128) { out[o++] = (z % 128) | 128; z = Math.floor(z / 128); }
      out[o++] = z;
    }
    x2 = x1; y2 = y1; x1 = x; y1 = y;
  }
  return gzip(out.subarray(0, o));
}

// Accepts any stored groove: packed (SPG2), gzipped SVG, or plain SVG. Returns SVG text.
export async function unpackGroove(input) {
  let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
  if (isMagic(bytes, MAGIC3)) {
    const { template, xs, ys } = rebuildLossless(bytes);
    const parts = new Array(xs.length);
    for (let i = 0; i < xs.length; i++) parts[i] = i === 0 ? `M ${xs[0]},${ys[0]} l` : `${xs[i] - xs[i - 1]},${ys[i] - ys[i - 1]}`;
    return template.replace(PLACEHOLDER, parts.join(' '));
  }
  if (!MAGIC.every((b, i) => bytes[i] === b)) return new TextDecoder().decode(bytes);

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tLen = dv.getUint32(4, true);
  const template = new TextDecoder().decode(bytes.subarray(8, 8 + tLen));
  let o = 8 + tLen;
  const N = dv.getUint32(o, true);
  o += 4;

  const readVarint = () => {
    let z = 0, mul = 1, b;
    do { b = bytes[o++]; z += (b & 127) * mul; mul *= 128; } while (b & 128);
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  };

  const parts = new Array(N);
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  for (let i = 0; i < N; i++) {
    const px = i === 0 ? 0 : i === 1 ? x1 : 2 * x1 - x2;
    const py = i === 0 ? 0 : i === 1 ? y1 : 2 * y1 - y2;
    const x = px + readVarint();
    const y = py + readVarint();
    parts[i] = i === 0 ? `M ${x},${y} l` : `${x - x1},${y - y1}`;
    x2 = x1; y2 = y1; x1 = x; y1 = y;
  }
  return template.replace(PLACEHOLDER, parts.join(' '));
}

// Decodes stored groove bytes straight to coordinate arrays, without building the SVG text.
// Returns { header, xs, ys } (header = SVG minus path data), or { svgText } for legacy polyline grooves.
export async function unpackToCoords(input) {
  let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
  if (isMagic(bytes, MAGIC3)) {
    const { header, xs, ys, mid, side } = rebuildLossless(bytes);
    return { header, xs, ys, mid, side };
  }

  if (MAGIC.every((b, i) => bytes[i] === b)) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tLen = dv.getUint32(4, true);
    const header = new TextDecoder().decode(bytes.subarray(8, 8 + tLen));
    let o = 8 + tLen;
    const N = dv.getUint32(o, true);
    o += 4;
    // Master-quality grooves use coordinates beyond 32 bits.
    const Arr = /lossless=1/.test(header) ? Float64Array : Int32Array;
    const xs = new Arr(N), ys = new Arr(N);
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    for (let i = 0; i < N; i++) {
      const px = i === 0 ? 0 : i === 1 ? x1 : 2 * x1 - x2;
      const py = i === 0 ? 0 : i === 1 ? y1 : 2 * y1 - y2;
      // Inline zigzag varints (hot loop).
      let z = 0, mul = 1, b;
      do { b = bytes[o++]; z += (b & 127) * mul; mul *= 128; } while (b & 128);
      const x = px + (z % 2 === 0 ? z / 2 : -(z + 1) / 2);
      z = 0; mul = 1;
      do { b = bytes[o++]; z += (b & 127) * mul; mul *= 128; } while (b & 128);
      const y = py + (z % 2 === 0 ? z / 2 : -(z + 1) / 2);
      xs[i] = x; ys[i] = y;
      x2 = x1; y2 = y1; x1 = x; y1 = y;
    }
    return { header, xs, ys };
  }

  const svgText = new TextDecoder().decode(bytes);
  const loc = findPathData(svgText);
  if (!loc) return { svgText };
  const { xs, ys } = parsePathCoords(svgText, loc.dStart, loc.dEnd, /lossless=1/.test(loc.header) ? Float64Array : Int32Array);
  return { header: loc.header, xs, ys };
}
