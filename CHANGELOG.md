# 📝 Changelog — Chaos Lights

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
