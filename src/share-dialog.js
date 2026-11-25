// Share sheet for a record: pick a 15s window, press it into a vertical video, hand it to the OS share sheet.
import { player } from './player.js';
import { createClipScene, recordClip, canRecordClip, CLIP_SECONDS } from './share-clip.js';
import { esc } from './ui.js';

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const slug = s => (s || 'record').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'record';

export function openShareDialog({ record, groove, geom, skin, coverSrc, startAt = 0 }) {
  const duration = groove.samples.length / groove.sampleRate;
  const seconds = Math.min(CLIP_SECONDS, Math.floor(duration * 10) / 10);
  const maxStart = Math.max(0, duration - seconds);
  let start = Math.min(maxStart, Math.max(0, startAt));
  const link = `${location.origin}/r/${record.id}`;
  const videoOk = canRecordClip();

  const back = document.createElement('div');
  back.className = 'modal-backdrop share-backdrop';
  back.innerHTML = `
    <div class="share-modal" role="dialog" aria-modal="true" aria-label="Share ${esc(record.title)}">
      <div class="share-head"><span class="hw-label">SHARE · CLIP</span><button class="share-x" data-act="close" aria-label="Close">✕</button></div>
      <div class="share-stage">
        <canvas class="share-canvas" id="shareCanvas"></canvas>
        <video class="share-video" id="shareVideo" playsinline loop controls hidden></video>
      </div>
      ${videoOk ? `
      <div class="share-pick" id="sharePick">
        <div class="share-pick-row"><span class="hw-label">START</span><span class="share-range" id="shareRange"></span></div>
        <input type="range" id="shareStart" min="0" max="${maxStart.toFixed(1)}" step="0.1" value="${start.toFixed(1)}" ${maxStart ? '' : 'disabled'} aria-label="Clip start">
      </div>` : `<p class="share-note">This browser can't make video clips. You can still share the link.</p>`}
      <p class="share-note" id="shareNote"></p>
      <div class="share-actions" id="shareActions">
        ${videoOk ? `<button class="hw-btn primary" data-act="make"><span>MAKE ${Math.round(seconds)}S CLIP</span><span>→</span></button>` : ''}
        <button class="hw-btn small" data-act="copy">COPY LINK</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  const $ = id => back.querySelector(`#${id}`);
  const canvas = $('shareCanvas'), video = $('shareVideo'), note = $('shareNote'), actions = $('shareActions');
  const rangeEl = $('shareRange'), slider = $('shareStart');
  let scene = null, ctx = null, busy = false, file = null, url = null, closed = false;
  const showRange = () => { if (rangeEl) rangeEl.textContent = `${fmt(start)} – ${fmt(start + seconds)}`; };
  showRange();

  const copyLink = () => navigator.clipboard?.writeText(link).then(() => true, () => false) ?? Promise.resolve(false);

  createClipScene({ canvas, record, groove, geom, skin, coverSrc, start, seconds }).then(s => {
    scene = s;
    if (!closed) scene.frame(0);
  });
  slider?.addEventListener('input', () => {
    start = +slider.value;
    showRange();
    if (scene) createClipScene({ canvas, record, groove, geom, skin, coverSrc, start, seconds }).then(s => { scene = s; s.frame(0); });
  });

  const close = () => {
    if (busy) return;
    closed = true;
    back.remove();
    if (url) URL.revokeObjectURL(url);
    ctx?.close().catch(() => {});
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const make = async () => {
    // Inside the tap: unlock audio and copy the link (Instagram needs it pasted into a link sticker).
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const copied = copyLink();
    if (player.playing) player.pause();
    busy = true;
    back.classList.add('busy');
    if (slider) slider.disabled = true;
    const btn = actions.querySelector('[data-act="make"]');
    btn.disabled = true;
    note.textContent = 'Pressing your clip. Keep this screen open.';
    try {
      const s = await createClipScene({ canvas, record, groove, geom, skin, coverSrc, start, seconds });
      const { blob, ext } = await recordClip({
        ctx, scene: s, canvas, groove, start, seconds,
        onProgress: p => { btn.firstElementChild.textContent = `PRESSING ${Math.round(p * 100)}%`; },
      });
      if (closed) return;
      file = new File([blob], `${slug(record.title)}-spiral.${ext}`, { type: blob.type });
      url = URL.createObjectURL(blob);
      video.src = url;
      video.hidden = false;
      canvas.hidden = true;
      video.play().catch(() => {});
      $('sharePick')?.remove();
      const canShare = !!navigator.canShare?.({ files: [file] });
      actions.innerHTML = `
        ${canShare ? `<button class="hw-btn primary" data-act="share"><span>SHARE VIDEO</span><span>↗</span></button>` : ''}
        <a class="hw-btn ${canShare ? 'small' : 'primary'}" href="${url}" download="${file.name}"><span>SAVE VIDEO</span>${canShare ? '' : '<span>↓</span>'}</a>
        <button class="hw-btn small" data-act="copy">COPY LINK</button>`;
      note.textContent = (await copied)
        ? 'Link copied. On Instagram, add a link sticker and paste it.'
        : 'Tip: copy the link and add it as a link sticker on Instagram.';
    } catch (err) {
      console.error('clip error:', err);
      note.textContent = `Couldn't make the clip: ${err.message || err}`;
      btn.disabled = false;
      btn.firstElementChild.textContent = 'TRY AGAIN';
      if (slider) slider.disabled = !maxStart;
    } finally {
      busy = false;
      back.classList.remove('busy');
    }
  };

  back.addEventListener('click', async e => {
    if (e.target === back) return close();
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    else if (act === 'make') make();
    else if (act === 'copy') note.textContent = (await copyLink()) ? 'Link copied.' : link;
    else if (act === 'share') {
      try { await navigator.share({ files: [file], title: record.title }); }
      catch (err) { if (err.name !== 'AbortError') note.textContent = 'Sharing failed. Save the video and post it from your camera roll.'; }
    }
  });
}
