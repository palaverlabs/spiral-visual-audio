# Visual Audio Groove Codec

A single-page web app that converts audio files into visual spiral representations — like vinyl record grooves — stored as SVG. The encoded SVGs can be played back by reading the spiral geometry.

Audio is encoded purely into the geometric shape of the spiral. No hidden metadata or sidecar data is stored in the SVG. The wiggles in the spiral *are* the audio.

## How It Works

### Encoding (audio → SVG)
1. Mono downmix
2. Pre-emphasis filter (0.97 coefficient, boosts highs)
3. Anti-alias lowpass filter (Blackman-windowed sinc)
4. Decimation to target vertex count
5. Mu-law compression (µ=255)
6. Map to Archimedean spiral geometry
7. TPDF dithering before coordinate quantization

### Decoding (SVG → audio)
1. Parse polyline coordinates
2. Extract radial displacements from the base spiral
3. Mu-law expansion
4. De-emphasis (restores frequency balance)
5. Reconstruction lowpass (Gaussian smoothing)
6. Cubic interpolation for length restoration
7. DC offset removal, peak normalization, fade in/out
8. Upsample to 8000 Hz minimum for browser compatibility

## Controls

| Slider | Range | Default |
|--------|-------|---------|
| Quality | 1–5 | 3 |
| Spiral Turns | 3–80 | 30 |
| Groove Sensitivity | 1–10 | 5 |
| Playback Speed | 0.25×–2× | 1× |

## File Size Estimates (2-minute song, 44100 Hz source)

| Quality | Vertices | SVG Size |
|---------|----------|----------|
| 1 | ~200K | ~2.9 MB |
| 2 | ~500K | ~7.2 MB |
| 3 | ~1M | ~14.3 MB |
| 4 | ~1.5M | ~21.5 MB |
| 5 | ~2M | ~28.6 MB |

## SVG Format

Encoding parameters are stored in the `<desc>` element for accurate decoding:
- `mulaw=1` — mu-law companding was applied
- `preemph=1` — pre-emphasis was applied
- `k` value (groove sensitivity) — stored exactly so the decoder doesn't need to estimate it

Older SVGs without these flags are handled gracefully.

## Visualizer

Canvas-based rendering of the vinyl disc with:
- Spinning disc animation during playback
- Radial gradient, purple label, center spindle
- Fixed light sheen simulating reflection
- Red glowing stylus with rotation offset

## Running Locally

```bash
npm start
```

Opens on `http://localhost:3001`. Requires Node.js 18+.

## Files

- `index.html` — Full application (HTML + CSS + JS, single file)
- `server.js` — Simple Node.js static file server
- `spiral_visual_audio_enhanced-3_GEO_PATCHED_2.html` — Earlier standalone build
