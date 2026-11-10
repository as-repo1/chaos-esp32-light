/* ====================================================================
   Chaos ESP32 Light — Smart Cinema & Music Reactive Studio
   Powered by WLED (Christian Schwinne / Aircoookie)
   ==================================================================== */

// Configuration & Default State
const defaultTargetIp = '10.142.252.233';

function sanitizeIp(ip) {
  if (!ip || ip === '0.0.0.0' || ip === 'localhost' || ip === '127.0.0.1' || ip === '[::]' || ip === '10.109.101.60') {
    return defaultTargetIp;
  }
  return ip.trim();
}

let detectedHost = defaultTargetIp;
try {
  const hn = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
  if (hn && hn !== 'localhost' && hn !== '127.0.0.1' && hn !== '0.0.0.0' && hn !== '[::]' && hn.includes('.')) {
    detectedHost = hn;
  }
} catch (e) {}

let queryIp = '';
try {
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('ip')) queryIp = urlParams.get('ip');
    else if (urlParams.has('target')) queryIp = urlParams.get('target');
    else if (urlParams.has('wled')) queryIp = urlParams.get('wled');
  }
} catch (e) {}

let initialIp = defaultTargetIp;
try {
  const stored = localStorage.getItem('wled_ip');
  initialIp = sanitizeIp(queryIp || stored || detectedHost);
  localStorage.setItem('wled_ip', initialIp);
} catch (e) {
  initialIp = queryIp || defaultTargetIp;
}

const APP_STATE = {
  ip: initialIp,
  ledCount: parseInt(localStorage.getItem('wled_led_count') || '59', 10),
  activeSlot: 0,
  colors: [
    [255, 0, 85],   // Primary
    [0, 0, 0],      // Secondary
    [0, 0, 0]       // Tertiary
  ],
  brightness: 128,
  power: true,
  speed: 128,
  intensity: 128,
  currentFx: 0,
  currentPal: 0,
  effectsList: [],
  palettesList: [],
  presetsList: {},
  connected: false,
  ws: null,
  wsPingInterval: null,
  fps: 0,
  lastSendTime: 0,
  sendThrottleMs: 30 // ~33 FPS cap to protect ESP32 buffer
};

// Spectrum Color Themes (14 Curated Themes + Custom Mix)
const SPECTRUM_PALETTES = {
  cyberpunk: [
    [0, 242, 254],
    [99, 102, 241],
    [168, 85, 247],
    [236, 72, 153],
    [255, 0, 128]
  ],
  classicVu: [
    [16, 185, 129],
    [234, 179, 8],
    [249, 115, 22],
    [239, 68, 68]
  ],
  fire: [
    [120, 10, 0],
    [220, 50, 0],
    [255, 120, 0],
    [255, 200, 20],
    [255, 255, 180]
  ],
  ocean: [
    [15, 23, 42],
    [6, 182, 212],
    [56, 189, 248],
    [167, 243, 208],
    [255, 255, 255]
  ],
  synthwave: [
    [88, 28, 135],
    [217, 70, 239],
    [244, 63, 94],
    [249, 115, 22]
  ],
  rainbow: [
    [255, 0, 0],
    [255, 127, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 255, 255],
    [0, 0, 255],
    [148, 0, 211]
  ],
  matrix: [
    [0, 20, 0],
    [0, 100, 15],
    [0, 255, 65],
    [160, 255, 180],
    [255, 255, 255]
  ],
  aurora: [
    [5, 46, 68],
    [13, 148, 136],
    [16, 185, 129],
    [139, 92, 246],
    [236, 72, 153]
  ],
  toxicSunset: [
    [20, 250, 40],
    [250, 255, 0],
    [255, 0, 128],
    [120, 0, 255]
  ],
  bloodMoon: [
    [25, 0, 0],
    [139, 0, 0],
    [220, 20, 60],
    [255, 99, 71],
    [255, 215, 0]
  ],
  vaporwave: [
    [168, 230, 207],
    [253, 211, 193],
    [255, 170, 165],
    [255, 139, 148],
    [197, 163, 255]
  ],
  deepSpace: [
    [5, 0, 20],
    [45, 10, 80],
    [110, 20, 140],
    [0, 180, 216],
    [240, 240, 255]
  ],
  solarFlare: [
    [60, 0, 0],
    [180, 20, 0],
    [255, 100, 0],
    [255, 220, 50],
    [255, 255, 255]
  ],
  iceMint: [
    [10, 40, 60],
    [0, 200, 180],
    [64, 255, 220],
    [200, 255, 245],
    [255, 255, 255]
  ],
  custom: [
    [255, 0, 85],
    [0, 242, 254],
    [168, 85, 247]
  ]
};

function samplePalette(paletteName, pos) {
  const pal = SPECTRUM_PALETTES[paletteName] || SPECTRUM_PALETTES.cyberpunk;
  pos = Math.max(0, Math.min(1, pos));
  const scaled = pos * (pal.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;

  if (idx >= pal.length - 1) return pal[pal.length - 1];

  const c1 = pal[idx];
  const c2 = pal[idx + 1];

  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * frac),
    Math.round(c1[1] + (c2[1] - c1[1]) * frac),
    Math.round(c1[2] + (c2[2] - c1[2]) * frac)
  ];
}

