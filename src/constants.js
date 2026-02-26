export const TAU = Math.PI * 2;
export const MU = 255;
export const PREEMPH_COEFF = 0.97; // kept for decoding legacy SVGs (preemph=1 without riaa=1)
// Target effective sample rate per quality level. N = targetSr * duration, capped at QUALITY_VERTEX_CAP.
// This keeps audio bandwidth consistent regardless of song length (unlike a flat vertex count).
export const QUALITY_TARGET_SR = [6000, 8000, 11025, 16000, 22050];
export const QUALITY_VERTEX_CAP = 2000000;
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

// 100× integer SVG coordinates.
// Radial precision: 0.01 units → ~14.7-bit linear amplitude resolution (vs ~11.8-bit at 3dp).
// File size: integer coords average 9–11 chars vs 13–17 for x.xxx,y.yyy → ~25% smaller.
export const COORD_SCALE = 100;

export const DEFAULT_ROUT = 220;
export const DEFAULT_RIN = 40;
export const DEFAULT_CX = 260;
export const DEFAULT_CY = 260;
