// /market — browse releases (one card per release), with drops rail, recently-sold ticker, filters, sort and paging.
import { supabase } from '../supabase.js';
import { esc, rarityTier, publicUrl, cr, timeAgo } from '../ui.js';
import { navigate } from '../router.js';

const PAGE_SIZE = 24;

const SORTS = {
  trending:   { label: 'Trending', apply: q => q.order('volume_7d', { ascending: false }).order('sales_7d', { ascending: false }).order('last_sale_at', { ascending: false, nullsFirst: false }) },
  price:      { label: 'Price: low to high', apply: q => q.not('buy_price', 'is', null).order('buy_price', { ascending: true }) },
  listed:     { label: 'Newly listed', apply: q => q.not('latest_listed_at', 'is', null).order('latest_listed_at', { ascending: false }) },
  sold:       { label: 'Recently sold', apply: q => q.not('last_sale_at', 'is', null).order('last_sale_at', { ascending: false }) },
  sellingout: { label: 'Almost sold out', apply: q => q.gt('editions_left', 0).not('original_price', 'is', null).order('editions_left', { ascending: true }) },
  newest:     { label: 'Newest releases', apply: q => q.order('created_at', { ascending: false }) },
};

// Rarity tiers are edition-size buckets (see rarityTier in ui.js).
const RARITY = {
  ultra:   q => q.lte('edition_size', 10),
  rare:    q => q.gt('edition_size', 10).lte('edition_size', 50),
  limited: q => q.gt('edition_size', 50).lte('edition_size', 250),
  open:    q => q.gt('edition_size', 250),
};

const DEFAULTS = { sort: 'trending', q: '', genre: '', rarity: '', min: '', max: '', listed: '', left: '' };

function readState() {
  const p = new URLSearchParams(location.search);
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (p.has(k)) s[k] = p.get(k);
  if (!SORTS[s.sort]) s.sort = 'trending';
  return s;
}

function writeState(s) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) if (v && v !== DEFAULTS[k]) p.set(k, v);
  const qs = p.toString();
  history.replaceState(null, '', `/market${qs ? `?${qs}` : ''}`);
}

const cover = r => {
  const url = publicUrl(r.cover_path || r.thumbnail_path);
  return url ? `<img class="record-card-vinyl" src="${url}" alt="" loading="lazy">` : `<div class="record-card-vinyl"></div>`;
};

function releaseCard(r) {
  const rarity = rarityTier(r.edition_size);
  const change = r.change_7d_pct;
  const fromArtist = r.editions_left > 0 && r.original_price != null && r.buy_price === r.original_price;
  return `
    <a class="record-card release-card" href="/r/${r.record_id}" data-route="/r/${r.record_id}">
      ${cover(r)}
      <div class="record-card-title">${esc(r.title)}</div>
      ${r.artist ? `<div class="record-card-artist">${esc(r.artist)}</div>` : ''}
      <div class="release-card-price">
        <span class="release-price">${r.buy_price != null ? cr(r.buy_price) : '<span class="muted">Not for sale</span>'}</span>
        ${change != null ? `<span class="price-sub ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change}% 7d</span>` : ''}
      </div>
      <div class="release-card-stats">
        ${fromArtist ? `<span>${r.editions_left} left from artist</span>` : ''}
        ${r.floor_ask != null ? `<span>Floor ${cr(r.floor_ask)} · ${r.listings_count} listed</span>` : ''}
        ${r.last_sale_price != null ? `<span>Last ${cr(r.last_sale_price)}</span>` : ''}
      </div>
      <span class="edition-badge rarity ${rarity.class}">${rarity.label} · ${r.edition_size}</span>
    </a>`;
}

export async function marketView() {
  const state = readState();
  document.getElementById('view').innerHTML = `
    <div class="feed-page market-page">
      <div class="page-header"><h2 class="feed-title">Marketplace</h2></div>
      <div class="sold-ticker" id="soldTicker" hidden></div>
      <section class="drops" id="drops" hidden>
        <div class="profile-section-heading">Live drops</div>
        <div class="drops-rail" id="dropsRail"></div>
      </section>
      <form class="market-filters" id="marketFilters">
        <input type="search" name="q" placeholder="Search title or artist" value="${esc(state.q)}">
        <select name="sort">${Object.entries(SORTS).map(([k, s]) => `<option value="${k}"${state.sort === k ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
        <select name="genre" id="genreSelect" hidden><option value="">All genres</option></select>
        <select name="rarity">
          <option value="">All rarities</option>
          <option value="ultra"${state.rarity === 'ultra' ? ' selected' : ''}>Ultra Rare (≤10)</option>
          <option value="rare"${state.rarity === 'rare' ? ' selected' : ''}>Rare (11–50)</option>
          <option value="limited"${state.rarity === 'limited' ? ' selected' : ''}>Limited (51–250)</option>
          <option value="open"${state.rarity === 'open' ? ' selected' : ''}>Open (250+)</option>
        </select>
        <span class="price-range">
          <input type="number" name="min" min="0" placeholder="Min cr" value="${esc(state.min)}">
          <input type="number" name="max" min="0" placeholder="Max cr" value="${esc(state.max)}">
        </span>
        <label class="toggle"><input type="checkbox" name="listed" value="1"${state.listed ? ' checked' : ''}> Listed for resale</label>
        <label class="toggle"><input type="checkbox" name="left" value="1"${state.left ? ' checked' : ''}> Editions left</label>
      </form>
      <div class="status-line info" id="marketStatus"></div>
      <div class="feed-grid" id="marketGrid"><div class="feed-loading">Loading...</div></div>
    </div>`;

  const grid = document.getElementById('marketGrid');
  if (!supabase) { grid.innerHTML = '<p class="feed-empty">Connect Supabase to see the marketplace.</p>'; return; }

  // Rails and genre options load alongside the first page.
  loadDrops();
  loadTicker();
  loadGenres(state);

  let offset = 0;
  let generation = 0;

  const buildQuery = () => {
    let q = supabase.from('market_browse').select('*', { count: 'exact' });
    const term = state.q.replace(/[,()*%\\]/g, ' ').trim();
    if (term) q = q.or(`title.ilike.*${term}*,artist.ilike.*${term}*`);
    if (state.genre) q = q.eq('genre', state.genre);
    if (RARITY[state.rarity]) q = RARITY[state.rarity](q);
    if (state.min !== '') q = q.gte('buy_price', parseInt(state.min) || 0);
    if (state.max !== '') q = q.lte('buy_price', parseInt(state.max) || 0);
    if (state.listed) q = q.gt('listings_count', 0);
    if (state.left) q = q.gt('editions_left', 0).not('original_price', 'is', null);
    return SORTS[state.sort].apply(q).order('record_id');
  };

  const loadPage = async () => {
    const gen = generation;
    const { data, error, count } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (gen !== generation) return; // a newer filter change superseded this request
    document.getElementById('marketLoadMore')?.remove();
    if (error) { grid.innerHTML = `<p class="feed-empty">Failed to load: ${esc(error.message)}</p>`; return; }
    if (offset === 0) {
      grid.innerHTML = data.length ? '' : '<p class="feed-empty">No releases match these filters.</p>';
      const el = document.getElementById('marketStatus');
      el.textContent = count ? `${count} ${count === 1 ? 'release' : 'releases'}` : '';
      el.className = 'status-line info';
    }
    grid.insertAdjacentHTML('beforeend', data.map(releaseCard).join(''));
    if (offset + data.length < (count ?? 0)) {
      const btn = document.createElement('button');
      btn.id = 'marketLoadMore';
      btn.className = 'action-btn feed-load-more';
      btn.textContent = 'Load more';
      btn.addEventListener('click', () => { btn.disabled = true; btn.textContent = 'Loading...'; offset += PAGE_SIZE; loadPage(); });
      grid.appendChild(btn);
    }
  };

  const form = document.getElementById('marketFilters');
  let debounce = null;
  const onChange = () => {
    const fd = new FormData(form);
    for (const k of Object.keys(DEFAULTS)) state[k] = (fd.get(k) ?? '').toString();
    writeState(state);
    generation++;
    offset = 0;
    grid.innerHTML = '<div class="feed-loading">Loading...</div>';
    loadPage();
  };
  form.addEventListener('change', onChange);
  form.addEventListener('input', e => { if (e.target.name === 'q') { clearTimeout(debounce); debounce = setTimeout(onChange, 300); } });
  form.addEventListener('submit', e => { e.preventDefault(); onChange(); });

  await loadPage();
}

async function loadDrops() {
  const { data } = await supabase.from('market_browse').select('*')
    .gt('editions_left', 0).not('original_price', 'is', null)
    .order('created_at', { ascending: false }).limit(10);
  if (!data?.length) return;
  document.getElementById('dropsRail').innerHTML = data.map(r => {
    const pct = Math.round(r.minted_count / r.edition_size * 100);
    return `
      <a class="drop-card" href="/r/${r.record_id}" data-route="/r/${r.record_id}">
        ${cover(r)}
        <div class="record-card-title">${esc(r.title)}</div>
        <div class="drop-progress"><span style="width:${pct}%"></span></div>
        <div class="release-card-stats"><span>${r.minted_count} of ${r.edition_size} claimed</span><span>${cr(r.original_price)}</span></div>
      </a>`;
  }).join('');
  document.getElementById('drops').hidden = false;
}

async function loadTicker() {
  const { data } = await supabase.from('transactions')
    .select('price, edition_number, created_at, type, records(id, title)')
    .order('created_at', { ascending: false }).limit(12);
  if (!data?.length) return;
  const el = document.getElementById('soldTicker');
  el.innerHTML = `<span class="ticker-label">Recently sold</span>` + data.filter(t => t.records).map(t =>
    `<a class="ticker-item" href="/r/${t.records.id}/e/${t.edition_number}" data-route="/r/${t.records.id}/e/${t.edition_number}">
      ${esc(t.records.title)} #${t.edition_number} · ${cr(t.price)}${t.type === 'primary' ? ' from artist' : ''} · <span class="muted">${timeAgo(t.created_at)}</span>
    </a>`).join('');
  el.hidden = false;
}

async function loadGenres(state) {
  const { data } = await supabase.from('market_browse').select('genre').not('genre', 'is', null);
  const genres = [...new Set((data ?? []).map(r => r.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!genres.length) return;
  const sel = document.getElementById('genreSelect');
  sel.insertAdjacentHTML('beforeend', genres.map(g => `<option value="${esc(g)}"${state.genre === g ? ' selected' : ''}>${esc(g)}</option>`).join(''));
  sel.hidden = false;
}
