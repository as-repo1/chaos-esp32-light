#!/usr/bin/env python3
import os
import glob
import re

dist_dir = os.path.abspath("dist")
html_path = os.path.join(dist_dir, "index.html")

with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Find CSS
css_files = glob.glob(os.path.join(dist_dir, "assets", "*.css"))
css_content = ""
for cf in css_files:
    with open(cf, "r", encoding="utf-8") as f:
        css_content += f.read() + "\n"

# Find JS
js_files = glob.glob(os.path.join(dist_dir, "assets", "*.js"))
js_content = ""
for jf in js_files:
    with open(jf, "r", encoding="utf-8") as f:
        js_content += f.read() + "\n"

# Remove existing link tags to assets
html = re.sub(r'<link[^>]*rel="stylesheet"[^>]*assets/[^>]*>', '', html)
html = re.sub(r'<link[^>]*rel="modulepreload"[^>]*assets/[^>]*>', '', html)
# Remove script tag to assets
html = re.sub(r'<script[^>]*src="[^"]*assets/[^"]*"[^>]*>\s*</script>', '', html)
html = re.sub(r'<script[^>]*type="module"[^>]*src="[^"]*main\.js"[^>]*>\s*</script>', '', html)

# Inject CSS in head
style_tag = f"<style>\n{css_content}\n</style>"
html = html.replace("</head>", f"{style_tag}\n</head>")

# Inject JS at the bottom of body (BEFORE </body>)
script_tag = f"<script>\n{js_content}\n</script>"
html = html.replace("</body>", f"{script_tag}\n</body>")

output_path = os.path.join(dist_dir, "index.htm")
with open(output_path, "w", encoding="utf-8") as f:
    f.write(html)

size_kb = os.path.getsize(output_path) / 1024
print(f"Standalone bundle generated at: {output_path} ({size_kb:.1f} KB)")
