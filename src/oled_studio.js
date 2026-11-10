// ====================================================================
// TAB: OLED HARDWARE HUD & DISPLAY STUDIO CONTROLLER
// ====================================================================
class OledStudioManager {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.animId = null;
    this.frameCount = 0;
    this.simFps = 30;
    this.lastFpsUpdate = performance.now();
    this.scrollOffset = 0;
    this.bannerOffset = -112;
    this.animWave = 0;
    this.vinylAngle = 0;
    this.peakBars = new Array(32).fill(2);
    this.peakHold = new Array(32).fill(2);
    this.peakHoldSpeed = new Array(32).fill(0);
    this.pollTimer = null;
    this.sendThrottleTimer = null;

    // Hardware State Mirror
    this.state = {
      mode: 1,        // Default: 1 = Clock & Modern Watch Face (0: Music HUD, 2: Spectrum, 3: Ambient, 4: Banner)
      face: 0,        // 0: Studio Minimalist, 1: Chronos Duo, 2: Bauhaus Typography, 3: Cyber Orbit HUD
      artPos: 0,      // 0: Left, 1: Right, 2: Hidden
      vis: 1,         // 0: Bars, 1: Wave (Default: Oscilloscope Sine Wave), 2: Peak Dots, 3: Off
      icon: true,
      prog: true,
      div: false,     // Default: Seamless borderless clean gap
      bri: 255,
      inv: false,
      flip: false,
      pwr: true,
      auto: true,     // Default: Smart Auto-Switching ENABLED (auto-shows Album Art & Music HUD when playing)
      text: "LumiOS Smart Desk"
    };

    this.uploadedArtCanvas = null;

    // Live Media Cache from ESP32 /status or media sync daemon
    this.media = {
      title: "Starboy",
      artist: "The Weeknd ft. Daft Punk",
      app: "spotify",
      pos: 84,
      dur: 230,
      playing: true,
      hasArt: true
    };

    // Telemetry Cache
    this.telemetry = {
      rssi: -58,
      ssid: "ichaos",
      temp: 42,
      heap: 184,
      uptime: "02:14:35",
      lightBri: 85
    };
  }

  init() {
    this.canvas = document.getElementById('oledVirtualCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.bindEvents();
    this.startRenderingLoop();
    this.startStatusPolling();
    this.fetchSettings();
  }

  bindEvents() {
    // Mode selector cards
    document.querySelectorAll('.oled-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const mode = parseInt(card.dataset.mode, 10);
        this.setMode(mode);
      });
    });

    // Art position chips
    document.querySelectorAll('#oledArtPosChips .chip-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pos = parseInt(btn.dataset.artpos, 10);
        this.setArtPos(pos);
      });
    });

    // Visualizer style chips
    document.querySelectorAll('#oledVisStyleChips .chip-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const vis = parseInt(btn.dataset.vis, 10);
        this.setVisStyle(vis);
      });
    });

    // Toggle checkboxes
    document.getElementById('oledToggleIcon')?.addEventListener('change', (e) => {
      this.state.icon = e.target.checked;
      this.sendUpdate({ icon: this.state.icon });
    });

    document.getElementById('oledToggleProgress')?.addEventListener('change', (e) => {
      this.state.prog = e.target.checked;
      this.sendUpdate({ prog: this.state.prog });
    });

    document.getElementById('oledToggleDivider')?.addEventListener('change', (e) => {
      this.state.div = e.target.checked;
      this.sendUpdate({ div: this.state.div });
    });

    // Contrast / Brightness slider
    const contrastSlider = document.getElementById('oledContrastSlider');
    const contrastVal = document.getElementById('oledContrastVal');
    contrastSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.state.bri = val;
      if (contrastVal) contrastVal.textContent = `${Math.round((val / 255) * 100)}%`;
      this.updateScreenBrightnessVisual();
      this.throttleSend({ bri: val });
    });

    // Smart Auto Switching
    document.getElementById('oledAutoSwitchToggle')?.addEventListener('change', (e) => {
      this.state.auto = e.target.checked;
      this.sendUpdate({ auto: this.state.auto });
      showToast(this.state.auto ? "Smart Auto-Switching ENABLED" : "Smart Auto-Switching DISABLED");
    });

    // Quick action buttons
    document.getElementById('oledInvertBtn')?.addEventListener('click', () => {
      this.toggleInvert();
    });

    document.getElementById('oledFlipBtn')?.addEventListener('click', () => {
      this.toggleFlip();
    });

    document.getElementById('oledTogglePowerBtn')?.addEventListener('click', () => {
      this.togglePower();
    });

    // Banner Text
    document.getElementById('oledUpdateBannerBtn')?.addEventListener('click', () => {
      this.updateBannerText();
    });
    document.getElementById('oledBannerTextInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.updateBannerText();
    });

    // Quick presets
    document.getElementById('oledPresetMusicDefault')?.addEventListener('click', () => {
      this.applyPreset({ mode: 0, artPos: 0, vis: 0, icon: true, prog: true, div: true }, "Music Standard");
    });
    document.getElementById('oledPresetClockMinimal')?.addEventListener('click', () => {
      this.applyPreset({ mode: 1 }, "Desk Clock Minimal");
    });
    document.getElementById('oledPresetWideSpectrum')?.addEventListener('click', () => {
      this.applyPreset({ mode: 2 }, "Wide 128px Spectrum");
    });
    document.getElementById('oledPresetAmbientMirror')?.addEventListener('click', () => {
      this.applyPreset({ mode: 3 }, "Ambient LED Mirror");
    });

    // Save & Push to ESP32
    document.getElementById('oledSaveSettingsBtn')?.addEventListener('click', () => {
      this.pushFullSettings();
    });

    // Modern Watch Face Selector Cards
    document.querySelectorAll('#oledWatchFaceGrid .watchface-card').forEach(card => {
      card.addEventListener('click', () => {
        this.setWatchFace(card.dataset.face);
      });
    });

    // Album Art File Uploader & Dither Converter
    const artFileInput = document.getElementById('oledArtFileInput');
    document.getElementById('oledUploadArtBtn')?.addEventListener('click', () => {
      artFileInput?.click();
    });
    artFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.handleArtUpload(file);
    });
    document.getElementById('oledResetArtBtn')?.addEventListener('click', () => {
      this.resetArtToDefault();
    });
  }

  setWatchFace(face) {
    this.state.face = parseInt(face, 10);
    this.state.mode = 1; // Ensure clock mode is active
    this.syncUI();
    const faceNames = [
      "Studio Minimalist",
      "Chronos Duo Horology",
      "Bauhaus Swiss Typography",
      "Cyber Orbit HUD",
      "Neo Horizon Diurnal",
      "Aviator Flieger Pilot",
      "Neo-Tokyo Cyber Matrix"
    ];
    showToast(`Watch Face: ${faceNames[this.state.face] || face}`);
    this.sendUpdate({ mode: 1, face: this.state.face });
  }

  handleArtUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext('2d');
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 64, 64);

        const imgData = ctx.getImageData(0, 0, 64, 64);
        const d = imgData.data;
        const gray = new Float32Array(64 * 64);
        for (let i = 0; i < 64 * 64; i++) {
          const idx = i * 4;
          gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
        }

        const bytes = new Uint8Array(512);
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 64; x++) {
            const idx = y * 64 + x;
            const oldVal = gray[idx];
            const newVal = oldVal < 128 ? 0 : 255;
            const err = oldVal - newVal;

            if (x + 1 < 64) gray[idx + 1] += err * (7 / 16);
            if (y + 1 < 64) {
              if (x > 0) gray[(y + 1) * 64 + (x - 1)] += err * (3 / 16);
              gray[(y + 1) * 64 + x] += err * (5 / 16);
              if (x + 1 < 64) gray[(y + 1) * 64 + (x + 1)] += err * (1 / 16);
            }

            if (newVal > 128) {
              const byteIdx = y * 8 + Math.floor(x / 8);
              bytes[byteIdx] |= (1 << (x % 8));
            }
          }
        }

        let hex = '';
        for (let b = 0; b < 512; b++) {
          hex += bytes[b].toString(16).padStart(2, '0');
        }

        this.uploadedArtCanvas = c;
        this.media.hasArt = true;
        this.syncUI();

        const targetIp = APP_STATE.ip || defaultTargetIp;
        showToast('Uploading 64×64 Album Art to ESP32...');
        fetch(`http://${targetIp}/art`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: hex
        }).then(res => {
          if (res.ok) showToast('64×64 Album Art Uploaded Successfully!');
          else showToast('Art applied to display preview');
        }).catch(() => {
          showToast('Art cached in Web Studio');
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  resetArtToDefault() {
    this.uploadedArtCanvas = null;
    this.media.hasArt = false;
    this.syncUI();
    showToast('Album Artwork reset to Default Vinyl Record');
  }

  setMode(mode) {
    this.state.mode = mode;
    this.syncUI();
    const modeNames = [
      "Now Playing Music HUD",
      "Digital Clock & Telemetry",
      "128px Audio Spectrum",
      "Ambient Lightbar Mirror",
      "Cyberpunk Banner Ticker",
      "Web Studio Mobile QR Code",
      "Wi-Fi Quick-Connect QR Code"
    ];
    showToast(`OLED Mode: ${modeNames[mode] || mode}`);
    this.sendUpdate({ mode: this.state.mode });
  }

  setArtPos(pos) {
    this.state.artPos = pos;
    this.syncUI();
    const posNames = ["Album Art: Left (Maximized)", "Album Art: Right Side", "Album Art: Hidden (Full Width)"];
    showToast(posNames[pos] || `Art Position: ${pos}`);
    this.sendUpdate({ artPos: this.state.artPos });
  }

  setVisStyle(vis) {
    this.state.vis = vis;
    this.syncUI();
    const visNames = ["Visualizer: Equalizer Bars", "Visualizer: Sine Waveform", "Visualizer: Floating Peak Dots", "Visualizer: Disabled"];
    showToast(visNames[vis] || `Vis Style: ${vis}`);
    this.sendUpdate({ vis: this.state.vis });
  }

  toggleInvert() {
    this.state.inv = !this.state.inv;
    this.syncUI();
    showToast(this.state.inv ? "OLED Colors Inverted (White Theme)" : "OLED Colors Restored (Dark Theme)");
    this.sendUpdate({ inv: this.state.inv });
  }

  toggleFlip() {
    this.state.flip = !this.state.flip;
    this.syncUI();
    showToast(this.state.flip ? "OLED Flipped 180° (Inverted Mount)" : "OLED Normal Orientation");
    this.sendUpdate({ flip: this.state.flip });
  }

  togglePower() {
    this.state.pwr = !this.state.pwr;
    this.syncUI();
    showToast(this.state.pwr ? "OLED Display Active (ON)" : "OLED Display Standby (SLEEP)");
    this.sendUpdate({ pwr: this.state.pwr });
  }

  updateBannerText() {
    const input = document.getElementById('oledBannerTextInput');
    const text = input ? input.value.trim() : "";
    if (text) {
      this.state.text = text;
      showToast(`OLED Banner Updated: "${text}"`);
      this.sendUpdate({ text: this.state.text });
    }
  }

  applyPreset(partial, name) {
    Object.assign(this.state, partial);
    this.syncUI();
    showToast(`Applied OLED Preset: ${name}`);
    this.sendUpdate(this.state);
  }

  updateScreenBrightnessVisual() {
    if (!this.canvas) return;
    const factor = Math.max(0.15, this.state.bri / 255);
    this.canvas.style.opacity = factor.toFixed(2);
    this.canvas.style.filter = `drop-shadow(0 0 ${(4 * factor).toFixed(1)}px rgba(0, 242, 254, ${(0.6 * factor).toFixed(2)}))`;
    if (this.state.inv) {
      this.canvas.classList.add('oled-inverted');
    } else {
      this.canvas.classList.remove('oled-inverted');
    }
  }

  syncUI() {
    // Mode cards
    document.querySelectorAll('.oled-mode-card').forEach(card => {
      const mode = parseInt(card.dataset.mode, 10);
      card.classList.toggle('active', mode === this.state.mode);
    });

    // Navigation tab badge
    const badge = document.getElementById('oledModeBadge');
    if (badge) {
      const labels = ["HUD", "CLOCK", "SPECTRUM", "AMBIENT", "BANNER", "QR WEB", "QR WIFI"];
      badge.textContent = labels[this.state.mode] || "OLED";
    }

    // Sub-customizer visibility
    const musicCust = document.getElementById('oledMusicCustomizer');
    const clockCust = document.getElementById('oledClockCustomizer');
    const bannerCust = document.getElementById('oledBannerCustomizer');
    if (musicCust) musicCust.classList.toggle('hide', this.state.mode !== 0);
    if (clockCust) clockCust.classList.toggle('hide', this.state.mode !== 1);
    if (bannerCust) bannerCust.classList.toggle('hide', this.state.mode !== 4);

    // Watch Face Cards
    document.querySelectorAll('#oledWatchFaceGrid .watchface-card').forEach(card => {
      const f = parseInt(card.dataset.face, 10);
      card.classList.toggle('active', f === (this.state.face || 0));
    });

    // Art position chips
    document.querySelectorAll('#oledArtPosChips .chip-sub-btn').forEach(btn => {
      const p = parseInt(btn.dataset.artpos, 10);
      btn.classList.toggle('active', p === this.state.artPos);
    });

    // Vis style chips
    document.querySelectorAll('#oledVisStyleChips .chip-sub-btn').forEach(btn => {
      const v = parseInt(btn.dataset.vis, 10);
      btn.classList.toggle('active', v === this.state.vis);
    });

    // Checkboxes
    const chkIcon = document.getElementById('oledToggleIcon');
    if (chkIcon) chkIcon.checked = !!this.state.icon;
    const chkProg = document.getElementById('oledToggleProgress');
    if (chkProg) chkProg.checked = !!this.state.prog;
    const chkDiv = document.getElementById('oledToggleDivider');
    if (chkDiv) chkDiv.checked = !!this.state.div;
    const chkAuto = document.getElementById('oledAutoSwitchToggle');
    if (chkAuto) chkAuto.checked = !!this.state.auto;

    // Contrast Slider
    const contrastSlider = document.getElementById('oledContrastSlider');
    const contrastVal = document.getElementById('oledContrastVal');
    if (contrastSlider) contrastSlider.value = this.state.bri;
    if (contrastVal) contrastVal.textContent = `${Math.round((this.state.bri / 255) * 100)}%`;

    // Banner Text Input
    const bannerInput = document.getElementById('oledBannerTextInput');
    if (bannerInput && this.state.text) bannerInput.value = this.state.text;

    // Quick Actions
    const pwrIcon = document.getElementById('oledPwrIcon');
    const pwrText = document.getElementById('oledPwrText');
    const pwrBtn = document.getElementById('oledTogglePowerBtn');
    if (pwrIcon) pwrIcon.textContent = this.state.pwr ? "⚡" : "💤";
    if (pwrText) pwrText.textContent = this.state.pwr ? "Display ON" : "Display SLEEP";
    if (pwrBtn) pwrBtn.classList.toggle('active-accent', !this.state.pwr);

    // Canvas filters
    if (this.canvas) {
      this.canvas.classList.toggle('oled-inverted', !!this.state.inv);
      this.canvas.classList.toggle('oled-flipped', !!this.state.flip);
      this.updateScreenBrightnessVisual();
    }
  }

  async fetchSettings() {
    try {
      const targetIp = APP_STATE.ip || defaultTargetIp;
      const res = await fetch(`http://${targetIp}/oled`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        Object.assign(this.state, data);
        this.syncUI();
      }
    } catch (e) {
      // Offline fallback
    }
  }

  async sendUpdate(partial) {
    Object.assign(this.state, partial);
    this.syncUI();
    try {
      const targetIp = APP_STATE.ip || defaultTargetIp;
      await fetch(`http://${targetIp}/oled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state)
      });
    } catch (e) {
      // Ignore network errors in demo/local mode
    }
  }

  throttleSend(partial) {
    Object.assign(this.state, partial);
    if (this.sendThrottleTimer) return;
    this.sendThrottleTimer = setTimeout(() => {
      this.sendThrottleTimer = null;
      this.sendUpdate(partial);
    }, 60);
  }

  async pushFullSettings() {
    try {
      const targetIp = APP_STATE.ip || defaultTargetIp;
      showToast("Synchronizing OLED Studio to ESP32...");
      const res = await fetch(`http://${targetIp}/oled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state)
      });
      if (res.ok) {
        showToast("OLED HUD synchronized to ESP32!");
      } else {
        showToast("Settings sent to ESP32");
      }
    } catch (e) {
      showToast("OLED parameters applied locally");
    }
  }

  startStatusPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      try {
        const targetIp = APP_STATE.ip || defaultTargetIp;
        const res = await fetch(`http://${targetIp}/status`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.media_title) this.media.title = data.media_title;
          if (data.media_artist) this.media.artist = data.media_artist;
          if (data.media_app) this.media.app = data.media_app.toLowerCase();
          if (data.media_pos !== undefined) this.media.pos = data.media_pos;
          if (data.media_dur !== undefined) this.media.dur = data.media_dur;
          if (data.media_playing !== undefined) this.media.playing = data.media_playing;
          if (data.has_art !== undefined) this.media.hasArt = data.has_art;

          if (data.oled_mode !== undefined && this.state.mode !== data.oled_mode) {
            this.state.mode = data.oled_mode;
            this.syncUI();
          }
          if (data.oled_face !== undefined && this.state.face !== data.oled_face) {
            this.state.face = data.oled_face;
            this.syncUI();
          }
          if (data.oled_bri !== undefined && Math.abs(this.state.bri - data.oled_bri) > 2) {
            this.state.bri = data.oled_bri;
            this.syncUI();
          }
        }
      } catch (e) {}
    }, 2500);
  }

  startRenderingLoop() {
    const loop = (now) => {
      this.frameCount++;
      if (now - this.lastFpsUpdate >= 500) {
        this.simFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
        this.frameCount = 0;
        this.lastFpsUpdate = now;
        const fpsEl = document.getElementById('oledSimFps');
        if (fpsEl) fpsEl.textContent = `${this.simFps} FPS`;
      }

      this.updateAnimations();
      this.render();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  updateAnimations() {
    this.animWave += 0.08;
    this.vinylAngle += 0.035;
    this.scrollOffset += 0.45;
    this.bannerOffset += 0.65;
    if (this.bannerOffset > 240) this.bannerOffset = -112;

    // Peak Hold Physics for Spectrum Mode
    for (let i = 0; i < 32; i++) {
      if (this.peakBars[i] >= this.peakHold[i]) {
        this.peakHold[i] = this.peakBars[i];
        this.peakHoldSpeed[i] = 0;
      } else {
        this.peakHoldSpeed[i] += 0.08;
        this.peakHold[i] = Math.max(2, this.peakHold[i] - this.peakHoldSpeed[i]);
      }
    }
  }

  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = 128;
    const h = 64;

    // High contrast black background
    ctx.fillStyle = '#010409';
    ctx.fillRect(0, 0, w, h);

    // If power is OFF
    if (!this.state.pwr) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STANDBY // SLEEP', 64, 32);
      ctx.font = '6px monospace';
      ctx.fillText('DISPLAY POWER OFF', 64, 42);
      const blink = Math.floor(performance.now() / 600) % 2 === 0;
      ctx.fillStyle = blink ? '#00f2fe' : '#1e293b';
      ctx.fillRect(62, 48, 4, 2);
      return;
    }

    let activeMode = this.state.mode;
    if (this.state.auto && this.state.mode !== 5 && this.state.mode !== 6) {
      activeMode = this.media.playing ? 0 : this.state.mode;
    }

    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    switch (activeMode) {
      case 1:
        this.renderClockTelemetryHUD(ctx);
        break;
      case 2:
        this.renderFullSpectrumHUD(ctx);
        break;
      case 3:
        this.renderAmbientMirrorHUD(ctx);
        break;
      case 4:
        this.renderCustomBannerHUD(ctx);
        break;
      case 5:
        this.renderQRCodeScreenSim(ctx, false);
        break;
      case 6:
        this.renderQRCodeScreenSim(ctx, true);
        break;
      case 0:
      default:
        this.renderMusicPlayerHUD(ctx);
        break;
    }
  }

  renderQRCodeScreenSim(ctx, isWifi) {
    // Clear display buffer with OLED deep black
    ctx.fillStyle = '#010409';
    ctx.fillRect(0, 0, 128, 64);

    // Draw crisp white backing box for QR code on left (x=3..57, y=5..59)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 5, 54, 54);

    // Render simulated QR modules inside the box
    ctx.fillStyle = '#000000';
    // Position detection patterns (top-left, top-right, bottom-left)
    const drawFinder = (fx, fy) => {
      ctx.fillRect(fx, fy, 14, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(fx + 2, fy + 2, 10, 10);
      ctx.fillStyle = '#000000';
      ctx.fillRect(fx + 4, fy + 4, 6, 6);
    };
    drawFinder(6, 8);
    drawFinder(39, 8);
    drawFinder(6, 41);

    // Deterministic pseudo-QR pattern
    const seed = isWifi ? 0xbeef : 0xcafe;
    for (let qy = 0; qy < 23; qy++) {
      for (let qx = 0; qx < 23; qx++) {
        // Skip finder zones
        if ((qx < 8 && qy < 8) || (qx > 14 && qy < 8) || (qx < 8 && qy > 14)) continue;
        const v = ((qx * 37 + qy * 19 + seed) ^ (qx * qy)) % 7;
        if (v < 3) {
          ctx.fillRect(6 + qx * 2, 8 + qy * 2, 2, 2);
        }
      }
    }

    // Right Side HUD (x=64..127)
    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    // Header Pill
    ctx.strokeRect(64, 4, 60, 12);
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isWifi ? "WIFI JOIN" : "WEB LINK", 94, 13);

    // Content details
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    if (isWifi) {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText("SSID: v20p", 64, 26);
      ctx.fillText("PASS: honululu", 64, 36);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText("WPA2 AUTO", 64, 46);
    } else {
      const ipStr = APP_STATE.ip || "10.142.252.233";
      ctx.fillStyle = '#94a3b8';
      ctx.fillText("IP ADDR:", 64, 25);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(ipStr, 64, 35);
      ctx.font = '6px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText("PORT: 80 / HTTP", 64, 45);
    }

    // Exit prompt footer
    ctx.fillStyle = '#64748b';
    ctx.font = '6px monospace';
    ctx.fillText("TAP BTN: EXIT", 64, 57);
  }

  renderMusicPlayerHUD(ctx) {
    const artPos = this.state.artPos;
    const showDiv = this.state.div;
    const showIcon = this.state.icon;
    const showProg = this.state.prog;
    const vis = this.state.vis;

    // CASE A: Album Art Left (Maximized 64x64)
    if (artPos === 0) {
      if (this.uploadedArtCanvas && this.media.hasArt) {
        ctx.drawImage(this.uploadedArtCanvas, 0, 0, 64, 64);
      } else {
        this.drawVinylDisc(ctx, 32, 32, 28, this.vinylAngle);
      }
      if (showDiv) {
        this.drawDottedVLine(ctx, 64, 0, 64);
      }
      this.drawTrackMetadata(ctx, 67, 59, showIcon, showProg, vis);
    }
    // CASE B: Album Art Right (64x64)
    else if (artPos === 1) {
      this.drawTrackMetadata(ctx, 2, 59, showIcon, showProg, vis);
      if (showDiv) {
        this.drawDottedVLine(ctx, 63, 0, 64);
      }
      if (this.uploadedArtCanvas && this.media.hasArt) {
        ctx.drawImage(this.uploadedArtCanvas, 64, 0, 64, 64);
      } else {
        this.drawVinylDisc(ctx, 96, 32, 28, this.vinylAngle);
      }
    }
    // CASE C: Album Art Hidden (Full Width 128px)
    else {
      this.drawFullWidthMusic(ctx, 4, 120, showIcon, showProg, vis);
    }
  }

  drawVinylDisc(ctx, cx, cy, radius, rot) {
    // Outer Vinyl Edge
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Concentric Grooves
    const grooves = [25, 21, 18, 14];
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.45)';
    grooves.forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Spinning Specular Sheen (Reflecting Desk Lamp)
    ctx.fillStyle = 'rgba(0, 242, 254, 0.22)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, rot, rot + 0.38);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, rot + Math.PI, rot + Math.PI + 0.38);
    ctx.fill();

    // Center Spindle Hub
    ctx.fillStyle = '#00f2fe';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();

    // Spindle Center Hole
    ctx.fillStyle = '#010409';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDottedVLine(ctx, x, y1, y2) {
    ctx.fillStyle = 'rgba(0, 242, 254, 0.55)';
    for (let y = y1; y < y2; y += 2) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  drawTrackMetadata(ctx, x, w, showIcon, showProg, vis) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f2fe';

    // Header Row: App Icon & State
    let textX = x;
    if (showIcon) {
      if (this.media.app.includes('spot')) {
        this.drawSpotifyIcon(ctx, x, 0);
      } else if (this.media.app.includes('you') || this.media.app.includes('tube')) {
        this.drawYouTubeIcon(ctx, x, 0);
      } else {
        this.drawMusicNoteIcon(ctx, x, 0);
      }
      textX = x + 10;
    }

    ctx.font = '6px monospace';
    ctx.fillText(this.media.playing ? "PLAYING" : "PAUSED", textX, 7);
    ctx.textAlign = 'right';
    ctx.fillText(APP_STATE.power ? `${Math.round(APP_STATE.brightness / 2.55)}%` : "OFF", x + w, 7);
    ctx.textAlign = 'left';

    // Title (Compact & sharp font)
    ctx.font = 'bold 8px monospace';
    const titleWidth = ctx.measureText(this.media.title).width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 9, w, 11);
    ctx.clip();
    if (titleWidth > w) {
      const scrollPos = (this.scrollOffset % (titleWidth + 16));
      ctx.fillText(this.media.title, x - scrollPos, 18);
    } else {
      ctx.fillText(this.media.title, x, 18);
    }
    ctx.restore();

    // Artist (Compact sub-line)
    ctx.font = '6px monospace';
    let artistStr = this.media.artist || "Unknown Artist";
    if (ctx.measureText(artistStr).width > w) {
      while (artistStr.length > 3 && ctx.measureText(artistStr + "..").width > w) {
        artistStr = artistStr.slice(0, -1);
      }
      artistStr += "..";
    }
    ctx.fillText(artistStr, x, 26);

    // Progress Bar (Sleek modern 2px track)
    if (showProg) {
      ctx.fillStyle = 'rgba(0, 242, 254, 0.3)';
      ctx.fillRect(x, 29, w, 2);
      ctx.fillStyle = '#00f2fe';
      const dur = this.media.dur > 0 ? this.media.dur : 240;
      const pos = Math.min(this.media.pos, dur);
      const barW = Math.max(1, Math.round((w * pos) / dur));
      ctx.fillRect(x, 28, barW, 3);

      ctx.font = '6px monospace';
      const timeStr = `${this.formatTime(pos)}/${this.formatTime(dur)}`;
      ctx.fillText(timeStr, x, 37);
    }

    // Rich Flowing Sine Waveform Oscilloscope (y = 40..63 — 24px height!)
    if (vis === 1) {
      const centerY = 51;
      const amp = this.media.playing ? 9.0 : 1.0;

      // Subtle dashed baseline
      ctx.fillStyle = 'rgba(0, 242, 254, 0.25)';
      for (let bx = x; bx < x + w; bx += 4) {
        ctx.fillRect(bx, centerY, 1, 1);
      }

      // Smooth Continuous Waveform
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let px = 0; px <= w; px++) {
        const w1 = Math.sin((px * 0.26) + this.animWave);
        const w2 = Math.sin((px * 0.12) - (this.animWave * 1.3)) * 0.45;
        const wy = centerY + (w1 + w2) * amp;
        const clampedY = Math.max(40, Math.min(63, wy));
        if (px === 0) ctx.moveTo(x + px, clampedY);
        else ctx.lineTo(x + px, clampedY);
      }
      ctx.stroke();
    } else if (vis === 0) {
      // Dynamic Equalizer Bars
      const numBars = Math.floor(w / 4);
      for (let b = 0; b < numBars; b++) {
        const bx = x + b * 4;
        const h = this.media.playing
          ? Math.max(2, Math.min(22, Math.round(Math.abs(Math.sin(b * 0.45 + this.animWave) * 18) + 2)))
          : 2;
        ctx.fillRect(bx, 63 - h, 3, h);
      }
    } else if (vis === 2) {
      // Floating Peak Dots
      const numDots = Math.floor(w / 4);
      for (let d = 0; d < numDots; d++) {
        const dx = x + d * 4;
        const h = this.media.playing
          ? Math.max(2, Math.min(20, Math.round(Math.abs(Math.sin(d * 0.5 + this.animWave * 1.2) * 16) + 2)))
          : 2;
        ctx.fillRect(dx, 63 - h, 2, 2);
      }
    }
  }

  drawFullWidthMusic(ctx, x, w, showIcon, showProg, vis) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f2fe';

    // Top Header
    let tx = x;
    if (showIcon) {
      this.drawSpotifyIcon(ctx, x, 0);
      tx = x + 11;
    }
    ctx.font = '6px monospace';
    ctx.fillText(this.media.playing ? "NOW PLAYING" : "PAUSED", tx, 7);
    ctx.textAlign = 'right';
    ctx.fillText(`LIGHT: ${APP_STATE.power ? Math.round(APP_STATE.brightness / 2.55) + '%' : 'OFF'}`, 126, 7);
    ctx.textAlign = 'left';
    ctx.fillRect(0, 9, 128, 1);

    // Title (Large clean font)
    ctx.font = 'bold 10px monospace';
    const titleWidth = ctx.measureText(this.media.title).width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 11, w, 14);
    ctx.clip();
    if (titleWidth > w) {
      const scrollPos = (this.scrollOffset % (titleWidth + 24));
      ctx.fillText(this.media.title, x - scrollPos, 22);
    } else {
      ctx.fillText(this.media.title, x, 22);
    }
    ctx.restore();

    // Artist
    ctx.font = '6px monospace';
    ctx.fillText("ARTIST: " + (this.media.artist || "Unknown"), x, 30);

    // Full Width Progress Bar (2px sleek line)
    if (showProg) {
      ctx.fillStyle = 'rgba(0, 242, 254, 0.3)';
      ctx.fillRect(x, 34, w, 2);
      ctx.fillStyle = '#00f2fe';
      const dur = this.media.dur > 0 ? this.media.dur : 240;
      const pos = Math.min(this.media.pos, dur);
      const barW = Math.max(1, Math.round((w * pos) / dur));
      ctx.fillRect(x, 33, barW, 3);

      ctx.font = '6px monospace';
      ctx.fillText(`${this.formatTime(pos)} / ${this.formatTime(dur)}`, x, 42);
    }

    // Full Width Oscilloscope Waveform (y = 44..63)
    if (vis === 1) {
      const centerY = 53;
      const amp = this.media.playing ? 9.0 : 1.0;
      ctx.fillStyle = 'rgba(0, 242, 254, 0.25)';
      for (let bx = 0; bx < 128; bx += 4) ctx.fillRect(bx, centerY, 1, 1);

      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let px = 0; px <= 128; px++) {
        const w1 = Math.sin((px * 0.18) + this.animWave);
        const w2 = Math.sin((px * 0.08) - (this.animWave * 1.2)) * 0.45;
        const wy = centerY + (w1 + w2) * amp;
        const clampedY = Math.max(44, Math.min(63, wy));
        if (px === 0) ctx.moveTo(px, clampedY);
        else ctx.lineTo(px, clampedY);
      }
      ctx.stroke();
    } else if (vis === 0) {
      for (let bx = 0; bx < 128; bx += 4) {
        const h = this.media.playing
          ? Math.max(2, Math.min(18, Math.round(Math.abs(Math.sin(bx * 0.22 + this.animWave) * 16) + 2)))
          : 2;
        ctx.fillRect(bx, 63 - h, 3, h);
      }
    } else if (vis === 2) {
      for (let dx = 0; dx < 128; dx += 4) {
        const h = this.media.playing
          ? Math.max(2, Math.min(18, Math.round(Math.abs(Math.sin(dx * 0.25 + this.animWave * 1.3) * 16) + 2)))
          : 2;
        ctx.fillRect(dx, 63 - h, 2, 2);
      }
    }
  }

  renderClockTelemetryHUD(ctx) {
    switch (this.state.face) {
      case 1:
        this.renderWatchFaceChronos(ctx);
        break;
      case 2:
        this.renderWatchFaceBauhaus(ctx);
        break;
      case 3:
        this.renderWatchFaceCyberHUD(ctx);
        break;
      case 4:
        this.renderWatchFaceNeoHorizon(ctx);
        break;
      case 5:
        this.renderWatchFaceAviator(ctx);
        break;
      case 6:
        this.renderWatchFaceNeoTokyo(ctx);
        break;
      case 0:
      default:
        this.renderWatchFaceStudio(ctx);
        break;
    }
  }

  getClockTimeComponents() {
    const now = new Date();
    const hr = now.getHours();
    const mn = now.getMinutes();
    const sc = now.getSeconds();
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const dayStr = days[now.getDay()];
    const monStr = months[now.getMonth()];
    const dateNum = String(now.getDate()).padStart(2, '0');
    const hrStr = String(hr).padStart(2, '0');
    const mnStr = String(mn).padStart(2, '0');
    const scStr = String(sc).padStart(2, '0');
    return {
      hr, mn, sc,
      timeStr: `${hrStr}:${mnStr}`,
      secStr: scStr,
      fullTimeStr: `${hrStr}:${mnStr}:${scStr}`,
      dateStr: `${dayStr}, ${dateNum} ${monStr}`,
      dayStr,
      monStr,
      fullDateStr: `${dateNum}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
    };
  }

  renderWatchFaceStudio(ctx) {
    const t = this.getClockTimeComponents();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    // Top status bar
    ctx.font = '6px monospace';
    ctx.fillText("WIFI 94%", 2, 7);
    ctx.textAlign = 'right';
    ctx.fillText(`DESK: ${APP_STATE.power ? Math.round(APP_STATE.brightness / 2.55) + '%' : 'OFF'}`, 126, 7);
    ctx.fillRect(0, 8, 128, 1);

    // Large Condensed Modern Numerals
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(t.timeStr, 54, 34);

    // Superscript seconds
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t.secStr, 92, 23);
    ctx.beginPath();
    ctx.arc(98, 30, 2, 0, Math.PI * 2);
    ctx.fill();

    // 60-Second Timeline Track
    ctx.fillRect(16, 42, 96, 1);
    const secFill = (t.sc * 96) / 60;
    if (secFill > 0) ctx.fillRect(16, 41, secFill, 3);
    ctx.beginPath();
    ctx.arc(16 + secFill, 42, 2, 0, Math.PI * 2);
    ctx.fill();

    // Date
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(t.dateStr, 64, 55);

    // Telemetry footer
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.telemetry.temp}°C`, 2, 63);
    ctx.textAlign = 'right';
    ctx.fillText(this.telemetry.uptime, 126, 63);
  }

  renderWatchFaceChronos(ctx) {
    const t = this.getClockTimeComponents();
    const cx = 31, cy = 31, r = 28;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    // Dial ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 12 ticks
    ctx.fillRect(cx - 0.5, cy - r + 2, 1, 3);
    ctx.fillRect(cx - 0.5, cy + r - 5, 1, 3);
    ctx.fillRect(cx + r - 5, cy - 0.5, 3, 1);
    ctx.fillRect(cx - r + 2, cy - 0.5, 3, 1);

    // Hour hand
    const hAngle = (t.hr % 12 + t.mn / 60) * 30 * (Math.PI / 180) - Math.PI / 2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hAngle) * 14, cy + Math.sin(hAngle) * 14);
    ctx.stroke();

    // Minute hand
    const mAngle = (t.mn + t.sc / 60) * 6 * (Math.PI / 180) - Math.PI / 2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(mAngle) * 22, cy + Math.sin(mAngle) * 22);
    ctx.stroke();

    // Second pip
    const sAngle = t.sc * 6 * (Math.PI / 180) - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(sAngle) * 23, cy + Math.sin(sAngle) * 23, 2, 0, Math.PI * 2);
    ctx.fill();

    // Center pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Dashed divider
    for (let y = 2; y < 62; y += 3) ctx.fillRect(64, y, 1, 1);

    // Right digital stack
    ctx.fillRect(68, 4, 56, 12);
    ctx.fillStyle = '#010409';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${t.dayStr} ${t.secStr}`, 96, 13);

    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t.timeStr, 69, 32);

    ctx.font = '8px monospace';
    ctx.fillText(`:${t.secStr} ${t.monStr}`, 69, 44);
    ctx.fillRect(68, 48, 56, 1);

    ctx.font = '6px monospace';
    ctx.fillText(`TMP ${this.telemetry.temp}°C`, 69, 56);
    ctx.fillText(`DESK ${APP_STATE.power ? Math.round(APP_STATE.brightness / 2.55) + '%' : 'OFF'}`, 69, 63);
  }

  renderWatchFaceBauhaus(ctx) {
    const t = this.getClockTimeComponents();
    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    // Left giant numerals
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    const hrStr = String(t.hr).padStart(2, '0');
    const mnStr = String(t.mn).padStart(2, '0');
    ctx.fillText(hrStr, 4, 26);
    ctx.fillText(mnStr, 4, 56);

    // Vertical rule
    ctx.fillRect(48, 3, 2, 58);

    // Inverted day badge
    ctx.fillRect(54, 4, 70, 13);
    ctx.fillStyle = '#010409';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`• ${t.dayStr} •`, 89, 14);

    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(t.fullDateStr, 89, 29);

    // Seconds bar
    ctx.strokeRect(54, 35, 70, 7);
    const sW = (t.sc * 66) / 60;
    if (sW > 0) ctx.fillRect(56, 37, sW, 3);

    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SECOND ${t.secStr}/60`, 54, 51);
    ctx.fillText(`LIGHT ${APP_STATE.power ? Math.round(APP_STATE.brightness / 2.55) + '%' : 'OFF'}`, 54, 61);
    ctx.textAlign = 'right';
    ctx.fillText(`${this.telemetry.temp}°C`, 124, 61);
  }

  renderWatchFaceCyberHUD(ctx) {
    const t = this.getClockTimeComponents();
    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    // 4 tactical brackets
    ctx.fillRect(0, 0, 8, 1);
    ctx.fillRect(0, 0, 1, 8);
    ctx.fillRect(120, 0, 8, 1);
    ctx.fillRect(127, 0, 1, 8);
    ctx.fillRect(0, 63, 8, 1);
    ctx.fillRect(0, 56, 1, 8);
    ctx.fillRect(120, 63, 8, 1);
    ctx.fillRect(127, 56, 1, 8);

    // Header
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText("SYS:ONLINE", 12, 6);
    ctx.textAlign = 'right';
    ctx.fillText("WIFI:94%", 116, 6);

    // Center framed viewport
    ctx.strokeRect(10, 10, 108, 28);
    ctx.strokeRect(12, 12, 104, 24);

    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(t.fullTimeStr, 64, 28);

    // Dual meters
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText("RAM", 10, 45);
    ctx.strokeRect(28, 41, 40, 5);
    ctx.fillRect(29, 42, 28, 3);

    ctx.fillText("TMP", 72, 45);
    ctx.strokeRect(90, 41, 28, 5);
    ctx.fillRect(91, 42, 18, 3);

    ctx.fillRect(10, 50, 108, 1);
    ctx.fillText(t.dateStr, 12, 59);
    ctx.textAlign = 'right';
    ctx.fillText(`LED: ${APP_STATE.power ? Math.round(APP_STATE.brightness / 2.55) + '%' : 'OFF'}`, 116, 59);
  }

  renderWatchFaceNeoHorizon(ctx) {
    const t = this.getClockTimeComponents();
    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    // Top Status Bar: Day Badge + Full Date + Lighting
    ctx.fillRect(2, 1, 30, 9);
    ctx.fillStyle = '#010409';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(t.dayStr, 17, 8);
    ctx.fillStyle = '#00f2fe';

    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t.fullDateStr, 36, 8);

    ctx.textAlign = 'right';
    ctx.fillText(`LED ${APP_STATE.power ? Math.round(APP_STATE.brightness / 2.55) + '%' : 'OFF'}`, 126, 8);

    // Horizon line
    ctx.fillRect(2, 11, 124, 1);

    // Center Big Numerals
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t.timeStr, 4, 34);

    // Stacked Seconds & 24H Indicator
    const rightX = 82;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(t.secStr, rightX, 24);
    ctx.beginPath();
    ctx.arc(rightX + 18, 21, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeRect(rightX, 27, 26, 9);
    ctx.font = '6px monospace';
    ctx.fillText("24HR", rightX + 4, 34);

    // 24-Hour Diurnal Progress Horizon
    const dayProgress = (t.hr * 3600 + t.mn * 60 + t.sc) / 86400;
    const barW = 120;
    const progFill = Math.min(barW, Math.max(0, Math.round(dayProgress * barW)));

    ctx.strokeRect(4, 42, barW, 6);
    if (progFill > 0) ctx.fillRect(4, 42, progFill, 6);
    ctx.beginPath();
    ctx.arc(4 + progFill, 45, 2, 0, Math.PI * 2);
    ctx.fill();

    // Milestones (Dawn, Noon, Dusk)
    ctx.fillRect(4 + Math.round((barW * 6) / 24), 48, 1, 2);
    ctx.fillRect(4 + Math.round((barW * 12) / 24), 48, 1, 3);
    ctx.fillRect(4 + Math.round((barW * 18) / 24), 48, 1, 2);

    // Bottom Telemetry
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`CHIP ${this.telemetry.temp}°C`, 4, 60);
    ctx.textAlign = 'center';
    ctx.fillText(`DAY ${Math.round(dayProgress * 100)}%`, 64, 60);
    ctx.textAlign = 'right';
    ctx.fillText(`WIFI 94%`, 126, 60);
  }

  renderWatchFaceAviator(ctx) {
    const t = this.getClockTimeComponents();
    const cx = 31, cy = 31, r = 28;
    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    // Outer & Inner dial rings
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.stroke();

    // 12 o'clock Aviator Triangle
    ctx.beginPath();
    ctx.moveTo(cx, cy - r + 2);
    ctx.lineTo(cx - 3, cy - r + 7);
    ctx.lineTo(cx + 3, cy - r + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 5, cy - r + 4, 1, 1);
    ctx.fillRect(cx + 4, cy - r + 4, 1, 1);

    // Cardinal ticks at 3, 6, 9
    ctx.fillRect(cx + r - 5, cy - 0.5, 4, 1);
    ctx.fillRect(cx - r + 1, cy - 0.5, 4, 1);
    ctx.fillRect(cx - 0.5, cy + r - 5, 1, 4);

    // Hour hand
    const hAngle = (t.hr % 12 + t.mn / 60) * 30 * (Math.PI / 180) - Math.PI / 2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hAngle) * 13, cy + Math.sin(hAngle) * 13);
    ctx.stroke();

    // Minute hand
    const mAngle = (t.mn + t.sc / 60) * 6 * (Math.PI / 180) - Math.PI / 2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(mAngle) * 22, cy + Math.sin(mAngle) * 22);
    ctx.stroke();

    // Sweeping second hand with tail
    const sAngle = t.sc * 6 * (Math.PI / 180) - Math.PI / 2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(sAngle) * 6, cy - Math.sin(sAngle) * 6);
    ctx.lineTo(cx + Math.cos(sAngle) * 24, cy + Math.sin(sAngle) * 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + Math.cos(sAngle) * 24, cy + Math.sin(sAngle) * 24, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Crosshair border line at x = 63
    for (let y = 0; y < 64; y += 4) {
      ctx.fillRect(63, y, 1, 2);
    }

    // Right Side HUD Stack (x = 66..127)
    ctx.fillRect(66, 2, 60, 11);
    ctx.fillStyle = '#010409';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${t.dayStr} ${t.secStr}`, 96, 10);
    ctx.fillStyle = '#00f2fe';

    // Big Chrono Digits "HH:MM:SS"
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t.fullTimeStr, 67, 25);

    ctx.fillRect(66, 29, 60, 1);

    ctx.font = '6px monospace';
    ctx.fillText(`CHIP-ALT ${this.telemetry.temp}°C`, 67, 38);
    ctx.fillText(`LUX ${APP_STATE.power ? Math.round(APP_STATE.brightness / 2.55) + '%' : '0%'}`, 67, 47);

    // 3-Bar Signal Staircase
    ctx.fillRect(116, 45, 2, 2);
    ctx.fillRect(120, 43, 2, 4);
    ctx.fillRect(124, 41, 2, 6);

    ctx.fillRect(66, 51, 60, 1);
    ctx.fillText(`UP ${this.telemetry.uptime}`, 67, 60);
  }

  renderWatchFaceNeoTokyo(ctx) {
    const t = this.getClockTimeComponents();
    ctx.fillStyle = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';

    // Chamfered Bezel
    ctx.beginPath();
    ctx.moveTo(3, 0); ctx.lineTo(124, 0); ctx.lineTo(127, 3);
    ctx.lineTo(127, 60); ctx.lineTo(124, 63); ctx.lineTo(3, 63);
    ctx.lineTo(0, 60); ctx.lineTo(0, 3); ctx.closePath();
    ctx.stroke();

    // Top Bar: TOKYO // 01 + 10-Tick Decade Seconds
    ctx.fillRect(5, 3, 44, 8);
    ctx.fillStyle = '#010409';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText("TOKYO // 01", 8, 9);
    ctx.fillStyle = '#00f2fe';

    const pulse = t.sc % 10;
    for (let b = 0; b < 10; b++) {
      const bx = 56 + b * 6;
      if (b <= pulse) {
        ctx.fillRect(bx, 4, 4, 6);
      } else {
        ctx.strokeRect(bx, 4, 4, 6);
      }
    }

    ctx.fillRect(4, 13, 120, 1);

    // Main Digital Numerals
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t.timeStr, 6, 38);

    // Micro Seconds Box & Calendar Matrix
    const secBoxX = 86;
    ctx.strokeRect(secBoxX, 16, 36, 17);
    ctx.font = 'bold 10px monospace';
    ctx.fillText(t.secStr, secBoxX + 5, 29);
    ctx.beginPath();
    ctx.arc(secBoxX + 26, 24, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '7px monospace';
    ctx.fillText(`${t.dayStr} ${t.secStr}`, secBoxX, 42);

    // Bottom Status Ribbon
    ctx.fillRect(4, 46, 120, 1);
    ctx.font = '6px monospace';
    ctx.fillText("SYS.OK", 6, 54);
    ctx.fillText("HEAP 94K", 44, 54);
    ctx.fillText(`TMP ${this.telemetry.temp}°C`, 86, 54);

    ctx.fillText(`DESK: ${APP_STATE.power ? Math.round(APP_STATE.brightness / 2.55) + '%' : 'OFF'}`, 6, 61);
    ctx.textAlign = 'right';
    ctx.fillText(t.fullDateStr, 122, 61);
  }

  renderFullSpectrumHUD(ctx) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f2fe';
    ctx.font = '6px monospace';
    ctx.fillText("128-PX FULL SPECTRUM AUDIO ANALYZER", 2, 7);
    ctx.textAlign = 'right';
    ctx.fillText(this.media.playing ? "[ACTIVE]" : "[IDLE]", 126, 7);
    ctx.textAlign = 'left';
    ctx.fillRect(0, 9, 128, 1);

    // 32-Band Equalizer across full 128px
    const startY = 62;
    for (let i = 0; i < 32; i++) {
      const bx = i * 4;
      let h = 2;
      if (this.media.playing) {
        const f1 = Math.sin(i * 0.35 + this.animWave) * 16;
        const f2 = Math.cos(i * 0.18 - this.animWave * 1.4) * 10;
        const f3 = Math.sin(i * 0.62 + this.animWave * 0.8) * 8;
        h = Math.max(2, Math.min(48, Math.round(Math.abs(f1 + f2 + f3) + 2)));
      }
      this.peakBars[i] = h;

      // Draw Bar (3px wide)
      ctx.fillRect(bx, startY - h, 3, h);

      // Draw Floating Peak Dot (3px wide, 1px high)
      const peakY = Math.round(this.peakHold[i]);
      if (peakY > 3) {
        ctx.fillRect(bx, startY - peakY - 2, 3, 1);
      }
    }
  }

  renderAmbientMirrorHUD(ctx) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f2fe';
    ctx.font = '6px monospace';
    ctx.fillText("DESK LIGHTING AMBIENT MIRROR", 2, 7);
    ctx.fillRect(0, 9, 128, 1);

    // FX Name
    const effNames = ["Solid Glow", "Rainbow Flow", "Cyber Breathe", "Color Chase", "Fire Flicker", "Party Strobe"];
    const activeFxName = APP_STATE.effectsList[APP_STATE.currentFx] || effNames[APP_STATE.currentFx % effNames.length] || "Dynamic FX";
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`FX: ${activeFxName}`, 4, 21);

    // 59-LED Strip Simulated Lightbar
    ctx.strokeStyle = '#00f2fe';
    ctx.strokeRect(2, 26, 124, 9);
    if (APP_STATE.power && APP_STATE.brightness > 5) {
      for (let l = 0; l < 59; l += 2) {
        const px = 4 + l * 2;
        if (px < 122) {
          ctx.fillRect(px, 28, 2, 5);
        }
      }
    }

    // RGB & Hex
    ctx.font = '6px monospace';
    const c = APP_STATE.colors[0] || [255, 0, 85];
    ctx.fillText(`RGB: (${c[0]},${c[1]},${c[2]})`, 4, 44);
    const hex = `#${((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1).toUpperCase()}`;
    ctx.textAlign = 'right';
    ctx.fillText(hex, 124, 44);
    ctx.textAlign = 'left';

    // Brightness Gauge Bar
    ctx.strokeStyle = '#00f2fe';
    ctx.strokeRect(4, 52, 85, 6);
    const bW = APP_STATE.power ? Math.round((83 * APP_STATE.brightness) / 255) : 0;
    if (bW > 0) ctx.fillRect(5, 53, bW, 4);

    ctx.fillText(APP_STATE.power ? `${Math.round((APP_STATE.brightness / 255) * 100)}%` : "OFF", 94, 58);
  }

  renderCustomBannerHUD(ctx) {
    ctx.strokeStyle = '#00f2fe';
    ctx.strokeRect(0, 0, 128, 64);
    ctx.strokeRect(2, 2, 124, 60);

    // Cyberpunk Corner Markers
    ctx.fillStyle = '#00f2fe';
    ctx.fillRect(0, 0, 5, 5);
    ctx.fillRect(123, 0, 5, 5);
    ctx.fillRect(0, 59, 5, 5);
    ctx.fillRect(123, 59, 5, 5);

    // Tech Labels
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText("★ LUMIOS HUD ★", 64, 9);
    ctx.fillText("• DESK STUDIO •", 64, 58);

    // Center Marquee Text
    ctx.font = 'bold 10px monospace';
    const bannerText = this.state.text || "LumiOS Smart Desk";
    const msgW = ctx.measureText(bannerText).width;

    if (msgW <= 112) {
      ctx.fillText(bannerText, 64, 36);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(5, 14, 118, 36);
      ctx.clip();
      ctx.textAlign = 'left';
      ctx.fillText(bannerText, 6 - Math.round(this.bannerOffset), 36);
      ctx.restore();
    }
  }

  drawSpotifyIcon(ctx, x, y) {
    ctx.fillStyle = '#00f2fe';
    ctx.beginPath();
    ctx.arc(x + 4, y + 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#010409';
    ctx.fillRect(x + 2, y + 2, 4, 1);
    ctx.fillRect(x + 2, y + 4, 4, 1);
    ctx.fillRect(x + 3, y + 6, 2, 1);
    ctx.fillStyle = '#00f2fe';
  }

  drawYouTubeIcon(ctx, x, y) {
    ctx.fillStyle = '#00f2fe';
    ctx.fillRect(x, y + 1, 8, 6);
    ctx.fillStyle = '#010409';
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 2);
    ctx.lineTo(x + 6, y + 4);
    ctx.lineTo(x + 3, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#00f2fe';
  }

  drawMusicNoteIcon(ctx, x, y) {
    ctx.fillStyle = '#00f2fe';
    ctx.fillRect(x + 1, y + 1, 6, 1);
    ctx.fillRect(x + 1, y + 1, 1, 5);
    ctx.fillRect(x + 6, y + 1, 1, 5);
    ctx.fillRect(x, y + 5, 2, 2);
    ctx.fillRect(x + 5, y + 5, 2, 2);
  }

  formatTime(sec) {
    if (!sec || isNaN(sec) || sec < 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
}

const oledStudio = new OledStudioManager();

