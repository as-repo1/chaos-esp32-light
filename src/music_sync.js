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
    this.lastMusicSendTime = 0;
    this.lastMusicPayload = '';

    this.specCanvas = null;
    this.specCtx = null;
    this.waveCanvas = null;
    this.waveCtx = null;
  }

  sendMusicPacket(payload) {
    const now = performance.now();
    // Network pacing: ~30 packets/sec max (33ms throttle) to keep stream smooth & stable
    if (now - this.lastMusicSendTime < 33) {
      return;
    }

    this.lastMusicSendTime = now;
    payload.isStream = true;
    wled.send(payload);
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
      const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const isSecure = typeof window !== 'undefined' && (window.isSecureContext || isLocalhost);

      if ((this.audioSourceType === 'mic' || this.audioSourceType === 'system') && (!isSecure || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function')) {
        const targetIp = APP_STATE.ip || defaultTargetIp;
        const localUrl = `http://localhost:8080/?ip=${targetIp}&autostart=music`;
        showToast('Microphone/System audio requires localhost. Redirecting to http://localhost:8080...', 4000);
        setTimeout(() => {
          const opened = window.open(localUrl, '_blank');
          if (!opened) window.location.href = localUrl;
        }, 500);
        return;
      }
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
      // Initialize WLED for real-time streaming: turn on, solid effect 0, unfreeze
      wled.send({
        on: true,
        bri: APP_STATE.brightness,
        transition: 0,
        seg: { fx: 0, frz: false }
      }, true);
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ...ledColors] }
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
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ledCount, [r, g, b]] }
      });

    } else if (this.mode === 'chillFlow') {
      // 6. Chill Ambient Breathe
      const energy = (bass * 0.4 + mid * 0.4 + treble * 0.2) / 255;
      const bri = Math.max(5, Math.round(energy * APP_STATE.brightness));
      const [r, g, b] = samplePalette(this.paletteName, Math.min(1.0, energy * 1.5));

      virtualStrip.setUniformColor(r, g, b);
      this.sendMusicPacket({
        transition: 0,
        seg: { i: [0, ledCount, [r, g, b]] }
      });
    }
  }
}

const musicSync = new MusicSyncEngine();

