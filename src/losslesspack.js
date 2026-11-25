// "SPG3": storage for Master-quality grooves. The groove's vertices are a deterministic function of
// its integer samples (codec.losslessGeometry), so we store the samples, FLAC-style, and rebuild the
// exact same vertices on load. Samples: per 4096-sample block, the best fixed predictor (order 0–4)
// and a Rice parameter, then Rice-coded residuals.
//
// Layout: "SPG3" | u32 template length | template | u32 N | u8 channels |
//   per 4096-sample block: u32 byte length | mid block bits [| side block bits], byte-aligned
// Blocks are self-delimiting so a player can decode them as they download and start playing early.

export const MAGIC3 = [0x53, 0x50, 0x47, 0x33];
const BLOCK = 4096;
const ESC = 40; // unary run that signals a raw 32-bit escape

class BitWriter {
  constructor(n) { this.buf = new Uint8Array(n); this.o = 0; this.acc = 0; this.nb = 0; }
  _grow() { const b = new Uint8Array(this.buf.length * 2); b.set(this.buf); this.buf = b; }
  bits(v, n) { // n ≤ 24
    this.acc = this.acc * 2 ** n + v; this.nb += n;
    while (this.nb >= 8) {
      this.nb -= 8;
      const byte = Math.floor(this.acc / 2 ** this.nb);
      this.acc -= byte * 2 ** this.nb;
      if (this.o >= this.buf.length) this._grow();
      this.buf[this.o++] = byte;
    }
  }
  big(v, n) { while (n > 24) { n -= 24; this.bits(Math.floor(v / 2 ** n) % 2 ** 24, 24); } this.bits(v % 2 ** n, n); }
  unary(q) { while (q >= 24) { this.bits(0xffffff, 24); q -= 24; } this.bits((2 ** q - 1) * 2, q + 1); }
  finish() { if (this.nb) this.bits(0, 8 - this.nb); return this.buf.subarray(0, this.o); }
}

class BitReader {
  constructor(buf, o) { this.buf = buf; this.o = o; this.cur = 0; this.nb = 0; }
  _fill() {
    while (this.nb <= 24) { this.cur = ((this.cur << 8) | (this.o < this.buf.length ? this.buf[this.o] : 0)) >>> 0; this.o++; this.nb += 8; }
  }
  _take(n) { // n ≤ 24
    this._fill();
    this.nb -= n;
    const v = (this.cur >>> this.nb) & ((1 << n) - 1);
    this.cur &= (1 << this.nb) - 1;
    return v;
  }
  bits(n) { let v = 0; while (n > 24) { n -= 24; v = v * 2 ** 24 + this._take(24); } return v * 2 ** n + this._take(n); }
  unary() {
    let q = 0;
    for (;;) {
      this._fill();
      const ones = Math.clz32(~((this.cur << (32 - this.nb)) >>> 0));
      if (ones < this.nb) { q += ones; this.nb -= ones + 1; this.cur &= (1 << this.nb) - 1; return q; }
      q += this.nb; this.nb = 0; this.cur = 0;
    }
  }
}

const residual = (a, i, o) => {
  if (o > i) o = i;
  switch (o) {
    case 0: return a[i];
    case 1: return a[i] - a[i - 1];
    case 2: return a[i] - 2 * a[i - 1] + a[i - 2];
    case 3: return a[i] - 3 * a[i - 1] + 3 * a[i - 2] - a[i - 3];
    default: return a[i] - 4 * a[i - 1] + 6 * a[i - 2] - 4 * a[i - 3] + a[i - 4];
  }
};
const zig = r => (r >= 0 ? 2 * r : -2 * r - 1);

function encodeBlock(w, a, s, e) {
  const n = e - s, z = new Float64Array(n);
  let best = null;
  for (let o = 0; o <= 4; o++) {
    let sum = 0;
    for (let i = s; i < e; i++) sum += zig(residual(a, i, o));
    if (!best || sum < best.sum) best = { o, sum };
  }
  for (let i = s; i < e; i++) z[i - s] = zig(residual(a, i, best.o));
  const k0 = Math.max(0, Math.floor(Math.log2(best.sum / n + 1)));
  let k = k0, kCost = Infinity;
  for (let kk = Math.max(0, k0 - 1); kk <= Math.min(30, k0 + 1); kk++) {
    let c = 0;
    for (let j = 0; j < n; j++) c += Math.min(ESC, Math.floor(z[j] / 2 ** kk)) + 1 + kk;
    if (c < kCost) { kCost = c; k = kk; }
  }
  w.bits(best.o, 3); w.bits(k, 5);
  const m = 2 ** k;
  for (let j = 0; j < n; j++) {
    const q = Math.floor(z[j] / m);
    if (q >= ESC) { w.unary(ESC); w.big(z[j], 40); }
    else { w.unary(q); if (k) w.big(z[j] - q * m, k); }
  }
}

function decodeBlock(r, a, s, e) {
  const o = r.bits(3), k = r.bits(5), m = 2 ** k;
  for (let i = s; i < e; i++) {
    const q = r.unary();
    let d;
    if (q >= ESC) { const z = r.bits(40); d = z % 2 === 0 ? z / 2 : -(z + 1) / 2; }
    else { const z = k ? q * m + r.bits(k) : q; d = z < 2147483648 ? (z >>> 1) ^ -(z & 1) : (z % 2 === 0 ? z / 2 : -(z + 1) / 2); }
    const oo = o > i ? i : o; // only the very first samples lack history
    a[i] = (oo === 0 ? 0 : oo === 1 ? a[i - 1] : oo === 2 ? 2 * a[i - 1] - a[i - 2]
      : oo === 3 ? 3 * a[i - 1] - 3 * a[i - 2] + a[i - 3] : 4 * a[i - 1] - 6 * a[i - 2] + 4 * a[i - 3] - a[i - 4]) + d;
  }
}

export function packSamples(template, mid, side) {
  const t = new TextEncoder().encode(template), N = mid.length;
  const parts = [];
  let total = 13 + t.length;
  for (let s = 0; s < N; s += BLOCK) {
    const e = Math.min(N, s + BLOCK);
    const w = new BitWriter((e - s) * (side ? 8 : 4) + 64);
    encodeBlock(w, mid, s, e);
    if (side) encodeBlock(w, side, s, e);
    const b = w.finish();
    parts.push(b);
    total += 4 + b.length;
  }
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  out.set(MAGIC3, 0);
  dv.setUint32(4, t.length);
  out.set(t, 8);
  let o = 8 + t.length;
  dv.setUint32(o, N); out[o + 4] = side ? 2 : 1; o += 5;
  for (const b of parts) { dv.setUint32(o, b.length); out.set(b, o + 4); o += 4 + b.length; }
  return out;
}

// Incremental reader: push() bytes as they download; pump() decodes every complete block so far.
export function createSampleReader() {
  let buf = new Uint8Array(1 << 20), len = 0, pos = 0;
  const st = { template: null, N: 0, mid: null, side: null, decoded: 0, done: false };
  st.push = bytes => {
    if (len + bytes.length > buf.length) {
      const nb = new Uint8Array(Math.max(buf.length * 2, len + bytes.length));
      nb.set(buf.subarray(0, len)); buf = nb;
    }
    buf.set(bytes, len); len += bytes.length;
  };
  // Returns true if anything new was decoded (or the header arrived).
  st.pump = () => {
    let progressed = false;
    const dv = new DataView(buf.buffer, 0, len);
    if (!st.template) {
      if (len < 8) return false;
      if (!MAGIC3.every((b, i) => buf[i] === b)) throw new Error('Not an SPG3 groove');
      const tLen = dv.getUint32(4);
      if (len < 8 + tLen + 5) return false;
      st.template = new TextDecoder().decode(buf.subarray(8, 8 + tLen));
      st.N = dv.getUint32(8 + tLen);
      const channels = buf[8 + tLen + 4];
      st.mid = new Int32Array(st.N);
      st.side = channels === 2 ? new Int32Array(st.N) : null;
      pos = 8 + tLen + 5;
      progressed = true;
    }
    while (st.decoded < st.N && pos + 4 <= len) {
      const bLen = dv.getUint32(pos);
      if (pos + 4 + bLen > len) break;
      const s = st.decoded, e = Math.min(st.N, s + BLOCK);
      const r = new BitReader(buf.subarray(pos + 4, pos + 4 + bLen), 0);
      decodeBlock(r, st.mid, s, e);
      if (st.side) decodeBlock(r, st.side, s, e);
      st.decoded = e; pos += 4 + bLen; progressed = true;
    }
    if (st.decoded >= st.N) st.done = true;
    return progressed;
  };
  return st;
}

export function unpackSamples(bytes) {
  const rd = createSampleReader();
  rd.push(bytes);
  rd.pump();
  if (!rd.done) throw new Error('Groove file is truncated');
  return { template: rd.template, mid: rd.mid, side: rd.side };
}
