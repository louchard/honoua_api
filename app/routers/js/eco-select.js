// eco-select.js — version de référence A50.x (logique + DOM + swipe + doublons + recentlyRemoved)

(function () {
  'use strict';

  // ==============================
  // 🔢 État interne EcoSELECT
  // ==============================

  /**
   * Liste interne des produits du comparateur.
   * {
   *   ean: string,
   *   label: string,
   *   co2Total: number | null,
   *   distanceKm: number | null,
   *   origin: string | null,
   *   hasCo2Data: boolean
   * }
   */
  let ecoProducts = [];

  /**
   * Mode de tri actif : "co2" ou "distance"
   */
  let sortMode = 'co2';

  // Limite max validée
  const MAX_PRODUCTS = 10;

  /**
   * Mémorise les produits supprimés.
   * Si l’utilisateur les rescannne, on demande une "confirmation"
   * avant de les réajouter.
   */
  let recentlyRemoved = new Set();

  // ==============================
  // 🔗 Références DOM
  // ==============================

  const listEl = document.getElementById('eco-select-list');
  const messageEl = document.getElementById('eco-select-message');

  // Messages UX harmonisés pour le comparateur CO₂ (EcoSELECT)
const ECO_SELECT_MESSAGES = {
  emptyList: "Aucun produit à comparer. Scannez un premier article pour commencer.",
  alreadyInCompare: "Ce produit est déjà dans votre comparateur.",
  notAddedAlreadyPresent: "Produit non ajouté. Il est déjà présent dans votre sélection.",
  maxLimit: "Nombre maximum atteint. Supprimez un produit pour en ajouter un autre.",
  removedWarning: "Produit supprimé du comparateur. Scannez-le à nouveau si vous souhaitez le réajouter.",
  removedInfo: "Produit retiré du comparateur. Vous pourrez le réajouter si vous le scannez à nouveau.",
  noCo2ThisProduct: "Les données CO₂ ne sont pas disponibles pour ce produit. Essayez avec un autre article."
};


  if (!listEl) {
    console.warn('[EcoSELECT] #eco-select-list introuvable dans le DOM.');
  }
  if (!messageEl) {
    console.warn('[EcoSELECT] #eco-select-message introuvable dans le DOM.');
  }

  // ==============================
  // 🧩 Helpers internes
  // ==============================

  function findProductByEAN(ean) {
    if (!ean) return null;
    return ecoProducts.find(p => String(p.ean) === String(ean)) || null;
  }

  function sortProducts() {
    ecoProducts.sort((a, b) => {
      if (sortMode === 'distance') {
        const da = a.distanceKm;
        const db = b.distanceKm;
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      }

      const ca = a.co2Total;
      const cb = b.co2Total;
      if (ca == null && cb == null) return 0;
      if (ca == null) return 1;
      if (cb == null) return -1;
      return ca - cb;
    });
  }

  function debugLogState(context) {
    console.log('[EcoSELECT]', context, {
      sortMode,
      count: ecoProducts.length,
      products: ecoProducts,
      recentlyRemoved: Array.from(recentlyRemoved)
    });
  }

    function updateEcoSelectMessage(type, text) {
  if (!messageEl) return;

  // Si pas de texte → on vide le message et on sort
  if (!text) {
    messageEl.innerHTML = "";
    return;
  }

  // Type normalisé (sécurité)
  const normalizedType = (type || "info").toLowerCase();

  // Mapping type → classe + icône
  let variantClass = "honoua-alert-info";
  let icon = "ℹ️";

  switch (normalizedType) {
    case "success":
      variantClass = "honoua-alert-success";
      icon = "✔️";
      break;
    case "warning":
      variantClass = "honoua-alert-warning";
      icon = "⚠️";
      break;
    case "error":
      variantClass = "honoua-alert-error";
      icon = "❌";
      break;
    case "info":
    default:
      variantClass = "honoua-alert-info";
      icon = "ℹ️";
      break;
  }

  // Injection HTML du composant d’alerte Honoua
  messageEl.innerHTML = `
    <div class="honoua-alert ${variantClass}">
      <span class="honoua-alert-icon">${icon}</span>
      <span class="honoua-alert-text">${text}</span>
    </div>
  `;
}


 
  // ==============================
  // 🎨 Rendu DOM
  // ==============================

  function renderProductItem(product, isBest) {
    const wrapper = document.createElement('div');
    wrapper.className = 'eco-item-wrapper';

    const item = document.createElement('div');
    item.className = 'eco-item';
    item.dataset.ean = String(product.ean);

    if (isBest) {
      item.classList.add('eco-item-best');
    }

    const main = document.createElement('div');
    main.className = 'eco-item-main';

    const nameEl = document.createElement('div');
    nameEl.className = 'eco-item-name';
    nameEl.textContent = product.label || 'Produit alimentaire';

    const meta = document.createElement('div');
    meta.className = 'eco-item-meta';

    const co2El = document.createElement('span');
    co2El.className = 'eco-item-co2';
    if (product.hasCo2Data && product.co2Total != null) {
      co2El.textContent = product.co2Total.toFixed(2) + ' kg CO₂';
    } else {
      co2El.textContent = 'Données CO₂ indisponibles';
    }

    const distEl = document.createElement('span');
    distEl.className = 'eco-item-distance';
    if (product.distanceKm != null && !isNaN(product.distanceKm)) {
      distEl.textContent = product.distanceKm + ' km';
    } else {
      distEl.textContent = 'Distance : –';
    }

    const originEl = document.createElement('span');
    originEl.className = 'eco-item-origin';
    originEl.textContent = 'Origine : ' + (product.origin || 'Inconnue');

    meta.appendChild(co2El);
    meta.appendChild(distEl);
    meta.appendChild(originEl);

    main.appendChild(nameEl);
    main.appendChild(meta);

    const score = document.createElement('div');
    score.className = 'eco-item-score';

    const badge = document.createElement('span');
    badge.className = 'eco-item-badge';

    if (!product.hasCo2Data || product.co2Total == null) {
      badge.classList.add('eco-item-badge-unknown');
      badge.textContent = 'Inconnu';
    } else {
      const c = product.co2Total;
      if (c < 1) {
        badge.classList.add('eco-item-badge-green');
        badge.textContent = 'Bas CO₂';
      } else if (c < 3) {
        badge.classList.add('eco-item-badge-medium');
        badge.textContent = 'Moyen';
      } else {
        badge.classList.add('eco-item-badge-high');
        badge.textContent = 'Élevé';
      }
    }

    score.appendChild(badge);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'eco-item-delete';
    deleteBtn.textContent = 'Supprimer';

    deleteBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      const ean = product.ean;
      if (typeof window.ecoSelectRemoveProduct === 'function') {
        window.ecoSelectRemoveProduct(ean);
      }
    });

    item.appendChild(main);
    item.appendChild(score);

    wrapper.appendChild(deleteBtn);
    wrapper.appendChild(item);

    attachSwipeHandlers(wrapper, item, product.ean);

    return wrapper;
  }

   function renderList() {
  if (!listEl) return;

  listEl.innerHTML = '';

  // A55.16 — message si aucun produit dans EcoSELECT
  if (!ecoProducts || ecoProducts.length === 0) {
   updateEcoSelectMessage('info', ECO_SELECT_MESSAGES.emptyList);
    return;
  } else {
    // La liste n’est plus vide : on efface un éventuel ancien message
    updateEcoSelectMessage();
  }

  // 👉 À partir d’ici, tu laisses le reste de la fonction tel quel
  // (calcul de bestIndex, création des éléments DOM, etc.)


    let bestIndex = -1;
    if (sortMode === 'co2') {
      for (let i = 0; i < ecoProducts.length; i++) {
        if (ecoProducts[i].co2Total != null) {
          bestIndex = i;
          break;
        }
      }
    } else if (sortMode === 'distance') {
      for (let i = 0; i < ecoProducts.length; i++) {
        if (ecoProducts[i].distanceKm != null) {
          bestIndex = i;
          break;
        }
      }
    }

    ecoProducts.forEach((p, idx) => {
      const isBest = (idx === bestIndex);
      const row = renderProductItem(p, isBest);
      listEl.appendChild(row);
    });
  }

  // ==============================
  // 👆 Swipe pour supprimer
  // ==============================

  function closeAllOpenItems(exceptWrapper) {
    if (!listEl) return;
    const openWrappers = listEl.querySelectorAll('.eco-item-wrapper.eco-item-open');
    openWrappers.forEach(w => {
      if (w === exceptWrapper) return;
      w.classList.remove('eco-item-open');
      const inner = w.querySelector('.eco-item');
      if (inner) {
        inner.style.transition = 'transform 0.15s ease-out';
        inner.style.transform = 'translateX(0px)';
      }
    });
  }

  function attachSwipeHandlers(wrapperEl, itemEl, ean) {
    let startX = 0;
    let currentX = 0;
    let dragging = false;
    const maxTranslate = -80;
    const openThreshold = -60;

    function onPointerDown(ev) {
      dragging = true;
      startX = ev.clientX;
      currentX = startX;
      itemEl.style.transition = 'none';
      closeAllOpenItems(wrapperEl);
      itemEl.setPointerCapture?.(ev.pointerId);
    }

    function onPointerMove(ev) {
      if (!dragging) return;
      currentX = ev.clientX;
      let deltaX = currentX - startX;

      if (deltaX > 0) deltaX = 0;
      if (deltaX < maxTranslate) deltaX = maxTranslate;

      itemEl.style.transform = 'translateX(' + deltaX + 'px)';
    }

    function onPointerUp(ev) {
      if (!dragging) return;
      dragging = false;
      itemEl.style.transition = 'transform 0.15s ease-out';

      const deltaX = ev.clientX - startX;

      if (deltaX <= openThreshold) {
        wrapperEl.classList.add('eco-item-open');
        itemEl.style.transform = 'translateX(' + maxTranslate + 'px)';
      } else {
        wrapperEl.classList.remove('eco-item-open');
        itemEl.style.transform = 'translateX(0px)';
      }

      try {
        itemEl.releasePointerCapture?.(ev.pointerId);
      } catch (_) {}
    }

    function onPointerCancel(ev) {
      if (!dragging) return;
      dragging = false;
      itemEl.style.transition = 'transform 0.15s ease-out';
      wrapperEl.classList.remove('eco-item-open');
      itemEl.style.transform = 'translateX(0px)';
      try {
        itemEl.releasePointerCapture?.(ev.pointerId);
      } catch (_) {}
    }

    itemEl.addEventListener('pointerdown', onPointerDown);
    itemEl.addEventListener('pointermove', onPointerMove);
    itemEl.addEventListener('pointerup', onPointerUp);
    itemEl.addEventListener('pointercancel', onPointerCancel);
    itemEl.addEventListener('pointerleave', (ev) => {
      if (!dragging) return;
      onPointerUp(ev);
    });
  }

  // ==============================
  // ➕ Ajout / suppression interne
  // ==============================

  function addProduct(ecoProduct) {
    if (!ecoProduct || !ecoProduct.ean) {
      console.warn('[EcoSELECT] ecoProduct invalide ou sans EAN :', ecoProduct);
      return;
    }

    const ean = String(ecoProduct.ean).trim();

    if (recentlyRemoved.has(ean)) {

      // Quand le produit est supprimé (action forte, type suppression)
      updateEcoSelectMessage('warning', ECO_SELECT_MESSAGES.removedWarning);
      recentlyRemoved.delete(ean);
      debugLogState('rescann_apres_suppression_1er_passage');
      return;
    }

    const existing = findProductByEAN(ean);
    if (existing) {
      console.log('[EcoSELECT] Produit déjà présent, pas d’ajout en double :', ean);
      debugLogState('doublon');

        // 🆕 A55 — message clair pour le doublon
        // produit déjà dans le comparateur
      updateEcoSelectMessage('info', ECO_SELECT_MESSAGES.alreadyInCompare);

      if (listEl) {
        const existingRow = listEl.querySelector('.eco-item[data-ean="' + ean + '"]');
        if (existingRow) {
          try {
            existingRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (_) {}

          existingRow.classList.add('eco-item-dup');
          setTimeout(() => {
            existingRow.classList.remove('eco-item-dup');
          }, 800);
        }
      }

      return;
    }

    if (ecoProducts.length >= MAX_PRODUCTS) {
      console.log(
        '[EcoSELECT] Limite max atteinte (' + MAX_PRODUCTS +
        ' produits). Produit non ajouté :', ean
      );

      updateEcoSelectMessage('error', ECO_SELECT_MESSAGES.maxLimit);

      debugLogState('limite_atteinte');
      return;
    }

    ecoProducts.push({
      ean: ean,
      label: ecoProduct.label || 'Produit alimentaire',
      co2Total: ecoProduct.co2Total ?? null,
      distanceKm: ecoProduct.distanceKm ?? null,
      origin: ecoProduct.origin ?? null,
      hasCo2Data: Boolean(ecoProduct.hasCo2Data)
    });

    // A55.16 — message si pas de données CO₂ pour ce produit
    const lastProduct = ecoProducts[ecoProducts.length - 1];
    if (!lastProduct.hasCo2Data) {
     // si tu as un cas explicite "non ajouté car déjà là"
     updateEcoSelectMessage('info', ECO_SELECT_MESSAGES.notAddedAlreadyPresent);
    } else {
      // Si le produit a des données CO₂, on efface un éventuel ancien message
      updateEcoSelectMessage(null, '');
    }

    sortProducts();
    renderList();
    debugLogState('ajout');
  }


  function removeProduct(ean) {
    if (!ean) return;

    const before = ecoProducts.length;
    ecoProducts = ecoProducts.filter(p => String(p.ean) !== String(ean));
    const after = ecoProducts.length;

    recentlyRemoved.add(String(ean));

    console.log(
      '[EcoSELECT] removeProduct, EAN =', ean,
      '| avant =', before,
      '| après =', after,
      '| recentlyRemoved =', Array.from(recentlyRemoved)
    );

     // si tu as un cas explicite "non ajouté car déjà là"
        updateEcoSelectMessage('info', ECO_SELECT_MESSAGES.notAddedAlreadyPresent);

    renderList();
    debugLogState('suppression');
  }

  // ==============================
  // 🌍 API publique
  // ==============================

  function ecoSelectAddProduct(ecoProduct) {
    console.log('[EcoSELECT] ecoSelectAddProduct reçu :', ecoProduct);
    addProduct(ecoProduct);
  }

  function ecoSelectRemoveProduct(ean) {
    removeProduct(ean);
  }

  function ecoSelectSetSortMode(mode) {
  if (mode !== 'co2' && mode !== 'distance') {
    console.warn('[EcoSELECT] Mode de tri invalide :', mode);
    return;
  }

  sortMode = mode;

  // A55.16 — messages de tri
  if (mode === 'co2') {
    updateEcoSelectMessage('info', 'Tri par CO₂ activé.');
  } else if (mode === 'distance') {
    updateEcoSelectMessage('info', 'Tri par distance activé.');
  }

  sortProducts();
  renderList();
  debugLogState('changement_sortMode');
}



  window.ecoSelectAddProduct = ecoSelectAddProduct;
  window.ecoSelectRemoveProduct = ecoSelectRemoveProduct;
  window.ecoSelectSetSortMode = ecoSelectSetSortMode;

  console.log('[EcoSELECT] Initialisé (logique + DOM + swipe).');
})();
