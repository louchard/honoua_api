
// scanner-capsule.js
(function () {
  console.log("Mon code JS  de scanner-capsule est joué");
  'use strict';

  /**
   * Capsule scanner réutilisable
   *
   * @param {Object} config
   * @param {HTMLVideoElement}   config.videoEl
   * @param {HTMLElement}        config.messageEl
   * @param {HTMLSelectElement}  config.camerasSelectEl
   * @param {HTMLButtonElement}  config.startBtn
   * @param {HTMLButtonElement}  config.stopBtn
   * @param {HTMLButtonElement}  config.torchBtn
   * @param {HTMLInputElement}   config.eanInput
   * @param {HTMLButtonElement}  config.testBtn
   * @param {Function}           config.onEanDetected  // callback(ean)
   */
  function createScannerCapsule(config) {
    const {
      videoEl,
      messageEl,
      camerasSelectEl,
      startBtn,
      stopBtn,
      torchBtn,
      eanInput,
      testBtn,
      onEanDetected,
    } = config;

    let currentStream = null;
    let currentTrack = null;
    let torchSupported = false;
    let torchOn = false;
    let messageTimeout = null;

    // ========== Messages ==========
    function clearMessage() {
      if (!messageEl) return;
      messageEl.className = 'scanner-message scanner-message--hidden';
      messageEl.textContent = '';
      if (messageTimeout) {
        clearTimeout(messageTimeout);
        messageTimeout = null;
      }
    }

    function showInfo(text, timeoutMs = 2500) {
      if (!messageEl) return;
      clearMessage();
      messageEl.textContent = text;
      messageEl.className = 'scanner-message scanner-message--info';
      if (timeoutMs) {
        messageTimeout = setTimeout(clearMessage, timeoutMs);
      }
    }

    function showError(text, timeoutMs = 3500) {
      if (!messageEl) return;
      clearMessage();
      messageEl.textContent = text;
      messageEl.className = 'scanner-message scanner-message--error';
      if (timeoutMs) {
        messageTimeout = setTimeout(clearMessage, timeoutMs);
      }
    }

    // ========== Caméra ==========
    async function stopStream() {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
      }
      currentStream = null;
      currentTrack = null;
      torchOn = false;
    }

    async function listCameras() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        throw new Error('enumerateDevices non supporté');
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    }

    function pickBackCamera(videoDevices) {
      if (!videoDevices.length) return null;
      const back = videoDevices.find(d =>
        /back|arrière|rear/i.test(d.label || '')
      );
      return back || videoDevices[0];
    }

    async function initCameras() {
      if (!camerasSelectEl) return;
      const devices = await listCameras();
      camerasSelectEl.innerHTML = '';
      devices.forEach((d, index) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Caméra ${index + 1}`;
        camerasSelectEl.appendChild(opt);
      });
      if (!devices.length) {
        showError('Aucune caméra détectée sur cet appareil.', 0);
      }
    }

    async function startWith(deviceId) {
      try {
        await stopStream();

        const constraints = deviceId
          ? { video: { deviceId: { exact: deviceId } } }
          : { video: { facingMode: { ideal: 'environment' } } };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        if (videoEl) {
          videoEl.srcObject = stream;
        }
        currentTrack = stream.getVideoTracks()[0] || null;
        showInfo('Caméra active, place le code-barres dans le cadre.', 3000);

        if (currentTrack) {
          await detectTorchSupport(currentTrack);
        }
      } catch (e) {
        console.error('[ScannerCapsule] Erreur getUserMedia :', e);
        if (!window.isSecureContext) {
          showError('Le scanner nécessite HTTPS ou http://localhost.', 0);
        } else if (e.name === 'NotAllowedError') {
          showError('Accès à la caméra refusé. Autorise la caméra dans ton navigateur.', 0);
        } else if (e.name === 'NotFoundError') {
          showError('Aucune caméra trouvée sur cet appareil.', 0);
        } else {
          showError('Impossible de démarrer la caméra.', 0);
        }
      }
    }

    async function detectTorchSupport(track) {
      if (!track.getCapabilities) {
        torchSupported = false;
        if (torchBtn) torchBtn.disabled = true;
        return;
      }
      const caps = track.getCapabilities();
      torchSupported = !!caps.torch;
      if (torchBtn) torchBtn.disabled = !torchSupported;
    }

    async function toggleTorch() {
      if (!torchSupported || !currentTrack) return;
      try {
        torchOn = !torchOn;
        await currentTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
      } catch (e) {
        console.warn('[ScannerCapsule] Torch non disponible', e);
      }
    }

    // ========== EAN manuel ==========
    function triggerManualEan() {
      if (!eanInput) return;
      const ean = (eanInput.value || '').trim();
      if (!ean) {
        showError('Entre un code EAN avant de tester.');
        eanInput.focus();
        return;
      }
      if (typeof onEanDetected === 'function') {
        onEanDetected(ean);
      } else {
        console.log('[ScannerCapsule] EAN détecté (manuel) :', ean);
      }
    }

    // ========== Événements ==========
    function bindEvents() {
      if (startBtn) {
        startBtn.addEventListener('click', async () => {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError('Caméra non supportée sur cet appareil.', 0);
            return;
          }
          try {
            // petit getUserMedia pour débloquer les labels
            try {
              const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
              tmp.getTracks().forEach(t => t.stop());
            } catch (_) {}
            await initCameras();
            const devices = await listCameras();
            const back = pickBackCamera(devices);
            await startWith(back && back.deviceId);
          } catch (e) {
            console.error('[ScannerCapsule] Erreur startBtn', e);
          }
        });
      }

      if (stopBtn) {
        stopBtn.addEventListener('click', () => {
          stopStream();
          showInfo('Scanner arrêté.', 1500);
        });
      }

      if (torchBtn) {
        torchBtn.addEventListener('click', () => {
          toggleTorch();
        });
      }

      if (camerasSelectEl) {
        camerasSelectEl.addEventListener('change', (e) => {
          const id = e.target.value;
          startWith(id);
        });
      }

      if (testBtn) {
        testBtn.addEventListener('click', () => {
          triggerManualEan();
        });
      }

      if (eanInput) {
        eanInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            triggerManualEan();
          }
        });
      }
    }

    // ========== API publique de la capsule ==========
    function init() {
      bindEvents();
      showInfo('Appuie sur « Autoriser » pour démarrer la caméra.', 4000);
    }

    function destroy() {
      stopStream();
      clearMessage();
    }

    // On renvoie les méthodes utiles
    return {
      init,
      destroy,
      showInfo,
      showError,
    };
  }

  // Exposition globale du module
  window.HonouaScannerCapsule = {
    createScannerCapsule,
  };
})();
