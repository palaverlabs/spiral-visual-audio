import './style.css';
import { encodeToSVG, decodeFromSVG } from './codec.js';
import { Renderer } from './renderer.js';
import { PlaybackManager } from './playback.js';
import { SkinManager, SKINS } from './skin.js';
import { DEFAULT_ROUT, DEFAULT_RIN, DEFAULT_CX, DEFAULT_CY, TAU, SPIN_SPEED } from './constants.js';

class App {
  constructor() {
    this.originalAudio = null;   // left / mono channel from loaded audio file
    this.originalAudioR = null;  // right channel (null if mono)
    this.decodedAudio = null;    // left / mono decoded from SVG
    this.decodedAudioR = null;   // right decoded from stereo SVG
    this.sampleRate = 44100;
    this.duration = 0;
    this.grooveSVG = null;
    this.groovePoints = null;

    this.Rout = DEFAULT_ROUT;
    this.Rin = DEFAULT_RIN;
    this.cx = DEFAULT_CX;
    this.cy = DEFAULT_CY;
    this.spiralTurns = 30;

    this.scrubProgress = 0;
    this.discRotation = 0;
    this.isDragging = false;
    this._spinRate = 0;      // 0–1 multiplier applied to SPIN_SPEED
    this._spindownId = null; // RAF handle for spindown animation
    this._isStopping = false; // true while vinyl spindown is in progress
    this.dragLastAngle = 0;
    this.dragLastTime = 0;
    this.scratchVel = 0;    // smoothed angular velocity during drag (rad/s)
    this._lastFrameTime = performance.now();

    this.skinManager = new SkinManager();
    this.renderer = new Renderer(document.getElementById('grooveCanvas'));

    this.playback = new PlaybackManager({
      onFrame: ({ progress, audioTimePosition, amplitude = 0 }) => {
        if (!this.isDragging) {
          const now = performance.now();
          const dt = (now - this._lastFrameTime) / 1000;
          this._lastFrameTime = now;
          const speed = parseFloat(document.getElementById('speedSlider').value);

          if (this._isStopping) {
            // Vinyl spindown: ramp audio + disc rate to 0, then stop.
            this._spinRate = Math.max(0, this._spinRate - 0.7 * dt);
            this.playback.setRate(speed * this._spinRate);
            this.discRotation += dt * SPIN_SPEED * this._spinRate;
            if (this._spinRate === 0) {
              this._isStopping = false;
              this.playback.stop();
              return;
            }
          } else {
            // Spinup: ramp audio + disc rate from 0 to full speed.
            this._spinRate = Math.min(1, this._spinRate + 1.5 * dt);
            this.discRotation += dt * SPIN_SPEED * this._spinRate;
            // Always call setRate so AudioContext init delay can't skip it.
            this.playback.setRate(speed * this._spinRate);
          }
        }
        this.scrubProgress = progress;
        this.renderer.drawDiscWithGroove(this.discRotation, this.scrubProgress, this._geom(), amplitude);
        document.getElementById('currentTime').textContent = this._formatTime(audioTimePosition);
      },
      onStop: () => {
        document.getElementById('playBtn').textContent = '▶';
        document.getElementById('currentTime').textContent = this._formatTime(this.scrubProgress * this.duration);
        document.getElementById('playWrap')?.classList.remove('playing');
        this._startSpindown();
        this.debug('Playback stopped');
      },
      onDebug: (msg) => this.debug(msg),
    });

    this._bindUI();

    // Apply skin AFTER renderer created, BEFORE first draw
    const restored = this.skinManager.restore();
    const skin = restored || SKINS.owl;
    if (!restored) this.skinManager.apply(skin);
    this.renderer.setSkin(skin.canvas);
    this._updateSkinButtons(skin);
    this.renderer.drawEmptyDisc(this._geom());
  }

  _geom() {
    return { Rout: this.Rout, Rin: this.Rin, cx: this.cx, cy: this.cy };
  }

  _bindUI() {
    const uploadArea = document.getElementById('uploadArea');
    const audioFile = document.getElementById('audioFile');
    uploadArea.addEventListener('click', () => { if (!this.groovePoints) audioFile.click(); });
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', (e) => { if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) this.loadAudioFile(file);
      else if (file && (file.type === 'image/svg+xml' || file.name.endsWith('.svg'))) this.loadGrooveFile(file);
      else this._statusError('Please drop an audio or video file, or an SVG groove file');
    });
    audioFile.addEventListener('change', (e) => { if (e.target.files[0]) this.loadAudioFile(e.target.files[0]); });

    const svgUploadArea = document.getElementById('svgUploadArea');
    const svgFile = document.getElementById('svgFile');
    svgUploadArea.addEventListener('click', () => svgFile.click());
    svgUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); svgUploadArea.classList.add('dragover'); });
    svgUploadArea.addEventListener('dragleave', () => svgUploadArea.classList.remove('dragover'));
    svgUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      svgUploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && (file.type === 'image/svg+xml' || file.name.endsWith('.svg'))) this.loadGrooveFile(file);
      else if (file?.type.startsWith('audio/')) this.loadAudioFile(file);
      else this._statusError('Please drop an SVG groove file or audio file');
    });
    svgFile.addEventListener('change', (e) => { if (e.target.files[0]) this.loadGrooveFile(e.target.files[0]); });

    document.getElementById('loadSvgBtn')?.addEventListener('click', () => document.getElementById('svgFile').click());
    document.getElementById('generateGroove').addEventListener('click', () => this.generateGroove());
    document.getElementById('playBtn').addEventListener('click', () => {
      if (this.playback.isPlaying || this._isStopping) {
        // Vinyl-style spindown.
        this._isStopping = true;
        document.getElementById('playBtn').textContent = '▶';
        document.getElementById('playWrap')?.classList.remove('playing');
      } else {
        this.startPlayback();
      }
    });
    document.getElementById('downloadSVG').addEventListener('click', () => this.downloadSVG());
    document.getElementById('downloadAudio').addEventListener('click', () => this.downloadAudio());

    const canvas = document.getElementById('grooveCanvas');
    canvas.addEventListener('mousedown',  (e) => this._onDragStart(e));
    canvas.addEventListener('mousemove',  (e) => this._onDragMove(e));
    canvas.addEventListener('mouseup',    (e) => this._onDragEnd());
    canvas.addEventListener('mouseleave', (e) => this._onDragEnd());
    canvas.addEventListener('touchstart', (e) => this._onDragStart(e.touches[0]), { passive: true });
    canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); this._onDragMove(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend',   (e) => this._onDragEnd());

    ['quality', 'turns', 'sensitivity', 'speed'].forEach(param => {
      const slider = document.getElementById(`${param}Slider`);
      const value = document.getElementById(`${param}Value`);
      slider.addEventListener('input', (e) => {
        value.textContent = param === 'speed' ? `${e.target.value}x` : e.target.value;
      });
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      });
    });

    document.getElementById('skinClassic').addEventListener('click', () => this._applySkin(SKINS.classic));
    document.getElementById('skinVagc77').addEventListener('click', () => this._applySkin(SKINS.vagc77));
    document.getElementById('skinOmitron').addEventListener('click', () => this._applySkin(SKINS.omitron));
    document.getElementById('skinOwl').addEventListener('click', () => this._applySkin(SKINS.owl));
    document.getElementById('skinEq').addEventListener('click', () => this._applySkin(SKINS.eq));
    document.getElementById('skinLoad').addEventListener('click', () => document.getElementById('skinFileInput').click());
    document.getElementById('skinFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then(json => {
        try {
          const skin = this.skinManager.load(json);
          this.renderer.setSkin(skin.canvas, this.groovePoints, this._geom());
          this._redraw();
          this._updateSkinButtons(skin);
        } catch (err) {
          this._statusError(`Failed to load skin: ${err.message}`);
        }
      });
      e.target.value = '';
    });
    document.getElementById('skinExport').addEventListener('click', () => {
      const json = this.skinManager.export();
      const name = (this.skinManager.current?.name || 'skin').replace(/\s+/g, '-');
      this._triggerDownload(new Blob([json], { type: 'application/json' }), `${name}.skin.json`);
    });
  }

  async loadAudioFile(file) {
    this.debug(`Loading audio file: ${file.name}`);
    this._setStatus('Loading audio file...', 'info');
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

      this.originalAudio = audioBuffer.getChannelData(0);
      this.originalAudioR = audioBuffer.numberOfChannels > 1
        ? audioBuffer.getChannelData(1) : null;
      this.sampleRate = audioBuffer.sampleRate;
      this.duration = audioBuffer.duration;
      this.decodedAudio = null;
      this.decodedAudioR = null;

      const chLabel = audioBuffer.numberOfChannels === 1 ? 'Mono' : `Stereo`;
      this._setStatus(`Audio loaded: ${file.name}`, 'success');
      this._showAudioInfo({
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: chLabel,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      });
      const encodeBtn = document.getElementById('generateGroove');
      encodeBtn.disabled = false;
      encodeBtn.classList.add('pulse');
      document.getElementById('dropOverlay')?.classList.add('hidden');
      this.debug(`Audio loaded: ${this.originalAudio.length} samples, ${this.sampleRate}Hz, ${this.duration.toFixed(2)}s${this.originalAudioR ? ' [stereo]' : ''}`);
    } catch (error) {
      this.debug(`Failed to load audio: ${error.message}`);
      this._setStatus('Failed to load audio file', 'error');
    }
  }

  async loadGrooveFile(file) {
    this.debug(`Loading visual groove file: ${file.name}`);
    this._setStatus('Loading visual groove...', 'info');
    try {
      const svgText = await file.text();
      const result = decodeFromSVG(svgText, this._geom());

      this.grooveSVG = svgText;
      this.decodedAudio = result.samples;
      this.decodedAudioR = result.samplesR || null;
      this.sampleRate = result.sampleRate;
      this.duration = result.samples.length / result.sampleRate;
      this.spiralTurns = result.turns;
      this.Rout = result.Rout;
      this.Rin = result.Rin;
      this.cx = result.cx;
      this.cy = result.cy;
      this.originalAudio = null;
      this.originalAudioR = null;
      this.groovePoints = result.groovePoints;

      const chLabel = result.samplesR ? 'Stereo (Visual)' : 'Mono (Visual)';
      this._setStatus(`Visual groove loaded: ${file.name}`, 'success');
      this._showAudioInfo({
        duration: this.duration,
        sampleRate: result.sampleRate,
        channels: chLabel,
        size: `${(file.size / 1024).toFixed(1)} KB`,
      });
      this.scrubProgress = 0;
      this.discRotation = 0;
      this.renderer.preRenderGroove(this.groovePoints, this._geom());
      this.renderer.drawDiscWithGroove(0, -1, this._geom());
      this.renderer.canvas.style.cursor = 'grab';
      this._enablePlayback();
      document.getElementById('dropOverlay')?.classList.add('hidden');

      const genBtn = document.getElementById('generateGroove');
      genBtn.textContent = 'RE-ENC';
      genBtn.disabled = false;

      this.debug(`Groove loaded: ${result.vertices} vertices, ${result.turns.toFixed(1)} turns, ${this.duration.toFixed(2)}s${result.samplesR ? ' [stereo M/S]' : ''}`);
      this.debug('Ready for playback from visual groove!');
    } catch (error) {
      this.debug(`Failed to load groove: ${error.message}`);
      this._setStatus('Failed to load visual groove file', 'error');
      console.error('Groove loading error:', error);
    }
  }

  generateGroove() {
    if (!this.originalAudio) {
      this._statusError('Please load an audio file first');
      return;
    }

    const btn = document.getElementById('generateGroove');
    btn.classList.add('loading');
    btn.textContent = 'WAIT...';
    btn.disabled = true;

    this.debug(`Starting encoding: ${this.originalAudio.length} samples...`);
    this._setStatus(`Encoding ${this.originalAudio.length} samples...`, 'info');

    setTimeout(() => {
      try {
        const quality = parseInt(document.getElementById('qualitySlider').value);
        const turns = parseInt(document.getElementById('turnsSlider').value);
        const sensitivity = parseInt(document.getElementById('sensitivitySlider').value);
        this.spiralTurns = turns;

        const { svg, groovePoints, debugMsg } = encodeToSVG(this.originalAudio, {
          sr: this.sampleRate, quality, turns, sensitivity, ...this._geom(),
          rightChannel: this.originalAudioR,
        });

        this.grooveSVG = svg;
        this.groovePoints = groovePoints;
        // Cache original audio so playback doesn't have to re-decode the SVG.
        this.decodedAudio = this.originalAudio;
        this.decodedAudioR = this.originalAudioR;
        this.scrubProgress = 0;
        this.discRotation = 0;
        this.debug(debugMsg);

        this.renderer.preRenderGroove(groovePoints, this._geom());
        this.renderer.drawDiscWithGroove(0, -1, this._geom());
        this.renderer.canvas.style.cursor = 'grab';
        this._enablePlayback();

        const sizeBytes = svg.length;
        const sizeLabel = sizeBytes > 1024 * 1024
          ? `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
          : `${(sizeBytes / 1024).toFixed(0)} KB`;
        this.debug(`Groove generated: ${sizeLabel} SVG`);
        this._setStatus(`Groove generated (${sizeLabel}). Ready for playback!`, 'success');
      } catch (error) {
        this.debug(`Groove generation failed: ${error.message}`);
        this._setStatus('Failed to generate groove', 'error');
      }

      btn.classList.remove('loading');
      btn.classList.remove('pulse');
      btn.textContent = 'ENCODE';
      btn.disabled = false;
    }, 100);
  }

  async startPlayback() {
    if (!this.grooveSVG) return;
    const audio = this._getPlaybackAudio();
    if (!audio) { this.debug('Failed to decode audio from groove'); return; }

    const speed = parseFloat(document.getElementById('speedSlider').value);
    const chInfo = audio.right ? 'stereo' : 'mono';
    this.debug(`Starting groove playback... Speed: ${speed}x | ${audio.left.length} samples @ ${audio.sampleRate}Hz [${chInfo}]`);

    document.getElementById('playBtn').textContent = '⏸';
    document.getElementById('playWrap')?.classList.add('playing');
    cancelAnimationFrame(this._spindownId);
    this._isStopping = false;
    this._spinRate = 0; // always spin up from rest

    // Start frozen (rate=0); onFrame ramps up via _spinRate.
    await this.playback.start(audio, 0, this.scrubProgress);
    // Reset frame timer AFTER async init so first dt isn't inflated.
    this._lastFrameTime = performance.now();
  }

  downloadSVG() {
    if (!this.grooveSVG) return;
    this._triggerDownload(new Blob([this.grooveSVG], { type: 'image/svg+xml' }), 'visual_audio_groove.svg');
    this.debug('Visual groove SVG downloaded');
  }

  downloadAudio() {
    const audio = this._getPlaybackAudio();
    if (!audio) return;
    this._triggerDownload(this.playback.createWAVBlob(audio), 'reconstructed_audio.wav');
    this.debug(`Reconstructed audio downloaded${audio.right ? ' [stereo]' : ''}`);
  }

  _canvasAngle(clientX, clientY) {
    const canvas = this.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const canvasScale = canvas.width / rect.width;
    const x = (clientX - rect.left) * canvasScale;
    const y = (clientY - rect.top)  * canvasScale;
    const drawScale = canvas.width / 520;
    const cxs = this.cx * drawScale;
    const cys = this.cy * drawScale;
    return { angle: Math.atan2(y - cys, x - cxs), dist: Math.hypot(x - cxs, y - cys), drawScale };
  }

  _onDragStart(e) {
    if (!this.groovePoints) return;
    const { angle, dist, drawScale } = this._canvasAngle(e.clientX, e.clientY);
    const Rout_px = (this.Rout + 8) * drawScale;
    const Rin_px  = Math.max(12, this.Rin - 8) * drawScale;
    if (dist < Rin_px || dist > Rout_px) return;

    this.isDragging = true;
    this.dragLastAngle = angle;
    this.dragLastTime = performance.now();
    this.scratchVel = 0;
    this._lastFrameTime = performance.now();
    this.renderer.canvas.style.cursor = 'grabbing';

    // Freeze audio — user is holding the disc.
    this.playback.setRate(0);
  }

  _onDragMove(e) {
    if (!this.isDragging) return;
    const now = performance.now();
    const dt = Math.max(now - this.dragLastTime, 1) / 1000; // seconds, min 1ms
    const { angle } = this._canvasAngle(e.clientX, e.clientY);

    let delta = angle - this.dragLastAngle;
    if (delta >  Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    this.dragLastAngle = angle;
    this.dragLastTime = now;

    // Smooth angular velocity with a fast EMA (α=0.4).
    const instantVel = delta / dt;
    this.scratchVel = 0.6 * this.scratchVel + 0.4 * instantVel;

    // Map angular velocity → playback rate.
    // One full disc revolution = 1/spiralTurns of the audio.
    const normalAngularVel = (this.spiralTurns * TAU) / Math.max(this.duration, 0.001);
    const rate = this.scratchVel / normalAngularVel;
    this.playback.setRate(rate);

    // Update visual position.
    this.discRotation += delta;
    this.scrubProgress = Math.max(0, Math.min(1, this.scrubProgress + delta / (this.spiralTurns * TAU)));
    this.renderer.drawDiscWithGroove(this.discRotation, this.scrubProgress, this._geom());
    document.getElementById('currentTime').textContent = this._formatTime(this.scrubProgress * this.duration);

    // If disc stops moving, freeze audio after 80ms idle.
    clearTimeout(this._dragIdleTimer);
    this._dragIdleTimer = setTimeout(() => {
      if (this.isDragging) { this.scratchVel = 0; this.playback.setRate(0); }
    }, 80);
  }

  _onDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    clearTimeout(this._dragIdleTimer);
    this.renderer.canvas.style.cursor = this.groovePoints ? 'grab' : 'default';
    this._lastFrameTime = performance.now();

    // Resume normal playback speed.
    const speed = parseFloat(document.getElementById('speedSlider').value);
    this.playback.setRate(speed);
  }

  _applySkin(skin) {
    this.skinManager.apply(skin);
    this.renderer.setSkin(skin.canvas, this.groovePoints, this._geom());
    this._redraw();
    this._updateSkinButtons(skin);
  }

  _redraw() {
    if (this.groovePoints)
      this.renderer.drawDiscWithGroove(this.discRotation, this.scrubProgress, this._geom());
    else
      this.renderer.drawEmptyDisc(this._geom());
  }

  _updateSkinButtons(skin) {
    document.getElementById('skinClassic').classList.toggle('active', skin === SKINS.classic);
    document.getElementById('skinVagc77').classList.toggle('active', skin === SKINS.vagc77);
    document.getElementById('skinOmitron').classList.toggle('active', skin === SKINS.omitron);
    document.getElementById('skinOwl').classList.toggle('active', skin === SKINS.owl);
    document.getElementById('skinEq').classList.toggle('active', skin === SKINS.eq);
  }

  debug(message) {
    const timestamp = new Date().toLocaleTimeString();
    const log = document.getElementById('debugLog');
    const line = document.createElement('div');
    line.textContent = `[${timestamp}] ${message}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    console.log(`[${timestamp}] ${message}`);
  }

  _getPlaybackAudio() {
    if (this.decodedAudio) {
      return { left: this.decodedAudio, right: this.decodedAudioR || null, sampleRate: this.sampleRate };
    }
    if (!this.grooveSVG) return null;
    const result = decodeFromSVG(this.grooveSVG, this._geom());
    return { left: result.samples, right: result.samplesR || null, sampleRate: result.sampleRate };
  }

  _startSpindown() {
    cancelAnimationFrame(this._spindownId);
    this._lastFrameTime = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min((now - this._lastFrameTime) / 1000, 0.05);
      this._lastFrameTime = now;
      this._spinRate = Math.max(0, this._spinRate - 0.7 * dt);
      this.discRotation += dt * SPIN_SPEED * this._spinRate;
      if (this.groovePoints)
        this.renderer.drawDiscWithGroove(this.discRotation, this.scrubProgress, this._geom());
      if (this._spinRate > 0)
        this._spindownId = requestAnimationFrame(step);
    };
    this._spindownId = requestAnimationFrame(step);
  }

  _enablePlayback() {
    document.getElementById('totalTime').textContent = this._formatTime(this.duration);
    ['playBtn', 'downloadSVG', 'downloadAudio'].forEach(id => {
      document.getElementById(id).disabled = false;
    });
  }

  _showAudioInfo({ duration, sampleRate, channels, size }) {
    document.getElementById('infoDuration').textContent = this._formatTime(duration);
    document.getElementById('infoSampleRate').textContent = `${sampleRate} Hz`;
    document.getElementById('infoChannels').textContent = channels;
    document.getElementById('infoSize').textContent = size;
  }

  _setStatus(message, type = 'info') {
    const el = document.getElementById('audioStatus');
    el.textContent = message;
    el.className = `status-line ${type}`;
  }

  _statusError(message) {
    this.debug(message);
    this._setStatus(message, 'error');
  }

  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

window.addEventListener('load', () => new App());
