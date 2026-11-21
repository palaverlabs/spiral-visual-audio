import { supabase } from '../supabase.js';
import { esc, rarityTier } from '../ui.js';
import { navigate } from '../router.js';


export async function marketView() {
  document.getElementById('view').innerHTML = `
    <div class="feed-page">
      <div class="page-header">
        <h2 class="feed-title">Marketplace</h2>
      </div>
      <div class="status-line info" id="marketStatus"></div>
      <div class="feed-grid" id="marketGrid">
        <div class="feed-loading">Loading...</div>
      </div>
    </div>`;

  const grid = document.getElementById('marketGrid');
  const setStatus = (msg, type = 'info') => {
    const el = document.getElementById('marketStatus');
    if (el) { el.textContent = msg; el.className = `status-line ${type}`; }
  };

  if (!supabase) {
    grid.innerHTML = '<p class="feed-empty">Connect Supabase to see the marketplace.</p>';
    return;
  }

  const { data, error } = await supabase
    .from('listings')
    .select('id, ask_price, created_at, collections(id, edition_number, users(username), records(id, title, artist, edition_size, cover_path, thumbnail_path))')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Market query error:', error);
    grid.innerHTML = `<p class="feed-empty">Failed to load listings: ${error.message}</p>`;
    return;
  }
  if (!data?.length) {
    grid.innerHTML = '<p class="feed-empty">No resale listings yet. List one of your records from its record page.</p>';
    return;
  }

  grid.innerHTML = data.map(l => {
    const c = l.collections;
    const r = c?.records;
    if (!r) return '';
    const imagePath = r.cover_path || r.thumbnail_path;
    const thumbUrl = imagePath
      ? supabase.storage.from('records').getPublicUrl(imagePath).data.publicUrl
      : null;
    const vinyl = thumbUrl
      ? `<img class="record-card-vinyl" src="${thumbUrl}" alt="">`
      : `<div class="record-card-vinyl"></div>`;
    const rarity = rarityTier(r.edition_size);
    return `
    <div class="record-card market-card" data-id="${r.id}">
      ${vinyl}
      <div class="record-card-info">
        <div class="record-card-title">${esc(r.title)}</div>
        ${r.artist ? `<div class="record-card-artist">${esc(r.artist)}</div>` : ''}
        <div class="record-card-meta">
          #${c.edition_number} of ${r.edition_size} &middot; ${esc(c.users?.username ? `@${c.users.username}` : 'collector')}
          <span class="edition-badge rarity ${rarity.class}">${rarity.label}</span>
        </div>
      </div>
      <button class="action-btn market-buy-btn" data-listing-id="${l.id}" data-ask-price="${l.ask_price}">Buy for ${l.ask_price} cr</button>
    </div>`;
  }).join('');

  grid.querySelectorAll('.market-card').forEach(card =>
    card.addEventListener('click', (e) => {
      if (e.target.closest('.market-buy-btn')) return;
      navigate(`/r/${card.dataset.id}`);
    })
  );

  grid.querySelectorAll('.market-buy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
      btn.disabled = true;
      btn.textContent = 'Buying...';
      const { error: buyErr } = await supabase.rpc('buy_listing', { p_listing_id: btn.dataset.listingId });
      if (buyErr) {
        btn.disabled = false;
        btn.textContent = `Buy for ${btn.dataset.askPrice} cr`;
        setStatus(buyErr.message.includes('Insufficient') ? 'Not enough credits.' : `Failed: ${buyErr.message}`, 'error');
      } else {
        setStatus('Purchased!', 'success');
        btn.closest('.market-card').remove();
      }
    });
  });
}

