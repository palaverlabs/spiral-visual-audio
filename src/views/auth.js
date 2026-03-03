import { supabase } from '../supabase.js';
import { navigate } from '../router.js';

export async function authView() {
  document.getElementById('view').innerHTML = `
    <div class="auth-page">
      <h1>Sign in to Spiral Records</h1>
      <form id="authForm" autocomplete="on">
        <input type="email" id="authEmail" placeholder="Email" required autocomplete="email">
        <input type="password" id="authPassword" placeholder="Password" required autocomplete="current-password">
        <div class="auth-actions">
          <button type="submit" class="action-btn" id="signInBtn">Sign in</button>
          <button type="button" class="action-btn" id="signUpBtn">Create account</button>
        </div>
        <div class="status-line info" id="authStatus"></div>
      </form>
    </div>`;

  if (!supabase) {
    document.getElementById('authStatus').textContent = 'Supabase not configured.';
    return;
  }

  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { document.getElementById('authStatus').textContent = error.message; return; }
    navigate('/');
  });

  document.getElementById('signUpBtn').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) {
      document.getElementById('authStatus').textContent = 'Enter email and password first.';
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) { document.getElementById('authStatus').textContent = error.message; return; }
    document.getElementById('authStatus').className = 'status-line success';
    document.getElementById('authStatus').textContent = 'Check your email to confirm your account.';
  });
}
