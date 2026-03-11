# Spiral Visual Audio

A social platform for encoding audio into vinyl-like spiral SVGs and sharing them. The grooves *are* the audio — no hidden metadata, no sidecar data.

## What It Is

Upload an audio file → it gets encoded into a spiral groove SVG that looks like a vinyl record cross-section. Anyone with the SVG can play it back. Records can be published to a shared feed, liked, commented on, and downloaded.

## How Encoding Works

### Audio → SVG
1. Mono downmix
2. Pre-emphasis filter (0.97 coefficient, boosts highs)
3. Anti-alias lowpass filter (Blackman-windowed sinc)
4. Decimation to target vertex count
5. Mu-law compression (µ=255)
6. Map to Archimedean spiral geometry
7. TPDF dithering before coordinate quantization

### SVG → Audio
1. Parse polyline coordinates
2. Extract radial displacements from the base spiral
3. Mu-law expansion
4. De-emphasis (restores frequency balance)
5. Reconstruction lowpass (Gaussian smoothing)
6. Cubic interpolation for length restoration
7. DC offset removal, peak normalization, fade in/out
8. Upsample to 8000 Hz minimum for browser compatibility

Encoding parameters (`mulaw`, `preemph`, groove sensitivity `k`) are stored in the SVG `<desc>` element so the decoder is exact. Older SVGs without these flags are handled gracefully.

## Studio Controls

| Control | Range | Default |
|---------|-------|---------|
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

## Running Locally

```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm start
```

Opens on `http://localhost:3001`. Requires Node.js 18+.

The app works without Supabase credentials — the studio and local playback function fully offline. Publishing and the social feed require a Supabase project.

## Stack

- Vite + vanilla ES modules (no framework)
- Supabase (auth, database, storage)
- Canvas API for visualizer rendering
- pushState SPA router (no library)

## Project Structure

```
src/
  main.js          — entry point, router init
  router.js        — pushState SPA router
  supabase.js      — Supabase client
  codec.js         — encodeToSVG / decodeFromSVG
  renderer.js      — canvas visualizer (Renderer class)
  playback.js      — PlaybackManager
  skin.js          — SkinManager + skin definitions
  publish.js       — publish panel (upload + metadata)
  constants.js     — shared geometry constants
  style.css        — all colors via CSS custom properties
  views/
    studio.js      — main encode/decode/playback view
    feed.js        — public record feed
    record.js      — single record page
    profile.js     — user profile
    auth.js        — sign in / sign up
```
