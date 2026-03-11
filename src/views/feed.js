import { supabase } from '../supabase.js';
import { navigate } from '../router.js';

export async function feedView() {
  document.getElementById('view').innerHTML = `
    <div class="feed-page">
      <h2 class="feed-title">Recent Records</h2>
      <div class="feed-grid" id="feedGrid">
        <div class="feed-loading">Loading...</div>
      </div>
    </div>`;

  if (!supabase) {
    document.getElementById('feedGrid').innerHTML =
      '<p class="feed-empty">Connect Supabase to see the feed.</p>';
    return;
  }

  const { data, error } = await supabase
    .from('records')
    .select('id, title, artist, duration, plays, created_at, thumbnail_path, users(username)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(24);

  const grid = document.getElementById('feedGrid');
  if (error) {
    console.error('Feed query error:', error);
    grid.innerHTML = `<p class="feed-empty">Failed to load records: ${error.message}</p>`;
    return;
  }
  if (!data?.length) {
    grid.innerHTML = '<p class="feed-empty">No records yet. Be the first to publish one from the studio!</p>';
    return;
  }

  grid.innerHTML = data.map(r => {
    const imagePath = r.thumbnail_path;
    const thumbUrl = imagePath
      ? supabase.storage.from('records').getPublicUrl(imagePath).data.publicUrl
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
        <div class="record-card-meta">${r.users?.username ? `@${esc(r.users.username)}` : ''} &middot; ${r.plays ?? 0} plays</div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.record-card').forEach(card =>
    card.addEventListener('click', () => navigate(`/r/${card.dataset.id}`))
  );
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
