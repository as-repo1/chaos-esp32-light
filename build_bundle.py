#!/usr/bin/env python3
import os
import gzip

root_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(root_dir, "src")

# Modular JS files to concatenate into main.js
MODULE_FILES = [
    "state.js",
    "wled_api.js",
    "color_wheel.js",
    "virtual_strip.js",
    "movie_sync.js",
    "music_sync.js",
    "ui.js",
    "oled_studio.js",
    "calibration.js",
    "qr_studio.js",
    "boot.js"
]

# Concatenate modular src files if src directory exists
if os.path.exists(src_dir):
    js_parts = []
    for mod in MODULE_FILES:
        mod_path = os.path.join(src_dir, mod)
        if os.path.exists(mod_path):
            with open(mod_path, "r", encoding="utf-8") as f:
                js_parts.append(f.read())
        else:
            print(f"Warning: Module {mod} not found in src/")
    js = "\n".join(js_parts)
    with open(os.path.join(root_dir, "main.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print(f"Concatenated {len(MODULE_FILES)} modular files from src/ -> main.js")
else:
    with open(os.path.join(root_dir, "main.js"), "r", encoding="utf-8") as f:
        js = f.read()

with open(os.path.join(root_dir, "index.html"), "r", encoding="utf-8") as f:
    html = f.read()
with open(os.path.join(root_dir, "style.css"), "r", encoding="utf-8") as f:
    css = f.read()
with open(os.path.join(root_dir, "qrcode.min.js"), "r", encoding="utf-8") as f:
    qrcode_js = f.read()

# Replace css link with inline style
html = html.replace("<link rel=\"stylesheet\" href=\"style.css\" />", f"<style>\n{css}\n</style>")
html = html.replace("<link rel=\"stylesheet\" href=\"style.css\">", f"<style>\n{css}\n</style>")

# Replace js script with inline script (including offline qrcode.min.js)
html = html.replace("<script type=\"module\" src=\"main.js\"></script>", f"<script>\n{qrcode_js}\n</script>\n<script>\n{js}\n</script>")

dist_dir = os.path.join(root_dir, "dist")
os.makedirs(dist_dir, exist_ok=True)

with open(os.path.join(dist_dir, "index.html"), "w", encoding="utf-8") as f:
    f.write(html)
with open(os.path.join(dist_dir, "index.htm"), "w", encoding="utf-8") as f:
    f.write(html)

print(f"Generated dist/index.html & dist/index.htm ({len(html.encode('utf-8')) / 1024:.1f} KB)")

# Gzip compress for ESP32
gz_data = gzip.compress(html.encode("utf-8"), compresslevel=9)
print(f"Gzipped size: {len(gz_data) / 1024:.1f} KB")

# Generate chaos_html_gz.h
c_array_lines = []
c_array_lines.append("#pragma once\n#include <Arduino.h>\n")
c_array_lines.append(f"const size_t chaos_html_gz_len = {len(gz_data)};")
c_array_lines.append("const uint8_t chaos_html_gz[] PROGMEM = {")

hex_bytes = [f"0x{b:02x}" for b in gz_data]
chunk_size = 16
for i in range(0, len(hex_bytes), chunk_size):
    chunk = ", ".join(hex_bytes[i:i+chunk_size])
    if i + chunk_size < len(hex_bytes):
        chunk += ","
    c_array_lines.append("  " + chunk)
c_array_lines.append("};\n")

header_path = os.path.abspath(os.path.join(root_dir, "..", "esp32_wled_lite", "chaos_html_gz.h"))
with open(header_path, "w", encoding="utf-8") as f:
    f.write("\n".join(c_array_lines))

print(f"Updated {header_path}")
