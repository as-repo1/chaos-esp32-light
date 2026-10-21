# ⚡ Chaos ESP32 Light — Smart Cinema Ambilight & Music Reactive Studio

<div align="center">

![ESP32](https://img.shields.io/badge/Platform-ESP32-E7352C?style=for-the-badge&logo=espressif&logoColor=white)
![WLED](https://img.shields.io/badge/Firmware-WLED%20v0.14+-007ACC?style=for-the-badge)
![Screen Sync](https://img.shields.io/badge/Screen-Smart%20Anti--Flicker-6366F1?style=for-the-badge)
![Web Audio](https://img.shields.io/badge/Audio-256%20FFT%20Spectrum-10B981?style=for-the-badge)
![Bundle](https://img.shields.io/badge/LittleFS-Standalone%20Single--File-EC4899?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge)

<p align="center">
  <strong>Transform your room into an intelligent cinema and music reactive stage.</strong><br>
  Sync your WS2812B / WS2811 / SK6812 LEDs in real time with movies, gameplay, and music with sub-15ms WebSocket responsiveness — running as a single, offline LittleFS web hub on your ESP32.
</p>

<p align="center">
  <a href="#-quickstart-in-60-seconds"><strong>⚡ Quick Start</strong></a> •
  <a href="#-the-visual-tour"><strong>📸 Feature Tour</strong></a> •
  <a href="MANUAL.md"><strong>📖 User Manual</strong></a> •
  <a href="HARDWARE.md"><strong>🔌 Hardware Guide</strong></a> •
  <a href="ARCHITECTURE.md"><strong>🏛️ Architecture</strong></a> •
  <a href="CHANGELOG.md"><strong>📝 Changelog</strong></a>
</p>

---

<img src="docs/screenshots/hero_dashboard.png" alt="Chaos ESP32 Light Studio Dashboard" width="100%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

</div>

---

## 🌟 Why You'll Love It

* 🎬 **Cinema & Gaming Ambilight**: Turn any desktop monitor or TV into an immersive screen-sync display.
* 🛡️ **Zero-Jitter Anti-Flicker Engine**: Swallows film-grain jitter on steady scenes so your lights never twitch nervously.
* ⚡ **Instant Scene-Cut Snap**: Dynamically accelerates transitions to 0 ms on explosions and cuts — no trailing delay.
* 🎵 **Microphone-Free Audio Reactivity**: Uses your browser's Web Audio API for real-time 256-band FFT spectrum lighting — no extra sound hardware or soldering required!
* 🎨 **6 Aesthetic Themes**: Switch between Synthwave 80s, OLED Void Black, Aurora, Emerald Matrix, Solar Ember, and Nordic Frost.
* 📦 **Zero-Config LittleFS Bundle**: One tiny compiled file (`index.htm`, ~244 KB) stored directly on the ESP32. 100% offline, zero cloud or CDN dependencies!

---

## 📸 The Visual Tour

### 1. 🎬 Cinema Ambilight & Gaming Studio
Stream movies from Netflix, YouTube, or PC games directly to your LED strip with custom zone splits and zero flicker.

<div align="center">
  <img src="docs/screenshots/cinema_ambilight.png" alt="Cinema Ambilight Studio" width="100%" style="border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);" />
</div>

* 🛡️ **Smart Anti-Flicker Deadband**: A noise gate eliminates micro-fluctuations from video compression and film grain.
* ⚡ **Instant Scene-Cut Snapping**: Instantly changes colors on scene transitions so lighting is never "too late".
* 📐 **Custom Monitor Zones & Division**: Pre-tuned for 3-side monitors (`3-4-2`, `1-2-1`), ultrawide displays, or full 4-side frames.
* 🍿 **Dynamic Letterbox Crop**: Automatically ignores 21:9 black cinematic bars so edge colors remain accurate.
* 🕹️ **One-Touch Calibration Profiles**: Instant 1-click profiles for Cinema 21:9, Fast FPS Esports, Cyberpunk Neon, and Horror.

---

### 2. 🎵 Music Reactive FFT Spectrum Studio
Turn any track from Spotify, YouTube, or your microphone into a living frequency visualizer.

<div align="center">
  <img src="docs/screenshots/music_reactive.png" alt="Music Reactive Studio" width="100%" style="border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);" />
</div>

* 🎙️ **Zero Extra Hardware**: No microphone modules (INMP441) or soldering needed — audio is analyzed directly in Chrome/Edge.
* 🎛️ **12 Dynamic Reactive Modes**: Full 60-LED Equalizer, Symmetrical Dual EQ, Bass Explosions, Heatmaps, and Chill Flow.
* 🌈 **14 Curated Color Themes**: Cyberpunk, Classic VU, Magma Fire, Synthwave Neon, Blood Moon, and more.
* 🥁 **Beat Transient Peak Detection**: Tracks kick and snare energy peaks with automatic noise floor thresholding.

---

### 3. 💾 Hardware Presets & Atmosphere Scenes
Control and personalize your room's mood in one tap.

<div align="center">
  <img src="docs/screenshots/presets_scenes.png" alt="Hardware Presets and Atmospheric Quick Scenes" width="100%" style="border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);" />
</div>

* 🌅 **Quick Atmospheric Scenes**: Sunset Glow, Cyberpunk Neon, Campfire Ember, Deep Ocean, and Studio Daylight.
* 🏷️ **Emoji Tagging**: Give custom presets cute avatar tags (🌅, ⚡, 🌆, 🌌, 🔥, 💎, 🎮, 🌿) for rapid visual scanning.
* 📌 **Pin to Header**: Keep your favorite scenes right on the top navigation bar for 1-click room transitions.

---

## ⚡ Quickstart in 60 Seconds

You don't need Node.js or any compilation tools installed! The pre-built bundle is ready to flash directly from `dist/index.htm`.

### Method 1: Instant Terminal Upload (Recommended)
Make sure your computer is connected to the same Wi-Fi as your ESP32, then run:

```bash
curl -F "data=@dist/index.htm;filename=/index.htm" http://<YOUR_ESP32_IP>/upload
```
*(Example: `curl -F "data=@dist/index.htm;filename=/index.htm" http://10.109.101.60/upload`)*

Open **`http://<YOUR_ESP32_IP>/`** in your browser and you're good to go! 🎉

---

### Method 2: Web Browser GUI Upload
1. Open `http://<YOUR_ESP32_IP>/edit` in Chrome or Edge.
2. Under **File Upload**, select `dist/index.htm`.
3. Set the target path to `/index.htm` and click **Upload**.
4. Refresh `http://<YOUR_ESP32_IP>/`.

---

## 🔍 Deep Dive & Technical Specs

<details>
<summary><strong>🔌 Hardware Bill of Materials (BOM) & Wiring Schematic</strong></summary>
<br>

### Recommended Hardware
* **Microcontroller**: ESP32 DevKit V1 (30-pin or 38-pin)
* **LED Strip**: WS2812B, WS2811, or SK6812 (60 LEDs/meter recommended)
* **Power Supply**: 5V DC (3A–10A depending on LED count)
* **Level Shifter**: 74AHCT125 or SN74HCT245 (converts ESP32 3.3V logic to 5V data)
* **Capacitor & Resistor**: 1000 µF electrolytic capacitor across 5V/GND, 330Ω–470Ω resistor on data line

### Circuit Schematic
```text
          +-------------------+
          |  5V 10A DC Power  |
          +---+-----------+---+
              |           |
              | +5V       | GND
              |           |
    +---------+-----------+-------------------------+
    |         |           |                         |
    |         |           | +5V                     | GND
    |         |        +--+--+                   +--+--+
    |         |        | VCC |                   | +5V |
    |      +--+--+     |     |  Level Shifter    |     |  WS2812B Strip
    |      | VIN |     |     |  (74AHCT125)      | DIN |◄--[ 330Ω Resistor ]
    |      |     |     |     +----[ 5V Data ]----+     |         ▲
    |      |ESP32|     | 1A  |                   | GND |         |
    |      |     |     +--+--+                   +--+--+         |
    |      |GPIO2+--------+ (3.3V Data)             |            |
    |      |     |                                  |            |
    |      | GND |                                  |            |
    |      +--+--+                                  |            |
    |         |                                     |            |
    +---------+-------------------------------------+------------+
                         COMMON GROUND
```
> [!IMPORTANT]
> **Common Ground**: Always connect the ground (`GND`) pin of the ESP32, power supply, and LED strip together to prevent erratic flickering.

</details>

<details>
<summary><strong>📐 3-Zone Monitor Setup & Custom Ratio Guide</strong></summary>
<br>

Desktop monitors sit on a desk or monitor stand, meaning lights usually run only along the **Left, Top, and Right** edges. Chaos ESP32 Light handles this natively:

| Ratio Preset | Left Edge | Top Edge | Right Edge | Ideal Monitor Type |
| :---: | :---: | :---: | :---: | :--- |
| **`3 : 4 : 2`** | 20 LEDs (33%) | 27 LEDs (45%) | 13 LEDs (22%) | **Custom Asymmetric** (taller left lightbar or custom wiring) |
| **`1 : 2 : 1`** | 15 LEDs (25%) | 30 LEDs (50%) | 15 LEDs (25%) | **Standard 16:9 Displays** (24", 27", 32") |
| **`1 : 1 : 1`** | 20 LEDs (33%) | 20 LEDs (33%) | 20 LEDs (33%) | **Equal Sides** / Square / Portrait Displays |
| **`1 : 3 : 1`** | 12 LEDs (20%) | 36 LEDs (60%) | 12 LEDs (20%) | **21:9 Ultrawide Monitors** (34", 38") |
| **`3 : 5 : 3`** | 16 LEDs (27%) | 28 LEDs (46%) | 16 LEDs (27%) | **32:9 Super Ultrawide** (49") |

Type any numbers (e.g. `3-4-2` or `20-27-13`) into the **Custom Division Ratio** input box to set exact LED counts on the fly.

</details>

<details>
<summary><strong>🧠 How the Adaptive Anti-Flicker & Scene-Cut Snap Works</strong></summary>
<br>

Video streams have film grain and codec artifacts that jitter $\pm 2$ to $5$ values every frame:
1. **Deadband Filter ($\Delta \le 6$)**: When the total color difference $\Delta = |\Delta R| + |\Delta G| + |\Delta B|$ is below the deadband threshold, the output freezes completely. Steady scenes stay completely still with zero twitching.
2. **Velocity-Aware Acceleration ($\Delta \ge 85$)**: On rapid camera cuts or explosions, $\alpha$ automatically accelerates to `0.95`, eliminating the slow transition lag of conventional lerp smoothers.
3. **ESP32 Network Pacing**: WebSocket packets are paced at ~33 FPS (28 ms throttle) with payload deduplication, preventing the ESP32's micro-controller TCP socket queue from overflowing.

</details>

<details>
<summary><strong>💻 Building From Source & Developer Instructions</strong></summary>
<br>

```bash
# Clone repository
git clone git@github.com:as-repo1/chaos-esp32-light.git
cd chaos-esp32-light

# Install dependencies
npm install

# Start local dev server with Hot Module Replacement
npm run dev

# Build standalone production bundle
npm run build && python3 inline_bundle.py
```

The output file `dist/index.htm` is bundled with all CSS, JavaScript, and assets inlined for LittleFS storage.

</details>

<details>
<summary><strong>❓ Frequently Asked Questions (FAQ)</strong></summary>
<br>

* **Q: Does screen capture work on Netflix or protected videos?**  
  *Yes!* Hardware acceleration in Chrome can occasionally blank protected DRM streams. If your screen captures as black, simply disable *"Use graphics acceleration when available"* in Chrome Settings (`chrome://settings/system`), or play the video in Firefox or VLC.
* **Q: Why do my LEDs flicker at 100% white brightness?**  
  High brightness draws up to 3.6A for 60 LEDs. Voltage drop along thin copper traces causes trailing LEDs to brown out or flicker. Ensure your 5V power supply provides sufficient amperage and inject power at both ends of the strip for runs over 60 LEDs.
* **Q: Do I have to manually restore WLED after syncing?**  
  *No!* Stopping Movie Sync or Music Sync automatically sends a cleanup packet that unfreezes segments (`frz: false`) and restores your normal WLED effects and brightness.

</details>

---

## 🙏 Acknowledgments & Credits

Chaos ESP32 Light is proudly built on top of the extraordinary **[WLED Project](https://github.com/Aircoookie/WLED)**.

* **Christian Schwinne ([@Aircoookie](https://github.com/Aircoookie))** and all WLED contributors for creating the world's most versatile, reliable open-source ESP8266/ESP32 LED firmware.
* The WLED WebSocket & JSON API, LittleFS architecture, and UDP real-time protocols that make browser-driven Ambilight and Audio FFT visualizers possible.
* **WLED Repository**: [github.com/Aircoookie/WLED](https://github.com/Aircoookie/WLED) • **Documentation**: [kno.wled.ge](https://kno.wled.ge/)

---

## 📄 License

This project is open-source under the [MIT License](LICENSE). Built with ❤️ for the lighting and maker community.
