// Edition page /r/:id/e/:n — one numbered copy: current owner, listing, and its full provenance from the ledger.
import { supabase } from '../supabase.js';
import { esc, rarityTier, cr, timeAgo, userLink, specialBadge, publicUrl, getFees, splitSale, confirmDialog } from '../ui.js';

export async function editionView({ id, n }) {
  const num = parseInt(n);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="edition-page"><div class="status-line info" id="editionStatus">Loading edition...</div><div id="editionBody"></div></div>`;
  const setStatus = (msg, type = 'info') => {
    const el = document.getElementById('editionStatus');
    if (el) { el.textContent = msg; el.className = `status-line ${type}`; }
  };
  if (!supabase) { setStatus('Supabase not configured.', 'error'); return; }

  const { data: { user } = {} } = await supabase.auth.getUser().catch(() => ({ data: {} }));
  const fees = await getFees();

  const render = async () => {
    const [{ data: record }, { data: copy }, { data: txs }, { data: chainBreak }] = await Promise.all([
      supabase.from('records').select('id, title, artist, edition_size, cover_path, thumbnail_path, users(username)').eq('id', id).single(),
      supabase.from('collections').select('id, user_id, users(username)').eq('record_id', id).eq('edition_number', num).maybeSingle(),
      supabase.from('transactions')
        .select('id, type, price, royalty_amount, created_at, hash, buyer:users!transactions_buyer_id_fkey(username), seller:users!transactions_seller_id_fkey(username)')
        .eq('record_id', id).eq('edition_number', num)
        .order('created_at', { ascending: false }),
      supabase.rpc('verify_ledger'),
    ]);
    if (!record || !record.edition_size || !(num >= 1 && num <= record.edition_size)) { setStatus('Edition not found.', 'error'); return; }

    let listing = null;
    if (copy) {
      const { data } = await supabase.from('listings').select('id, ask_price, created_at, seller_id')
        .eq('collection_id', copy.id).eq('status', 'active').maybeSingle();
      listing = data;
    }
    const { data: me } = user ? await supabase.from('users').select('balance').eq('id', user.id).single() : { data: null };

    const rarity = rarityTier(record.edition_size);
    const cover = publicUrl(record.cover_path || record.thumbnail_path);
    const royalties = (txs ?? []).reduce((s, t) => s + (t.royalty_amount || 0), 0);
    setStatus(chainBreak ? 'Ledger check failed: a transaction does not match its hash.' : 'Ledger verified', chainBreak ? 'error' : 'success');

    document.getElementById('editionBody').innerHTML = `
      <div class="edition-head">
        ${cover ? `<img class="edition-cover" src="${cover}" alt="">` : ''}
        <div>
          <a class="edition-back" href="/r/${id}" data-route="/r/${id}">${esc(record.title)}</a>
          <div class="record-artist">${esc(record.artist || '')}${record.users?.username ? ` · ${userLink(record.users)}` : ''}</div>
          <h1 class="edition-number">#${num} <span class="muted">of ${record.edition_size}</span></h1>
          <div class="record-edition">
            <span class="edition-badge rarity ${rarity.class}">${rarity.label}</span>
            ${specialBadge(num, record.edition_size)}
            ${listing ? `<span class="edition-badge listed">Listed at ${cr(listing.ask_price)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="price-strip">
        <div class="price-cell"><span class="price-label">Owner</span><span class="price-value">${copy ? userLink(copy.users) : '<span class="muted">Not minted yet</span>'}</span></div>
        <div class="price-cell"><span class="price-label">Last price</span><span class="price-value">${cr(txs?.[0]?.price)}</span></div>
        <div class="price-cell"><span class="price-label">Times sold</span><span class="price-value">${txs?.length ?? 0}</span></div>
        <div class="price-cell"><span class="price-label">Royalties paid</span><span class="price-value">${cr(royalties)}</span></div>
      </div>
      ${listing && user && listing.seller_id !== user.id ? `<div class="market-actions"><button class="action-btn" id="editionBuyBtn">Buy #${num} — ${cr(listing.ask_price)}</button><span class="balance-note">Balance ${cr(me?.balance)}</span></div>` : ''}
      <div class="market-section">
        <div class="profile-section-heading">Provenance</div>
        ${txs?.length ? `<table class="market-table">
          <thead><tr><th>When</th><th>Event</th><th>Price</th><th>Ledger hash</th></tr></thead>
          <tbody>${txs.map(t => `<tr>
            <td title="${new Date(t.created_at).toLocaleString()}">${timeAgo(t.created_at)}</td>
            <td>${t.type === 'primary' ? `${userLink(t.buyer)} collected from the artist` : `${userLink(t.buyer)} bought from ${userLink(t.seller)}`}</td>
            <td>${cr(t.price)}</td>
            <td><code class="hash" title="${esc(t.hash || '')}">${t.hash ? esc(t.hash.slice(0, 12)) + '…' : '—'}</code></td>
          </tr>`).join('')}</tbody></table>`
          : `<div class="chart-empty">No ledger history for this copy yet</div>`}
      </div>`;

    document.getElementById('editionBuyBtn')?.addEventListener('click', async (e) => {
      const s = splitSale(listing.ask_price, 'secondary', fees);
      const ok = await confirmDialog({
        title: `Buy #${num} of ${record.edition_size}`,
        rows: [
          ['Price', cr(listing.ask_price), true],
          [`Artist royalty (${fees.royalty_bps / 100}%)`, cr(s.royalty)],
          [`Platform fee (${fees.secondary_fee_bps / 100}%)`, cr(s.fee)],
          ['Seller receives', cr(s.proceeds)],
          ['Your balance after', me ? cr(me.balance - listing.ask_price) : '—'],
        ],
        note: me && me.balance < listing.ask_price ? 'You do not have enough credits.' : '',
        confirmLabel: `Pay ${cr(listing.ask_price)}`,
      });
      if (!ok) return;
      e.target.disabled = true;
      const { error } = await supabase.rpc('buy_listing', { p_listing_id: listing.id });
      await render();
      if (error) setStatus(error.message.includes('Insufficient') ? 'Not enough credits.' : `Failed: ${error.message}`, 'error');
      else setStatus(`You bought #${num}!`, 'success');
    });
  };

  await render();
}
