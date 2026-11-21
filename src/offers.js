// Offer dialogs shared by the release page, edition page and profile.
import { esc, cr, splitSale, formDialog } from './ui.js';

// Your copies that can fill an offer: any copy for an any-edition offer, else the named number.
// Unlisted copies first, then the highest number (so low numbers are kept).
export function eligibleCopies(offer, owned, listingFor = new Map()) {
  return owned
    .filter(c => offer.edition_number == null || c.edition_number === offer.edition_number)
    .sort((a, b) => (listingFor.has(a.id) - listingFor.has(b.id)) || b.edition_number - a.edition_number);
}

// Resolves { price, edition (number|null), days } or null.
export async function makeOfferDialog({ record, editions = [], fixedEdition = null, balance = null, topOffer = null, floor = null }) {
  const hints = [floor != null ? `Lowest ask ${cr(floor)}` : '', topOffer != null ? `Highest offer ${cr(topOffer)}` : '', balance != null ? `Your balance ${cr(balance)}` : ''].filter(Boolean).join(' · ');
  const editionField = fixedEdition != null
    ? `<input type="hidden" name="edition" value="${fixedEdition}">`
    : `<label class="form-field">Edition<select name="edition">
        <option value="">Any edition</option>
        ${[...new Set(editions)].sort((a, b) => a - b).map(n => `<option value="${n}">#${n} only</option>`).join('')}
      </select></label>`;
  const fd = await formDialog({
    title: `Make an offer on ${record.title}${fixedEdition != null ? ` #${fixedEdition}` : ''}`,
    confirmLabel: 'Place offer',
    body: `
      <label class="form-field">Your offer (cr)<input name="price" type="number" min="1" step="1" required></label>
      ${editionField}
      <label class="form-field">Expires in<select name="days">
        <option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="30">30 days</option>
      </select></label>
      <p class="receive-note">${esc(hints)}</p>
      <p class="receive-note">The credits are held from your balance until the offer is accepted, cancelled or expires. If it's accepted, the artist gets their royalty as with any resale.</p>`,
  });
  if (!fd) return null;
  const price = parseInt(fd.get('price'));
  if (!(price >= 1)) return null;
  const ed = parseInt(fd.get('edition'));
  return { price, edition: ed > 0 ? ed : null, days: parseInt(fd.get('days')) || 7 };
}

// Resolves { collectionId, editionNumber } or null.
export async function acceptOfferDialog({ offer, record, copies, fees, listingFor = new Map() }) {
  if (!copies.length) return null;
  const s = splitSale(offer.price, 'secondary', fees);
  const copyField = copies.length > 1
    ? `<label class="form-field">Sell which copy?<select name="copy">${copies.map(c =>
        `<option value="${c.id}">#${c.edition_number}${listingFor.has(c.id) ? ' (listed: listing will be cancelled)' : ''}</option>`).join('')}</select></label>`
    : `<input type="hidden" name="copy" value="${copies[0].id}">`;
  const fd = await formDialog({
    title: `Sell ${record.title}${copies.length === 1 ? ` #${copies[0].edition_number}` : ''} for ${cr(offer.price)}`,
    confirmLabel: `Accept ${cr(offer.price)}`,
    body: `
      ${copyField}
      <dl class="modal-rows">
        <div class="modal-row strong"><dt>Offer</dt><dd>${cr(offer.price)}</dd></div>
        <div class="modal-row"><dt>Artist royalty (${fees.royalty_bps / 100}%)</dt><dd>${cr(s.royalty)}</dd></div>
        <div class="modal-row"><dt>Platform fee (${fees.secondary_fee_bps / 100}%)</dt><dd>${cr(s.fee)}</dd></div>
        <div class="modal-row strong"><dt>You receive</dt><dd>${cr(s.proceeds)}</dd></div>
      </dl>`,
  });
  if (!fd) return null;
  const c = copies.find(x => x.id === fd.get('copy')) ?? copies[0];
  return { collectionId: c.id, editionNumber: c.edition_number };
}
