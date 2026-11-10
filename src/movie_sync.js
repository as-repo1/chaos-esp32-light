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
    this.letterboxSensitivity = parseInt(localStorage.getItem('ambilight_letterbox_sens') || '25', 10);
    this.dangerStrobeEnabled = localStorage.getItem('ambilight_danger_strobe') === 'true';
    this.dangerSensitivity = parseFloat(localStorage.getItem('ambilight_danger_sens') || '2.2');
    this.dangerHz = parseInt(localStorage.getItem('ambilight_danger_hz') || '8', 10);
    this.fastEdgeBoost = localStorage.getItem('ambilight_fast_edge') === 'true';
    this.dangerTriggerUntil = 0;
    this.antiFlickerEnabled = localStorage.getItem('ambilight_anti_flicker') !== 'false';
    this.deadbandThreshold = parseInt(localStorage.getItem('ambilight_deadband') || '6', 10);
    this.sceneCutSnapEnabled = localStorage.getItem('ambilight_scene_cut_snap') !== 'false';
    this.lastAmbilightSendTime = 0;
    this.activeProfile = localStorage.getItem('ambilight_profile') || 'cinema';
    this.lastFrameAvgRGB = [0, 0, 0];
    this.effectiveSmoothing = 0.35;
    this.effectiveSaturation = 1.5;
    this.wiringDirection = localStorage.getItem('ambilight_wiring') || 'cw';

    // Safe parsing helper to protect against corrupted localStorage
    const safeParseRatio = (key, fallback) => {
      try {
        const item = localStorage.getItem(key);
        if (!item) return fallback;
        const parsed = JSON.parse(item);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
      } catch (e) {
        return fallback;
      }
    };

    // Proportions / parts per section for multi-zone modes (Default 3-4-2 for 3-edges as requested)
    this.zoneRatios = {
      '3-edges': safeParseRatio('ambilight_ratios_3edges', [3, 4, 2]),
      '3-cols': safeParseRatio('ambilight_ratios_3cols', [1, 1, 1]),
      '4-edges': safeParseRatio('ambilight_ratios_4edges', [7, 3, 7, 3]),
      '2-sides': safeParseRatio('ambilight_ratios_2sides', [1, 1])
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

    // Event delegation on container - works reliably across all devices, touch and click
    const modeSelectContainer = document.getElementById('ambilightModeSelect');
    if (modeSelectContainer) {
      modeSelectContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.zone-mode-btn');
        if (btn && btn.dataset.mode) {
          e.preventDefault();
          this.setMode(btn.dataset.mode);
        }
      });
    }

    // Direct listener and active class setup on each button
    document.querySelectorAll('#ambilightModeSelect .zone-mode-btn').forEach(btn => {
      const isMatch = btn.dataset.mode === this.mode;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
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

    // One-Touch Cinema & Gaming Profiles
    document.querySelectorAll('.profile-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyProfile(btn.dataset.profile);
      });
      if (btn.dataset.profile === this.activeProfile) {
        btn.classList.add('active');
      }
    });

    // Test Danger Strobe Button
    const testDangerBtn = document.getElementById('btnTestDangerStrobe');
    if (testDangerBtn) {
      testDangerBtn.addEventListener('click', () => this.triggerTestDangerStrobe());
    }

    // Restore saved settings values into UI elements
    const letterboxSensSlider = document.getElementById('sliderLetterboxSens');
    if (letterboxSensSlider) letterboxSensSlider.value = this.letterboxSensitivity;
    const dangerSensSlider = document.getElementById('sliderDangerSens');
    if (dangerSensSlider) dangerSensSlider.value = this.dangerSensitivity;
    const dangerHzSlider = document.getElementById('sliderDangerHz');
    if (dangerHzSlider) dangerHzSlider.value = this.dangerHz;
    const fastEdgeCheck = document.getElementById('checkFastEdgeBoost');
    if (fastEdgeCheck) fastEdgeCheck.checked = this.fastEdgeBoost;
    const dangerCheck = document.getElementById('checkDangerStrobe');
    if (dangerCheck) dangerCheck.checked = this.dangerStrobeEnabled;
    const antiFlickerCheck = document.getElementById('checkAntiFlicker');
    if (antiFlickerCheck) antiFlickerCheck.checked = this.antiFlickerEnabled;
    const deadbandSlider = document.getElementById('sliderDeadband');
    if (deadbandSlider) deadbandSlider.value = this.deadbandThreshold;
    const sceneCutCheck = document.getElementById('checkSceneCutSnap');
    if (sceneCutCheck) sceneCutCheck.checked = this.sceneCutSnapEnabled;
    this.updateDeadbandText(this.deadbandThreshold);

    this.updateWiringOptions();
    this.renderDivisionControls();
    this.updateVisibilityForMode();
  }

  updateDeadbandText(val) {
    const textEl = document.getElementById('deadbandValText');
    if (!textEl) return;
    let desc = 'Clean';
    if (val <= 3) desc = 'Ultra-Fine';
    else if (val <= 6) desc = 'Clean';
    else if (val <= 10) desc = 'Smooth';
    else desc = 'Rock-Solid';
    textEl.textContent = `${desc} (${val} Δ)`;
  }

  smoothColor(curr, target) {
    const deltaR = Math.abs(target[0] - curr[0]);
    const deltaG = Math.abs(target[1] - curr[1]);
    const deltaB = Math.abs(target[2] - curr[2]);
    const totalDelta = deltaR + deltaG + deltaB;

    // 1. Deadband Noise Gate:
    // Disregard micro-variations and compression noise below threshold to prevent flickering
    if (this.antiFlickerEnabled && totalDelta <= this.deadbandThreshold) {
      return [curr[0], curr[1], curr[2]];
    }

    // 2. Base Exponential Moving Average (EMA) smoothing
    let alpha = this.effectiveSmoothing || this.smoothing || 0.28;

    // 3. Instant Scene Cut Snap with Hysteresis (prevents threshold oscillation flicker)
    if (this.sceneCutSnapEnabled) {
      if (totalDelta >= 120) {
        this._snapActive = true;
      } else if (totalDelta < 60) {
        this._snapActive = false;
      }
      if (this._snapActive) {
        alpha = 0.88;
      }
    }

    return [
      Math.round(lerp(curr[0], target[0], alpha)),
      Math.round(lerp(curr[1], target[1], alpha)),
      Math.round(lerp(curr[2], target[2], alpha))
    ];
  }

  sendAmbilightPacket(payload) {
    const now = performance.now();
    // Network pacing: ~30 packets/sec max (33ms throttle) to keep stream smooth & stable
    if (now - this.lastAmbilightSendTime < 33) {
      return;
    }

    this.lastAmbilightSendTime = now;
    payload.isStream = true;
    wled.send(payload);
  }

  triggerTestDangerStrobe() {
    this.dangerTriggerUntil = performance.now() + 2500;
    showToast('🚨 Testing Low HP Alert Strobe (2.5s)...');
  }

  applyProfile(name) {
    if (!name) return;
    this.activeProfile = name;
    try { localStorage.setItem('ambilight_profile', name); } catch (e) {}

    document.querySelectorAll('.profile-chip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.profile === name);
    });

    const setSlider = (id, val, textId, textVal) => {
      const s = document.getElementById(id);
      if (s) { s.value = val; }
      const t = document.getElementById(textId);
      if (t) { t.textContent = textVal; }
    };

    if (name === 'cinema') {
      this.smoothing = 0.25;
      this.saturation = 1.6;
      this.blackFloor = 5;
      this.letterboxFilter = true;
      this.fastEdgeBoost = false;
      this.dangerStrobeEnabled = false;
      this.antiFlickerEnabled = true;
      this.deadbandThreshold = 6;
      this.sceneCutSnapEnabled = true;

      setSlider('sliderMovieSmoothing', 0.25, 'smoothingValText', 'Cinematic (0.25)');
      setSlider('sliderMovieSaturation', 1.6, 'saturationValText', '1.6x (Vivid)');
      setSlider('sliderBlackFloor', 5, 'blackFloorValText', '5 (Ambient Floor)');
      setSlider('sliderDeadband', 6, 'deadbandValText', 'Clean (6 Δ)');
      const chkLetter = document.getElementById('checkLetterboxFilter');
      if (chkLetter) chkLetter.checked = true;
      const chkFast = document.getElementById('checkFastEdgeBoost');
      if (chkFast) chkFast.checked = false;
      const chkDanger = document.getElementById('checkDangerStrobe');
      if (chkDanger) chkDanger.checked = false;
      const chkAnti = document.getElementById('checkAntiFlicker');
      if (chkAnti) chkAnti.checked = true;
      const chkCut = document.getElementById('checkSceneCutSnap');
      if (chkCut) chkCut.checked = true;
      showToast('Profile: Cinema 21:9 Widescreen (Flicker-Free)');
    } else if (name === 'fps') {
      this.smoothing = 0.70;
      this.saturation = 1.8;
      this.blackFloor = 0;
      this.letterboxFilter = true;
      this.fastEdgeBoost = true;
      this.dangerStrobeEnabled = false;
      this.antiFlickerEnabled = true;
      this.deadbandThreshold = 4;
      this.sceneCutSnapEnabled = true;

      setSlider('sliderMovieSmoothing', 0.70, 'smoothingValText', 'Fast Esports (0.70)');
      setSlider('sliderMovieSaturation', 1.8, 'saturationValText', '1.8x (Vivid)');
      setSlider('sliderBlackFloor', 0, 'blackFloorValText', '0 (True Black)');
      setSlider('sliderDeadband', 4, 'deadbandValText', 'Ultra-Fine (4 Δ)');
      const chkLetter = document.getElementById('checkLetterboxFilter');
      if (chkLetter) chkLetter.checked = true;
      const chkFast = document.getElementById('checkFastEdgeBoost');
      if (chkFast) chkFast.checked = true;
      const chkDanger = document.getElementById('checkDangerStrobe');
      if (chkDanger) chkDanger.checked = false;
      const chkAnti = document.getElementById('checkAntiFlicker');
      if (chkAnti) chkAnti.checked = true;
      const chkCut = document.getElementById('checkSceneCutSnap');
      if (chkCut) chkCut.checked = true;
      showToast('Profile: Fast FPS Esports (Instant Cut Snap)');
    } else if (name === 'cyberpunk') {
      this.smoothing = 0.45;
      this.saturation = 2.2;
      this.blackFloor = 8;
      this.letterboxFilter = true;
      this.fastEdgeBoost = true;
      this.dangerStrobeEnabled = false;
      this.antiFlickerEnabled = true;
      this.deadbandThreshold = 5;
      this.sceneCutSnapEnabled = true;

      setSlider('sliderMovieSmoothing', 0.45, 'smoothingValText', 'Responsive (0.45)');
      setSlider('sliderMovieSaturation', 2.2, 'saturationValText', '2.2x (Hyper-Saturated)');
      setSlider('sliderBlackFloor', 8, 'blackFloorValText', '8 (Ambient Floor)');
      setSlider('sliderDeadband', 5, 'deadbandValText', 'Clean (5 Δ)');
      const chkLetter = document.getElementById('checkLetterboxFilter');
      if (chkLetter) chkLetter.checked = true;
      const chkFast = document.getElementById('checkFastEdgeBoost');
      if (chkFast) chkFast.checked = true;
      const chkDanger = document.getElementById('checkDangerStrobe');
      if (chkDanger) chkDanger.checked = false;
      const chkAnti = document.getElementById('checkAntiFlicker');
      if (chkAnti) chkAnti.checked = true;
      const chkCut = document.getElementById('checkSceneCutSnap');
      if (chkCut) chkCut.checked = true;
      showToast('Profile: Cyberpunk Neon & High Saturation');
    } else if (name === 'horror') {
      this.smoothing = 0.30;
      this.saturation = 1.3;
      this.blackFloor = 2;
      this.letterboxFilter = true;
      this.fastEdgeBoost = false;
      this.dangerStrobeEnabled = false;
      this.antiFlickerEnabled = true;
      this.deadbandThreshold = 7;
      this.sceneCutSnapEnabled = true;

      setSlider('sliderMovieSmoothing', 0.30, 'smoothingValText', 'Cinematic (0.30)');
      setSlider('sliderMovieSaturation', 1.3, 'saturationValText', '1.3x (Enhanced)');
      setSlider('sliderBlackFloor', 2, 'blackFloorValText', '2 (Faint Ambient)');
      setSlider('sliderDeadband', 7, 'deadbandValText', 'Smooth (7 Δ)');
      const chkLetter = document.getElementById('checkLetterboxFilter');
      if (chkLetter) chkLetter.checked = true;
      const chkFast = document.getElementById('checkFastEdgeBoost');
      if (chkFast) chkFast.checked = false;
      const chkDanger = document.getElementById('checkDangerStrobe');
      if (chkDanger) chkDanger.checked = false;
      const chkAnti = document.getElementById('checkAntiFlicker');
      if (chkAnti) chkAnti.checked = true;
      const chkCut = document.getElementById('checkSceneCutSnap');
      if (chkCut) chkCut.checked = true;
      showToast('Profile: Horror & Stealth Ambience');
    }
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
        { val: 'brtl', label: 'Bottom ➔ Right ➔ Up ➔ Left' },
        { val: 'cw', label: 'Top ➔ Right ➔ Bottom ➔ Left (Clockwise)' },
        { val: 'ccw', label: 'Left ➔ Bottom ➔ Right ➔ Top (Counter-Clockwise)' },
        { val: 'bltr', label: 'Bottom ➔ Left ➔ Up ➔ Right' },
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
    if (!mode) return;
    this.mode = mode;
    try {
      localStorage.setItem('ambilight_mode', mode);
    } catch (e) {}

    // Immediately toggle active state and ARIA attributes on all buttons
    document.querySelectorAll('#ambilightModeSelect .zone-mode-btn').forEach(btn => {
      const isMatch = btn.dataset.mode === mode;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });

    try {
      this.updateWiringOptions();
    } catch (err) {
      console.warn('updateWiringOptions error:', err);
    }

    try {
      this.renderDivisionControls();
    } catch (err) {
      console.warn('renderDivisionControls error:', err);
    }

    try {
      this.updateVisibilityForMode();
    } catch (err) {
      console.warn('updateVisibilityForMode error:', err);
    }

    try {
      // Reset visual indicators
      ['edgeTop', 'edgeRight', 'edgeBottom', 'edgeLeft'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.background = 'transparent';
      });
      ['colZoneLeft', 'colZoneCenter', 'colZoneRight'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.background = 'transparent';
      });
    } catch (err) {}

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
      const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const isSecure = typeof window !== 'undefined' && (window.isSecureContext || isLocalhost);

      if (!isSecure || !navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
        const targetIp = APP_STATE.ip || defaultTargetIp;
        const localUrl = `http://localhost:8080/?ip=${targetIp}&autostart=movie`;
        showToast('Screen capture requires localhost. Redirecting to http://localhost:8080...', 4000);
        setTimeout(() => {
          const opened = window.open(localUrl, '_blank');
          if (!opened) window.location.href = localUrl;
        }, 500);
        return;
      }
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
      // Initialize WLED for real-time streaming: turn on, solid effect 0, unfreeze
      wled.send({
        on: true,
        bri: APP_STATE.brightness,
        transition: 0,
        seg: { fx: 0, frz: false }
      }, true);
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
      monitor.classList.remove('danger-strobe-active');
    }
    document.getElementById('dangerHudAlert')?.classList.add('hide');
    document.getElementById('cropGuideTop')?.classList.add('hide');
    document.getElementById('cropGuideBottom')?.classList.add('hide');

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

    // Dynamic Letterbox black-bar detection with interactive visual guides
    let startY = 0;
    let endY = sh;
    if (this.letterboxFilter) {
      const sens = this.letterboxSensitivity;
      const topRow = this.sampleCtx.getImageData(0, 0, sw, 1).data;
      let topHasContent = false;
      for (let x = 0; x < topRow.length; x += 16) {
        if (Math.max(topRow[x], topRow[x + 1], topRow[x + 2]) > sens) {
          topHasContent = true;
          break;
        }
      }
      if (!topHasContent) {
        for (let y = 1; y < Math.floor(sh * 0.35); y += 2) {
          const row = this.sampleCtx.getImageData(0, y, sw, 1).data;
          let maxBri = 0;
          for (let x = 0; x < row.length; x += 16) {
            maxBri = Math.max(maxBri, row[x], row[x + 1], row[x + 2]);
          }
          if (maxBri > sens) { startY = y; break; }
        }
      }

      const botRow = this.sampleCtx.getImageData(0, sh - 1, sw, 1).data;
      let botHasContent = false;
      for (let x = 0; x < botRow.length; x += 16) {
        if (Math.max(botRow[x], botRow[x + 1], botRow[x + 2]) > sens) {
          botHasContent = true;
          break;
        }
      }
      if (!botHasContent) {
        for (let y = sh - 2; y > Math.floor(sh * 0.65); y -= 2) {
          const row = this.sampleCtx.getImageData(0, y, sw, 1).data;
          let maxBri = 0;
          for (let x = 0; x < row.length; x += 16) {
            maxBri = Math.max(maxBri, row[x], row[x + 1], row[x + 2]);
          }
          if (maxBri > sens) { endY = y + 1; break; }
        }
      }

      // Update interactive visual crop overlay guides
      const topCropRatio = startY / sh;
      const botCropRatio = (sh - endY) / sh;
      const cropGuideTop = document.getElementById('cropGuideTop');
      const cropGuideBottom = document.getElementById('cropGuideBottom');
      const aspectBadge = document.getElementById('detectedAspectBadge');

      if (topCropRatio > 0.05) {
        if (cropGuideTop) {
          cropGuideTop.classList.remove('hide');
          cropGuideTop.style.height = `${Math.round(topCropRatio * 100)}%`;
        }
      } else {
        cropGuideTop?.classList.add('hide');
      }

      if (botCropRatio > 0.05) {
        if (cropGuideBottom) {
          cropGuideBottom.classList.remove('hide');
          cropGuideBottom.style.height = `${Math.round(botCropRatio * 100)}%`;
        }
      } else {
        cropGuideBottom?.classList.add('hide');
      }

      if (aspectBadge) {
        if (topCropRatio > 0.05 || botCropRatio > 0.05) {
          aspectBadge.textContent = `2.39:1 CinemaScope (${Math.round((1 - topCropRatio - botCropRatio) * 100)}% Picture)`;
          aspectBadge.style.color = '#22d3ee';
          aspectBadge.style.borderColor = 'rgba(6, 182, 212, 0.4)';
        } else {
          aspectBadge.textContent = '16:9 Full Frame';
          aspectBadge.style.color = '#94a3b8';
          aspectBadge.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        }
      }
    } else {
      document.getElementById('cropGuideTop')?.classList.add('hide');
      document.getElementById('cropGuideBottom')?.classList.add('hide');
    }

    const activeHeight = Math.max(10, endY - startY);
    const ledCount = APP_STATE.ledCount || 60;
    const masterBriFactor = APP_STATE.brightness / 255;

    // 2. Gaming Low HP / Danger Strobe Analyzer
    const monitorBox = document.getElementById('screenMonitorBox');
    const dangerHudAlert = document.getElementById('dangerHudAlert');
    const now = performance.now();

    if (this.dangerStrobeEnabled) {
      // Sample perimeter border pixels where gaming damage/blood flashes occur
      const borderSample = this.sampleCtx.getImageData(0, startY, sw, Math.max(3, Math.floor(activeHeight * 0.22))).data;
      let redCount = 0;
      let sampledPixels = 0;

      for (let i = 0; i < borderSample.length; i += 16) {
        const r = borderSample[i];
        const g = borderSample[i + 1];
        const b = borderSample[i + 2];
        sampledPixels++;
        // Strict crimson red criteria: high red, low green/blue, strong ratio to prevent false triggering on warm hues
        if (r > 130 && g < 70 && b < 70) {
          const maxGB = Math.max(g, b) + 1;
          if (r / maxGB >= Math.max(2.0, this.dangerSensitivity)) {
            redCount++;
          }
        }
      }

      if (sampledPixels > 0 && (redCount / sampledPixels) >= 0.22) {
        // Red Danger trigger!
        this.dangerTriggerUntil = now + 900;
      }
    }

    if (now < this.dangerTriggerUntil) {
      // Low HP Alert Strobe Phase
      if (monitorBox) monitorBox.classList.add('danger-strobe-active');
      if (dangerHudAlert) dangerHudAlert.classList.remove('hide');

      const phase = Math.sin((now * 0.001 * this.dangerHz) * Math.PI * 2) > 0;
      const flashR = phase ? 255 : 35;
      const flashG = 0;
      const flashB = phase ? 15 : 4;
      const dangerColor = [flashR, flashG, flashB];

      const ledColors = new Array(ledCount).fill(dangerColor);
      virtualStrip.setMultiLed(ledColors);

      const ambientBg = document.getElementById('ambientBg');
      if (ambientBg) {
        ambientBg.style.background = phase
          ? `radial-gradient(circle at 50% 30%, rgba(255, 0, 20, 0.5) 0%, transparent 70%), linear-gradient(135deg, #1a0508, #05070e)`
          : '';
      }

      this.sendAmbilightPacket({
        transition: 0,
        seg: {
          i: [0, ledCount, dangerColor]
        }
      });
      return;
    } else {
      if (monitorBox) monitorBox.classList.remove('danger-strobe-active');
      if (dangerHudAlert) dangerHudAlert.classList.add('hide');
    }

    // Motion-adaptive smoothing & saturation
    let effectiveSmoothing = this.smoothing;
    let effectiveSaturation = this.saturation;

    if (this.fastEdgeBoost) {
      effectiveSmoothing = Math.min(0.85, this.smoothing * 1.5);
      effectiveSaturation = Math.min(2.2, this.saturation * 1.2);
    }
    this.effectiveSmoothing = effectiveSmoothing;
    this.effectiveSaturation = effectiveSaturation;

    if (this.mode === '3-edges') {
      // 3-side monitor edges (Left • Top • Right, e.g. 3-4-2 or 1-2-1)
      const leftData = this.sampleCtx.getImageData(0, startY, Math.max(2, Math.floor(sw * 0.20)), activeHeight).data;
      const topData = this.sampleCtx.getImageData(0, startY, sw, Math.max(2, Math.floor(activeHeight * 0.20))).data;
      const rightData = this.sampleCtx.getImageData(sw - Math.max(2, Math.floor(sw * 0.20)), startY, Math.max(2, Math.floor(sw * 0.20)), activeHeight).data;

      const rawLeft = this._sampleZone(leftData);
      const rawTop = this._sampleZone(topData);
      const rawRight = this._sampleZone(rightData);

      this.zoneColors.left = this.smoothColor(this.zoneColors.left, rawLeft);
      this.zoneColors.top = this.smoothColor(this.zoneColors.top, rawTop);
      this.zoneColors.right = this.smoothColor(this.zoneColors.right, rawRight);

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

      this.sendAmbilightPacket({
        transition: 0,
        seg: {
          i: [
            0, p1, z0.rgb,
            p1, p2, z1.rgb,
            p2, p3, z2.rgb
          ]
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

      this.zoneColors.colLeft = this.smoothColor(this.zoneColors.colLeft, rawCol1);
      this.zoneColors.colCenter = this.smoothColor(this.zoneColors.colCenter, rawCol2);
      this.zoneColors.colRight = this.smoothColor(this.zoneColors.colRight, rawCol3);

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

      this.sendAmbilightPacket({
        transition: 0,
        seg: {
          i: [
            0, p1, z0.rgb,
            p1, p2, z1.rgb,
            p2, p3, z2.rgb
          ]
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

      this.zoneColors.top = this.smoothColor(this.zoneColors.top, rawTop);
      this.zoneColors.right = this.smoothColor(this.zoneColors.right, rawRight);
      this.zoneColors.bottom = this.smoothColor(this.zoneColors.bottom, rawBottom);
      this.zoneColors.left = this.smoothColor(this.zoneColors.left, rawLeft);

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

      let z0, z1, z2, z3;
      if (this.wiringDirection === 'brtl') {
        // Bottom ➔ Right ➔ Up ➔ Left
        z0 = { name: 'Bottom Edge', rgb: this.zoneColors.bottom, count: cBot };
        z1 = { name: 'Right Edge', rgb: this.zoneColors.right, count: cRight };
        z2 = { name: 'Top Edge', rgb: this.zoneColors.top, count: cTop };
        z3 = { name: 'Left Edge', rgb: this.zoneColors.left, count: cLeft };
      } else if (this.wiringDirection === 'ccw') {
        // Left ➔ Bottom ➔ Right ➔ Top (Counter-Clockwise)
        z0 = { name: 'Left Edge', rgb: this.zoneColors.left, count: cLeft };
        z1 = { name: 'Bottom Edge', rgb: this.zoneColors.bottom, count: cBot };
        z2 = { name: 'Right Edge', rgb: this.zoneColors.right, count: cRight };
        z3 = { name: 'Top Edge', rgb: this.zoneColors.top, count: cTop };
      } else if (this.wiringDirection === 'bltr') {
        // Bottom ➔ Left ➔ Up ➔ Right
        z0 = { name: 'Bottom Edge', rgb: this.zoneColors.bottom, count: cBot };
        z1 = { name: 'Left Edge', rgb: this.zoneColors.left, count: cLeft };
        z2 = { name: 'Top Edge', rgb: this.zoneColors.top, count: cTop };
        z3 = { name: 'Right Edge', rgb: this.zoneColors.right, count: cRight };
      } else if (this.wiringDirection === 'bl_cw') {
        // Bottom-Left ➔ Top ➔ Right ➔ Bottom
        z0 = { name: 'Left Edge', rgb: this.zoneColors.left, count: cLeft };
        z1 = { name: 'Top Edge', rgb: this.zoneColors.top, count: cTop };
        z2 = { name: 'Right Edge', rgb: this.zoneColors.right, count: cRight };
        z3 = { name: 'Bottom Edge', rgb: this.zoneColors.bottom, count: cBot };
      } else {
        // Default cw: Top ➔ Right ➔ Bottom ➔ Left (Clockwise)
        z0 = { name: 'Top Edge', rgb: this.zoneColors.top, count: cTop };
        z1 = { name: 'Right Edge', rgb: this.zoneColors.right, count: cRight };
        z2 = { name: 'Bottom Edge', rgb: this.zoneColors.bottom, count: cBot };
        z3 = { name: 'Left Edge', rgb: this.zoneColors.left, count: cLeft };
      }

      const p1 = 0;
      const p2 = z0.count;
      const p3 = p2 + z1.count;
      const p4 = p3 + z2.count;
      const p5 = ledCount;

      const ledColors = new Array(ledCount);
      for (let i = p1; i < p2; i++) ledColors[i] = [Math.round(z0.rgb[0] * masterBriFactor), Math.round(z0.rgb[1] * masterBriFactor), Math.round(z0.rgb[2] * masterBriFactor)];
      for (let i = p2; i < p3; i++) ledColors[i] = [Math.round(z1.rgb[0] * masterBriFactor), Math.round(z1.rgb[1] * masterBriFactor), Math.round(z1.rgb[2] * masterBriFactor)];
      for (let i = p3; i < p4; i++) ledColors[i] = [Math.round(z2.rgb[0] * masterBriFactor), Math.round(z2.rgb[1] * masterBriFactor), Math.round(z2.rgb[2] * masterBriFactor)];
      for (let i = p4; i < p5; i++) ledColors[i] = [Math.round(z3.rgb[0] * masterBriFactor), Math.round(z3.rgb[1] * masterBriFactor), Math.round(z3.rgb[2] * masterBriFactor)];
      virtualStrip.setMultiLed(ledColors);

      this.updateZoneInspector([
        { name: z0.name, rgb: z0.rgb, leds: z0.count, startIdx: p1, endIdx: p2 },
        { name: z1.name, rgb: z1.rgb, leds: z1.count, startIdx: p2, endIdx: p3 },
        { name: z2.name, rgb: z2.rgb, leds: z2.count, startIdx: p3, endIdx: p4 },
        { name: z3.name, rgb: z3.rgb, leds: z3.count, startIdx: p4, endIdx: p5 }
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

      this.sendAmbilightPacket({
        transition: 0,
        seg: {
          i: [
            p1, p2, z0.rgb,
            p2, p3, z1.rgb,
            p3, p4, z2.rgb,
            p4, p5, z3.rgb
          ]
        }
      });

    } else if (this.mode === '2-sides') {
      // 4. 2 LIGHTBARS / SIDE PILLARS (Left & Right)
      const leftData = this.sampleCtx.getImageData(0, startY, Math.max(2, Math.floor(sw * 0.25)), activeHeight).data;
      const rightData = this.sampleCtx.getImageData(sw - Math.max(2, Math.floor(sw * 0.25)), startY, Math.max(2, Math.floor(sw * 0.25)), activeHeight).data;

      const rawLeft = this._sampleZone(leftData);
      const rawRight = this._sampleZone(rightData);

      this.zoneColors.left = this.smoothColor(this.zoneColors.left, rawLeft);
      this.zoneColors.right = this.smoothColor(this.zoneColors.right, rawRight);

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

      this.sendAmbilightPacket({
        transition: 0,
        seg: {
          i: [
            p1, p2, this.zoneColors.left,
            p2, p3, this.zoneColors.right
          ]
        }
      });

    } else if (this.mode === 'dominant') {
      // Vibrant continuous chroma-weighted dominant scene mode
      const imgData = this.sampleCtx.getImageData(0, startY, sw, activeHeight).data;
      let rSum = 0, gSum = 0, bSum = 0, totalW = 0;
      let fallbackR = 0, fallbackG = 0, fallbackB = 0, validPixelCount = 0;

      for (let i = 0; i < imgData.length; i += 16) {
        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
        if (r < 14 && g < 14 && b < 14) continue; // ignore letterbox black

        fallbackR += r; fallbackG += g; fallbackB += b; validPixelCount++;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        // Smooth continuous chroma weight avoids discrete bucket hopping
        const weight = 1.0 + Math.pow(chroma / 255, 1.5) * 3.5;

        rSum += r * weight;
        gSum += g * weight;
        bSum += b * weight;
        totalW += weight;
      }

      let targetR = totalW > 0 ? rSum / totalW : (validPixelCount > 0 ? fallbackR / validPixelCount : 0);
      let targetG = totalW > 0 ? gSum / totalW : (validPixelCount > 0 ? fallbackG / validPixelCount : 0);
      let targetB = totalW > 0 ? bSum / totalW : (validPixelCount > 0 ? fallbackB / validPixelCount : 0);

      const satDom = this.effectiveSaturation || this.saturation;
      if (satDom > 1.0 && (targetR > 0 || targetG > 0 || targetB > 0)) {
        [targetR, targetG, targetB] = boostSaturation(targetR, targetG, targetB, satDom);
      }
      targetR = Math.max(this.blackFloor, Math.min(255, Math.round(targetR)));
      targetG = Math.max(this.blackFloor, Math.min(255, Math.round(targetG)));
      targetB = Math.max(this.blackFloor, Math.min(255, Math.round(targetB)));

      this.currentRGB = this.smoothColor(this.currentRGB, [targetR, targetG, targetB]);

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

      this.sendAmbilightPacket({
        transition: 0,
        seg: {
          i: [0, ledCount, [finalR, finalG, finalB]]
        }
      });

    } else {
      // Smart chroma-weighted average mode
      const imgData = this.sampleCtx.getImageData(0, startY, sw, activeHeight).data;
      let rSum = 0, gSum = 0, bSum = 0, totalW = 0;

      for (let i = 0; i < imgData.length; i += 16) {
        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
        if (r < 14 && g < 14 && b < 14) continue;

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

      const satAvg = this.effectiveSaturation || this.saturation;
      if (satAvg > 1.0 && (targetR > 0 || targetG > 0 || targetB > 0)) {
        [targetR, targetG, targetB] = boostSaturation(targetR, targetG, targetB, satAvg);
      }
      targetR = Math.max(this.blackFloor, Math.min(255, Math.round(targetR)));
      targetG = Math.max(this.blackFloor, Math.min(255, Math.round(targetG)));
      targetB = Math.max(this.blackFloor, Math.min(255, Math.round(targetB)));

      this.currentRGB = this.smoothColor(this.currentRGB, [targetR, targetG, targetB]);

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

      this.sendAmbilightPacket({
        transition: 0,
        seg: {
          i: [0, ledCount, [finalR, finalG, finalB]]
        }
      });
    }

    this.sampleCounter++;
    if (now - this.lastSampleRateTime >= 1000) {
      const sampleText = document.getElementById('sampleRateText');
      if (sampleText) sampleText.textContent = `${this.sampleCounter} updates/sec`;
      this.sampleCounter = 0;
      this.lastSampleRateTime = now;
    }
  }

  _sampleZone(data) {
    let rSum = 0, gSum = 0, bSum = 0, totalWeight = 0;
    let fallbackR = 0, fallbackG = 0, fallbackB = 0, count = 0;

    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r < 14 && g < 14 && b < 14) continue; // letterbox black

      fallbackR += r; fallbackG += g; fallbackB += b; count++;

      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const chroma = max - min;
      // Smooth continuous chroma weighting: vibrant colors smoothly dominate without bucket oscillation
      const weight = 1.0 + (chroma / 255) * 2.5;

      rSum += r * weight;
      gSum += g * weight;
      bSum += b * weight;
      totalWeight += weight;
    }

    let targetR = totalWeight > 0 ? rSum / totalWeight : (count > 0 ? fallbackR / count : 0);
    let targetG = totalWeight > 0 ? gSum / totalWeight : (count > 0 ? fallbackG / count : 0);
    let targetB = totalWeight > 0 ? bSum / totalWeight : (count > 0 ? fallbackB / count : 0);

    const sat = this.effectiveSaturation || this.saturation;
    if (sat > 1.0 && (targetR > 0 || targetG > 0 || targetB > 0)) {
      [targetR, targetG, targetB] = boostSaturation(targetR, targetG, targetB, sat);
    }

    return [
      Math.max(this.blackFloor, Math.min(255, Math.round(targetR))),
      Math.max(this.blackFloor, Math.min(255, Math.round(targetG))),
      Math.max(this.blackFloor, Math.min(255, Math.round(targetB)))
    ];
  }
}

const movieSync = new MovieSyncEngine();

