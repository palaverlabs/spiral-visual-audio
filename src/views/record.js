import { supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { loadGroove, fetchGrooveBytes } from '../groove-loader.js';
import { DEFAULT_ROUT, DEFAULT_RIN, DEFAULT_CX, DEFAULT_CY, SPIN_SPEED } from '../constants.js';
import { esc, rarityTier, cr, timeAgo, userLink, specialBadge, getFees, splitSale, confirmDialog, priceChart, formDialog } from '../ui.js';
import { makeOfferDialog, acceptOfferDialog, eligibleCopies } from '../offers.js';

// Prefetch cache of raw groove bytes: id → Promise<ArrayBuffer|null>. Decoding happens when the record opens.
const bytesCache = new Map();
const GEOM_DEFAULTS = { Rout: DEFAULT_ROUT, Rin: DEFAULT_RIN, cx: DEFAULT_CX, cy: DEFAULT_CY };

function grooveUrl(record) {
  return record?.file_path ? supabase.storage.from('records').getPublicUrl(record.file_path).data?.publicUrl : null;
}

function prefetchGroove(record) {
  const url = grooveUrl(record);
  if (!url || bytesCache.has(record.id)) return;
  if (bytesCache.size >= 2) bytesCache.delete(bytesCache.keys().next().value);
  bytesCache.set(record.id, fetchGrooveBytes(url).catch(() => { bytesCache.delete(record.id); return null; }));
}

const SVG_PLAY = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`;
const SVG_PAUSE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>`;
const timeLeft = ts => {
  const h = (new Date(ts) - Date.now()) / 3600e3;
  return h <= 0 ? 'expired' : h < 1 ? `${Math.ceil(h * 60)}m left` : h < 48 ? `${Math.round(h)}h left` : `${Math.round(h / 24)}d left`;
};
const SVG_PREV = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="4" width="3" height="16"/><polygon points="19,4 8,12 19,20"/></svg>`;
const SVG_NEXT = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5,4 16,12 5,20"/><rect x="16" y="4" width="3" height="16"/></svg>`;


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
          <button class="skip-btn" id="recordPrevBtn" disabled></button>
          <div class="play-wrap" id="recordPlayWrap">
            <div class="play-ring"></div>
            <button class="play-btn" id="recordPlayBtn" disabled></button>
          </div>
          <button class="skip-btn" id="recordNextBtn" disabled></button>
          <span class="time-display">
            <span id="recordCurrentTime">0:00</span>
            <span class="t-sep"> / </span>
            <span id="recordTotalTime">0:00</span>
          </span>
        </div>
        <div class="up-next" id="upNext" style="display:none"></div>
      </div>
    </div>`;

  const setStatus = (msg, type = 'info') => {
    const el = document.getElementById('recordStatus');
    if (el) { el.textContent = msg; el.className = `status-line ${type}`; }
  };

  if (!supabase) { setStatus('Supabase not configured.', 'error'); return; }

  const { data: record, error } = await supabase
    .from('records')
    .select('*, users!records_user_id_fkey(username), cover_path, description, album, genre')
    .eq('id', id)
    .single();

  if (error || !record) { setStatus('Record not found.', 'error'); return; }

  // Start the groove download + decode (in a worker) and the player modules right away,
  // in parallel with everything else the page loads.
  const svgUrl = grooveUrl(record);
  const groovePromise = !svgUrl ? Promise.reject(new Error('Could not resolve file URL.'))
    : bytesCache.has(id)
      ? bytesCache.get(id).then(buf => loadGroove(buf ? { buf } : { url: svgUrl }, GEOM_DEFAULTS))
      : loadGroove({ url: svgUrl }, GEOM_DEFAULTS);
  groovePromise.catch(() => {});
  const playerModules = Promise.all([import('../renderer.js'), import('../playback.js'), import('../skin.js')]);

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

  // Fetch user + their library for up-next
  const { data: { user } = {} } = await supabase.auth.getUser().catch(() => ({ data: {} }));
  let nextRecord = null, prevRecord = null;
  if (user) {
    const { data: libraryRecords } = await supabase
      .from('records')
      .select('id, title, artist, thumbnail_path, cover_path, file_path')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (libraryRecords?.length) {
      const idx = libraryRecords.findIndex(r => r.id === id);
      if (idx !== -1) {
        if (idx + 1 < libraryRecords.length) nextRecord = libraryRecords[idx + 1];
        if (idx > 0) prevRecord = libraryRecords[idx - 1];
      }
    }
  }
  if (nextRecord) prefetchGroove(nextRecord);
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

  // Edition + marketplace UI (price strip, actions, your copies, history, listings, supporters, activity)
  if (record.edition_size) {
    const marketEl = document.createElement('section');
    marketEl.className = 'release-market';
    marketEl.id = 'releaseMarket';
    document.getElementById('upNext').after(marketEl);

    const fees = await getFees();
    const ui = { range: 'all', filter: '' };
    let data = null;

    const load = async () => {
      const [stats, listings, owners, txs, me, offers, want] = await Promise.all([
        supabase.from('release_market_stats').select('*').eq('record_id', id).maybeSingle(),
        supabase.from('listings')
          .select('id, ask_price, status, created_at, resolved_at, seller_id, collections!inner(id, edition_number, record_id), seller:users!listings_seller_id_fkey(username)')
          .eq('collections.record_id', id)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('collections').select('id, edition_number, user_id, users(username)').eq('record_id', id).order('edition_number'),
        supabase.from('transactions')
          .select('id, type, price, edition_number, created_at, buyer:users!transactions_buyer_id_fkey(username), seller:users!transactions_seller_id_fkey(username)')
          .eq('record_id', id)
          .order('created_at', { ascending: false })
          .limit(200),
        user ? supabase.from('users').select('balance').eq('id', user.id).single() : Promise.resolve({ data: null }),
        supabase.from('offers')
          .select('id, price, edition_number, expires_at, created_at, buyer_id, buyer:users!offers_buyer_id_fkey(username)')
          .eq('record_id', id).eq('status', 'active').gt('expires_at', new Date().toISOString())
          .order('price', { ascending: false }),
        user ? supabase.from('wants').select('max_price').eq('user_id', user.id).eq('record_id', id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const allListings = listings.data ?? [];
      data = {
        stats: stats.data ?? {},
        active: allListings.filter(l => l.status === 'active').sort((a, b) => a.ask_price - b.ask_price),
        allListings,
        owners: owners.data ?? [],
        txs: txs.data ?? [],
        balance: me.data?.balance ?? null,
        offers: offers.data ?? [],
        want: want.data ?? null,
      };
      data.owned = user ? data.owners.filter(o => o.user_id === user.id) : [];
      data.myListingFor = new Map(data.active.filter(l => l.seller_id === user?.id).map(l => [l.collections.id, l]));
    };

    const draw = () => {
      const { stats, active, owners, txs, owned, myListingFor, balance } = data;
      const size = record.edition_size;
      const minted = stats.minted_count ?? owners.length;
      const left = size - minted;
      const rarity = rarityTier(size);
      const ownerCount = new Set(owners.map(o => o.user_id)).size;
      const buyable = active.filter(l => l.seller_id !== user?.id);
      const floor = buyable[0] ?? null;
      const lastSale = stats.last_sale_price;
      const premium = lastSale != null && record.price ? Math.round((lastSale - record.price) / record.price * 100) : null;
      // Best offer you could accept right now with one of your copies.
      let sellNow = null;
      for (const o of data.offers) {
        if (o.buyer_id === user?.id) continue;
        const copies = eligibleCopies(o, owned, myListingFor);
        if (copies.length) { sellNow = { offer: o, copy: copies[0] }; break; }
      }

      // 1. Edition line
      let html = `<div class="record-edition">
        <span class="edition-label">Edition of ${size} · ${minted} minted · ${ownerCount} ${ownerCount === 1 ? 'owner' : 'owners'}</span>
        <span class="edition-badge rarity ${rarity.class}">${rarity.label}</span>
        ${left <= 0 ? `<span class="edition-badge sold-out">Sold Out</span>` : ''}
        ${owned.length ? `<span class="edition-badge owned">You own ${owned.map(o => `#${o.edition_number}`).join(', ')}</span>` : ''}
      </div>`;

      // 2. Price strip
      html += `<div class="price-strip">
        <div class="price-cell"><span class="price-label">Lowest ask</span><span class="price-value">${cr(stats.floor_ask)}</span></div>
        <div class="price-cell"><span class="price-label">Highest offer</span><span class="price-value">${cr(data.offers[0]?.price)}</span>${data.offers.length ? `<span class="price-sub">${data.offers.length} ${data.offers.length === 1 ? 'offer' : 'offers'}</span>` : ''}</div>
        <div class="price-cell"><span class="price-label">Last sale</span><span class="price-value">${cr(lastSale)}</span>${stats.last_sale_at ? `<span class="price-sub">${timeAgo(stats.last_sale_at)}</span>` : ''}</div>
        <div class="price-cell"><span class="price-label">Original</span><span class="price-value">${cr(record.price)}</span>${premium != null ? `<span class="price-sub ${premium >= 0 ? 'up' : 'down'}">${premium >= 0 ? '+' : ''}${premium}% last sale</span>` : ''}</div>
      </div>`;

      // 3. Actions
      html += `<div class="market-actions">`;
      if (!user) {
        html += `<span class="edition-sign-in"><a href="/auth" data-route="/auth">Sign in</a> to collect or buy</span>`;
      } else {
        if (left > 0 && record.price) html += `<button class="action-btn" id="collectBtn">Collect #${minted + 1} from artist — ${cr(record.price)}</button>`;
        if (floor) html += `<button class="action-btn" id="buyNowBtn">Buy now #${floor.collections.edition_number} — ${cr(floor.ask_price)}</button>`;
        if (minted > 0) html += `<button class="action-btn text-btn" id="makeOfferBtn">Make offer</button>`;
        if (sellNow) html += `<button class="action-btn" id="sellNowBtn">Sell now #${sellNow.copy.edition_number} — ${cr(sellNow.offer.price)}</button>`;
        html += data.want
          ? `<button class="action-btn text-btn" id="unwantBtn" title="Remove from wantlist">On your wantlist${data.want.max_price ? ` · under ${cr(data.want.max_price)}` : ''} ✕</button>`
          : `<button class="action-btn text-btn" id="wantBtn">Add to wantlist</button>`;
        if (balance != null) html += `<span class="balance-note">Balance ${cr(balance)}</span>`;
      }
      html += `</div>`;

      // 4. Your copies
      if (owned.length) {
        html += `<div class="market-section"><div class="profile-section-heading">Your copies</div>`;
        html += owned.map(o => {
          const l = myListingFor.get(o.id);
          const edLink = `<a class="edition-link" href="/r/${id}/e/${o.edition_number}" data-route="/r/${id}/e/${o.edition_number}">#${o.edition_number}</a>`;
          return l ? `
            <div class="resale-row">${edLink} ${specialBadge(o.edition_number, size)}
              <span class="edition-badge listed">Listed at ${cr(l.ask_price)}</span>
              <button class="action-btn text-btn cancel-listing-btn" data-listing-id="${l.id}">Cancel listing</button>
            </div>` : `
            <div class="resale-row">${edLink} ${specialBadge(o.edition_number, size)}
              <input type="number" class="resale-price-input" data-collection-id="${o.id}" placeholder="Ask (cr)" min="1" step="1">
              <button class="action-btn list-btn" data-collection-id="${o.id}">List</button>
              <span class="receive-note" data-receive-for="${o.id}">${[stats.floor_ask ? `Floor ${cr(stats.floor_ask)}` : '', lastSale ? `Last sale ${cr(lastSale)}` : ''].filter(Boolean).join(' · ')}</span>
            </div>`;
        }).join('');
        html += `</div>`;
      }

      // 5. Price history
      const cutoff = ui.range === 'all' ? 0 : Date.now() - (ui.range === '30d' ? 30 : 90) * 86400e3;
      const sales = txs.filter(t => t.type === 'secondary' && new Date(t.created_at).getTime() >= cutoff).reverse();
      html += `<div class="market-section">
        <div class="section-head"><div class="profile-section-heading">Price history</div>
          <div class="range-tabs">${['30d', '90d', 'all'].map(r => `<button class="range-tab${ui.range === r ? ' active' : ''}" data-range="${r}">${r === 'all' ? 'All' : r}</button>`).join('')}</div>
        </div>
        ${priceChart(sales, record.price)}
      </div>`;

      // 6. Listings table
      const shown = ui.filter ? active.filter(l => String(l.collections.edition_number) === ui.filter) : active;
      html += `<div class="market-section">
        <div class="section-head"><div class="profile-section-heading">Listings (${active.length})</div>
          ${active.length ? `<input type="number" class="edition-filter" id="editionFilter" placeholder="Edition #" min="1" value="${esc(ui.filter)}">` : ''}
        </div>
        ${shown.length ? `<table class="market-table">
          <thead><tr><th>Edition</th><th>Seller</th><th>Ask</th><th>Listed</th><th></th></tr></thead>
          <tbody>${shown.map(l => `<tr>
            <td><a class="edition-link" href="/r/${id}/e/${l.collections.edition_number}" data-route="/r/${id}/e/${l.collections.edition_number}">#${l.collections.edition_number}</a> ${specialBadge(l.collections.edition_number, size)}</td>
            <td>${userLink(l.seller)}</td>
            <td>${cr(l.ask_price)}</td>
            <td>${timeAgo(l.created_at)}</td>
            <td>${l.seller_id === user?.id ? '<span class="muted">Yours</span>' : `<button class="action-btn buy-listing-btn" data-listing-id="${l.id}" ${!user ? 'disabled' : ''}>Buy</button>`}</td>
          </tr>`).join('')}</tbody></table>`
          : `<div class="chart-empty">${ui.filter ? `No listing for #${esc(ui.filter)}` : 'No copies listed'}</div>`}
      </div>`;

      // 6b. Offers
      if (data.offers.length) {
        html += `<div class="market-section">
          <div class="section-head"><div class="profile-section-heading">Offers (${data.offers.length})</div></div>
          <table class="market-table">
            <thead><tr><th>Offer</th><th>Edition</th><th>From</th><th>Expires</th><th></th></tr></thead>
            <tbody>${data.offers.map(o => {
              const mine = o.buyer_id === user?.id;
              const canAccept = !mine && eligibleCopies(o, owned, myListingFor).length > 0;
              const canDecline = canAccept && o.edition_number != null;
              return `<tr>
                <td>${cr(o.price)}</td>
                <td>${o.edition_number ? `<a class="edition-link" href="/r/${id}/e/${o.edition_number}" data-route="/r/${id}/e/${o.edition_number}">#${o.edition_number}</a>` : 'Any'}</td>
                <td>${userLink(o.buyer)}</td>
                <td>${timeLeft(o.expires_at)}</td>
                <td>${mine ? `<button class="action-btn text-btn cancel-offer-btn" data-offer-id="${o.id}">Cancel</button>`
                  : canAccept ? `${canDecline ? `<button class="action-btn text-btn decline-offer-btn" data-offer-id="${o.id}">Decline</button> ` : ''}<button class="action-btn accept-offer-btn" data-offer-id="${o.id}">Accept</button>` : ''}</td>
              </tr>`;
            }).join('')}</tbody></table>
        </div>`;
      }

      // 7. Supporters wall
      if (owners.length) {
        html += `<div class="market-section"><div class="profile-section-heading">Supporters</div>
          <div class="supporters">${owners.map(o => `<span class="supporter"><a class="edition-link" href="/r/${id}/e/${o.edition_number}" data-route="/r/${id}/e/${o.edition_number}">#${o.edition_number}</a> ${userLink(o.users)}</span>`).join('')}</div>
        </div>`;
      }

      // 8. Activity
      const events = [
        ...txs.map(t => ({ at: t.created_at, html: t.type === 'primary'
          ? `${userLink(t.buyer)} collected #${t.edition_number} for ${cr(t.price)}`
          : `${userLink(t.buyer)} bought #${t.edition_number} from ${userLink(t.seller)} for ${cr(t.price)}` })),
        ...data.allListings.map(l => ({ at: l.created_at, html: `${userLink(l.seller)} listed #${l.collections.edition_number} for ${cr(l.ask_price)}` })),
        ...data.allListings.filter(l => l.status === 'cancelled' && l.resolved_at).map(l => ({ at: l.resolved_at, html: `${userLink(l.seller)} cancelled the listing for #${l.collections.edition_number}` })),
      ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 15);
      if (events.length) {
        html += `<div class="market-section"><div class="profile-section-heading">Activity</div>
          <ul class="activity-list">${events.map(e => `<li><span>${e.html}</span><span class="muted">${timeAgo(e.at)}</span></li>`).join('')}</ul>
        </div>`;
      }

      marketEl.innerHTML = html;
      bind({ floor, minted, sellNow });
    };

    const refresh = async () => { await load(); draw(); };

    const fail = (error) => setStatus(
      error.message.includes('Sold out') ? 'Sold out!' :
      error.message.includes('Insufficient') ? 'Not enough credits.' :
      `Failed: ${error.message}`, 'error');

    const bind = ({ floor, minted, sellNow }) => {
      const balance = data.balance;

      const acceptOffer = async (offer) => {
        const res = await acceptOfferDialog({ offer, record, copies: eligibleCopies(offer, data.owned, data.myListingFor), fees, listingFor: data.myListingFor });
        if (!res) return;
        const { error } = await supabase.rpc('accept_offer', { p_offer_id: offer.id, p_collection_id: res.collectionId });
        if (error) fail(error); else setStatus(`Sold #${res.editionNumber} for ${cr(offer.price)}!`, 'success');
        await refresh();
      };
      document.getElementById('sellNowBtn')?.addEventListener('click', () => acceptOffer(sellNow.offer));
      marketEl.querySelectorAll('.accept-offer-btn').forEach(btn => btn.addEventListener('click', () =>
        acceptOffer(data.offers.find(o => o.id === btn.dataset.offerId))));
      marketEl.querySelectorAll('.decline-offer-btn').forEach(btn => btn.addEventListener('click', async () => {
        btn.disabled = true;
        const { error } = await supabase.rpc('decline_offer', { p_offer_id: btn.dataset.offerId });
        if (error) fail(error);
        await refresh();
      }));
      marketEl.querySelectorAll('.cancel-offer-btn').forEach(btn => btn.addEventListener('click', async () => {
        btn.disabled = true;
        const { error } = await supabase.rpc('cancel_offer', { p_offer_id: btn.dataset.offerId });
        if (error) fail(error); else setStatus('Offer cancelled, credits returned.', 'success');
        await refresh();
      }));

      document.getElementById('makeOfferBtn')?.addEventListener('click', async () => {
        const mintedNumbers = data.owners.filter(o => o.user_id !== user.id).map(o => o.edition_number);
        const res = await makeOfferDialog({ record, editions: mintedNumbers, balance, topOffer: data.offers[0]?.price, floor: data.stats.floor_ask });
        if (!res) return;
        const { error } = await supabase.rpc('place_offer', { p_record_id: id, p_price: res.price, p_edition: res.edition, p_days: res.days });
        if (error) fail(error); else setStatus(`Offer placed: ${cr(res.price)} held until it's accepted, cancelled or expires.`, 'success');
        await refresh();
      });

      document.getElementById('wantBtn')?.addEventListener('click', async () => {
        const fd = await formDialog({
          title: 'Add to wantlist',
          confirmLabel: 'Add',
          body: `<label class="form-field">Alert me when a copy is listed at or under (cr, optional)<input name="max" type="number" min="1" step="1" placeholder="Any price"></label>`,
        });
        if (!fd) return;
        const max = parseInt(fd.get('max'));
        const { error } = await supabase.from('wants').upsert({ user_id: user.id, record_id: id, max_price: max > 0 ? max : null });
        if (error) fail(error);
        await refresh();
      });
      document.getElementById('unwantBtn')?.addEventListener('click', async () => {
        await supabase.from('wants').delete().eq('user_id', user.id).eq('record_id', id);
        await refresh();
      });

      document.getElementById('collectBtn')?.addEventListener('click', async (e) => {
        const price = record.price;
        const s = splitSale(price, 'primary', fees);
        const ok = await confirmDialog({
          title: `Collect #${minted + 1} of ${record.edition_size}`,
          rows: [
            ['Price', cr(price), true],
            ['Artist receives', cr(s.proceeds)],
            ['Platform fee', cr(s.fee)],
            ['Your balance after', balance != null ? cr(balance - price) : '—'],
          ],
          note: balance != null && balance < price ? 'You do not have enough credits.' : '',
          confirmLabel: `Pay ${cr(price)}`,
        });
        if (!ok) return;
        e.target.disabled = true;
        const { error } = await supabase.rpc('purchase_edition', { p_record_id: id });
        if (error) fail(error); else setStatus('Collected!', 'success');
        await refresh();
      });

      const buyListing = async (listing, btn) => {
        const s = splitSale(listing.ask_price, 'secondary', fees);
        const ok = await confirmDialog({
          title: `Buy #${listing.collections.edition_number} of ${record.edition_size}`,
          rows: [
            ['Price', cr(listing.ask_price), true],
            [`Artist royalty (${fees.royalty_bps / 100}%)`, cr(s.royalty)],
            [`Platform fee (${fees.secondary_fee_bps / 100}%)`, cr(s.fee)],
            [`Seller receives`, cr(s.proceeds)],
            ['Your balance after', balance != null ? cr(balance - listing.ask_price) : '—'],
          ],
          note: balance != null && balance < listing.ask_price ? 'You do not have enough credits.' : '',
          confirmLabel: `Pay ${cr(listing.ask_price)}`,
        });
        if (!ok) return;
        if (btn) btn.disabled = true;
        const { error } = await supabase.rpc('buy_listing', { p_listing_id: listing.id });
        if (error) fail(error); else setStatus(`You bought #${listing.collections.edition_number}!`, 'success');
        await refresh();
      };

      document.getElementById('buyNowBtn')?.addEventListener('click', e => buyListing(floor, e.target));
      marketEl.querySelectorAll('.buy-listing-btn').forEach(btn => btn.addEventListener('click', () =>
        buyListing(data.active.find(l => l.id === btn.dataset.listingId), btn)));

      marketEl.querySelectorAll('.resale-price-input').forEach(input => input.addEventListener('input', () => {
        const note = marketEl.querySelector(`[data-receive-for="${input.dataset.collectionId}"]`);
        const price = parseInt(input.value);
        if (!note || !(price > 0)) return;
        const s = splitSale(price, 'secondary', fees);
        note.textContent = `You receive ${cr(s.proceeds)} (artist ${cr(s.royalty)} · fee ${cr(s.fee)})`;
      }));

      marketEl.querySelectorAll('.list-btn').forEach(btn => btn.addEventListener('click', async () => {
        const cid = btn.dataset.collectionId;
        const askPrice = parseInt(marketEl.querySelector(`.resale-price-input[data-collection-id="${cid}"]`).value);
        if (!(askPrice >= 1)) { setStatus('Enter a valid ask price.', 'error'); return; }
        btn.disabled = true;
        const { error } = await supabase.rpc('create_listing', { p_collection_id: cid, p_ask_price: askPrice });
        if (error) fail(error);
        await refresh();
      }));

      marketEl.querySelectorAll('.cancel-listing-btn').forEach(btn => btn.addEventListener('click', async () => {
        btn.disabled = true;
        const { error } = await supabase.rpc('cancel_listing', { p_listing_id: btn.dataset.listingId });
        if (error) fail(error);
        await refresh();
      }));

      marketEl.querySelectorAll('.range-tab').forEach(btn => btn.addEventListener('click', () => { ui.range = btn.dataset.range; draw(); }));

      const filterEl = document.getElementById('editionFilter');
      filterEl?.addEventListener('change', () => { ui.filter = filterEl.value.trim(); draw(); });
    };

    // Market data renders when it arrives; it no longer holds up the groove.
    refresh().catch(err => console.error('Market load failed:', err));
  }

  setStatus('Loading groove...');

  try {
    const [[{ Renderer }, { PlaybackManager }, { SkinManager, SKINS }], result] = await Promise.all([playerModules, groovePromise]);

    const geom = { ...GEOM_DEFAULTS };
    geom.Rout = result.Rout; geom.Rin = result.Rin; geom.cx = result.cx; geom.cy = result.cy;
    const duration = result.samples.length / result.sampleRate;

    document.getElementById('recordTotalTime').textContent = fmt(duration);
    setStatus('Ready', 'success');

    // Up next
    let upNextTimer = null;
    const upNextEl = document.getElementById('upNext');
    if (nextRecord) {
      const thumbPath = nextRecord.cover_path || nextRecord.thumbnail_path;
      const thumbUrl = thumbPath
        ? supabase.storage.from('records').getPublicUrl(thumbPath).data.publicUrl
        : null;
      const img = thumbUrl ? `<img class="up-next-thumb" src="${thumbUrl}" alt="">` : `<div class="up-next-thumb"></div>`;
      upNextEl.innerHTML = `
        ${img}
        <div class="up-next-info">
          <div class="up-next-label">Up Next</div>
          <div class="up-next-title">${esc(nextRecord.title)}</div>
          ${nextRecord.artist ? `<div class="up-next-artist">${esc(nextRecord.artist)}</div>` : ''}
        </div>
        <button class="up-next-cancel" id="upNextCancel" style="display:none">Cancel</button>`;
      upNextEl.style.display = 'flex';
      upNextEl.style.cursor = 'pointer';
      upNextEl.addEventListener('click', e => {
        if (e.target.id === 'upNextCancel') return;
        navigate(`/r/${nextRecord.id}`);
      });
    }

    const prevBtn = document.getElementById('recordPrevBtn');
    const nextBtn = document.getElementById('recordNextBtn');
    prevBtn.innerHTML = SVG_PREV;
    nextBtn.innerHTML = SVG_NEXT;
    if (prevRecord) { prevBtn.disabled = false; prevBtn.addEventListener('click', () => navigate(`/r/${prevRecord.id}`)); }
    if (nextRecord) { nextBtn.disabled = false; nextBtn.addEventListener('click', () => navigate(`/r/${nextRecord.id}`)); }

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
      onEnd: () => {
        if (!nextRecord) return;
        let secs = 3;
        const cancelBtn = document.getElementById('upNextCancel');
        if (cancelBtn) cancelBtn.style.display = 'block';
        const label = upNextEl.querySelector('.up-next-label');
        const tick = () => {
          if (label) label.textContent = `Playing next in ${secs}…`;
          if (secs === 0) { navigate(`/r/${nextRecord.id}`); return; }
          secs--;
          upNextTimer = setTimeout(tick, 1000);
        };
        tick();
        cancelBtn?.addEventListener('click', () => {
          clearTimeout(upNextTimer);
          if (label) label.textContent = 'Up Next';
          cancelBtn.style.display = 'none';
        });
      },
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
    supabase.rpc('increment_plays', { record_id: id }).then(({ error }) => {
      if (error) console.error('increment_plays error:', error);
    });

    return () => {
      playback.stop();
      clearTimeout(upNextTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    };
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, 'error');
  }
}
