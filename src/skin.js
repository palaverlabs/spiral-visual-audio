const CLASSIC_CSS = {
  '--bg-grad-1': '#0f0f0f',
  '--bg-grad-2': '#1a1a1a',
  '--panel-bg': 'rgba(255,255,255,0.05)',
  '--panel-border': 'rgba(255,255,255,0.1)',
  '--accent': '#4ecdc4',
  '--accent-alt': '#44a08d',
  '--accent-glow': 'rgba(78,205,196,0.4)',
  '--accent-subtle': 'rgba(78,205,196,0.1)',
  '--accent-subtle-drag': 'rgba(78,205,196,0.2)',
  '--text': '#ffffff',
  '--text-muted': '#888888',
  '--text-secondary': '#dddddd',
  '--font-ui': "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  '--font-mono': "'Courier New', monospace",
  '--debug-bg': 'rgba(0,0,0,0.8)',
  '--debug-border': '#333333',
  '--upload-audio': '#4ecdc4',
  '--upload-svg': '#da70d6',
  '--upload-svg-bg': 'rgba(218,112,214,0.05)',
  '--status-success': '#4ecdc4',
  '--status-error': '#ff4444',
  '--status-info': '#ffc107',
  '--section-border-left': '#4ecdc4',
};

const CLASSIC_CANVAS = {
  disc: {
    bg: ['#151920', '#0e1217', '#0b0f14'],
    rim: '#1e2d3d',
    outerRim: 'rgba(100,160,220,0.12)',
    rings: ['rgba(90,216,207,0.025)', 'rgba(100,140,200,0.018)'],
  },
  label: {
    bg: ['#2a1a3a', '#1e1030', '#150a22'],
    border: '#4a3060',
    innerRing: 'rgba(120,80,180,0.25)',
    text: 'rgba(200,170,255,0.55)',
    textEmpty: 'rgba(255,255,255,0.2)',
  },
  groove: {
    base: 'rgba(90,216,207,0.35)',
    glow: '#5ad8cf',
    glowCore: 'rgba(90,216,207,0.18)',
    hueShift: 150,
    hueMult: 0.75,
  },
  activeRing: {
    outer: 'rgba(90,216,207,0.22)',
    inner: 'rgba(160,240,235,0.12)',
    glow: '#5ad8cf',
  },
  stylus: {
    bloom: '#ff2200',
    bloomFill: [255, 30, 0],
    midG: 60,
    core: '#ff4422',
    coreGlow: '#ff8866',
    beamRGB: [255, 50, 20],
  },
};

const VAGC77_CSS = {
  '--bg-grad-1': '#080b0f',
  '--bg-grad-2': '#0d1117',
  '--panel-bg': 'rgba(255,255,255,0.03)',
  '--panel-border': 'rgba(0,229,255,0.12)',
  '--accent': '#00e5ff',
  '--accent-alt': '#00b8d4',
  '--accent-glow': 'rgba(0,229,255,0.4)',
  '--accent-subtle': 'rgba(0,229,255,0.1)',
  '--accent-subtle-drag': 'rgba(0,229,255,0.2)',
  '--text': '#e0f7fa',
  '--text-muted': '#607d8b',
  '--text-secondary': '#b0bec5',
  '--font-ui': "'Orbitron', 'Segoe UI', sans-serif",
  '--font-mono': "'Courier New', monospace",
  '--debug-bg': 'rgba(0,0,0,0.8)',
  '--debug-border': '#1a2a3a',
  '--upload-audio': '#00e5ff',
  '--upload-svg': '#ff00aa',
  '--upload-svg-bg': 'rgba(255,0,170,0.05)',
  '--status-success': '#00e5ff',
  '--status-error': '#ff4444',
  '--status-info': '#ffc107',
  '--section-border-left': '#00e5ff',
};

const VAGC77_CANVAS = {
  disc: {
    bg: ['#0d1a26', '#091018', '#060c14'],
    rim: '#0e2235',
    outerRim: 'rgba(0,229,255,0.1)',
    rings: ['rgba(0,229,255,0.025)', 'rgba(0,100,200,0.018)'],
  },
  label: {
    bg: ['#0a1828', '#060f1e', '#040b16'],
    border: '#0e2840',
    innerRing: 'rgba(0,150,220,0.25)',
    text: 'rgba(0,229,255,0.65)',
    textEmpty: 'rgba(0,229,255,0.2)',
  },
  groove: {
    base: 'rgba(0,229,255,0.35)',
    glow: '#00e5ff',
    glowCore: 'rgba(0,229,255,0.18)',
    hueShift: 180,
    hueMult: 0.6,
  },
  activeRing: {
    outer: 'rgba(0,229,255,0.22)',
    inner: 'rgba(0,200,255,0.12)',
    glow: '#00e5ff',
  },
  stylus: {
    bloom: '#ff00aa',
    bloomFill: [255, 0, 170],
    midG: 0,
    core: '#ff00aa',
    coreGlow: '#ff66cc',
    beamRGB: [255, 0, 170],
  },
};

const OMITRON_CSS = {
  '--bg-grad-1': '#0a0e14',
  '--bg-grad-2': '#131b24',
  '--panel-bg': 'rgba(20,30,42,0.85)',
  '--panel-border': 'rgba(80,120,150,0.25)',
  '--accent': '#00c8e8',
  '--accent-alt': '#0090b0',
  '--accent-glow': 'rgba(0,200,232,0.4)',
  '--accent-subtle': 'rgba(0,200,232,0.08)',
  '--accent-subtle-drag': 'rgba(0,200,232,0.16)',
  '--text': '#c8dde8',
  '--text-muted': '#4a6070',
  '--text-secondary': '#8aa0b0',
  '--font-ui': "'Orbitron', 'Segoe UI', sans-serif",
  '--font-mono': "'Courier New', monospace",
  '--debug-bg': 'rgba(4,10,18,0.95)',
  '--debug-border': '#1a2a3a',
  '--upload-audio': '#00c8e8',
  '--upload-svg': '#ffa040',
  '--upload-svg-bg': 'rgba(255,160,64,0.04)',
  '--status-success': '#00c8e8',
  '--status-error': '#ff4444',
  '--status-info': '#ffa040',
  '--section-border-left': '#00c8e8',
};

const OMITRON_CANVAS = {
  disc: {
    bg: ['#060e18', '#040b12', '#02080f'],
    rim: '#0e2035',
    outerRim: 'rgba(0,180,220,0.12)',
    rings: ['rgba(0,200,232,0.03)', 'rgba(0,100,160,0.02)'],
  },
  label: {
    bg: ['#081525', '#041018', '#020c14'],
    border: '#0c2040',
    innerRing: 'rgba(0,200,232,0.3)',
    text: 'rgba(0,200,232,0.75)',
    textEmpty: 'rgba(0,200,232,0.25)',
  },
  groove: {
    base: 'rgba(0,200,232,0.3)',
    glow: '#00c8e8',
    glowCore: 'rgba(0,200,232,0.15)',
    hueShift: 190,
    hueMult: 0.45,
  },
  activeRing: {
    outer: 'rgba(0,200,232,0.22)',
    inner: 'rgba(0,160,200,0.12)',
    glow: '#00c8e8',
  },
  stylus: {
    bloom: '#0055ff',
    bloomFill: [0, 80, 255],
    midG: 80,
    core: '#4499ff',
    coreGlow: '#80c4ff',
    beamRGB: [0, 80, 255],
  },
};

const OWL_CSS = {
  '--bg-grad-1': '#0a0805',
  '--bg-grad-2': '#110e07',
  '--panel-bg': 'rgba(212,136,10,0.03)',
  '--panel-border': 'rgba(180,110,15,0.18)',
  '--accent': '#d4880a',
  '--accent-alt': '#9a6208',
  '--accent-glow': 'rgba(212,136,10,0.42)',
  '--accent-subtle': 'rgba(212,136,10,0.1)',
  '--accent-subtle-drag': 'rgba(212,136,10,0.2)',
  '--text': '#f0dbb0',
  '--text-muted': '#6a5030',
  '--text-secondary': '#c0a060',
  '--font-ui': "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  '--font-mono': "'Courier New', monospace",
  '--debug-bg': 'rgba(5,3,1,0.92)',
  '--debug-border': '#2a1a08',
  '--upload-audio': '#d4880a',
  '--upload-svg': '#cc6633',
  '--upload-svg-bg': 'rgba(204,102,51,0.05)',
  '--status-success': '#d4880a',
  '--status-error': '#ff4444',
  '--status-info': '#ffc107',
  '--section-border-left': '#d4880a',
};

const OWL_CANVAS = {
  theme: 'owl',
  disc: {
    bg: ['#100c06', '#0a0805', '#070502'],
    rim: '#2a1c08',
    outerRim: 'rgba(160,95,12,0.16)',
    rings: ['rgba(170,95,8,0.048)', 'rgba(130,70,4,0.030)'],
  },
  label: {
    bg: ['#3a1e00', '#200e00', '#120800'],
    border: '#b06c10',
    innerRing: 'rgba(210,150,28,0.45)',
    text: 'rgba(255,200,80,0.75)',
    textEmpty: 'rgba(255,200,80,0.25)',
    labelText: 'OWL',
  },
  groove: {
    base: 'rgba(180,100,15,0.35)',
    glow: '#c8820e',
    glowCore: 'rgba(200,130,20,0.18)',
    hueShift: 35,
    hueMult: 0.38,
  },
  activeRing: {
    outer: 'rgba(200,140,20,0.28)',
    inner: 'rgba(240,180,40,0.14)',
    glow: '#c8820e',
  },
  stylus: {
    bloom: '#ff6600',
    bloomFill: [255, 100, 0],
    midG: 40,
    core: '#ffaa00',
    coreGlow: '#ffd060',
    beamRGB: [255, 120, 0],
  },
};

const EQ_CSS = {
  '--bg-grad-1': '#020804',
  '--bg-grad-2': '#041006',
  '--panel-bg': 'rgba(0,220,80,0.03)',
  '--panel-border': 'rgba(0,180,70,0.18)',
  '--accent': '#00e060',
  '--accent-alt': '#009040',
  '--accent-glow': 'rgba(0,220,80,0.42)',
  '--accent-subtle': 'rgba(0,220,80,0.1)',
  '--accent-subtle-drag': 'rgba(0,220,80,0.2)',
  '--text': '#a0ffcc',
  '--text-muted': '#2a5038',
  '--text-secondary': '#60b080',
  '--font-ui': "'Courier New', monospace",
  '--font-mono': "'Courier New', monospace",
  '--debug-bg': 'rgba(0,4,2,0.92)',
  '--debug-border': '#082014',
  '--upload-audio': '#00e060',
  '--upload-svg': '#00aaff',
  '--upload-svg-bg': 'rgba(0,170,255,0.05)',
  '--status-success': '#00e060',
  '--status-error': '#ff4444',
  '--status-info': '#00aaff',
  '--section-border-left': '#00e060',
};

const EQ_CANVAS = {
  theme: 'eq',
  disc: {
    bg: ['#020e06', '#010904', '#010603'],
    rim: '#032812',
    outerRim: 'rgba(0,200,80,0.10)',
    rings: ['rgba(0,200,80,0.032)', 'rgba(0,150,60,0.020)'],
  },
  label: {
    bg: ['#041a0a', '#020e06', '#010a04'],
    border: '#044020',
    innerRing: 'rgba(0,220,80,0.3)',
    text: 'rgba(0,230,90,0.85)',
    textEmpty: 'rgba(0,230,90,0.28)',
    labelText: 'EQ',
  },
  groove: {
    base: 'rgba(0,200,80,0.32)',
    glow: '#00e060',
    glowCore: 'rgba(0,230,90,0.16)',
    hueShift: 120,
    hueMult: 0.18,
  },
  activeRing: {
    outer: 'rgba(0,220,80,0.26)',
    inner: 'rgba(0,255,100,0.12)',
    glow: '#00e060',
  },
  stylus: {
    bloom: '#0088ff',
    bloomFill: [0, 136, 255],
    midG: 136,
    core: '#44aaff',
    coreGlow: '#88ccff',
    beamRGB: [0, 100, 255],
  },
};

export const SKINS = {
  classic: {
    name: 'Classic',
    fontUrl: null,
    css: CLASSIC_CSS,
    canvas: CLASSIC_CANVAS,
  },
  vagc77: {
    name: 'VAGC-77',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&display=swap',
    css: VAGC77_CSS,
    canvas: VAGC77_CANVAS,
  },
  omitron: {
    name: 'OMITRON',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&display=swap',
    css: OMITRON_CSS,
    canvas: OMITRON_CANVAS,
  },
  owl: {
    name: 'OWL',
    fontUrl: null,
    css: OWL_CSS,
    canvas: OWL_CANVAS,
  },
  eq: {
    name: 'EQ',
    fontUrl: null,
    css: EQ_CSS,
    canvas: EQ_CANVAS,
  },
};

export class SkinManager {
  constructor() {
    this._current = null;
    this._fontLinkEl = null;
  }

  get current() {
    return this._current;
  }

  apply(skin) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(skin.css)) {
      root.style.setProperty(key, value);
    }
    this._applyFont(skin.fontUrl);
    this._current = skin;
    this._persist(skin);
  }

  load(jsonString) {
    const partial = JSON.parse(jsonString);
    const merged = this._mergeWithBase(partial);
    // apply sets _current and persists — override name key to 'custom'
    this.apply(merged);
    localStorage.setItem('vagc-skin-name', 'custom');
    return merged;
  }

  export() {
    return JSON.stringify(this._current, null, 2);
  }

  restore() {
    const name = localStorage.getItem('vagc-skin-name');
    if (!name) return null;
    if (name === 'classic') { this.apply(SKINS.classic);  return SKINS.classic;  }
    if (name === 'vagc77')  { this.apply(SKINS.vagc77);   return SKINS.vagc77;   }
    if (name === 'omitron') { this.apply(SKINS.omitron);  return SKINS.omitron;  }
    if (name === 'owl')     { this.apply(SKINS.owl);      return SKINS.owl;      }
    if (name === 'eq')      { this.apply(SKINS.eq);       return SKINS.eq;       }
    if (name === 'custom') {
      const json = localStorage.getItem('vagc-skin-custom');
      if (json) {
        try {
          const merged = this._mergeWithBase(JSON.parse(json));
          this.apply(merged);
          return merged;
        } catch { return null; }
      }
    }
    return null;
  }

  _applyFont(url) {
    if (this._fontLinkEl) {
      this._fontLinkEl.remove();
      this._fontLinkEl = null;
    }
    if (url) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
      this._fontLinkEl = link;
    }
  }

  _persist(skin) {
    if (skin === SKINS.classic) {
      localStorage.setItem('vagc-skin-name', 'classic');
    } else if (skin === SKINS.vagc77) {
      localStorage.setItem('vagc-skin-name', 'vagc77');
    } else if (skin === SKINS.omitron) {
      localStorage.setItem('vagc-skin-name', 'omitron');
    } else if (skin === SKINS.owl) {
      localStorage.setItem('vagc-skin-name', 'owl');
    } else if (skin === SKINS.eq) {
      localStorage.setItem('vagc-skin-name', 'eq');
    } else {
      localStorage.setItem('vagc-skin-name', 'custom');
      localStorage.setItem('vagc-skin-custom', JSON.stringify(skin));
    }
  }

  _mergeWithBase(partial) {
    const base = SKINS.classic;
    return {
      name: partial.name || base.name,
      fontUrl: partial.fontUrl !== undefined ? partial.fontUrl : base.fontUrl,
      css: { ...base.css, ...(partial.css || {}) },
      canvas: {
        disc:       { ...base.canvas.disc,       ...(partial.canvas?.disc       || {}) },
        label:      { ...base.canvas.label,      ...(partial.canvas?.label      || {}) },
        groove:     { ...base.canvas.groove,     ...(partial.canvas?.groove     || {}) },
        activeRing: { ...base.canvas.activeRing, ...(partial.canvas?.activeRing || {}) },
        stylus:     { ...base.canvas.stylus,     ...(partial.canvas?.stylus     || {}) },
      },
    };
  }
}
