import { supabase } from '../supabase.js';
import { navigate } from '../router.js';

const SVG_PLAY = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`;
const SVG_PAUSE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>`;

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
            <button class="play-btn" id="recordPlayBtn" disabled></button>
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
    .select('*, users(username), cover_path, description, album, genre')
    .eq('id', id)
    .single();

  if (error || !record) { setStatus('Record not found.', 'error'); return; }

  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Cover art
  if (record.cover_path) {
    const coverUrl = supabase.storage.from('records').getPublicUrl(record.cover_path).data.publicUrl;
    const coverEl = document.createElement('img');
    coverEl.className = 'record-cover-art';
    coverEl.src = coverUrl;
    coverEl.alt = record.title;
    document.getElementById('recordTitle').before(coverEl);
  }

  document.getElementById('recordTitle').textContent = record.title;
  document.getElementById('recordArtist').textContent = [record.artist, record.album].filter(Boolean).join(' — ');
  document.getElementById('recordMeta').textContent = [
    record.users?.username ? `@${record.users.username}` : '',
    record.genre || '',
    record.duration ? fmt(record.duration) : '',
    `${record.plays ?? 0} plays`,
  ].filter(Boolean).join(' · ');

  if (record.description) {
    const descEl = document.createElement('p');
    descEl.className = 'record-description';
    descEl.textContent = record.description;
    document.getElementById('recordMeta').after(descEl);
  }

  // Show delete button if current user owns this record
  const { data: { user } = {} } = await supabase.auth.getUser().catch(() => ({ data: {} }));
  if (user && user.id === record.user_id) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn record-delete-btn';
    deleteBtn.textContent = 'Delete record';
    document.getElementById('recordMeta').after(deleteBtn);
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this record? This cannot be undone.')) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';
      try {
        await supabase.storage.from('records').remove([record.file_path]);
        const { error: delErr } = await supabase.from('records').delete().eq('id', id);
        if (delErr) throw delErr;
        navigate('/');
      } catch (err) {
        setStatus(`Delete failed: ${err.message}`, 'error');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete record';
      }
    });
  }

  // Edition UI
  if (record.edition_size) {
    const editionEl = document.createElement('div');
    editionEl.className = 'record-edition';
    editionEl.id = 'recordEdition';
    document.getElementById('recordMeta').after(editionEl);

    const renderEdition = async () => {
      const { count: claimed } = await supabase
        .from('collections')
        .select('*', { count: 'exact', head: true })
        .eq('record_id', id);

      const soldOut = claimed >= record.edition_size;
      let html = `<span class="edition-label">Edition of ${record.edition_size} · ${claimed} claimed</span>`;
      if (soldOut) {
        html += ` <span class="edition-badge sold-out">Sold Out</span>`;
      }

      if (user) {
        const { data: owned } = await supabase
          .from('collections')
          .select('edition_number')
          .eq('record_id', id)
          .eq('user_id', user.id)
          .single();

        if (owned) {
          html += ` <span class="edition-badge owned">You own #${owned.edition_number}</span>`;
        } else if (!soldOut) {
          html += ` <button class="action-btn edition-collect-btn" id="collectBtn">Collect</button>`;
        }
      } else if (!soldOut) {
        html += ` <span class="edition-sign-in"><a href="/auth">Sign in</a> to collect</span>`;
      }

      editionEl.innerHTML = html;

      const collectBtn = document.getElementById('collectBtn');
      if (collectBtn) {
        collectBtn.addEventListener('click', async () => {
          collectBtn.disabled = true;
          collectBtn.textContent = 'Collecting...';
          const { data: num, error: claimErr } = await supabase.rpc('claim_edition', { p_record_id: id });
          if (claimErr) {
            collectBtn.disabled = false;
            collectBtn.textContent = 'Collect';
            setStatus(claimErr.message.includes('Sold out') ? 'Sold out!' : `Failed: ${claimErr.message}`, 'error');
          } else {
            await renderEdition();
          }
        });
      }
    };

    await renderEdition();
  }

  const { data: urlData } = supabase.storage.from('records').getPublicUrl(record.file_path);
  const svgUrl = urlData?.publicUrl;
  if (!svgUrl) { setStatus('Could not resolve file URL.', 'error'); return; }

  setStatus('Fetching groove...');

  try {
    const resp = await fetch(svgUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const isGzip = new Uint8Array(buf, 0, 2)[0] === 0x1f && new Uint8Array(buf, 0, 2)[1] === 0x8b;
    let svgText;
    if (isGzip) {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(new Uint8Array(buf));
      writer.close();
      svgText = await new Response(ds.readable).text();
    } else {
      svgText = new TextDecoder().decode(buf);
    }

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
        const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
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
        if (btn) btn.innerHTML = SVG_PLAY;
        if (wrap) wrap.classList.remove('playing');
      },
      onDebug: () => {},
    });

    const btn = document.getElementById('recordPlayBtn');
    btn.disabled = false;
    btn.innerHTML = SVG_PLAY;
    btn.addEventListener('click', async () => {
      if (playback.isPlaying || isStopping) {
        isStopping = true;
        btn.innerHTML = SVG_PLAY;
        document.getElementById('recordPlayWrap')?.classList.remove('playing');
      } else {
        playback.unlock();
        btn.innerHTML = SVG_PAUSE;
        document.getElementById('recordPlayWrap')?.classList.add('playing');
        spinRate = 0; isStopping = false;
        await playback.start(
          { left: result.samples, right: result.samplesR || null, sampleRate: result.sampleRate },
          0, scrubProgress
        );
        lastFrameTime = performance.now();
      }
    });

    // Resume AudioContext when screen wakes / tab becomes visible
    const onVisibility = () => {
      if (document.visibilityState === 'visible') playback.resumeIfSuspended();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // MediaSession: tells the OS this is a media-playing page (lock screen controls)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: record.title,
        artist: record.artist || (record.users?.username ? `@${record.users.username}` : 'Spiral Audio'),
        album: 'Spiral Audio',
      });
      navigator.mediaSession.setActionHandler('play', () => btn.click());
      navigator.mediaSession.setActionHandler('pause', () => btn.click());
    }

    // Increment play count atomically (SECURITY DEFINER bypasses RLS so any visitor counts)
    supabase.rpc('increment_plays', { record_id: id });

    return () => {
      playback.stop();
      document.removeEventListener('visibilitychange', onVisibility);
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    };
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, 'error');
  }
}
