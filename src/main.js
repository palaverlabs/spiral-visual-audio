import './style.css';
import { encodeToSVG, decodeFromSVG } from './codec.js';
import { Renderer } from './renderer.js';
import { PlaybackManager } from './playback.js';
import { DEFAULT_ROUT, DEFAULT_RIN, DEFAULT_CX, DEFAULT_CY } from './constants.js';

class App {
  constructor() {
    this.originalAudio = null;
    this.decodedAudio = null;
    this.sampleRate = 44100;
    this.duration = 0;
    this.grooveSVG = null;
    this.groovePoints = null;

    this.Rout = DEFAULT_ROUT;
    this.Rin = DEFAULT_RIN;
    this.cx = DEFAULT_CX;
    this.cy = DEFAULT_CY;
    this.spiralTurns = 30;

    this.renderer = new Renderer(document.getElementById('grooveCanvas'));

    this.playback = new PlaybackManager({
      onFrame: ({ rotation, progress, audioTimePosition }) => {
        this.renderer.drawDiscWithGroove(rotation, progress, this._geom());
        document.getElementById('currentTime').textContent = this._formatTime(audioTimePosition);
      },
      onStop: () => {
        document.getElementById('playBtn').style.display = 'inline-block';
        document.getElementById('pauseBtn').style.display = 'none';
        document.getElementById('currentTime').textContent = '00:00';
        if (this.groovePoints) this.renderer.drawDiscWithGroove(0, -1, this._geom());
        this.debug('Playback stopped');
      },
      onDebug: (msg) => this.debug(msg),
    });

    this._bindUI();
    this.renderer.drawEmptyDisc(this._geom());
  }

  _geom() {
    return { Rout: this.Rout, Rin: this.Rin, cx: this.cx, cy: this.cy };
  }

  _bindUI() {
    const uploadArea = document.getElementById('uploadArea');
    const audioFile = document.getElementById('audioFile');
    uploadArea.addEventListener('click', () => audioFile.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('audio/')) this.loadAudioFile(file);
      else if (file && (file.type === 'image/svg+xml' || file.name.endsWith('.svg'))) this.loadGrooveFile(file);
      else this._statusError('Please drop an audio file or SVG groove file');
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

    document.getElementById('generateGroove').addEventListener('click', () => this.generateGroove());
    document.getElementById('playBtn').addEventListener('click', () => this.startPlayback());
    document.getElementById('pauseBtn').addEventListener('click', () => this.playback.stop());
    document.getElementById('downloadSVG').addEventListener('click', () => this.downloadSVG());
    document.getElementById('downloadAudio').addEventListener('click', () => this.downloadAudio());

    ['quality', 'turns', 'sensitivity', 'speed'].forEach(param => {
      const slider = document.getElementById(`${param}Slider`);
      const value = document.getElementById(`${param}Value`);
      slider.addEventListener('input', (e) => {
        value.textContent = param === 'speed' ? `${e.target.value}x` : e.target.value;
      });
    });
  }

  async loadAudioFile(file) {
    this.debug(`Loading audio file: ${file.name}`);
    this._setStatus('Loading audio file...', 'info');
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

      this.originalAudio = audioBuffer.getChannelData(0);
      this.sampleRate = audioBuffer.sampleRate;
      this.duration = audioBuffer.duration;
      this.decodedAudio = null;

      this._setStatus(`Audio loaded: ${file.name}`, 'success');
      this._showAudioInfo({
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      });
      document.getElementById('generateGroove').disabled = false;
      this.debug(`Audio loaded: ${this.originalAudio.length} samples, ${this.sampleRate}Hz, ${this.duration.toFixed(2)}s`);
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
      this.sampleRate = result.sampleRate;
      this.duration = result.samples.length / result.sampleRate;
      this.spiralTurns = result.turns;
      this.Rout = result.Rout;
      this.Rin = result.Rin;
      this.cx = result.cx;
      this.cy = result.cy;
      this.originalAudio = null;
      this.groovePoints = result.groovePoints;

      this._setStatus(`Visual groove loaded: ${file.name}`, 'success');
      this._showAudioInfo({
        duration: this.duration,
        sampleRate: result.sampleRate,
        channels: 'Mono (Visual)',
        size: `${(file.size / 1024).toFixed(1)} KB`,
      });
      this.renderer.preRenderGroove(this.groovePoints);
      this.renderer.drawDiscWithGroove(0, -1, this._geom());
      this._enablePlayback();

      const genBtn = document.getElementById('generateGroove');
      genBtn.textContent = 'Groove Loaded (Generate New)';
      genBtn.disabled = false;

      this.debug(`Groove loaded: ${result.vertices} vertices, ${result.turns.toFixed(1)} turns, ${this.duration.toFixed(2)}s`);
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
    btn.textContent = 'Encoding Audio...';
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
        });

        this.grooveSVG = svg;
        this.groovePoints = groovePoints;
        this.debug(debugMsg);

        this.renderer.preRenderGroove(groovePoints);
        this.renderer.drawDiscWithGroove(0, -1, this._geom());
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
      btn.textContent = 'Generate Visual Groove';
      btn.disabled = false;
    }, 100);
  }

  startPlayback() {
    if (!this.grooveSVG) return;
    const audio = this._getPlaybackAudio();
    if (!audio) { this.debug('Failed to decode audio from groove'); return; }

    const speed = parseFloat(document.getElementById('speedSlider').value);
    this.debug(`Starting groove playback... Speed: ${speed}x | ${audio.samples.length} samples @ ${audio.sampleRate}Hz`);

    document.getElementById('playBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').disabled = false;

    this.playback.start(audio.samples, audio.sampleRate, speed);
  }

  downloadSVG() {
    if (!this.grooveSVG) return;
    this._triggerDownload(new Blob([this.grooveSVG], { type: 'image/svg+xml' }), 'visual_audio_groove.svg');
    this.debug('Visual groove SVG downloaded');
  }

  downloadAudio() {
    const audio = this._getPlaybackAudio();
    if (!audio) return;
    this._triggerDownload(this.playback.createWAVBlob(audio.samples, audio.sampleRate), 'reconstructed_audio.wav');
    this.debug('Reconstructed audio downloaded');
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
    if (this.decodedAudio) return { samples: this.decodedAudio, sampleRate: this.sampleRate };
    if (!this.grooveSVG) return null;
    const result = decodeFromSVG(this.grooveSVG, this._geom());
    return { samples: result.samples, sampleRate: result.sampleRate };
  }

  _enablePlayback() {
    document.getElementById('totalTime').textContent = this._formatTime(this.duration);
    ['playBtn', 'downloadSVG', 'downloadAudio'].forEach(id => {
      document.getElementById(id).disabled = false;
    });
  }

  _showAudioInfo({ duration, sampleRate, channels, size }) {
    document.getElementById('audioInfo').style.display = 'grid';
    document.getElementById('infoDuration').textContent = this._formatTime(duration);
    document.getElementById('infoSampleRate').textContent = `${sampleRate} Hz`;
    document.getElementById('infoChannels').textContent = channels;
    document.getElementById('infoSize').textContent = size;
  }

  _setStatus(message, type = 'info') {
    const el = document.getElementById('audioStatus');
    el.textContent = message;
    el.className = `status ${type}`;
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
