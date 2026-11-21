// /u/:username — collector + artist profile: header, stats strip, showcase, and tabs
// (Collection, Releases, For sale, Activity, Stats, and owner-only Earnings).
import { supabase } from '../supabase.js';
import { esc, rarityTier, publicUrl, cr, timeAgo, userLink, specialBadge, getFees, splitSale, formDialog } from '../ui.js';
import { resizeImage } from '../publish.js';
import { acceptOfferDialog, eligibleCopies } from '../offers.js';

const TIERS = ['Ultra Rare', 'Rare', 'Limited', 'Open Edition'];
const COLLECTION_SORTS = {
  recent: { label: 'Recently acquired', fn: (a, b) => new Date(b.acquiredAt) - new Date(a.acquiredAt) },
  value:  { label: 'Value', fn: (a, b) => (b.value ?? 0) - (a.value ?? 0) },
  gain:   { label: 'Gain', fn: (a, b) => (b.gain ?? -Infinity) - (a.gain ?? -Infinity) },
  rarity: { label: 'Rarity', fn: (a, b) => a.record.edition_size - b.record.edition_size || a.edition_number - b.edition_number },
  artist: { label: 'Artist', fn: (a, b) => (a.record.artist || '').localeCompare(b.record.artist || '') },
};

const coverImg = (r, cls = 'record-card-vinyl') => {
  const url = publicUrl(r?.cover_path || r?.thumbnail_path);
  return url ? `<img class="${cls}" src="${url}" alt="" loading="lazy">` : `<div class="${cls}"></div>`;
};
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export async function profileView({ username }) {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="profile-page"><div class="feed-loading">Loading...</div></div>`;
  if (!supabase) return;

  const { data: profile } = await supabase.from('users')
    .select('id, username, display_name, bio, avatar_url, created_at')
    .eq('username', username).maybeSingle();
  if (!profile) { view.innerHTML = '<p class="feed-empty">User not found</p>'; return; }

  const { data: { user } = {} } = await supabase.auth.getUser().catch(() => ({ data: {} }));
  const isOwner = user?.id === profile.id;
  const fees = await getFees();
  const ui = { tab: new URLSearchParams(location.search).get('tab'), sort: 'recent', artist: '', rarity: '', forSale: false, layout: 'grid', activity: '' };
  let d = null;

  const load = async () => {
    const pid = profile.id;
    const nowIso = new Date().toISOString();
    const [owned, values, pins, releases, txs, artistTxs, listings, me, followers, following, amFollowing, wants, myOffers] = await Promise.all([
      supabase.from('collections')
        .select('id, edition_number, collected_at, record_id, records(id, title, artist, genre, edition_size, cover_path, thumbnail_path, price, user_id, users!records_user_id_fkey(username))')
        .eq('user_id', pid),
      supabase.from('collection_values').select('collection_id, current_value').eq('user_id', pid),
      supabase.from('profile_pins').select('slot, collection_id').eq('user_id', pid).order('slot'),
      supabase.from('records')
        .select('id, title, artist, cover_path, thumbnail_path, edition_size, minted_count, price, plays, created_at, is_public')
        .eq('user_id', pid).order('created_at', { ascending: false }),
      supabase.from('transactions')
        .select('id, type, price, edition_number, collection_id, created_at, buyer_id, seller_id, records(id, title), buyer:users!transactions_buyer_id_fkey(username), seller:users!transactions_seller_id_fkey(username)')
        .or(`buyer_id.eq.${pid},seller_id.eq.${pid}`)
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('transactions')
        .select('id, type, price, royalty_amount, seller_proceeds, edition_number, created_at, record_id, records!inner(id, title, user_id), buyer:users!transactions_buyer_id_fkey(username)')
        .eq('records.user_id', pid)
        .order('created_at', { ascending: false }).limit(300),
      supabase.from('listings')
        .select('id, ask_price, status, created_at, collection_id, collections(edition_number, record_id, records(id, title, artist, edition_size, cover_path, thumbnail_path))')
        .eq('seller_id', pid).order('created_at', { ascending: false }).limit(200),
      isOwner ? supabase.from('users').select('balance, held_balance').eq('id', pid).single() : Promise.resolve({ data: null }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', pid),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', pid),
      user && !isOwner ? supabase.from('follows').select('followee_id').eq('follower_id', user.id).eq('followee_id', pid).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('wants').select('record_id, max_price, created_at, records(id, title, artist, edition_size, cover_path, thumbnail_path)').eq('user_id', pid).order('created_at', { ascending: false }),
      isOwner ? supabase.from('offers')
        .select('id, price, edition_number, expires_at, created_at, record_id, records(id, title)')
        .eq('buyer_id', pid).eq('status', 'active').gt('expires_at', nowIso).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const valueOf = Object.fromEntries((values.data ?? []).map(v => [v.collection_id, v.current_value]));
    const ownedRows = (owned.data ?? []).filter(c => c.records);
    const wantRows = (wants.data ?? []).filter(w => w.records);
    const recordIds = [...new Set([...ownedRows.map(c => c.record_id), ...(releases.data ?? []).map(r => r.id), ...wantRows.map(w => w.record_id)])];
    const ownedRecordIds = [...new Set(ownedRows.map(c => c.record_id))];
    const { data: incoming } = isOwner && ownedRecordIds.length
      ? await supabase.from('offers')
          .select('id, price, edition_number, expires_at, created_at, record_id, buyer_id, buyer:users!offers_buyer_id_fkey(username), records(id, title)')
          .in('record_id', ownedRecordIds).eq('status', 'active').gt('expires_at', nowIso).neq('buyer_id', pid)
          .order('price', { ascending: false })
      : { data: [] };
    const { data: statRows } = recordIds.length
      ? await supabase.from('release_market_stats').select('*').in('record_id', recordIds)
      : { data: [] };
    const stats = Object.fromEntries((statRows ?? []).map(s => [s.record_id, s]));
    const activeByCollection = new Map((listings.data ?? []).filter(l => l.status === 'active').map(l => [l.collection_id, l]));

    const copies = ownedRows.map(c => {
      const buy = (txs.data ?? []).find(t => t.collection_id === c.id && t.buyer_id === pid);
      const s = stats[c.record_id] ?? {};
      const value = valueOf[c.id] ?? null;
      const paid = buy?.price ?? null;
      const marks = [s.floor_ask, s.last_sale_price, s.original_price, value].filter(v => v != null);
      return {
        ...c, record: c.records, value, paid,
        gain: value != null && paid != null ? value - paid : null,
        acquiredAt: buy?.created_at ?? c.collected_at,
        low: marks.length ? Math.min(...marks) : 0,
        high: marks.length ? Math.max(...marks) : 0,
        listing: activeByCollection.get(c.id) ?? null,
        floor: s.floor_ask ?? null,
      };
    });

    d = {
      copies,
      pins: pins.data ?? [],
      releases: (releases.data ?? []).filter(r => isOwner || r.is_public),
      txs: txs.data ?? [],
      artistTxs: artistTxs.data ?? [],
      listings: listings.data ?? [],
      stats,
      balance: me.data?.balance ?? null,
      held: me.data?.held_balance ?? 0,
      followers: followers.count ?? 0,
      following: following.count ?? 0,
      amFollowing: !!amFollowing.data,
      wants: wantRows,
      offersMade: myOffers.data ?? [],
      offersIn: [],
    };
    const listingFor = new Map(copies.filter(c => c.listing).map(c => [c.id, c.listing]));
    d.listingFor = listingFor;
    d.offersIn = (incoming ?? []).map(o => ({ ...o, copies: eligibleCopies(o, copies.filter(c => c.record_id === o.record_id), listingFor) }))
      .filter(o => o.copies.length);
    d.isArtist = d.releases.length > 0;
    d.isCollector = copies.length > 0;
    if (!ui.tab) ui.tab = d.isArtist && !d.isCollector ? 'releases' : 'collection';
  };

  const showcase = () => {
    const byId = new Map(d.copies.map(c => [c.id, c]));
    const pinned = d.pins.map(p => byId.get(p.collection_id)).filter(Boolean);
    const list = pinned.length ? pinned : [...d.copies].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 4);
    return { list, isPinned: pinned.length > 0 };
  };

  const draw = () => {
    const { copies, releases, artistTxs } = d;
    const sc = showcase();
    const bannerSources = (sc.list.length ? sc.list.map(c => c.record) : releases).slice(0, 4);
    const lowTotal = copies.reduce((s, c) => s + c.low, 0);
    const highTotal = copies.reduce((s, c) => s + c.high, 0);
    const artists = new Set(copies.map(c => c.record.user_id).filter(a => a !== profile.id));
    const royalties = artistTxs.filter(t => t.type === 'secondary').reduce((s, t) => s + (t.royalty_amount || 0), 0);
    const avatar = publicUrl(profile.avatar_url);
    const name = profile.display_name || `@${profile.username}`;

    const badges = [
      d.isArtist ? '<span class="edition-badge rarity rarity-rare">Artist</span>' : '',
      d.isCollector ? '<span class="edition-badge rarity rarity-limited">Collector</span>' : '',
      copies.some(c => c.edition_number <= 10) ? '<span class="edition-badge special">Early collector</span>' : '',
    ].join('');

    const tabs = [
      ['collection', `Collection (${copies.length})`],
      d.isArtist && ['releases', `Releases (${releases.length})`],
      ['forsale', `For sale (${copies.filter(c => c.listing).length})`],
      (d.wants.length || isOwner) && ['wantlist', `Wantlist (${d.wants.length})`],
      isOwner && ['offers', `Offers${d.offersIn.length ? ` (${d.offersIn.length})` : ''}`],
      ['activity', 'Activity'],
      ['stats', 'Stats'],
      isOwner && (d.isArtist || d.txs.some(t => t.seller_id === profile.id)) && ['earnings', 'Earnings'],
    ].filter(Boolean);
    if (!tabs.some(([k]) => k === ui.tab)) ui.tab = tabs[0][0];

    view.innerHTML = `
      <div class="profile-page profile-v2">
        <div class="profile-banner">${bannerSources.map(r => coverImg(r, 'banner-tile')).join('')}</div>
        <div class="profile-head">
          ${avatar ? `<img class="profile-avatar-img" src="${avatar}" alt="">` : `<div class="profile-avatar-img placeholder">${esc((profile.display_name || profile.username)[0]?.toUpperCase() || '?')}</div>`}
          <div class="profile-ident">
            <h2>${esc(name)}</h2>
            ${profile.display_name ? `<div class="muted">@${esc(profile.username)}</div>` : ''}
            <div class="profile-badges">${badges}</div>
            <div class="follow-counts"><strong>${d.followers}</strong> ${d.followers === 1 ? 'follower' : 'followers'} · <strong>${d.following}</strong> following</div>
          </div>
          ${user && !isOwner ? `<button class="action-btn${d.amFollowing ? ' text-btn' : ''}" id="followBtn">${d.amFollowing ? 'Following' : 'Follow'}</button>` : ''}
          ${isOwner ? `<div class="profile-owner-actions">
            <button class="action-btn text-btn" id="editProfileBtn">Edit profile</button>
            ${copies.length ? `<button class="action-btn text-btn" id="editShowcaseBtn">Edit showcase</button>` : ''}
          </div>` : ''}
        </div>
        ${profile.bio ? `<p class="profile-bio">${esc(profile.bio)}</p>` : ''}

        <div class="price-strip profile-stats">
          <div class="price-cell"><span class="price-label">Editions owned</span><span class="price-value">${copies.length}</span></div>
          <div class="price-cell"><span class="price-label">Artists supported</span><span class="price-value">${artists.size}</span></div>
          <div class="price-cell"><span class="price-label">Collection value</span><span class="price-value">${copies.length ? (lowTotal === highTotal ? cr(lowTotal) : `${lowTotal.toLocaleString()}–${cr(highTotal)}`) : '—'}</span></div>
          ${d.isArtist ? `<div class="price-cell"><span class="price-label">Royalties earned</span><span class="price-value">${cr(royalties)}</span></div>` : ''}
          <div class="price-cell"><span class="price-label">Member since</span><span class="price-value">${new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></div>
        </div>
        ${isOwner && d.balance != null ? `<div class="balance-note profile-balance">Your balance: ${cr(d.balance)}${d.held ? ` · ${cr(d.held)} held in open offers` : ''}</div>` : ''}

        ${sc.list.length ? `<section class="market-section showcase">
          <div class="profile-section-heading">${sc.isPinned ? 'Showcase' : 'Top of the shelf'}</div>
          <div class="showcase-grid">${sc.list.map(c => `
            <a class="showcase-card" href="/r/${c.record.id}" data-route="/r/${c.record.id}">
              ${coverImg(c.record, 'showcase-cover')}
              <span class="showcase-play" aria-hidden="true">▶</span>
              <div class="record-card-title">${esc(c.record.title)}</div>
              <div class="record-card-artist">#${c.edition_number} of ${c.record.edition_size}</div>
            </a>`).join('')}
          </div>
        </section>` : ''}

        <nav class="profile-tabs">${tabs.map(([k, label]) => `<button class="profile-tab${ui.tab === k ? ' active' : ''}" data-tab="${k}">${label}</button>`).join('')}</nav>
        <div id="profileTab"></div>
      </div>`;

    drawTab();
    bindHeader();
  };

  const drawTab = () => {
    const el = document.getElementById('profileTab');
    const renderers = { collection: tabCollection, releases: tabReleases, forsale: tabForSale, wantlist: tabWantlist, offers: tabOffers, activity: tabActivity, stats: tabStats, earnings: tabEarnings };
    el.innerHTML = renderers[ui.tab]();
    bindTab(el);
  };

  // ── Collection ──
  const tabCollection = () => {
    if (!d.copies.length) return emptyCollector();
    const artistNames = [...new Set(d.copies.map(c => c.record.artist).filter(Boolean))].sort();
    let rows = d.copies.filter(c =>
      (!ui.artist || c.record.artist === ui.artist) &&
      (!ui.rarity || rarityTier(c.record.edition_size).label === ui.rarity) &&
      (!ui.forSale || c.listing));
    rows = [...rows].sort(COLLECTION_SORTS[ui.sort].fn);
    const controls = `<div class="market-filters">
      <select data-ctl="sort">${Object.entries(COLLECTION_SORTS).map(([k, s]) => `<option value="${k}"${ui.sort === k ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
      ${artistNames.length > 1 ? `<select data-ctl="artist"><option value="">All artists</option>${artistNames.map(a => `<option${ui.artist === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>` : ''}
      <select data-ctl="rarity"><option value="">All rarities</option>${TIERS.map(t => `<option${ui.rarity === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <label class="toggle"><input type="checkbox" data-ctl="forSale"${ui.forSale ? ' checked' : ''}> For sale</label>
      <span class="range-tabs layout-toggle">
        <button class="range-tab${ui.layout === 'grid' ? ' active' : ''}" data-layout="grid">Grid</button>
        <button class="range-tab${ui.layout === 'list' ? ' active' : ''}" data-layout="list">List</button>
      </span>
    </div>`;
    if (!rows.length) return controls + '<div class="chart-empty">No editions match.</div>';

    const change = c => c.gain == null ? '' : `<span class="price-sub ${c.gain >= 0 ? 'up' : 'down'}">${c.gain >= 0 ? '+' : ''}${c.gain.toLocaleString()} cr</span>`;
    const ownerAction = c => !isOwner ? '' : c.listing
      ? `<span class="edition-badge listed">Listed ${cr(c.listing.ask_price)}</span>`
      : `<button class="action-btn text-btn quick-list-btn" data-collection-id="${c.id}">List</button>`;

    if (ui.layout === 'list') {
      return controls + `<div class="market-section"><table class="market-table">
        <thead><tr><th>Release</th><th>Edition</th><th>Acquired</th><th>Paid</th><th>Value</th><th></th></tr></thead>
        <tbody>${rows.map(c => `<tr>
          <td><a class="edition-link" href="/r/${c.record.id}" data-route="/r/${c.record.id}">${esc(c.record.title)}</a> <span class="muted">${esc(c.record.artist || '')}</span></td>
          <td><a class="edition-link" href="/r/${c.record.id}/e/${c.edition_number}" data-route="/r/${c.record.id}/e/${c.edition_number}">#${c.edition_number}</a> / ${c.record.edition_size} ${specialBadge(c.edition_number, c.record.edition_size)}</td>
          <td>${fmtDate(c.acquiredAt)}</td>
          <td>${cr(c.paid)}</td>
          <td>${cr(c.value)} ${change(c)}</td>
          <td>${ownerAction(c)}</td>
        </tr>`).join('')}</tbody></table></div>`;
    }
    return controls + `<div class="feed-grid">${rows.map(c => {
      const rarity = rarityTier(c.record.edition_size);
      return `<div class="record-card release-card shelf-card">
        <a href="/r/${c.record.id}/e/${c.edition_number}" data-route="/r/${c.record.id}/e/${c.edition_number}" class="shelf-link">
          ${coverImg(c.record)}
          <div class="record-card-title">${esc(c.record.title)}</div>
          ${c.record.artist ? `<div class="record-card-artist">${esc(c.record.artist)}</div>` : ''}
          <div class="release-card-stats"><span>#${c.edition_number} of ${c.record.edition_size} · ${fmtDate(c.acquiredAt)}</span>
            <span>Paid ${cr(c.paid)}</span></div>
          <div class="release-card-price"><span class="release-price">${cr(c.value)}</span>${change(c)}</div>
        </a>
        <div class="shelf-foot"><span class="edition-badge rarity ${rarity.class}">${rarity.label}</span>${specialBadge(c.edition_number, c.record.edition_size)}${ownerAction(c)}</div>
      </div>`;
    }).join('')}</div>`;
  };

  const emptyCollector = () => {
    queueMicrotask(async () => {
      const { data } = await supabase.from('market_browse').select('*').gt('editions_left', 0).not('original_price', 'is', null).limit(3);
      const el = document.getElementById('emptySuggestions');
      if (el && data?.length) el.innerHTML = data.map(r => `
        <a class="record-card release-card" href="/r/${r.record_id}" data-route="/r/${r.record_id}">
          ${coverImg(r)}<div class="record-card-title">${esc(r.title)}</div>
          <div class="release-card-stats"><span>${r.editions_left} of ${r.edition_size} left · ${cr(r.original_price)}</span></div>
        </a>`).join('');
    });
    return `<div class="empty-state">
      <p>${isOwner ? 'You don\'t own any editions yet.' : 'No editions collected yet.'} Each release comes in a numbered, limited edition: collect one from the artist and it's yours to keep, play, or resell, with the artist earning a royalty on every resale.</p>
      <div class="feed-grid" id="emptySuggestions"></div>
    </div>`;
  };

  // ── Releases ──
  const tabReleases = () => {
    if (!d.releases.length) return isOwner
      ? `<div class="empty-state"><p>No releases yet. <a href="/studio" data-route="/studio">Open the studio</a> to press your first spiral.</p></div>`
      : '<div class="chart-empty">No releases yet.</div>';
    const royaltyBy = {};
    for (const t of d.artistTxs) if (t.type === 'secondary') royaltyBy[t.record_id] = (royaltyBy[t.record_id] || 0) + (t.royalty_amount || 0);
    return `<div class="feed-grid">${d.releases.map(r => {
      const s = d.stats[r.id] ?? {};
      return `<a class="record-card release-card" href="/r/${r.id}" data-route="/r/${r.id}">
        ${coverImg(r)}
        <div class="record-card-title">${esc(r.title)}</div>
        ${r.artist ? `<div class="record-card-artist">${esc(r.artist)}</div>` : ''}
        <div class="release-card-stats">
          ${r.edition_size ? `<span>${r.minted_count} of ${r.edition_size} claimed</span>` : `<span>${r.plays ?? 0} plays</span>`}
          ${s.floor_ask != null ? `<span>Floor ${cr(s.floor_ask)}</span>` : ''}
          ${s.last_sale_price != null ? `<span>Last sale ${cr(s.last_sale_price)}</span>` : ''}
          ${royaltyBy[r.id] ? `<span>Royalties ${cr(royaltyBy[r.id])}</span>` : ''}
          ${!r.is_public ? '<span>Private</span>' : ''}
        </div>
      </a>`;
    }).join('')}</div>`;
  };

  // ── For sale ──
  const tabForSale = () => {
    const rows = d.copies.filter(c => c.listing).sort((a, b) => a.listing.ask_price - b.listing.ask_price);
    if (!rows.length) return `<div class="chart-empty">Nothing listed for sale.</div>`;
    return `<div class="market-section"><table class="market-table">
      <thead><tr><th>Release</th><th>Edition</th><th>Ask</th><th>Release floor</th><th>Listed</th><th></th></tr></thead>
      <tbody>${rows.map(c => `<tr>
        <td><a class="edition-link" href="/r/${c.record.id}" data-route="/r/${c.record.id}">${esc(c.record.title)}</a></td>
        <td><a class="edition-link" href="/r/${c.record.id}/e/${c.edition_number}" data-route="/r/${c.record.id}/e/${c.edition_number}">#${c.edition_number}</a></td>
        <td>${cr(c.listing.ask_price)}</td>
        <td>${cr(c.floor)}</td>
        <td>${timeAgo(c.listing.created_at)}</td>
        <td>${isOwner ? `<button class="action-btn text-btn cancel-listing-btn" data-listing-id="${c.listing.id}">Cancel</button>` : `<a class="action-btn" href="/r/${c.record.id}/e/${c.edition_number}" data-route="/r/${c.record.id}/e/${c.edition_number}">View</a>`}</td>
      </tr>`).join('')}</tbody></table></div>`;
  };

  // ── Wantlist ──
  const tabWantlist = () => {
    if (!d.wants.length) return `<div class="empty-state"><p>Nothing on ${isOwner ? 'your' : 'this'} wantlist yet.${isOwner ? ' Use "Add to wantlist" on any release to get an alert when a copy is listed under your price.' : ''}</p></div>`;
    return `<div class="feed-grid">${d.wants.map(w => {
      const r = w.records;
      const s = d.stats[w.record_id] ?? {};
      const hit = s.floor_ask != null && (w.max_price == null || s.floor_ask <= w.max_price);
      return `<div class="record-card release-card shelf-card">
        <a class="shelf-link" href="/r/${r.id}" data-route="/r/${r.id}">
          ${coverImg(r)}
          <div class="record-card-title">${esc(r.title)}</div>
          ${r.artist ? `<div class="record-card-artist">${esc(r.artist)}</div>` : ''}
          <div class="release-card-stats">
            <span>Floor ${cr(s.floor_ask)}</span>
            <span>Target ${w.max_price ? `under ${cr(w.max_price)}` : 'any price'}</span>
          </div>
        </a>
        <div class="shelf-foot">${hit ? '<span class="edition-badge owned">Available at your price</span>' : ''}
          ${isOwner ? `<button class="action-btn text-btn unwant-btn" data-record-id="${r.id}">Remove</button>` : ''}</div>
      </div>`;
    }).join('')}</div>`;
  };

  // ── Offers (owner) ──
  const tabOffers = () => {
    const left = ts => { const h = (new Date(ts) - Date.now()) / 3600e3; return h < 48 ? `${Math.max(1, Math.round(h))}h left` : `${Math.round(h / 24)}d left`; };
    return `
      <div class="market-section"><div class="profile-section-heading">Offers you can accept</div>
        ${d.offersIn.length ? `<table class="market-table"><thead><tr><th>Release</th><th>For</th><th>Offer</th><th>From</th><th>Expires</th><th></th></tr></thead>
        <tbody>${d.offersIn.map(o => `<tr>
          <td><a class="edition-link" href="/r/${o.record_id}" data-route="/r/${o.record_id}">${esc(o.records?.title ?? '')}</a></td>
          <td>${o.edition_number ? `#${o.edition_number}` : 'Any edition'}</td>
          <td>${cr(o.price)}</td><td>${userLink(o.buyer)}</td><td>${left(o.expires_at)}</td>
          <td>${o.edition_number ? `<button class="action-btn text-btn decline-offer-btn" data-offer-id="${o.id}">Decline</button> ` : ''}<button class="action-btn accept-offer-btn" data-offer-id="${o.id}">Accept</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="chart-empty">No offers on your copies right now.</div>'}
      </div>
      <div class="market-section"><div class="profile-section-heading">Offers you've made</div>
        ${d.offersMade.length ? `<table class="market-table"><thead><tr><th>Release</th><th>For</th><th>Offer</th><th>Expires</th><th></th></tr></thead>
        <tbody>${d.offersMade.map(o => `<tr>
          <td><a class="edition-link" href="/r/${o.record_id}" data-route="/r/${o.record_id}">${esc(o.records?.title ?? '')}</a></td>
          <td>${o.edition_number ? `#${o.edition_number}` : 'Any edition'}</td>
          <td>${cr(o.price)}</td><td>${left(o.expires_at)}</td>
          <td><button class="action-btn text-btn cancel-offer-btn" data-offer-id="${o.id}">Cancel</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="chart-empty">No open offers.</div>'}
      </div>`;
  };

  // ── Activity ──
  const activityEvents = () => {
    const pid = profile.id;
    const ev = [];
    for (const r of d.releases) if (r.is_public || isOwner) ev.push({ type: 'released', at: r.created_at, html: `Released <a class="edition-link" href="/r/${r.id}" data-route="/r/${r.id}">${esc(r.title)}</a>` });
    for (const t of d.txs) {
      const rel = t.records ? `<a class="edition-link" href="/r/${t.records.id}/e/${t.edition_number}" data-route="/r/${t.records.id}/e/${t.edition_number}">${esc(t.records.title)} #${t.edition_number}</a>` : `#${t.edition_number}`;
      if (t.type === 'primary' && t.buyer_id === pid) ev.push({ type: 'collected', at: t.created_at, html: `Collected ${rel} for ${cr(t.price)}` });
      else if (t.type === 'secondary' && t.buyer_id === pid) ev.push({ type: 'bought', at: t.created_at, html: `Bought ${rel} from ${userLink(t.seller)} for ${cr(t.price)}` });
      else if (t.type === 'secondary' && t.seller_id === pid) ev.push({ type: 'sold', at: t.created_at, html: `Sold ${rel} to ${userLink(t.buyer)} for ${cr(t.price)}` });
    }
    for (const l of d.listings) {
      const r = l.collections?.records;
      if (!r) continue;
      ev.push({ type: 'listed', at: l.created_at, html: `Listed <a class="edition-link" href="/r/${r.id}/e/${l.collections.edition_number}" data-route="/r/${r.id}/e/${l.collections.edition_number}">${esc(r.title)} #${l.collections.edition_number}</a> for ${cr(l.ask_price)}` });
    }
    return ev.sort((a, b) => new Date(b.at) - new Date(a.at));
  };

  const tabActivity = () => {
    const all = activityEvents();
    const types = ['released', 'collected', 'bought', 'sold', 'listed'].filter(t => all.some(e => e.type === t));
    const rows = ui.activity ? all.filter(e => e.type === ui.activity) : all;
    return `<div class="market-filters"><select data-ctl="activity"><option value="">All activity</option>${types.map(t => `<option value="${t}"${ui.activity === t ? ' selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
      ${rows.length ? `<ul class="activity-list">${rows.slice(0, 100).map(e => `<li><span>${e.html}</span><span class="muted" title="${new Date(e.at).toLocaleString()}">${timeAgo(e.at)}</span></li>`).join('')}</ul>` : '<div class="chart-empty">No activity yet.</div>'}`;
  };

  // ── Stats ──
  const bars = (items, fmt = v => v) => {
    const max = Math.max(1, ...items.map(i => i.value));
    return `<div class="bar-list">${items.map(i => `<div class="bar-row"><span class="bar-label">${i.label}</span><span class="bar-track"><span style="width:${(i.value / max * 100).toFixed(1)}%"></span></span><span class="bar-value">${fmt(i.value)}</span></div>`).join('')}</div>`;
  };

  const tabStats = () => {
    const { copies } = d;
    if (!copies.length && !d.isArtist) return '<div class="chart-empty">No stats yet.</div>';
    const spent = copies.reduce((s, c) => s + (c.paid ?? 0), 0);
    const value = copies.reduce((s, c) => s + (c.value ?? 0), 0);
    const byArtist = {};
    for (const c of copies) { const a = c.record.users?.username ? `@${c.record.users.username}` : (c.record.artist || 'Unknown'); byArtist[a] = (byArtist[a] || 0) + 1; }
    const byTier = Object.fromEntries(TIERS.map(t => [t, 0]));
    for (const c of copies) byTier[rarityTier(c.record.edition_size).label]++;
    const byYear = {};
    for (const c of copies) { const y = new Date(c.acquiredAt).getFullYear(); byYear[y] ??= { n: 0, spent: 0 }; byYear[y].n++; byYear[y].spent += c.paid ?? 0; }
    const years = Object.keys(byYear).sort().reverse();
    return `
      <div class="price-strip">
        <div class="price-cell"><span class="price-label">Spent</span><span class="price-value">${cr(spent)}</span></div>
        <div class="price-cell"><span class="price-label">Value now</span><span class="price-value">${cr(value)}</span></div>
        <div class="price-cell"><span class="price-label">Gain</span><span class="price-value ${value - spent >= 0 ? 'up' : 'down'}">${value - spent >= 0 ? '+' : ''}${cr(value - spent)}</span></div>
        <div class="price-cell"><span class="price-label">#1–#10 held</span><span class="price-value">${copies.filter(c => c.edition_number <= 10).length}</span></div>
      </div>
      ${copies.length ? `
      <div class="market-section"><div class="profile-section-heading">Top artists by editions held</div>
        ${bars(Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label: esc(label), value })))}</div>
      <div class="market-section"><div class="profile-section-heading">Rarity mix</div>
        ${bars(TIERS.map(t => ({ label: t, value: byTier[t] })))}</div>
      <div class="market-section"><div class="profile-section-heading">Year in review</div>
        <table class="market-table"><thead><tr><th>Year</th><th>Editions acquired</th><th>Spent</th></tr></thead>
        <tbody>${years.map(y => `<tr><td>${y}</td><td>${byYear[y].n}</td><td>${cr(byYear[y].spent)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  };

  // ── Earnings (owner only) ──
  const tabEarnings = () => {
    const pid = profile.id;
    const primary = d.artistTxs.filter(t => t.type === 'primary');
    const resales = d.artistTxs.filter(t => t.type === 'secondary');
    const mySales = d.txs.filter(t => t.type === 'secondary' && t.seller_id === pid);
    const primaryIncome = primary.reduce((s, t) => s + (t.seller_proceeds || 0), 0);
    const royaltyIncome = resales.reduce((s, t) => s + (t.royalty_amount || 0), 0);
    const fees_ = fees;
    const resaleIncome = mySales.reduce((s, t) => s + splitSale(t.price, 'secondary', fees_).proceeds, 0);
    const rows = [
      ...primary.map(t => ({ at: t.created_at, what: `${esc(t.records.title)} #${t.edition_number} collected by ${userLink(t.buyer)}`, kind: 'Primary sale', amount: t.seller_proceeds })),
      ...resales.map(t => ({ at: t.created_at, what: `${esc(t.records.title)} #${t.edition_number} resold to ${userLink(t.buyer)} for ${cr(t.price)}`, kind: 'Royalty', amount: t.royalty_amount })),
      ...mySales.map(t => ({ at: t.created_at, what: `You sold ${esc(t.records?.title ?? '')} #${t.edition_number} to ${userLink(t.buyer)}`, kind: 'Your resale', amount: splitSale(t.price, 'secondary', fees_).proceeds })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
    return `
      <div class="price-strip">
        <div class="price-cell"><span class="price-label">Primary sales</span><span class="price-value">${cr(primaryIncome)}</span></div>
        <div class="price-cell"><span class="price-label">Resale royalties</span><span class="price-value">${cr(royaltyIncome)}</span></div>
        <div class="price-cell"><span class="price-label">Your resales</span><span class="price-value">${cr(resaleIncome)}</span></div>
        <div class="price-cell"><span class="price-label">Total</span><span class="price-value">${cr(primaryIncome + royaltyIncome + resaleIncome)}</span></div>
      </div>
      <div class="market-section">${rows.length ? `<table class="market-table">
        <thead><tr><th>When</th><th>Sale</th><th>Type</th><th>You received</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${timeAgo(r.at)}</td><td>${r.what}</td><td>${r.kind}</td><td>${cr(r.amount)}</td></tr>`).join('')}</tbody></table>` : '<div class="chart-empty">No earnings yet.</div>'}</div>`;
  };

  // ── Events ──
  const refresh = async () => { await load(); draw(); };

  const bindHeader = () => {
    view.querySelectorAll('.profile-tab').forEach(b => b.addEventListener('click', () => {
      ui.tab = b.dataset.tab;
      const p = new URLSearchParams(location.search); p.set('tab', ui.tab);
      history.replaceState(null, '', `${location.pathname}?${p}`);
      view.querySelectorAll('.profile-tab').forEach(x => x.classList.toggle('active', x === b));
      drawTab();
    }));

    document.getElementById('followBtn')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      if (d.amFollowing) await supabase.from('follows').delete().eq('follower_id', user.id).eq('followee_id', profile.id);
      else await supabase.from('follows').insert({ follower_id: user.id, followee_id: profile.id });
      await refresh();
    });

    document.getElementById('editProfileBtn')?.addEventListener('click', async () => {
      const fd = await formDialog({
        title: 'Edit profile',
        confirmLabel: 'Save',
        body: `
          <label class="form-field">Display name<input name="display_name" maxlength="60" value="${esc(profile.display_name || '')}"></label>
          <label class="form-field">Bio<textarea name="bio" maxlength="500" rows="4">${esc(profile.bio || '')}</textarea></label>
          <label class="form-field">Avatar<input name="avatar" type="file" accept="image/*"></label>`,
      });
      if (!fd) return;
      const patch = { display_name: fd.get('display_name').trim() || null, bio: fd.get('bio').trim() || null };
      const file = fd.get('avatar');
      if (file && file.size) {
        const blob = await resizeImage(file, 256);
        const path = `${profile.id}/avatar-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage.from('records').upload(path, blob, { contentType: 'image/jpeg' });
        if (!upErr) patch.avatar_url = path;
      }
      const { error } = await supabase.from('users').update(patch).eq('id', profile.id);
      if (!error) Object.assign(profile, patch);
      draw();
    });

    document.getElementById('editShowcaseBtn')?.addEventListener('click', async () => {
      const current = new Set(d.pins.map(p => p.collection_id));
      const fd = await formDialog({
        title: 'Pick up to 4 for your showcase',
        confirmLabel: 'Save showcase',
        body: `<div class="pick-list">${[...d.copies].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map(c => `
          <label class="pick-item"><input type="checkbox" name="pin" value="${c.id}"${current.has(c.id) ? ' checked' : ''}>
            ${coverImg(c.record, 'pick-cover')}<span>${esc(c.record.title)} <span class="muted">#${c.edition_number}</span></span></label>`).join('')}</div>`,
        onMount: form => form.addEventListener('change', () => {
          const boxes = [...form.querySelectorAll('input[name="pin"]')];
          const n = boxes.filter(b => b.checked).length;
          boxes.forEach(b => { b.disabled = !b.checked && n >= 4; });
        }),
      });
      if (!fd) return;
      const chosen = fd.getAll('pin').slice(0, 4);
      await supabase.from('profile_pins').delete().eq('user_id', profile.id);
      if (chosen.length) await supabase.from('profile_pins').insert(chosen.map((cid, i) => ({ user_id: profile.id, slot: i + 1, collection_id: cid })));
      await refresh();
    });
  };

  const bindTab = (el) => {
    el.querySelectorAll('[data-ctl]').forEach(ctl => ctl.addEventListener('change', () => {
      ui[ctl.dataset.ctl] = ctl.type === 'checkbox' ? ctl.checked : ctl.value;
      drawTab();
    }));
    el.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => { ui.layout = b.dataset.layout; drawTab(); }));

    el.querySelectorAll('.quick-list-btn').forEach(btn => btn.addEventListener('click', async () => {
      const c = d.copies.find(x => x.id === btn.dataset.collectionId);
      const s = d.stats[c.record_id] ?? {};
      const fd = await formDialog({
        title: `List ${c.record.title} #${c.edition_number}`,
        confirmLabel: 'List for sale',
        body: `
          <label class="form-field">Ask price (cr)<input name="price" type="number" min="1" step="1" required></label>
          <p class="receive-note" id="quickReceive">${[s.floor_ask != null ? `Floor ${cr(s.floor_ask)}` : '', s.last_sale_price != null ? `Last sale ${cr(s.last_sale_price)}` : ''].filter(Boolean).join(' · ') || 'No sales yet'}</p>`,
        onMount: form => form.price.addEventListener('input', () => {
          const p = parseInt(form.price.value);
          if (p > 0) {
            const sp = splitSale(p, 'secondary', fees);
            form.querySelector('#quickReceive').textContent = `You receive ${cr(sp.proceeds)} (artist ${cr(sp.royalty)} · fee ${cr(sp.fee)})`;
          }
        }),
      });
      if (!fd) return;
      const price = parseInt(fd.get('price'));
      if (!(price >= 1)) return;
      await supabase.rpc('create_listing', { p_collection_id: c.id, p_ask_price: price });
      await refresh();
    }));

    el.querySelectorAll('.unwant-btn').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      await supabase.from('wants').delete().eq('user_id', profile.id).eq('record_id', btn.dataset.recordId);
      await refresh();
    }));
    el.querySelectorAll('.accept-offer-btn').forEach(btn => btn.addEventListener('click', async () => {
      const o = d.offersIn.find(x => x.id === btn.dataset.offerId);
      const record = { title: o.records?.title ?? '' };
      const res = await acceptOfferDialog({ offer: o, record, copies: o.copies, fees, listingFor: d.listingFor });
      if (!res) return;
      await supabase.rpc('accept_offer', { p_offer_id: o.id, p_collection_id: res.collectionId });
      await refresh();
    }));
    el.querySelectorAll('.decline-offer-btn').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      await supabase.rpc('decline_offer', { p_offer_id: btn.dataset.offerId });
      await refresh();
    }));
    el.querySelectorAll('.cancel-offer-btn').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      await supabase.rpc('cancel_offer', { p_offer_id: btn.dataset.offerId });
      await refresh();
    }));

    el.querySelectorAll('.cancel-listing-btn').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      await supabase.rpc('cancel_listing', { p_listing_id: btn.dataset.listingId });
      await refresh();
    }));
  };

  await refresh();
}
