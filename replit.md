# Visual Audio Groove Codec

## Overview
A single-page web app that converts audio files into visual spiral representations (like vinyl record grooves) in SVG format, and can play audio back by reading the spiral geometry.

Audio is encoded purely into the geometric shape of the spiral — no hidden metadata or sidecar data is stored in the SVG. The wiggles in the spiral *are* the audio.

## Architecture
- `index.html` — Full application (HTML + CSS + JS, single file)
- `server.js` — Simple Node.js static file server on port 5000

## Key Design Decisions
- Geometry-only encoding: audio stored as spiral polyline coordinates, decoded by measuring radial displacement from the base spiral path
- Quality slider controls max vertex count: Q1=200K, Q2=500K, Q3=1M, Q4=1.5M, Q5=2M
- Target: ~1:1 file size ratio with source WAV at quality 5
- No metadata/sidecar audio data in SVGs — k value, effective sample rate stored in `<desc>` for accurate decoding
- Exact k (sensitivity) value stored in SVG so decoder doesn't need to estimate it
- Decoder falls back to k estimation for older SVGs without stored k
- Playback upsamples to 8000 Hz minimum for browser compatibility
- Coordinate precision: 3 decimal places (toFixed(3))
- Single-file frontend for simplicity
- Anti self-intersection guard: k limited to 45% of groove spacing
- Default settings: quality 3, turns 30, sensitivity 5

## Audio Processing Pipeline
### Encoder (audio → SVG)
1. Mono downmix
2. Pre-emphasis (0.97 coefficient, boosts high frequencies)
3. Anti-alias lowpass filter (Blackman-windowed sinc)
4. Decimation to target vertex count
5. Mu-law compression (mu=255)
6. Map to spiral geometry
7. TPDF dithering before coordinate quantization (toFixed(2))

### Decoder (SVG → audio)
1. Parse polyline coordinates
2. Extract radial displacements
3. Mu-law expansion (if mulaw=1 flag)
4. De-emphasis (if preemph=1 flag, restores frequency balance)
5. Reconstruction lowpass (Gaussian, radius 3, smooths quantization noise)
6. Cubic interpolation for length restoration
7. DC offset removal
8. Peak normalization
9. Fade in/out (prevents clicks)
10. Upsample to 8000 Hz minimum (cubic interpolation)

### SVG Desc Flags
- `mulaw=1` — mu-law companding was applied (decoder should expand)
- `preemph=1` — pre-emphasis was applied (decoder should de-emphasize)
- Older SVGs without flags are handled gracefully (skip those steps)

## Slider Ranges
- Quality: 1-5 (default 3) — controls max vertices (100K-1M)
- Spiral Turns: 3-80 (default 30)
- Groove Sensitivity: 1-10 (default 5)
- Playback Speed: 0.25x-2x (default 1x)

## File Size Estimates (2-minute song, 44100 Hz)
- Quality 1: ~200K pts → ~2.9 MB
- Quality 2: ~500K pts → ~7.2 MB
- Quality 3: ~1M pts → ~14.3 MB
- Quality 4: ~1.5M pts → ~21.5 MB
- Quality 5: ~2M pts → ~28.6 MB

## Visualizer
- Canvas-based rendering replaces SVG DOM injection for performance
- Pre-rendered offscreen canvas for groove lines (avoids redrawing millions of points per frame)
- Vinyl disc with radial gradient, purple label with "VAGC" text, center spindle
- Light sheen effect stays fixed while disc rotates (simulates light reflection)
- Spinning disc animation during playback (TAU * 0.5 rad/s)
- Red glowing stylus with white center dot, drawn in screen space with rotation offset
- groovePoints (Float32Array) stored alongside grooveSVG for canvas rendering

## Recent Changes
- 2026-02-17: Migrated visualizer from SVG DOM to Canvas 2D with spinning disc and glow effects
- 2026-02-17: Added pre-emphasis/de-emphasis filters, TPDF dithering, and reconstruction lowpass filter
- 2026-02-17: Added player-side DC offset removal, peak normalization, fade in/out
- 2026-02-17: Added anti-aliasing lowpass filter, mu-law companding, cubic interpolation
- 2026-02-17: Adjusted quality slider to target ~10 MB for 2-min songs; max vertices 100K-1M range
- 2026-02-17: Added playback upsampling for low effective sample rates
- 2026-02-17: Fixed 76 MB file size issue — added quality-based downsampling; geometry-only encoding preserved
- 2026-02-13: Merged geometry-only patch into main codebase, removed legacy metadata-based encoding
