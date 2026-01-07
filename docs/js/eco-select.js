

/**
 * eco-select.js (minimal)
 * Règle : toute la logique (fetch, scanner, rendu, etc.) vit dans honoua-core.js
 * Ici : aucun fetch, aucune logique métier.
 * On expose uniquement updateEcoSelectMessage attendu par honoua-core.js.
 */

(function () {
  'use strict';

    // Signature build (preuve prod)
  window.__ECOSELECT_JS_BUILD = '2025-12-28-eco-select-min-v1';
  console.log('[EcoSELECT] eco-select.js BUILD', window.__ECOSELECT_JS_BUILD);

  // Hook appelé par honoua-core.js :

  // Hook appelé par honoua-core.js :
  // window.updateEcoSelectMessage(text, level)
  window.updateEcoSelectMessage = function (text, level) {
    const msg = (typeof text === 'string' && text.trim()) ? text.trim() : '';
    if (!msg) return;

    const lvl = String(level || '').toLowerCase();
    const isWarn = (lvl === 'warn' || lvl === 'warning' || lvl === 'error');

    // Si honoua-core.js expose déjà des helpers globaux, on les utilise.
    if (isWarn && typeof window.showScannerError === 'function') {
      window.showScannerError(msg, 3500);
    } else if (!isWarn && typeof window.showScannerInfo === 'function') {
      window.showScannerInfo(msg, 2500);
    }

    // Affichage local EcoSelect (si présent dans le DOM)
    // eco-select.html contient #eco-select-message (et aussi #scanner-message). 
    const el = document.getElementById('eco-select-message') || document.getElementById('scanner-message');
    if (!el) return;

    el.textContent = msg;
    el.classList.remove('scanner-message--hidden');

    // Styling minimal (si tes classes existent)
    el.classList.remove('scanner-message--info', 'scanner-message--error');
    el.classList.add(isWarn ? 'scanner-message--error' : 'scanner-message--info');
  };
})();
