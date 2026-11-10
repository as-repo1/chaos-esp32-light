// Window globals for debugging & synchronization
window._wled = wled;
window._movieSync = movieSync;
window._musicSync = musicSync;
window._oledStudio = oledStudio;
window._colorCalib = colorCalibrationStudio;
window._qrStudio = qrStudio;
window.setAmbilightMode = (m) => movieSync.setMode(m);

function bootApp() {
  console.log(
    '%c Chaos ESP32 Light %c Powered by WLED (Aircoookie) ',
    'background:#6366f1;color:#fff;font-weight:bold;padding:4px 8px;border-radius:4px 0 0 4px;',
    'background:#10b981;color:#fff;font-weight:bold;padding:4px 8px;border-radius:0 4px 4px 0;'
  );
  try { colorWheel.init(); } catch (e) { console.error('colorWheel init error:', e); }
  try { virtualStrip.init(); } catch (e) { console.error('virtualStrip init error:', e); }
  try { movieSync.init(); } catch (e) { console.error('movieSync init error:', e); }
  try { musicSync.init(); } catch (e) { console.error('musicSync init error:', e); }
  try { initEventListeners(); } catch (e) { console.error('initEventListeners error:', e); }
  try { initPinnedScenes(); } catch (e) { console.error('initPinnedScenes error:', e); }
  try { initPortalTheme(); } catch (e) { console.error('initPortalTheme error:', e); }
  try { oledStudio.init(); } catch (e) { console.error('oledStudio init error:', e); }
  try { colorCalibrationStudio.init(); } catch (e) { console.error('colorCalibrationStudio init error:', e); }
  try { qrStudio.init(); } catch (e) { console.error('qrStudio init error:', e); }
  try { wled.connect(); } catch (e) { console.error('wled connect error:', e); }
  try { wled.fetchInitialData(); } catch (e) { console.error('wled fetchInitialData error:', e); }

  // Localhost Secure Context check for Screen Capture & Audio
  try {
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isSecure = typeof window !== 'undefined' && (window.isSecureContext || isLocal);
    const alertEl = document.getElementById('screencapLocalhostAlert');
    if (alertEl) {
      if (!isSecure) {
        alertEl.classList.remove('hide');
        const link = document.getElementById('btnOpenLocalhostStudio');
        if (link) link.href = `http://localhost:8080/?ip=${APP_STATE.ip}&autostart=movie`;
      } else {
        alertEl.classList.add('hide');
      }
    }
  } catch (e) {}

  // Handle URL query autostart parameter (?autostart=movie or ?autostart=music)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const autostart = urlParams.get('autostart');
    if (autostart === 'movie') {
      setTimeout(() => {
        document.getElementById('tabBtnMovie')?.click();
        movieSync.start();
      }, 700);
    } else if (autostart === 'music') {
      setTimeout(() => {
        document.getElementById('tabBtnMusic')?.click();
        musicSync.start();
      }, 700);
    }
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
