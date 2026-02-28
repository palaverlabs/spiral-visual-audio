import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg = null;
let loadPromise = null;

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

async function _load() {
  if (ffmpeg?.loaded) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL:  await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL:  await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ffmpeg;
  })();

  return loadPromise;
}

// Transcode any file to a WAV ArrayBuffer via ffmpeg.wasm.
// onStatus(msg) is called with progress strings.
export async function transcodeToWav(file, onStatus) {
  onStatus?.('Loading FFmpeg (first use only)…');
  const ff = await _load();

  const ext = file.name.split('.').pop().toLowerCase() || 'bin';
  const inputName  = `input.${ext}`;

  onStatus?.('Transcoding…');
  await ff.writeFile(inputName, await fetchFile(file));
  await ff.exec(['-i', inputName, '-ar', '44100', '-ac', '2', '-f', 'wav', 'output.wav']);
  const data = await ff.readFile('output.wav');

  // Clean up virtual FS
  try { await ff.deleteFile(inputName); } catch (_) {}
  try { await ff.deleteFile('output.wav'); } catch (_) {}

  return data.buffer;
}
