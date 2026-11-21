// Shared view helpers: escaping, rarity, storage URLs, credit formatting, edition badges, confirm dialog.
import { supabase } from './supabase.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function rarityTier(editionSize) {
  if (editionSize <= 10) return { label: 'Ultra Rare', class: 'rarity-ultra' };
  if (editionSize <= 50) return { label: 'Rare', class: 'rarity-rare' };
  if (editionSize <= 250) return { label: 'Limited', class: 'rarity-limited' };
  return { label: 'Open Edition', class: 'rarity-open' };
}

export const publicUrl = path => path ? supabase.storage.from('records').getPublicUrl(path).data.publicUrl : null;

export const cr = n => n == null ? '—' : `${Number(n).toLocaleString()} cr`;

export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export const userLink = u => u?.username
  ? `<a href="/u/${encodeURIComponent(u.username)}" data-route="/u/${encodeURIComponent(u.username)}" class="user-link">@${esc(u.username)}</a>`
  : 'collector';

// Special-number badges (Top Shot): #1 and the last number of the edition.
export function specialBadge(n, size) {
  if (n === 1) return `<span class="edition-badge special">First</span>`;
  if (n === size && size > 1) return `<span class="edition-badge special">Last</span>`;
  return '';
}

// Fee rates in basis points, cached per page load.
let feePromise = null;
export function getFees() {
  feePromise ??= supabase.from('fee_config').select('*').single()
    .then(({ data }) => data ?? { royalty_bps: 1000, secondary_fee_bps: 500, primary_fee_bps: 500 });
  return feePromise;
}

// Mirrors settle_sale's rounding so previews match what the ledger records.
export function splitSale(price, type, fees) {
  const fee = Math.floor(price * (type === 'primary' ? fees.primary_fee_bps : fees.secondary_fee_bps) / 10000);
  const royalty = type === 'primary' ? 0 : Math.floor(price * fees.royalty_bps / 10000);
  return { fee, royalty, proceeds: price - fee - royalty };
}

// Modal confirm. rows: [[label, value], ...]. Resolves true on confirm.
export function confirmDialog({ title, rows, confirmLabel = 'Confirm', note = '' }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h3 class="modal-title">${esc(title)}</h3>
        <dl class="modal-rows">${rows.map(([k, v, strong]) =>
          `<div class="modal-row${strong ? ' strong' : ''}"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${note ? `<p class="modal-note">${esc(note)}</p>` : ''}
        <div class="modal-actions">
          <button class="action-btn text-btn" data-act="cancel">Cancel</button>
          <button class="action-btn" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const done = v => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    el.addEventListener('click', e => {
      if (e.target === el || e.target.dataset.act === 'cancel') done(false);
      else if (e.target.dataset.act === 'ok') done(true);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    el.querySelector('[data-act="ok"]').focus();
  });
}

// Hand-rolled SVG price history: resale points over time + original price as a dashed reference line.
export function priceChart(sales, originalPrice, { width = 560, height = 180 } = {}) {
  if (!sales.length) return `<div class="chart-empty">No resales yet${originalPrice ? ` · original price ${cr(originalPrice)}` : ''}</div>`;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const times = sales.map(s => new Date(s.created_at).getTime());
  const prices = sales.map(s => s.price);
  let t0 = Math.min(...times), t1 = Math.max(...times);
  if (t1 - t0 < 3600e3) { t0 -= 1800e3; t1 += 1800e3; }
  const vals = originalPrice ? [...prices, originalPrice] : prices;
  let p0 = Math.min(...vals), p1 = Math.max(...vals);
  const span = Math.max(1, p1 - p0); p0 = Math.max(0, p0 - span * 0.15); p1 += span * 0.15;
  const x = t => pad.l + (t - t0) / (t1 - t0) * (width - pad.l - pad.r);
  const y = p => pad.t + (1 - (p - p0) / (p1 - p0)) * (height - pad.t - pad.b);
  const ticks = [p0, (p0 + p1) / 2, p1].map(Math.round);
  const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const line = sales.length > 1 ? `<polyline class="chart-line" points="${sales.map((s, i) => `${x(times[i]).toFixed(1)},${y(s.price).toFixed(1)}`).join(' ')}"/>` : '';
  return `<svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Resale price history">
    ${ticks.map(p => `<line class="chart-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${y(p)}" y2="${y(p)}"/><text class="chart-axis" x="${pad.l - 6}" y="${y(p) + 4}" text-anchor="end">${p}</text>`).join('')}
    ${originalPrice ? `<line class="chart-ref" x1="${pad.l}" x2="${width - pad.r}" y1="${y(originalPrice)}" y2="${y(originalPrice)}"/><text class="chart-ref-label" x="${width - pad.r}" y="${y(originalPrice) - 4}" text-anchor="end">original ${originalPrice}</text>` : ''}
    ${line}
    ${sales.map((s, i) => `<circle class="chart-dot" cx="${x(times[i]).toFixed(1)}" cy="${y(s.price).toFixed(1)}" r="4"><title>#${s.edition_number} · ${cr(s.price)} · ${new Date(s.created_at).toLocaleString()}</title></circle>`).join('')}
    <text class="chart-axis" x="${pad.l}" y="${height - 6}">${fmtDate(t0)}</text>
    <text class="chart-axis" x="${width - pad.r}" y="${height - 6}" text-anchor="end">${fmtDate(t1)}</text>
  </svg>`;
}

// Modal with form fields. body = inner HTML of a <form>. Resolves FormData on submit, null on cancel.
// onMount(form) can wire live previews.
export function formDialog({ title, body, confirmLabel = 'Save', onMount }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h3 class="modal-title">${esc(title)}</h3>
        <form class="modal-form">${body}
          <div class="modal-actions">
            <button type="button" class="action-btn text-btn" data-act="cancel">Cancel</button>
            <button type="submit" class="action-btn">${esc(confirmLabel)}</button>
          </div>
        </form>
      </div>`;
    const form = el.querySelector('form');
    const done = v => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(null); };
    el.addEventListener('click', e => { if (e.target === el || e.target.dataset.act === 'cancel') done(null); });
    form.addEventListener('submit', e => { e.preventDefault(); done(new FormData(form)); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    onMount?.(form);
    form.querySelector('input, textarea, select')?.focus();
  });
}

// Unread notification count on the nav bell.
export async function refreshBell() {
  const countEl = document.getElementById('navBellCount');
  if (!countEl || !supabase) return;
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  countEl.textContent = count > 9 ? '9+' : String(count || '');
  countEl.hidden = !count;
}
