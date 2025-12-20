
// scanner.js
(function () {
  /**
   * Crée une instance de scanner Honoua
   * @param {Object} config
   * @param {HTMLVideoElement} config.videoEl
   * @param {HTMLElement} config.messageEl
   * @param {HTMLSelectElement} config.camerasSelectEl
   * @param {HTMLButtonElement} config.startBtn
   * @param {HTMLButtonElement} config.stopBtn
   * @param {HTMLButtonElement} config.torchBtn
   * @param {HTMLInputElement} config.eanInput
   * @param {HTMLButtonElement} config.testBtn
   * @param {Function} config.onEanDetected   // callback(ean)
   */
  function createScanner(config) {
    // === Références DOM ===
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

    // === État interne ===
    let currentStream = null;
    let currentTrack = null;
    let torchSupported = false;
    let torchOn = false;
    let isRunning = false;
    let scannerMessageTimeout = null;

    // ==========================
    // Gestion des messages UX
    // ==========================
    function hideMessage() {
      if (!messageEl) return;
      messageEl.className = 'scanner-message scanner-message--hidden';
      messageEl.textContent = '';
      if (scannerMessageTimeout) {
        clearTimeout(scannerMessageTimeout);
        scannerMessageTimeout = null;
      }
    }

    function showInfo(text, durationMs = 2500) {
      if (!messageEl) return;
      hideMessage();
      messageEl.textContent = text;
      messageEl.className = 'scanner-message scanner-message--info';
      if (durationMs) {
        scannerMessageTimeout = setTimeout(hideMessage, durationMs);
      }
    }

    function showError(text, persistent = false) {
      if (!messageEl) return;
      hideMessage();
      messageEl.textContent = text;
      messageEl.className = 'scanner-message scanner-message--error';
      if (!persistent) {
        scannerMessageTimeout = setTimeout(hideMessage, 3500);
      }
    }

    // ==========================
    // Gestion caméra (squelette)
    // ==========================
    async function initCameras() {
      // (implémentation détaillée plus tard)
      // - lister les devices
      // - remplir camerasSelectEl
      // - gérer la caméra par défaut
    }

    async function start() {
      // (implémentation détaillée plus tard : getUserMedia, etc.)
      isRunning = true;
      showInfo('Scanner en cours…');
    }

    function stop() {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
      }
      currentStream = null;
      currentTrack = null;
      isRunning = false;
      torchOn = false;
      hideMessage();
    }

    function toggleTorch() {
      // (implémentation détaillée plus tard selon capabilities)
    }

    // ==========================
    // Gestion du test manuel EAN
    // ==========================
    function triggerManualEan() {
      if (!eanInput) return;
      const raw = (eanInput.value || '').trim();

      if (!raw) {
        showError('Entrez un code EAN avant de lancer le test.');
        eanInput.focus();
        return;
      }

      // Ici on délègue au callback page :
      if (typeof onEanDetected === 'function') {
        onEanDetected(raw);
      } else {
        console.warn('[HonouaScanner] Aucun callback onEanDetected fourni.');
      }
    }

    // ==========================
    // Binding des événements
    // ==========================
    function bindEvents() {
      if (startBtn) {
        startBtn.addEventListener('click', () => {
          start().catch(err => {
            console.error('[HonouaScanner] Erreur start', err);
            showError('Impossible de démarrer la caméra.');
          });
        });
      }

      if (stopBtn) {
        stopBtn.addEventListener('click', () => {
          stop();
          showInfo('Scanner arrêté.', 1500);
        });
      }

      if (torchBtn) {
        torchBtn.addEventListener('click', () => {
          toggleTorch();
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

    // ==========================
    // API publique du scanner
    // ==========================
    function init() {
      bindEvents();
      initCameras().catch(err => {
        console.warn('[HonouaScanner] Erreur initCameras', err);
        showError('Impossible d’énumérer les caméras.');
      });
    }

    function destroy() {
      stop();
      hideMessage();
      // (si besoin : removeEventListener plus tard)
    }

    return {
      init,
      start,
      stop,
      destroy,
      showInfo,
      showError,
    };
  }

  // Exposition globale
  window.HonouaScanner = {
    createScanner,
  };
})();
