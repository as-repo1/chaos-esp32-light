# 🔌 WLED Ambient Studio — API & Protocol Specification

This document provides the complete API specification for interfacing with WLED via WebSockets, HTTP REST endpoints, and UDP broadcast synchronization.

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
