// ====================================================================
// Virtual LED Strip Visualizer Canvas
// ====================================================================
class VirtualStripVisualizer {
  constructor(canvasId, count = 60) {
    this.canvasId = canvasId;
    this.canvas = null;
    this.ctx = null;
    this.count = count;
    this.leds = new Array(count).fill([255, 0, 85]);
    this.animating = false;
  }

  init() {
    this.canvas = document.getElementById(this.canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    if (this.animating) return;
    this.animating = true;
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  resize(newCount) {
    this.count = newCount;
    this.leds = new Array(newCount).fill(APP_STATE.colors[0] || [255, 0, 85]);
  }

  setUniformColor(r, g, b) {
    for (let i = 0; i < this.count; i++) {
      this.leds[i] = [r, g, b];
    }
  }

  setMultiLed(ledArray) {
    for (let i = 0; i < Math.min(this.count, ledArray.length); i++) {
      this.leds[i] = ledArray[i];
    }
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const step = w / this.count;
    const radius = Math.max(2, Math.min(6, (step - 1) / 2));
    const centerY = h / 2;

    for (let i = 0; i < this.count; i++) {
      const [r, g, b] = this.leds[i] || [0, 0, 0];
      const cx = (i + 0.5) * step;

      const glowGrad = this.ctx.createRadialGradient(cx, centerY, 1, cx, centerY, radius * 2.5);
      glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.8)`);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      this.ctx.fillStyle = glowGrad;
      this.ctx.beginPath();
      this.ctx.arc(cx, centerY, radius * 2.5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      this.ctx.beginPath();
      this.ctx.arc(cx, centerY, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

const virtualStrip = new VirtualStripVisualizer('virtualStripCanvas', APP_STATE.ledCount);

