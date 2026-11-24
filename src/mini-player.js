// Bottom bar that keeps the current record playing while you browse. Hidden on that record's own page.
import { player, coverUrl } from './player.js';
import { navigate, onNavigate } from './router.js';
import { esc } from './ui.js';

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="4" width="3" height="16"/><polygon points="19,4 8,12 19,20"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5,4 16,12 5,20"/><rect x="16" y="4" width="3" height="16"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

export function mountMiniPlayer() {
  const el = document.createElement('div');
  el.className = 'mini-player';
  el.hidden = true;
  el.innerHTML = `
    <div class="mini-progress" id="miniBar"><span id="miniProgress"></span></div>
    <button class="mini-track" id="miniTrack" aria-label="Open record">
      <span class="mini-cover" id="miniCover"></span>
      <span class="mini-text"><span class="mini-title" id="miniTitle"></span><span class="mini-sub" id="miniSub"></span></span>
    </button>
    <div class="mini-controls">
      <button class="mini-btn" id="miniPrev" aria-label="Previous">${ICON.prev}</button>
      <button class="mini-btn mini-play" id="miniPlay" aria-label="Play">${ICON.play}</button>
      <button class="mini-btn" id="miniNext" aria-label="Next">${ICON.next}</button>
      <button class="mini-btn" id="miniClose" aria-label="Close player">${ICON.close}</button>
    </div>`;
  document.body.appendChild(el);

  const $ = id => el.querySelector(`#${id}`);
  const progress = $('miniProgress');
  let shownId = null;

  const render = () => {
    const r = player.record;
    const onDeck = r && location.pathname === `/r/${r.id}`;
    el.hidden = !r || onDeck;
    document.body.classList.toggle('has-mini-player', !el.hidden);
    if (!r) { shownId = null; return; }
    if (shownId !== r.id) {
      shownId = r.id;
      const art = coverUrl(r);
      $('miniCover').innerHTML = art ? `<img src="${art}" alt="">` : '';
      $('miniTitle').textContent = r.title;
    }
    $('miniSub').innerHTML = player.countdown !== null
      ? `Next in ${player.countdown}… <span class="mini-cancel" role="button" tabindex="0">Cancel</span>`
      : esc(r.artist || (r.users?.username ? `@${r.users.username}` : ''));
    $('miniPlay').innerHTML = player.playing ? ICON.pause : ICON.play;
    $('miniPlay').setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
    $('miniNext').disabled = !player.nextId;
    progress.style.transform = `scaleX(${Math.max(0, Math.min(1, player.progress)).toFixed(4)})`;
  };

  player.onChange(render);
  player.onFrame(f => { if (!el.hidden) progress.style.transform = `scaleX(${Math.max(0, Math.min(1, f.progress)).toFixed(4)})`; });
  onNavigate(() => queueMicrotask(render));

  $('miniPlay').addEventListener('click', () => player.toggle());
  $('miniPrev').addEventListener('click', () => player.prev());
  $('miniNext').addEventListener('click', () => player.next());
  $('miniClose').addEventListener('click', () => player.close());
  $('miniTrack').addEventListener('click', e => {
    if (e.target.closest('.mini-cancel')) { player.cancelCountdown(); return; }
    if (player.record) navigate(`/r/${player.record.id}`);
  });
  const bar = $('miniBar');
  const seek = e => { const r = bar.getBoundingClientRect(); player.seek((e.clientX - r.left) / r.width); render(); };
  bar.addEventListener('pointerdown', e => { bar.setPointerCapture(e.pointerId); seek(e); });
  bar.addEventListener('pointermove', e => { if (bar.hasPointerCapture(e.pointerId)) seek(e); });
}
