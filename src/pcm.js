// Exact integer PCM from a lossless source file, for Master quality grooves.
// WAV and AIFF are parsed directly. FLAC goes through the browser decoder at the file's own
// sample rate (no resampling), then is checked to land exactly on the integer grid.
// Returns { left: Int32Array, right: Int32Array|null, sampleRate, bits }.

export class NotLosslessError extends Error {}

const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

function readInts(bytes, offset, frames, channels, bits, littleEndian) {
  const bps = bits / 8;
  const chans = Array.from({ length: channels }, () => new Int32Array(frames));
  let o = offset;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      let v;
      if (bits === 16) {
        v = littleEndian ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1];
        v = (v << 16) >> 16;
      } else {
        v = littleEndian
          ? bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16)
          : (bytes[o] << 16) | (bytes[o + 1] << 8) | bytes[o + 2];
        v = (v << 8) >> 8;
      }
      chans[c][i] = v;
      o += bps;
    }
  }
  return chans;
}

function pack(chans, sampleRate, bits) {
  if (chans.length > 2) throw new NotLosslessError('Master quality supports mono or stereo files.');
  return { left: chans[0], right: chans[1] || null, sampleRate, bits };
}

function parseWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 12, fmt = null;
  while (o + 8 <= bytes.length) {
    const id = ascii(bytes, o, 4), size = dv.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') {
      let format = dv.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = dv.getUint16(body + 24, true);
      fmt = { format, channels: dv.getUint16(body + 2, true), sampleRate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
    } else if (id === 'data') {
      if (!fmt) break;
      if (fmt.format !== 1 || (fmt.bits !== 16 && fmt.bits !== 24)) {
        throw new NotLosslessError('Master quality needs a 16- or 24-bit PCM file.');
      }
      const bytesAvail = Math.min(size, bytes.length - body);
      const frames = Math.floor(bytesAvail / (fmt.channels * fmt.bits / 8));
      return pack(readInts(bytes, body, frames, fmt.channels, fmt.bits, true), fmt.sampleRate, fmt.bits);
    }
    o = body + size + (size & 1);
  }
  throw new NotLosslessError('Could not read this WAV file.');
}

// 80-bit IEEE extended → number (AIFF sample rate).
function extended(dv, o) {
  const exp = dv.getUint16(o) & 0x7fff;
  const hi = dv.getUint32(o + 2), lo = dv.getUint32(o + 6);
  return (hi * 2 ** 32 + lo) * 2 ** (exp - 16383 - 63);
}

function parseAiff(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 8, 4) === 'AIFC') throw new NotLosslessError('Compressed AIFF isn\'t supported. Export as WAV or AIFF.');
  let o = 12, comm = null;
  while (o + 8 <= bytes.length) {
    const id = ascii(bytes, o, 4), size = dv.getUint32(o + 4), body = o + 8;
    if (id === 'COMM') {
      comm = { channels: dv.getUint16(body), frames: dv.getUint32(body + 2), bits: dv.getUint16(body + 6), sampleRate: Math.round(extended(dv, body + 8)) };
    } else if (id === 'SSND') {
      if (!comm) break;
      if (comm.bits !== 16 && comm.bits !== 24) throw new NotLosslessError('Master quality needs a 16- or 24-bit file.');
      const start = body + 8 + dv.getUint32(body);
      const frames = Math.min(comm.frames, Math.floor((bytes.length - start) / (comm.channels * comm.bits / 8)));
      return pack(readInts(bytes, start, frames, comm.channels, comm.bits, false), comm.sampleRate, comm.bits);
    }
    o = body + size + (size & 1);
  }
  throw new NotLosslessError('Could not read this AIFF file.');
}

async function decodeFlac(bytes) {
  // STREAMINFO: sample rate (20 bits) and bits per sample (5 bits) after the 4-byte block header.
  const s = 8;
  const sampleRate = (bytes[s + 10] << 12) | (bytes[s + 11] << 4) | (bytes[s + 12] >> 4);
  const channels = ((bytes[s + 12] >> 1) & 7) + 1;
  const bits = (((bytes[s + 12] & 1) << 4) | (bytes[s + 13] >> 4)) + 1;
  if (bits !== 16 && bits !== 24) throw new NotLosslessError('Master quality needs a 16- or 24-bit file.');
  const ctx = new OfflineAudioContext(channels, 1, sampleRate);
  const buf = await ctx.decodeAudioData(bytes.slice().buffer);
  if (buf.sampleRate !== sampleRate) throw new NotLosslessError('This browser resampled the file.');
  // Browsers hand back floats: s/2^(b-1), or s/(2^(b-1)-1) for positive samples (Chrome). Recover s and
  // require that it maps back to the exact float. Only reliable at 16-bit: 24-bit steps are finer than
  // float32 can tell apart near full scale.
  if (bits !== 16) throw new NotLosslessError('24-bit FLAC can\'t be read exactly in the browser. Export it as WAV or AIFF.');
  const full = 32768;
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const f = buf.getChannelData(c), out = new Int32Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const x = f[i];
      let v = Math.round(x * full);
      if (Math.fround(v / full) !== x || v >= full) {
        v = Math.round(x * (full - 1));
        if (Math.abs(Math.fround(v / (full - 1)) - x) > 2 ** -24) {
          throw new NotLosslessError('This browser can\'t decode the FLAC exactly. Export it as WAV or AIFF.');
        }
      }
      out[i] = v;
    }
    chans.push(out);
  }
  return pack(chans, sampleRate, bits);
}

export async function exactPCM(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = ascii(bytes, 0, 4);
  if (head === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return parseWav(bytes);
  if (head === 'FORM' && /^AIF[FC]$/.test(ascii(bytes, 8, 4))) return parseAiff(bytes);
  if (head === 'fLaC') return decodeFlac(bytes);
  throw new NotLosslessError('Master quality needs a lossless file: WAV, AIFF or 16-bit FLAC.');
}

// Integer PCM → WAV bytes at the original bit depth (Master-quality export).
export function wavBlob(intL, intR, sampleRate, bits) {
  const ch = intR ? 2 : 1, bps = bits / 8, N = intL.length;
  const buf = new ArrayBuffer(44 + N * ch * bps), dv = new DataView(buf), b = new Uint8Array(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + N * ch * bps, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * ch * bps, true);
  dv.setUint16(32, ch * bps, true); dv.setUint16(34, bits, true);
  str(36, 'data'); dv.setUint32(40, N * ch * bps, true);
  let o = 44;
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < ch; c++) {
      const v = c ? intR[i] : intL[i];
      b[o] = v & 255; b[o + 1] = (v >> 8) & 255;
      if (bps === 3) b[o + 2] = (v >> 16) & 255;
      o += bps;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}
