console.log("Mon code JS honoua-api est joué");
// honoua-api.js
(function () {
  'use strict';

  /**
   * Base URL de l'API Honoua
   * - En dev front-only : tu peux mettre l'URL de ton backend FastAPI (ex : http://localhost:8001)
   * - Quand tu serviras le front via FastAPI lui-même : tu pourras mettre simplement '' (vide)
   */
  const API_BASE_URL = 'http://localhost:8000'; // 🔁 à adapter selon ton backend

  /**
   * Wrapper standardisé pour tous les appels API Honoua.
   *
   * Retourne toujours un objet :
   *  - { ok: true, status, data }
   *  - { ok: false, status?, error }
   */
  async function fetchHonoua(path, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 8000;

    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url =
        (API_BASE_URL ? API_BASE_URL.replace(/\/+$/, '') : '') +
        '/' +
        path.replace(/^\/+/, '');

      const res = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(id);

      const contentType = res.headers.get('content-type') || '';
      let payload = null;

      if (contentType.includes('application/json')) {
        payload = await res.json();
      } else {
        payload = await res.text();
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: payload || 'Erreur API',
        };
      }

      return {
        ok: true,
        status: res.status,
        data: payload,
      };
    } catch (err) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        return {
          ok: false,
          error: 'Timeout de la requête (API trop lente ou indisponible).',
        };
      }
      return {
        ok: false,
        error: err.message || 'Erreur réseau',
      };
    }
  }

  /**
   * Appel standard pour chercher un produit par EAN.
   *
   * Retourne :
   *  - { ok: true, data: {...} }
   *  - { ok: false, error: 'message' }
   */
  async function fetchProductByEan(ean) {
    const result = await fetchHonoua(`/api/search/product?ean=${encodeURIComponent(ean)}`, {
      method: 'GET',
      timeoutMs: 8000,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || 'Produit introuvable.',
      };
    }

    return {
      ok: true,
      data: result.data,
    };
  }

  // Exposition globale pour tous les scripts front Honoua
  window.HonouaApi = {
    fetchHonoua,
    fetchProductByEan,
  };
})();
