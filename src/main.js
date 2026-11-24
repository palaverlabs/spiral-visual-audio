import './style.css';
import { route, navigate, redirect, start } from './router.js';
import { supabase } from './supabase.js';
import { refreshBell } from './ui.js';

// Hamburger toggle
const hamburger = document.getElementById('navHamburger');
const drawer = document.getElementById('navDrawer');
hamburger?.addEventListener('click', () => drawer?.classList.toggle('open'));

// Intercept all [data-route] clicks for SPA navigation
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-route]');
  if (!link) return;
  drawer?.classList.remove('open'); // close drawer on any nav
  const r = link.dataset.route;
  if (r === '__signout') {
    e.preventDefault();
    if (supabase) supabase.auth.signOut().then(() => { updateNav(); navigate('/'); });
    return;
  }
  if (r) { e.preventDefault(); navigate(r); }
});

async function updateNav() {
  const link = document.getElementById('navAuthLink');
  const linkMobile = document.getElementById('navAuthLinkMobile');
  if (!link) return;
  if (!supabase) { link.textContent = 'Sign In'; if (linkMobile) linkMobile.textContent = 'Sign In'; return; }
  try {
    const { data } = await supabase.auth.getUser();
    const bell = document.getElementById('navBell');
    const bellMobile = document.getElementById('navBellMobile');
    if (bell) bell.hidden = !data?.user;
    if (bellMobile) bellMobile.hidden = !data?.user;
    if (data?.user) refreshBell();
    if (data?.user) {
      for (const el of [link, linkMobile]) {
        if (!el) continue;
        el.textContent = 'Sign Out';
        el.dataset.route = '__signout';
        el.removeAttribute('href');
      }
    } else {
      for (const el of [link, linkMobile]) {
        if (!el) continue;
        el.textContent = 'Sign In';
        el.dataset.route = '/auth';
        el.href = '/auth';
      }
    }
  } catch {
    // network failure — leave nav as-is
  }
}

setInterval(() => { if (!document.getElementById('navBell')?.hidden) refreshBell(); }, 60000);

route('/', async () => {
  const { feedView } = await import('./views/feed.js');
  await feedView();
  updateNav();
});

route('/studio', async () => {
  const { mountStudio } = await import('./views/studio.js');
  return mountStudio();
});

route('/market', async () => {
  const { marketView } = await import('./views/market.js');
  await marketView();
  updateNav();
});

// /me = your own profile (collection, releases, balance all live there). /library kept as an alias for old links.
const myProfile = async () => {
  const user = supabase && (await supabase.auth.getUser()).data?.user;
  if (!user) return redirect('/auth');
  const { data } = await supabase.from('users').select('username').eq('id', user.id).single();
  return redirect(data?.username ? `/u/${encodeURIComponent(data.username)}` : '/');
};
route('/me', myProfile);
route('/library', myProfile);

route('/auth', async () => {
  const { authView } = await import('./views/auth.js');
  await authView();
  updateNav();
});

route('/r/:id', async ({ id }) => {
  const { recordView } = await import('./views/record.js');
  return recordView({ id });
});

route('/r/:id/e/:n', async ({ id, n }) => {
  const { editionView } = await import('./views/edition.js');
  await editionView({ id, n });
  updateNav();
});

route('/notifications', async () => {
  const { notificationsView } = await import('./views/notifications.js');
  await notificationsView();
  updateNav();
});

route('/about', async () => {
  const { aboutView } = await import('./views/about.js');
  aboutView();
});

route('/u/:username', async ({ username }) => {
  const { profileView } = await import('./views/profile.js');
  await profileView({ username });
  updateNav();
});

start();
updateNav();
