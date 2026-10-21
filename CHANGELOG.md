# 📝 Changelog — Chaos ESP32 Light

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.2] - 2026-10-21

### Fixed
- **Theme Dropdown Stacking & Readability**: Fixed theme selector menu rendering underneath navigation tabs and content cards. Established dedicated stacking contexts (`.glass-header` z-index: 1000, dropdown z-index: 99999) and introduced bespoke high-contrast opaque frosted backgrounds (`--bg-dropdown: 0.97 - 0.98` opacity) with deep elevation shadows, completely eliminating bleed-through text interference.
- **Color Flickering & Bin Oscillations**: Replaced discrete 12-bucket and 16-bucket hue quantization in `_sampleZone` and `dominant` modes with continuous chroma-weighted integration (`weight = 1.0 + (chroma / 255) * 2.5`). This stops frame-to-frame color bouncing between hue bins during scenes with balanced colors.
- **Smooth Transition Dynamics**: Refactored smoothing into a stable Exponential Moving Average (EMA) and an instant scene-cut snap for large transitions ($\Delta \ge 100$), removing non-linear speed spikes and erratic motion velocity jumps.
- **ESP32 Streaming Protocol Streamlining**: Stripped redundant keys (`fx: 0`, `bri`, `on`, `v: false`, `frz: true`) from 30+ FPS stream packets in `MovieSyncEngine` and `MusicSyncEngine` down to minimal `{ transition: 0, seg: { i: [...] } }`. Added one-time solid mode initialization packets on stream start, preventing WLED effect re-initialization and brightness flicker.

### Cleaned
- **Jargon Code & UI Cleanup**: Replaced tactical jargon ("Tactical", "Tactical Pulse", "Tactical Danger Strobe") with clean intuitive terms ("Alert", "Pulse Rate", "Low HP Alert Strobe") across `index.html` and `main.js`. Removed unused/dead variables (`lastAmbilightPayload`).

---

## [1.3.1] - 2026-10-21

### Fixed
- **Severe Flickering Root Cause**: Fixed Tactical Danger Strobe defaulting to active due to loose `localStorage.getItem('ambilight_danger_strobe') !== 'false'` check when unset. Enforced strict opt-in check (`=== 'true'`), raised red detection thresholds (`r > 130`, `g < 70`, `b < 70`, `ratio >= 2.0`) to avoid false-triggering on warm indoor lighting, skin tones, or red UI elements.
- **Profile Layout Responsive Clipping**: Fixed CSS grid on `.quick-profiles-grid` with `grid-template-columns: repeat(4, minmax(0, 1fr))` and `box-sizing: border-box`, ensuring all 4 gaming/cinema profile chips fit cleanly without clipping on mobile and desktop viewports.

### Added
- **Smart Anti-Flicker & Noise Gate Engine**:
  - **Deadband Noise Gate**: Swallows micro-fluctuations and video compression noise when color delta $\Delta \le \text{threshold}$ (default 6 $\Delta$), keeping steady shots rock-solid with zero nervous blinking.
  - **Velocity-Aware Instant Scene-Cut Snap**: Accelerates alpha to 0.95 whenever scene cuts, explosions, or flashbangs occur ($\Delta \ge 85$), eliminating transition latency ("too much late").
  - **Interactive Filter Card**: Added dedicated UI with toggle, live noise gate slider (2 to 16 $\Delta$), and Instant Scene-Cut Snap toggle.
- **ESP32 Network Pacing & Deduplication**: Throttled WebSocket packets to ~33 FPS (28ms minimum transmission interval) with serialized payload deduplication, preventing ESP32 TCP buffer exhaustion and dropped packet stuttering.

---

## [1.3.0] - 2026-10-21

### Fixed
- **Zone Mode Button Selection**: Resolved issue where clicking **Monitor Zone Layout & Division** buttons (`3 Columns`, `4-Edge Frame`, etc.) did not toggle the active state due to inner child spans intercepting pointer events. Added `.zone-mode-btn * { pointer-events: none; }`.
- **Event Delegation**: Added container event delegation on `#ambilightModeSelect` in both `MovieSyncEngine.init()` and `initEventListeners()`.
- **LocalStorage Hardening**: Added `safeParseRatio()` helper to safeguard `MovieSyncEngine` against malformed or corrupted localStorage JSON.
- **Bootstrap Initialization**: Added resilient `bootApp()` bootstrap with `document.readyState` detection, ensuring initialization executes reliably across all browsers.

---

## [1.2.0] - 2026-10-20

### Added
- **Multi-Theme Engine**: Introduced 6 bespoke colorways tailored for various ambient environments:
  - **Aurora**: Midnight indigo with radiant cyan and magenta aurora glows.
  - **OLED Void Black**: Pure `#000000` pitch black with sky-blue accents.
  - **Synthwave 80s**: Retro neon purple and hot pink aesthetic.
  - **Emerald Matrix**: Deep cybernetic green terminal aesthetics.
  - **Solar Ember**: Rich magma red and scorched orange warmth.
  - **Nordic Frost**: Crisp arctic blue and glacier tones.
- **Header Theme Dropdown**: Added quick-access theme selector in top navigation bar.
- **Portal Theme Studio**: Added interactive theme showcase cards in Settings tab with live palette swatches.

---

## [1.1.0] - 2026-10-20

### Added
- **Hardware Preset Studio**: Full preset management studio reading and writing directly to ESP32 `/presets.json` and EEPROM.
- **Emoji Avatar Picker**: Added quick emoji chips to tag presets (🌅, ⚡, 🌆, 🌌, 🔥, 💎, 🎮, 🌿, etc.).
- **Quick Scenes Pinning**: Instant 1-click room mood transitions pinned directly to the header bar.
- **Preset Actions**: Support for applying, overwriting, renaming, and deleting hardware presets.

---

## [1.0.0] - 2026-10-20

### Added
- **Cinema Ambilight Engine (60 FPS)**:
  - 3-Side Monitor layout tailored for computer monitors with desk stands.
  - Section Division with custom ratio tuning (default `3-4-2`, `1-2-1`, `1-1-1`, `1-3-1`, etc.).
  - Dynamic Letterbox detection for widescreen 2.39:1 films.
  - 16-bucket HSV Dominant Chroma extraction for rich scene color pop.
  - Sub-15ms WebSocket range packet streaming (`seg.i`).
- **Music Reactive FFT Visualizer**:
  - Web Audio API 256-point FFT frequency analyzer.
  - 12 dynamic visualizer modes (Full Spectrum, Symmetrical Mirror, Thermal Heatmap, Frequency Shockwave, etc.).
  - 14 curated color themes (Cyberpunk, Synthwave, Fire, Matrix, Aurora, etc.).
  - Beat transient detection with dynamic noise gates.
- **Multi-Device Hub & UDP Sync**:
  - Local subnet scanner for discovering WLED nodes.
  - UDP port 21324 broadcast synchronization.
- **Zero-Dependency LittleFS Bundler**:
  - `inline_bundle.py` single-file compilation producing standalone `dist/index.htm`.
- **Glassmorphic UI**:
  - Custom design system using Outfit typography and modern CSS tokens.
