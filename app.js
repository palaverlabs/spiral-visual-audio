import {
  connect,
  disconnect,
  isConnected,
  getLocalStorage,
  request,
} from 'https://esm.sh/@stacks/connect@8.2.4';

// ── State ──────────────────────────────────────────────────────────────────
const Auth = {
  token: sessionStorage.getItem('groove_token'),
  address: sessionStorage.getItem('groove_address'),

  async connectAndAuth() {
    await connect();
    const address = getSTXAddress();
    if (!address) throw new Error('No STX address returned by wallet');

    // 1. Get challenge
    const challengeRes = await fetch(`/api/auth/challenge?address=${encodeURIComponent(address)}`);
    if (!challengeRes.ok) throw new Error('Failed to get challenge');
    const { nonce } = await challengeRes.json();

    // 2. Sign the challenge
    const sigResult = await request('stx_signMessage', { message: nonce });
    if (!sigResult?.signature) throw new Error('Signing cancelled or failed');

    // 3. Verify with server, receive JWT
    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        signature: sigResult.signature,
        publicKey: sigResult.publicKey,
      }),
    });
    if (!verifyRes.ok) {
      const { error } = await verifyRes.json().catch(() => ({}));
      throw new Error(error || 'Signature verification failed');
    }
    const { token } = await verifyRes.json();

    this.token = token;
    this.address = address;
    sessionStorage.setItem('groove_token', token);
    sessionStorage.setItem('groove_address', address);
  },

  signOut() {
    this.token = null;
    this.address = null;
    sessionStorage.removeItem('groove_token');
    sessionStorage.removeItem('groove_address');
    try { disconnect(); } catch {}
  },

  async api(path, opts = {}) {
    const headers = { Authorization: `Bearer ${this.token}`, ...opts.headers };
    if (opts.body && typeof opts.body === 'object') {
      headers['Content-Type'] = 'application/json';
      opts = { ...opts, body: JSON.stringify(opts.body) };
    }
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401) {
      // Token expired or invalid — force sign out
      this.signOut();
      showView('landing');
      throw new Error('Session expired. Please reconnect.');
    }
    return res;
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function getSTXAddress() {
  const data = getLocalStorage();
  const addrs = data?.addresses?.stx || [];
  return addrs.length > 0 ? addrs[0].address : '';
}

function truncate(addr) {
  return addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── View routing ───────────────────────────────────────────────────────────
function showView(name) {
  document.getElementById('landing').style.display = name === 'landing' ? 'flex' : 'none';
  document.getElementById('gallery').style.display = name === 'gallery' ? 'block' : 'none';
  document.getElementById('appContainer').style.display = name === 'editor' ? 'block' : 'none';
  if (name === 'gallery') loadGallery();
}

// ── Gallery ────────────────────────────────────────────────────────────────
async function loadGallery() {
  document.getElementById('galleryAddress').textContent = truncate(Auth.address);
  const grooveGrid = document.getElementById('grooveGrid');
  const emptyState = document.getElementById('emptyState');

  grooveGrid.innerHTML = '<div style="color:#555;padding:40px">Loading...</div>';
  emptyState.style.display = 'none';

  try {
    const res = await Auth.api('/api/grooves');
    const grooves = await res.json();
    renderGrooveGrid(grooves);
  } catch (e) {
    grooveGrid.innerHTML = `<div style="color:#ff6b6b;padding:20px">${escapeHtml(e.message)}</div>`;
  }
}

function renderGrooveGrid(grooves) {
  const grooveGrid = document.getElementById('grooveGrid');
  const emptyState = document.getElementById('emptyState');

  if (grooves.length === 0) {
    grooveGrid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  grooveGrid.innerHTML = grooves.map(g => `
    <div class="groove-card" data-id="${escapeHtml(g.id)}">
      <div class="groove-card-name">${escapeHtml(g.name)}</div>
      <div class="groove-card-date">${formatDate(g.created_at)}</div>
      <div class="groove-card-actions">
        <button class="btn btn-danger btn-sm btn-delete" data-id="${escapeHtml(g.id)}">Delete</button>
      </div>
    </div>
  `).join('');

  grooveGrid.querySelectorAll('.groove-card').forEach(card => {
    card.addEventListener('click', e => {
      if (!e.target.classList.contains('btn-delete')) {
        openGrooveFromServer(card.dataset.id);
      }
    });
  });

  grooveGrid.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this groove?')) return;
      await Auth.api(`/api/grooves/${btn.dataset.id}`, { method: 'DELETE' });
      loadGallery();
    });
  });
}

async function openGrooveFromServer(id) {
  try {
    const res = await Auth.api(`/api/grooves/${id}`);
    const groove = await res.json();
    currentGrooveName = groove.name;
    currentGrooveId = groove.id;
    document.getElementById('editorGrooveName').textContent = groove.name;
    showView('editor');
    window.codec.loadGrooveFromText(groove.svg, groove.name);
  } catch (e) {
    alert('Failed to load groove: ' + e.message);
  }
}

// ── Editor save ────────────────────────────────────────────────────────────
let currentGrooveName = null;
let currentGrooveId = null;

async function saveGroove() {
  if (!window.codec || !window.codec.grooveSVG) return;

  let name = currentGrooveName;
  if (!name) {
    name = prompt('Name your groove:', 'Untitled Groove');
    if (!name) return;
  }

  const btn = document.getElementById('saveGrooveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    let res;
    if (currentGrooveId) {
      // Overwrite not implemented — save as new
      res = await Auth.api('/api/grooves', { method: 'POST', body: { name, svg: window.codec.grooveSVG } });
    } else {
      res = await Auth.api('/api/grooves', { method: 'POST', body: { name, svg: window.codec.grooveSVG } });
    }

    if (res.ok) {
      const groove = await res.json();
      currentGrooveName = groove.name;
      currentGrooveId = groove.id;
      document.getElementById('editorGrooveName').textContent = groove.name;
      showToast('Groove saved!');
    } else {
      const { error } = await res.json().catch(() => ({}));
      showToast('Save failed: ' + (error || res.status));
    }
  } catch (e) {
    showToast('Save failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save to Library';
  }
}

// ── Gallery SVG upload ─────────────────────────────────────────────────────
async function handleGalleryUpload(file) {
  if (!file) return;
  const svgText = await file.text();
  const name = file.name.replace(/\.svg$/i, '') || 'Uploaded Groove';

  try {
    const res = await Auth.api('/api/grooves', { method: 'POST', body: { name, svg: svgText } });
    if (res.ok) {
      showToast('Groove uploaded!');
      loadGallery();
    } else {
      const { error } = await res.json().catch(() => ({}));
      showToast('Upload failed: ' + (error || res.status));
    }
  } catch (e) {
    showToast('Upload failed: ' + e.message);
  }
}

// ── Wiring ─────────────────────────────────────────────────────────────────
const landingBtn = document.getElementById('landingConnectBtn');
const landingError = document.getElementById('landingError');

landingBtn.addEventListener('click', async () => {
  landingBtn.disabled = true;
  landingBtn.textContent = 'Connecting...';
  landingError.style.display = 'none';

  try {
    await Auth.connectAndAuth();
    showView('gallery');
  } catch (e) {
    landingError.textContent = e.message;
    landingError.style.display = 'block';
  } finally {
    landingBtn.disabled = false;
    landingBtn.textContent = 'Connect Wallet to Enter';
  }
});

document.getElementById('signOutBtn').addEventListener('click', () => {
  Auth.signOut();
  showView('landing');
});

document.getElementById('newGrooveBtn').addEventListener('click', () => {
  currentGrooveName = null;
  currentGrooveId = null;
  document.getElementById('editorGrooveName').textContent = '';
  showView('editor');
});

document.getElementById('emptyNewGrooveBtn').addEventListener('click', () => {
  currentGrooveName = null;
  currentGrooveId = null;
  document.getElementById('editorGrooveName').textContent = '';
  showView('editor');
});

document.getElementById('backToGalleryBtn').addEventListener('click', () => {
  showView('gallery');
});

document.getElementById('saveGrooveBtn').addEventListener('click', saveGroove);

document.getElementById('galleryUploadSvg').addEventListener('change', e => {
  handleGalleryUpload(e.target.files[0]);
  e.target.value = '';
});

// ── Init ───────────────────────────────────────────────────────────────────
if (Auth.token && Auth.address) {
  // Resume session from sessionStorage
  showView('gallery');
} else {
  showView('landing');
}
