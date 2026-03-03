import './style.css';
import { route, navigate, start } from './router.js';
import { supabase } from './supabase.js';

// Intercept all [data-route] clicks for SPA navigation
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-route]');
  if (!link) return;
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
  if (!link) return;
  if (!supabase) { link.textContent = 'Sign In'; return; }
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      link.textContent = 'Sign Out';
      link.dataset.route = '__signout';
      link.removeAttribute('href');
    } else {
      link.textContent = 'Sign In';
      link.dataset.route = '/auth';
      link.href = '/auth';
    }
  } catch {
    // network failure — leave nav as-is
  }
}

route('/', async () => {
  const { feedView } = await import('./views/feed.js');
  await feedView();
  updateNav();
});

route('/studio', async () => {
  const { mountStudio } = await import('./views/studio.js');
  return mountStudio();
});

route('/auth', async () => {
  const { authView } = await import('./views/auth.js');
  await authView();
  updateNav();
});

route('/r/:id', async ({ id }) => {
  const { recordView } = await import('./views/record.js');
  return recordView({ id });
});

route('/u/:username', async ({ username }) => {
  const { profileView } = await import('./views/profile.js');
  await profileView({ username });
  updateNav();
});

start();
updateNav();
