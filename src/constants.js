export const TAU = Math.PI * 2;
export const MU = 255;
export const PREEMPH_COEFF = 0.97; // kept for decoding legacy SVGs (preemph=1 without riaa=1)
export const QUALITY_MAX_POINTS = [200000, 500000, 1000000, 1500000, 2000000];
export const MIN_PLAYBACK_RATE = 8000;
export const FADE_LEN_FRACTION = 0.005;
export const SPIN_SPEED = Math.PI; // TAU * 0.5 rad/s

// RIAA equalization — matches the τ3 time constant (75µs = 2122 Hz shelf corner)
// Recording: +20 dB treble boost (highs survive coordinate quantization)
// Playback:  −20 dB treble cut (restores flat response, cuts quantization noise with it)
export const RIAA_CORNER_HZ = 2122;
export const RIAA_GAIN_DB = 20;

export const DEFAULT_ROUT = 220;
export const DEFAULT_RIN = 40;
export const DEFAULT_CX = 260;
export const DEFAULT_CY = 260;
