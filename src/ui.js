// ====================================================================
// UI Helpers & Event Listeners
// ====================================================================
function updateActiveColor(r, g, b, sendToDevice = false) {
  APP_STATE.colors[APP_STATE.activeSlot] = [r, g, b];
  updateColorSlotsUI();
  updateCenterPreview(r, g, b);

  document.getElementById('sliderR').value = r;
  document.getElementById('sliderG').value = g;
  document.getElementById('sliderB').value = b;
  document.getElementById('valR').textContent = r;
  document.getElementById('valG').textContent = g;
  document.getElementById('valB').textContent = b;
  document.getElementById('hexInput').value = rgbToHex(r, g, b);

  virtualStrip.setUniformColor(r, g, b);

  if (sendToDevice) {
    wled.send({
      seg: { col: APP_STATE.colors, fx: 0 }
    });
  }
}

function updateColorSlotsUI() {
  for (let i = 0; i < 3; i++) {
    const [r, g, b] = APP_STATE.colors[i] || [0, 0, 0];
    const swatch = document.getElementById(`slot${i}Swatch`);
    if (swatch) swatch.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }
}

function updateCenterPreview(r, g, b) {
  const preview = document.getElementById('wheelCenterPreview');
  if (preview) preview.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

function updatePowerUI(isOn) {
  const btn = document.getElementById('masterPowerBtn');
  const txt = document.getElementById('powerText');
  if (isOn) {
    btn.classList.remove('off');
    txt.textContent = 'ON';
  } else {
    btn.classList.add('off');
    txt.textContent = 'OFF';
  }
}

function updateBrightnessUI(val) {
  const pct = Math.round((val / 255) * 100);

  const masterSlider = document.getElementById('sliderMasterBri');
  if (masterSlider) masterSlider.value = val;
  const briValText = document.getElementById('briValueText');
  if (briValText) briValText.textContent = `${pct}% (${val})`;

  const headerSlider = document.getElementById('headerMasterBri');
  if (headerSlider) headerSlider.value = val;
  const headerBriText = document.getElementById('headerBriText');
  if (headerBriText) headerBriText.textContent = `${pct}%`;

  const movieSlider = document.getElementById('sliderMovieBri');
  if (movieSlider) movieSlider.value = val;
  const movieBriText = document.getElementById('movieBriValText');
  if (movieBriText) movieBriText.textContent = `${pct}% (${val})`;

  const musicSlider = document.getElementById('sliderMusicBri');
  if (musicSlider) musicSlider.value = val;
  const musicBriText = document.getElementById('musicBriValText');
  if (musicBriText) musicBriText.textContent = `${pct}% (${val})`;
}

function setGlobalBrightness(val, sourceId = '') {
  const bri = Math.max(0, Math.min(255, parseInt(val, 10)));
  APP_STATE.brightness = bri;
  updateBrightnessUI(bri);
  wled.send({ bri: bri });
}

function updateSyncUI(send, recv) {
  const syncBtn = document.getElementById('headerSyncBtn');
  const syncText = document.getElementById('headerSyncText');
  const checkSend = document.getElementById('checkSyncSend');
  const checkRecv = document.getElementById('checkSyncRecv');

  if (syncBtn) {
    if (send) {
      syncBtn.classList.add('active');
      if (syncText) syncText.textContent = 'SYNC ACTIVE';
    } else {
      syncBtn.classList.remove('active');
      if (syncText) syncText.textContent = 'SYNC OFF';
    }
  }
  if (checkSend) checkSend.checked = !!send;
  if (checkRecv) checkRecv.checked = !!recv;
}

function renderDiscoveredNodes(nodes) {
  const container = document.getElementById('discoveredNodesList') || document.getElementById('discoveredNodesGrid');
  const countBadge = document.getElementById('nodesCountBadge');
  if (!container) return;
  container.innerHTML = '';

  const total = (nodes && nodes.length) ? nodes.length : 1;
  if (countBadge) countBadge.textContent = `${total} DEV`;

  const currentCard = document.createElement('div');
  currentCard.className = 'node-card active';
  currentCard.innerHTML = `
    <div class="node-status-bar">
      <span class="status-dot connected"></span>
      <span class="node-role-badge">PRIMARY ACTIVE</span>
    </div>
    <strong class="node-name">${APP_STATE.name || 'WLED Ambient Hub'}</strong>
    <span class="node-ip">${wled.ip}</span>
    <span class="node-arch">ESP32 • ${APP_STATE.ledCount} LEDs</span>
  `;
  container.appendChild(currentCard);

  if (nodes && nodes.length > 0) {
    nodes.forEach(node => {
      if (node.ip === wled.ip) return;
      const card = document.createElement('div');
      card.className = 'node-card';
      card.innerHTML = `
        <div class="node-status-bar">
          <span class="status-dot connected"></span>
          <span class="node-role-badge">SYNC NODE</span>
        </div>
        <strong class="node-name">${node.name || 'WLED Device'}</strong>
        <span class="node-ip">${node.ip}</span>
        <span class="node-arch">${node.type || 'ESP32/ESP8266'}</span>
        <button class="glass-btn btn-xs mt-2" data-switch-ip="${node.ip}">Switch to this Device</button>
      `;
      const btn = card.querySelector('button');
      if (btn) {
        btn.addEventListener('click', () => {
          wled.setIp(node.ip);
          showToast(`Switched target to ${node.ip}`);
        });
      }
      container.appendChild(card);
    });
  }
}

function updateStatus(text, isConnected) {
  const dot = document.getElementById('statusDot');
  const ipText = document.getElementById('displayIp');
  if (dot) {
    dot.className = isConnected ? 'status-dot connected' : 'status-dot disconnected';
  }
  if (ipText) ipText.textContent = APP_STATE.ip;
}

function showToast(msg) {
  const toast = document.getElementById('globalToast');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = msg;
  toast.classList.remove('hide');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hide'), 3500);
}

// Render Effects Grid
function renderEffectsGrid(effects) {
  const container = document.getElementById('effectsGrid');
  if (!container) return;

  document.getElementById('effectCountBadge').textContent = `${effects.length} effects`;
  container.innerHTML = '';

  effects.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.className = `fx-item-btn ${idx === APP_STATE.currentFx ? 'active' : ''}`;
    btn.id = `fxItemBtn_${idx}`;
    btn.textContent = `${idx}: ${name}`;
    btn.title = name;
    btn.addEventListener('click', () => {
      APP_STATE.currentFx = idx;
      highlightActiveEffect(idx);
      wled.send({ seg: { fx: idx } }, true);
      showToast(`Effect: ${name}`);
    });
    container.appendChild(btn);
  });
}

function highlightActiveEffect(id) {
  document.querySelectorAll('.fx-item-btn').forEach(btn => btn.classList.remove('active'));
  const active = document.getElementById(`fxItemBtn_${id}`);
  if (active) active.classList.add('active');
}

// Render Palettes Grid
function renderPalettesGrid(palettes) {
  const container = document.getElementById('palettesGrid');
  if (!container) return;

  document.getElementById('paletteCountBadge').textContent = `${palettes.length} palettes`;
  container.innerHTML = '';

  palettes.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.className = `pal-item-btn ${idx === APP_STATE.currentPal ? 'active' : ''}`;
    btn.id = `palItemBtn_${idx}`;
    btn.textContent = name;
    btn.title = name;
    btn.addEventListener('click', () => {
      APP_STATE.currentPal = idx;
      highlightActivePalette(idx);
      wled.send({ seg: { pal: idx } }, true);
      showToast(`Palette: ${name}`);
    });
    container.appendChild(btn);
  });
}

function highlightActivePalette(id) {
  document.querySelectorAll('.pal-item-btn').forEach(btn => btn.classList.remove('active'));
  const active = document.getElementById(`palItemBtn_${id}`);
  if (active) active.classList.add('active');
}

// ====================================================================
// Preset Customization Studio, Hardware Cards & Quick Scenes
// ====================================================================
let currentRenamingSlot = null;

function highlightActivePreset(slotId) {
  document.querySelectorAll('.hardware-preset-card').forEach(c => {
    if (parseInt(c.dataset.slot, 10) === parseInt(slotId, 10)) {
      c.classList.add('active-hardware-preset');
    } else {
      c.classList.remove('active-hardware-preset');
    }
  });
}

function updatePresetSlotOptions(selectedSlot) {
  const select = document.getElementById('presetSlotSelect');
  if (!select) return;

  const presets = APP_STATE.presetsList || {};
  const existingSlots = Object.keys(presets)
    .map(Number)
    .filter(n => n > 0 && !isNaN(n));

  // Determine lowest free slot
  let nextFreeSlot = 1;
  while (existingSlots.includes(nextFreeSlot) && nextFreeSlot < 250) {
    nextFreeSlot++;
  }

  const activeSlot = selectedSlot || nextFreeSlot;
  select.innerHTML = '';

  const maxSlot = Math.max(30, ...existingSlots, activeSlot);
  for (let i = 1; i <= Math.min(maxSlot, 250); i++) {
    const isUsed = existingSlots.includes(i);
    const opt = document.createElement('option');
    opt.value = i;
    if (isUsed) {
      const p = presets[i];
      opt.textContent = `Slot #${i} — "${p.n || 'Preset ' + i}"`;
    } else {
      opt.textContent = `Slot #${i} (Free Slot)`;
    }
    select.appendChild(opt);
  }

  select.value = activeSlot;
  updatePresetSlotHint(activeSlot);
}

function updatePresetSlotHint(slot) {
  const hint = document.getElementById('presetSlotStatusHint');
  if (!hint) return;
  const presets = APP_STATE.presetsList || {};
  if (presets[slot]) {
    hint.textContent = `⚠️ Slot #${slot} already has "${presets[slot].n || 'Preset ' + slot}". Saving will overwrite it.`;
    hint.style.color = '#f59e0b';
  } else {
    hint.textContent = `✅ Slot #${slot} is available.`;
    hint.style.color = '#38bdf8';
  }
}

function openPresetCreator(defaultSlot) {
  const panel = document.getElementById('presetCreatorPanel');
  if (!panel) return;
  panel.style.display = 'block';

  // Live Snapshot Preview update
  const dot1 = document.getElementById('previewColorDot1');
  const dot2 = document.getElementById('previewColorDot2');
  const dot3 = document.getElementById('previewColorDot3');
  if (dot1 && APP_STATE.colors[0]) dot1.style.background = `rgb(${APP_STATE.colors[0].join(',')})`;
  if (dot2 && APP_STATE.colors[1]) dot2.style.background = `rgb(${APP_STATE.colors[1].join(',')})`;
  if (dot3 && APP_STATE.colors[2]) dot3.style.background = `rgb(${APP_STATE.colors[2].join(',')})`;

  const fxNameEl = document.getElementById('previewEffectName');
  const effName = (APP_STATE.effectsList && APP_STATE.effectsList[APP_STATE.currentFx]) || 'Solid';
  if (fxNameEl) fxNameEl.textContent = effName;

  const palNameEl = document.getElementById('previewPaletteName');
  if (palNameEl) palNameEl.textContent = (APP_STATE.palettesList && APP_STATE.palettesList[APP_STATE.currentPal]) || 'Default';

  const briEl = document.getElementById('previewBrightness');
  if (briEl) briEl.textContent = `${Math.round(APP_STATE.brightness / 2.55)}% (${APP_STATE.brightness}/255)`;

  const speedIntEl = document.getElementById('previewSpeedInt');
  if (speedIntEl) speedIntEl.textContent = `${APP_STATE.speed} / ${APP_STATE.intensity}`;

  updatePresetSlotOptions(defaultSlot);

  // Set default suggested name
  const nameInput = document.getElementById('presetNameInput');
  if (nameInput) {
    nameInput.value = `🌅 ${effName} Mood`;
    nameInput.focus();
    nameInput.select();
  }

  // Clear emoji active highlights
  document.querySelectorAll('.emoji-chip').forEach(c => c.classList.remove('active'));
  const firstEmoji = document.querySelector('.emoji-chip[data-emoji="🌅"]');
  if (firstEmoji) firstEmoji.classList.add('active');

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePresetCreator() {
  const panel = document.getElementById('presetCreatorPanel');
  if (panel) panel.style.display = 'none';
}

function openRenamePresetModal(slotId, currentName) {
  currentRenamingSlot = slotId;
  const modal = document.getElementById('renamePresetModal');
  const desc = document.getElementById('renameModalDesc');
  const input = document.getElementById('modalRenamePresetInput');

  if (desc) desc.textContent = `Update name and title for Preset #${slotId}`;
  if (input) {
    input.value = currentName;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
  }
  if (modal) modal.classList.remove('hide');
}

function closeRenamePresetModal() {
  const modal = document.getElementById('renamePresetModal');
  if (modal) modal.classList.add('hide');
  currentRenamingSlot = null;
}

// Render Presets List
function renderPresetsList(presets = {}) {
  const container = document.getElementById('devicePresetsList');
  if (!container) return;
  container.innerHTML = '';

  const badge = document.getElementById('devicePresetsCountBadge');
  const searchInput = document.getElementById('searchPresetsInput');
  const query = (searchInput?.value || '').trim().toLowerCase();

  const allKeys = Object.keys(presets)
    .filter(k => k !== '0' && presets[k] && typeof presets[k] === 'object')
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  if (badge) {
    badge.textContent = `${allKeys.length} Preset${allKeys.length === 1 ? '' : 's'}`;
  }

  // Filter keys by search query
  const filteredKeys = allKeys.filter(k => {
    if (!query) return true;
    const p = presets[k];
    const name = (p.n || `Preset ${k}`).toLowerCase();
    return name.includes(query) || k.includes(query);
  });

  if (allKeys.length === 0) {
    container.innerHTML = `
      <div class="presets-empty-state">
        <div class="empty-icon">🎨</div>
        <h4>No Hardware Presets Stored Yet</h4>
        <p>Save your current lighting colors and effects directly to your ESP32's onboard LittleFS memory to recall them anytime.</p>
        <button class="primary-btn glow-btn btn-small" id="btnEmptyCreatePreset">
          <span class="btn-icon">💾</span>
          <span>Save Current State as Preset #1</span>
        </button>
      </div>
    `;
    document.getElementById('btnEmptyCreatePreset')?.addEventListener('click', () => {
      openPresetCreator(1);
    });
    return;
  }

  if (filteredKeys.length === 0) {
    container.innerHTML = `<div class="empty-hint">No presets matching "${query}"</div>`;
    return;
  }

  filteredKeys.forEach(k => {
    const p = presets[k];
    const rawName = p.n || `Preset ${k}`;
    const slotNum = parseInt(k, 10);

    // Extract emoji from name if present
    const emojiMatch = rawName.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF])/);
    const emoji = emojiMatch ? emojiMatch[1] : '⭐';
    const cleanTitle = emojiMatch ? rawName.replace(emojiMatch[1], '').trim() : rawName;

    // Segment info & colors
    const seg = (p.seg && p.seg[0]) ? p.seg[0] : null;
    const fxName = (seg && APP_STATE.effectsList && APP_STATE.effectsList[seg.fx]) ? APP_STATE.effectsList[seg.fx] : 'Solid';
    const briPct = p.bri !== undefined ? `${Math.round(p.bri / 2.55)}%` : '100%';

    // Build swatches
    let swatchesHtml = '';
    if (seg && Array.isArray(seg.col)) {
      seg.col.slice(0, 3).forEach(c => {
        if (Array.isArray(c) && c.length >= 3) {
          swatchesHtml += `<span class="preset-dot" style="background: rgb(${c[0]}, ${c[1]}, ${c[2]});"></span>`;
        }
      });
    }

    const card = document.createElement('div');
    card.className = 'hardware-preset-card';
    card.dataset.slot = slotNum;

    card.innerHTML = `
      <div class="preset-card-top">
        <span class="preset-slot-tag">#${slotNum}</span>
        <div class="preset-swatches">${swatchesHtml}</div>
      </div>
      <div class="preset-card-body" title="Click to activate Preset #${slotNum}">
        <span class="preset-icon">${emoji}</span>
        <div class="preset-info">
          <span class="preset-name" title="${rawName}">${cleanTitle || rawName}</span>
          <span class="preset-submeta">${fxName} • Bri: ${briPct}</span>
        </div>
      </div>
      <div class="preset-card-actions">
        <button class="preset-action-btn apply-btn" title="Activate Preset">▶ Apply</button>
        <button class="preset-action-btn overwrite-btn" title="Overwrite slot with current live lighting">🔄 Overwrite</button>
        <button class="preset-action-btn rename-btn" title="Rename Preset">✏️</button>
        <button class="preset-action-btn delete-btn" title="Delete from ESP32 memory">🗑️</button>
      </div>
    `;

    // Click on body or apply button -> apply
    const applyAction = () => {
      wled.applyPreset(slotNum);
    };
    card.querySelector('.preset-card-body').addEventListener('click', applyAction);
    card.querySelector('.apply-btn').addEventListener('click', applyAction);

    // Overwrite button
    card.querySelector('.overwrite-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Overwrite Preset #${slotNum} ("${rawName}") with your current live lighting state?`)) {
        await wled.savePreset(slotNum, rawName, { ib: true, sb: false });
      }
    });

    // Rename button
    card.querySelector('.rename-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openRenamePresetModal(slotNum, rawName);
    });

    // Delete button
    card.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Are you sure you want to delete Preset #${slotNum} ("${rawName}") from ESP32 memory?`)) {
        await wled.deletePreset(slotNum);
      }
    });

    container.appendChild(card);
  });
}

// Atmospheric Quick Scenes Pinning
function initPinnedScenes() {
  const customScenes = getPinnedScenes();
  renderPinnedScenes(customScenes);
}

function getPinnedScenes() {
  try {
    return JSON.parse(localStorage.getItem('wled_pinned_scenes') || '[]');
  } catch (e) {
    return [];
  }
}

function savePinnedScenes(scenes) {
  localStorage.setItem('wled_pinned_scenes', JSON.stringify(scenes));
}

function renderPinnedScenes(scenes) {
  const grid = document.getElementById('quickScenesGrid');
  if (!grid) return;

  // Remove existing pinned custom scene cards
  grid.querySelectorAll('.scene-card-custom').forEach(el => el.remove());

  scenes.forEach((scene, index) => {
    const btn = document.createElement('button');
    btn.className = 'scene-card scene-card-custom';
    btn.dataset.fx = scene.fx;
    btn.dataset.pal = scene.pal;
    btn.dataset.bri = scene.bri;
    btn.dataset.col = scene.col;

    btn.innerHTML = `
      <span class="scene-badge-custom">CUSTOM</span>
      <span class="scene-unpin-btn" title="Unpin scene">✕</span>
      <span class="scene-icon">${scene.icon || '✨'}</span>
      <span class="scene-name">${scene.name}</span>
      <span class="scene-desc">${scene.desc || 'Custom ambient look'}</span>
    `;

    // Click scene
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.scene-unpin-btn')) return;
      const col = hexToRgb(scene.col);
      APP_STATE.colors[0] = col;
      updateActiveColor(...col, false);
      wled.send({
        bri: scene.bri,
        seg: {
          fx: scene.fx,
          pal: scene.pal,
          col: [col, [0, 0, 0], [0, 0, 0]]
        }
      }, true);
      showToast(`Custom Scene: ${scene.name}`);
    });

    // Unpin button
    btn.querySelector('.scene-unpin-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const updated = getPinnedScenes().filter((_, i) => i !== index);
      savePinnedScenes(updated);
      renderPinnedScenes(updated);
      showToast(`Unpinned scene: ${scene.name}`);
    });

    grid.appendChild(btn);
  });
}

function pinCurrentLookToScenes() {
  const fxName = (APP_STATE.effectsList && APP_STATE.effectsList[APP_STATE.currentFx]) || 'Custom';
  const name = prompt('Enter a name for this Quick Scene:', `✨ ${fxName} Ambient`);
  if (!name || !name.trim()) return;

  const hexCol = rgbToHex(...APP_STATE.colors[0]);
  const emojiMatch = name.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF])/);
  const icon = emojiMatch ? emojiMatch[1] : '✨';

  const newScene = {
    name: name.trim(),
    icon: icon,
    desc: `${fxName} • ${Math.round(APP_STATE.brightness / 2.55)}% Bri`,
    col: hexCol,
    fx: APP_STATE.currentFx,
    pal: APP_STATE.currentPal,
    bri: APP_STATE.brightness
  };

  const scenes = getPinnedScenes();
  scenes.push(newScene);
  savePinnedScenes(scenes);
  renderPinnedScenes(scenes);
  showToast(`Pinned "${name}" to Quick Scenes!`);
}

// Math & Color Utilities
function hsvToRgb(h, s, v) {
  let r, g, b;
  const i = Math.floor((h / 60) % 6);
  const f = (h / 60) - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;

  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, v];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerp(start, end, amt) {
  return start + (end - start) * amt;
}

function boostSaturation(r, g, b, factor) {
  const [h, s, v] = rgbToHsv(r, g, b);
  const newS = Math.min(1.0, s * factor);
  const newV = (newS > 0.15 && v < 0.90) ? Math.min(1.0, v * (1.0 + (factor - 1.0) * 0.35)) : v;
  return hsvToRgb(h, newS, newV);
}

// ====================================================================
// Wire Event Listeners & Initialize
// ====================================================================
function initEventListeners() {
  // Navigation Tabs
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add('active');
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  // Master Power
  document.getElementById('masterPowerBtn')?.addEventListener('click', () => {
    APP_STATE.power = !APP_STATE.power;
    updatePowerUI(APP_STATE.power);
    wled.send({ on: APP_STATE.power }, true);
  });

  // Universal Brightness Synchronization (Master, Header, Movie, Music)
  ['sliderMasterBri', 'headerMasterBri', 'sliderMovieBri', 'sliderMusicBri'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        setGlobalBrightness(e.target.value, id);
      });
    }
  });

  // Quick Atmosphere Scenes (Lighting Studio Bar)
  document.getElementById('btnAtmosNight')?.addEventListener('click', () => {
    setGlobalBrightness(26);
    const col = [255, 120, 20];
    APP_STATE.colors[0] = col;
    updateActiveColor(...col, false);
    wled.send({ bri: 26, seg: { fx: 0, col: [col, [0,0,0], [0,0,0]] } }, true);
    showToast('Atmosphere: Night Dim 10%');
  });

  document.getElementById('btnAtmosWarm')?.addEventListener('click', () => {
    setGlobalBrightness(102);
    const col = [255, 147, 41];
    APP_STATE.colors[0] = col;
    updateActiveColor(...col, false);
    wled.send({ bri: 102, seg: { fx: 100, sx: 40, ix: 120, col: [col, [255, 90, 0], [0,0,0]] } }, true);
    showToast('Atmosphere: Warm Candle Relax');
  });

  document.getElementById('btnAtmosStudio')?.addEventListener('click', () => {
    setGlobalBrightness(255);
    const col = [255, 255, 255];
    APP_STATE.colors[0] = col;
    updateActiveColor(...col, false);
    wled.send({ bri: 255, seg: { fx: 0, col: [col, [0,0,0], [0,0,0]] } }, true);
    showToast('Atmosphere: Pure Daylight 100%');
  });

  document.getElementById('btnAtmosParty')?.addEventListener('click', () => {
    setGlobalBrightness(255);
    const col = [255, 0, 128];
    APP_STATE.colors[0] = col;
    updateActiveColor(...col, false);
    wled.send({ bri: 255, seg: { fx: 78, sx: 220, ix: 240, col: [col, [0, 242, 254], [0,0,0]] } }, true);
    showToast('Atmosphere: Party Blitz Strobe');
  });

  // Sleep Timer Countdown Modal & Logic
  let sleepTimerInterval = null;
  let sleepTimeRemainingSec = 0;
  const modalSleep = document.getElementById('sleepTimerModal');

  document.getElementById('btnSleepTimer')?.addEventListener('click', () => {
    modalSleep?.classList.remove('hide');
  });

  document.getElementById('btnCloseSleepModal')?.addEventListener('click', () => {
    modalSleep?.classList.add('hide');
  });

  document.querySelectorAll('.timer-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.min, 10);
      startSleepTimer(mins);
    });
  });

  function startSleepTimer(minutes) {
    clearInterval(sleepTimerInterval);
    sleepTimeRemainingSec = minutes * 60;
    const startBri = APP_STATE.brightness;
    const startTime = Date.now();
    const durationMs = minutes * 60 * 1000;

    const activeBox = document.getElementById('activeTimerBox');
    const display = document.getElementById('timerCountdownDisplay');
    const btnText = document.getElementById('sleepTimerText');
    if (activeBox) activeBox.classList.remove('hide');

    showToast(`Sleep Timer set for ${minutes} minutes`);

    sleepTimerInterval = setInterval(() => {
      sleepTimeRemainingSec--;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const newBri = Math.max(0, Math.round(startBri * (1 - progress)));

      setGlobalBrightness(newBri);

      const m = Math.floor(sleepTimeRemainingSec / 60);
      const s = sleepTimeRemainingSec % 60;
      const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      if (display) display.textContent = str;
      if (btnText) btnText.textContent = str;

      if (sleepTimeRemainingSec <= 0) {
        clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
        wled.send({ on: false }, true);
        if (activeBox) activeBox.classList.add('hide');
        if (btnText) btnText.textContent = 'Sleep Timer';
        showToast('Sleep Timer: Lights turned off. Goodnight!');
      }
    }, 1000);
  }

  document.getElementById('btnCancelSleepTimer')?.addEventListener('click', () => {
    clearInterval(sleepTimerInterval);
    sleepTimerInterval = null;
    document.getElementById('activeTimerBox')?.classList.add('hide');
    const btnText = document.getElementById('sleepTimerText');
    if (btnText) btnText.textContent = 'Sleep Timer';
    showToast('Sleep Timer canceled');
  });

  // Color Slots
  document.querySelectorAll('.color-slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-slot-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      APP_STATE.activeSlot = parseInt(btn.dataset.slot, 10);
      const [r, g, b] = APP_STATE.colors[APP_STATE.activeSlot] || [255, 0, 85];
      colorWheel.setColorRGB(r, g, b);
      updateActiveColor(r, g, b, false);
    });
  });

  // RGB Sliders
  ['sliderR', 'sliderG', 'sliderB'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const r = parseInt(document.getElementById('sliderR').value, 10);
      const g = parseInt(document.getElementById('sliderG').value, 10);
      const b = parseInt(document.getElementById('sliderB').value, 10);
      colorWheel.setColorRGB(r, g, b);
      updateActiveColor(r, g, b, true);
    });
  });

  // Hex Input & Apply
  document.getElementById('applyHexBtn')?.addEventListener('click', () => {
    const hex = document.getElementById('hexInput').value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      const [r, g, b] = hexToRgb(hex);
      colorWheel.setColorRGB(r, g, b);
      updateActiveColor(r, g, b, true);
    } else {
      showToast('Invalid Hex Code');
    }
  });

  // Quick Swatches
  document.querySelectorAll('.swatch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const [r, g, b] = hexToRgb(btn.dataset.hex);
      colorWheel.setColorRGB(r, g, b);
      updateActiveColor(r, g, b, true);
    });
  });

  // Effect Speed & Intensity
  document.getElementById('sliderSpeed')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    APP_STATE.speed = val;
    document.getElementById('speedValText').textContent = val;
    wled.send({ seg: { sx: val } });
  });

  document.getElementById('sliderIntensity')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    APP_STATE.intensity = val;
    document.getElementById('intensityValText').textContent = val;
    wled.send({ seg: { ix: val } });
  });

  // Search
  document.getElementById('searchEffectsInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.fx-item-btn').forEach(btn => {
      btn.style.display = btn.textContent.toLowerCase().includes(q) ? 'block' : 'none';
    });
  });

  document.getElementById('searchPalettesInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.pal-item-btn').forEach(btn => {
      btn.style.display = btn.textContent.toLowerCase().includes(q) ? 'block' : 'none';
    });
  });

  // Movie Sync (Ambilight)
  document.getElementById('btnStartMovieSync')?.addEventListener('click', () => movieSync.start());
  document.getElementById('btnStopMovieSync')?.addEventListener('click', () => movieSync.stop());

  // Monitor Zone Layout mode selector buttons (delegation)
  const ambilightModeSelect = document.getElementById('ambilightModeSelect');
  if (ambilightModeSelect) {
    ambilightModeSelect.addEventListener('click', (e) => {
      const btn = e.target.closest('.zone-mode-btn');
      if (btn && btn.dataset.mode) {
        e.preventDefault();
        movieSync.setMode(btn.dataset.mode);
      }
    });
  }



  document.getElementById('sliderMovieSmoothing')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    movieSync.smoothing = val;
    let label = 'Smooth';
    if (val <= 0.15) label = 'Ultra Soft';
    else if (val <= 0.3) label = 'Cinematic';
    else if (val <= 0.55) label = 'Responsive';
    else if (val <= 0.8) label = 'Fast';
    else label = 'Instant (Gaming)';
    const textEl = document.getElementById('smoothingValText');
    if (textEl) textEl.textContent = `${label} (${val.toFixed(2)})`;
  });

  document.getElementById('checkAntiFlicker')?.addEventListener('change', (e) => {
    movieSync.antiFlickerEnabled = e.target.checked;
    try { localStorage.setItem('ambilight_anti_flicker', e.target.checked ? 'true' : 'false'); } catch (err) {}
    showToast(e.target.checked ? '🛡️ Anti-Flicker Enabled (Noise Gate Active)' : '⚠️ Anti-Flicker Disabled');
  });

  document.getElementById('sliderDeadband')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    movieSync.deadbandThreshold = val;
    try { localStorage.setItem('ambilight_deadband', val.toString()); } catch (err) {}
    movieSync.updateDeadbandText(val);
  });

  document.getElementById('checkSceneCutSnap')?.addEventListener('change', (e) => {
    movieSync.sceneCutSnapEnabled = e.target.checked;
    try { localStorage.setItem('ambilight_scene_cut_snap', e.target.checked ? 'true' : 'false'); } catch (err) {}
    showToast(e.target.checked ? '⚡ Instant Scene-Cut Snap Enabled' : 'Scene-Cut Snap Disabled');
  });

  document.getElementById('sliderMovieSaturation')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    movieSync.saturation = val;
    let label = '';
    if (val <= 1.0) label = 'Natural';
    else if (val <= 1.3) label = 'Enhanced';
    else if (val <= 1.8) label = 'Vivid';
    else label = 'Hyper-Saturated';
    const textEl = document.getElementById('saturationValText');
    if (textEl) textEl.textContent = `${val.toFixed(1)}x (${label})`;
  });

  document.getElementById('sliderBlackFloor')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    movieSync.blackFloor = val;
    const textEl = document.getElementById('blackFloorValText');
    if (textEl) textEl.textContent = val === 0 ? '0 (True Black)' : `${val} (Ambient Floor)`;
  });

  document.getElementById('checkLetterboxFilter')?.addEventListener('change', (e) => {
    movieSync.letterboxFilter = e.target.checked;
    if (!e.target.checked) {
      document.getElementById('cropGuideTop')?.classList.add('hide');
      document.getElementById('cropGuideBottom')?.classList.add('hide');
    }
  });

  document.getElementById('sliderLetterboxSens')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    movieSync.letterboxSensitivity = val;
    try { localStorage.setItem('ambilight_letterbox_sens', val.toString()); } catch (err) {}
    const textEl = document.getElementById('letterboxSensValText');
    if (textEl) textEl.textContent = `Adaptive (${val})`;
  });

  document.getElementById('checkDangerStrobe')?.addEventListener('change', (e) => {
    movieSync.dangerStrobeEnabled = e.target.checked;
    try { localStorage.setItem('ambilight_danger_strobe', e.target.checked ? 'true' : 'false'); } catch (err) {}
  });

  document.getElementById('sliderDangerSens')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    movieSync.dangerSensitivity = val;
    try { localStorage.setItem('ambilight_danger_sens', val.toString()); } catch (err) {}
    let label = 'Medium';
    if (val <= 1.4) label = 'Sensitive';
    else if (val >= 2.0) label = 'Strict';
    const textEl = document.getElementById('dangerSensValText');
    if (textEl) textEl.textContent = `${label} (${val.toFixed(1)}x)`;
  });

  document.getElementById('sliderDangerHz')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    movieSync.dangerHz = val;
    try { localStorage.setItem('ambilight_danger_hz', val.toString()); } catch (err) {}
    const textEl = document.getElementById('dangerHzValText');
    if (textEl) textEl.textContent = `${val} Hz (Pulse Rate)`;
  });

  document.getElementById('checkFastEdgeBoost')?.addEventListener('change', (e) => {
    movieSync.fastEdgeBoost = e.target.checked;
    try { localStorage.setItem('ambilight_fast_edge', e.target.checked ? 'true' : 'false'); } catch (err) {}
    showToast(`Fast Edge FPS Boost: ${e.target.checked ? 'Enabled' : 'Disabled'}`);
  });

  // Music Reactive Sync
  document.querySelectorAll('.btn-source').forEach(btn => {
    btn.addEventListener('click', () => {
      musicSync.setSource(btn.dataset.source);
    });
  });

  document.getElementById('btnStartMusicSync')?.addEventListener('click', () => musicSync.start());
  document.getElementById('btnStopMusicSync')?.addEventListener('click', () => musicSync.stop());

  // Spectrum Palettes Selector
  document.querySelectorAll('#spectrumPalettesGrid .spec-pal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#spectrumPalettesGrid .spec-pal-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      musicSync.paletteName = btn.dataset.pal;
      showToast(`Spectrum Palette: ${btn.querySelector('.pal-name')?.textContent || btn.dataset.pal}`);
    });
  });

  // Custom 3-Stop Spectrum Palette Builder
  const updateCustomPalPreview = () => {
    const c0 = document.getElementById('customColor0')?.value || '#ff0055';
    const c1 = document.getElementById('customColor1')?.value || '#00f2fe';
    const c2 = document.getElementById('customColor2')?.value || '#a855f7';
    const bar = document.getElementById('customPalPreviewBar');
    if (bar) bar.style.background = `linear-gradient(to right, ${c0}, ${c1}, ${c2})`;
    const swatch = document.getElementById('customPalPreviewSwatch');
    if (swatch) swatch.style.background = `linear-gradient(135deg, ${c0}, ${c1}, ${c2})`;
    SPECTRUM_PALETTES.custom = [hexToRgb(c0), hexToRgb(c1), hexToRgb(c2)];
  };

  ['customColor0', 'customColor1', 'customColor2'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateCustomPalPreview);
  });

  document.getElementById('btnRandomCustomPal')?.addEventListener('click', () => {
    const randHex = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const c0 = document.getElementById('customColor0');
    const c1 = document.getElementById('customColor1');
    const c2 = document.getElementById('customColor2');
    if (c0) c0.value = randHex();
    if (c1) c1.value = randHex();
    if (c2) c2.value = randHex();
    updateCustomPalPreview();
    showToast('Generated random 3-stop spectrum theme!');
  });

  const activateCustomPal = () => {
    updateCustomPalPreview();
    document.querySelectorAll('#spectrumPalettesGrid .spec-pal-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnCustomPalSelect')?.classList.add('active');
    musicSync.paletteName = 'custom';
    showToast('Custom Spectrum Theme Activated!');
  };

  document.getElementById('btnApplyCustomPal')?.addEventListener('click', activateCustomPal);
  document.getElementById('btnCustomPalSelect')?.addEventListener('click', activateCustomPal);

  // Spectrum Mode Selector
  document.querySelectorAll('#musicModeGrid .mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#musicModeGrid .mode-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      musicSync.mode = card.dataset.mode;
    });
  });

  document.getElementById('sliderMicGain')?.addEventListener('input', (e) => {
    musicSync.gain = parseFloat(e.target.value);
    document.getElementById('micGainValText').textContent = `${e.target.value}x`;
  });

  document.getElementById('sliderNoiseGate')?.addEventListener('input', (e) => {
    musicSync.noiseGate = parseInt(e.target.value, 10);
    document.getElementById('noiseGateValText').textContent = e.target.value;
  });

  document.getElementById('sliderBeatThreshold')?.addEventListener('input', (e) => {
    musicSync.beatThreshold = parseFloat(e.target.value);
    document.getElementById('beatThresholdValText').textContent = `${e.target.value}x`;
  });

  document.getElementById('sliderDecaySpeed')?.addEventListener('input', (e) => {
    musicSync.decaySpeed = parseFloat(e.target.value);
    document.getElementById('decaySpeedValText').textContent = e.target.value;
  });

  // Presets & Scenes
  document.querySelectorAll('.scene-card').forEach(card => {
    card.addEventListener('click', () => {
      const fx = parseInt(card.dataset.fx, 10);
      const pal = parseInt(card.dataset.pal, 10);
      const bri = parseInt(card.dataset.bri, 10);
      const col = hexToRgb(card.dataset.col);

      APP_STATE.colors[0] = col;
      updateActiveColor(...col, false);

      wled.send({
        bri: bri,
        seg: {
          fx: fx,
          pal: pal,
          col: [col, [0,0,0], [0,0,0]]
        }
      }, true);

      showToast(`Scene: ${card.querySelector('.scene-name')?.textContent || 'Preset'}`);
    });
  });

  // Multi-Device Hub & UDP Sync
  let isUdpSyncActive = false;
  const syncBtn = document.getElementById('headerSyncBtn');
  const syncText = document.getElementById('headerSyncText');
  const checkSend = document.getElementById('checkSyncSend');
  const checkRecv = document.getElementById('checkSyncRecv');

  syncBtn?.addEventListener('click', () => {
    isUdpSyncActive = !isUdpSyncActive;
    wled.setUdpSync(isUdpSyncActive, isUdpSyncActive);
    updateSyncUI(isUdpSyncActive, isUdpSyncActive);
  });

  checkSend?.addEventListener('change', (e) => {
    wled.setUdpSync(e.target.checked, checkRecv ? checkRecv.checked : true);
  });
  checkRecv?.addEventListener('change', (e) => {
    wled.setUdpSync(checkSend ? checkSend.checked : true, e.target.checked);
  });

  document.getElementById('btnTestSyncPulse')?.addEventListener('click', () => {
    wled.testSyncPulse();
  });

  document.getElementById('btnScanNetworkNodes')?.addEventListener('click', () => {
    showToast('Scanning network for WLED devices...');
    wled.fetchNodes();
  });

  document.getElementById('btnSwitchTargetIp')?.addEventListener('click', () => {
    const targetInput = document.getElementById('inputSwitchTargetIp') || document.getElementById('switchTargetIpInput');
    const targetIp = targetInput?.value.trim();
    if (targetIp) {
      wled.setIp(targetIp);
      const ipInput = document.getElementById('wledIpInput');
      if (ipInput) ipInput.value = targetIp;
      showToast(`Switched active controller to ${targetIp}`);
    }
  });

  document.getElementById('btnSaveWifiCredentials')?.addEventListener('click', () => {
    const ssid = document.getElementById('wifiSsidInput')?.value.trim() || 'pk';
    const pwd = document.getElementById('wifiPasswordInput')?.value.trim() || '00000000';
    wled.saveWifi(ssid, pwd);
  });

  document.getElementById('btnToggleWifiPwd')?.addEventListener('click', () => {
    const pwdInput = document.getElementById('wifiPasswordInput');
    if (pwdInput) {
      pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
    }
  });

  // Add Custom Device Modal
  const modalAddDev = document.getElementById('addDeviceModal');
  const btnAddDev = document.getElementById('btnAddCustomDeviceModalBtn') || document.getElementById('btnAddCustomDevice');
  btnAddDev?.addEventListener('click', () => {
    modalAddDev?.classList.remove('hide');
  });
  document.getElementById('btnCloseAddDevModal')?.addEventListener('click', () => {
    modalAddDev?.classList.add('hide');
  });
  document.getElementById('btnConfirmAddDevice')?.addEventListener('click', () => {
    const devIp = document.getElementById('modalDevIpInput')?.value.trim();
    if (devIp) {
      modalAddDev?.classList.add('hide');
      wled.setIp(devIp);
      showToast(`Connected to custom device: ${devIp}`);
    }
  });

  // Settings
  document.getElementById('saveIpBtn')?.addEventListener('click', () => {
    const newIp = document.getElementById('wledIpInput').value.trim();
    if (newIp) {
      wled.setIp(newIp);
      document.getElementById('linkNativeWled').href = `http://${newIp}/`;
      document.getElementById('linkConfigWled').href = `http://${newIp}/settings`;
      document.getElementById('linkUiConfigWled').href = `http://${newIp}/settings/ui`;
      showToast(`Connecting to ${newIp}...`);
    }
  });

  document.getElementById('ledCountInput')?.addEventListener('change', (e) => {
    const count = parseInt(e.target.value, 10);
    if (count > 0) {
      APP_STATE.ledCount = count;
      localStorage.setItem('wled_led_count', count);
      document.getElementById('ledCountBadge').textContent = count;
      virtualStrip.resize(count);
      movieSync.renderDivisionControls();
      showToast(`LED Count: ${count}`);
    }
  });

  document.getElementById('btnRefreshDeviceStats')?.addEventListener('click', () => {
    wled.fetchInitialData();
    showToast('Refreshing telemetry...');
  });

  document.getElementById('refreshPresetsBtn')?.addEventListener('click', () => {
    wled.fetchInitialData();
    showToast('Refreshing presets from ESP32...');
  });

  // ==================================================================
  // Preset Customization Studio & Events
  // ==================================================================
  document.getElementById('btnOpenSavePresetModal')?.addEventListener('click', () => {
    openPresetCreator();
  });

  document.getElementById('btnClosePresetCreator')?.addEventListener('click', () => {
    closePresetCreator();
  });

  document.getElementById('btnCancelPresetCreator')?.addEventListener('click', () => {
    closePresetCreator();
  });

  document.getElementById('presetSlotSelect')?.addEventListener('change', (e) => {
    updatePresetSlotHint(parseInt(e.target.value, 10));
  });

  // Suggestion chips
  document.querySelectorAll('.sugg-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const nameInput = document.getElementById('presetNameInput');
      if (nameInput) {
        nameInput.value = chip.textContent.trim();
        nameInput.focus();
      }
    });
  });

  // Emoji picker chips
  document.querySelectorAll('.emoji-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.emoji-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const emoji = chip.dataset.emoji;
      const nameInput = document.getElementById('presetNameInput');
      if (nameInput) {
        let val = nameInput.value.trim();
        const emojiRegex = /^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF])\s*/;
        if (emojiRegex.test(val)) {
          val = val.replace(emojiRegex, `${emoji} `);
        } else {
          val = `${emoji} ${val}`;
        }
        nameInput.value = val;
        nameInput.focus();
      }
    });
  });

  // Confirm Save Preset
  document.getElementById('btnSavePresetConfirm')?.addEventListener('click', async () => {
    const slot = parseInt(document.getElementById('presetSlotSelect').value, 10) || 1;
    const name = document.getElementById('presetNameInput').value.trim() || `Preset ${slot}`;
    const ib = document.getElementById('presetOptIncludeBri')?.checked ?? true;
    const sb = document.getElementById('presetOptSaveBounds')?.checked ?? false;

    const ok = await wled.savePreset(slot, name, { ib, sb });
    if (ok) {
      closePresetCreator();
    }
  });

  // Search Presets Filter
  document.getElementById('searchPresetsInput')?.addEventListener('input', () => {
    renderPresetsList(APP_STATE.presetsList);
  });

  // Pin Current Look to Atmospheric Quick Scenes
  document.getElementById('btnPinCurrentScene')?.addEventListener('click', () => {
    pinCurrentLookToScenes();
  });

  // Rename Preset Modal
  document.getElementById('btnCloseRenamePresetModal')?.addEventListener('click', closeRenamePresetModal);
  document.getElementById('btnCancelRenamePreset')?.addEventListener('click', closeRenamePresetModal);
  document.getElementById('btnConfirmRenamePreset')?.addEventListener('click', async () => {
    if (!currentRenamingSlot) return;
    const newName = document.getElementById('modalRenamePresetInput').value.trim();
    if (newName) {
      await wled.savePreset(currentRenamingSlot, newName, { ib: true, sb: false });
      closeRenamePresetModal();
    }
  });
}

// ====================================================================
// Web Portal Multi-Theme Engine
// ====================================================================
const PORTAL_THEMES = {
  aurora: {
    id: 'aurora',
    name: 'Cyberpunk Aurora',
    icon: '🌌',
    desc: 'Deep cosmic indigo & cyan neon mesh with frosted acrylics',
    palette: ['#070913', '#6366f1', '#06b6d4', '#ec4899']
  },
  oled: {
    id: 'oled',
    name: 'OLED Void Black',
    icon: '⬛',
    desc: 'True #000000 pitch black with ultra-deep cinema contrast',
    palette: ['#000000', '#14151a', '#38bdf8', '#ffffff']
  },
  synthwave: {
    id: 'synthwave',
    name: 'Synthwave 80s',
    icon: '🌆',
    desc: 'Neon magenta, retro violet & warm glowing arcade sunset',
    palette: ['#0d061c', '#f43f5e', '#c084fc', '#fbbf24']
  },
  matrix: {
    id: 'matrix',
    name: 'Emerald Matrix',
    icon: '🟩',
    desc: 'Cybernetic bio-hacker, obsidian black & electric mint',
    palette: ['#030d08', '#0e3020', '#10b981', '#2dd4bf']
  },
  ember: {
    id: 'ember',
    name: 'Solar Ember',
    icon: '🔥',
    desc: 'Molten lava, warm dark charcoal & golden hearth embers',
    palette: ['#120906', '#3a1c12', '#f97316', '#ef4444']
  },
  nordic: {
    id: 'nordic',
    name: 'Nordic Frost',
    icon: '❄️',
    desc: 'Crystalline polar slate, arctic blue & glacial glass highlights',
    palette: ['#080f1a', '#1a2e4c', '#38bdf8', '#818cf8']
  }
};

function applyPortalTheme(themeId, notify = true) {
  const theme = PORTAL_THEMES[themeId] || PORTAL_THEMES.aurora;
  document.documentElement.setAttribute('data-theme', theme.id);
  localStorage.setItem('wled_ui_theme', theme.id);

  // Update header button
  const iconEl = document.getElementById('headerThemeIcon');
  const textEl = document.getElementById('headerThemeText');
  if (iconEl) iconEl.textContent = theme.icon;
  if (textEl) textEl.textContent = theme.name.split(' ')[0] || theme.name;

  // Update active state in dropdown
  document.querySelectorAll('.theme-option-btn').forEach(btn => {
    if (btn.dataset.theme === theme.id) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update active badge in Settings tab
  const badgeEl = document.getElementById('activeThemeBadge');
  if (badgeEl) badgeEl.textContent = `${theme.icon} ${theme.name} (Active)`;

  // Update active class on studio cards
  document.querySelectorAll('.theme-studio-card-item').forEach(card => {
    if (card.dataset.theme === theme.id) {
      card.classList.add('active');
      const tag = card.querySelector('.theme-active-tag');
      if (tag) tag.style.display = 'inline-block';
    } else {
      card.classList.remove('active');
      const tag = card.querySelector('.theme-active-tag');
      if (tag) tag.style.display = 'none';
    }
  });

  if (notify) {
    showToast(`Portal Theme: ${theme.icon} ${theme.name}`);
  }
}

function renderThemeStudioCards() {
  const container = document.getElementById('themeStudioCards');
  if (!container) return;
  container.innerHTML = '';

  const activeThemeId = localStorage.getItem('wled_ui_theme') || 'aurora';

  Object.values(PORTAL_THEMES).forEach(theme => {
    const card = document.createElement('div');
    card.className = `theme-studio-card-item ${theme.id === activeThemeId ? 'active' : ''}`;
    card.dataset.theme = theme.id;

    const paletteHtml = theme.palette.map(c => `<span style="background: ${c};"></span>`).join('');

    card.innerHTML = `
      <div class="theme-card-top-row">
        <div class="theme-card-title-box">
          <span class="theme-card-icon">${theme.icon}</span>
          <span class="theme-card-name">${theme.name}</span>
        </div>
        <span class="theme-active-tag" style="${theme.id === activeThemeId ? '' : 'display: none;'}">Active</span>
      </div>
      <p class="theme-card-desc">${theme.desc}</p>
      <div class="theme-palette-preview">
        ${paletteHtml}
      </div>
    `;

    card.addEventListener('click', () => {
      applyPortalTheme(theme.id);
    });

    container.appendChild(card);
  });
}

function initPortalTheme() {
  const savedTheme = localStorage.getItem('wled_ui_theme') || 'aurora';
  applyPortalTheme(savedTheme, false);
  renderThemeStudioCards();

  // Header Dropdown Toggle
  const headerBtn = document.getElementById('headerThemeBtn');
  const dropdownWrapper = document.querySelector('.theme-dropdown-wrapper');
  const dropdownMenu = document.getElementById('themeDropdownMenu');

  headerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle('hide');
    dropdownWrapper?.classList.toggle('open');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-dropdown-wrapper')) {
      dropdownMenu?.classList.add('hide');
      dropdownWrapper?.classList.remove('open');
    }
  });

  // Header Dropdown options
  document.querySelectorAll('.theme-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const themeId = btn.dataset.theme;
      applyPortalTheme(themeId);
      dropdownMenu?.classList.add('hide');
      dropdownWrapper?.classList.remove('open');
    });
  });
}

