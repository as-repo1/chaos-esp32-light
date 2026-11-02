# 🔌 Chaos ESP32 Light — Complete Hardware & Wiring Guide

This guide provides exhaustive schematics, electrical calculations, logic level shifting instructions, and physical installation procedures for building an addressable LED setup powered by ESP32, WLED firmware, and Chaos ESP32 Light.

---

## 📑 Table of Contents
1. [Bill of Materials (BOM)](#1-bill-of-materials-bom)
2. [Electrical Schematic & Pinout](#2-electrical-schematic--pinout)
3. [Logic Level Shifter (74AHCT125)](#3-logic-level-shifter-74ahct125)
4. [Power Supply Sizing & Power Budget](#4-power-supply-sizing--power-budget)
5. [Power Injection Guidelines](#5-power-injection-guidelines)
6. [3-Side Desktop Monitor Installation](#6-3-side-desktop-monitor-installation)
7. [Safety & Best Practices](#7-safety--best-practices)

---

## 1. Bill of Materials (BOM)

| Component | Recommended Part / Model | Purpose | Notes |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32-S3 DevKitC-1 N16R8 (Dual USB-C) | Central controller running FreeRTOS, BLE, WebSocket & OLED HUD | 240MHz dual-core, 16MB Flash, 8MB PSRAM |
| **LED Strip** | WS2812B Addressable LED Strip (59 LEDs calibrated) | 800kHz perimeter / cinema ambilight lighting | 5V operated, single-wire DIN |
| **Rotary Encoder** | HW-040 (EC11) Rotary Encoder with Push Button | Hardware media dial & brightness/power dial | 20 detents/rev with integrated tactile switch |
| **OLED Display** | 1.3" I2C SH1106 / SSD1306 (128×64) | Dedicated Now Playing HUD with 48×48 Album Art | Hardware I2C (Fast Mode 400kHz) |
| **Power Supply** | 5V 5A to 10A DC Switching Power Supply | Stable current for ESP32 and LEDs | Mean Well LRS series or quality adapter |
| **Data Resistor** | 330Ω to 470Ω, 1/4W Metal Film | Dampens line reflections on high-speed data line | Place near DIN input of first LED |
| **Hookup Wire** | 18 AWG to 20 AWG (Power), 22 AWG (Data) | Carries current and signals | Stranded copper wire |

---

## 2. Electrical Schematic & Pinout

```text
                            +-----------------------------+
                            |     5V DC Power Source      |
                            +--------------+--------------+
                                           |
                                    +5V / VIN (Red)
                +--------------------------+--------------------------+
                |                                                     |
            +---+---+                                             +---+---+
            |  5V   |                                             |  GND  |
            |       |                                             |       |
            |       |   [ESP32-S3-DevKitC-1 N16R8 Dual USB-C]     |       |
            |       |                                             +---+---+
            | GPIO1 +----------------+                                | Common GND
            |       |                | 800kHz WS2812B Signal          | (Black)
            | GPIO4 +----------+     |                                |
            |       |          |     |                                |
            | GPIO5 +-----+    |     |                                |
            |       |     |    |     |                                |
            | GPIO7 +--+  |    |     |                                |
            |       |  |  |    |     |                                |
            | GPIO6 +-)|--|----+     | I2C SCL (Clock)                |
            |       | ||  |    |     |                                |
            | GPIO8 +-)|--|----+     | I2C SDA (Data)                 |
            |       | ||  |    |     |                                |
            |  3V3  +-)|--|----+     | 3.3V Logic Rail                |
            +---+---+ ||  |    |     |                                |
                |     ||  |    |     |                                |
       3.3V Rail|     ||  |    |     |                                |
       +--------+     ||  |    |     |                                |
       |              ||  |    |     |                                |
   +---+---+          ||  |    |     |                                |
   |  VCC  |          ||  |    |     |                                |
   |       |          ||  |    |     |                                |
   | 1.3"  |          ||  |    |     |                                |
   | OLED  |  SDA <---+|  |    |     |                                |
   |SH1106 |  SCL <----+  |    |     |                                |
   |  GND  +--------------|----+-----|--------------------------------+
   +-------+              |    |     |                                |
                          |    |     |                                |
   +-------+              |    |     |                                |
   |  CLK  <--------------+    |     | (Phase A - Falling Interrupt)  |
   |  DT   <-------------------+     | (Phase B - Direction Sense)    |
   |  SW   <-------------------------+ (Momentary Push Button)        |
   |  +    <-- 3.3V Rail                                              |
   |  GND  +----------------------------------------------------------+
   | HW-040|                                                          |
   |Rotary |                                                          |
   +-------+                                                          |
                                                                      |
   +------------------------------------------------------------------+
   |                       WS2812B Addressable LED Strip              |
   |   [ +5V / 3V3 ] <--- Power (Red Wire)                            |
   |   [    DIN    ] <--- GPIO 1 (Green Wire)                         |
   |   [    GND    ] <--- Common Ground (White Wire) -----------------+
   +------------------------------------------------------------------+
```

### Complete ESP32-S3 Pinout Allocation

| Peripheral | ESP32-S3 Pin | Hardware Signal | Electrical Characteristic |
| :--- | :--- | :--- | :--- |
| **WS2812B Data** | **GPIO 1** | Single-wire NRZ | 800 kHz, 40mA push-pull (`GPIO_DRIVE_CAP_3`) |
| **Rotary CLK** | **GPIO 4** | Quadrature Phase A | Falling edge interrupt, 8ms refractory debounce |
| **Rotary DT** | **GPIO 5** | Quadrature Phase B | Sampled on CLK edge for direction |
| **Rotary SW** | **GPIO 7** | Tactile Push Switch | Active LOW (`INPUT_PULLUP`), Single/Double/Long-press |
| **OLED SCL** | **GPIO 6** | I2C Clock | 400 kHz Fast-Mode Hardware I2C |
| **OLED SDA** | **GPIO 8** | I2C Data | 400 kHz Fast-Mode Hardware I2C |
| **System Power** | **5V / VIN & 3V3** | DC Power Rails | 5.0V for high current, 3.3V for logic pullups |
| **Ground** | **GND** | 0V Reference | Common Ground across ESP32, LEDs, OLED, and HW-040 |

---

## 3. Logic Level Shifter (74AHCT125)

### Why is a Level Shifter Required?
The ESP32 outputs digital logic at **3.3V**. Addressable LED strips (WS2812B, WS2811, SK6812) operate at **5V**. According to the WS2812B datasheet:
- High-level input threshold $V_{IH} = 0.7 \times V_{DD} = 0.7 \times 5.0\text{V} = \mathbf{3.5\text{V}}$.
- Since $3.3\text{V} < 3.5\text{V}$, driving the strip directly from GPIO can cause sporadic flickers, random color spasms, or total failure to respond, especially with longer cables.

### 74AHCT125 Pinout
- **Pin 1 (`1OE`)**: Connect to `GND` (enables buffer gate 1).
- **Pin 2 (`1A`)**: Connect to ESP32 GPIO 1 (3.3V input).
- **Pin 3 (`1Y`)**: Connect via 330Ω resistor to LED Strip `DIN` (5V output).
- **Pin 7 (`GND`)**: Connect to Common `GND`.
- **Pin 14 (`VCC`)**: Connect to `+5V`.

---

## 4. Power Supply Sizing & Power Budget

Addressable LEDs draw significant current at maximum brightness:
- **WS2812B**: Up to **60 mA (0.06A)** per LED at 100% full white ($R=255, G=255, B=255$).
- **SK6812 (RGBW)**: Up to **80 mA (0.08A)** per LED with dedicated white channel active.

### Sizing Formula
$$\text{Max Current (Amps)} = (\text{Number of LEDs} \times 0.06\text{A}) + 0.5\text{A (ESP32 overhead)}$$

| LED Count | Typical Use Case | Max Current (100% White) | Recommended Power Supply |
| :---: | :---: | :---: | :---: |
| **30 LEDs** | Small Lightbar (0.5m) | $1.8\text{A} + 0.5\text{A} = 2.3\text{A}$ | 5V 3A (15W) |
| **60 LEDs** | 27"–32" Monitor (3-Sided) | $3.6\text{A} + 0.5\text{A} = 4.1\text{A}$ | 5V 5A (25W) |
| **100 LEDs** | 34"–38" Ultrawide Monitor | $6.0\text{A} + 0.5\text{A} = 6.5\text{A}$ | 5V 8A–10A (40W) |
| **144 LEDs** | 49" Superwide / Desk Frame | $8.6\text{A} + 0.5\text{A} = 9.1\text{A}$ | 5V 10A–15A (60W) |

> [!TIP]
> In real-world video and music playback, average color utilization is between 30% and 50% of maximum current draw. A 5V 5A power supply comfortably powers 60–80 LEDs with headroom.

---

## 5. Power Injection Guidelines

Due to resistance in the thin copper traces of flexible LED strips, voltage drops occur along the length of the strip:
- If voltage falls below ~4.0V, LEDs at the far end will turn pinkish or dim when white is displayed.
- **Rule of Thumb**: For strips of **60 LEDs or more**, inject 5V power at **both the start and the end** of the strip.
- Always use **18 AWG copper wire** for power feed lines.

---

## 6. 3-Side Desktop Monitor Installation

For desktop monitors mounted on arms or stands, the bottom edge is blocked. Follow this standard 3-sided layout:

1. **Clean Surface**: Wipe the rear perimeter of the monitor with 90% Isopropyl alcohol to ensure the 3M adhesive bonds permanently.
2. **Mounting Progression**:
   - Begin at the **Bottom-Left corner** (Data In `DIN`).
   - Run up the **Left Edge** (e.g. 15–20 LEDs).
   - Turn at the top-left corner using a flexible wire jumper or 90° corner adapter.
   - Run across the **Top Edge** (e.g. 26–30 LEDs).
   - Turn at the top-right corner.
   - Run down the **Right Edge** (e.g. 15–20 LEDs).
3. **Configure in Studio**:
   - Set **Layout Mode** to `3-Side Monitor`.
   - Set **Wiring Sequence** to `Bottom-Left ➔ Top ➔ Right (Clockwise)`.
   - Tune section proportions using the **Section Division** sliders.

---

## 7. Safety & Best Practices

1. **Common Ground**: Never run the ESP32 and LED strip on separate grounds without tying their `GND` lines together.
2. **Capacitor Polarity**: Verify capacitor polarity before powering on (+ to 5V, - to GND). Reversed electrolytic capacitors will burst.
3. **Fuse Protection**: Install a 5A–10A inline automotive blade fuse on the positive (+5V) DC output line directly after the power supply.
4. **Heat Management**: Do not operate high-density (60 or 144 LEDs/m) strips coiled inside their reels, as heat buildup can melt the silicone coating.

---

## 8. Acknowledgments & Credits

Chaos ESP32 Light is designed to pair directly with the open-source **[WLED Project](https://github.com/Aircoookie/WLED)** created by Christian Schwinne (Aircoookie).
All GPIO pin assignments, PWM timings, and hardware protocol handling are managed by WLED.
- WLED Repository: [github.com/Aircoookie/WLED](https://github.com/Aircoookie/WLED)
- WLED Hardware Wiki: [kno.wled.ge/basics/compatible-hardware/](https://kno.wled.ge/basics/compatible-hardware/)
