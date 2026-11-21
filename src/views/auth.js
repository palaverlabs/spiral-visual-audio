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
      <button class="auth-link" id="tabForgot">Forgot password?</button>
      <div class="auth-status" id="authStatus"></div>
    </div>`;

  if (!supabase) { setStatus('Supabase not configured.', 'error'); return; }

  let mode = 'signin';

  const setMode = (m) => {
    mode = m;
    const isReset = m === 'reset';
    const isSignUp = m === 'signup';
    document.getElementById('tabSignIn').classList.toggle('active', m === 'signin');
    document.getElementById('tabSignUp').classList.toggle('active', isSignUp);
    document.getElementById('authUsername').style.display = isSignUp ? 'block' : 'none';
    document.getElementById('authPassword').style.display = isReset ? 'none' : 'block';
    document.getElementById('tabForgot').style.display = isReset ? 'none' : (m === 'signin' ? 'block' : 'none');
    document.getElementById('authSubmit').textContent =
      m === 'signin' ? 'Sign in' : m === 'signup' ? 'Create account' : 'Send reset link';
    setStatus('');
  };

  document.getElementById('tabSignIn').addEventListener('click', () => setMode('signin'));
  document.getElementById('tabSignUp').addEventListener('click', () => setMode('signup'));
  document.getElementById('tabForgot').addEventListener('click', () => setMode('reset'));

  document.getElementById('authSubmit').addEventListener('click', async () => {
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value.trim();

    if (!email) { setStatus('Enter your email.', 'error'); return; }
    if (mode !== 'reset' && !password) { setStatus('Enter email and password.', 'error'); return; }
    if (mode === 'signup' && !username) { setStatus('Choose a username.', 'error'); return; }

    const btn = document.getElementById('authSubmit');
    btn.disabled = true;
    btn.textContent = mode === 'signin' ? 'Signing in...' : mode === 'signup' ? 'Creating account...' : 'Sending...';
    setStatus('');

    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) { setStatus(error.message, 'error'); return; }
        setStatus('Check your email for a password reset link.', 'success');
        return;
      } else if (mode === 'signin') {
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
      if (b) {
        b.disabled = false;
        b.textContent = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';
      }
    }
  });
}

function setStatus(msg, type = 'info') {
  const el = document.getElementById('authStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-status ${type}`;
}
