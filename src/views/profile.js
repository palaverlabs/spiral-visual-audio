import { supabase } from '../supabase.js';
import { navigate } from '../router.js';

export async function profileView({ username }) {
  document.getElementById('view').innerHTML = `
    <div class="profile-page">
      <div class="profile-header">
        <div class="profile-avatar"></div>
        <div>
          <h2>@${esc(username)}</h2>
          <p class="profile-bio" id="profileBio"></p>
        </div>
      </div>
      <div class="feed-grid" id="profileGrid">
        <div class="feed-loading">Loading...</div>
      </div>
      <div id="profileCollection"></div>
    </div>`;

  if (!supabase) return;

  const { data: user } = await supabase
    .from('users')
    .select('id, username, bio')
    .eq('username', username)
    .single();

  if (!user) {
    document.getElementById('view').innerHTML =
      '<p style="color:#888;padding:40px;text-align:center">User not found</p>';
    return;
  }

  if (user.bio) document.getElementById('profileBio').textContent = user.bio;

  const { data: records } = await supabase
    .from('records')
    .select('id, title, artist, plays, created_at, thumbnail_path')
    .eq('user_id', user.id)
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  const grid = document.getElementById('profileGrid');
  if (!records?.length) {
    grid.innerHTML = '<p class="feed-empty">No public records yet.</p>';
    return;
  }

  grid.innerHTML = records.map(r => {
    const thumbUrl = r.thumbnail_path
      ? supabase.storage.from('records').getPublicUrl(r.thumbnail_path).data.publicUrl
      : null;
    const vinyl = thumbUrl
      ? `<img class="record-card-vinyl" src="${thumbUrl}" alt="">`
      : `<div class="record-card-vinyl"></div>`;
    return `
    <div class="record-card" data-id="${r.id}">
      ${vinyl}
      <div class="record-card-info">
        <div class="record-card-title">${esc(r.title)}</div>
        ${r.artist ? `<div class="record-card-artist">${esc(r.artist)}</div>` : ''}
        <div class="record-card-meta">${r.plays ?? 0} plays</div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.record-card').forEach(card =>
    card.addEventListener('click', () => navigate(`/r/${card.dataset.id}`))
  );

  // Collection section
  const { data: collected } = await supabase
    .from('collections')
    .select('edition_number, records(id, title, artist, plays, edition_size, thumbnail_path)')
    .eq('user_id', user.id)
    .order('collected_at', { ascending: false });

  if (collected?.length) {
    const collectionEl = document.getElementById('profileCollection');
    collectionEl.innerHTML = `<h3 class="profile-section-heading">Collection</h3>
      <div class="feed-grid" id="collectionGrid"></div>`;

    document.getElementById('collectionGrid').innerHTML = collected.map(c => {
      const r = c.records;
      const thumbUrl = r.thumbnail_path
        ? supabase.storage.from('records').getPublicUrl(r.thumbnail_path).data.publicUrl
        : null;
      const vinyl = thumbUrl
        ? `<img class="record-card-vinyl" src="${thumbUrl}" alt="">`
        : `<div class="record-card-vinyl"></div>`;
      return `<div class="record-card" data-id="${r.id}">
        ${vinyl}
        <div class="record-card-info">
          <div class="record-card-title">${esc(r.title)}</div>
          ${r.artist ? `<div class="record-card-artist">${esc(r.artist)}</div>` : ''}
          <div class="record-card-meta">#${c.edition_number} of ${r.edition_size} · ${r.plays ?? 0} plays</div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('collectionGrid').querySelectorAll('.record-card').forEach(card =>
      card.addEventListener('click', () => navigate(`/r/${card.dataset.id}`))
    );
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
