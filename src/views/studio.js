import { encodeToSVG, decodeFromSVG } from '../codec.js';
import { Renderer } from '../renderer.js';
import { PlaybackManager } from '../playback.js';
import { SkinManager, SKINS } from '../skin.js';
import { DEFAULT_ROUT, DEFAULT_RIN, DEFAULT_CX, DEFAULT_CY, TAU, SPIN_SPEED } from '../constants.js';
import { renderPublishPanel } from '../publish.js';

const STUDIO_HTML = `
  <div class="app">
    <div class="studio-skin-row app-header">
      <div class="skin-switcher">
        <button class="skin-dot" id="skinClassic" title="Classic"  style="--dot:#4ecdc4"></button>
        <button class="skin-dot" id="skinVagc77"  title="VAGC-77"  style="--dot:#00e5ff"></button>
        <button class="skin-dot" id="skinOmitron" title="OMITRON"  style="--dot:#00c8e8"></button>
        <button class="skin-dot" id="skinOwl"     title="OWL"      style="--dot:#d4880a"></button>
        <button class="skin-dot" id="skinEq"      title="EQ"       style="--dot:#00e060"></button>
      </div>
    </div>

    <section class="disc-section">
      <div class="disc-wrap" id="uploadArea">
        <canvas id="grooveCanvas" width="1000" height="1000"></canvas>
        <div class="drop-overlay" id="dropOverlay">
          <div class="drop-icon">&#9835;</div>
          <div class="drop-title">Drop audio here</div>
          <div class="drop-sub">or click to browse &nbsp;&middot;&nbsp; audio or video &nbsp;&middot;&nbsp; drag SVG to load groove</div>
        </div>
        <input type="file" id="audioFile">
      </div>
    </section>

    <section class="app-controls">
      <div class="transport">
        <div class="play-wrap" id="playWrap">
          <div class="play-ring"></div>
          <button class="play-btn" id="playBtn" disabled>&#9654;</button>
        </div>
        <span class="time-display">
          <span id="currentTime">0:00</span>
          <span class="t-sep"> / </span>
          <span id="totalTime">0:00</span>
        </span>
        <button class="action-btn" id="generateGroove" disabled>ENCODE</button>
        <button class="action-btn" id="downloadSVG" disabled>&#8595; SVG</button>
        <button class="action-btn" id="downloadAudio" disabled>&#8595; WAV</button>
      </div>

      <div class="speed-row">
        <span class="ctrl-label">Speed</span>
        <input type="range" id="speedSlider" min="0.25" max="2" value="1" step="0.25" class="ctrl-slider">
        <span class="ctrl-value" id="speedValue">1&times;</span>
        <button class="text-btn" id="loadSvgBtn">Load groove SVG</button>
      </div>

      <div class="status-line info" id="audioStatus">Ready — drop a file or click the disc</div>

      <div id="publishWrap"></div>
    </section>
  </div>

  <!-- Hidden functional elements -->
  <input type="file" id="svgFile" accept=".svg,image/svg+xml" style="position:absolute;left:-9999px">
  <div id="svgUploadArea" style="display:none"></div>
  <input type="range" id="qualitySlider"     min="1"  max="5"  value="5"  step="1"    style="display:none"><span id="qualityValue"     style="display:none">5</span>
  <input type="range" id="turnsSlider"       min="3"  max="80" value="80" step="1"    style="display:none"><span id="turnsValue"       style="display:none">80</span>
  <input type="range" id="sensitivitySlider" min="1"  max="10" value="10" step="1"    style="display:none"><span id="sensitivityValue" style="display:none">10</span>
  <div id="audioInfo" style="display:none">
    <span id="infoDuration"></span><span id="infoSampleRate"></span>
    <span id="infoChannels"></span><span id="infoSize"></span>
  </div>
  <button id="skinLoad"   style="display:none"></button>
  <button id="skinExport" style="display:none"></button>
  <input  type="file" id="skinFileInput" accept=".json,.skin.json" style="display:none">
  <div id="debugLog" style="display:none"></div>
`;

class App {
  constructor() {
    this.originalAudio = null;
    this.originalAudioR = null;
    this.decodedAudio = null;
    this.decodedAudioR = null;
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
    this._spinRate = 0;
    this._spindownId = null;
    this._isStopping = false;
    this.dragLastAngle = 0;
    this.dragLastTime = 0;
    this.scratchVel = 0;
    this._lastFrameTime = performance.now();

    this.skinManager = new SkinManager();
    this.renderer = new Renderer(document.getElementById('grooveCanvas'));

    this.playback = new PlaybackManager({
      onError: (msg) => this._setStatus(msg, 'error'),
      onFrame: ({ progress, audioTimePosition, amplitude = 0 }) => {
        if (!this.isDragging) {
          const now = performance.now();
          const dt = (now - this._lastFrameTime) / 1000;
          this._lastFrameTime = now;
          const speed = parseFloat(document.getElementById('speedSlider').value);

          if (this._isStopping) {
            this._spinRate = Math.max(0, this._spinRate - 0.7 * dt);
            this.playback.setRate(speed * this._spinRate);
            this.discRotation += dt * SPIN_SPEED * this._spinRate;
            if (this._spinRate === 0) {
              this._isStopping = false;
              this.playback.stop();
              return;
            }
          } else {
            this._spinRate = Math.min(1, this._spinRate + 1.5 * dt);
            this.discRotation += dt * SPIN_SPEED * this._spinRate;
            this.playback.setRate(speed * this._spinRate);
          }
        }
        this.scrubProgress = progress;
        const freqData = this.playback.getFrequencyData();
        this.renderer.drawDiscWithGroove(this.discRotation, this.scrubProgress, this._geom(), amplitude, freqData);
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

    const restored = this.skinManager.restore();
    const skin = restored || SKINS.owl;
    if (!restored) this.skinManager.apply(skin);
    this.renderer.setSkin(skin.canvas);
    this._updateSkinButtons(skin);
    this.renderer.drawEmptyDisc(this._geom(), null);
  }

  destroy() {
    cancelAnimationFrame(this._spindownId);
    this.playback.stop();
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
        this._isStopping = true;
        document.getElementById('playBtn').textContent = '▶';
        document.getElementById('playWrap')?.classList.remove('playing');
      } else {
        this.playback.unlock();
        this.startPlayback();
      }
    });
    document.getElementById('downloadSVG').addEventListener('click', () => this.downloadSVG());
    document.getElementById('downloadAudio').addEventListener('click', () => this.downloadAudio());

    const canvas = document.getElementById('grooveCanvas');
    canvas.addEventListener('mousedown',  (e) => this._onDragStart(e));
    canvas.addEventListener('mousemove',  (e) => this._onDragMove(e));
    canvas.addEventListener('mouseup',    () => this._onDragEnd());
    canvas.addEventListener('mouseleave', () => this._onDragEnd());
    canvas.addEventListener('touchstart', (e) => this._onDragStart(e.touches[0]), { passive: true });
    canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); this._onDragMove(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend',   () => this._onDragEnd());

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

      let arrayBuffer = await file.arrayBuffer();
      let audioBuffer;

      try {
        audioBuffer = await new Promise((resolve, reject) =>
          audioContext.decodeAudioData(arrayBuffer, resolve, reject)
        );
      } catch (_nativeErr) {
        this.debug(`Native decode failed for ${file.name} — trying FFmpeg fallback`);
        const { transcodeToWav } = await import('../transcode.js');
        arrayBuffer = await transcodeToWav(file, (msg) => this._setStatus(msg, 'info'));
        audioBuffer = await new Promise((resolve, reject) =>
          audioContext.decodeAudioData(arrayBuffer, resolve, reject)
        );
      }

      audioContext.close();

      this.originalAudio = audioBuffer.getChannelData(0);
      this.originalAudioR = audioBuffer.numberOfChannels > 1
        ? audioBuffer.getChannelData(1) : null;
      this.sampleRate = audioBuffer.sampleRate;
      this.duration = audioBuffer.duration;
      this.decodedAudio = null;
      this.decodedAudioR = null;

      const chLabel = audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo';
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

      this._showPublishPanel();

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

        this._showPublishPanel();
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

  _showPublishPanel() {
    const wrap = document.getElementById('publishWrap');
    if (!wrap || wrap.dataset.rendered) return;
    wrap.dataset.rendered = '1';
    renderPublishPanel(
      wrap,
      () => this.grooveSVG,
      () => ({
        duration: this.duration,
        quality: parseInt(document.getElementById('qualitySlider').value),
        turns: this.spiralTurns,
        sampleRate: this.sampleRate,
        stereo: !!(this.originalAudioR || this.decodedAudioR),
      })
    );
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
    this._spinRate = 0;

    await this.playback.start(audio, 0, this.scrubProgress);
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
    this.playback.setRate(0);
  }

  _onDragMove(e) {
    if (!this.isDragging) return;
    const now = performance.now();
    const dt = Math.max(now - this.dragLastTime, 1) / 1000;
    const { angle } = this._canvasAngle(e.clientX, e.clientY);

    let delta = angle - this.dragLastAngle;
    if (delta >  Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    this.dragLastAngle = angle;
    this.dragLastTime = now;

    const instantVel = delta / dt;
    this.scratchVel = 0.6 * this.scratchVel + 0.4 * instantVel;

    const normalAngularVel = (this.spiralTurns * TAU) / Math.max(this.duration, 0.001);
    const rate = this.scratchVel / normalAngularVel;
    this.playback.setRate(rate);

    this.discRotation += delta;
    this.scrubProgress = Math.max(0, Math.min(1, this.scrubProgress + delta / (this.spiralTurns * TAU)));
    this.renderer.drawDiscWithGroove(this.discRotation, this.scrubProgress, this._geom());
    document.getElementById('currentTime').textContent = this._formatTime(this.scrubProgress * this.duration);

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
      this.renderer.drawDiscWithGroove(this.discRotation, this.scrubProgress, this._geom(), 0, null);
    else
      this.renderer.drawEmptyDisc(this._geom(), null);
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
    if (log) {
      const line = document.createElement('div');
      line.textContent = `[${timestamp}] ${message}`;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }
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
        this.renderer.drawDiscWithGroove(this.discRotation, this.scrubProgress, this._geom(), 0, null);
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
    if (el) { el.textContent = message; el.className = `status-line ${type}`; }
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

  async _triggerDownload(blob, filename) {
    if (navigator.canShare) {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

export function mountStudio() {
  document.getElementById('view').innerHTML = STUDIO_HTML;
  const app = new App();
  return () => app.destroy();
}
