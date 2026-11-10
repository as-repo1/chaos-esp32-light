// ====================================================================
// Hardware LED Calibration & Color Order Studio
// ====================================================================
const colorCalibrationStudio = {
  currentOrder: 'GRB',
  calibG: 195,

  init() {
    this.bindEvents();
    this.fetchSettings();
  },

  async fetchSettings() {
    try {
      const res = await fetch(`http://${APP_STATE.ip}/status`, { signal: AbortSignal.timeout(2500) });
      const data = await res.json();
      if (data.order) {
        this.currentOrder = data.order.toUpperCase();
        this.updateOrderUI(this.currentOrder);
      }
      if (data.calib_g !== undefined) {
        this.calibG = data.calib_g;
        this.updateCalibGUI(this.calibG);
      }
    } catch (e) {
      console.warn('Could not fetch hardware calibration status:', e);
    }
  },

  updateOrderUI(order) {
    this.currentOrder = order;
    document.querySelectorAll('#colorOrderSelector .order-pill-btn').forEach(btn => {
      if (btn.dataset.order === order) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  updateCalibGUI(val) {
    this.calibG = val;
    const slider = document.getElementById('sliderCalibG');
    const label = document.getElementById('calibGValueText');
    if (slider) slider.value = val;
    if (label) {
      const pct = Math.round((val / 255) * 100);
      if (val >= 250) {
        label.textContent = `${pct}% (Raw 1:1 Unfiltered)`;
      } else if (val <= 165) {
        label.textContent = `${pct}% (Warm Candle 3200K)`;
      } else {
        label.textContent = `${pct}% (Anti-Green SMD5050)`;
      }
    }

    document.querySelectorAll('.wb-presets-row button').forEach(btn => {
      const s = parseInt(btn.dataset.scale, 10);
      if (Math.abs(s - val) <= 5) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  bindEvents() {
    // 1. Color Order Buttons
    document.querySelectorAll('#colorOrderSelector .order-pill-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ord = btn.dataset.order;
        this.updateOrderUI(ord);
        try {
          await fetch(`http://${APP_STATE.ip}/set?order=${ord}`);
          showToast(`Color Order set to ${ord}`);
        } catch (e) {
          showToast(`Failed to set color order: ${e.message}`, 2500);
        }
      });
    });

    // 2. Hardware Test Buttons
    const testButtons = [
      { id: 'btnTestRed', r: 255, g: 0, b: 0, name: 'Red' },
      { id: 'btnTestGreen', r: 0, g: 255, b: 0, name: 'Green' },
      { id: 'btnTestBlue', r: 0, g: 0, b: 255, name: 'Blue' },
      { id: 'btnTestWhite', r: 255, g: 255, b: 255, name: 'White' }
    ];

    testButtons.forEach(t => {
      document.getElementById(t.id)?.addEventListener('click', async () => {
        try {
          await fetch(`http://${APP_STATE.ip}/set?r=${t.r}&g=${t.g}&b=${t.b}&fx=0`);
          APP_STATE.power = true;
          updatePowerUI(true);
          showToast(`Testing ${t.name}: LED strip should be ${t.name}!`);
        } catch (e) {
          showToast(`Test error: ${e.message}`);
        }
      });
    });

    // 3. Green Balance Slider
    const sliderG = document.getElementById('sliderCalibG');
    if (sliderG) {
      sliderG.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.updateCalibGUI(val);
      });
      sliderG.addEventListener('change', async (e) => {
        const val = parseInt(e.target.value, 10);
        try {
          await fetch(`http://${APP_STATE.ip}/set?calib_g=${val}`);
          showToast(`Green Balance: ${Math.round((val / 255) * 100)}%`);
        } catch (e) {
          showToast(`Calibration error: ${e.message}`);
        }
      });
    }

    // 4. White Balance Presets
    document.querySelectorAll('.wb-presets-row button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scale = parseInt(btn.dataset.scale, 10);
        this.updateCalibGUI(scale);
        try {
          await fetch(`http://${APP_STATE.ip}/set?calib_g=${scale}`);
          showToast(`Anti-Green Filter: ${btn.textContent.trim()}`);
        } catch (e) {
          showToast(`Preset error: ${e.message}`);
        }
      });
    });
  }
};

