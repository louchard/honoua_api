// =======================
// ÉTAT GLOBAL SCANIMPACT
// =======================

// Panier CO₂ : chaque entrée ressemble à :
// { ean, name, quantity, co2_unit_g, co2_total_g, distance_km, category }
let co2Cart = [];

// =======================
// HELPERS GÉNÉRIQUES
// =======================

function formatNumberFr(value, decimals = 0) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Petit helper pour les jours de captation → exposé globalement au cas où tu l'utilises ailleurs
window.computeDaysTreeCapture = window.computeDaysTreeCapture || function (totalCo2Kg) {
  // Hypothèse simple : 0,83 kg CO₂ captés par arbre et par jour (à ajuster si besoin)
  const CO2_PER_DAY_KG = 0.83;
  return totalCo2Kg / CO2_PER_DAY_KG;
};

// =======================
// BLOC STATUT PRODUIT (DISPONIBLE / NON DISPONIBLE)
// =======================

function showScanImpactStatus(isAvailable, productName) {
  const box  = document.getElementById('scanimpact-product-status');
  const msg  = document.getElementById('scanimpact-status-message');
  const name = document.getElementById('scanimpact-status-name');

  if (!box || !msg || !name) {
    console.warn('[ScanImpact] Bloc statut produit introuvable dans le DOM.');
    return;
  }

  box.classList.remove('hidden', 'scanimpact-status--ok', 'scanimpact-status--error');

  if (isAvailable) {
    box.classList.add('scanimpact-status--ok');
    msg.textContent = 'Produit disponible';
    name.textContent = productName || '';
  } else {
    box.classList.add('scanimpact-status--error');
    msg.textContent = 'Produit non disponible';
    name.textContent = productName || 'Référence inconnue';
  }
}

// Je l’expose pour que ton scanner (ou un autre script) puisse l’utiliser facilement
window.showScanImpactStatus = showScanImpactStatus;

// =======================
// GESTION DU PANIER CO₂
// =======================

function addProductToCart(product) {
  // product attendu : { ean, name, co2_unit_g, distance_km, category }
  if (!product || !product.ean) {
    console.warn('[ScanImpact] Produit invalide pour addProductToCart', product);
    return;
  }

  const existing = co2Cart.find(item => item.ean === product.ean);
  const unitCo2 = Number.isFinite(product.co2_unit_g) ? product.co2_unit_g : 0;
  const distanceKm = Number.isFinite(product.distance_km) ? product.distance_km : 0;

  if (existing) {
    existing.quantity += 1;
    existing.co2_total_g = existing.quantity * unitCo2;
  } else {
    co2Cart.push({
      ean: product.ean,
      name: product.name || 'Produit sans nom',
      quantity: 1,
      co2_unit_g: unitCo2,
      co2_total_g: unitCo2,
      distance_km: distanceKm,
      category: product.category || null
    });
  }

  updateCartUI();
}

// Idem, on expose pour que ton script de scan puisse appeler facilement :
window.addProductToScanImpactCart = addProductToCart;

function removeProductFromCart(ean) {
  co2Cart = co2Cart.filter(item => item.ean !== ean);
  updateCartUI();
}

function clearCart() {
  co2Cart = [];
  updateCartUI();
}

// =======================
// MISE À JOUR UI : LISTE + RÉSUMÉ (+ CER CLES SI PRÉSENTS DANS LE DOM)
// =======================

function updateCartUI() {
  const $list         = document.getElementById('co2-cart-list');
  const $totalItems   = document.getElementById('co2-cart-total-items');
  const $distinctProd = document.getElementById('co2-cart-distinct-products');
  const $totalCo2Line = document.getElementById('co2-cart-total-co2');

  // Cercles : optionnels (si tu les ajoutes dans le HTML, le JS les remplira)
  const $circleTotalCo2  = document.getElementById('co2-circle-total-co2-value');
  const $circleTotalDist = document.getElementById('co2-circle-total-distance-value');
  const $circleAvgCo2    = document.getElementById('co2-circle-avg-co2-value');
  const $circleAvgDist   = document.getElementById('co2-circle-avg-distance-value');

  if (!$list || !$totalItems || !$distinctProd || !$totalCo2Line) {
    console.warn('[ScanImpact] Éléments UI du panier manquants.');
    return;
  }

  $list.innerHTML = '';

  if (co2Cart.length === 0) {
    $list.innerHTML = `
      <p class="co2-cart-empty">
        Le panier est vide. Scannez un produit pour commencer.
      </p>
    `;

    $totalItems.textContent   = '0 article scanné';
    $distinctProd.textContent = '0 produit distinct';
    $totalCo2Line.textContent = 'Total : 0 g CO₂e';

    if ($circleTotalCo2)  $circleTotalCo2.textContent  = '—';
    if ($circleTotalDist) $circleTotalDist.textContent = '—';
    if ($circleAvgCo2)    $circleAvgCo2.textContent    = '—';
    if ($circleAvgDist)   $circleAvgDist.textContent   = '—';

    return;
  }

  let totalItems  = 0;
  let totalCo2G   = 0;
  let totalDistKm = 0;
  const distinctCount = co2Cart.length;

  co2Cart.forEach(item => {
    totalItems  += item.quantity;
    totalCo2G   += item.co2_total_g || 0;
    totalDistKm += (item.distance_km || 0) * item.quantity;

    const row = document.createElement('div');
    row.className = 'co2-cart-item';

    const left = document.createElement('div');
    left.className = 'co2-cart-item-left';

    const name = document.createElement('div');
    name.className = 'co2-cart-name';
    name.textContent = item.name;

    const metrics = document.createElement('div');
    metrics.className = 'co2-cart-metrics';

    let co2Text = 'CO₂ : n.d.';
    if (Number.isFinite(item.co2_unit_g)) {
      if (item.co2_unit_g < 1000) {
        co2Text = `${formatNumberFr(Math.round(item.co2_unit_g))} g CO₂e / produit`;
      } else {
        co2Text = `${formatNumberFr(item.co2_unit_g / 1000, 1)} kg CO₂e / produit`;
      }
    }

    let distText = 'Dist. : n.d.';
    if (Number.isFinite(item.distance_km) && item.distance_km > 0) {
      distText = `${formatNumberFr(item.distance_km, 0)} km`;
    }

    metrics.textContent = `${co2Text} • ${distText}`;

    left.appendChild(name);
    left.appendChild(metrics);

    const right = document.createElement('div');
    right.className = 'co2-cart-item-right';

    const qty = document.createElement('span');
    qty.className = 'co2-cart-qty-badge';
    qty.textContent = `×${item.quantity}`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'co2-cart-remove-x';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeProductFromCart(item.ean));

    right.appendChild(qty);
    right.appendChild(removeBtn);

    row.appendChild(left);
    row.appendChild(right);

    $list.appendChild(row);
  });

  // Récap texte
  $totalItems.textContent =
    totalItems > 1 ? `${totalItems} articles scannés` : `${totalItems} article scanné`;

  $distinctProd.textContent =
    distinctCount > 1 ? `${distinctCount} produits distincts` : `${distinctCount} produit distinct`;

  const totalCo2Kg = totalCo2G / 1000;
  if (totalCo2G < 1000) {
    $totalCo2Line.textContent =
      `Total : ${formatNumberFr(Math.round(totalCo2G))} g CO₂e`;
  } else {
    $totalCo2Line.textContent =
      `Total : ${formatNumberFr(totalCo2Kg, 2)} kg CO₂e`;
  }

  // Cercles (si présents dans le DOM)
  if ($circleTotalCo2) {
    $circleTotalCo2.textContent =
      totalCo2G < 1000
        ? `${formatNumberFr(Math.round(totalCo2G))} g`
        : `${formatNumberFr(totalCo2Kg, 1)} kg`;
  }

  if ($circleTotalDist) {
    $circleTotalDist.textContent = `${formatNumberFr(totalDistKm, 0)} km`;
  }

  if ($circleAvgCo2) {
    if (totalItems > 0) {
      const avgCo2G = totalCo2G / totalItems;
      $circleAvgCo2.textContent =
        avgCo2G < 1000
          ? `${formatNumberFr(Math.round(avgCo2G))} g`
          : `${formatNumberFr(avgCo2G / 1000, 1)} kg`;
    } else {
      $circleAvgCo2.textContent = '—';
    }
  }

  if ($circleAvgDist) {
    if (totalItems > 0) {
      const avgDist = totalDistKm / totalItems;
      $circleAvgDist.textContent = `${formatNumberFr(avgDist, 0)} km`;
    } else {
      $circleAvgDist.textContent = '—';
    }
  }
}

// =======================
// CATÉGORIES & GRAPHIQUE
// =======================

function mapCategoryForGraph(rawCategoryText) {
  const text = (rawCategoryText || '').toLowerCase();

  const viandeKeywords = [
    'viande', 'bœuf', 'boeuf', 'porc', 'poulet',
    'volaille', 'dinde', 'agneau', 'charcut', 'steak'
  ];
  if (viandeKeywords.some(k => text.includes(k))) {
    return 'Viande';
  }

  const vegetalKeywords = [
    'légume', 'legume', 'légumes', 'legumes',
    'fruit', 'fruits',
    'végétal', 'vegetal', 'végétaux', 'vegetaux',
    'céréale', 'cereale', 'céréales', 'cereales',
    'légumineuse', 'legumineuse', 'légumineuses', 'legumineuses'
  ];
  if (vegetalKeywords.some(k => text.includes(k))) {
    return 'Végétaux';
  }

  const epicerieKeywords = [
    'épicerie', 'epicerie',
    'sucré', 'sucre', 'sucrerie',
    'chocolat',
    'biscuit', 'biscuits',
    'gâteau', 'gateau', 'gâteaux', 'gateaux',
    'pâtisserie', 'patisserie',
    'snack', 'barre', 'barres'
  ];
  if (epicerieKeywords.some(k => text.includes(k))) {
    return 'Épicerie';
  }

  const boissonKeywords = [
    'boisson', 'boissons',
    'eau', 'soda', 'limonade',
    'jus', 'sirop'
  ];
  if (boissonKeywords.some(k => text.includes(k))) {
    return 'Boisson';
  }

  return 'Autres';
}

function getCategoryColor(cat) {
  switch (cat) {
    case 'Viande':
      return '#D9534F'; // rouge
    case 'Végétaux':
      return '#5CB85C'; // vert
    case 'Épicerie':
      return '#F0AD4E'; // orange
    case 'Boisson':
      return '#5BC0DE'; // bleu
    case 'Autres':
      return '#999999'; // gris
    default:
      return '#CCCCCC';
  }
}

function drawCategoryPie(totals, totalAll) {
  const canvas = document.getElementById('co2-category-pie');
  if (!canvas || !canvas.getContext || !totalAll || totalAll <= 0) {
    return;
  }

  const ctx = canvas.getContext('2d');
  canvas.width  = 180;
  canvas.height = 180;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const centerX = w / 2;
  const centerY = h / 2;
  const radius  = Math.min(w, h) / 2 - 6;

  let startAngle = -Math.PI / 2;
  const ordered = ['Viande', 'Végétaux', 'Épicerie', 'Boisson', 'Autres'];

  ordered.forEach(cat => {
    const valueG = totals[cat];
    if (!valueG || valueG <= 0) return;

    const sliceAngle = (valueG / totalAll) * 2 * Math.PI;
    const endAngle   = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = getCategoryColor(cat);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle = endAngle;
  });

  console.log('[ScanImpact] Camembert catégories dessiné.');
}

// =======================
// VALIDATION PANIER & RAPPORT
// =======================

async function validateCartAndShowReport() {
  if (!co2Cart.length) {
    alert('Votre panier est vide.');
    return;
  }

  let totalItems  = 0;
  let totalCo2G   = 0;
  let totalDistKm = 0;

  co2Cart.forEach(item => {
    totalItems  += item.quantity;
    totalCo2G   += item.co2_total_g || 0;
    totalDistKm += (item.distance_km || 0) * item.quantity;
  });

  const totalCo2Kg = totalCo2G / 1000;

  const payload = {
    total_co2_g: totalCo2G,
    nb_articles: totalItems,
    nb_distinct_products: co2Cart.length,
    total_distance_km: totalDistKm
  };

  let apiResponse = null;
  try {
    const res = await fetch('/api/cart/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      apiResponse = await res.json();
      console.log('[ScanImpact] Panier enregistré :', apiResponse);
    } else {
      console.warn('[ScanImpact] Erreur API /api/cart/history :', res.status);
    }
  } catch (err) {
    console.error('[ScanImpact] Erreur réseau /api/cart/history :', err);
  }

  fillCartReport(co2Cart, totalItems, totalCo2G, totalCo2Kg, totalDistKm, apiResponse);

  // Bascule mode ÉDITION → mode RAPPORT
  const $edit   = document.getElementById('scanimpact-edit');
  const $report = document.getElementById('co2-cart-report-section');

  if ($edit && $report) {
    $edit.classList.add('hidden');
    $report.classList.remove('hidden');
  }
}

function fillCartReport(cart, totalItems, totalCo2G, totalCo2Kg, totalDistKm, apiResponse) {
  const $reportSection = document.getElementById('co2-cart-report-section');
  if (!$reportSection) return;

  // En-tête du rapport (nom / date)
  const $name = document.getElementById('co2-cart-report-name');
  const now   = new Date();
  const d     = now.toLocaleDateString('fr-FR');
  const t     = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if ($name) {
    if (apiResponse && apiResponse.id) {
      $name.textContent = `Panier #${apiResponse.id} du ${d} - ${t}`;
    } else {
      $name.textContent = `Panier du ${d} - ${t}`;
    }
  }

  // 1) Équivalence CO₂ → arbre
  const $reportTree = document.getElementById('co2-cart-report-tree');
  const $treeNumber = document.getElementById('co2-tree-number');

  if ($reportTree && $treeNumber) {
    let text = `Ce panier ne contient pas encore assez d’informations pour estimer une équivalence en arbres.`;

    if (Number.isFinite(totalCo2Kg) && totalCo2Kg > 0) {
      const daysCaptured   = window.computeDaysTreeCapture(totalCo2Kg);
      const treeEquivalent = daysCaptured / 30;
      const daysRounded    = Math.round(daysCaptured);

      // Nombre principal
      if (treeEquivalent < 1) {
        $treeNumber.textContent = '< 1';
      } else if (treeEquivalent < 10) {
        $treeNumber.textContent = formatNumberFr(treeEquivalent, 1);
      } else {
        $treeNumber.textContent = formatNumberFr(Math.round(treeEquivalent));
      }

      // Badge visuel (🌳 répétées)
      const $treeIcons = document.getElementById('co2-tree-icons');
      const $treeBadge = document.getElementById('co2-tree-number-badge');
      if ($treeIcons && $treeBadge) {
        const value     = treeEquivalent;
        const iconsCount = Math.floor(value);
        const maxIcons   = 10;
        let icons = '';

        if (iconsCount >= 1) {
          const countToShow = Math.min(iconsCount, maxIcons);
          icons = '🌳'.repeat(countToShow);
          if (iconsCount > maxIcons) {
            icons += '+';
          }
        } else {
          icons = '🌱';
        }

        $treeIcons.textContent = icons;
        if (treeEquivalent < 1) {
          $treeBadge.textContent = '(< 1)';
        } else {
          $treeBadge.textContent = `(${formatNumberFr(treeEquivalent, 1)})`;
        }
      }

      // Phrase détaillée
      if (treeEquivalent < 1) {
        text = `Ce panier représente moins d’un arbre captant pendant ${daysRounded} jours.`;
      } else if (treeEquivalent < 10) {
        text = `Ce panier représente environ ${formatNumberFr(treeEquivalent, 1)} arbres captant pendant ${daysRounded} jours.`;
      } else {
        text = `Ce panier représente environ ${formatNumberFr(Math.round(treeEquivalent))} arbres captant pendant ${daysRounded} jours.`;
      }
    } else {
      $treeNumber.textContent = '—';
      const $treeIcons = document.getElementById('co2-tree-icons');
      const $treeBadge = document.getElementById('co2-tree-number-badge');
      if ($treeIcons && $treeBadge) {
        $treeIcons.textContent = '—';
        $treeBadge.textContent = '(—)';
      }
    }

    $reportTree.textContent = text;
  }

  // 2) Émissions CO₂
  const $co2Total = document.getElementById('co2-cart-report-co2-total');
  const $co2Avg   = document.getElementById('co2-cart-report-co2-average');

  if ($co2Total) {
    if (totalCo2G < 1000) {
      $co2Total.textContent =
        `Émissions totales : ${formatNumberFr(Math.round(totalCo2G))} g CO₂e.`;
    } else {
      $co2Total.textContent =
        `Émissions totales : ${formatNumberFr(totalCo2Kg, 2)} kg CO₂e.`;
    }
  }

  if ($co2Avg) {
    if (totalItems > 0) {
      const avgCo2G = totalCo2G / totalItems;
      if (avgCo2G < 1000) {
        $co2Avg.textContent =
          `Émissions moyennes par produit : ${formatNumberFr(Math.round(avgCo2G))} g CO₂e.`;
      } else {
        $co2Avg.textContent =
          `Émissions moyennes par produit : ${formatNumberFr(avgCo2G / 1000, 2)} kg CO₂e.`;
      }
    } else {
      $co2Avg.textContent =
        'Émissions moyennes par produit : données indisponibles.';
    }
  }

  // 3) Distances
  const $distTotal   = document.getElementById('co2-cart-report-distance-total');
  const $distAvg     = document.getElementById('co2-cart-report-distance-average');
  const $distComment = document.getElementById('co2-cart-report-distance-locality');

  if ($distTotal) {
    $distTotal.textContent =
      `Distance totale parcourue (pondérée par la quantité) : ${formatNumberFr(totalDistKm, 0)} km.`;
  }

  if ($distAvg) {
    if (totalItems > 0) {
      const avgDist = totalDistKm / totalItems;
      $distAvg.textContent =
        `Distance moyenne par produit : ${formatNumberFr(avgDist, 0)} km.`;

      if ($distComment) {
        if (avgDist <= 250) {
          $distComment.textContent =
            'Votre panier est plutôt local (distance moyenne inférieure ou égale à 250 km).';
        } else {
          $distComment.textContent =
            'Votre panier est plutôt éloigné (distance moyenne supérieure au seuil de 250 km).';
        }
      }
    } else {
      $distAvg.textContent =
        'Distance moyenne par produit : données indisponibles.';
      if ($distComment) {
        $distComment.textContent = '';
      }
    }
  }

  // 4) Recommandations (produits forts / sobres)
  const $highBox = document.getElementById('co2-cart-report-high-impact');
  const $lowBox  = document.getElementById('co2-cart-report-low-impact');

  if ($highBox && $lowBox) {
    $highBox.innerHTML = '';
    $lowBox.innerHTML  = '';

    const scored = cart.filter(i => Number.isFinite(i.co2_unit_g) && i.co2_unit_g > 0);

    if (scored.length === 0) {
      $highBox.textContent =
        'Aucune recommandation disponible : les données CO₂ des produits ne sont pas suffisantes.';
      $lowBox.textContent = '';
    } else {
      scored.sort((a, b) => a.co2_unit_g - b.co2_unit_g);

      const low  = scored.slice(0, 3);
      const high = scored.slice(-3).reverse();

      const highTitle = document.createElement('p');
      highTitle.className = 'co2-reco-title';
      highTitle.textContent = 'Produits à forte empreinte carbone :';
      $highBox.appendChild(highTitle);

      high.forEach(item => {
        const p = document.createElement('p');
        p.textContent =
          `${item.name} – ≈ ${formatNumberFr(item.co2_unit_g, 0)} g CO₂e / produit`;
        $highBox.appendChild(p);
      });

      const lowTitle = document.createElement('p');
      lowTitle.className = 'co2-reco-title';
      lowTitle.textContent = 'Produits les plus sobres en CO₂ :';
      $lowBox.appendChild(lowTitle);

      low.forEach(item => {
        const p = document.createElement('p');
        p.textContent =
          `${item.name} – ≈ ${formatNumberFr(item.co2_unit_g, 0)} g CO₂e / produit`;
        $lowBox.appendChild(p);
      });
    }
  }

  // 5) Répartition par catégories (texte + graphique)
  const $catBox   = document.getElementById('co2-cart-report-categories');
  const $dominant = document.getElementById('co2-category-dominant');
  const $legend   = document.getElementById('co2-category-legend');

  if ($catBox && $dominant && $legend) {
    const totals = {
      'Viande':   0,
      'Végétaux': 0,
      'Épicerie': 0,
      'Boisson':  0,
      'Autres':   0
    };

    cart.forEach(item => {
      const cat = mapCategoryForGraph(item.category || '');
      const co2TotalG = Number.isFinite(item.co2_total_g) ? item.co2_total_g : 0;
      totals[cat] += co2TotalG;
    });

    const totalAll = Object.values(totals).reduce((s, v) => s + v, 0);
    $catBox.innerHTML = '';

    if (totalAll <= 0) {
      const p = document.createElement('p');
      p.textContent =
        'Impossible de calculer la répartition par catégories (données CO₂ insuffisantes dans le panier).';
      $catBox.appendChild(p);
    } else {
      const ulText = document.createElement('ul');
      ulText.className = 'co2-cart-cat-list';

      function addLine(label) {
        const v = totals[label];
        if (!v || v <= 0) return;
        const kg    = v / 1000;
        const share = Math.round((v / totalAll) * 100);
        const li    = document.createElement('li');
        li.textContent =
          `${label} : ${formatNumberFr(kg, 1)} kg CO₂e (${share} %)`;
        ulText.appendChild(li);
      }

      addLine('Viande');
      addLine('Végétaux');
      addLine('Épicerie');
      addLine('Boisson');
      addLine('Autres');

      $catBox.appendChild(ulText);

      // Dominante
      let domCat = null;
      let domVal = 0;
      Object.keys(totals).forEach(cat => {
        const v = totals[cat];
        if (v > domVal) {
          domVal = v;
          domCat = cat;
        }
      });

      if (domCat && domVal > 0) {
        const shareDom = Math.round((domVal / totalAll) * 100);
        $dominant.textContent =
          `Catégorie dominante : ${domCat} (${shareDom} %)`;
      } else {
        $dominant.textContent =
          'Aucune catégorie dominante (données insuffisantes).';
      }

      // Légende interactive
      $legend.innerHTML = '';
      const ordered = ['Viande', 'Végétaux', 'Épicerie', 'Boisson', 'Autres'];
      const defaultDominant = $dominant.textContent;

      ordered.forEach(cat => {
        const v = totals[cat];
        if (!v || v <= 0) return;

        const kg    = v / 1000;
        const share = Math.round((v / totalAll) * 100);

        const li = document.createElement('li');

        const colorBox = document.createElement('span');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = getCategoryColor(cat);

        const textSpan = document.createElement('span');
        textSpan.textContent =
          `${cat} – ${share} % (${formatNumberFr(kg, 1)} kg CO₂e)`;

        li.appendChild(colorBox);
        li.appendChild(textSpan);

        li.addEventListener('mouseenter', () => {
          $dominant.textContent =
            `${cat} : ${share} % (${formatNumberFr(kg, 1)} kg CO₂e)`;
          li.classList.add('active');
        });

        li.addEventListener('mouseleave', () => {
          $dominant.textContent = defaultDominant;
          li.classList.remove('active');
        });

        li.addEventListener('click', () => {
          $dominant.textContent =
            `${cat} : ${share} % (${formatNumberFr(kg, 1)} kg CO₂e)`;
          Array.from($legend.querySelectorAll('li')).forEach(el => {
            el.classList.remove('active');
          });
          li.classList.add('active');
        });

        $legend.appendChild(li);
      });

      drawCategoryPie(totals, totalAll);
    }
  }

  $reportSection.classList.remove('hidden');
}

// =======================
// INIT ÉVÈNEMENTS
// =======================

document.addEventListener('DOMContentLoaded', () => {
  updateCartUI();

  const $clear    = document.getElementById('co2-cart-clear-btn');
  const $validate = document.getElementById('co2-cart-validate-btn');

  if ($clear) {
    $clear.addEventListener('click', () => {
      if (co2Cart.length && !confirm('Vider le panier ?')) return;
      clearCart();
    });
  }

  if ($validate) {
    $validate.addEventListener('click', () => {
      validateCartAndShowReport();
    });
  }

  // Boutons scanner : à brancher sur TA logique existante
  const $startScan = document.getElementById('scan-start-scan');
  const $stopScan  = document.getElementById('scan-stop-scan');
  const $switchCam = document.getElementById('scan-switch-camera');

  if ($startScan) {
    $startScan.addEventListener('click', () => {
      console.log('[ScanImpact] Démarrer le scan (brancher ton scanner ici).');
      // Exemple : window.startHonouaScannerForScanImpact?.();
    });
  }

  if ($stopScan) {
    $stopScan.addEventListener('click', () => {
      console.log('[ScanImpact] Arrêter le scan (brancher ton scanner ici).');
    });
  }

  if ($switchCam) {
    $switchCam.addEventListener('click', () => {
      console.log('[ScanImpact] Changer de caméra (brancher ta logique ici).');
    });
  }

  console.log('[ScanImpact] Initialisé pour le MVP.');
});
