import { supabase } from '../supabase.js';
import { navigate } from '../router.js';

export async function libraryView() {
  document.getElementById('view').innerHTML = `
    <div class="library-page">
      <h2 class="feed-title">My Library</h2>
      <div id="libraryContent"><div class="feed-loading">Loading...</div></div>
    </div>`;

  if (!supabase) {
    document.getElementById('libraryContent').innerHTML =
      '<p class="feed-empty">Connect Supabase to use the library.</p>';
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById('libraryContent').innerHTML =
      `<p class="feed-empty"><a href="/auth" data-route="/auth">Sign in</a> to see your library.</p>`;
    return;
  }

  const [{ data: records }, { data: collected }] = await Promise.all([
    supabase.from('records')
      .select('id, title, artist, duration, plays, created_at, cover_path, thumbnail_path, is_public')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('collections')
      .select('edition_number, collected_at, records(id, title, artist, plays, edition_size, cover_path, thumbnail_path)')
      .eq('user_id', user.id)
      .order('collected_at', { ascending: false }),
  ]);

  let html = `<h3 class="profile-section-heading">My Records</h3>`;
  if (!records?.length) {
    html += `<p class="feed-empty">No records yet. <a href="/studio" data-route="/studio">Make something</a> in the studio.</p>`;
  } else {
    html += `<div class="feed-grid">${records.map(r => cardHtml(r, r.is_public ? null : 'Private')).join('')}</div>`;
  }

  const validCollected = collected?.filter(c => c.records) ?? [];
  if (validCollected.length) {
    html += `<h3 class="profile-section-heading">My Collection</h3>`;
    html += `<div class="feed-grid">${validCollected.map(c =>
      cardHtml(c.records, `#${c.edition_number} of ${c.records.edition_size}`)
    ).join('')}</div>`;
  }

  const content = document.getElementById('libraryContent');
  content.innerHTML = html;
  content.querySelectorAll('.record-card[data-id]').forEach(card =>
    card.addEventListener('click', () => navigate(`/r/${card.dataset.id}`))
  );
}

function cardHtml(r, badge) {
  const imgPath = r.cover_path || r.thumbnail_path;
  const thumbUrl = imgPath
    ? supabase.storage.from('records').getPublicUrl(imgPath).data.publicUrl
    : null;
  const vinyl = thumbUrl
    ? `<img class="record-card-vinyl" src="${thumbUrl}" alt="">`
    : `<div class="record-card-vinyl"></div>`;
  const metaParts = [badge, r.plays != null ? `${r.plays} plays` : null].filter(Boolean);
  return `
    <div class="record-card" data-id="${r.id}">
      ${vinyl}
      <div class="record-card-info">
        <div class="record-card-title">${esc(r.title)}</div>
        ${r.artist ? `<div class="record-card-artist">${esc(r.artist)}</div>` : ''}
        <div class="record-card-meta">${metaParts.map(esc).join(' · ')}</div>
      </div>
    </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
