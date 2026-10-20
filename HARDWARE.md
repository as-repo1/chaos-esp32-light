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
| **Microcontroller** | ESP32 DevKit V1 (30-pin or 38-pin, ESP-WROOM-32) | Runs WLED firmware & handles WebSocket / UDP telemetry | 240MHz dual-core, 2.4GHz Wi-Fi |
| **LED Strip** | WS2812B, WS2811, or SK6812 (60 LEDs/m) | RGB or RGBW addressable perimeter lighting | 5V DC operated |
| **Power Supply** | 5V 5A to 10A DC Switching Power Supply | Supplies stable current to ESP32 and LEDs | Mean Well LRS series or quality adapter |
| **Logic Level Shifter** | 74AHCT125 or SN74AHCT245 (DIP-14) | Converts ESP32 3.3V GPIO signal to 5V CMOS signal | Critical for signal integrity |
| **Filter Capacitor** | 1000 µF, 6.3V–16V Electrolytic | Absorbs initial inrush current and voltage sags | Connect across +5V and GND at strip |
| **Data Resistor** | 330Ω to 470Ω, 1/4W Metal Film | Dampens line reflections on high-speed data line | Place near DIN input of first LED |
| **Hookup Wire** | 18 AWG to 20 AWG (Power), 22 AWG (Data) | Carries high current and data signals | Stranded copper wire |
| **Corner Connectors** | 3-pin solderless L-joints or 22 AWG wire jumpers | Bridges 90° monitor corners | Solder joints recommended |

---

## 2. Electrical Schematic & Pinout

```
                           +----------------------------+
                           |  5V 10A DC Power Supply   |
                           +--------------+-------------+
                                          |
                        +5V (18 AWG Red)  |  GND (18 AWG Black)
                 +------------------------+------------------------+
                 |                                                 |
                 |                                                 |
             +---+---+                                         +---+---+
             |  VIN  |                                         |  GND  |
             |       |                                         |       |
             | ESP32 |                                         | ESP32 |
             | DevKit|                                         | DevKit|
             |       |                                         +---+---+
             | GPIO2 +---------------+                             |
             +-------+               |                             |
                                     |                             |
                               3.3V Data                           |
                                     |                             |
                         +-----------v-----------+                 |
                         |  74AHCT125 Pin 2 (1A) |                 |
                         |                       |                 |
     +5V Power ----------+ Pin 14 (VCC)          |                 |
                         |                       |                 |
     Common GND ---------+ Pin 7 (GND)           |                 |
     Common GND ---------+ Pin 1 (1OE Enable)    |                 |
                         |                       |                 |
                         |  74AHCT125 Pin 3 (1Y) |                 |
                         +-----------+-----------+                 |
                                     |                             |
                                5V Data Out                        |
                                     |                             |
                                  [ 330Ω ] Resistor                |
                                     |                             |
                 +-------------------v-----------------------------+
                 |                   |                             |
             +---+---+           +---+---+                     +---+---+
             |  +5V  |           |  DIN  |                     |  GND  |
             +-------+           +-------+                     +-------+
             |         First LED on WS2812B / SK6812 Strip             |
             +---------------------------------------------------------+
                 ▲                                                 ▲
                 |         1000 µF 16V Filter Capacitor            |
                 +----------------[ + || - ]-----------------------+
```

### ESP32 Pin Connections Summary
- **ESP32 VIN**: Connected to `+5V` from power supply.
- **ESP32 GND**: Connected to common power supply `GND`.
- **ESP32 GPIO 2** (or GPIO 16): Connected to Level Shifter Pin 2 (`1A`).

---

## 3. Logic Level Shifter (74AHCT125)

### Why is a Level Shifter Required?
The ESP32 outputs digital logic at **3.3V**. Addressable LED strips (WS2812B, WS2811, SK6812) operate at **5V**. According to the WS2812B datasheet:
- High-level input threshold $V_{IH} = 0.7 \times V_{DD} = 0.7 \times 5.0\text{V} = \mathbf{3.5\text{V}}$.
- Since $3.3\text{V} < 3.5\text{V}$, driving the strip directly from GPIO can cause sporadic flickers, random color spasms, or total failure to respond, especially with longer cables.

### 74AHCT125 Pinout
- **Pin 1 (`1OE`)**: Connect to `GND` (enables buffer gate 1).
- **Pin 2 (`1A`)**: Connect to ESP32 GPIO2 (3.3V input).
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
