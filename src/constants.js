export const TAU = Math.PI * 2;
export const MU = 255;
export const PREEMPH_COEFF = 0.97; // kept for decoding legacy SVGs (preemph=1 without riaa=1)
// Target effective sample rate per quality level. N = targetSr * duration, capped at QUALITY_VERTEX_CAP.
// This keeps audio bandwidth consistent regardless of song length (unlike a flat vertex count).
export const QUALITY_TARGET_SR = [6000, 8000, 11025, 16000, 44100];
export const MIN_PLAYBACK_RATE = 8000;
export const FADE_LEN_FRACTION = 0.005;
export const SPIN_SPEED = Math.PI; // TAU * 0.5 rad/s

// RIAA equalization
// RIAA_CORNER_HZ: legacy decode fallback (old SVGs without riaaHz= in desc)
// ENC_RIAA_CORNER_HZ: encoding shelf corner — 1 kHz covers the full 1–5 kHz presence region
//   compared to 2122 Hz which leaves 1–2 kHz exposed; at 22 kHz effective SR this is the range
//   that matters most for speech clarity and musical timbre.
export const RIAA_CORNER_HZ = 2122;
export const ENC_RIAA_CORNER_HZ = 1000;
export const RIAA_GAIN_DB = 20;

// 10000× integer SVG coordinates.
// At default k=5: 2×5×10000 = 100,000 discrete levels → ~96 dB SNR → 16-bit equivalent.
// Delta encoding keeps path data compact; gzip handles the larger integers efficiently.
export const COORD_SCALE = 10000;

export const DEFAULT_ROUT = 220;
export const DEFAULT_RIN = 40;
export const DEFAULT_CX = 260;
export const DEFAULT_CY = 260;
