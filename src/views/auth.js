import { supabase } from '../supabase.js';
import { navigate } from '../router.js';

export async function authView() {
  document.getElementById('view').innerHTML = `
    <div class="auth-page">
      <div class="auth-tabs">
        <button class="auth-tab active" id="tabSignIn">Sign in</button>
        <button class="auth-tab" id="tabSignUp">Create account</button>
      </div>
      <input type="text"     id="authUsername" placeholder="Username" autocomplete="username" style="display:none">
      <input type="email"    id="authEmail"    placeholder="Email"    autocomplete="email">
      <input type="password" id="authPassword" placeholder="Password" autocomplete="current-password">
      <button class="action-btn auth-submit" id="authSubmit">Sign in</button>
      <div class="auth-status" id="authStatus"></div>
    </div>`;

  if (!supabase) { setStatus('Supabase not configured.', 'error'); return; }

  let mode = 'signin';

  document.getElementById('tabSignIn').addEventListener('click', () => {
    mode = 'signin';
    document.getElementById('tabSignIn').classList.add('active');
    document.getElementById('tabSignUp').classList.remove('active');
    document.getElementById('authUsername').style.display = 'none';
    document.getElementById('authSubmit').textContent = 'Sign in';
    setStatus('');
  });

  document.getElementById('tabSignUp').addEventListener('click', () => {
    mode = 'signup';
    document.getElementById('tabSignUp').classList.add('active');
    document.getElementById('tabSignIn').classList.remove('active');
    document.getElementById('authUsername').style.display = 'block';
    document.getElementById('authSubmit').textContent = 'Create account';
    setStatus('');
  });

  document.getElementById('authSubmit').addEventListener('click', async () => {
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value.trim();

    if (!email || !password) { setStatus('Enter email and password.', 'error'); return; }
    if (mode === 'signup' && !username) { setStatus('Choose a username.', 'error'); return; }

    const btn = document.getElementById('authSubmit');
    btn.disabled = true;
    btn.textContent = mode === 'signin' ? 'Signing in...' : 'Creating account...';
    setStatus('');

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setStatus(error.message, 'error'); return; }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setStatus(error.message, 'error'); return; }

        // Update username (trigger created the row with email prefix as default)
        if (data?.user) {
          const { error: uErr } = await supabase
            .from('users')
            .update({ username })
            .eq('id', data.user.id);
          if (uErr) { setStatus(`Account created but username failed: ${uErr.message}`, 'error'); return; }
        }
      }
      navigate('/');
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      const b = document.getElementById('authSubmit');
      if (b) { b.disabled = false; b.textContent = mode === 'signin' ? 'Sign in' : 'Create account'; }
    }
  });
}

function setStatus(msg, type = 'info') {
  const el = document.getElementById('authStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-status ${type}`;
}
