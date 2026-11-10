// ====================================================================
// QR Connect & Mobile Web Studio Controller
// ====================================================================
const qrStudio = {
  webQr: null,
  wifiQr: null,

  init() {
    this.renderQRCodes();
    this.bindEvents();
  },

  renderQRCodes() {
    const currentIp = APP_STATE.ip || (typeof window !== 'undefined' ? window.location.hostname : '10.142.252.233') || '10.142.252.233';
    const webUrl = `http://${currentIp}/`;
    const wifiPayload = 'WIFI:T:WPA;S:v20p;P:honululu;;';

    // Update UI Badges & Links
    const ipBadge = document.getElementById('qrWebIpBadge');
    if (ipBadge) ipBadge.textContent = currentIp;

    const directLink = document.getElementById('qrWebDirectLink');
    if (directLink) {
      directLink.href = webUrl;
      directLink.textContent = webUrl;
    }

    // Render Web Studio QR
    const webContainer = document.getElementById('qrWebCanvasContainer');
    if (webContainer && typeof QRCode !== 'undefined') {
      webContainer.innerHTML = '';
      try {
        this.webQr = new QRCode(webContainer, {
          text: webUrl,
          width: 180,
          height: 180,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (e) {
        console.error('Failed to generate Web QR:', e);
      }
    }

    // Render Wi-Fi Quick-Join QR
    const wifiContainer = document.getElementById('qrWifiCanvasContainer');
    if (wifiContainer && typeof QRCode !== 'undefined') {
      wifiContainer.innerHTML = '';
      try {
        this.wifiQr = new QRCode(wifiContainer, {
          text: wifiPayload,
          width: 180,
          height: 180,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (e) {
        console.error('Failed to generate Wi-Fi QR:', e);
      }
    }
  },

  bindEvents() {
    // Push Web QR to Physical OLED Display (Mode 5)
    document.getElementById('btnPushWebQrToOled')?.addEventListener('click', async () => {
      try {
        const targetIp = APP_STATE.ip || defaultTargetIp;
        showToast('Pushing Web Studio QR to OLED...');
        await fetch(`http://${targetIp}/set?oledmode=5`);
        if (typeof oledStudio !== 'undefined') {
          oledStudio.state.mode = 5;
          oledStudio.syncUI();
        }
        showToast('📱 Web Studio QR displayed on OLED screen!');
      } catch (e) {
        showToast(`Error: ${e.message}`);
      }
    });

    // Push Wi-Fi Quick-Join QR to Physical OLED Display (Mode 6)
    document.getElementById('btnPushWifiQrToOled')?.addEventListener('click', async () => {
      try {
        const targetIp = APP_STATE.ip || defaultTargetIp;
        showToast('Pushing Wi-Fi Join QR to OLED...');
        await fetch(`http://${targetIp}/set?oledmode=6`);
        if (typeof oledStudio !== 'undefined') {
          oledStudio.state.mode = 6;
          oledStudio.syncUI();
        }
        showToast('📶 Wi-Fi Quick-Join QR displayed on OLED screen!');
      } catch (e) {
        showToast(`Error: ${e.message}`);
      }
    });

    // Return to Watch Face (Mode 1)
    document.getElementById('btnReturnToWatchFace')?.addEventListener('click', async () => {
      try {
        const targetIp = APP_STATE.ip || defaultTargetIp;
        await fetch(`http://${targetIp}/set?oledmode=1`);
        if (typeof oledStudio !== 'undefined') {
          oledStudio.state.mode = 1;
          oledStudio.syncUI();
        }
        showToast('⌚ OLED returned to Watch Face');
      } catch (e) {
        showToast(`Error: ${e.message}`);
      }
    });

    // Copy Web Studio URL Button
    document.getElementById('btnCopyWebUrl')?.addEventListener('click', async () => {
      const currentIp = APP_STATE.ip || '10.142.252.233';
      const url = `http://${currentIp}/`;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const input = document.createElement('input');
          input.value = url;
          document.body.appendChild(input);
          input.select();
          document.execCommand('copy');
          document.body.removeChild(input);
        }
        showToast('📋 Copied URL to clipboard: ' + url);
      } catch (e) {
        showToast('URL: ' + url);
      }
    });
  }
};

