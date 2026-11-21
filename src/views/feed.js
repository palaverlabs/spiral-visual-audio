import { supabase } from '../supabase.js';
import { esc } from '../ui.js';
import { navigate } from '../router.js';
import { skinSwitcherHtml, mountSkinSwitcher } from '../skin-switcher.js';

export async function feedView() {
  document.getElementById('view').innerHTML = `
    <div class="feed-page">
      <div class="page-header">
        <h2 class="feed-title">Recent Records</h2>
        ${skinSwitcherHtml()}
      </div>
      <div class="feed-grid" id="feedGrid">
        <div class="feed-loading">Loading...</div>
      </div>
    </div>`;

  mountSkinSwitcher();

  if (!supabase) {
    document.getElementById('feedGrid').innerHTML =
      '<p class="feed-empty">Connect Supabase to see the feed.</p>';
    return;
  }

  const PAGE_SIZE = 24;
  let offset = 0;
  const grid = document.getElementById('feedGrid');
  grid.innerHTML = '<div class="feed-loading">Loading...</div>';

  const loadMore = async () => {
    const { data, error } = await supabase
      .from('records')
      .select('id, title, artist, duration, plays, created_at, cover_path, thumbnail_path, users!records_user_id_fkey(username)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Feed query error:', error);
      if (offset === 0) grid.innerHTML = `<p class="feed-empty">Failed to load records: ${error.message}</p>`;
      return;
    }
    if (offset === 0 && !data?.length) {
      grid.innerHTML = '<p class="feed-empty">No records yet. Be the first to publish one from the studio!</p>';
      return;
    }

    // Remove load-more button if present, then append new cards
    document.getElementById('feedLoadMore')?.remove();
    if (offset === 0) grid.innerHTML = '';

    const fragment = document.createDocumentFragment();
    data?.forEach(r => {
      const imagePath = r.cover_path || r.thumbnail_path;
      const thumbUrl = imagePath
        ? supabase.storage.from('records').getPublicUrl(imagePath).data.publicUrl
        : null;
      const vinyl = thumbUrl
        ? `<img class="record-card-vinyl" src="${thumbUrl}" alt="">`
        : `<div class="record-card-vinyl"></div>`;
      const card = document.createElement('div');
      card.className = 'record-card';
      card.dataset.id = r.id;
      card.innerHTML = `${vinyl}
        <div class="record-card-info">
          <div class="record-card-title">${esc(r.title)}</div>
          ${r.artist ? `<div class="record-card-artist">${esc(r.artist)}</div>` : ''}
          <div class="record-card-meta">${r.users?.username ? `@${esc(r.users.username)}` : ''} &middot; ${r.plays ?? 0} plays</div>
        </div>`;
      card.addEventListener('click', () => navigate(`/r/${r.id}`));
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);

    if (data?.length === PAGE_SIZE) {
      const btn = document.createElement('button');
      btn.id = 'feedLoadMore';
      btn.className = 'action-btn feed-load-more';
      btn.textContent = 'Load more';
      btn.addEventListener('click', () => { offset += PAGE_SIZE; loadMore(); btn.disabled = true; btn.textContent = 'Loading...'; });
      grid.appendChild(btn);
    }
  };

  loadMore();
}

