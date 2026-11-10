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
    this.lastSendTime = 0;
  }

  setIp(ip) {
    this.ip = sanitizeIp(ip);
    APP_STATE.ip = this.ip;
    try { localStorage.setItem('wled_ip', this.ip); } catch (e) {}
    this.disconnect();
    this.connect();
    this.fetchInitialData();
  }

  connect() {
    this.ip = sanitizeIp(this.ip);
    APP_STATE.ip = this.ip;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);

    const wsUrl = `ws://${this.ip}:81/`;
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
      // Avoid competing HTTP queries when active high-frequency movie or music streaming is running
      if (window._movieSync?.active || window._musicSync?.active) return;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const start = performance.now();
        fetch(`http://${this.ip}/json/info`, { signal: AbortSignal.timeout(2000) })
          .then(() => {
            const ms = Math.round(performance.now() - start);
            const pingEl = document.getElementById('pingBadge');
            if (pingEl) pingEl.textContent = `${ms} ms`;
          })
          .catch(() => {});
      }
    }, 10000);
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

      await this.fetchPresets();
      if (typeof oledStudio !== 'undefined' && oledStudio.fetchSettings) {
        oledStudio.fetchSettings();
      }
      if (typeof colorCalibrationStudio !== 'undefined' && colorCalibrationStudio.fetchSettings) {
        colorCalibrationStudio.fetchSettings();
      }
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

  async fetchPresets() {
    try {
      const res = await fetch(`http://${this.ip}/presets.json?_t=${Date.now()}`);
      APP_STATE.presetsList = await res.json();
      renderPresetsList(APP_STATE.presetsList);
      updatePresetSlotOptions();
      return APP_STATE.presetsList;
    } catch (err) {
      console.warn('Failed to load presets.json:', err);
      return null;
    }
  }

  async savePreset(slotId, name, options = { ib: true, sb: false }) {
    const payload = {
      psave: parseInt(slotId, 10),
      n: name || `Preset ${slotId}`,
      ib: options.ib !== undefined ? !!options.ib : true,
      sb: options.sb !== undefined ? !!options.sb : false
    };
    try {
      const res = await fetch(`http://${this.ip}/json/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Preset #${slotId} ("${name}") saved to ESP32!`);
        await this.fetchPresets();
        return true;
      }
    } catch (err) {
      console.error('Failed to save preset:', err);
      showToast('Error saving preset to ESP32');
    }
    return false;
  }

  async deletePreset(slotId) {
    try {
      const res = await fetch(`http://${this.ip}/json/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdel: parseInt(slotId, 10) })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Deleted Preset #${slotId} from ESP32`);
        await this.fetchPresets();
        return true;
      }
    } catch (err) {
      console.error('Failed to delete preset:', err);
      showToast('Error deleting preset');
    }
    return false;
  }

  applyPreset(slotId) {
    this.send({ ps: parseInt(slotId, 10) }, true);
    showToast(`Loaded Preset #${slotId}`);
    highlightActivePreset(slotId);
  }

  send(payload, immediate = false) {
    if (immediate) {
      this._transmit(payload);
      return;
    }

    // Direct path for pre-paced stream packets (Movie Sync & Music Sync)
    if (payload.isStream) {
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
      }, Math.max(0, APP_STATE.sendThrottleMs - elapsed));
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
    this.ip = sanitizeIp(this.ip);
    APP_STATE.ip = this.ip;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.ws.bufferedAmount > 2048) {
        if (payload.isStream || payload.seg?.i) {
          return; // Drop frame gracefully
        }
      }
      try {
        this.ws.send(JSON.stringify(payload));
        return;
      } catch (e) {}
    }

    // NEVER fallback to HTTP POST for streaming frames!
    // Firing 30 HTTP POSTs/sec to an ESP32 web server causes socket exhaustion and LED flicker.
    if (payload.isStream || payload.seg?.i) {
      return;
    }

    // Direct HTTP POST fallback when WebSocket is not connected (for discrete button actions only)
    fetch(`http://${this.ip}/json/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1000)
    }).catch(() => {});
  }
}

const wled = new WLEDClient(APP_STATE.ip);

