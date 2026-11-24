import { supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { TAU } from '../constants.js';
import { skinSwitcherHtml, mountSkinSwitcher } from '../skin-switcher.js';
import { player, getGroove, fetchRecord, queueFor, coverUrl, GEOM_DEFAULTS } from '../player.js';
import { esc, rarityTier, cr, timeAgo, userLink, specialBadge, getFees, splitSale, confirmDialog, priceChart, formDialog } from '../ui.js';
import { makeOfferDialog, acceptOfferDialog, eligibleCopies } from '../offers.js';

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
    <div class="record-page hw">
      <section class="hw-top">
        <div class="hw-deck">
          <img class="hw-glow" id="hwGlow" alt="" aria-hidden="true" hidden>
          <div class="hw-vignette" aria-hidden="true"></div>
          <div class="hw-gridlines" aria-hidden="true"></div>
          <div class="hw-head"><span class="hw-label">A1 · PLAYBACK</span>${skinSwitcherHtml()}</div>
          <div class="hw-disc">
            <div class="hw-disc-ring" aria-hidden="true"></div>
            <canvas id="recordCanvas" width="1000" height="1000"></canvas>
            <span class="hw-tick" aria-hidden="true"></span>
            <span class="hw-deg left" aria-hidden="true">270</span><span class="hw-deg right" aria-hidden="true">090</span>
          </div>
          <div class="hw-specs hw-label" id="hwSpecs"></div>
          <div class="hw-transport">
            <div class="play-wrap" id="recordPlayWrap">
              <div class="play-ring"></div>
              <button class="play-btn" id="recordPlayBtn" disabled aria-label="Play"></button>
            </div>
            <button class="skip-btn" id="recordPrevBtn" disabled aria-label="Previous record"></button>
            <button class="skip-btn" id="recordNextBtn" disabled aria-label="Next record"></button>
            <div class="hw-timebar">
              <span id="recordCurrentTime">0:00</span>
              <span class="hw-progress"><span id="hwProgress"></span></span>
              <span id="recordTotalTime" class="dim">0:00</span>
            </div>
          </div>
        </div>
        <aside class="hw-release">
          <div class="hw-head"><span class="hw-label">B1 · RELEASE</span><span class="status-line info" id="recordStatus">Loading</span></div>
          <h1 id="recordTitle"></h1>
          <div class="record-artist" id="recordArtist"></div>
          <div class="record-meta" id="recordMeta"></div>
          <img class="hw-cover" id="recordCover" alt="" hidden>
          <div id="hwEdition"></div>
          <div class="up-next" id="upNext" style="display:none"></div>
        </aside>
      </section>
      <section class="hw-strip" id="hwStrip"></section>
      <section class="hw-lower">
        <div class="hw-book" id="hwBook"></div>
        <div class="hw-side" id="hwSide"></div>
      </section>
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
  const groovePromise = player.record?.id === id ? Promise.resolve(player.groove) : getGroove(record);
  groovePromise.catch(() => {});
  const queuePromise = queueFor(record).catch(() => [id]);
  const playerModules = Promise.all([import('../renderer.js'), import('../skin.js')]);

  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Cover art
  // Cover art, and its blurred glow behind the deck
  const coverPath = record.cover_path || record.thumbnail_path;
  if (coverPath) {
    const coverUrl = supabase.storage.from('records').getPublicUrl(coverPath).data.publicUrl;
    const coverEl = document.getElementById('recordCover');
    coverEl.src = coverUrl;
    coverEl.alt = `Cover art for ${record.title}`;
    coverEl.hidden = false;
    const glow = document.getElementById('hwGlow');
    glow.src = coverUrl;
    glow.hidden = false;
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

  const { data: { user } = {} } = await supabase.auth.getUser().catch(() => ({ data: {} }));
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
    const marketEl = document.querySelector('.record-page');

    const fees = await getFees();
    const ui = { range: 'all', filter: '' };
    let data = null;

    const load = async () => {
      const [stats, listings, owners, txs, me, offers, want, ledger] = await Promise.all([
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
        user ? supabase.from('users').select('balance, held_balance').eq('id', user.id).single() : Promise.resolve({ data: null }),
        supabase.from('offers')
          .select('id, price, edition_number, expires_at, created_at, buyer_id, buyer:users!offers_buyer_id_fkey(username)')
          .eq('record_id', id).eq('status', 'active').gt('expires_at', new Date().toISOString())
          .order('price', { ascending: false }),
        user ? supabase.from('wants').select('max_price').eq('user_id', user.id).eq('record_id', id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.rpc('verify_ledger'),
      ]);
      const allListings = listings.data ?? [];
      data = {
        stats: stats.data ?? {},
        active: allListings.filter(l => l.status === 'active').sort((a, b) => a.ask_price - b.ask_price),
        allListings,
        owners: owners.data ?? [],
        txs: txs.data ?? [],
        balance: me.data?.balance ?? null,
        held: me.data?.held_balance ?? 0,
        ledgerOk: ledger.error ? null : ledger.data == null,
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

      const pad = (n, w = 3) => n == null ? '---' : (n < 10 ** w ? String(n).padStart(w, '0') : n.toLocaleString());
      const edW = size >= 100 ? 3 : 2;
      const ed = n => `#${String(n).padStart(edW, '0')}`;
      const star = n => (n === 1 || (n === size && size > 1)) ? ` <span class="hw-star" title="${n === 1 ? 'First' : 'Last'} edition">★</span>` : '';
      const edLink = n => `<a class="edition-link" href="/r/${id}/e/${n}" data-route="/r/${id}/e/${n}">${ed(n)}</a>`;
      const age = ts => timeAgo(ts).replace(' ago', '').replace('just now', 'now').toUpperCase();
      const handle = u => u?.username ? userLink(u) : 'collector';
      const ownedNums = new Set(owned.map(o => o.edition_number));

      // ── B1 · Release: edition meter, actions, your copies ──
      let rel = `<div class="hw-meter">
        <div class="hw-meter-head"><span>EDITION</span><span><b>${pad(minted, 2)}</b>/${size} MINTED · ${ownerCount} ${ownerCount === 1 ? 'HOLDER' : 'HOLDERS'}</span></div>`;
      if (size <= 50) {
        rel += `<div class="hw-cells" style="grid-template-columns: repeat(${Math.min(size, 10)}, minmax(0, 1fr))">${
          Array.from({ length: size }, (_, i) => `<span class="hw-cell${i < minted ? ' on' : ''}${ownedNums.has(i + 1) ? ' mine' : ''}" title="${ed(i + 1)}${i < minted ? ' minted' : ''}"></span>`).join('')}</div>`;
      } else {
        rel += `<div class="hw-bar"><span style="width:${(minted / size * 100).toFixed(1)}%"></span></div>`;
      }
      rel += `<div class="hw-meter-foot"><span>CLASS · ${rarity.label.toUpperCase()}</span>${left <= 0 ? '<span class="hw-accent">SOLD OUT</span>' : `<span>${left} LEFT</span>`}</div>
        ${owned.length ? `<div class="hw-meter-foot"><span>YOU HOLD ${owned.map(o => ed(o.edition_number)).join(' ')}</span></div>` : ''}
      </div>`;

      rel += `<div class="hw-actions">`;
      if (!user) {
        rel += `<a class="hw-btn" href="/auth" data-route="/auth"><span>SIGN IN TO COLLECT</span><span>→</span></a>`;
      } else {
        if (left > 0 && record.price) rel += `<button class="hw-btn primary" id="collectBtn"><span>COLLECT ${ed(minted + 1)}</span><span>${pad(record.price)} CR</span></button>`;
        if (floor) rel += `<button class="hw-btn" id="buyNowBtn"><span>BUY ${ed(floor.collections.edition_number)}</span><span>${pad(floor.ask_price)} CR</span></button>`;
        if (sellNow) rel += `<button class="hw-btn accent" id="sellNowBtn"><span>SELL ${ed(sellNow.copy.edition_number)} NOW</span><span>${pad(sellNow.offer.price)} CR</span></button>`;
        rel += `<div class="hw-btn-row">
          ${minted > 0 ? `<button class="hw-btn small" id="makeOfferBtn">MAKE OFFER</button>` : ''}
          ${data.want
            ? `<button class="hw-btn small" id="unwantBtn" title="Remove from wantlist">WANTED${data.want.max_price ? ` ≤${pad(data.want.max_price)}` : ''} ✕</button>`
            : `<button class="hw-btn small" id="wantBtn">+ WANTLIST</button>`}
        </div>`;
        if (balance != null) rel += `<div class="hw-balance">BAL <b>${pad(balance, 4)}</b> CR${data.held ? ` · ${pad(data.held)} HELD` : ''}</div>`;
      }
      rel += `</div>`;

      if (owned.length) {
        rel += `<div class="hw-copies"><div class="hw-label">B2 · YOUR COPIES</div>${owned.map(o => {
          const l = myListingFor.get(o.id);
          return l ? `<div class="hw-copy">${edLink(o.edition_number)}${star(o.edition_number)}
              <span class="hw-tag">LISTED ${pad(l.ask_price)}</span>
              <button class="hw-btn small cancel-listing-btn" data-listing-id="${l.id}">CANCEL</button></div>`
            : `<div class="hw-copy">${edLink(o.edition_number)}${star(o.edition_number)}
              <input type="number" class="resale-price-input hw-input" data-collection-id="${o.id}" placeholder="ASK" min="1" step="1" aria-label="Ask price for ${ed(o.edition_number)}">
              <button class="hw-btn small list-btn" data-collection-id="${o.id}">LIST</button>
              <span class="receive-note hw-note" data-receive-for="${o.id}">${[stats.floor_ask ? `FLOOR ${pad(stats.floor_ask)}` : '', lastSale ? `LAST ${pad(lastSale)}` : ''].filter(Boolean).join(' · ')}</span></div>`;
        }).join('')}</div>`;
      }
      document.getElementById('hwEdition').innerHTML = rel;

      // ── Price readout ──
      document.getElementById('hwStrip').innerHTML = `
        <div class="hw-cellx"><span class="hw-label">LOWEST ASK</span><span class="hw-num">${pad(stats.floor_ask)}</span></div>
        <div class="hw-cellx"><span class="hw-label">HIGHEST OFFER${data.offers.length ? ` · ${data.offers.length}` : ''}</span><span class="hw-num${data.offers.length ? '' : ' dim'}">${pad(data.offers[0]?.price)}</span></div>
        <div class="hw-cellx"><span class="hw-label">LAST SALE${stats.last_sale_at ? ` · ${age(stats.last_sale_at)}` : ''}</span><span class="hw-num${lastSale == null ? ' dim' : ''}">${pad(lastSale)}</span></div>
        <div class="hw-cellx"><span class="hw-label">ORIGINAL · DELTA</span><span class="hw-num">${pad(record.price)}${premium != null ? ` <span class="hw-delta ${premium >= 0 ? 'up' : 'down'}">${premium >= 0 ? '+' : ''}${premium}%</span>` : ''}</span></div>`;

      // ── C1 · Order book (asks + bids) and C2 · price ──
      const asks = ui.filter ? active.filter(l => String(l.collections.edition_number) === ui.filter) : active;
      const bids = ui.filter ? data.offers.filter(o => o.edition_number == null || String(o.edition_number) === ui.filter) : data.offers;
      const askRows = asks.map(l => `<tr>
          <td class="hw-accent">ASK</td>
          <td>${edLink(l.collections.edition_number)}${star(l.collections.edition_number)}</td>
          <td>${handle(l.seller)}</td>
          <td>${pad(l.ask_price)}</td>
          <td class="dim">${age(l.created_at)}</td>
          <td>${l.seller_id === user?.id ? '<span class="dim">YOURS</span>' : `<button class="hw-btn small buy-listing-btn" data-listing-id="${l.id}" ${!user ? 'disabled' : ''}>BUY</button>`}</td>
        </tr>`).join('');
      const bidRows = bids.map(o => {
        const mine = o.buyer_id === user?.id;
        const canAccept = !mine && eligibleCopies(o, owned, myListingFor).length > 0;
        const canDecline = canAccept && o.edition_number != null;
        return `<tr>
          <td>BID</td>
          <td>${o.edition_number ? edLink(o.edition_number) : 'ANY'}</td>
          <td>${handle(o.buyer)}</td>
          <td>${pad(o.price)}</td>
          <td class="dim">${timeLeft(o.expires_at).toUpperCase()}</td>
          <td>${mine ? `<button class="hw-btn small cancel-offer-btn" data-offer-id="${o.id}">CANCEL</button>`
            : canAccept ? `${canDecline ? `<button class="hw-btn small decline-offer-btn" data-offer-id="${o.id}">DECLINE</button> ` : ''}<button class="hw-btn small accent accept-offer-btn" data-offer-id="${o.id}">ACCEPT</button>` : ''}</td>
        </tr>`;
      }).join('');
      const cutoff = ui.range === 'all' ? 0 : Date.now() - (ui.range === '30d' ? 30 : 90) * 86400e3;
      const sales = txs.filter(t => t.type === 'secondary' && new Date(t.created_at).getTime() >= cutoff).reverse();
      document.getElementById('hwBook').innerHTML = `
        <div class="hw-head"><span class="hw-label">C1 · ORDER BOOK</span>
          ${active.length + data.offers.length ? `<input type="number" class="hw-input" id="editionFilter" placeholder="ED #" min="1" value="${esc(ui.filter)}" aria-label="Filter by edition number">` : ''}</div>
        <div class="hw-scroll"><table class="hw-table">
          <thead><tr><th>SIDE</th><th>ED.</th><th>HOLDER</th><th>PRICE</th><th>AGE</th><th></th></tr></thead>
          <tbody>${askRows || `<tr><td class="hw-accent">ASK</td><td colspan="5" class="dim">${ui.filter ? `NO ASK FOR #${esc(ui.filter)}` : 'NO COPIES LISTED'}</td></tr>`}
          ${bidRows || `<tr><td>BID</td><td colspan="5" class="dim">NO OPEN OFFERS</td></tr>`}</tbody>
        </table></div>
        <div class="hw-head hw-gap"><span class="hw-label">C2 · PRICE · ${ui.range.toUpperCase()}</span>
          <div class="range-tabs">${['30d', '90d', 'all'].map(r => `<button class="range-tab${ui.range === r ? ' active' : ''}" data-range="${r}">${r.toUpperCase()}</button>`).join('')}</div></div>
        ${priceChart(sales, record.price)}`;

      // ── D1 · Holders and D2 · Log ──
      const log = [
        ...txs.map(t => ({ at: t.created_at, text: t.type === 'primary'
          ? `MINT ${edLink(t.edition_number)} → ${handle(t.buyer)} ${pad(t.price)}`
          : `SALE ${edLink(t.edition_number)} ${handle(t.seller)} → ${handle(t.buyer)} ${pad(t.price)}` })),
        ...data.allListings.map(l => ({ at: l.created_at, text: `LIST ${edLink(l.collections.edition_number)} ${handle(l.seller)} ${pad(l.ask_price)}` })),
        ...data.allListings.filter(l => l.status === 'cancelled' && l.resolved_at).map(l => ({ at: l.resolved_at, text: `DELIST ${edLink(l.collections.edition_number)} ${handle(l.seller)}` })),
      ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20);
      document.getElementById('hwSide').innerHTML = `
        <div class="hw-label">D1 · HOLDERS</div>
        ${owners.length ? `<div class="hw-list">${owners.map(o => `<div class="hw-row"><span>${edLink(o.edition_number)}${star(o.edition_number)}</span><span>${handle(o.users)}</span></div>`).join('')}</div>`
          : '<div class="hw-row dim">NONE MINTED YET</div>'}
        <div class="hw-label hw-gap">D2 · LOG</div>
        <div class="hw-log">${log.map(e => `<div><span class="dim">${age(e.at)}</span><span>${e.text}</span></div>`).join('') || '<div class="dim">NO ACTIVITY</div>'}
          <div class="hw-ledger"><span>LEDGER</span>${data.ledgerOk === false ? '<span class="down">● CHECK FAILED</span>' : data.ledgerOk ? '<span class="hw-accent">● VERIFIED</span>' : '<span class="dim">● —</span>'}</div>
        </div>`;

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
    const [[{ Renderer }, { SkinManager, SKINS }], result, queue] = await Promise.all([playerModules, groovePromise, queuePromise]);

    const geom = { ...GEOM_DEFAULTS, Rout: result.Rout, Rin: result.Rin, cx: result.cx, cy: result.cy };
    const duration = result.samples.length / result.sampleRate;
    const turns = result.turns || 1;

    document.getElementById('recordTotalTime').textContent = fmt(duration);
    document.getElementById('hwSpecs').textContent =
      `${(result.sampleRate / 1000).toFixed(1)} KHZ · ${result.samplesR ? 'STEREO' : 'MONO'} · ${Math.round(result.turns)} TURNS`;
    setStatus('', 'success');

    // This page drives the app-wide player when it holds this record; otherwise the deck keeps its own
    // position until Play hands the record to the player.
    const isMine = () => player.record?.id === id;
    const myQueue = () => isMine() ? player.queue : queue;
    const neighbor = d => { const q = myQueue(); const i = q.indexOf(id); return i >= 0 ? q[i + d] ?? null : null; };
    const local = { rotation: 0, progress: 0, touched: false };

    const skin = new SkinManager().restore() || SKINS.owl;
    const renderer = new Renderer(document.getElementById('recordCanvas'));
    renderer.setSkin(skin.canvas, result.groovePoints, geom);

    const timeEl = document.getElementById('recordCurrentTime');
    const progressEl = document.getElementById('hwProgress');
    let lastTimeText = '';
    const showPosition = p => {
      const t = fmt(Math.max(0, p) * duration);
      if (t !== lastTimeText) { lastTimeText = t; timeEl.textContent = t; }
      progressEl.style.transform = `scaleX(${Math.max(0, Math.min(1, p)).toFixed(4)})`;
    };
    const redraw = () => {
      if (isMine()) {
        renderer.drawDiscWithGroove(player.discRotation, player.progress, geom);
        showPosition(player.progress);
      } else {
        renderer.drawDiscWithGroove(local.rotation, local.touched ? local.progress : -1, geom);
        showPosition(local.progress);
      }
    };
    const offFrame = player.onFrame(f => {
      if (!isMine()) return;
      renderer.drawDiscWithGroove(f.rotation, f.progress, geom, f.amplitude, f.freq);
      showPosition(f.progress);
    });

    // ── Transport, up next ──
    const btn = document.getElementById('recordPlayBtn');
    const wrap = document.getElementById('recordPlayWrap');
    const prevBtn = document.getElementById('recordPrevBtn');
    const nextBtn = document.getElementById('recordNextBtn');
    const upNextEl = document.getElementById('upNext');
    prevBtn.innerHTML = SVG_PREV;
    nextBtn.innerHTML = SVG_NEXT;
    btn.disabled = false;

    const goTo = d => {
      const target = neighbor(d);
      if (!target) return;
      if (isMine()) player.skipTo(target);
      else navigate(`/r/${target}`);
    };
    prevBtn.addEventListener('click', () => goTo(-1));
    nextBtn.addEventListener('click', () => goTo(1));
    upNextEl.addEventListener('click', e => {
      if (e.target.closest('#upNextCancel')) { player.cancelCountdown(); return; }
      goTo(1);
    });

    let upNextShown = null;
    const renderUpNext = async () => {
      const nextId = neighbor(1);
      if (!nextId) { upNextEl.style.display = 'none'; upNextShown = null; return; }
      if (upNextShown !== nextId) {
        upNextShown = nextId;
        const r = await fetchRecord(nextId).catch(() => null);
        if (!r || upNextShown !== nextId) return;
        const art = coverUrl(r);
        upNextEl.innerHTML = `
          ${art ? `<img class="up-next-thumb" src="${art}" alt="">` : '<div class="up-next-thumb"></div>'}
          <div class="up-next-info">
            <div class="up-next-label">Up Next</div>
            <div class="up-next-title">${esc(r.title)}</div>
            ${r.artist ? `<div class="up-next-artist">${esc(r.artist)}</div>` : ''}
          </div>
          <button class="up-next-cancel" id="upNextCancel" style="display:none">Cancel</button>`;
        upNextEl.style.display = 'flex';
        upNextEl.style.cursor = 'pointer';
      }
      const counting = isMine() && player.countdown !== null;
      const label = upNextEl.querySelector('.up-next-label');
      const cancel = upNextEl.querySelector('#upNextCancel');
      if (label) label.textContent = counting ? `Playing next in ${player.countdown}…` : 'Up Next';
      if (cancel) cancel.style.display = counting ? 'block' : 'none';
    };

    const renderState = () => {
      const playing = isMine() && player.playing;
      btn.innerHTML = playing ? SVG_PAUSE : SVG_PLAY;
      btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      wrap.classList.toggle('playing', playing);
      if (isMine() && !player.pm.isPlaying) redraw();
      prevBtn.disabled = !neighbor(-1);
      nextBtn.disabled = !neighbor(1);
      renderUpNext();
    };
    const offState = player.onChange(renderState);

    btn.addEventListener('click', () => {
      if (isMine()) player.toggle();
      else player.playRecord(record, result, queue.includes(id) ? queue : [id], local.progress);
    });

    // ── Scrub: tap or drag the progress bar ──
    const barEl = progressEl.parentElement;
    const seekFromBar = e => {
      const r = barEl.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (isMine()) { player.seek(p); if (!player.pm.isPlaying) redraw(); }
      else { local.progress = p; local.touched = true; redraw(); }
    };
    barEl.addEventListener('pointerdown', e => { barEl.setPointerCapture(e.pointerId); seekFromBar(e); });
    barEl.addEventListener('pointermove', e => { if (barEl.hasPointerCapture(e.pointerId)) seekFromBar(e); });

    // ── Scratch: grab the groove and spin it by hand ──
    const canvasEl = renderer.canvas;
    const discEl = canvasEl.parentElement;
    const toCanvas = e => {
      const r = canvasEl.getBoundingClientRect(), k = canvasEl.width / r.width;
      return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
    };
    let dragging = false, dragDisc = 0, lastAngle = 0, lastMove = 0;
    discEl.addEventListener('pointerdown', e => {
      const hit = renderer.hitTest(...toCanvas(e), geom);
      if (!hit) return;
      dragging = true; dragDisc = hit.index;
      lastAngle = hit.angle; lastMove = performance.now();
      discEl.setPointerCapture(e.pointerId);
      discEl.classList.add('grabbing');
      if (isMine()) player.beginDrag();
    });
    discEl.addEventListener('pointermove', e => {
      if (!dragging) return;
      const now = performance.now();
      const dt = Math.max(now - lastMove, 1) / 1000;
      const angle = renderer.angleOn(dragDisc, ...toCanvas(e), geom);
      let delta = angle - lastAngle;
      if (delta > Math.PI) delta -= TAU;
      if (delta < -Math.PI) delta += TAU;
      lastAngle = angle; lastMove = now;
      if (isMine()) {
        player.dragBy(delta, dt);
        if (!player.pm.isPlaying) redraw();
      } else {
        local.rotation += delta;
        local.progress = Math.max(0, Math.min(1, local.progress + delta / (turns * TAU)));
        local.touched = true;
        redraw();
      }
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      discEl.classList.remove('grabbing');
      if (isMine()) player.endDrag();
    };
    discEl.addEventListener('pointerup', endDrag);
    discEl.addEventListener('pointercancel', endDrag);

    mountSkinSwitcher(document.querySelector('.hw-deck .skin-picker'), next => {
      renderer.setSkin(next.canvas, result.groovePoints, geom);
      redraw();
    });

    redraw();
    renderState();

    // Audio keeps playing after you leave; the mini player takes over.
    return () => { offFrame(); offState(); };
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, 'error');
  }
}
