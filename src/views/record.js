import { supabase } from '../supabase.js';
import { navigate } from '../router.js';

export async function recordView({ id }) {
  document.getElementById('view').innerHTML = `
    <div class="record-page">
      <div class="record-hero">
        <div class="record-disc-wrap">
          <canvas id="recordCanvas" width="1000" height="1000"></canvas>
        </div>
      </div>
      <div class="record-info">
        <div class="status-line info" id="recordStatus">Loading record...</div>
        <h1 id="recordTitle"></h1>
        <div class="record-artist" id="recordArtist"></div>
        <div class="record-meta" id="recordMeta"></div>
        <div class="record-transport">
          <div class="play-wrap" id="recordPlayWrap">
            <div class="play-ring"></div>
            <button class="play-btn" id="recordPlayBtn" disabled>&#9654;</button>
          </div>
          <span class="time-display">
            <span id="recordCurrentTime">0:00</span>
            <span class="t-sep"> / </span>
            <span id="recordTotalTime">0:00</span>
          </span>
        </div>
      </div>
    </div>`;

  const setStatus = (msg, type = 'info') => {
    const el = document.getElementById('recordStatus');
    if (el) { el.textContent = msg; el.className = `status-line ${type}`; }
  };

  if (!supabase) { setStatus('Supabase not configured.', 'error'); return; }

  const { data: record, error } = await supabase
    .from('records')
    .select('*, users(username)')
    .eq('id', id)
    .single();

  if (error || !record) { setStatus('Record not found.', 'error'); return; }

  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  document.getElementById('recordTitle').textContent = record.title;
  document.getElementById('recordArtist').textContent = record.artist || '';
  document.getElementById('recordMeta').textContent = [
    record.users?.username ? `@${record.users.username}` : '',
    record.duration ? fmt(record.duration) : '',
    `${record.plays ?? 0} plays`,
  ].filter(Boolean).join(' · ');

  const { data: urlData } = supabase.storage.from('records').getPublicUrl(record.file_path);
  const svgUrl = urlData?.publicUrl;
  if (!svgUrl) { setStatus('Could not resolve file URL.', 'error'); return; }

  setStatus('Fetching groove...');

  try {
    const resp = await fetch(svgUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const svgText = await resp.text();

    const [
      { decodeFromSVG },
      { Renderer },
      { PlaybackManager },
      { SkinManager, SKINS },
      { DEFAULT_ROUT, DEFAULT_RIN, DEFAULT_CX, DEFAULT_CY, SPIN_SPEED },
    ] = await Promise.all([
      import('../codec.js'),
      import('../renderer.js'),
      import('../playback.js'),
      import('../skin.js'),
      import('../constants.js'),
    ]);

    const geom = { Rout: DEFAULT_ROUT, Rin: DEFAULT_RIN, cx: DEFAULT_CX, cy: DEFAULT_CY };
    const result = decodeFromSVG(svgText, geom);
    geom.Rout = result.Rout; geom.Rin = result.Rin; geom.cx = result.cx; geom.cy = result.cy;
    const duration = result.samples.length / result.sampleRate;

    document.getElementById('recordTotalTime').textContent = fmt(duration);
    setStatus('Ready', 'success');

    const skinMgr = new SkinManager();
    const skin = skinMgr.restore() || SKINS.owl;
    if (!skinMgr.restore()) skinMgr.apply(skin);

    const renderer = new Renderer(document.getElementById('recordCanvas'));
    renderer.setSkin(skin.canvas);
    renderer.preRenderGroove(result.groovePoints, geom);
    renderer.drawDiscWithGroove(0, -1, geom);

    let discRotation = 0, scrubProgress = 0, spinRate = 0, isStopping = false;
    let lastFrameTime = performance.now();

    const playback = new PlaybackManager({
      onFrame: ({ progress, audioTimePosition, amplitude = 0 }) => {
        const now = performance.now();
        const dt = (now - lastFrameTime) / 1000;
        lastFrameTime = now;

        if (isStopping) {
          spinRate = Math.max(0, spinRate - 0.7 * dt);
          playback.setRate(spinRate);
          discRotation += dt * SPIN_SPEED * spinRate;
          if (spinRate === 0) { isStopping = false; playback.stop(); return; }
        } else {
          spinRate = Math.min(1, spinRate + 1.5 * dt);
          discRotation += dt * SPIN_SPEED * spinRate;
          playback.setRate(spinRate);
        }

        scrubProgress = progress;
        renderer.drawDiscWithGroove(discRotation, scrubProgress, geom, amplitude, playback.getFrequencyData());
        const el = document.getElementById('recordCurrentTime');
        if (el) el.textContent = fmt(audioTimePosition);
      },
      onStop: () => {
        const btn = document.getElementById('recordPlayBtn');
        const wrap = document.getElementById('recordPlayWrap');
        if (btn) btn.textContent = '▶';
        if (wrap) wrap.classList.remove('playing');
      },
      onDebug: () => {},
    });

    const btn = document.getElementById('recordPlayBtn');
    btn.disabled = false;
    btn.addEventListener('click', async () => {
      if (playback.isPlaying || isStopping) {
        isStopping = true;
        btn.textContent = '▶';
        document.getElementById('recordPlayWrap')?.classList.remove('playing');
      } else {
        playback.unlock();
        btn.textContent = '⏸';
        document.getElementById('recordPlayWrap')?.classList.add('playing');
        spinRate = 0; isStopping = false;
        await playback.start(
          { left: result.samples, right: result.samplesR || null, sampleRate: result.sampleRate },
          0, scrubProgress
        );
        lastFrameTime = performance.now();
      }
    });

    // Increment play count (fire-and-forget)
    supabase.from('records').update({ plays: (record.plays ?? 0) + 1 }).eq('id', id);

    return () => playback.stop();
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, 'error');
  }
}
