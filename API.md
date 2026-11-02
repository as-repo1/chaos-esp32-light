# 🔌 Chaos ESP32 Light — API & Protocol Specification

This document provides the complete API specification for interfacing with ESP32 controllers running WLED via Chaos ESP32 Light using WebSockets, HTTP REST endpoints, and UDP broadcast synchronization.

---

## 📑 Table of Contents
1. [Communication Overview](#1-communication-overview)
2. [WebSocket Real-Time Protocol (`/ws`)](#2-websocket-real-time-protocol-ws)
3. [Range Array Streaming (`seg.i`)](#3-range-array-streaming-segi)
4. [HTTP REST Endpoints](#4-http-rest-endpoints)
   - [Get & Set State (`/json/state`)](#get--set-state-jsonstate)
   - [Hardware Telemetry (`/json/info`)](#hardware-telemetry-jsoninfo)
   - [Presets Management (`/presets.json`)](#presets-management-presetsjson)
   - [Wi-Fi Configuration (`/json/cfg`)](#wi-fi-configuration-jsoncfg)
   - [LittleFS Upload (`/upload`)](#littlefs-upload-upload)
5. [UDP Real-Time Sync Protocol (Port 21324)](#5-udp-real-time-sync-protocol-port-21324)
6. [Now Playing & Media HUD Endpoints](#6-now-playing--media-hud-endpoints)
   - [Now Playing Metadata (`/media`)](#now-playing-metadata-media)
   - [48×48 Album Artwork Upload (`/art`)](#4848-album-artwork-upload-art)
7. [Bluetooth Low Energy (BLE) HID Media Dial Protocol](#7-bluetooth-low-energy-ble-hid-media-dial-protocol)
8. [Acknowledgments & Credits](#8-acknowledgments--credits)

---

## 1. Communication Overview

| Channel | Endpoint / Port | Protocol | Typical Latency | Use Case |
| :--- | :--- | :--- | :---: | :--- |
| **WebSocket** | `ws://<IP>/ws` | Full-duplex JSON / Binary | **5–15 ms** | Real-time Ambilight & Music FFT streaming |
| **REST API** | `http://<IP>/json/state` | HTTP GET / POST (JSON) | 20–50 ms | Initial state load, effect & palette queries |
| **UDP Sync** | Port `21324` | UDP Broadcast | **< 5 ms** | Multi-device multi-strip room synchronization |
| **File Upload** | `http://<IP>/upload` | HTTP POST (Multipart) | N/A | Flashing standalone web app to LittleFS |

---

## 2. WebSocket Real-Time Protocol (`/ws`)

Connect to: `ws://<ESP32_IP>/ws`

### Binary Frame Support
- `binaryType = 'arraybuffer'`
- The ESP32 pushes live LED state periodically or on change.

### JSON State Broadcast
When state updates occur on the ESP32 (or via another client), the WebSocket pushes:
```json
{
  "state": {
    "on": true,
    "bri": 128,
    "transition": 7,
    "ps": -1,
    "seg": [
      {
        "id": 0,
        "start": 0,
        "stop": 60,
        "len": 60,
        "col": [[255, 0, 85], [0, 0, 0], [0, 0, 0]],
        "fx": 0,
        "sx": 128,
        "ix": 128,
        "pal": 0
      }
    ]
  },
  "info": {
    "ver": "0.14.4",
    "name": "WLED Ambient Studio",
    "leds": { "count": 60, "fps": 58, "pwr": 820 },
    "wifi": { "rssi": -48, "signal": 96 }
  }
}
```

---

## 3. Range Array Streaming (`seg.i`)

For high-speed, multi-zone Ambilight and FFT audio reactivity, WLED supports contiguous index ranges inside the `seg.i` field.

### Format
`seg.i = [start_index, stop_index, [R, G, B], start_index2, stop_index2, [R2, G2, B2], ...]`

### Example: 3-Zone Ambilight Range Packet
```json
{
  "seg": {
    "i": [
      0, 20, [255, 0, 85],
      20, 47, [0, 242, 254],
      47, 60, [168, 85, 247]
    ],
    "frz": true
  },
  "transition": 0
}
```
- `0, 20, [255, 0, 85]`: LEDs 0 to 19 turn pink (Left Edge).
- `20, 47, [0, 242, 254]`: LEDs 20 to 46 turn cyan (Top Edge).
- `47, 60, [168, 85, 247]`: LEDs 47 to 59 turn violet (Right Edge).
- `"frz": true`: Freezes the segment to disable background effects and accept direct frame writes.
- `"transition": 0`: Bypasses internal crossfade for instant frame execution.

---

## 4. HTTP REST Endpoints

### Get & Set State (`/json/state`)
- **GET `http://<IP>/json/state`**: Returns complete active device state.
- **POST `http://<IP>/json/state`**: Updates parameters.

```bash
# Turn on, set brightness to 200, color to Cyan
curl -X POST -H "Content-Type: application/json" -d '{"on":true,"bri":200,"seg":{"col":[[0,242,254]]}}' http://10.109.101.60/json/state
```

---

### Hardware Telemetry (`/json/info`)
- **GET `http://<IP>/json/info`**: Returns hardware information:
```json
{
  "ver": "0.14.4",
  "vid": 2403150,
  "leds": { "count": 60, "pwr": 780, "fps": 59, "maxpwr": 2500 },
  "name": "WLED Ambient Studio",
  "arch": "esp32",
  "freeheap": 182400,
  "wifi": { "bssid": "...", "rssi": -52, "signal": 94, "channel": 6 }
}
```

---

### Presets Management (`/presets.json`)
- **GET `http://<IP>/presets.json`**: Downloads full list of stored hardware presets.
- **Save Preset**:
```bash
curl -X POST -H "Content-Type: application/json" -d '{"psave":1,"n":"🌅 Sunset Chill","ib":true}' http://10.109.101.60/json/state
```
- **Delete Preset**:
```bash
curl -X POST -H "Content-Type: application/json" -d '{"pdel":1}' http://10.109.101.60/json/state
```

---

### Wi-Fi Configuration (`/json/cfg`)
Saves network credentials to non-volatile memory:
```bash
curl -X POST -H "Content-Type: application/json" -d '{"nw":{"ins":[{"ssid":"pk","pswd":"00000000"}]}}' http://10.109.101.60/json/cfg
```

---

### LittleFS Upload (`/upload`)
Uploads files directly into the ESP32's flash filesystem:
```bash
curl -F "data=@dist/index.htm;filename=/index.htm" http://10.109.101.60/upload
```

---

## 5. UDP Real-Time Sync Protocol (Port 21324)

WLED listens and broadcasts real-time sync packets on UDP port **21324**.

### Packet Structure
- **Header**: 2 bytes (`0x02` or `0x04` notification packet).
- **Data Payload**: Contains segment indices, brightness values, and color triples.
- **Broadcast Address**: `255.255.255.255:21324`

---

## 6. Now Playing & Media HUD Endpoints

LumiOS ESP32-S3 firmware provides dedicated REST endpoints to feed real-time music playback telemetry and 48×48 dithered album artwork directly to the 1.3" OLED display.

### Now Playing Metadata (`/media`)
- **POST `http://<IP>/media`**: Pushes active track metadata.
```json
{
  "title": "GhorGari (ঘোরগাড়ী)",
  "artist": "HIGHWAY",
  "album": "Train",
  "duration": 382,
  "position": 31,
  "playing": true,
  "source": "youtube"
}
```
| Field | Type | Description |
| :--- | :--- | :--- |
| `title` | string | Track title (marqee scrolls if > 11 chars) |
| `artist` | string | Artist or channel name (truncated to 14 chars) |
| `album` | string | Album or playlist title |
| `duration` | integer | Total track length in seconds (renders as `MM:SS`) |
| `position` | integer | Current playback timestamp in seconds (renders as `MM:SS`) |
| `playing` | boolean | `true` = Playing (runs animated EQ visualizer); `false` = Paused |
| `source` | string | Media source: `"spotify"`, `"youtube"`, `"zen"`, or `"music"` |

### 48×48 Album Artwork Upload (`/art`)
- **POST `http://<IP>/art`**: Uploads a 1-bit monochrome XBM bitmap formatted as a 576-character uppercase/lowercase hexadecimal ASCII payload.

```bash
# Upload 576-character XBM hex string (48x48 bits = 288 bytes)
curl -X POST -H "Content-Type: text/plain" -d "000000000000..." http://172.20.10.5/art
```

- **Dimensions**: $48 \times 48\text{ pixels}$.
- **Storage**: Row-major horizontal bit encoding ($48 \div 8 = 6\text{ bytes per row} \times 48\text{ rows} = 288\text{ bytes}$).
- **Hex Representation**: 2 hex characters per byte $\times 288\text{ bytes} = \mathbf{576\text{ ASCII characters}}$.
- **Format**: Standard XBM LSB-first bit order within each byte.

---

## 7. Bluetooth Low Energy (BLE) HID Media Dial Protocol

The ESP32-S3 advertises as a standard Human Interface Device (HID) over GATT:
- **Device Name**: `LumiOS Media Dial`
- **HID Profile**: Bluetooth Low Energy Consumer Control (Keyboard / Media Keypad)
- **Report Map**: Standard USB HID Consumer Usage Page (`0x0C`)

### Media Key Mappings
| User Action | Firmware Function | HID Consumer Keycode | Usage |
| :--- | :--- | :--- | :--- |
| **Rotate Clockwise (CW)** | Rotary Encoder | `KEY_MEDIA_VOLUME_UP` (`0xE9`) | Increase system master volume |
| **Rotate Counter-Clockwise (CCW)** | Rotary Encoder | `KEY_MEDIA_VOLUME_DOWN` (`0xEA`) | Decrease system master volume |
| **Single Click Push Button** | HW-040 Switch | `KEY_MEDIA_PLAY_PAUSE` (`0xCD`) | Toggle audio/video playback |
| **Double Click Push Button** | HW-040 Switch | `KEY_MEDIA_NEXT_TRACK` (`0xB5`) | Skip to next song/track |
| **Long Press (> 800ms)** | HW-040 Switch | *Internal Mode Toggle* | Switches dial to Desk Light Brightness Mode |

### Anti-Bounce & BLE Pacing
- **Encoder ISR**: Single `FALLING` edge interrupt on `GPIO 4` with an 8ms (`8000 µs`) hardware lockout to eliminate contact bounce.
- **BLE Notification Pacing**: 12ms keydown / 12ms keyup delay with maximum 2 steps per loop cycle prevents buffer overruns and connection drops on host OS.

---

## 8. Acknowledgments & Credits

Chaos ESP32 Light interfaces with the open-source **[WLED Project](https://github.com/Aircoookie/WLED)** created by Christian Schwinne (Aircoookie).
All JSON API schemas, WebSocket frame specifications, and UDP sync protocols are defined and maintained by WLED.
- Repository: [github.com/Aircoookie/WLED](https://github.com/Aircoookie/WLED)
- JSON API Documentation: [kno.wled.ge/interfaces/json-api/](https://kno.wled.ge/interfaces/json-api/)
