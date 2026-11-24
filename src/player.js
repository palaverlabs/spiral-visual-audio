// App-wide player: one AudioContext and one current track, so audio keeps playing across pages.
// The record page draws the deck from it; the mini player shows it everywhere else.
import { supabase } from './supabase.js';
import { navigate } from './router.js';
import { loadGroove, fetchGrooveBytes } from './groove-loader.js';
import { PlaybackManager } from './playback.js';
import { DEFAULT_ROUT, DEFAULT_RIN, DEFAULT_CX, DEFAULT_CY, SPIN_SPEED, TAU } from './constants.js';

export const GEOM_DEFAULTS = { Rout: DEFAULT_ROUT, Rin: DEFAULT_RIN, cx: DEFAULT_CX, cy: DEFAULT_CY };
const RECORD_COLS = 'id, title, artist, user_id, file_path, cover_path, thumbnail_path, users!records_user_id_fkey(username)';
const UP_NEXT_SECONDS = 3;

const publicUrl = path => path ? supabase.storage.from('records').getPublicUrl(path).data?.publicUrl : null;
export const grooveUrl = r => publicUrl(r?.file_path);
export const coverUrl = r => publicUrl(r?.cover_path || r?.thumbnail_path);

// ── Groove cache: raw bytes prefetched for what's next, decoded grooves for the last few tracks ──
const bytesCache = new Map();   // id → Promise<ArrayBuffer|null>
const grooveCache = new Map();  // id → Promise<decoded groove>
const trim = (map, max, keep) => {
  for (const k of map.keys()) { if (map.size <= max) break; if (k !== keep) map.delete(k); }
};

export function prefetchGroove(record) {
  const url = grooveUrl(record);
  if (!url || bytesCache.has(record.id) || grooveCache.has(record.id)) return;
  bytesCache.set(record.id, fetchGrooveBytes(url).catch(() => { bytesCache.delete(record.id); return null; }));
  trim(bytesCache, 2);
}

export function getGroove(record) {
  if (grooveCache.has(record.id)) return grooveCache.get(record.id);
  const url = grooveUrl(record);
  const p = !url ? Promise.reject(new Error('Could not resolve file URL.'))
    : (bytesCache.get(record.id) || Promise.resolve(null)).then(buf => loadGroove(buf ? { buf } : { url }, GEOM_DEFAULTS));
  p.catch(() => grooveCache.delete(record.id));
  bytesCache.delete(record.id);
  grooveCache.set(record.id, p);
  trim(grooveCache, 2, player.record?.id);
  return p;
}

// ── Record rows, cached so up-next and the mini player don't refetch ──
const rowCache = new Map();
export async function fetchRecord(id) {
  if (!rowCache.has(id)) {
    rowCache.set(id, supabase.from('records').select(RECORD_COLS).eq('id', id).single()
      .then(({ data, error }) => { if (error) throw error; return data; }));
    rowCache.get(id).catch(() => rowCache.delete(id));
  }
  return rowCache.get(id);
}

// ── Queue: the list you opened the record from, else the artist's other releases ──
let browseIds = [];
export function setBrowseQueue(ids) { if (ids.length > 1) browseIds = ids; }

export async function queueFor(record) {
  if (player.record?.id === record.id && player.queue.includes(record.id)) return player.queue;
  if (browseIds.includes(record.id)) return browseIds;
  const { data } = await supabase.from('records').select('id')
    .eq('user_id', record.user_id).eq('is_public', true)
    .order('created_at', { ascending: false }).limit(100);
  const ids = (data ?? []).map(r => r.id);
  return ids.includes(record.id) ? ids : [record.id, ...ids];
}

const audioOf = g => ({ left: g.samples, right: g.samplesR || null, sampleRate: g.sampleRate });

class Player {
  constructor() {
    this.record = null;
    this.groove = null;
    this.queue = [];
    this.playing = false;      // intent: true from Play until Pause/stop
    this.progress = 0;
    this.discRotation = 0;
    this.spinRate = 0;
    this.isStopping = false;
    this.dragging = false;
    this.countdown = null;     // seconds until the next record auto-plays, or null
    this._changeFns = new Set();
    this._frameFns = new Set();
    this._lastFrame = 0;
    this._vel = 0;
    this._countedPlay = null;

    this.pm = new PlaybackManager({
      onFrame: f => this._onFrame(f),
      onStop: () => { this.playing = false; this.isStopping = false; this._emit(); },
      onEnd: () => this._onEnd(),
      onDebug: () => {},
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.pm.resumeIfSuspended();
    });
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => this.play());
      ms.setActionHandler('pause', () => this.pause());
      ms.setActionHandler('nexttrack', () => this.next());
      ms.setActionHandler('previoustrack', () => this.prev());
    }
  }

  // Subscribe; each returns an unsubscribe function.
  onChange(fn) { this._changeFns.add(fn); return () => this._changeFns.delete(fn); }
  onFrame(fn) { this._frameFns.add(fn); return () => this._frameFns.delete(fn); }
  _emit() { for (const fn of this._changeFns) fn(this); }
  _frame(amplitude = 0, freq = null) {
    const f = { rotation: this.discRotation, progress: this.progress, amplitude, freq };
    for (const fn of this._frameFns) fn(f);
  }

  get duration() { return this.groove ? this.groove.samples.length / this.groove.sampleRate : 0; }
  get nextId() { const i = this.queue.indexOf(this.record?.id); return i >= 0 ? this.queue[i + 1] ?? null : null; }
  get prevId() { const i = this.queue.indexOf(this.record?.id); return i > 0 ? this.queue[i - 1] : null; }

  // Must run synchronously inside a click/tap (iOS unlocks audio only there).
  unlock() { this.pm.unlock(); }

  load(record, groove, queue) {
    this.cancelCountdown();
    if (this.pm.isPlaying) this.pm.stop();
    this.record = record;
    this.groove = groove;
    grooveCache.set(record.id, Promise.resolve(groove));
    if (queue) this.queue = queue;
    this.progress = 0;
    this.spinRate = 0;
    if ('mediaSession' in navigator) {
      const art = coverUrl(record);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: record.title,
        artist: record.artist || (record.users?.username ? `@${record.users.username}` : 'Spiral Audio'),
        album: 'Spiral Audio',
        ...(art ? { artwork: [{ src: art }] } : {}),
      });
    }
    const next = this.nextId;
    if (next) fetchRecord(next).then(prefetchGroove).catch(() => {});
    this._emit();
  }

  async play() {
    if (!this.groove) return;
    this.pm.unlock();
    this.cancelCountdown();
    if (this.isStopping && this.pm.isPlaying) { this.isStopping = false; this.playing = true; this._emit(); return; }
    this.isStopping = false;
    this.spinRate = 0;
    this.playing = true;
    this._emit();
    if (this.progress >= 0.999) this.progress = 0;
    if (this._countedPlay !== this.record.id) {
      this._countedPlay = this.record.id;
      supabase.rpc('increment_plays', { record_id: this.record.id }).then(({ error }) => {
        if (error) console.error('increment_plays error:', error);
      });
    }
    this._lastFrame = performance.now();
    await this.pm.start(audioOf(this.groove), 0, this.progress);
    // start() stops any previous node first, which reports "stopped"; restate that we're playing.
    if (this.pm.isPlaying) { this.playing = true; this._emit(); }
  }

  // Spins down like a turntable, then stops.
  pause() {
    if (!this.pm.isPlaying) return;
    this.isStopping = true;
    this.playing = false;
    this._emit();
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  async playRecord(record, groove, queue, startProgress = 0) {
    this.unlock();
    this.load(record, groove, queue);
    this.progress = startProgress;
    await this.play();
  }

  stop() {
    this.cancelCountdown();
    if (this.pm.isPlaying) this.pm.stop();
  }

  close() {
    this.stop();
    this.record = null;
    this.groove = null;
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    this._emit();
  }

  seek(p) {
    this.progress = Math.max(0, Math.min(1, p));
    if (this.pm.isPlaying) this.pm.seek(this.progress);
    else this._frame();
  }

  // ── Scratching: the record page feeds hand movement in here ──
  beginDrag() {
    this.dragging = true;
    this.isStopping = false;
    this._vel = 0;
    this.pm.setRate(0);
  }

  dragBy(delta, dt) {
    const turns = this.groove?.turns || 1;
    this._vel = 0.6 * this._vel + 0.4 * (delta / dt);
    this.discRotation += delta;
    this.progress = Math.max(0, Math.min(1, this.progress + delta / (turns * TAU)));
    if (this.pm.isPlaying) this.pm.setRate(this._vel / ((turns * TAU) / this.duration));
    else this._frame();
    clearTimeout(this._idle);
    this._idle = setTimeout(() => { if (this.dragging) { this._vel = 0; this.pm.setRate(0); } }, 80);
  }

  endDrag() {
    this.dragging = false;
    clearTimeout(this._idle);
    this.spinRate = 0; // spin back up from the hand-held position
    this._lastFrame = performance.now();
    if (!this.playing && this.pm.isPlaying) this.isStopping = true;
  }

  // ── Up next ──
  async next() { if (this.nextId) await this.skipTo(this.nextId); }
  async prev() {
    if (this.progress > 0.05 || !this.prevId) { this.seek(0); return; }
    await this.skipTo(this.prevId);
  }

  cancelCountdown() {
    clearTimeout(this._countdownTimer);
    if (this.countdown !== null) { this.countdown = null; this._emit(); }
  }

  _onEnd() {
    this.progress = 1;
    if (!this.nextId) return;
    this.countdown = UP_NEXT_SECONDS;
    this._emit();
    const tick = () => {
      if (this.countdown === null) return;
      if (this.countdown === 0) { this.countdown = null; this.skipTo(this.nextId); return; }
      this.countdown--;
      this._emit();
      this._countdownTimer = setTimeout(tick, 1000);
    };
    this._countdownTimer = setTimeout(tick, 1000);
  }

  async skipTo(id) {
    const fromId = this.record?.id;
    const onDeck = location.pathname === `/r/${fromId}`;
    this.unlock();
    try {
      const record = await fetchRecord(id);
      const groove = await getGroove(record);
      this.load(record, groove);
      if (onDeck && location.pathname === `/r/${fromId}`) navigate(`/r/${id}`);
      await this.play();
    } catch (err) {
      console.error('Up next failed:', err);
    }
  }

  _onFrame({ progress, amplitude = 0, now = performance.now() }) {
    const dt = Math.max(0, Math.min((now - this._lastFrame) / 1000, 0.05));
    this._lastFrame = now;
    if (this.dragging) {
      // Hand is on the record: dragBy drives rotation and rate.
    } else if (this.isStopping) {
      this.spinRate = Math.max(0, this.spinRate - 0.7 * dt);
      this.pm.setRate(this.spinRate);
      this.discRotation += dt * SPIN_SPEED * this.spinRate;
      if (this.spinRate === 0) { this.progress = progress; this.pm.stop(); return; }
    } else {
      this.spinRate = Math.min(1, this.spinRate + 1.5 * dt);
      this.discRotation += dt * SPIN_SPEED * this.spinRate;
      this.pm.setRate(this.spinRate);
    }
    this.progress = progress;
    this._frame(amplitude, this.pm.getFrequencyData());
  }
}

export const player = new Player();
