# 📖 Chaos ESP32 Light — Complete User Manual & Operation Guide

Welcome to the comprehensive user manual for **Chaos ESP32 Light** (Powered by WLED). This guide walks you through every feature of the web studio, from initial Wi-Fi setup to advanced cinema calibration, audio tuning, and hardware preset creation.

---

## 📑 Table of Contents

1. [Initial Connection & Setup](#1-initial-connection--setup)
2. [Lighting Studio (Manual Controls)](#2-lighting-studio-manual-controls)
3. [Movie Sync (Cinema Ambilight)](#3-movie-sync-cinema-ambilight)
   - [Layout Modes](#layout-modes)
   - [Section Division & Ratios (3-4-2 Setup)](#section-division--ratios-3-4-2-setup)
   - [Wiring Directions](#wiring-directions)
   - [Calibration Controls](#calibration-controls)
4. [Music Reactive Sync](#4-music-reactive-sync)
   - [Audio Sources](#audio-sources)
   - [Visualizer Algorithms](#visualizer-algorithms)
   - [Color Palettes](#color-palettes)
   - [Sensitivity & Beat Detection](#sensitivity--beat-detection)
5. [Hardware Preset Studio & Quick Scenes](#5-hardware-preset-studio--quick-scenes)
6. [Multi-Theme Engine](#6-multi-theme-engine)
7. [Multi-Device Hub & UDP Sync](#7-multi-device-hub--udp-sync)
8. [Settings & Network Diagnostics](#8-settings--network-diagnostics)
9. [Acknowledgments & Credits](#9-acknowledgments--credits)

---

## 1. Initial Connection & Setup

### Connecting to Your ESP32
1. Power on your ESP32 controller.
2. If your ESP32 is running in Access Point (AP) mode, connect your computer to:
   - **SSID**: `pk` (or `WLED-AP`)
   - **Password**: `00000000` (or `wled1234`)
3. Open your browser and navigate to `http://10.109.101.60/` (or your ESP32's assigned local IP).
4. Look at the top navigation bar:
   - **Green status dot**: WebSocket connected and streaming telemetry.
   - **Ping latency**: Real-time round-trip latency to your ESP32 (typically 5–25ms on Wi-Fi).
   - **Live Hardware Mirror**: 60-LED animated virtual strip reflecting actual hardware state at 60 FPS.

---

## 2. Lighting Studio (Manual Controls)

The **Lighting Studio** tab provides direct, high-precision manual control over your LEDs:

- **Master Brightness**: Adjust overall room intensity from 0% to 100%.
- **Color Wheel & Slots**:
  - Interactive HSL color wheel for selecting custom hues.
  - Three active color slots (**Primary**, **Secondary**, **Tertiary**) utilized by multi-color WLED effects.
  - RGB Sliders & Hex Input with instant 1-click clipboard paste.
  - Quick Swatch capsules for instant vibrant presets (Cyberpunk Pink, Neon Cyan, Emerald, Amber, Violet).
- **Speed & Intensity**: Real-time sliders adjusting effect velocity and animation density.
- **Searchable Effects & Palettes**:
  - Filter across 100+ native WLED effects (Breathe, Rainbow, Chase, Fire, etc.) with instant live search.
  - Select from 50+ built-in color gradients.

---

## 3. Movie Sync (Cinema Ambilight)

The Cinema Ambilight Engine synchronizes your LED perimeter with whatever is playing on your computer screen at 60 FPS.

### Starting Screen Capture
1. Click **Start Screen Capture**.
2. Select your target display:
   - **Entire Screen**: Best for full-screen gaming, VLC, or desktop media players.
   - **Window**: Sync with a specific video player or browser window.
   - **Chrome Tab**: Sync directly with YouTube, Netflix, or Prime Video with tab audio capture.
3. The **Live Ambilight Monitor** preview box will illuminate with real-time zone detection overlays.

### Layout Modes
Click any layout button in **Monitor Zone Layout & Division**:
- **3-Side Monitor (`3-edges`)**: Left, Top, Right edges. Tailored specifically for computer monitors with desk stands.
- **3 Columns (`3-cols`)**: Divides the screen into Left, Center, and Right vertical columns. Great for wide viewing angles and ambient room fill.
- **4-Edge Frame (`4-edges`)**: Full perimeter capture for wall-mounted TVs and frames.
- **2 Lightbars (`2-sides`)**: Left and Right pillars for dual light towers or monitor side-lamps.
- **Vibrant Dominant (`dominant`)**: Isolates the most saturated foreground scene color across the entire screen.
- **Screen Average (`average`)**: Weighted mean color calculation for gentle ambient lighting.

### Section Division & Ratios (3-4-2 Setup)
For monitors where edges have different lengths (or asymmetric cable runs), you can customize exact LED counts:
1. Under **Section Division & LED Distribution**, review the quick preset chips:
   - **`3-4-2 (Custom 3-Zone)`**: Allocates 3 parts Left, 4 parts Top, 2 parts Right (e.g. 20 / 27 / 13 LEDs on a 60-LED strip).
   - **`1-2-1 (16:9 Standard)`**: 25% Left, 50% Top, 25% Right.
   - **`1-1-1 (Equal Sides)`**: Equal 33% distribution.
   - **`1-3-1 (21:9 Ultrawide)`**: 20% Left, 60% Top, 20% Right.
2. Or use the **Section LED Sliders** to fine-tune individual edge allocations by exact LED count.

### Wiring Directions
Match the software data sequence with your physical strip installation:
- **Bottom-Left ➔ Top ➔ Right (Clockwise)**: Data enters at bottom-left corner, travels up left edge, across top, down right edge.
- **Bottom-Right ➔ Top ➔ Left (Counter-Clockwise)**: Data enters at bottom-right corner.
- **Left ➔ Top ➔ Right**: Direct horizontal sweep.

### Calibration Controls
- **Response Smoothing**: From *Ultra Soft* (0.10) for peaceful cinema viewing to *Instant Gaming* (0.90) for high-octane FPS response.
- **Saturation Boost**: From *Natural* (1.0x) up to *Hyper-Saturated* (2.0x) to give scenes rich neon punch.
- **Black Level Floor**: Sets a minimum ambient glow during pitch-black movie scenes so you are never left in complete darkness.
- **Auto Letterbox Detection**: Automatically detects black cinematic bars on 2.39:1 widescreen films and shifts sampling inward.

---

## 4. Music Reactive Sync

Transforms your LED strip into a high-speed audio visualizer with 256-point FFT frequency decomposition.

### Audio Sources
- **Microphone / Headset**: Reacts to ambient room sound, instruments, or your voice.
- **System / Tab Audio**: Direct digital loopback from Spotify, YouTube, or PC game audio.
- **Demo Synthwave**: Built-in 128 BPM electronic synthesizer groove for testing without microphone permissions.

### Visualizer Algorithms
Select from 12 distinct audio reactive modes:
1. **Full Spectrum Equalizer**: Traditional multi-band graphic EQ across the strip.
2. **Symmetrical Center Mirror**: Frequencies explode outward from the center to both edges.
3. **Thermal Heatmap**: Audio energy maps to temperature-based thermal color bands.
4. **Frequency Shockwave**: High-energy transients send light pulses traveling down the strip.
5. **Kinetic Pulse**: Sub-bass kicks compress and expand the illuminated zone.
6. **Twinkling Starfield**: Treble frequencies trigger randomized glistening stars.
7. **BPM Rhythm Comet**: A streaming light comet orbiting in sync with detected tempo.
8. **Center Pulse**: Dynamic core glow responding to bass kicks.
9. **VU Meter**: Classic studio volume unit level meter with green-to-red headroom.
10. **Beat Strobe**: High-impact instantaneous strobe flashes on heavy drops.
11. **Frequency Rainbow**: Color spectrum modulated by dominant audio pitch.
12. **Chill Ambient Flow**: Relaxing slow-moving gradient modulated by ambient room sound.

### Color Palettes
Choose from 14 curated themes including **Cyberpunk**, **Synthwave**, **Matrix**, **Fire & Magma**, **Aurora Borealis**, **Ocean Ice**, and **Vaporwave**.

---

## 5. Hardware Preset Studio & Quick Scenes

Save and manage hardware presets stored permanently on your ESP32's non-volatile memory:

### Creating a New Preset
1. Click **+ New Custom Preset** in the **Presets & Scenes** tab.
2. Enter a preset name (e.g. `🌅 Sunset Chill`, `⚡ Cyber Storm`).
3. Pick a custom emoji avatar from the quick emoji picker.
4. Choose an available hardware slot (#1 to #16).
5. Check whether to snapshot current brightness and segment configurations.
6. Click **Save to ESP32**.

### Quick Scenes Pinning
Pin your favorite presets to the **Quick Scenes** bar at the top of the tab for instant 1-click room mood transitions.

---

## 6. Multi-Theme Engine

Customize the look and feel of your web portal with 6 bespoke visual modes:
- **Aurora (Default)**: Deep midnight indigo with cyan and magenta ambient atmospheric glows.
- **OLED Void Black**: Pure `#000000` pitch black with sky-blue accents, maximizing contrast and saving battery on OLED laptops.
- **Synthwave 80s**: Retro neon purple and hot pink aesthetic with warm amber glows.
- **Emerald Matrix**: Deep cybernetic terminal green inspired by sci-fi console displays.
- **Solar Ember**: Rich magma red and scorched orange warmth for evening ambiance.
- **Nordic Frost**: Crisp arctic blue and glacier tones for clean minimalist setups.

Switch themes instantly via the **Theme Switcher** in the top navigation bar or from the **Settings & Device ➔ Portal Theme Studio**.

---

## 7. Multi-Device Hub & UDP Sync

Synchronize multiple WLED devices across your local network:
- **UDP Broadcast Sync**: Enable **Sync Broadcast (UDP)** to broadcast your active Ambilight or Music reactive frames to all other WLED strips on UDP port 21324.
- **Network Scanner**: Automatically discovers nearby WLED nodes on your Wi-Fi subnet.
- **Active Controller Switcher**: Seamlessly switch control between multiple ESP32 devices without reloading the page.

---

## 8. Settings & Network Diagnostics

- **Wi-Fi Credentials**: Change SSID and Wi-Fi password and save them directly to ESP32 EEPROM.
- **Hardware Diagnostics**: View live firmware version, Wi-Fi RSSI signal strength, estimated current draw (mA), and refresh rates (FPS).
- **LED Count Configuration**: Change total strip length dynamically.

---

## 9. Acknowledgments & Credits

Chaos ESP32 Light is powered by the open-source **[WLED Project](https://github.com/Aircoookie/WLED)** created by Christian Schwinne (Aircoookie).
All low-level hardware communication, FastLED integration, LittleFS web server, and Wi-Fi drivers rely on the rock-solid WLED firmware.
- Official Repository: [github.com/Aircoookie/WLED](https://github.com/Aircoookie/WLED)
- Documentation: [kno.wled.ge](https://kno.wled.ge/)
