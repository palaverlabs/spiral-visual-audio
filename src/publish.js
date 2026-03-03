import { supabase } from './supabase.js';
import { navigate } from './router.js';

export function renderPublishPanel(container, getGrooveSVG, getMetadata, getThumbBlob) {
  container.innerHTML = `
    <div class="publish-panel">
      <div class="publish-toggle" id="publishToggle">
        <span>Publish to Collection</span>
        <span class="publish-chevron">&#9660;</span>
      </div>
      <div class="publish-form" id="publishForm" hidden>
        <input type="text" id="publishTitle" placeholder="Title (required)" maxlength="100">
        <input type="text" id="publishArtist" placeholder="Artist / tag (optional)" maxlength="100">
        <input type="number" id="publishEdition" placeholder="Edition size (leave blank for unlimited)" min="1" step="1">
        <label class="publish-public-row">
          <input type="checkbox" id="publishPublic" checked>
          <span>Public</span>
        </label>
        <div class="status-line info" id="publishStatus"></div>
        <button class="action-btn" id="publishBtn">PUBLISH</button>
      </div>
    </div>`;

  document.getElementById('publishToggle').addEventListener('click', () => {
    const form = document.getElementById('publishForm');
    const chevron = document.querySelector('.publish-chevron');
    const open = form.hasAttribute('hidden');
    form.toggleAttribute('hidden', !open);
    chevron.textContent = open ? '▲' : '▼';
  });

  document.getElementById('publishBtn').addEventListener('click', async () => {
    const setStatus = (msg, type = 'info') => {
      const el = document.getElementById('publishStatus');
      el.textContent = msg;
      el.className = `status-line ${type}`;
    };

    if (!supabase) { setStatus('Supabase not configured.', 'error'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus('Sign in to publish.', 'error'); navigate('/auth'); return; }

    const title = document.getElementById('publishTitle').value.trim();
    if (!title) { setStatus('Title is required.', 'error'); return; }

    const svg = getGrooveSVG();
    if (!svg) { setStatus('Generate a groove first.', 'error'); return; }

    const btn = document.getElementById('publishBtn');
    btn.disabled = true;
    btn.textContent = 'UPLOADING...';
    setStatus('Uploading...');

    try {
      const recordId = crypto.randomUUID();
      const filePath = `${user.id}/${recordId}.svg`;
      const raw = new TextEncoder().encode(svg);
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      writer.write(raw);
      writer.close();
      const compressed = await new Response(cs.readable).arrayBuffer();
      const blob = new Blob([compressed], { type: 'image/svg+xml' });

      setStatus(`Uploading ${(blob.size / 1024 / 1024).toFixed(1)} MB...`);
      const { error: uploadError } = await supabase.storage
        .from('records')
        .upload(filePath, blob, { contentType: 'image/svg+xml' });
      if (uploadError) throw uploadError;

      let thumbPath = null;
      if (getThumbBlob) {
        try {
          const thumbBlob = await getThumbBlob();
          thumbPath = `${user.id}/${recordId}_thumb.jpg`;
          await supabase.storage.from('records').upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' });
        } catch (_) { thumbPath = null; }
      }

      const meta = getMetadata();
      const { error: insertError } = await supabase.from('records').insert({
        id: recordId,
        user_id: user.id,
        title,
        artist: document.getElementById('publishArtist').value.trim() || null,
        duration: meta?.duration ?? null,
        quality: meta?.quality ?? null,
        turns: meta?.turns ?? null,
        sample_rate: meta?.sampleRate ?? null,
        stereo: meta?.stereo ?? false,
        file_path: filePath,
        file_size: blob.size,
        is_public: document.getElementById('publishPublic').checked,
        edition_size: parseInt(document.getElementById('publishEdition').value) || null,
        thumbnail_path: thumbPath,
      });
      if (insertError) throw insertError;

      navigate(`/r/${recordId}`);
    } catch (err) {
      document.getElementById('publishStatus').className = 'status-line error';
      document.getElementById('publishStatus').textContent = `Publish failed: ${err.message}`;
      btn.disabled = false;
      btn.textContent = 'PUBLISH';
    }
  });
}
