// /r/:id is rewritten here so link previews (iMessage, X, Discord, Slack) show the record's cover and title.
// Browsers get the same SPA shell with the record's meta tags swapped in.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function getRecord(id) {
  if (!UUID.test(id) || !SUPABASE_URL || !SUPABASE_KEY) return null;
  const q = `${SUPABASE_URL}/rest/v1/records?id=eq.${id}&is_public=eq.true&select=title,artist,cover_path,thumbnail_path,users!records_user_id_fkey(username)&limit=1`;
  try {
    const res = await fetch(q, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (!res.ok) return null;
    return (await res.json())[0] || null;
  } catch { return null; }
}

export function metaFor(record, pageUrl) {
  const by = record.artist || (record.users?.username ? `@${record.users.username}` : '');
  const title = by ? `${record.title} — ${by}` : record.title;
  const path = record.cover_path || record.thumbnail_path;
  const image = path ? `${SUPABASE_URL}/storage/v1/object/public/records/${path.split('/').map(encodeURIComponent).join('/')}` : null;
  const desc = 'Hear it spin on Spiral Audio.';
  return [
    `<title>${esc(title)} · Spiral Audio</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:site_name" content="Spiral Audio">`,
    `<meta property="og:type" content="music.song">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : '',
  ].filter(Boolean).join('\n  ');
}

export async function GET(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const [shell, record] = await Promise.all([
    fetch(new URL('/index.html', url)).then(r => r.text()),
    getRecord(id),
  ]);
  const pageUrl = `${url.origin}/r/${id}`;
  const html = record
    ? shell.replace(/<!--og-->[\s\S]*?<!--\/og-->/, metaFor(record, pageUrl))
    : shell;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
