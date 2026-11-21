// /notifications — the signed-in user's alerts, newest first. Opening the page marks them read.
import { supabase } from '../supabase.js';
import { esc, cr, timeAgo, userLink, refreshBell } from '../ui.js';

function describe(n) {
  const rel = n.records ? `<a class="edition-link" href="/r/${n.records.id}${n.edition_number ? `/e/${n.edition_number}` : ''}" data-route="/r/${n.records.id}${n.edition_number ? `/e/${n.edition_number}` : ''}">${esc(n.records.title)}${n.edition_number ? ` #${n.edition_number}` : ''}</a>` : 'a release';
  const who = userLink(n.actor);
  switch (n.type) {
    case 'want_listed':       return `${rel} from your wantlist was listed for ${cr(n.amount)} by ${who}`;
    case 'offer_received':    return `${who} offered ${cr(n.amount)} for ${n.edition_number ? rel : `any edition of ${rel}`}`;
    case 'offer_accepted':    return `${who} accepted your ${cr(n.amount)} offer: ${rel} is yours`;
    case 'copy_sold':         return `Your ${rel} sold to ${who} for ${cr(n.amount)}`;
    case 'edition_collected': return `${who} collected ${rel} for ${cr(n.amount)}`;
    case 'followed_released': return `${who} released ${rel}`;
    default:                  return `${esc(n.type)} · ${rel}`;
  }
}

export async function notificationsView() {
  const view = document.getElementById('view');
  view.innerHTML = `<div class="feed-page"><div class="page-header"><h2 class="feed-title">Notifications</h2></div><div id="notifList"><div class="feed-loading">Loading...</div></div></div>`;
  const list = document.getElementById('notifList');
  if (!supabase) return;

  const { data: { user } = {} } = await supabase.auth.getUser().catch(() => ({ data: {} }));
  if (!user) { list.innerHTML = `<p class="feed-empty"><a href="/auth" data-route="/auth">Sign in</a> to see notifications.</p>`; return; }

  const { data, error } = await supabase.from('notifications')
    .select('id, type, edition_number, amount, read_at, created_at, records(id, title), actor:users!notifications_actor_id_fkey(username)')
    .order('created_at', { ascending: false }).limit(100);
  if (error) { list.innerHTML = `<p class="feed-empty">Failed to load: ${esc(error.message)}</p>`; return; }
  if (!data.length) {
    list.innerHTML = `<p class="feed-empty">Nothing yet. You'll hear here when an offer comes in, a copy sells, something on your wantlist is listed, or an artist you follow releases.</p>`;
    return;
  }
  list.innerHTML = `<ul class="activity-list notif-list">${data.map(n => `
    <li class="${n.read_at ? '' : 'unread'}"><span>${describe(n)}</span><span class="muted">${timeAgo(n.created_at)}</span></li>`).join('')}</ul>`;

  if (data.some(n => !n.read_at)) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    refreshBell();
  }
}
