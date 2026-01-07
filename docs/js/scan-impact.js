

/**
 * scan-impact.js (minimal)
 * Règle : toute la logique doit rester dans honoua-core.js
 * Ici : aucun fetch, aucune logique métier, aucun scanner.
 */

(function () {
  // Hook optionnel (si honoua-core.js l’appelle).
  // On délègue aux helpers globaux fournis par honoua-core.js.
  window.showScanImpactStatus = function (text, level) {
    const msg = (typeof text === 'string' && text.trim()) ? text.trim() : '';
    if (!msg) return;

    const lvl = String(level || '').toLowerCase();
    const isWarn = (lvl === 'warn' || lvl === 'warning' || lvl === 'error');

    if (isWarn && typeof window.showScannerError === 'function') {
      window.showScannerError(msg, 3500);
      return;
    }
    if (typeof window.showScannerInfo === 'function') {
      window.showScannerInfo(msg, 2500);
    }
  };
})();
