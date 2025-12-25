// eco-select.js — version de référence A50.x (logique + DOM + swipe + doublons + recentlyRemoved)
// eco-select.js — version nettoyée (MVP Honoua EcoSELECT)
// Comparateur CO₂ : logique de liste, tri, rendu et messages UX.

(function () {
  'use strict';
  console.log('[EcoSELECT] Script chargé (version nettoyée CO2-- / DIST--).');



    // ================================
  // Initialisation du scanner EcoSelect
  // ================================
  document.addEventListener('DOMContentLoaded', function () {
    const root = document.getElementById('eco-scanner-root');
    if (!root) {
      console.warn('[EcoSELECT] #eco-scanner-root introuvable, scanner non initialisé.');
      return;
    }

    if (!window.HonouaScanner || typeof window.HonouaScanner.init !== 'fonction') {
      console.error('[EcoSELECT] HonouaScanner non disponible. Vérifie le chargement de scanner-capsule.js.');
      updateEcoSelectMessage('error', '❌ Scanner indisponible. Réessayez plus tard.');
      return;
    }

    window.HonouaScanner.init({
      root,
      context: 'ecoselect',
      onEanDetected: handleEcoSelectScan
    });

    console.log('[EcoSELECT] Scanner initialisé pour EcoSelect.');
  });

  // =======================================
  // Callback appelé à chaque scan EAN
  // =======================================
  async function handleEcoSelectScan(ean) {
    console.log('[EcoSELECT] EAN détecté :', ean);

    // Message pendant la recherche
    updateEcoSelectMessage('info', '🔍 Recherche du produit...');

    let product = null;

    try {
      if (!window.HonouaApi || typeof window.HonouaApi.fetchProductByEan !== 'function') {
        console.error('[EcoSELECT] HonouaApi.fetchProductByEan indisponible.');
        updateEcoSelectMessage('error', '❌ Service produit indisponible.');
        return;
      }

      product = await window.HonouaApi.fetchProductByEan(ean);
    } catch (err) {
      console.error('[EcoSELECT] Erreur API :', err);
      updateEcoSelectMessage('error', '❌ Erreur de connexion. Réessayez.');
      return;
    }

    if (!product) {
      updateEcoSelectMessage('warning', '❌ Produit introuvable dans Honoua.');
      return;
    }

    console.log('[EcoSELECT] Produit trouvé :', product);
    handleEcoSelectProduct(product);
  }

  // Délégation vers le comparateur existant
  function handleEcoSelectProduct(rawProduct) {
    console.log('[EcoSELECT] handleEcoSelectProduct reçu :', rawProduct);
    // On délègue la normalisation + messages + tri à ecoSelectAddProduct
    ecoSelectAddProduct(rawProduct);
  }


  // ============================
  // Références DOM
  // ============================
  const listEl = document.getElementById('eco-select-list');
  const messageEl = document.getElementById('eco-select-message');

  if (!listEl || !messageEl) {
    console.warn('[EcoSELECT] #eco-select-list ou #eco-select-message introuvable dans le DOM.');
    return;
  }

  // ============================
  // État interne
  // ============================
  const ECO_SELECT_MAX_ITEMS = 10;

  // Liste interne des produits EcoSELECT (déjà normalisés)
  let ecoProducts = [];
  // 'co2' ou 'distance'
  let sortMode = 'co2';

    function getCurrentSortMode() {
    // Si l’état global existe et a un sortMode, on le prend en priorité
    if (typeof ECO_SELECT_STATE !== 'undefined' &&
        ECO_SELECT_STATE &&
        (ECO_SELECT_STATE.sortMode === 'co2' || ECO_SELECT_STATE.sortMode === 'distance')) {
      return ECO_SELECT_STATE.sortMode;
    }
    // Sinon on retombe sur le sortMode interne
    return sortMode;
  }


  // ============================
  // Messages standard (A55)
  // ============================
  const ECO_SELECT_MESSAGES = {
    emptyList: 'Aucun produit à comparer. Scannez un produit pour commencer.',
    limitReached: 'Limite de 10 produits atteinte. Supprimez un produit pour en ajouter un nouveau.',
    removed: 'Produit supprimé. Rescannez-le pour le réajouter au comparateur.',
    added: 'Produit ajouté au comparateur CO₂.',
    updated: 'Produit déjà présent, valeurs mises à jour.',
    sortCo2: 'Tri par CO₂ activé.',
    sortDistance: 'Tri par distance activé.',
    co2Missing: 'Données CO₂ indisponibles pour ce produit.'
  };


  // ============================
  // Normalisation des données produit (MVP Honoua)
  // ============================
  function ecoSelectNormalizeProduct(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        ean: null,
        label: 'Produit',
        co2Total: null,
        origin: null,
        distanceKm: null,
        packaging: null
      };
    }

    return {
      // Code barre
      ean: raw.ean || raw.code || raw.barcode || null,

      // Nom du produit
      label:
        raw.label ||
        raw.product_label ||
        raw.name ||
        raw.nom ||
        'Produit',

      // Total CO₂ (kg)
      co2Total:
        raw.co2Total ??
        raw.co2_kg_total ??
        raw.total_co2_kg ??
        null,

      // Origine pays (FR, ES, DE...)
      origin:
        raw.origin_country ||
        raw.originCountry ||
        raw.origin ||
        null,

      // Distance en km
      distanceKm:
        raw.distanceKm ??
        raw.distance_km ??
        raw.transport_km ??
        null,

      // Type d'emballage (pour usage futur)
      packaging:
        raw.packaging_label ||
        raw.packaging_type ||
        raw.packaging ||
        null
    };
  }

  // ============================
  // Helpers
  // ============================
  function debugLogState(from) {
    console.log('[EcoSELECT][' + from + '] état courant :', {
      sortMode,
      count: ecoProducts.length,
      products: ecoProducts.slice()
    });
  }

  function updateEcoSelectMessage(type, text) {
    if (!messageEl) return;

    if (!type || !text) {
      // Efface le message
      messageEl.textContent = '';
      messageEl.className = 'eco-select-message';
      return;
    }

    // type: 'info' | 'warning' | 'error'
    let extraClass = '';
    if (type === 'info') extraClass = 'eco-select-message-info';
    else if (type === 'warning') extraClass = 'eco-select-message-warning';
    else if (type === 'error') extraClass = 'eco-select-message-error';

    messageEl.textContent = text;
    messageEl.className = 'eco-select-message ' + extraClass;
  }

  function formatKg(value) {
    if (value == null || isNaN(value)) return '—';
    return Number(value).toFixed(2) + ' kg CO₂';
  }

  // ============================
  // Tri
  // ============================
  function sortProducts() {
    if (!Array.isArray(ecoProducts)) return;

    ecoProducts.sort((a, b) => {
      if (sortMode === 'distance') {
        const da = typeof a.distanceKm === 'number' ? a.distanceKm : Infinity;
        const db = typeof b.distanceKm === 'number' ? b.distanceKm : Infinity;
        return da - db;
      }

      // Tri par CO₂ par défaut
      const ca = typeof a.co2Total === 'number' ? a.co2Total : Infinity;
      const cb = typeof b.co2Total === 'number' ? b.co2Total : Infinity;
      return ca - cb;
    });
  }

  function computeBestIndex() {
    let bestIndex = -1;

    if (sortMode === 'co2') {
      for (let i = 0; i < ecoProducts.length; i++) {
        if (typeof ecoProducts[i].co2Total === 'number') {
          bestIndex = i;
          break;
        }
      }
    } else if (sortMode === 'distance') {
      for (let i = 0; i < ecoProducts.length; i++) {
        if (typeof ecoProducts[i].distanceKm === 'number') {
          bestIndex = i;
          break;
        }
      }
    }

    return bestIndex;
  }

  // ============================
  // Rendu d’un produit
  // ============================
  function createProductRow(product, isBest) {
    const row = document.createElement('div');
    row.className = 'eco-item-row';
    row.dataset.ean = product.ean || '';

    const currentSortMode = getCurrentSortMode();


    // ============================
    // Colonne principale (nom, origine, distance)
    // ============================
    const main = document.createElement('div');
    main.className = 'eco-item-main';

    // Nom du produit
    const label = document.createElement('div');
    label.className = 'eco-item-label';
    label.textContent = product.label || 'Produit alimentaire';

    // Meta : origine + distance
    const meta = document.createElement('div');
    meta.className = 'eco-item-meta';

    // Origine (origin_country, ex: "FR")
    if (product.origin) {
      const originSpan = document.createElement('span');
      originSpan.className = 'eco-item-origin';
      originSpan.textContent = product.origin; // ex: "FR"
      meta.appendChild(originSpan);
    }

    // Distance en km
    if (product.distanceKm != null && !isNaN(product.distanceKm)) {
      const distSpan = document.createElement('span');
      distSpan.className = 'eco-item-distance';
      distSpan.textContent = `${product.distanceKm.toFixed(0)} km`;

      // Mise en avant si tri distance
    if (currentSortMode === 'distance') {
      distSpan.classList.add('eco-item-distance-active');
      }


      meta.appendChild(distSpan);
    }

    main.appendChild(label);
    main.appendChild(meta);

    // ============================
    // Colonne score CO₂ + indicateur CO2-- / DIST--
    // ============================
    const score = document.createElement('div');
    score.className = 'eco-item-score';

    // Valeur CO₂ totale
    const value = document.createElement('div');
    value.className = 'eco-item-co2-value';
    value.textContent = formatKg(product.co2Total); // ex: "0.80 kg CO₂"

    // Mise en avant si tri CO₂
   if (currentSortMode === 'co2') {
      value.classList.add('eco-item-co2-active');
    }


    score.appendChild(value);

    // Indicateur de classement (seulement pour le meilleur produit)
    if (isBest) {
      const badge = document.createElement('span');
      badge.className = 'eco-item-badge';

    if (currentSortMode === 'co2') {
      badge.textContent = 'CO2--';
    } else if (currentSortMode === 'distance') {
      badge.textContent = 'DIST--';
      }


      score.appendChild(badge);
      row.classList.add('eco-item-best');
    }

    // ============================
    // Bouton supprimer (×)
    // ============================
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'eco-item-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Retirer du comparateur';

    removeBtn.addEventListener('click', () => {
      ecoSelectRemoveProduct(product.ean);
    });

    row.appendChild(main);
    row.appendChild(score);
    row.appendChild(removeBtn);

    return row;
  }

  // ============================
  // Rendu de la liste complète
  // ============================
  function renderList() {
    // Nettoyage de la liste
    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }

    if (!ecoProducts.length) {
      updateEcoSelectMessage('info', ECO_SELECT_MESSAGES.emptyList);
      return;
    }

    // Effacer le message si on a des produits
    updateEcoSelectMessage();

    // Déterminer le meilleur index pour le highlight
    const bestIndex = computeBestIndex();

    ecoProducts.forEach((product, index) => {
      const isBest = index === bestIndex;
      const row = createProductRow(product, isBest);
      listEl.appendChild(row);
    });
  }

  // =======================================
// Callback appelé à chaque scan EAN
// =======================================
async function handleEcoSelectScan(ean) {
    console.log("[EcoSelect] EAN détecté :", ean);

    // Message UI EcoSelect (bulle, texte)
    updateEcoSelectMessage("🔍 Recherche du produit...");

    let product = null;

    try {
        product = await HonouaApi.fetchProductByEan(ean);
    } catch (err) {
        console.error("[EcoSelect] Erreur API :", err);
        updateEcoSelectMessage("❌ Erreur de connexion. Réessayez.");
        return;
    }

    if (!product) {
        updateEcoSelectMessage("❌ Produit introuvable dans Honoua.");
        return;
    }

    console.log("[EcoSelect] Produit trouvé :", product);

    // On délègue la transformation + l’ajout
    handleEcoSelectProduct(product);
}
        
        // =======================================
// Transformation du produit API -> produit EcoSelect
// =======================================
function handleEcoSelectProduct(product) {
  // 1) Construire l’objet ecoProduct dans le format attendu
  const ecoProduct = {
    ean: product.ean || product.barcode || null,
    name: product.name || product.product_name || "Produit sans nom",
    brand: product.brand || product.brands || "",
    co2_g: product.co2_g || product.co2 || null,
    distance_km: product.distance_km || product.transport_distance_km || null,
    origin: product.origin || product.country || "",
  };

  // 2) Appeler la fonction interne qui gère l’ajout dans la liste
  if (typeof window.ecoSelectAddProduct === "function") {
    window.ecoSelectAddProduct(ecoProduct);
    updateEcoSelectMessage("✅ Produit ajouté au comparateur.");
  } else {
    console.warn("[EcoSelect] ecoSelectAddProduct n’est pas définie.");
    updateEcoSelectMessage("⚠️ Impossible d’ajouter le produit (fonction manquante).");
  }
}

        
  // ============================
  // API interne : ajout / suppression / tri
  // ============================
  function ecoSelectAddProduct(rawProduct) {
    console.log('[EcoSELECT] ecoSelectAddProduct reçu :', rawProduct);

    const ecoProduct = ecoSelectNormalizeProduct(rawProduct);
    console.log('[EcoSELECT] ecoProduct normalisé :', ecoProduct);

    if (!ecoProduct || !ecoProduct.ean) {
      console.warn('[EcoSELECT] Produit invalide ou EAN manquant.');
      updateEcoSelectMessage('error', 'Produit invalide ou code-barres manquant.');
      return;
    }

    if (ecoProducts.length >= ECO_SELECT_MAX_ITEMS) {
      updateEcoSelectMessage('warning', ECO_SELECT_MESSAGES.limitReached);
      return;
    }

    const eanStr = String(ecoProduct.ean);
    const existingIndex = ecoProducts.findIndex(p => p.ean === eanStr);

    if (existingIndex >= 0) {
      // Mise à jour produit existant
      ecoProducts[existingIndex] = {
        ...ecoProducts[existingIndex],
        ...ecoProduct
      };
      updateEcoSelectMessage('info', ECO_SELECT_MESSAGES.updated);
    } else {
      ecoProducts.push({
        ean: eanStr,
        label: ecoProduct.label || 'Produit alimentaire',
        co2Total: typeof ecoProduct.co2Total === 'number' ? ecoProduct.co2Total : null,
        distanceKm: typeof ecoProduct.distanceKm === 'number' ? ecoProduct.distanceKm : null,
        origin: ecoProduct.origin || null,
        packaging: ecoProduct.packaging || null
      });
      updateEcoSelectMessage('info', ECO_SELECT_MESSAGES.added);
    }

    sortProducts();
    renderList();
    debugLogState('ajout');
  }

  function ecoSelectRemoveProduct(ean) {
    if (!ean) return;

    const eanStr = String(ean);
    const index = ecoProducts.findIndex(p => p.ean === eanStr);

    if (index === -1) return;

    ecoProducts.splice(index, 1);
    updateEcoSelectMessage('info', ECO_SELECT_MESSAGES.removed);

    sortProducts();
    renderList();
    debugLogState('remove');
  }
  
   function sortProducts() {
  if (!ecoProducts || ecoProducts.length === 0) return;

  if (sortMode === 'distance') {
    ecoProducts.sort((a, b) => {
      const da = (typeof a.distanceKm === 'number') ? a.distanceKm : Infinity;
      const db = (typeof b.distanceKm === 'number') ? b.distanceKm : Infinity;
      return da - db;
    });
  } else {
    // Tri CO₂ par défaut
    ecoProducts.sort((a, b) => {
      const ca = (typeof a.co2Total === 'number') ? a.co2Total : Infinity;
      const cb = (typeof b.co2Total === 'number') ? b.co2Total : Infinity;
      return ca - cb;
    });
  }
}



  // ============================
  // Exposition globale
  // ============================
  window.ecoSelectAddProduct = ecoSelectAddProduct;
  window.ecoSelectRemoveProduct = ecoSelectRemoveProduct;
  window.ecoSelectSetSortMode = ecoSelectSetSortMode;

  // Expose un canal de message standard pour honoua-core.js
// Signature "propre" attendue: updateEcoSelectMessage(text, type)
window.updateEcoSelectMessage = function (text, type = "info") {
  // NOTE: la fonction interne est: updateEcoSelectMessage(type, text)
  try {
    return updateEcoSelectMessage(type, text);
  } catch (e) {
    console.warn("[EcoSELECT] updateEcoSelectMessage failed:", e);
  }
};


  console.log("[EcoSELECT] Initialisé (version nettoyée)");
})();



// ============================
// ÉTAT GLOBAL DU COMPARATEUR
// ============================
const ECO_SELECT_STATE = {
  items: [],       // liste des produits ecoProduct
  sortMode: "co2", // "co2" ou "distance"
};

// fonction appelée quand on clique sur CO2 / Distance
window.ecoSelectSetSortMode = function (mode) {
  if (mode !== "co2" && mode !== "distance") {
    console.warn("[EcoSELECT] Mode de tri inconnu :", mode);
    return;
  }
  ECO_SELECT_STATE.sortMode = mode;
  renderList(); // relance l'affichage
};

// comparateur utilisé dans renderList()
function ecoSelectCompare(a, b) {
  if (ECO_SELECT_STATE.sortMode === "distance") {
    const da = typeof a.distanceKm === "number" ? a.distanceKm : Infinity;
    const db = typeof b.distanceKm === "number" ? b.distanceKm : Infinity;
    return da - db;
  }

  // tri par CO₂ par défaut
  const ca = typeof a.co2Total === "number" ? a.co2Total : Infinity;
  const cb = typeof b.co2Total === "number" ? b.co2Total : Infinity;
  return ca - cb;
}



// ============================================================================
// CAPSULE SCANNER CO₂
// Extrait nettoyé de scanner.html pour réutilisation dans EcoSelect, etc.
// - Gestion caméra + lampe + reset
// - Test manuel EAN
// - Appel API CO₂ + encart produit
// - Hooks optionnels : ecoSelectAddProduct, addToCartFromApiResponse, renderCo2Cart
// ============================================================================

(function () {
  // --- Récupération des éléments DOM scanner ---
  const $video     = document.getElementById('preview');
  const $cams      = document.getElementById('cameras');
  const $start     = document.getElementById('btnStart');
  const $reset     = document.getElementById('btnReset');
  const $torch     = document.getElementById('btnTorch');
  const $state     = document.getElementById('state');
  const $badge     = document.getElementById('stateBadge');
  const $reticle   = document.querySelector('.reticle');
  const $eanInput  = document.getElementById('eanInput');
  const $btnTest   = document.getElementById('btnTestEan');

  // Encart CO₂ produit
  const $co2Card         = document.getElementById('co2Card');
  const $co2Badge        = document.getElementById('co2Badge');
  const $co2Empty        = document.getElementById('co2Empty');
  const $co2Content      = document.getElementById('co2Content');
  const $co2ProductLabel = document.getElementById('co2ProductLabel');
  const $co2Total        = document.getElementById('co2Total');
  const $co2Prod         = document.getElementById('co2Prod');
  const $co2Pack         = document.getElementById('co2Pack');
  const $co2Trans        = document.getElementById('co2Trans');
  const $co2TreeCapture  = document.getElementById('co2TreeCapture');

  // Message système scanner (info / erreur)
  const $scannerMessage = document.getElementById('scanner-message');
  let scannerMessageTimeout = null;

  // Sécurité : si les éléments principaux n’existent pas, on ne fait rien
  if (!$video || !$cams || !$start || !$reset || !$torch || !$state || !$badge || !$reticle) {
    console.warn('[Scanner CO2] Éléments DOM manquants, capsule non initialisée.');
    return;
  }

  // --- Config API CO₂ ---
// Important: toujours appeler l’API (api.honoua.com), jamais le front (app.honoua.com)
  // Base API : on privilégie window.HONOUA_API_BASE (prod Render) sinon fallback relatif (dev/local)
  const HONOUA_API_BASE = (typeof window !== "undefined" && window.HONOUA_API_BASE)
    ? String(window.HONOUA_API_BASE).replace(/\/$/, "")
    : "";

  const CO2_API_BASE = HONOUA_API_BASE
    ? `${HONOUA_API_BASE}/api/v1/co2/product`
    : "/api/v1/co2/product";



  // --- État caméra ---
  let currentStream   = null;
  let currentTrack    = null;
  let torchSupported  = false;
  let torchOn         = false;

  // ==========================================================================
  // 1) Gestion des messages scanner (info / erreur)
  // ==========================================================================

  function hideScannerMessage() {
    if ($scannerMessage) {
      $scannerMessage.className = 'scanner-message scanner-message--hidden';
      $scannerMessage.textContent = '';
    }
    if (scannerMessageTimeout) {
      clearTimeout(scannerMessageTimeout);
      scannerMessageTimeout = null;
    }
  }

  function showScannerInfo(text, durationMs = 2500) {
    hideScannerMessage();
    if ($scannerMessage) {
      $scannerMessage.textContent = text;
      $scannerMessage.className = 'scanner-message scanner-message--info';
      if (durationMs) {
        scannerMessageTimeout = setTimeout(hideScannerMessage, durationMs);
      }
    }
  }

  function showScannerError(text, persistent = false) {
    hideScannerMessage();
    if ($scannerMessage) {
      $scannerMessage.textContent = text;
      $scannerMessage.className = 'scanner-message scanner-message--error';
      if (!persistent) {
        scannerMessageTimeout = setTimeout(hideScannerMessage, 3500);
      }
    }
  }

  // On exporte pour d’autres scripts
  window.showScannerInfo  = window.showScannerInfo  || showScannerInfo;
  window.showScannerError = window.showScannerError || showScannerError;

  // ==========================================================================
  // 2) Helpers encart CO₂
  // ==========================================================================

  function formatKg(value) {
    if (value == null || isNaN(value)) return '0.0';
    return Number(value).toFixed(2);
  }

  function setCo2Waiting() {
    if (!$co2Card) return;
    $co2Badge.textContent = 'En attente de scan';
    $co2Empty.textContent =
      'Scannez un code-barres pour afficher l’empreinte CO₂ (production, emballage, transport).';
    $co2Empty.classList.remove('hidden');
    $co2Content.classList.add('hidden');
  }

  function setCo2Loading(ean) {
    if (!$co2Card) return;
    $co2Badge.textContent = 'Recherche…';
    $co2Empty.textContent =
      `Code scanné : ${ean} — recherche de l’empreinte CO₂…`;
    $co2Empty.classList.remove('hidden');
    $co2Content.classList.add('hidden');
  }

  function setCo2Error(message) {
    if (!$co2Card) return;
    $co2Badge.textContent = 'Données indisponibles';
    $co2Empty.textContent =
      message || `Nous n’avons pas encore de données CO₂ pour ce produit.`;
    $co2Empty.classList.remove('hidden');
    $co2Content.classList.add('hidden');
  }

  function renderCo2Result(payload) {
    if (!$co2Card) return;

    const {
      product_label,
      co2_kg_total,
      co2_kg_details = {}
    } = payload || {};

    $co2Badge.textContent = 'Données CO₂ trouvées';
    $co2Empty.classList.add('hidden');
    $co2Content.classList.remove('hidden');

    $co2ProductLabel.textContent = product_label || 'Produit alimentaire';
    $co2Total.textContent = formatKg(co2_kg_total) + ' kg CO₂';
    $co2Prod.textContent  = formatKg(co2_kg_details.product);
    $co2Pack.textContent  = formatKg(co2_kg_details.packaging);
    $co2Trans.textContent = formatKg(co2_kg_details.transport);

    // Affichage "jours d’arbre" si computeDaysTreeCapture / formatDaysTreeCapture sont définies
    if ($co2TreeCapture) {
      let text = '';
      if (typeof window.computeDaysTreeCapture === 'function' &&
          typeof window.formatDaysTreeCapture === 'function' &&
          typeof co2_kg_total === 'number' &&
          !isNaN(co2_kg_total) &&
          co2_kg_total > 0) {
        const days  = window.computeDaysTreeCapture(co2_kg_total);
        const label = window.formatDaysTreeCapture(days);
        text = `Un arbre mettrait environ ${label} pour capter les émissions de ce produit.`;
      }
      $co2TreeCapture.textContent = text;
    }
  }

  // ==========================================================================
  // 3) Appel API CO₂ pour un EAN
  // ==========================================================================

  async function fetchCo2ForEan(ean) {
    if (!ean) return;

    const cleanEan = String(ean).trim();
    if (!cleanEan) return;

    setCo2Loading(cleanEan);
    showScannerInfo('Analyse en cours…', null); // message "chargement"

    try {
      const url = `${CO2_API_BASE}/${encodeURIComponent(cleanEan)}`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (resp.status === 404) {
        setCo2Error('Nous n’avons pas encore de données CO₂ pour ce produit.');
        showScannerError('Produit introuvable.');
        return;
      }

      if (!resp.ok) {
        setCo2Error('Erreur lors de la récupération des données CO₂.');
        showScannerError('Erreur lors de la récupération des données CO₂.');
        return;
      }

      const data = await resp.json();

      // 1) Mise à jour de la carte CO₂
      renderCo2Result(data);

      // 2) Message de succès
      if (typeof data.co2_kg_total === 'number') {
        showScannerInfo(
          `Scan réussi. ${Number(data.co2_kg_total).toFixed(2)} kg CO₂e.`
        );
      } else {
        showScannerInfo('Scan réussi.');
      }

      // 3) Construction d’un objet pour EcoSELECT (optionnel)
      try {
        const hasCo2Data =
          typeof data.co2_kg_total === 'number' && !isNaN(data.co2_kg_total);

        let distanceKm = null;
        if (typeof data.distance_km === 'number' && !isNaN(data.distance_km)) {
          distanceKm = data.distance_km;
        } else if (typeof data.transport_km === 'number' && !isNaN(data.transport_km)) {
          distanceKm = data.transport_km;
        }

        const origin =
          data.origin ||
          data.origin_region ||
          data.origin_label ||
          null;

        const ecoProduct = {
          ean: cleanEan,
          label: data.product_label || 'Produit alimentaire',
          co2Total: hasCo2Data ? data.co2_kg_total : null,
          distanceKm: distanceKm,
          origin: origin,
          hasCo2Data: hasCo2Data
        };

        if (typeof window.ecoSelectAddProduct === 'function') {
          window.ecoSelectAddProduct(ecoProduct);
        }
      } catch (err) {
        console.warn('[Scanner CO2] Erreur construction ecoProduct :', err);
      }

      // 4) Panier CO₂ (optionnel) : uniquement si fonctions présentes
      if (typeof window.addToCartFromApiResponse === 'function') {
        try {
          window.addToCartFromApiResponse(data, cleanEan);
          if (typeof window.renderCo2Cart === 'function') {
            window.renderCo2Cart();
          }
        } catch (err) {
          console.error('[Scanner CO2] Erreur ajout au panier :', err);
        }
      }

    } catch (e) {
      setCo2Error('Impossible de joindre le service CO₂.');
      showScannerError('Impossible de joindre le service CO₂.');
      console.error('[Scanner CO2] Erreur réseau :', e);
    }
  }

  // On exporte pour d’autres scripts
  window.fetchCo2ForEan = window.fetchCo2ForEan || fetchCo2ForEan;

  // ==========================================================================
  // 4) Test manuel EAN (input + bouton)
  // ==========================================================================

  function triggerManualEan() {
    if (!$eanInput) return;
    const raw = ($eanInput.value || '').trim();
    if (!raw) {
      showScannerError('Entrez un code EAN avant de lancer le test.');
      $eanInput.focus();
      return;
    }
    console.log('[Scanner CO2] triggerManualEan avec :', raw);
        // Si honoua-core expose déjà une gestion unifiée, on la privilégie (évite doublons)
    if (typeof window.handleEanDetected === "function") {
      window.handleEanDetected(raw);
      return;
    }
    fetchCo2ForEan(raw);

  }

   if ($btnTest) {
    // Ne pas rajouter un 2e handler si honoua-core a déjà posé un onclick
    if (typeof $btnTest.onclick !== "function") {
      $btnTest.addEventListener("click", triggerManualEan);
    }
  }

  if ($eanInput) {
    $eanInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerManualEan();
      }
    });
  }

  // État initial encart CO₂
  setCo2Waiting();

  // ==========================================================================
  // 5) Gestion caméra (start / reset / switch / torch)
  // ==========================================================================

  function vibrate(ms = 60) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function setStatus(text, on = false) {
    $state.textContent = text;
    $badge.textContent = on ? 'Actif' : 'Arrêté';
    $badge.className   = 'badge ' + (on ? 'ok' : 'off');
    $reticle.classList.toggle('active', on);
    if (on) vibrate(50);
  }

  async function stopStream() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
      currentTrack  = null;
    }
    $video.srcObject = null;
    $torch.disabled = true;
    $torch.classList.remove('torch-on');
    $torch.textContent = 'Lampe';
    setStatus('Flux arrêté', false);
    showScannerInfo('Caméra arrêtée. Relancez le scanner pour continuer.');
  }

  async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos  = devices.filter((d) => d.kind === 'videoinput');
    $cams.innerHTML = '';
    videos.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || 'Caméra';
      $cams.appendChild(opt);
    });
    if (videos.length === 0) {
      setStatus('Aucune caméra détectée', false);
      showScannerError('Aucune caméra détectée. Vérifiez votre appareil.');
    }
    return videos;
  }

  function pickBackCamera(devices) {
    return (
      devices.find((d) =>
        /back|arrière|rear|environment/i.test(d.label)
      ) || devices[0] || null
    );
  }

  async function detectTorchSupport(track) {
    try {
      const caps = track.getCapabilities?.();
      torchSupported = !!(caps && 'torch' in caps);
      if (!torchSupported) {
        await track
          .applyConstraints({ advanced: [{ torch: false }] })
          .then(
            () => { torchSupported = true; },
            () => { torchSupported = false; }
          );
      }
    } catch (_) {
      torchSupported = false;
    }
    $torch.disabled = !torchSupported;
    $torch.title = torchSupported
      ? 'Activer/Désactiver la lampe'
      : 'Lampe non supportée';
  }

  async function toggleTorch() {
    if (!currentTrack || !torchSupported) return;
    try {
      torchOn = !torchOn;
      await currentTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
      $torch.classList.toggle('torch-on', torchOn);
      $torch.textContent = torchOn ? 'Lampe ON' : 'Lampe';
    } catch (e) {
      console.error('[Scanner CO2] Erreur lampe :', e);
      $torch.disabled = true;
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
      $video.srcObject = stream;
      currentTrack = stream.getVideoTracks()[0] || null;
      setStatus('Caméra active', true);
      if (currentTrack) await detectTorchSupport(currentTrack);
    } catch (e) {
      console.error('[Scanner CO2] Erreur startWith :', e);
      setStatus('Erreur ou refus caméra', false);
      showScannerError('Accès à la caméra refusé. Autorisez la caméra dans les réglages.');
    }
  }

  // Bouton "Autoriser caméra"
  $start.onclick = async () => {
    try {
      // pré-autorisation rapide (certains navigateurs)
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      tmp.getTracks().forEach((t) => t.stop());
    } catch (_) {
      // ignore
    }
    const vids = await listCameras();
    const back = pickBackCamera(vids);
    await startWith(back?.deviceId);
  };

  // Changement de caméra
  $cams.onchange = (e) => startWith(e.target.value);

  // Reset
  $reset.onclick = () => {
    stopStream();
    setCo2Waiting();
    showScannerInfo('Scanner réinitialisé.');
  };

  // Lampe
  $torch.onclick = () => toggleTorch();

  // Vérification support mediaDevices
  if (!('mediaDevices' in navigator)) {
    setStatus('API média non supportée', false);
    showScannerError('Caméra non supportée sur cet appareil.');
  }

  // ==========================================================================
  // 6) handleEanDetected global (appelé par un lecteur de code-barres externe)
  // ==========================================================================

  if (!window.handleEanDetected) {
    window.handleEanDetected = function (ean) {
      if (!ean) return;
      console.log('[Scanner CO2] handleEanDetected fallback avec :', ean);
      fetchCo2ForEan(String(ean).trim());
    };
  }
})();



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

console.log("Bonjour monseiur Job master le code eco-selection est bien jouer");
