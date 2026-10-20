/* ====================================================================
   WLED Ambient Studio — Core Controller
   Engine: WebSocket / REST API, Canvas Color Wheel,
           Screen Ambilight Capture & Advanced Multi-Mode Audio FFT Analyzer
   ==================================================================== */

// Configuration & Default State
const defaultIp = (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? window.location.hostname
  : '10.109.101.60';

const APP_STATE = {
  ip: localStorage.getItem('wled_ip') || defaultIp,
  ledCount: parseInt(localStorage.getItem('wled_led_count') || '60', 10),
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

// ====================================================================
// WLED Communication Layer (WebSocket + REST fallback)
// ====================================================================
class WLEDClient {
  constructor(ip) {
    this.ip = ip;
    this.ws = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pendingPayload = null;
    this.isThrottling = false;
  }

  setIp(ip) {
    this.ip = ip;
    localStorage.setItem('wled_ip', ip);
    this.disconnect();
    this.connect();
    this.fetchInitialData();
  }

  connect() {
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);

    const wsUrl = `ws://${this.ip}/ws`;
    updateStatus('Connecting...', false);

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        APP_STATE.connected = true;
        updateStatus('Connected', true);
        showToast('Connected to ESP32 at ' + this.ip);
        this.fetchState();
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data);
            if (data.state) this.handleStateUpdate(data.state);
            if (data.info) this.handleInfoUpdate(data.info);
          } catch (e) {}
        }
      };

      this.ws.onerror = () => {
        updateStatus('Error', false);
      };

      this.ws.onclose = () => {
        APP_STATE.connected = false;
        updateStatus('Disconnected', false);
        this.reconnectTimer = setTimeout(() => this.connect(), 4000);
      };
    } catch (e) {
      updateStatus('Disconnected', false);
      this.reconnectTimer = setTimeout(() => this.connect(), 4000);
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    APP_STATE.connected = false;
    updateStatus('Disconnected', false);
  }

  startPing() {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const start = performance.now();
        fetch(`http://${this.ip}/json/state`, { signal: AbortSignal.timeout(2000) })
          .then(() => {
            const ms = Math.round(performance.now() - start);
            const pingEl = document.getElementById('pingBadge');
            if (pingEl) pingEl.textContent = `${ms} ms`;
          })
          .catch(() => {});
      }
    }, 6000);
  }

  async fetchInitialData() {
    try {
      const stateRes = await fetch(`http://${this.ip}/json/state`);
      const state = await stateRes.json();
      this.handleStateUpdate(state);

      const infoRes = await fetch(`http://${this.ip}/json/info`);
      const info = await infoRes.json();
      this.handleInfoUpdate(info);

      const effRes = await fetch(`http://${this.ip}/json/eff`);
      APP_STATE.effectsList = await effRes.json();
      renderEffectsGrid(APP_STATE.effectsList);

      const palRes = await fetch(`http://${this.ip}/json/pal`);
      APP_STATE.palettesList = await palRes.json();
      renderPalettesGrid(APP_STATE.palettesList);

      try {
        const presetRes = await fetch(`http://${this.ip}/presets.json`);
        APP_STATE.presetsList = await presetRes.json();
        renderPresetsList(APP_STATE.presetsList);
      } catch (e) {}
    } catch (err) {
      console.warn('Failed to load initial WLED data via REST:', err);
    }
  }

  async fetchState() {
    try {
      const res = await fetch(`http://${this.ip}/json/state`);
      const state = await res.json();
      this.handleStateUpdate(state);
    } catch (e) {}
  }

  handleStateUpdate(state) {
    if (state.on !== undefined) {
      APP_STATE.power = state.on;
      updatePowerUI(state.on);
    }
    if (state.bri !== undefined) {
      APP_STATE.brightness = state.bri;
      updateBrightnessUI(state.bri);
    }
    if (state.udpn) {
      updateSyncUI(state.udpn.send, state.udpn.recv);
    }
    if (state.seg && state.seg[0]) {
      const seg = state.seg[0];
      if (seg.col && seg.col.length > 0 && (!window._movieSync || !window._movieSync.active) && (!window._musicSync || !window._musicSync.active)) {
        APP_STATE.colors[0] = seg.col[0].slice(0, 3);
        if (seg.col[1]) APP_STATE.colors[1] = seg.col[1].slice(0, 3);
        if (seg.col[2]) APP_STATE.colors[2] = seg.col[2].slice(0, 3);
        updateColorSlotsUI();
        colorWheel.setColorRGB(...APP_STATE.colors[APP_STATE.activeSlot]);
      }
      if (seg.fx !== undefined) {
        APP_STATE.currentFx = seg.fx;
        highlightActiveEffect(seg.fx);
      }
      if (seg.pal !== undefined) {
        APP_STATE.currentPal = seg.pal;
        highlightActivePalette(seg.pal);
      }
      if (seg.sx !== undefined) {
        APP_STATE.speed = seg.sx;
        document.getElementById('sliderSpeed').value = seg.sx;
        document.getElementById('speedValText').textContent = seg.sx;
      }
      if (seg.ix !== undefined) {
        APP_STATE.intensity = seg.ix;
        document.getElementById('sliderIntensity').value = seg.ix;
        document.getElementById('intensityValText').textContent = seg.ix;
      }
    }
  }

  handleInfoUpdate(info) {
    if (info.ver) document.getElementById('diagVer').textContent = info.ver;
    if (info.name) document.getElementById('diagName').textContent = info.name;
    if (info.wifi && info.wifi.rssi !== undefined) {
      document.getElementById('diagWifi').textContent = `${info.wifi.rssi} dBm`;
    }
    if (info.leds) {
      if (info.leds.count) {
        APP_STATE.ledCount = info.leds.count;
        document.getElementById('ledCountBadge').textContent = info.leds.count;
        document.getElementById('ledCountInput').value = info.leds.count;
        virtualStrip.resize(info.leds.count);
        if (window._movieSync) window._movieSync.renderDivisionControls();
      }
      if (info.leds.pwr !== undefined) {
        document.getElementById('diagPower').textContent = `${info.leds.pwr} mA`;
      }
      if (info.leds.fps !== undefined) {
        document.getElementById('diagFps').textContent = `${info.leds.fps} FPS`;
        document.getElementById('fpsDisplay').textContent = `${info.leds.fps} FPS`;
      }
    }
    document.getElementById('diagWs').textContent = APP_STATE.connected ? 'Active (WebSocket)' : 'Offline';

    // Update Multi-Device Hub cards
    const devNameEl = document.getElementById('activeDevName');
    if (devNameEl) devNameEl.textContent = info.name || 'WLED Controller';
    const devIpEl = document.getElementById('activeDevIp');
    if (devIpEl) devIpEl.textContent = this.ip;
    const devArchEl = document.getElementById('activeDevArch');
    if (devArchEl) devArchEl.textContent = (info.arch || 'ESP32').toUpperCase();
    const devLedsEl = document.getElementById('activeDevLeds');
    if (devLedsEl) devLedsEl.textContent = `${info.leds?.count || 60} LEDs`;
    const devRssiEl = document.getElementById('activeDevRssi');
    if (devRssiEl) devRssiEl.textContent = `${info.wifi?.rssi || -53} dBm`;

    const wifiSsidEl = document.getElementById('currentWifiSsidDisplay');
    if (wifiSsidEl) wifiSsidEl.textContent = 'pk';
    const wifiIpEl = document.getElementById('currentWifiIpDisplay');
    if (wifiIpEl) wifiIpEl.textContent = info.ip || this.ip;
    const wifiSigEl = document.getElementById('currentWifiSignalDisplay');
    if (wifiSigEl) wifiSigEl.textContent = `${info.wifi?.signal || 94}% (${info.wifi?.rssi || -53} dBm)`;
  }

  async fetchNodes() {
    try {
      const res = await fetch(`http://${this.ip}/json/nodes`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      renderDiscoveredNodes(data.nodes || []);
    } catch (e) {
      renderDiscoveredNodes([]);
    }
  }

  setUdpSync(send, recv) {
    this.send({
      udpn: { send: send, recv: recv }
    }, true);
    updateSyncUI(send, recv);
    showToast(`UDP Broadcast Sync: ${send ? 'ENABLED (Broadcasting to all lights)' : 'DISABLED'}`);
  }

  async testSyncPulse() {
    showToast('Triggering Sync Flash Test across all network lights...');
    const originalBri = APP_STATE.brightness;
    this.send({ on: true, bri: 255, seg: { col: [[255, 255, 255]], fx: 0 } }, true);
    setTimeout(() => {
      this.send({ on: APP_STATE.power, bri: originalBri, seg: { col: APP_STATE.colors, fx: APP_STATE.currentFx } }, true);
    }, 900);
  }

  async saveWifi(ssid, password) {
    try {
      const res = await fetch(`http://${this.ip}/json/cfg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nw: {
            ins: [
              { ssid: ssid, pswd: password }
            ]
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Wi-Fi credentials saved! Default: ${ssid} / ${password}`);
        const feedback = document.getElementById('wifiSaveFeedback');
        if (feedback) feedback.textContent = `Saved! Wi-Fi set to "${ssid}". ESP32 will connect automatically.`;
      }
    } catch (err) {
      showToast('Error saving Wi-Fi settings');
    }
  }

  send(payload, immediate = false) {
    if (immediate) {
      this._transmit(payload);
      return;
    }

    this.pendingPayload = { ...(this.pendingPayload || {}), ...payload };
    const now = performance.now();
    const elapsed = now - this.lastSendTime;

    if (elapsed >= APP_STATE.sendThrottleMs) {
      this._flush();
    } else if (!this.isThrottling) {
      this.isThrottling = true;
      setTimeout(() => {
        this.isThrottling = false;
        this._flush();
      }, APP_STATE.sendThrottleMs - elapsed);
    }
  }

  _flush() {
    if (!this.pendingPayload) return;
    const payload = this.pendingPayload;
    this.pendingPayload = null;
    this.lastSendTime = performance.now();
    this._transmit(payload);
  }

  _transmit(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return;
      } catch (e) {}
    }

    fetch(`http://${this.ip}/json/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1000)
    }).catch(() => {});
  }
}

const wled = new WLEDClient(APP_STATE.ip);

// ====================================================================
// Interactive Canvas Color Wheel
// ====================================================================
class CanvasColorWheel {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.canvas = null;
    this.ctx = null;
    this.radius = 100;
    this.center = 100;
    this.isDragging = false;
    this.currentHue = 340;
    this.currentSat = 1.0;
    this.currentVal = 1.0;
  }

  init() {
    this.canvas = document.getElementById(this.canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.radius = this.canvas.width / 2;
    this.center = this.radius;

    this.drawWheel();

    const handlePointer = (e) => {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left - this.center;
      const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top - this.center;
      const dist = Math.sqrt(x * x + y * y);

      if (dist <= this.radius || this.isDragging) {
        let angle = Math.atan2(y, x) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        this.currentHue = angle;
        this.currentSat = Math.min(1.0, dist / this.radius);

        const [r, g, b] = hsvToRgb(this.currentHue, this.currentSat, this.currentVal);
        updateActiveColor(r, g, b, true);
      }
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      handlePointer(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) handlePointer(e);
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('touchstart', (e) => {
      this.isDragging = true;
      handlePointer(e);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging) {
        handlePointer(e);
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  drawWheel() {
    if (!this.canvas || !this.ctx) return;
    const imgData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    const data = imgData.data;

    for (let y = 0; y < this.canvas.height; y++) {
      for (let x = 0; x < this.canvas.width; x++) {
        const dx = x - this.center;
        const dy = y - this.center;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * this.canvas.width + x) * 4;

        if (dist <= this.radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;

          const sat = dist / this.radius;
          const [r, g, b] = hsvToRgb(angle, sat, 1.0);

          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }

    this.ctx.putImageData(imgData, 0, 0);
  }

  setColorRGB(r, g, b) {
    const [h, s, v] = rgbToHsv(r, g, b);
    this.currentHue = h;
    this.currentSat = s;
    this.currentVal = v;
    updateCenterPreview(r, g, b);
  }
}

const colorWheel = new CanvasColorWheel('colorWheelCanvas');

// ====================================================================
// Virtual LED Strip Visualizer Canvas
// ====================================================================
class VirtualStripVisualizer {
  constructor(canvasId, count = 60) {
    this.canvasId = canvasId;
    this.canvas = null;
    this.ctx = null;
    this.count = count;
    this.leds = new Array(count).fill([255, 0, 85]);
    this.animating = false;
  }

  init() {
    this.canvas = document.getElementById(this.canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    if (this.animating) return;
    this.animating = true;
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  resize(newCount) {
    this.count = newCount;
    this.leds = new Array(newCount).fill(APP_STATE.colors[0] || [255, 0, 85]);
  }

  setUniformColor(r, g, b) {
    for (let i = 0; i < this.count; i++) {
      this.leds[i] = [r, g, b];
    }
  }

  setMultiLed(ledArray) {
    for (let i = 0; i < Math.min(this.count, ledArray.length); i++) {
      this.leds[i] = ledArray[i];
    }
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const step = w / this.count;
    const radius = Math.max(2, Math.min(6, (step - 1) / 2));
    const centerY = h / 2;

    for (let i = 0; i < this.count; i++) {
      const [r, g, b] = this.leds[i] || [0, 0, 0];
      const cx = (i + 0.5) * step;

      const glowGrad = this.ctx.createRadialGradient(cx, centerY, 1, cx, centerY, radius * 2.5);
      glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.8)`);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      this.ctx.fillStyle = glowGrad;
      this.ctx.beginPath();
      this.ctx.arc(cx, centerY, radius * 2.5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      this.ctx.beginPath();
      this.ctx.arc(cx, centerY, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

const virtualStrip = new VirtualStripVisualizer('virtualStripCanvas', APP_STATE.ledCount);

// ====================================================================
// Movie / Screen Sync Engine (Next-Gen Multi-Zone Ambilight)
// ====================================================================
// TAB 2: MOVIE SYNC (CINEMA AMBILIGHT ENGINE WITH MULTI-ZONE & RATIO DIVISION)
// ====================================================================
class MovieSyncEngine {
  constructor() {
    this.stream = null;
    this.video = null;
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    this.sampleCanvas.width = 160;
    this.sampleCanvas.height = 90;

    this.active = false;
    // Modes: '3-edges', '3-cols', '4-edges', '2-sides', 'dominant', 'average'
    this.mode = localStorage.getItem('ambilight_mode') || '3-edges';
    this.smoothing = 0.35;
    this.saturation = 1.5;
    this.blackFloor = 0;
    this.letterboxFilter = true;
    this.wiringDirection = localStorage.getItem('ambilight_wiring') || 'cw';

    // Proportions / parts per section for multi-zone modes (Default 3-4-2 for 3-edges as requested)
    this.zoneRatios = {
      '3-edges': JSON.parse(localStorage.getItem('ambilight_ratios_3edges') || '[3, 4, 2]'),
      '3-cols': JSON.parse(localStorage.getItem('ambilight_ratios_3cols') || '[1, 1, 1]'),
      '4-edges': JSON.parse(localStorage.getItem('ambilight_ratios_4edges') || '[7, 3, 7, 3]'),
      '2-sides': JSON.parse(localStorage.getItem('ambilight_ratios_2sides') || '[1, 1]')
    };

    this.currentRGB = [0, 0, 0];
    this.zoneColors = {
      top: [0, 0, 0],
      right: [0, 0, 0],
      bottom: [0, 0, 0],
      left: [0, 0, 0],
      colLeft: [0, 0, 0],
      colCenter: [0, 0, 0],
      colRight: [0, 0, 0]
    };

    this.sampleCounter = 0;
    this.lastSampleRateTime = performance.now();
  }

  init() {
    this.video = document.getElementById('screenVideoElement');

    // Setup active mode button
    document.querySelectorAll('#ambilightModeSelect .zone-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.mode);
      btn.addEventListener('click', () => {
        this.setMode(btn.dataset.mode);
      });
    });

    // Strip wiring select
    const wiringSelect = document.getElementById('wiringSelect');
    if (wiringSelect) {
      wiringSelect.addEventListener('change', (e) => {
        this.wiringDirection = e.target.value;
        try { localStorage.setItem('ambilight_wiring', e.target.value); } catch (err) {}
        showToast(`Wiring Sequence: ${e.target.options[e.target.selectedIndex].text}`);
      });
    }

    // Custom Division Ratio input
    const applyBtn = document.getElementById('btnApplyCustomRatio');
    const ratioInput = document.getElementById('customRatioInput');
    if (applyBtn && ratioInput) {
      applyBtn.addEventListener('click', () => {
        this.applyCustomRatio(ratioInput.value);
      });
      ratioInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.applyCustomRatio(ratioInput.value);
        }
      });
    }

    this.updateWiringOptions();
    this.renderDivisionControls();
    this.updateVisibilityForMode();
  }

  getZoneNames() {
    if (this.mode === '3-edges') return ['Left Edge', 'Top Edge', 'Right Edge'];
    if (this.mode === '3-cols') return ['Left Column', 'Center Column', 'Right Column'];
    if (this.mode === '4-edges') return ['Top Edge', 'Right Edge', 'Bottom Edge', 'Left Edge'];
    if (this.mode === '2-sides') return ['Left Lightbar', 'Right Lightbar'];
    return [];
  }

  getPresetsForMode() {
    if (this.mode === '3-edges') {
      return [
        { label: '3-4-2 (User Custom)', ratio: [3, 4, 2] },
        { label: '1-2-1 (16:9 Standard)', ratio: [1, 2, 1] },
        { label: '1-1-1 (Equal Sides)', ratio: [1, 1, 1] },
        { label: '1-3-1 (21:9 Ultrawide)', ratio: [1, 3, 1] },
        { label: '2-3-2 (16:10 Ratio)', ratio: [2, 3, 2] },
        { label: '3-5-3 (32:9 Superwide)', ratio: [3, 5, 3] }
      ];
    }
    if (this.mode === '3-cols') {
      return [
        { label: '1-1-1 (Equal Thirds)', ratio: [1, 1, 1] },
        { label: '3-4-2 (Custom 3-Zone)', ratio: [3, 4, 2] },
        { label: '1-2-1 (Center Focus)', ratio: [1, 2, 1] },
        { label: '2-1-2 (Side Accents)', ratio: [2, 1, 2] }
      ];
    }
    if (this.mode === '4-edges') {
      return [
        { label: '7-3-7-3 (16:9 Frame)', ratio: [7, 3, 7, 3] },
        { label: '1-1-1-1 (Equal Sides)', ratio: [1, 1, 1, 1] },
        { label: '12-3-12-3 (21:9 Ultrawide)', ratio: [12, 3, 12, 3] }
      ];
    }
    if (this.mode === '2-sides') {
      return [
        { label: '1-1 (Symmetric)', ratio: [1, 1] },
        { label: '2-1 (Left Bias)', ratio: [2, 1] },
        { label: '1-2 (Right Bias)', ratio: [1, 2] }
      ];
    }
    return [];
  }

  getZoneCounts() {
    const total = APP_STATE.ledCount || 60;
    const ratios = this.zoneRatios[this.mode];
    if (!ratios || ratios.length === 0) return [total];

    const sum = ratios.reduce((a, b) => a + b, 0);
    if (sum === 0) return ratios.map(() => Math.floor(total / ratios.length));

    let counts = ratios.map(r => Math.max(1, Math.round(total * (r / sum))));
    let currentSum = counts.reduce((a, b) => a + b, 0);

    // Adjust discrepancy on the largest section so total is exact
    while (currentSum !== total) {
      if (currentSum < total) {
        let maxIdx = 0;
        for (let i = 1; i < counts.length; i++) {
          if (counts[i] > counts[maxIdx]) maxIdx = i;
        }
        counts[maxIdx]++;
        currentSum++;
      } else {
        let maxIdx = 0;
        for (let i = 1; i < counts.length; i++) {
          if (counts[i] > counts[maxIdx]) maxIdx = i;
        }
        if (counts[maxIdx] > 1) {
          counts[maxIdx]--;
          currentSum--;
        } else {
          break;
        }
      }
    }
    return counts;
  }

  setRatios(newRatios) {
    if (!Array.isArray(newRatios) || newRatios.length === 0) return;
    this.zoneRatios[this.mode] = newRatios.map(n => Math.max(1, Math.round(n)));
    try {
      localStorage.setItem(`ambilight_ratios_${this.mode.replace('-', '')}`, JSON.stringify(this.zoneRatios[this.mode]));
    } catch (e) {}
    this.renderDivisionControls();
    showToast(`Divided ${this.mode}: ${this.zoneRatios[this.mode].join(' : ')}`);
  }

  applyCustomRatio(str) {
    if (!str) return;
    const parts = str.trim().split(/[^0-9]+/).filter(Boolean).map(n => parseInt(n, 10));
    const expectedLen = this.getZoneNames().length;
    if (parts.length !== expectedLen) {
      showToast(`Please enter ${expectedLen} numbers for this mode (e.g. ${expectedLen === 3 ? '3-4-2' : expectedLen === 4 ? '7-3-7-3' : '1-1'})`);
      return;
    }
    this.setRatios(parts);
  }

  adjustSectionCount(targetIdx, newCount) {
    const total = APP_STATE.ledCount || 60;
    const names = this.getZoneNames();
    const len = names.length;
    let counts = this.getZoneCounts();

    newCount = Math.max(1, Math.min(total - (len - 1), newCount));
    const diff = newCount - counts[targetIdx];
    if (diff === 0) return;

    counts[targetIdx] = newCount;
    const otherIndices = [];
    for (let i = 0; i < len; i++) {
      if (i !== targetIdx) otherIndices.push(i);
    }

    let otherSum = otherIndices.reduce((sum, i) => sum + counts[i], 0);
    const targetOtherSum = total - newCount;

    if (otherSum === 0) {
      const equalShare = Math.floor(targetOtherSum / otherIndices.length);
      otherIndices.forEach((idx, i) => {
        counts[idx] = i === 0 ? targetOtherSum - equalShare * (otherIndices.length - 1) : equalShare;
      });
    } else {
      let allocated = 0;
      otherIndices.forEach((idx, i) => {
        if (i === otherIndices.length - 1) {
          counts[idx] = Math.max(1, targetOtherSum - allocated);
        } else {
          const share = Math.max(1, Math.round(targetOtherSum * (counts[idx] / otherSum)));
          counts[idx] = share;
          allocated += share;
        }
      });
    }

    this.zoneRatios[this.mode] = counts;
    try {
      localStorage.setItem(`ambilight_ratios_${this.mode.replace('-', '')}`, JSON.stringify(counts));
    } catch (e) {}

    this.renderDivisionControls();
  }

  updateWiringOptions() {
    const select = document.getElementById('wiringSelect');
    if (!select) return;

    const saved = localStorage.getItem('ambilight_wiring') || this.wiringDirection;
    select.innerHTML = '';

    let options = [];
    if (this.mode === '3-edges') {
      options = [
        { val: 'cw', label: 'Bottom-Left ➔ Top ➔ Right (Clockwise)' },
        { val: 'ccw', label: 'Bottom-Right ➔ Top ➔ Left (Counter-Clockwise)' },
        { val: 'lr', label: 'Left ➔ Top ➔ Right' }
      ];
    } else if (this.mode === '3-cols') {
      options = [
        { val: 'lr', label: 'Left ➔ Center ➔ Right (Default)' },
        { val: 'rl', label: 'Right ➔ Center ➔ Left' }
      ];
    } else if (this.mode === '4-edges') {
      options = [
        { val: 'cw', label: 'Top ➔ Right ➔ Bottom ➔ Left (Clockwise)' },
        { val: 'ccw', label: 'Left ➔ Bottom ➔ Right ➔ Top (Counter-Clockwise)' },
        { val: 'bl_cw', label: 'Bottom-Left ➔ Top ➔ Right ➔ Bottom' }
      ];
    } else if (this.mode === '2-sides') {
      options = [
        { val: 'lr', label: 'Left Pillar ➔ Right Pillar (Default)' },
        { val: 'rl', label: 'Right Pillar ➔ Left Pillar' }
      ];
    }

    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.val;
      o.textContent = opt.label;
      if (opt.val === saved) o.selected = true;
      select.appendChild(o);
    });

    if (select.value) {
      this.wiringDirection = select.value;
    }
  }

  renderDivisionControls() {
    const card = document.getElementById('sectionDivisionCard');
    if (!card) return;

    if (this.mode === 'dominant' || this.mode === 'average') {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'flex';

    const names = this.getZoneNames();
    const counts = this.getZoneCounts();
    const total = APP_STATE.ledCount || 60;

    // Summary Badge
    const badge = document.getElementById('divisionSummaryBadge');
    if (badge) {
      badge.textContent = `${counts.join(' • ')} (${total} LEDs)`;
    }

    // Custom Ratio Hint & Input placeholder
    const hint = document.getElementById('customRatioHint');
    if (hint) {
      hint.textContent = `Enter ${names.length} numbers for ${names.join(', ')}`;
    }
    const ratioInput = document.getElementById('customRatioInput');
    if (ratioInput) {
      ratioInput.placeholder = this.mode === '3-edges' ? 'e.g. 3-4-2 or 15-30-15' : `e.g. ${counts.join('-')}`;
    }
    const applyBtn = document.getElementById('btnApplyCustomRatio');
    if (applyBtn) {
      applyBtn.textContent = `Apply ${this.mode === '3-edges' ? '3-4-2' : 'Ratio'}`;
    }

    // Presets Row
    const presetsRow = document.getElementById('divisionPresetsRow');
    if (presetsRow) {
      presetsRow.innerHTML = '';
      const presets = this.getPresetsForMode();
      const currentRatios = this.zoneRatios[this.mode] || [];
      presets.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'division-chip-btn';
        const isMatch = currentRatios.length === p.ratio.length && currentRatios.every((v, i) => v === p.ratio[i]);
        if (isMatch) btn.classList.add('active');
        btn.textContent = p.label;
        btn.addEventListener('click', () => {
          this.setRatios(p.ratio);
        });
        presetsRow.appendChild(btn);
      });
    }

    // Sliders List
    const slidersList = document.getElementById('sectionSlidersList');
    if (slidersList) {
      slidersList.innerHTML = '';
      let runningStart = 0;
      names.forEach((name, idx) => {
        const count = counts[idx];
        const end = runningStart + count;
        const pct = Math.round((count / total) * 100);

        const row = document.createElement('div');
        row.className = 'section-slider-row';
        row.innerHTML = `
          <div class="section-label-bar">
            <span class="section-name">${name}</span>
            <span class="section-led-badge" id="sectionLedBadge_${idx}">LEDs ${runningStart}–${end - 1} (${count} LEDs, ${pct}%)</span>
          </div>
          <input type="range" class="glass-slider" id="sectionSlider_${idx}" min="1" max="${total - (names.length - 1)}" value="${count}" />
        `;

        const slider = row.querySelector('input');
        slider.addEventListener('input', (e) => {
          const newVal = parseInt(e.target.value, 10);
          this.adjustSectionCount(idx, newVal);
        });

        slidersList.appendChild(row);
        runningStart = end;
      });
    }
  }

  updateVisibilityForMode() {
    const singleDisplay = document.getElementById('singleSampledDisplay');
    const zoneContainer = document.getElementById('zoneChipsContainer');
    const card = document.getElementById('sectionDivisionCard');

    if (this.mode === 'dominant' || this.mode === 'average') {
      if (card) card.style.display = 'none';
      if (singleDisplay) singleDisplay.style.display = 'flex';
      if (zoneContainer) zoneContainer.style.display = 'none';
    } else {
      if (card) card.style.display = 'flex';
      if (singleDisplay) singleDisplay.style.display = 'none';
      if (zoneContainer) zoneContainer.style.display = 'flex';
    }

    // Column overlays visibility
    ['colZoneLeft', 'colZoneCenter', 'colZoneRight'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (this.mode === '3-cols') el.classList.remove('hide');
        else el.classList.add('hide');
      }
    });
  }

  setMode(mode) {
    this.mode = mode;
    try {
      localStorage.setItem('ambilight_mode', mode);
    } catch (e) {}

    document.querySelectorAll('#ambilightModeSelect .zone-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    this.updateWiringOptions();
    this.renderDivisionControls();
    this.updateVisibilityForMode();

    // Reset visual indicators
    ['edgeTop', 'edgeRight', 'edgeBottom', 'edgeLeft'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.background = 'transparent';
    });
    ['colZoneLeft', 'colZoneCenter', 'colZoneRight'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.background = 'transparent';
    });

    const modeTitles = {
      '3-edges': '3-Side Monitor (Left • Top • Right)',
      '3-cols': '3 Columns (Left • Center • Right)',
      '4-edges': '4-Edge Frame (Full 4 Sides)',
      '2-sides': '2 Lightbars (Left & Right)',
      'dominant': 'Vibrant Dominant Scene',
      'average': 'Weighted Screen Average'
    };
    showToast(`Ambilight Layout: ${modeTitles[mode] || mode}`);
  }

  updateZoneInspector(zones) {
    const container = document.getElementById('zoneChipsContainer');
    const singleDisplay = document.getElementById('singleSampledDisplay');
    if (!container) return;

    if (!zones || zones.length === 0 || this.mode === 'dominant' || this.mode === 'average') {
      container.style.display = 'none';
      if (singleDisplay) singleDisplay.style.display = 'flex';
      return;
    }

    container.style.display = 'flex';
    if (singleDisplay) singleDisplay.style.display = 'none';

    // If card count doesn't match, recreate cards
    if (container.children.length !== zones.length) {
      container.innerHTML = '';
      zones.forEach((z, idx) => {
        const card = document.createElement('div');
        card.className = 'zone-inspect-card';
        card.id = `zoneInspectCard_${idx}`;
        card.innerHTML = `
          <div class="zone-inspect-swatch" id="zoneInspectSwatch_${idx}"></div>
          <div class="zone-inspect-info">
            <span class="zone-inspect-title" id="zoneInspectTitle_${idx}">${z.name}</span>
            <span class="zone-inspect-hex" id="zoneInspectHex_${idx}">#000000</span>
            <span class="zone-inspect-leds" id="zoneInspectLeds_${idx}">${z.leds} LEDs (${z.startIdx}–${z.endIdx - 1})</span>
          </div>
        `;
        container.appendChild(card);
      });
    }

    // Update swatches and text
    zones.forEach((z, idx) => {
      const hex = rgbToHex(z.rgb[0], z.rgb[1], z.rgb[2]);
      const swatch = document.getElementById(`zoneInspectSwatch_${idx}`);
      if (swatch) {
        swatch.style.backgroundColor = hex;
        swatch.style.boxShadow = `0 0 10px rgba(${z.rgb[0]}, ${z.rgb[1]}, ${z.rgb[2]}, 0.6)`;
      }
      const hexEl = document.getElementById(`zoneInspectHex_${idx}`);
      if (hexEl) hexEl.textContent = hex;
      const titleEl = document.getElementById(`zoneInspectTitle_${idx}`);
      if (titleEl && titleEl.textContent !== z.name) titleEl.textContent = z.name;
      const ledsEl = document.getElementById(`zoneInspectLeds_${idx}`);
      if (ledsEl) ledsEl.textContent = `${z.leds} LEDs (${z.startIdx}–${z.endIdx - 1})`;
    });
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 60, max: 60 },
          cursor: 'never'
        },
        audio: false
      });

      if (!this.video) {
        this.video = document.getElementById('screenVideoElement');
      }
      this.video.srcObject = this.stream;
      await this.video.play();
      this.active = true;

      this.stream.getVideoTracks()[0].onended = () => this.stop();

      document.getElementById('monitorPlaceholder')?.classList.add('hide');
      document.getElementById('btnStartMovieSync')?.classList.add('hide');
      document.getElementById('btnStopMovieSync')?.classList.remove('hide');
      document.getElementById('movieActiveBadge')?.classList.remove('hide');
      const statusEl = document.getElementById('screenSyncStatus');
      if (statusEl) {
        statusEl.textContent = 'Streaming to WLED';
        statusEl.classList.add('active');
      }

      showToast('Movie Sync Activated! Colors are streaming to ESP32');
      this.loop();
    } catch (err) {
      console.warn('Screen capture canceled or denied:', err);
      showToast('Screen capture permission was not granted');
    }
  }

  stop() {
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }

    document.getElementById('monitorPlaceholder')?.classList.remove('hide');
    document.getElementById('btnStartMovieSync')?.classList.remove('hide');
    document.getElementById('btnStopMovieSync')?.classList.add('hide');
    document.getElementById('movieActiveBadge')?.classList.add('hide');
    const statusEl = document.getElementById('screenSyncStatus');
    if (statusEl) {
      statusEl.textContent = 'Awaiting Screen Selection';
      statusEl.classList.remove('active');
    }

    const monitor = document.getElementById('screenMonitorBox');
    if (monitor) {
      monitor.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.8)';
      monitor.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    }

    ['edgeTop', 'edgeRight', 'edgeBottom', 'edgeLeft'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.background = 'transparent';
    });
    ['colZoneLeft', 'colZoneCenter', 'colZoneRight'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.background = 'transparent';
        el.classList.add('hide');
      }
    });

    const ambientBg = document.getElementById('ambientBg');
    if (ambientBg) {
      ambientBg.style.background = '';
    }

    // Unfreeze WLED and restore normal transition and state
    wled.send({
      transition: 7,
      v: false,
      on: APP_STATE.power,
      bri: APP_STATE.brightness,
      seg: {
        frz: false,
        col: APP_STATE.colors,
        fx: APP_STATE.currentFx
      }
    }, true);
  }

  loop() {
    if (!this.active) return;
    if (this.video && this.video.readyState >= 2) this.processFrame();
    requestAnimationFrame(() => this.loop());
  }

  processFrame() {
    if (!this.active) return;
    if (!this.video) this.video = document.getElementById('screenVideoElement');
    if (!this.video || this.video.readyState < 2 || this.video.videoWidth === 0) return;

    const sw = this.sampleCanvas.width;
    const sh = this.sampleCanvas.height;

    this.sampleCtx.drawImage(this.video, 0, 0, sw, sh);

    // Dynamic Letterbox black-bar detection
    let startY = 0;
    let endY = sh;
    if (this.letterboxFilter) {
      const topRow = this.sampleCtx.getImageData(0, 0, sw, 1).data;
      let topHasContent = false;
      for (let x = 0; x < topRow.length; x += 16) {
        if (Math.max(topRow[x], topRow[x + 1], topRow[x + 2]) > 25) {
          topHasContent = true;
          break;
        }
      }
      if (!topHasContent) {
        for (let y = 1; y < Math.floor(sh * 0.30); y += 2) {
          const row = this.sampleCtx.getImageData(0, y, sw, 1).data;
          let maxBri = 0;
          for (let x = 0; x < row.length; x += 16) {
            maxBri = Math.max(maxBri, row[x], row[x + 1], row[x + 2]);
          }
          if (maxBri > 25) { startY = y; break; }
        }
      }

      const botRow = this.sampleCtx.getImageData(0, sh - 1, sw, 1).data;
      let botHasContent = false;
      for (let x = 0; x < botRow.length; x += 16) {
        if (Math.max(botRow[x], botRow[x + 1], botRow[x + 2]) > 25) {
          botHasContent = true;
          break;
        }
      }
      if (!botHasContent) {
        for (let y = sh - 2; y > Math.floor(sh * 0.70); y -= 2) {
          const row = this.sampleCtx.getImageData(0, y, sw, 1).data;
          let maxBri = 0;
          for (let x = 0; x < row.length; x += 16) {
            maxBri = Math.max(maxBri, row[x], row[x + 1], row[x + 2]);
          }
          if (maxBri > 25) { endY = y + 1; break; }
        }
      }
    }

    const activeHeight = Math.max(10, endY - startY);
    const ledCount = APP_STATE.ledCount || 60;
    const masterBriFactor = APP_STATE.brightness / 255;

    if (this.mode === '3-edges') {
      // 1. 3-SIDE MONITOR (Left • Top • Right, e.g. 3-4-2 or 1-2-1)
      const leftData = this.sampleCtx.getImageData(0, startY, Math.max(2, Math.floor(sw * 0.20)), activeHeight).data;
      const topData = this.sampleCtx.getImageData(0, startY, sw, Math.max(2, Math.floor(activeHeight * 0.20))).data;
      const rightData = this.sampleCtx.getImageData(sw - Math.max(2, Math.floor(sw * 0.20)), startY, Math.max(2, Math.floor(sw * 0.20)), activeHeight).data;

      const rawLeft = this._sampleZone(leftData);
      const rawTop = this._sampleZone(topData);
      const rawRight = this._sampleZone(rightData);

      for (let c = 0; c < 3; c++) {
        this.zoneColors.left[c] = Math.round(lerp(this.zoneColors.left[c], rawLeft[c], this.smoothing));
        this.zoneColors.top[c] = Math.round(lerp(this.zoneColors.top[c], rawTop[c], this.smoothing));
        this.zoneColors.right[c] = Math.round(lerp(this.zoneColors.right[c], rawRight[c], this.smoothing));
      }

      // Update Monitor Edge Indicators
      const setEdgeStyle = (id, rgb) => {
        const el = document.getElementById(id);
        if (el) el.style.background = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.88)`;
      };
      setEdgeStyle('edgeLeft', this.zoneColors.left);
      setEdgeStyle('edgeTop', this.zoneColors.top);
      setEdgeStyle('edgeRight', this.zoneColors.right);
      const botEl = document.getElementById('edgeBottom');
      if (botEl) botEl.style.background = 'transparent';

      const counts = this.getZoneCounts();
      const [cLeft, cTop, cRight] = counts;

      // Assign sequence according to strip wiring
      let z0, z1, z2;
      if (this.wiringDirection === 'ccw') {
        // Bottom-Right -> Top -> Left
        z0 = { name: 'Right Edge', rgb: this.zoneColors.right, count: cRight };
        z1 = { name: 'Top Edge', rgb: this.zoneColors.top, count: cTop };
        z2 = { name: 'Left Edge', rgb: this.zoneColors.left, count: cLeft };
      } else {
        // Default cw: Bottom-Left -> Top -> Right
        z0 = { name: 'Left Edge', rgb: this.zoneColors.left, count: cLeft };
        z1 = { name: 'Top Edge', rgb: this.zoneColors.top, count: cTop };
        z2 = { name: 'Right Edge', rgb: this.zoneColors.right, count: cRight };
      }

      const p1 = z0.count;
      const p2 = p1 + z1.count;
      const p3 = ledCount;

      const ledColors = new Array(ledCount);
      for (let i = 0; i < p1; i++) ledColors[i] = [Math.round(z0.rgb[0] * masterBriFactor), Math.round(z0.rgb[1] * masterBriFactor), Math.round(z0.rgb[2] * masterBriFactor)];
      for (let i = p1; i < p2; i++) ledColors[i] = [Math.round(z1.rgb[0] * masterBriFactor), Math.round(z1.rgb[1] * masterBriFactor), Math.round(z1.rgb[2] * masterBriFactor)];
      for (let i = p2; i < p3; i++) ledColors[i] = [Math.round(z2.rgb[0] * masterBriFactor), Math.round(z2.rgb[1] * masterBriFactor), Math.round(z2.rgb[2] * masterBriFactor)];
      virtualStrip.setMultiLed(ledColors);

      // Multi-zone inspector update
      this.updateZoneInspector([
        { name: 'Left Edge', rgb: this.zoneColors.left, leds: cLeft, startIdx: this.wiringDirection === 'ccw' ? p2 : 0, endIdx: this.wiringDirection === 'ccw' ? p3 : p1 },
        { name: 'Top Edge', rgb: this.zoneColors.top, leds: cTop, startIdx: p1, endIdx: p2 },
        { name: 'Right Edge', rgb: this.zoneColors.right, leds: cRight, startIdx: this.wiringDirection === 'ccw' ? 0 : p2, endIdx: this.wiringDirection === 'ccw' ? p1 : p3 }
      ]);

      const avgR = Math.round((this.zoneColors.left[0] + this.zoneColors.top[0] + this.zoneColors.right[0]) / 3);
      const avgG = Math.round((this.zoneColors.left[1] + this.zoneColors.top[1] + this.zoneColors.right[1]) / 3);
      const avgB = Math.round((this.zoneColors.left[2] + this.zoneColors.top[2] + this.zoneColors.right[2]) / 3);

      const monitor = document.getElementById('screenMonitorBox');
      if (monitor) {
        monitor.style.borderColor = `rgba(${avgR}, ${avgG}, ${avgB}, 0.75)`;
        monitor.style.boxShadow = `0 0 35px rgba(${avgR}, ${avgG}, ${avgB}, 0.5)`;
      }

      const ambientBg = document.getElementById('ambientBg');
      if (ambientBg) {
        ambientBg.style.background = `radial-gradient(circle at 50% 30%, rgba(${avgR}, ${avgG}, ${avgB}, 0.35) 0%, transparent 65%), linear-gradient(135deg, #05070e, #0a0e1c, #060913)`;
      }

      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: {
          frz: true,
          i: [
            0, p1, z0.rgb,
            p1, p2, z1.rgb,
            p2, p3, z2.rgb
          ],
          fx: 0
        }
      });

    } else if (this.mode === '3-cols') {
      // 2. 3 HORIZONTAL COLUMNS (Left • Center • Right)
      const col1Data = this.sampleCtx.getImageData(0, startY, Math.floor(sw * 0.33), activeHeight).data;
      const col2Data = this.sampleCtx.getImageData(Math.floor(sw * 0.33), startY, Math.floor(sw * 0.34), activeHeight).data;
      const col3Data = this.sampleCtx.getImageData(Math.floor(sw * 0.67), startY, sw - Math.floor(sw * 0.67), activeHeight).data;

      const rawCol1 = this._sampleZone(col1Data);
      const rawCol2 = this._sampleZone(col2Data);
      const rawCol3 = this._sampleZone(col3Data);

      for (let c = 0; c < 3; c++) {
        this.zoneColors.colLeft[c] = Math.round(lerp(this.zoneColors.colLeft[c], rawCol1[c], this.smoothing));
        this.zoneColors.colCenter[c] = Math.round(lerp(this.zoneColors.colCenter[c], rawCol2[c], this.smoothing));
        this.zoneColors.colRight[c] = Math.round(lerp(this.zoneColors.colRight[c], rawCol3[c], this.smoothing));
      }

      // Update Column Overlays inside Monitor Box
      const setColOverlay = (id, rgb) => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove('hide');
          el.style.backgroundColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.32)`;
          el.style.boxShadow = `inset 0 0 25px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.55)`;
        }
      };
      setColOverlay('colZoneLeft', this.zoneColors.colLeft);
      setColOverlay('colZoneCenter', this.zoneColors.colCenter);
      setColOverlay('colZoneRight', this.zoneColors.colRight);

      ['edgeTop', 'edgeRight', 'edgeBottom', 'edgeLeft'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.background = 'transparent';
      });

      const counts = this.getZoneCounts();
      const [c1, c2, c3] = counts;

      let z0, z1, z2;
      if (this.wiringDirection === 'rl') {
        z0 = { name: 'Right Column', rgb: this.zoneColors.colRight, count: c3 };
        z1 = { name: 'Center Column', rgb: this.zoneColors.colCenter, count: c2 };
        z2 = { name: 'Left Column', rgb: this.zoneColors.colLeft, count: c1 };
      } else {
        z0 = { name: 'Left Column', rgb: this.zoneColors.colLeft, count: c1 };
        z1 = { name: 'Center Column', rgb: this.zoneColors.colCenter, count: c2 };
        z2 = { name: 'Right Column', rgb: this.zoneColors.colRight, count: c3 };
      }

      const p1 = z0.count;
      const p2 = p1 + z1.count;
      const p3 = ledCount;

      const ledColors = new Array(ledCount);
      for (let i = 0; i < p1; i++) ledColors[i] = [Math.round(z0.rgb[0] * masterBriFactor), Math.round(z0.rgb[1] * masterBriFactor), Math.round(z0.rgb[2] * masterBriFactor)];
      for (let i = p1; i < p2; i++) ledColors[i] = [Math.round(z1.rgb[0] * masterBriFactor), Math.round(z1.rgb[1] * masterBriFactor), Math.round(z1.rgb[2] * masterBriFactor)];
      for (let i = p2; i < p3; i++) ledColors[i] = [Math.round(z2.rgb[0] * masterBriFactor), Math.round(z2.rgb[1] * masterBriFactor), Math.round(z2.rgb[2] * masterBriFactor)];
      virtualStrip.setMultiLed(ledColors);

      this.updateZoneInspector([
        { name: 'Left Column', rgb: this.zoneColors.colLeft, leds: c1, startIdx: this.wiringDirection === 'rl' ? p2 : 0, endIdx: this.wiringDirection === 'rl' ? p3 : p1 },
        { name: 'Center Column', rgb: this.zoneColors.colCenter, leds: c2, startIdx: p1, endIdx: p2 },
        { name: 'Right Column', rgb: this.zoneColors.colRight, leds: c3, startIdx: this.wiringDirection === 'rl' ? 0 : p2, endIdx: this.wiringDirection === 'rl' ? p1 : p3 }
      ]);

      const avgR = Math.round((this.zoneColors.colLeft[0] + this.zoneColors.colCenter[0] + this.zoneColors.colRight[0]) / 3);
      const avgG = Math.round((this.zoneColors.colLeft[1] + this.zoneColors.colCenter[1] + this.zoneColors.colRight[1]) / 3);
      const avgB = Math.round((this.zoneColors.colLeft[2] + this.zoneColors.colCenter[2] + this.zoneColors.colRight[2]) / 3);

      const monitor = document.getElementById('screenMonitorBox');
      if (monitor) {
        monitor.style.borderColor = `rgba(${avgR}, ${avgG}, ${avgB}, 0.75)`;
        monitor.style.boxShadow = `0 0 35px rgba(${avgR}, ${avgG}, ${avgB}, 0.5)`;
      }

      const ambientBg = document.getElementById('ambientBg');
      if (ambientBg) {
        ambientBg.style.background = `radial-gradient(circle at 50% 30%, rgba(${avgR}, ${avgG}, ${avgB}, 0.35) 0%, transparent 65%), linear-gradient(135deg, #05070e, #0a0e1c, #060913)`;
      }

      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: {
          frz: true,
          i: [
            0, p1, z0.rgb,
            p1, p2, z1.rgb,
            p2, p3, z2.rgb
          ],
          fx: 0
        }
      });

    } else if (this.mode === '4-edges') {
      // 3. FULL 4-EDGE PERIMETER ZONES
      const topData = this.sampleCtx.getImageData(0, startY, sw, Math.max(2, Math.floor(activeHeight * 0.20))).data;
      const rightData = this.sampleCtx.getImageData(sw - Math.max(2, Math.floor(sw * 0.20)), startY, Math.max(2, Math.floor(sw * 0.20)), activeHeight).data;
      const bottomData = this.sampleCtx.getImageData(0, endY - Math.max(2, Math.floor(activeHeight * 0.20)), sw, Math.max(2, Math.floor(activeHeight * 0.20))).data;
      const leftData = this.sampleCtx.getImageData(0, startY, Math.max(2, Math.floor(sw * 0.20)), activeHeight).data;

      const rawTop = this._sampleZone(topData);
      const rawRight = this._sampleZone(rightData);
      const rawBottom = this._sampleZone(bottomData);
      const rawLeft = this._sampleZone(leftData);

      for (let c = 0; c < 3; c++) {
        this.zoneColors.top[c] = Math.round(lerp(this.zoneColors.top[c], rawTop[c], this.smoothing));
        this.zoneColors.right[c] = Math.round(lerp(this.zoneColors.right[c], rawRight[c], this.smoothing));
        this.zoneColors.bottom[c] = Math.round(lerp(this.zoneColors.bottom[c], rawBottom[c], this.smoothing));
        this.zoneColors.left[c] = Math.round(lerp(this.zoneColors.left[c], rawLeft[c], this.smoothing));
      }

      const setEdgeStyle = (id, rgb) => {
        const el = document.getElementById(id);
        if (el) el.style.background = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.88)`;
      };
      setEdgeStyle('edgeTop', this.zoneColors.top);
      setEdgeStyle('edgeRight', this.zoneColors.right);
      setEdgeStyle('edgeBottom', this.zoneColors.bottom);
      setEdgeStyle('edgeLeft', this.zoneColors.left);

      ['colZoneLeft', 'colZoneCenter', 'colZoneRight'].forEach(id => {
        document.getElementById(id)?.classList.add('hide');
      });

      const [cTop, cRight, cBot, cLeft] = this.getZoneCounts();
      const p1 = 0;
      const p2 = cTop;
      const p3 = p2 + cRight;
      const p4 = p3 + cBot;
      const p5 = ledCount;

      const ledColors = new Array(ledCount);
      for (let i = p1; i < p2; i++) ledColors[i] = [Math.round(this.zoneColors.top[0] * masterBriFactor), Math.round(this.zoneColors.top[1] * masterBriFactor), Math.round(this.zoneColors.top[2] * masterBriFactor)];
      for (let i = p2; i < p3; i++) ledColors[i] = [Math.round(this.zoneColors.right[0] * masterBriFactor), Math.round(this.zoneColors.right[1] * masterBriFactor), Math.round(this.zoneColors.right[2] * masterBriFactor)];
      for (let i = p3; i < p4; i++) ledColors[i] = [Math.round(this.zoneColors.bottom[0] * masterBriFactor), Math.round(this.zoneColors.bottom[1] * masterBriFactor), Math.round(this.zoneColors.bottom[2] * masterBriFactor)];
      for (let i = p4; i < p5; i++) ledColors[i] = [Math.round(this.zoneColors.left[0] * masterBriFactor), Math.round(this.zoneColors.left[1] * masterBriFactor), Math.round(this.zoneColors.left[2] * masterBriFactor)];
      virtualStrip.setMultiLed(ledColors);

      this.updateZoneInspector([
        { name: 'Top Edge', rgb: this.zoneColors.top, leds: cTop, startIdx: p1, endIdx: p2 },
        { name: 'Right Edge', rgb: this.zoneColors.right, leds: cRight, startIdx: p2, endIdx: p3 },
        { name: 'Bottom Edge', rgb: this.zoneColors.bottom, leds: cBot, startIdx: p3, endIdx: p4 },
        { name: 'Left Edge', rgb: this.zoneColors.left, leds: cLeft, startIdx: p4, endIdx: p5 }
      ]);

      const avgR = Math.round((this.zoneColors.top[0] + this.zoneColors.right[0] + this.zoneColors.bottom[0] + this.zoneColors.left[0]) / 4);
      const avgG = Math.round((this.zoneColors.top[1] + this.zoneColors.right[1] + this.zoneColors.bottom[1] + this.zoneColors.left[1]) / 4);
      const avgB = Math.round((this.zoneColors.top[2] + this.zoneColors.right[2] + this.zoneColors.bottom[2] + this.zoneColors.left[2]) / 4);

      const monitor = document.getElementById('screenMonitorBox');
      if (monitor) {
        monitor.style.borderColor = `rgba(${avgR}, ${avgG}, ${avgB}, 0.75)`;
        monitor.style.boxShadow = `0 0 35px rgba(${avgR}, ${avgG}, ${avgB}, 0.5)`;
      }

      const ambientBg = document.getElementById('ambientBg');
      if (ambientBg) {
        ambientBg.style.background = `radial-gradient(circle at 50% 30%, rgba(${avgR}, ${avgG}, ${avgB}, 0.35) 0%, transparent 65%), linear-gradient(135deg, #05070e, #0a0e1c, #060913)`;
      }

      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: {
          frz: true,
          i: [
            p1, p2, this.zoneColors.top,
            p2, p3, this.zoneColors.right,
            p3, p4, this.zoneColors.bottom,
            p4, p5, this.zoneColors.left
          ],
          fx: 0
        }
      });

    } else if (this.mode === '2-sides') {
      // 4. 2 LIGHTBARS / SIDE PILLARS (Left & Right)
      const leftData = this.sampleCtx.getImageData(0, startY, Math.max(2, Math.floor(sw * 0.25)), activeHeight).data;
      const rightData = this.sampleCtx.getImageData(sw - Math.max(2, Math.floor(sw * 0.25)), startY, Math.max(2, Math.floor(sw * 0.25)), activeHeight).data;

      const rawLeft = this._sampleZone(leftData);
      const rawRight = this._sampleZone(rightData);

      for (let c = 0; c < 3; c++) {
        this.zoneColors.left[c] = Math.round(lerp(this.zoneColors.left[c], rawLeft[c], this.smoothing));
        this.zoneColors.right[c] = Math.round(lerp(this.zoneColors.right[c], rawRight[c], this.smoothing));
      }

      const setEdgeStyle = (id, rgb) => {
        const el = document.getElementById(id);
        if (el) el.style.background = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.88)`;
      };
      setEdgeStyle('edgeLeft', this.zoneColors.left);
      setEdgeStyle('edgeRight', this.zoneColors.right);
      const topEl = document.getElementById('edgeTop');
      if (topEl) topEl.style.background = 'transparent';
      const botEl = document.getElementById('edgeBottom');
      if (botEl) botEl.style.background = 'transparent';

      ['colZoneLeft', 'colZoneCenter', 'colZoneRight'].forEach(id => {
        document.getElementById(id)?.classList.add('hide');
      });

      const [cLeft, cRight] = this.getZoneCounts();
      const p1 = 0;
      const p2 = cLeft;
      const p3 = ledCount;

      const ledColors = new Array(ledCount);
      for (let i = p1; i < p2; i++) ledColors[i] = [Math.round(this.zoneColors.left[0] * masterBriFactor), Math.round(this.zoneColors.left[1] * masterBriFactor), Math.round(this.zoneColors.left[2] * masterBriFactor)];
      for (let i = p2; i < p3; i++) ledColors[i] = [Math.round(this.zoneColors.right[0] * masterBriFactor), Math.round(this.zoneColors.right[1] * masterBriFactor), Math.round(this.zoneColors.right[2] * masterBriFactor)];
      virtualStrip.setMultiLed(ledColors);

      this.updateZoneInspector([
        { name: 'Left Lightbar', rgb: this.zoneColors.left, leds: cLeft, startIdx: p1, endIdx: p2 },
        { name: 'Right Lightbar', rgb: this.zoneColors.right, leds: cRight, startIdx: p2, endIdx: p3 }
      ]);

      const avgR = Math.round((this.zoneColors.left[0] + this.zoneColors.right[0]) / 2);
      const avgG = Math.round((this.zoneColors.left[1] + this.zoneColors.right[1]) / 2);
      const avgB = Math.round((this.zoneColors.left[2] + this.zoneColors.right[2]) / 2);

      const monitor = document.getElementById('screenMonitorBox');
      if (monitor) {
        monitor.style.borderColor = `rgba(${avgR}, ${avgG}, ${avgB}, 0.75)`;
        monitor.style.boxShadow = `0 0 35px rgba(${avgR}, ${avgG}, ${avgB}, 0.5)`;
      }

      const ambientBg = document.getElementById('ambientBg');
      if (ambientBg) {
        ambientBg.style.background = `radial-gradient(circle at 50% 30%, rgba(${avgR}, ${avgG}, ${avgB}, 0.35) 0%, transparent 65%), linear-gradient(135deg, #05070e, #0a0e1c, #060913)`;
      }

      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: {
          frz: true,
          i: [
            p1, p2, this.zoneColors.left,
            p2, p3, this.zoneColors.right
          ],
          fx: 0
        }
      });

    } else if (this.mode === 'dominant') {
      // 5. VIBRANT DOMINANT CHROMA EXTRACTION
      const imgData = this.sampleCtx.getImageData(0, startY, sw, activeHeight).data;
      const hueBuckets = new Array(16).fill(0).map(() => ({ r: 0, g: 0, b: 0, weight: 0 }));
      let totalVibrantWeight = 0;
      let totalR = 0, totalG = 0, totalB = 0, validPixelCount = 0;

      for (let i = 0; i < imgData.length; i += 16) {
        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
        if (r < 18 && g < 18 && b < 18) continue; // ignore letterbox black

        totalR += r; totalG += g; totalB += b; validPixelCount++;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        const brightness = max / 255;

        if (chroma >= 20 && brightness >= 0.12) {
          const [h, s, v] = rgbToHsv(r, g, b);
          const bucketIdx = Math.floor((h / 360) * 16) % 16;
          const weight = Math.pow(s, 2.2) * Math.pow(v, 1.2);

          hueBuckets[bucketIdx].r += r * weight;
          hueBuckets[bucketIdx].g += g * weight;
          hueBuckets[bucketIdx].b += b * weight;
          hueBuckets[bucketIdx].weight += weight;
          totalVibrantWeight += weight;
        }
      }

      let targetR = 0, targetG = 0, targetB = 0;

      if (totalVibrantWeight > 0.05) {
        let bestBucket = hueBuckets[0];
        for (let b = 1; b < 16; b++) {
          if (hueBuckets[b].weight > bestBucket.weight) bestBucket = hueBuckets[b];
        }
        targetR = bestBucket.r / bestBucket.weight;
        targetG = bestBucket.g / bestBucket.weight;
        targetB = bestBucket.b / bestBucket.weight;
      } else if (validPixelCount > 0) {
        targetR = totalR / validPixelCount;
        targetG = totalG / validPixelCount;
        targetB = totalB / validPixelCount;
      } else {
        targetR = 0; targetG = 0; targetB = 0;
      }

      if (this.saturation > 1.0 && (targetR > 0 || targetG > 0 || targetB > 0)) {
        [targetR, targetG, targetB] = boostSaturation(targetR, targetG, targetB, this.saturation);
      }
      targetR = Math.max(this.blackFloor, Math.min(255, Math.round(targetR)));
      targetG = Math.max(this.blackFloor, Math.min(255, Math.round(targetG)));
      targetB = Math.max(this.blackFloor, Math.min(255, Math.round(targetB)));

      this.currentRGB[0] = Math.round(lerp(this.currentRGB[0], targetR, this.smoothing));
      this.currentRGB[1] = Math.round(lerp(this.currentRGB[1], targetG, this.smoothing));
      this.currentRGB[2] = Math.round(lerp(this.currentRGB[2], targetB, this.smoothing));

      const [finalR, finalG, finalB] = this.currentRGB;
      const hex = rgbToHex(finalR, finalG, finalB);

      const chip = document.getElementById('liveSampledChip');
      if (chip) chip.style.backgroundColor = hex;
      const hexEl = document.getElementById('liveSampledHex');
      if (hexEl) hexEl.textContent = hex;

      const monitor = document.getElementById('screenMonitorBox');
      if (monitor) {
        monitor.style.borderColor = `rgba(${finalR}, ${finalG}, ${finalB}, 0.8)`;
        monitor.style.boxShadow = `0 0 40px rgba(${finalR}, ${finalG}, ${finalB}, 0.6)`;
      }

      const ambientBg = document.getElementById('ambientBg');
      if (ambientBg) {
        ambientBg.style.background = `radial-gradient(circle at 50% 30%, rgba(${finalR}, ${finalG}, ${finalB}, 0.35) 0%, transparent 65%), linear-gradient(135deg, #05070e, #0a0e1c, #060913)`;
      }

      virtualStrip.setUniformColor(
        Math.round(finalR * masterBriFactor),
        Math.round(finalG * masterBriFactor),
        Math.round(finalB * masterBriFactor)
      );

      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: {
          frz: true,
          i: [0, ledCount, [finalR, finalG, finalB]],
          col: [[finalR, finalG, finalB], [0, 0, 0], [0, 0, 0]],
          fx: 0
        }
      });

    } else {
      // 6. SMART CHROMA-WEIGHTED AVERAGE MODE
      const imgData = this.sampleCtx.getImageData(0, startY, sw, activeHeight).data;
      let rSum = 0, gSum = 0, bSum = 0, totalW = 0;

      for (let i = 0; i < imgData.length; i += 16) {
        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
        if (r < 18 && g < 18 && b < 18) continue;

        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const chroma = max - min;
        const weight = 1.0 + (chroma / 255) * 3.5;

        rSum += r * weight;
        gSum += g * weight;
        bSum += b * weight;
        totalW += weight;
      }

      let targetR = totalW ? rSum / totalW : 0;
      let targetG = totalW ? gSum / totalW : 0;
      let targetB = totalW ? bSum / totalW : 0;

      if (this.saturation > 1.0 && (targetR > 0 || targetG > 0 || targetB > 0)) {
        [targetR, targetG, targetB] = boostSaturation(targetR, targetG, targetB, this.saturation);
      }
      targetR = Math.max(this.blackFloor, Math.min(255, Math.round(targetR)));
      targetG = Math.max(this.blackFloor, Math.min(255, Math.round(targetG)));
      targetB = Math.max(this.blackFloor, Math.min(255, Math.round(targetB)));

      this.currentRGB[0] = Math.round(lerp(this.currentRGB[0], targetR, this.smoothing));
      this.currentRGB[1] = Math.round(lerp(this.currentRGB[1], targetG, this.smoothing));
      this.currentRGB[2] = Math.round(lerp(this.currentRGB[2], targetB, this.smoothing));

      const [finalR, finalG, finalB] = this.currentRGB;
      const hex = rgbToHex(finalR, finalG, finalB);

      const chip = document.getElementById('liveSampledChip');
      if (chip) chip.style.backgroundColor = hex;
      const hexEl = document.getElementById('liveSampledHex');
      if (hexEl) hexEl.textContent = hex;

      const monitor = document.getElementById('screenMonitorBox');
      if (monitor) {
        monitor.style.borderColor = `rgba(${finalR}, ${finalG}, ${finalB}, 0.75)`;
        monitor.style.boxShadow = `0 0 35px rgba(${finalR}, ${finalG}, ${finalB}, 0.5)`;
      }

      const ambientBg = document.getElementById('ambientBg');
      if (ambientBg) {
        ambientBg.style.background = `radial-gradient(circle at 50% 30%, rgba(${finalR}, ${finalG}, ${finalB}, 0.35) 0%, transparent 65%), linear-gradient(135deg, #05070e, #0a0e1c, #060913)`;
      }

      virtualStrip.setUniformColor(
        Math.round(finalR * masterBriFactor),
        Math.round(finalG * masterBriFactor),
        Math.round(finalB * masterBriFactor)
      );

      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: {
          frz: true,
          i: [0, ledCount, [finalR, finalG, finalB]],
          col: [[finalR, finalG, finalB], [0, 0, 0], [0, 0, 0]],
          fx: 0
        }
      });
    }

    this.sampleCounter++;
    const now = performance.now();
    if (now - this.lastSampleRateTime >= 1000) {
      const sampleText = document.getElementById('sampleRateText');
      if (sampleText) sampleText.textContent = `${this.sampleCounter} updates/sec`;
      this.sampleCounter = 0;
      this.lastSampleRateTime = now;
    }
  }

  _sampleZone(data) {
    let totalR = 0, totalG = 0, totalB = 0, count = 0;
    const hueBuckets = new Array(12).fill(0).map(() => ({ r: 0, g: 0, b: 0, weight: 0 }));
    let totalWeight = 0;

    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r < 18 && g < 18 && b < 18) continue; // letterbox black

      totalR += r; totalG += g; totalB += b; count++;

      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const chroma = max - min;
      const brightness = max / 255;

      if (chroma >= 20 && brightness >= 0.12) {
        const [h, s, v] = rgbToHsv(r, g, b);
        const bucketIdx = Math.floor((h / 360) * 12) % 12;
        const weight = (s * s) * v;

        hueBuckets[bucketIdx].r += r * weight;
        hueBuckets[bucketIdx].g += g * weight;
        hueBuckets[bucketIdx].b += b * weight;
        hueBuckets[bucketIdx].weight += weight;
        totalWeight += weight;
      }
    }

    let targetR = 0, targetG = 0, targetB = 0;
    if (totalWeight > 0.05) {
      let best = hueBuckets[0];
      for (let b = 1; b < 12; b++) {
        if (hueBuckets[b].weight > best.weight) best = hueBuckets[b];
      }
      targetR = best.r / best.weight;
      targetG = best.g / best.weight;
      targetB = best.b / best.weight;
    } else if (count > 0) {
      targetR = totalR / count;
      targetG = totalG / count;
      targetB = totalB / count;
    }

    if (this.saturation > 1.0 && (targetR > 0 || targetG > 0 || targetB > 0)) {
      [targetR, targetG, targetB] = boostSaturation(targetR, targetG, targetB, this.saturation);
    }

    return [
      Math.max(this.blackFloor, Math.min(255, Math.round(targetR))),
      Math.max(this.blackFloor, Math.min(255, Math.round(targetG))),
      Math.max(this.blackFloor, Math.min(255, Math.round(targetB)))
    ];
  }
}

const movieSync = new MovieSyncEngine();

// ====================================================================
// Advanced Music Reactive Sync Engine (FFT & Spectrum Color Mapping)
// ====================================================================
class MusicSyncEngine {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.active = false;
    this.audioSourceType = 'mic'; // 'mic', 'system', 'demo'

    // Synth Demo generator
    this.demoTimer = null;
    this.demoNodes = [];

    // Modes & Parameters
    this.mode = 'fullSpectrum'; // 'fullSpectrum', 'centerPulse', 'vuMeter', 'beatStrobe', 'freqRainbow', 'chillFlow'
    this.paletteName = 'cyberpunk';
    this.gain = 1.8;
    this.noiseGate = 15;
    this.beatThreshold = 1.25;
    this.decaySpeed = 0.84;

    this.bassEnergyHistory = new Array(30).fill(0);
    this.currentPulseBri = 0;
    this.targetHue = 0;

    // Per-LED Spectrum Array for smooth visual decay
    this.ledLevels = new Array(60).fill(0);
    this.peakLevels = new Array(60).fill(0);

    // Dynamic mode state buffers
    this.waveBuffer = new Float32Array(120);
    this.thermalBuffer = new Float32Array(120);
    this.starfieldStars = new Float32Array(120);
    this.cometPos = 0;
    this.kineticHue = 0;

    this.specCanvas = null;
    this.specCtx = null;
    this.waveCanvas = null;
    this.waveCtx = null;
  }

  init() {
    this.specCanvas = document.getElementById('audioSpectrumCanvas');
    if (this.specCanvas) this.specCtx = this.specCanvas.getContext('2d');
    this.waveCanvas = document.getElementById('audioWaveformCanvas');
    if (this.waveCanvas) this.waveCtx = this.waveCanvas.getContext('2d');
  }

  setSource(type) {
    if (this.active) {
      this.stop();
      this.audioSourceType = type;
      this.start();
    } else {
      this.audioSourceType = type;
    }

    document.querySelectorAll('.btn-source').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.source === type);
    });

    const statusMap = {
      mic: 'Source: Microphone / Headset',
      system: 'Source: System Audio (Spotify / YouTube)',
      demo: 'Source: Built-in Synthwave Generator'
    };
    document.getElementById('audioSourceStatus').textContent = statusMap[type] || 'Source: Audio';
  }

  async start() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;

      if (this.audioSourceType === 'mic') {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        this.source = this.audioCtx.createMediaStreamSource(this.stream);
        this.source.connect(this.analyser);
      } else if (this.audioSourceType === 'system') {
        // High fidelity system / tab audio via getDisplayMedia
        this.stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        const audioTracks = this.stream.getAudioTracks();
        if (audioTracks.length === 0) {
          showToast('No audio track selected! Make sure "Share audio" is checked.');
          this.stop();
          return;
        }

        // Stop video immediately to save GPU
        this.stream.getVideoTracks().forEach(t => t.stop());

        this.source = this.audioCtx.createMediaStreamSource(this.stream);
        this.source.connect(this.analyser);
      } else if (this.audioSourceType === 'demo') {
        this.startSynthDemo();
      }

      // Connect to destination through a gain node so Web Audio pulls frames unconditionally
      const sinkGain = this.audioCtx.createGain();
      sinkGain.gain.value = (this.audioSourceType === 'demo') ? 0.15 : 0; // audible for demo, silent for mic/system to avoid feedback
      this.analyser.connect(sinkGain);
      sinkGain.connect(this.audioCtx.destination);

      this.active = true;

      document.getElementById('btnStartMusicSync').classList.add('hide');
      document.getElementById('btnStopMusicSync').classList.remove('hide');
      document.getElementById('musicActiveBadge').classList.remove('hide');

      showToast(`Audio Sync Active (${this.audioSourceType.toUpperCase()})`);
      this.loop();
    } catch (err) {
      console.warn('Audio start error:', err);
      showToast('Could not start audio listener: ' + (err.message || 'Permission denied'));
      this.stop();
    }
  }

  startSynthDemo() {
    // Rich multi-oscillator synthwave loop covering bass, mids, and treble
    const masterGain = this.audioCtx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(this.analyser);

    let step = 0;
    const bpm = 128;
    const interval = (60 / bpm / 2) * 1000;

    const playBeat = () => {
      if (!this.active || this.audioSourceType !== 'demo') return;

      const now = this.audioCtx.currentTime;

      // 1. Heavy Sub-Bass Kick on beats 0, 2, 4, 6
      if (step % 2 === 0) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);
        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.22);
      }

      // 2. Crisp Hi-Hat / Shaker (Treble 4kHz - 10kHz) on every 8th note
      {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(6500 + Math.random() * 2000, now);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.06);
      }

      // 3. Midrange Snare / Clap on beat 2 & 6
      if (step % 4 === 2) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
      }

      // 4. Synth Melody / Arpeggio chords
      const melodyFreqs = [220, 261.63, 293.66, 329.63, 392.00, 440.00];
      const freq = melodyFreqs[step % melodyFreqs.length];
      const leadOsc = this.audioCtx.createOscillator();
      const leadGain = this.audioCtx.createGain();
      leadOsc.type = 'sawtooth';
      leadOsc.frequency.setValueAtTime(freq, now);
      leadGain.gain.setValueAtTime(0.25, now);
      leadGain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      leadOsc.connect(leadGain);
      leadGain.connect(masterGain);
      leadOsc.start(now);
      leadOsc.stop(now + 0.18);

      step++;
      this.demoTimer = setTimeout(playBeat, interval);
    };

    playBeat();
  }

  stop() {
    this.active = false;
    clearTimeout(this.demoTimer);

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    document.getElementById('btnStartMusicSync').classList.remove('hide');
    document.getElementById('btnStopMusicSync').classList.add('hide');
    document.getElementById('musicActiveBadge').classList.add('hide');
    document.getElementById('beatPill').classList.remove('flash');

    if (this.specCtx && this.specCanvas) this.specCtx.clearRect(0, 0, this.specCanvas.width, this.specCanvas.height);
    if (this.waveCtx && this.waveCanvas) this.waveCtx.clearRect(0, 0, this.waveCanvas.width, this.waveCanvas.height);

    // Unfreeze WLED and restore normal transition and state
    wled.send({
      transition: 7,
      v: false,
      on: APP_STATE.power,
      bri: APP_STATE.brightness,
      seg: {
        frz: false,
        col: APP_STATE.colors,
        fx: APP_STATE.currentFx
      }
    }, true);
  }

  loop() {
    if (!this.active) return;

    const bufferLength = this.analyser.frequencyBinCount; // 128 bins
    const freqData = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(bufferLength);

    this.analyser.getByteFrequencyData(freqData);
    this.analyser.getByteTimeDomainData(timeData);

    this.renderVisualizer(freqData, timeData);
    this.processAudio(freqData);

    requestAnimationFrame(() => this.loop());
  }

  renderVisualizer(freqData, timeData) {
    if (!this.specCanvas || !this.specCtx || !this.waveCanvas || !this.waveCtx) {
      this.init();
    }
    if (!this.specCanvas || !this.specCtx || !this.waveCanvas || !this.waveCtx) return;

    const sw = this.specCanvas.width;
    const sh = this.specCanvas.height;
    this.specCtx.clearRect(0, 0, sw, sh);

    const barCount = 48;
    const barWidth = (sw / barCount) - 2;

    if (!this.peaks || this.peaks.length !== barCount) {
      this.peaks = new Array(barCount).fill(0);
    }

    for (let i = 0; i < barCount; i++) {
      // Logarithmic sampling for natural human ear frequency response
      const logIdx = Math.floor(Math.pow(i / barCount, 1.5) * (freqData.length - 1));
      const val = Math.min(255, (freqData[logIdx] || 0) * this.gain);
      const barHeight = Math.max(3, (val / 255) * (sh - 12));

      // Gravity decay on peak caps
      this.peaks[i] = Math.max(barHeight, (this.peaks[i] || 0) - 1.8);

      const [r, g, b] = samplePalette(this.paletteName, i / barCount);

      // Main bar gradient
      const grad = this.specCtx.createLinearGradient(0, sh, 0, sh - barHeight);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
      grad.addColorStop(1, `rgb(${r}, ${g}, ${b})`);

      this.specCtx.fillStyle = grad;
      this.specCtx.fillRect(i * (barWidth + 2), sh - barHeight, barWidth, barHeight);

      // Floating neon peak cap
      this.specCtx.fillStyle = '#ffffff';
      this.specCtx.shadowColor = `rgb(${r}, ${g}, ${b})`;
      this.specCtx.shadowBlur = 6;
      this.specCtx.fillRect(i * (barWidth + 2), sh - this.peaks[i] - 3, barWidth, 2);
      this.specCtx.shadowBlur = 0;
    }

    // Waveform Oscilloscope
    const ww = this.waveCanvas.width;
    const wh = this.waveCanvas.height;
    this.waveCtx.clearRect(0, 0, ww, wh);

    this.waveCtx.lineWidth = 2;
    this.waveCtx.strokeStyle = '#06b6d4';
    this.waveCtx.shadowColor = '#06b6d4';
    this.waveCtx.shadowBlur = 8;
    this.waveCtx.beginPath();

    const sliceWidth = ww / timeData.length;
    let x = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * wh) / 2;
      if (i === 0) this.waveCtx.moveTo(x, y);
      else this.waveCtx.lineTo(x, y);
      x += sliceWidth;
    }
    this.waveCtx.stroke();
    this.waveCtx.shadowBlur = 0;
  }

  processAudio(freqData) {
    const ledCount = APP_STATE.ledCount;

    // 1. Calculate Frequency Energy Bands
    // Bass: bins 1 - 6 (~20 - 200 Hz)
    let bass = 0;
    for (let i = 1; i <= 6; i++) bass += freqData[i];
    bass = (bass / 6) * this.gain;

    // Mid: bins 7 - 24 (~200 - 1500 Hz)
    let mid = 0;
    for (let i = 7; i <= 24; i++) mid += freqData[i];
    mid = (mid / 18) * this.gain;

    // Treble: bins 25 - 60 (~1500 - 8000 Hz)
    let treble = 0;
    for (let i = 25; i <= 60; i++) treble += freqData[i];
    treble = (treble / 36) * this.gain;

    // Apply Noise Gate
    if (bass < this.noiseGate) bass = 0;
    if (mid < this.noiseGate) mid = 0;
    if (treble < this.noiseGate) treble = 0;

    // Update Energy Fill Bars
    document.getElementById('meterBass').style.width = `${Math.min(100, (bass / 255) * 100)}%`;
    document.getElementById('meterMid').style.width = `${Math.min(100, (mid / 255) * 100)}%`;
    document.getElementById('meterTreble').style.width = `${Math.min(100, (treble / 255) * 100)}%`;

    // Dynamic Beat Detection
    const avgBass = this.bassEnergyHistory.reduce((a, b) => a + b, 0) / this.bassEnergyHistory.length;
    this.bassEnergyHistory.shift();
    this.bassEnergyHistory.push(bass);

    const isBeat = bass > 45 && bass > (avgBass * this.beatThreshold);
    const beatPill = document.getElementById('beatPill');

    if (isBeat) {
      beatPill.classList.add('flash');
      this.currentPulseBri = 255;
    } else {
      beatPill.classList.remove('flash');
      this.currentPulseBri *= this.decaySpeed;
    }

    // Master Brightness Factor
    const masterBriFactor = APP_STATE.brightness / 255;

    // ====================================================================
    // SPECTRUM COLOR PROCESSING & DISPATCH
    // ====================================================================
    const ledColors = [];

    if (this.mode === 'fullSpectrum') {
      // 1. Full 60-LED Equalizer: maps logarithmic frequency bands to each LED
      for (let i = 0; i < ledCount; i++) {
        const normPos = i / (ledCount - 1);
        const binIdx = Math.floor(Math.pow(normPos, 1.5) * (freqData.length - 1));
        const rawAmp = (freqData[binIdx] || 0) * this.gain;
        const amp = rawAmp > this.noiseGate ? Math.min(255, rawAmp) : 0;

        this.ledLevels[i] = Math.max(amp, (this.ledLevels[i] || 0) * this.decaySpeed);
        const intensity = (this.ledLevels[i] / 255) * masterBriFactor;

        const [baseR, baseG, baseB] = samplePalette(this.paletteName, normPos);

        ledColors.push([
          Math.round(baseR * intensity),
          Math.round(baseG * intensity),
          Math.round(baseB * intensity)
        ]);
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'symmetricalMirror') {
      // 7. Symmetrical Dual Equalizer: Center bass, mirrored out to edges
      const half = Math.floor(ledCount / 2);
      const halfColors = [];
      for (let d = 0; d < half; d++) {
        const norm = d / (half - 1);
        const binIdx = Math.floor(Math.pow(norm, 1.4) * (freqData.length - 1));
        const rawAmp = (freqData[binIdx] || 0) * this.gain;
        const amp = rawAmp > this.noiseGate ? Math.min(255, rawAmp) : 0;
        this.ledLevels[d] = Math.max(amp, (this.ledLevels[d] || 0) * this.decaySpeed);
        const intensity = (this.ledLevels[d] / 255) * masterBriFactor;
        const [r, g, b] = samplePalette(this.paletteName, norm);
        halfColors.push([Math.round(r * intensity), Math.round(g * intensity), Math.round(b * intensity)]);
      }

      for (let i = 0; i < ledCount; i++) {
        if (i < half) {
          ledColors[i] = halfColors[half - 1 - i];
        } else {
          ledColors[i] = halfColors[i - half] || [0, 0, 0];
        }
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'thermalHeatmap') {
      // 8. Dynamic Thermal Heatmap: Energy density spectral thermal dissipation
      for (let i = 0; i < ledCount; i++) {
        const norm = i / (ledCount - 1);
        const binIdx = Math.floor(Math.pow(norm, 1.3) * (freqData.length - 1));
        const rawAmp = (freqData[binIdx] || 0) * this.gain;
        const amp = rawAmp > this.noiseGate ? (rawAmp / 255) : 0;
        
        this.thermalBuffer[i] = Math.max(amp, this.thermalBuffer[i] * 0.90);
        const heat = Math.min(1.0, this.thermalBuffer[i]);

        let r = 0, g = 0, b = 0;
        if (heat < 0.25) {
          b = Math.round(heat * 4 * 255);
        } else if (heat < 0.5) {
          const t = (heat - 0.25) * 4;
          g = Math.round(t * 255);
          b = Math.round((1 - t) * 255);
        } else if (heat < 0.75) {
          const t = (heat - 0.5) * 4;
          r = Math.round(t * 255);
          g = 255;
        } else {
          const t = (heat - 0.75) * 4;
          r = 255;
          g = Math.round((1 - t * 0.5) * 255);
          b = Math.round(t * 255);
        }

        ledColors.push([
          Math.round(r * masterBriFactor),
          Math.round(g * masterBriFactor),
          Math.round(b * masterBriFactor)
        ]);
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'frequencyWave') {
      // 9. Traveling Wave Ripple: Acoustic ripples propagate down strip
      for (let i = ledCount - 1; i > 0; i--) {
        this.waveBuffer[i] = this.waveBuffer[i - 1] * 0.94;
      }
      const kickImpulse = isBeat ? Math.min(1.0, (bass / 255) * 1.3) : (bass > this.noiseGate ? (bass / 255) * 0.6 : 0);
      this.waveBuffer[0] = Math.max(this.waveBuffer[0], kickImpulse);

      for (let i = 0; i < ledCount; i++) {
        const norm = i / (ledCount - 1);
        const [r, g, b] = samplePalette(this.paletteName, norm);
        const amp = Math.min(1.0, this.waveBuffer[i] * masterBriFactor);
        ledColors.push([
          Math.round(r * amp),
          Math.round(g * amp),
          Math.round(b * amp)
        ]);
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'kineticPulse') {
      // 10. Kinetic Dance Blitz: Club strobe with dynamic drops
      if (isBeat) {
        this.kineticHue = (this.kineticHue + 60) % 360;
        this.currentPulseBri = 255;
      }
      const activeBri = Math.max(8, Math.round(this.currentPulseBri * masterBriFactor));
      const [r, g, b] = hsvToRgb(this.kineticHue, 1.0, 1.0);
      const [rAlt, gAlt, bAlt] = hsvToRgb((this.kineticHue + 180) % 360, 1.0, 1.0);

      for (let i = 0; i < ledCount; i++) {
        const isAlt = (i % 4 < 2);
        const [curR, curG, curB] = isAlt ? [r, g, b] : [rAlt, gAlt, bAlt];
        const fade = activeBri / 255;
        ledColors.push([
          Math.round(curR * fade),
          Math.round(curG * fade),
          Math.round(curB * fade)
        ]);
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'starfield') {
      // 11. Audio Starfield Sparkle: Twinkling starlight constellations
      for (let i = 0; i < ledCount; i++) {
        this.starfieldStars[i] = (this.starfieldStars[i] || 0) * 0.84;
      }
      if (treble > 40 || mid > 70) {
        const sparks = Math.floor(Math.random() * 3) + 1;
        for (let s = 0; s < sparks; s++) {
          const idx = Math.floor(Math.random() * ledCount);
          this.starfieldStars[idx] = 255;
        }
      }

      const ambientLevel = 0.15 * masterBriFactor;
      const [baseR, baseG, baseB] = samplePalette(this.paletteName, 0.5);

      for (let i = 0; i < ledCount; i++) {
        const starVal = (this.starfieldStars[i] / 255) * masterBriFactor;
        const r = Math.min(255, Math.round(baseR * ambientLevel + 255 * starVal));
        const g = Math.min(255, Math.round(baseG * ambientLevel + 255 * starVal));
        const b = Math.min(255, Math.round(baseB * ambientLevel + 255 * starVal));
        ledColors.push([r, g, b]);
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'bpmChase') {
      // 12. Tempo Chase Comet: Accelerating reactive rhythm comet
      const speed = Math.max(0.4, ((bass * 0.6 + mid * 0.4) / 180) * 3.0);
      this.cometPos = (this.cometPos + speed) % ledCount;

      for (let i = 0; i < ledCount; i++) {
        let dist = this.cometPos - i;
        if (dist < 0) dist += ledCount;

        if (dist < 10) {
          const tailFade = Math.pow(1 - (dist / 10), 1.8);
          const [r, g, b] = samplePalette(this.paletteName, dist / 10);
          ledColors.push([
            Math.round(r * tailFade * masterBriFactor),
            Math.round(g * tailFade * masterBriFactor),
            Math.round(b * tailFade * masterBriFactor)
          ]);
        } else {
          ledColors.push([0, 0, 0]);
        }
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'centerPulse') {
      // 2. Center-Out Bass Explosion: bass in center expanding outwards
      const half = Math.floor(ledCount / 2);
      for (let i = 0; i < ledCount; i++) {
        const distFromCenter = Math.abs(i - half) / half;
        let amp;

        if (distFromCenter < 0.35) {
          amp = bass;
        } else if (distFromCenter < 0.7) {
          amp = mid;
        } else {
          amp = treble;
        }

        this.ledLevels[i] = Math.max(amp, (this.ledLevels[i] || 0) * this.decaySpeed);
        const intensity = Math.min(1.0, (this.ledLevels[i] / 255) * masterBriFactor);

        const [baseR, baseG, baseB] = samplePalette(this.paletteName, distFromCenter);

        ledColors.push([
          Math.round(baseR * intensity),
          Math.round(baseG * intensity),
          Math.round(baseB * intensity)
        ]);
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'vuMeter') {
      // 3. Studio VU Peak Meter: fills the strip by total energy
      const totalVolume = Math.min(1.0, (bass * 0.5 + mid * 0.35 + treble * 0.15) / 255);
      const litLeds = Math.round(totalVolume * ledCount);

      for (let i = 0; i < ledCount; i++) {
        const norm = i / (ledCount - 1);
        if (i <= litLeds) {
          const [r, g, b] = samplePalette(this.paletteName, norm);
          ledColors.push([
            Math.round(r * masterBriFactor),
            Math.round(g * masterBriFactor),
            Math.round(b * masterBriFactor)
          ]);
        } else {
          ledColors.push([0, 0, 0]);
        }
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'beatStrobe') {
      // 4. Bass Kick Strobe + Treble Sparkle
      const activeBri = Math.max(5, Math.round(this.currentPulseBri * masterBriFactor));
      const [mainR, mainG, mainB] = samplePalette(this.paletteName, 0.2);

      for (let i = 0; i < ledCount; i++) {
        if (treble > 80 && Math.random() < 0.12) {
          ledColors.push([
            Math.round(255 * masterBriFactor),
            Math.round(255 * masterBriFactor),
            Math.round(255 * masterBriFactor)
          ]);
        } else {
          const fade = activeBri / 255;
          ledColors.push([
            Math.round(mainR * fade),
            Math.round(mainG * fade),
            Math.round(mainB * fade)
          ]);
        }
      }

      virtualStrip.setMultiLed(ledColors);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: APP_STATE.brightness,
        seg: { i: [0, ...ledColors], fx: 0 }
      });

    } else if (this.mode === 'freqRainbow') {
      // 5. Melody Pitch Chromagram
      let maxIdx = 1, maxVal = 0;
      for (let i = 1; i < 48; i++) {
        if (freqData[i] > maxVal) { maxVal = freqData[i]; maxIdx = i; }
      }
      this.targetHue = (this.targetHue + (maxIdx * 4)) % 360;
      const [r, g, b] = hsvToRgb(this.targetHue, 1.0, 1.0);
      const bri = Math.max(5, Math.round(Math.min(255, (bass + mid) * 0.75 * masterBriFactor)));

      virtualStrip.setUniformColor(r, g, b);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: bri,
        seg: { col: [[r, g, b]], fx: 0 }
      });

    } else if (this.mode === 'chillFlow') {
      // 6. Chill Ambient Breathe
      const energy = (bass * 0.4 + mid * 0.4 + treble * 0.2) / 255;
      const bri = Math.max(5, Math.round(energy * APP_STATE.brightness));
      const [r, g, b] = samplePalette(this.paletteName, Math.min(1.0, energy * 1.5));

      virtualStrip.setUniformColor(r, g, b);
      wled.send({
        transition: 0,
        v: false,
        on: true,
        bri: bri,
        seg: { col: [[r, g, b]], fx: 0 }
      });
    }
  }
}

const musicSync = new MusicSyncEngine();

// ====================================================================
// UI Helpers & Event Listeners
// ====================================================================
function updateActiveColor(r, g, b, sendToDevice = false) {
  APP_STATE.colors[APP_STATE.activeSlot] = [r, g, b];
  updateColorSlotsUI();
  updateCenterPreview(r, g, b);

  document.getElementById('sliderR').value = r;
  document.getElementById('sliderG').value = g;
  document.getElementById('sliderB').value = b;
  document.getElementById('valR').textContent = r;
  document.getElementById('valG').textContent = g;
  document.getElementById('valB').textContent = b;
  document.getElementById('hexInput').value = rgbToHex(r, g, b);

  virtualStrip.setUniformColor(r, g, b);

  if (sendToDevice) {
    wled.send({
      seg: { col: APP_STATE.colors }
    });
  }
}

function updateColorSlotsUI() {
  for (let i = 0; i < 3; i++) {
    const [r, g, b] = APP_STATE.colors[i] || [0, 0, 0];
    const swatch = document.getElementById(`slot${i}Swatch`);
    if (swatch) swatch.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }
}

function updateCenterPreview(r, g, b) {
  const preview = document.getElementById('wheelCenterPreview');
  if (preview) preview.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

function updatePowerUI(isOn) {
  const btn = document.getElementById('masterPowerBtn');
  const txt = document.getElementById('powerText');
  if (isOn) {
    btn.classList.remove('off');
    txt.textContent = 'ON';
  } else {
    btn.classList.add('off');
    txt.textContent = 'OFF';
  }
}

function updateBrightnessUI(val) {
  const pct = Math.round((val / 255) * 100);

  const masterSlider = document.getElementById('sliderMasterBri');
  if (masterSlider) masterSlider.value = val;
  const briValText = document.getElementById('briValueText');
  if (briValText) briValText.textContent = `${pct}% (${val})`;

  const headerSlider = document.getElementById('headerMasterBri');
  if (headerSlider) headerSlider.value = val;
  const headerBriText = document.getElementById('headerBriText');
  if (headerBriText) headerBriText.textContent = `${pct}%`;

  const movieSlider = document.getElementById('sliderMovieBri');
  if (movieSlider) movieSlider.value = val;
  const movieBriText = document.getElementById('movieBriValText');
  if (movieBriText) movieBriText.textContent = `${pct}% (${val})`;

  const musicSlider = document.getElementById('sliderMusicBri');
  if (musicSlider) musicSlider.value = val;
  const musicBriText = document.getElementById('musicBriValText');
  if (musicBriText) musicBriText.textContent = `${pct}% (${val})`;
}

function setGlobalBrightness(val, sourceId = '') {
  const bri = Math.max(0, Math.min(255, parseInt(val, 10)));
  APP_STATE.brightness = bri;
  updateBrightnessUI(bri);
  wled.send({ bri: bri });
}

function updateSyncUI(send, recv) {
  const syncBtn = document.getElementById('headerSyncBtn');
  const syncText = document.getElementById('headerSyncText');
  const checkSend = document.getElementById('checkSyncSend');
  const checkRecv = document.getElementById('checkSyncRecv');

  if (syncBtn) {
    if (send) {
      syncBtn.classList.add('active');
      if (syncText) syncText.textContent = 'SYNC ACTIVE';
    } else {
      syncBtn.classList.remove('active');
      if (syncText) syncText.textContent = 'SYNC OFF';
    }
  }
  if (checkSend) checkSend.checked = !!send;
  if (checkRecv) checkRecv.checked = !!recv;
}

function renderDiscoveredNodes(nodes) {
  const container = document.getElementById('discoveredNodesGrid');
  const countBadge = document.getElementById('nodesCountBadge');
  if (!container) return;
  container.innerHTML = '';

  const total = (nodes && nodes.length) ? nodes.length : 1;
  if (countBadge) countBadge.textContent = `${total} DEV`;

  const currentCard = document.createElement('div');
  currentCard.className = 'node-card active';
  currentCard.innerHTML = `
    <div class="node-status-bar">
      <span class="status-dot connected"></span>
      <span class="node-role-badge">PRIMARY ACTIVE</span>
    </div>
    <strong class="node-name">${APP_STATE.name || 'WLED Ambient Hub'}</strong>
    <span class="node-ip">${wled.ip}</span>
    <span class="node-arch">ESP32 • ${APP_STATE.ledCount} LEDs</span>
  `;
  container.appendChild(currentCard);

  if (nodes && nodes.length > 0) {
    nodes.forEach(node => {
      if (node.ip === wled.ip) return;
      const card = document.createElement('div');
      card.className = 'node-card';
      card.innerHTML = `
        <div class="node-status-bar">
          <span class="status-dot connected"></span>
          <span class="node-role-badge">SYNC NODE</span>
        </div>
        <strong class="node-name">${node.name || 'WLED Device'}</strong>
        <span class="node-ip">${node.ip}</span>
        <span class="node-arch">${node.type || 'ESP32/ESP8266'}</span>
        <button class="glass-btn btn-xs mt-2" data-switch-ip="${node.ip}">Switch to this Device</button>
      `;
      const btn = card.querySelector('button');
      if (btn) {
        btn.addEventListener('click', () => {
          wled.setIp(node.ip);
          showToast(`Switched target to ${node.ip}`);
        });
      }
      container.appendChild(card);
    });
  }
}

function updateStatus(text, isConnected) {
  const dot = document.getElementById('statusDot');
  const ipText = document.getElementById('displayIp');
  if (dot) {
    dot.className = isConnected ? 'status-dot connected' : 'status-dot disconnected';
  }
  if (ipText) ipText.textContent = APP_STATE.ip;
}

function showToast(msg) {
  const toast = document.getElementById('globalToast');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = msg;
  toast.classList.remove('hide');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hide'), 3500);
}

// Render Effects Grid
function renderEffectsGrid(effects) {
  const container = document.getElementById('effectsGrid');
  if (!container) return;

  document.getElementById('effectCountBadge').textContent = `${effects.length} effects`;
  container.innerHTML = '';

  effects.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.className = `fx-item-btn ${idx === APP_STATE.currentFx ? 'active' : ''}`;
    btn.id = `fxItemBtn_${idx}`;
    btn.textContent = `${idx}: ${name}`;
    btn.title = name;
    btn.addEventListener('click', () => {
      APP_STATE.currentFx = idx;
      highlightActiveEffect(idx);
      wled.send({ seg: { fx: idx } }, true);
      showToast(`Effect: ${name}`);
    });
    container.appendChild(btn);
  });
}

function highlightActiveEffect(id) {
  document.querySelectorAll('.fx-item-btn').forEach(btn => btn.classList.remove('active'));
  const active = document.getElementById(`fxItemBtn_${id}`);
  if (active) active.classList.add('active');
}

// Render Palettes Grid
function renderPalettesGrid(palettes) {
  const container = document.getElementById('palettesGrid');
  if (!container) return;

  document.getElementById('paletteCountBadge').textContent = `${palettes.length} palettes`;
  container.innerHTML = '';

  palettes.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.className = `pal-item-btn ${idx === APP_STATE.currentPal ? 'active' : ''}`;
    btn.id = `palItemBtn_${idx}`;
    btn.textContent = name;
    btn.title = name;
    btn.addEventListener('click', () => {
      APP_STATE.currentPal = idx;
      highlightActivePalette(idx);
      wled.send({ seg: { pal: idx } }, true);
      showToast(`Palette: ${name}`);
    });
    container.appendChild(btn);
  });
}

function highlightActivePalette(id) {
  document.querySelectorAll('.pal-item-btn').forEach(btn => btn.classList.remove('active'));
  const active = document.getElementById(`palItemBtn_${id}`);
  if (active) active.classList.add('active');
}

// Render Presets List
function renderPresetsList(presets) {
  const container = document.getElementById('devicePresetsList');
  if (!container) return;
  container.innerHTML = '';

  const keys = Object.keys(presets).filter(k => k !== '0');
  if (keys.length === 0) {
    container.innerHTML = '<div class="empty-hint">No user presets found on ESP32. Save some in WLED Config!</div>';
    return;
  }

  keys.forEach(k => {
    const p = presets[k];
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = p.n || `Preset ${k}`;
    btn.addEventListener('click', () => {
      wled.send({ ps: parseInt(k, 10) }, true);
      showToast(`Preset: ${p.n || k}`);
    });
    container.appendChild(btn);
  });
}

// Math & Color Utilities
function hsvToRgb(h, s, v) {
  let r, g, b;
  const i = Math.floor((h / 60) % 6);
  const f = (h / 60) - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;

  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, v];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerp(start, end, amt) {
  return start + (end - start) * amt;
}

function boostSaturation(r, g, b, factor) {
  const [h, s, v] = rgbToHsv(r, g, b);
  const newS = Math.min(1.0, s * factor);
  const newV = (newS > 0.15 && v < 0.90) ? Math.min(1.0, v * (1.0 + (factor - 1.0) * 0.35)) : v;
  return hsvToRgb(h, newS, newV);
}

// ====================================================================
// Wire Event Listeners & Initialize
// ====================================================================
function initEventListeners() {
  // Navigation Tabs
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Master Power
  document.getElementById('masterPowerBtn')?.addEventListener('click', () => {
    APP_STATE.power = !APP_STATE.power;
    updatePowerUI(APP_STATE.power);
    wled.send({ on: APP_STATE.power }, true);
  });

  // Universal Brightness Synchronization (Master, Header, Movie, Music)
  ['sliderMasterBri', 'headerMasterBri', 'sliderMovieBri', 'sliderMusicBri'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        setGlobalBrightness(e.target.value, id);
      });
    }
  });

  // Quick Atmosphere Scenes (Lighting Studio Bar)
  document.getElementById('btnAtmosNight')?.addEventListener('click', () => {
    setGlobalBrightness(26);
    const col = [255, 120, 20];
    APP_STATE.colors[0] = col;
    updateActiveColor(...col, false);
    wled.send({ bri: 26, seg: { fx: 0, col: [col, [0,0,0], [0,0,0]] } }, true);
    showToast('Atmosphere: Night Dim 10%');
  });

  document.getElementById('btnAtmosWarm')?.addEventListener('click', () => {
    setGlobalBrightness(102);
    const col = [255, 147, 41];
    APP_STATE.colors[0] = col;
    updateActiveColor(...col, false);
    wled.send({ bri: 102, seg: { fx: 100, sx: 40, ix: 120, col: [col, [255, 90, 0], [0,0,0]] } }, true);
    showToast('Atmosphere: Warm Candle Relax');
  });

  document.getElementById('btnAtmosStudio')?.addEventListener('click', () => {
    setGlobalBrightness(255);
    const col = [255, 255, 255];
    APP_STATE.colors[0] = col;
    updateActiveColor(...col, false);
    wled.send({ bri: 255, seg: { fx: 0, col: [col, [0,0,0], [0,0,0]] } }, true);
    showToast('Atmosphere: Pure Daylight 100%');
  });

  document.getElementById('btnAtmosParty')?.addEventListener('click', () => {
    setGlobalBrightness(255);
    const col = [255, 0, 128];
    APP_STATE.colors[0] = col;
    updateActiveColor(...col, false);
    wled.send({ bri: 255, seg: { fx: 78, sx: 220, ix: 240, col: [col, [0, 242, 254], [0,0,0]] } }, true);
    showToast('Atmosphere: Party Blitz Strobe');
  });

  // Sleep Timer Countdown Modal & Logic
  let sleepTimerInterval = null;
  let sleepTimeRemainingSec = 0;
  const modalSleep = document.getElementById('sleepTimerModal');

  document.getElementById('btnSleepTimer')?.addEventListener('click', () => {
    modalSleep?.classList.remove('hide');
  });

  document.getElementById('btnCloseSleepModal')?.addEventListener('click', () => {
    modalSleep?.classList.add('hide');
  });

  document.querySelectorAll('.timer-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.min, 10);
      startSleepTimer(mins);
    });
  });

  function startSleepTimer(minutes) {
    clearInterval(sleepTimerInterval);
    sleepTimeRemainingSec = minutes * 60;
    const startBri = APP_STATE.brightness;
    const startTime = Date.now();
    const durationMs = minutes * 60 * 1000;

    const activeBox = document.getElementById('activeTimerBox');
    const display = document.getElementById('timerCountdownDisplay');
    const btnText = document.getElementById('sleepTimerText');
    if (activeBox) activeBox.classList.remove('hide');

    showToast(`Sleep Timer set for ${minutes} minutes`);

    sleepTimerInterval = setInterval(() => {
      sleepTimeRemainingSec--;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const newBri = Math.max(0, Math.round(startBri * (1 - progress)));

      setGlobalBrightness(newBri);

      const m = Math.floor(sleepTimeRemainingSec / 60);
      const s = sleepTimeRemainingSec % 60;
      const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      if (display) display.textContent = str;
      if (btnText) btnText.textContent = str;

      if (sleepTimeRemainingSec <= 0) {
        clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
        wled.send({ on: false }, true);
        if (activeBox) activeBox.classList.add('hide');
        if (btnText) btnText.textContent = 'Sleep Timer';
        showToast('Sleep Timer: Lights turned off. Goodnight!');
      }
    }, 1000);
  }

  document.getElementById('btnCancelSleepTimer')?.addEventListener('click', () => {
    clearInterval(sleepTimerInterval);
    sleepTimerInterval = null;
    document.getElementById('activeTimerBox')?.classList.add('hide');
    const btnText = document.getElementById('sleepTimerText');
    if (btnText) btnText.textContent = 'Sleep Timer';
    showToast('Sleep Timer canceled');
  });

  // Color Slots
  document.querySelectorAll('.color-slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-slot-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      APP_STATE.activeSlot = parseInt(btn.dataset.slot, 10);
      const [r, g, b] = APP_STATE.colors[APP_STATE.activeSlot] || [255, 0, 85];
      colorWheel.setColorRGB(r, g, b);
      updateActiveColor(r, g, b, false);
    });
  });

  // RGB Sliders
  ['sliderR', 'sliderG', 'sliderB'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const r = parseInt(document.getElementById('sliderR').value, 10);
      const g = parseInt(document.getElementById('sliderG').value, 10);
      const b = parseInt(document.getElementById('sliderB').value, 10);
      colorWheel.setColorRGB(r, g, b);
      updateActiveColor(r, g, b, true);
    });
  });

  // Hex Input & Apply
  document.getElementById('applyHexBtn')?.addEventListener('click', () => {
    const hex = document.getElementById('hexInput').value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      const [r, g, b] = hexToRgb(hex);
      colorWheel.setColorRGB(r, g, b);
      updateActiveColor(r, g, b, true);
    } else {
      showToast('Invalid Hex Code');
    }
  });

  // Quick Swatches
  document.querySelectorAll('.swatch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const [r, g, b] = hexToRgb(btn.dataset.hex);
      colorWheel.setColorRGB(r, g, b);
      updateActiveColor(r, g, b, true);
    });
  });

  // Effect Speed & Intensity
  document.getElementById('sliderSpeed')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    APP_STATE.speed = val;
    document.getElementById('speedValText').textContent = val;
    wled.send({ seg: { sx: val } });
  });

  document.getElementById('sliderIntensity')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    APP_STATE.intensity = val;
    document.getElementById('intensityValText').textContent = val;
    wled.send({ seg: { ix: val } });
  });

  // Search
  document.getElementById('searchEffectsInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.fx-item-btn').forEach(btn => {
      btn.style.display = btn.textContent.toLowerCase().includes(q) ? 'block' : 'none';
    });
  });

  document.getElementById('searchPalettesInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.pal-item-btn').forEach(btn => {
      btn.style.display = btn.textContent.toLowerCase().includes(q) ? 'block' : 'none';
    });
  });

  // Movie Sync (Ambilight)
  document.getElementById('btnStartMovieSync')?.addEventListener('click', () => movieSync.start());
  document.getElementById('btnStopMovieSync')?.addEventListener('click', () => movieSync.stop());



  document.getElementById('sliderMovieSmoothing')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    movieSync.smoothing = val;
    let label = 'Smooth';
    if (val <= 0.15) label = 'Ultra Soft';
    else if (val <= 0.3) label = 'Cinematic';
    else if (val <= 0.55) label = 'Responsive';
    else if (val <= 0.8) label = 'Fast';
    else label = 'Instant (Gaming)';
    const textEl = document.getElementById('smoothingValText');
    if (textEl) textEl.textContent = `${label} (${val.toFixed(2)})`;
  });

  document.getElementById('sliderMovieSaturation')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    movieSync.saturation = val;
    let label = '';
    if (val <= 1.0) label = 'Natural';
    else if (val <= 1.3) label = 'Enhanced';
    else if (val <= 1.8) label = 'Vivid';
    else label = 'Hyper-Saturated';
    const textEl = document.getElementById('saturationValText');
    if (textEl) textEl.textContent = `${val.toFixed(1)}x (${label})`;
  });

  document.getElementById('sliderBlackFloor')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    movieSync.blackFloor = val;
    const textEl = document.getElementById('blackFloorValText');
    if (textEl) textEl.textContent = val === 0 ? '0 (True Black)' : `${val} (Ambient Floor)`;
  });

  document.getElementById('checkLetterboxFilter')?.addEventListener('change', (e) => {
    movieSync.letterboxFilter = e.target.checked;
  });

  // Music Reactive Sync
  document.querySelectorAll('.btn-source').forEach(btn => {
    btn.addEventListener('click', () => {
      musicSync.setSource(btn.dataset.source);
    });
  });

  document.getElementById('btnStartMusicSync')?.addEventListener('click', () => musicSync.start());
  document.getElementById('btnStopMusicSync')?.addEventListener('click', () => musicSync.stop());

  // Spectrum Palettes Selector
  document.querySelectorAll('#spectrumPalettesGrid .spec-pal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#spectrumPalettesGrid .spec-pal-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      musicSync.paletteName = btn.dataset.pal;
      showToast(`Spectrum Palette: ${btn.querySelector('.pal-name')?.textContent || btn.dataset.pal}`);
    });
  });

  // Custom 3-Stop Spectrum Palette Builder
  const updateCustomPalPreview = () => {
    const c0 = document.getElementById('customColor0')?.value || '#ff0055';
    const c1 = document.getElementById('customColor1')?.value || '#00f2fe';
    const c2 = document.getElementById('customColor2')?.value || '#a855f7';
    const bar = document.getElementById('customPalPreviewBar');
    if (bar) bar.style.background = `linear-gradient(to right, ${c0}, ${c1}, ${c2})`;
    const swatch = document.getElementById('customPalPreviewSwatch');
    if (swatch) swatch.style.background = `linear-gradient(135deg, ${c0}, ${c1}, ${c2})`;
    SPECTRUM_PALETTES.custom = [hexToRgb(c0), hexToRgb(c1), hexToRgb(c2)];
  };

  ['customColor0', 'customColor1', 'customColor2'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateCustomPalPreview);
  });

  document.getElementById('btnRandomCustomPal')?.addEventListener('click', () => {
    const randHex = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const c0 = document.getElementById('customColor0');
    const c1 = document.getElementById('customColor1');
    const c2 = document.getElementById('customColor2');
    if (c0) c0.value = randHex();
    if (c1) c1.value = randHex();
    if (c2) c2.value = randHex();
    updateCustomPalPreview();
    showToast('Generated random 3-stop spectrum theme!');
  });

  const activateCustomPal = () => {
    updateCustomPalPreview();
    document.querySelectorAll('#spectrumPalettesGrid .spec-pal-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnCustomPalSelect')?.classList.add('active');
    musicSync.paletteName = 'custom';
    showToast('Custom Spectrum Theme Activated!');
  };

  document.getElementById('btnApplyCustomPal')?.addEventListener('click', activateCustomPal);
  document.getElementById('btnCustomPalSelect')?.addEventListener('click', activateCustomPal);

  // Spectrum Mode Selector
  document.querySelectorAll('#musicModeGrid .mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#musicModeGrid .mode-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      musicSync.mode = card.dataset.mode;
    });
  });

  document.getElementById('sliderMicGain')?.addEventListener('input', (e) => {
    musicSync.gain = parseFloat(e.target.value);
    document.getElementById('micGainValText').textContent = `${e.target.value}x`;
  });

  document.getElementById('sliderNoiseGate')?.addEventListener('input', (e) => {
    musicSync.noiseGate = parseInt(e.target.value, 10);
    document.getElementById('noiseGateValText').textContent = e.target.value;
  });

  document.getElementById('sliderBeatThreshold')?.addEventListener('input', (e) => {
    musicSync.beatThreshold = parseFloat(e.target.value);
    document.getElementById('beatThresholdValText').textContent = `${e.target.value}x`;
  });

  document.getElementById('sliderDecaySpeed')?.addEventListener('input', (e) => {
    musicSync.decaySpeed = parseFloat(e.target.value);
    document.getElementById('decaySpeedValText').textContent = e.target.value;
  });

  // Presets & Scenes
  document.querySelectorAll('.scene-card').forEach(card => {
    card.addEventListener('click', () => {
      const fx = parseInt(card.dataset.fx, 10);
      const pal = parseInt(card.dataset.pal, 10);
      const bri = parseInt(card.dataset.bri, 10);
      const col = hexToRgb(card.dataset.col);

      APP_STATE.colors[0] = col;
      updateActiveColor(...col, false);

      wled.send({
        bri: bri,
        seg: {
          fx: fx,
          pal: pal,
          col: [col, [0,0,0], [0,0,0]]
        }
      }, true);

      showToast(`Scene: ${card.querySelector('.scene-name')?.textContent || 'Preset'}`);
    });
  });

  // Multi-Device Hub & UDP Sync
  let isUdpSyncActive = false;
  const syncBtn = document.getElementById('headerSyncBtn');
  const syncText = document.getElementById('headerSyncText');
  const checkSend = document.getElementById('checkSyncSend');
  const checkRecv = document.getElementById('checkSyncRecv');

  syncBtn?.addEventListener('click', () => {
    isUdpSyncActive = !isUdpSyncActive;
    wled.setUdpSync(isUdpSyncActive, isUdpSyncActive);
    updateSyncUI(isUdpSyncActive, isUdpSyncActive);
  });

  checkSend?.addEventListener('change', (e) => {
    wled.setUdpSync(e.target.checked, checkRecv ? checkRecv.checked : true);
  });
  checkRecv?.addEventListener('change', (e) => {
    wled.setUdpSync(checkSend ? checkSend.checked : true, e.target.checked);
  });

  document.getElementById('btnTestSyncPulse')?.addEventListener('click', () => {
    wled.testSyncPulse();
  });

  document.getElementById('btnScanNetworkNodes')?.addEventListener('click', () => {
    showToast('Scanning network for WLED devices...');
    wled.fetchNodes();
  });

  document.getElementById('btnSwitchTargetIp')?.addEventListener('click', () => {
    const targetIp = document.getElementById('switchTargetIpInput')?.value.trim();
    if (targetIp) {
      wled.setIp(targetIp);
      const ipInput = document.getElementById('wledIpInput');
      if (ipInput) ipInput.value = targetIp;
      showToast(`Switched active controller to ${targetIp}`);
    }
  });

  document.getElementById('btnSaveWifiCredentials')?.addEventListener('click', () => {
    const ssid = document.getElementById('wifiSsidInput')?.value.trim() || 'pk';
    const pwd = document.getElementById('wifiPasswordInput')?.value.trim() || '00000000';
    wled.saveWifi(ssid, pwd);
  });

  // Add Custom Device Modal
  const modalAddDev = document.getElementById('addDeviceModal');
  document.getElementById('btnAddCustomDevice')?.addEventListener('click', () => {
    modalAddDev?.classList.remove('hide');
  });
  document.getElementById('btnCloseAddDevModal')?.addEventListener('click', () => {
    modalAddDev?.classList.add('hide');
  });
  document.getElementById('btnConfirmAddDevice')?.addEventListener('click', () => {
    const devIp = document.getElementById('modalDevIpInput')?.value.trim();
    if (devIp) {
      modalAddDev?.classList.add('hide');
      wled.setIp(devIp);
      showToast(`Connected to custom device: ${devIp}`);
    }
  });

  // Settings
  document.getElementById('saveIpBtn')?.addEventListener('click', () => {
    const newIp = document.getElementById('wledIpInput').value.trim();
    if (newIp) {
      wled.setIp(newIp);
      document.getElementById('linkNativeWled').href = `http://${newIp}/`;
      document.getElementById('linkConfigWled').href = `http://${newIp}/settings`;
      document.getElementById('linkUiConfigWled').href = `http://${newIp}/settings/ui`;
      showToast(`Connecting to ${newIp}...`);
    }
  });

  document.getElementById('ledCountInput')?.addEventListener('change', (e) => {
    const count = parseInt(e.target.value, 10);
    if (count > 0) {
      APP_STATE.ledCount = count;
      localStorage.setItem('wled_led_count', count);
      document.getElementById('ledCountBadge').textContent = count;
      virtualStrip.resize(count);
      movieSync.renderDivisionControls();
      showToast(`LED Count: ${count}`);
    }
  });

  document.getElementById('btnRefreshDeviceStats')?.addEventListener('click', () => {
    wled.fetchInitialData();
    showToast('Refreshing telemetry...');
  });

  document.getElementById('refreshPresetsBtn')?.addEventListener('click', () => {
    wled.fetchInitialData();
  });
}

// Window globals for debugging & synchronization
window._wled = wled;
window._movieSync = movieSync;
window._musicSync = musicSync;

document.addEventListener('DOMContentLoaded', () => {
  colorWheel.init();
  virtualStrip.init();
  movieSync.init();
  musicSync.init();
  initEventListeners();
  wled.connect();
  wled.fetchInitialData();
});
