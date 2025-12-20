// honoua-api.js
// Module centralisé pour tous les appels à l'API Honoua (FastAPI).
// Objectif : un seul point d'entrée, gestion d'erreurs standardisée,
// pas de fuite d'informations techniques vers l'UI.

const HonouaApi = (() => {
  // Base de l'API : par défaut même origine, mais peut être surchargée
  // en définissant window.HONOUA_API_BASE dans le HTML si besoin.
  const API_BASE = (typeof window !== 'undefined' && window.HONOUA_API_BASE)
    ? window.HONOUA_API_BASE
    : '';

  function buildUrl(path) {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    return API_BASE + path;
  }

  /**
   * safeFetch
   *  - Encapsule fetch avec try/catch
   *  - Normalise la réponse :
   *      { ok, status, data, error }
   *  - Evite d'exposer les messages techniques au frontend.
   */
  async function safeFetch(path, options = {}) {
    const url = buildUrl(path);

    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        // On laisse le Content-Type optionnel pour les GET.
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      body: options.body || null
    };

    try {
      const response = await fetch(url, fetchOptions);

      const contentType = response.headers.get('content-type') || '';
      let data = null;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // On garde le texte brut au besoin (logs dev, jamais brut à l'utilisateur).
        data = await response.text();
      }

      if (!response.ok) {
        // On masque les détails techniques : seul un message fonctionnel remonte.
        let message = 'Erreur API';
        if (data && typeof data === 'object' && data.detail) {
          message = data.detail;
        } else if (typeof data === 'string' && data.trim()) {
          message = data.trim();
        } else {
          message = `Erreur API (${response.status})`;
        }

        return {
          ok: false,
          status: response.status,
          data: null,
          error: message
        };
      }

      return {
        ok: true,
        status: response.status,
        data,
        error: null
      };
    } catch (err) {
      // Log minimal côté dev, message générique côté UI.
      console.error('[HonouaApi] Erreur réseau ou fetch :', err);

      return {
        ok: false,
        status: 0,
        data: null,
        error: 'Erreur réseau ou serveur injoignable.'
      };
    }
  }

  /**
   * fetchProductByEan
   *  - Récupère les données CO2 normalisées d'un produit à partir de l'EAN.
   *  - GET /api/v1/co2/product/<ean>
   */
  async function fetchProductByEan(ean) {
    if (!ean || typeof ean !== 'string') {
      return {
        ok: false,
        status: 0,
        data: null,
        error: "EAN manquant ou invalide."
      };
    }

    const cleaned = ean.trim();
    if (cleaned.length < 8 || cleaned.length > 14 || !/^[0-9]+$/.test(cleaned)) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: "EAN invalide (8 à 14 chiffres attendus)."
      };
    }

    return safeFetch(`/api/v1/co2/product/${encodeURIComponent(cleaned)}`);
  }

  /**
   * validateCart
   *  - Envoie un panier CO2 pour validation / enregistrement.
   *  - POST /api/cart/validate
   */
  async function validateCart(cartPayload) {
    // On pourra ajouter ici une validation plus fine du payload.
    const body = JSON.stringify(cartPayload || {});
    return safeFetch('/api/cart/validate', {
      method: 'POST',
      body
    });
  }

  /**
   * getCartHistory
   *  - Récupère l'historique des paniers CO2.
   *  - GET /api/cart/history
   */
  async function getCartHistory() {
    return safeFetch('/api/cart/history');
  }

  /**
   * getCo2Stats
   *  - Récupère des stats agrégées (par semaine / mois / année).
   *  - GET /api/co2/stats?period=...
   */
  async function getCo2Stats(period = 'month') {
    const p = String(period || 'month').toLowerCase();
    return safeFetch(`/api/co2/stats?period=${encodeURIComponent(p)}`);
  }

  /**
   * compareProductsByEan
   *  - Compare plusieurs produits par EAN (EcoSelect).
   *  - POST /api/ecoselect/compare
   */
  async function compareProductsByEan(eans) {
    const list = Array.isArray(eans) ? eans : [];
    const cleaned = list
      .map(e => String(e || '').trim())
      .filter(e => e.length >= 8 && e.length <= 14 && /^[0-9]+$/.test(e));

    const body = JSON.stringify({ eans: cleaned });
    return safeFetch('/api/ecoselect/compare', {
      method: 'POST',
      body
    });
  }

  // On expose uniquement l'API publique du module.
  return {
    safeFetch,
    fetchProductByEan,
    validateCart,
    getCartHistory,
    getCo2Stats,
    compareProductsByEan
  };
})();
