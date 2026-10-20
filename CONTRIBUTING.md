# 🤝 Contributing to Chaos ESP32 Light

Thank you for your interest in contributing to **Chaos ESP32 Light**! We welcome contributions from developers, makers, and lighting enthusiasts worldwide.

---

## 📑 Table of Contents
1. [Code of Conduct](#code-of-conduct)
2. [Prerequisites](#prerequisites)
3. [Development Environment Setup](#development-environment-setup)
4. [Project Structure](#project-structure)
5. [Development Workflow](#development-workflow)
6. [Building & Bundling](#building--bundling)
7. [Testing Against Physical Hardware](#testing-against-physical-hardware)
8. [Pull Request Guidelines](#pull-request-guidelines)
9. [Commit Convention](#commit-convention)

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful and constructive in all communications and code reviews.

---

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: v3.8 or higher (for `inline_bundle.py`)
- **Web Browser**: Chrome, Edge, or Chromium-based browser (required for `getDisplayMedia` screen capture)
- **ESP32 Controller** (Optional but recommended): Flashed with WLED v0.14 or later.

---

## Development Environment Setup

1. **Fork & Clone**:
   ```bash
   git clone git@github.com:as-repo1/chaos-esp32-light.git
   cd chaos-esp32-light
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start Local Dev Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173/` in your browser.

---

## Project Structure

```
├── dist/                  # Production builds and standalone inlined bundle
│   └── index.htm          # Self-contained single-file LittleFS flash bundle
├── docs/                  # Interactive documentation page
│   └── index.html         # Web manual & visual pipeline guide
├── .github/               # GitHub Actions CI & issue templates
├── index.html             # Core HTML template with glassmorphic layout
├── main.js                # Core state engine, Ambilight, Audio FFT, WebSockets
├── style.css              # Main glassmorphic design system & components
├── skin.css               # Portal themes & colorway CSS variables
├── inline_bundle.py       # Python script to inline assets into standalone bundle
├── API.md                 # Complete WebSocket and REST API specification
├── ARCHITECTURE.md        # Technical pipeline architecture
├── HARDWARE.md            # Hardware bill of materials & wiring schematics
├── MANUAL.md              # Detailed user manual
└── package.json           # Node configuration & Vite build scripts
```

---

## Development Workflow

1. Create a feature branch:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. Make your edits to `index.html`, `main.js`, `style.css`, or `skin.css`.
3. Verify changes in real time via Vite's Hot Module Replacement (HMR).

---

## Building & Bundling

Before submitting a Pull Request, compile and verify the standalone single-file bundle:

```bash
npm run build && python3 inline_bundle.py
```

Verify that:
- The build succeeds without warnings or syntax errors.
- `dist/index.htm` is generated and size is under 250 KB.

---

## Testing Against Physical Hardware

Test flashing directly to your ESP32:

```bash
curl -F "data=@dist/index.htm;filename=/index.htm" http://<YOUR_ESP32_IP>/upload
```

Verify that:
- Screen Ambilight captures display without frame drops.
- Audio spectrum visualizer responds to audio input.
- Preset studio saves and deletes presets reliably.
- Portal theme changes persist across page reloads.

---

## Pull Request Guidelines

1. Ensure the standalone bundle compiles cleanly.
2. Update relevant markdown documentation (`README.md`, `MANUAL.md`, `CHANGELOG.md`) if introducing new features or settings.
3. Open a Pull Request targeting the `main` branch with a descriptive summary of your changes.

---

## Commit Convention

We use the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new user-facing feature
- `fix:` A bug fix
- `docs:` Documentation-only changes
- `style:` Formatting or CSS styling changes
- `refactor:` Code restructuring without feature changes
- `perf:` Performance improvements
- `chore:` Build process or dependency updates

*Example:* `feat(audio): add frequency rainbow visualizer mode`
