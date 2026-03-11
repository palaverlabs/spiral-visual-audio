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
        <div class="publish-cover-row">
          <div class="cover-upload-zone" id="coverZone" title="Click to upload cover art">
            <input type="file" id="coverInput" accept="image/*" hidden>
            <img id="coverPreview" class="cover-preview" hidden>
            <div class="cover-placeholder" id="coverPlaceholder">
              <span class="cover-plus">+</span>
              <span class="cover-hint">Cover Art</span>
            </div>
          </div>
          <div class="publish-fields">
            <input type="text" id="publishTitle" placeholder="Title (required)" maxlength="100">
            <input type="text" id="publishArtist" placeholder="Artist (required)" maxlength="100">
            <input type="text" id="publishAlbum" placeholder="Album (optional)" maxlength="100">
            <input type="text" id="publishGenre" placeholder="Genre (optional)" maxlength="60">
          </div>
        </div>
        <textarea id="publishDescription" placeholder="Description (optional)" maxlength="1000" rows="3"></textarea>
        <input type="number" id="publishEdition" placeholder="Edition size (required)" min="1" step="1">
        <label class="publish-public-row">
          <input type="checkbox" id="publishPublic" checked>
          <span>Public</span>
        </label>
        <div class="status-line info" id="publishStatus"></div>
        <button class="action-btn" id="publishBtn">PUBLISH</button>
      </div>
    </div>`;

  // Cover art picker
  const zone = document.getElementById('coverZone');
  const coverInput = document.getElementById('coverInput');
  const coverPreview = document.getElementById('coverPreview');
  const coverPlaceholder = document.getElementById('coverPlaceholder');
  let coverFile = null;

  zone.addEventListener('click', () => coverInput.click());
  coverInput.addEventListener('change', () => {
    const file = coverInput.files[0];
    if (!file) return;
    coverFile = file;
    const url = URL.createObjectURL(file);
    coverPreview.src = url;
    coverPreview.hidden = false;
    coverPlaceholder.hidden = true;
  });

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

    const artist = document.getElementById('publishArtist').value.trim();
    if (!artist) { setStatus('Artist is required.', 'error'); return; }

    const editionRaw = document.getElementById('publishEdition').value;
    const editionSize = parseInt(editionRaw);
    if (!editionRaw || isNaN(editionSize) || editionSize < 1) { setStatus('Edition size is required.', 'error'); return; }

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

      // Custom cover art — resize to 600x600 max before upload
      let coverPath = null;
      if (coverFile) {
        try {
          const resized = await resizeImage(coverFile, 600);
          coverPath = `${user.id}/${recordId}_cover.jpg`;
          await supabase.storage.from('records').upload(coverPath, resized, { contentType: 'image/jpeg' });
        } catch (_) { coverPath = null; }
      }

      // Auto-generated thumbnail (fallback if no custom cover)
      let thumbPath = null;
      if (!coverPath && getThumbBlob) {
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
        artist,
        album: document.getElementById('publishAlbum').value.trim() || null,
        genre: document.getElementById('publishGenre').value.trim() || null,
        description: document.getElementById('publishDescription').value.trim() || null,
        duration: meta?.duration ?? null,
        quality: meta?.quality ?? null,
        turns: meta?.turns ?? null,
        sample_rate: meta?.sampleRate ?? null,
        stereo: meta?.stereo ?? false,
        file_path: filePath,
        file_size: blob.size,
        is_public: document.getElementById('publishPublic').checked,
        edition_size: editionSize,
        cover_path: coverPath,
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

function resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('resize failed')), 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = url;
  });
}
