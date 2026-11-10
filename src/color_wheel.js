// ====================================================================
// Interactive Canvas Color Wheel
// ====================================================================
class CanvasColorWheel {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.canvas = null;
    this.ctx = null;
    this.radius = 100;
    this.center = 100;
    this.isDragging = false;
    this.currentHue = 340;
    this.currentSat = 1.0;
    this.currentVal = 1.0;
  }

  init() {
    this.canvas = document.getElementById(this.canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.radius = this.canvas.width / 2;
    this.center = this.radius;

    this.drawWheel();

    const handlePointer = (e) => {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left - this.center;
      const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top - this.center;
      const dist = Math.sqrt(x * x + y * y);

      if (dist <= this.radius || this.isDragging) {
        let angle = Math.atan2(y, x) * (180 / Math.PI);
        if (angle < 0) angle += 360;

        this.currentHue = angle;
        this.currentSat = Math.min(1.0, dist / this.radius);

        const [r, g, b] = hsvToRgb(this.currentHue, this.currentSat, this.currentVal);
        updateActiveColor(r, g, b, true);
      }
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      handlePointer(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) handlePointer(e);
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('touchstart', (e) => {
      this.isDragging = true;
      handlePointer(e);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging) {
        handlePointer(e);
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  drawWheel() {
    if (!this.canvas || !this.ctx) return;
    const imgData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    const data = imgData.data;

    for (let y = 0; y < this.canvas.height; y++) {
      for (let x = 0; x < this.canvas.width; x++) {
        const dx = x - this.center;
        const dy = y - this.center;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * this.canvas.width + x) * 4;

        if (dist <= this.radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;

          const sat = dist / this.radius;
          const [r, g, b] = hsvToRgb(angle, sat, 1.0);

          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }

    this.ctx.putImageData(imgData, 0, 0);
  }

  setColorRGB(r, g, b) {
    const [h, s, v] = rgbToHsv(r, g, b);
    this.currentHue = h;
    this.currentSat = s;
    this.currentVal = v;
    updateCenterPreview(r, g, b);
  }
}

const colorWheel = new CanvasColorWheel('colorWheelCanvas');

