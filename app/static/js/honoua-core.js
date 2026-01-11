
console.log("[Honoua] build: 2026-01-09-H002");

(async () => {
  const $video = document.getElementById('preview');
  const $cams  = document.getElementById('cameras');
  const $start = document.getElementById('btnStart');
  const $reset = document.getElementById('btnReset');
  const $torch = document.getElementById('btnTorch');
  const $state = document.getElementById('state');
  const $badge = document.getElementById('stateBadge');
  const $reticle = document.querySelector('.reticle');
  const $eanInput   = document.getElementById('eanInput');
  const $btnTestEan = document.getElementById('btnTestEan');
  const $co2TreeCapture  = document.getElementById('co2TreeCapture');



    // === Config API Honoua ===
  // PrioritÃ© des sources (de la plus forte Ã  la plus faible) :
  // 1) window.HONOUA_API_BASE_OVERRIDE (utile en debug)
  // 2) <meta name="honoua-api-base" content="https://api.honoua.com">
  // 3) localStorage('honoua_api_base')
  // 4) fallback prod : https://api.honoua.com
  function normalizeBaseUrl(url) {
    return (url || '').trim().replace(/\/+$/, '');
  }

  const HONOUA_API_BASE = (function resolveHonouaApiBase() {
    // 1) Override global
    if (typeof window !== 'undefined' && window.HONOUA_API_BASE_OVERRIDE) {
      return normalizeBaseUrl(window.HONOUA_API_BASE_OVERRIDE);
    }

    // 2) Meta tag (si tu veux le piloter par page)
    const meta = document.querySelector('meta[name="honoua-api-base"]');
    if (meta && meta.content) {
      return normalizeBaseUrl(meta.content);
    }

    // 3) localStorage (si tu veux le piloter sans changer le code)
    try {
      const ls = localStorage.getItem('honoua_api_base');
      if (ls) return normalizeBaseUrl(ls);
    } catch (e) {}

    // 4) Par défaut : PROD
    return 'https://api.honoua.com';
  })();

  // Expose la base API pour debug et pour les autres scripts
  window.HONOUA_API_BASE = HONOUA_API_BASE;

  // Endpoints REST utilisés par le scanner
  const CO2_API_BASE = `${HONOUA_API_BASE}/api/v1/co2/product`;
  const CART_HISTORY_ENDPOINT = `${HONOUA_API_BASE}/api/cart/history`;

  // ✅ rend l’endpoint accessible aux autres scripts
  window.CART_HISTORY_ENDPOINT = CART_HISTORY_ENDPOINT;


  

  // === Éléments de l’encart CO₂ ===
  const $co2Card         = document.getElementById('co2Card');
  const $co2Badge        = document.getElementById('co2Badge');
  const $co2Empty        = document.getElementById('co2Empty');
  const $co2Content      = document.getElementById('co2Content');
  const $co2ProductLabel = document.getElementById('co2ProductLabel');
  const $co2Total        = document.getElementById('co2Total');
  const $co2Prod         = document.getElementById('co2Prod');
  const $co2Pack         = document.getElementById('co2Pack');
  const $co2Trans        = document.getElementById('co2Trans');
    // Éléments UI pour origine / distance / emballage
  const $co2Origin          = document.getElementById('co2Origin');
  const $co2PackageLabel    = document.getElementById('co2PackageLabel');
  const $co2DetailsDistance = document.getElementById('co2DetailsDistance');
  const $co2DetailsOrigin   = document.getElementById('co2DetailsOrigin');
  const $co2DetailsPackage  = document.getElementById('co2DetailsPackage');
  const $co2Details        = document.getElementById('co2Details');
  const $co2SummaryInfoBtn = document.getElementById('co2SummaryInfoBtn');
  const $co2ReliabilityIcon  = document.getElementById('co2ReliabilityIcon');
  const $co2ReliabilityLabel = document.getElementById('co2ReliabilityLabel');



 
  let currentStream = null;
  let currentTrack = null;
    // --- Quagga2 (fallback iPhone) ---
  let __quaggaRunning = false;

  function isIphoneIOS(){
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isWebkit = /WebKit/.test(ua);
    return isIOS && isWebkit;
  }

  function stopQuagga(){
    try {
      if (window.Quagga && __quaggaRunning) {
        window.Quagga.stop();
      }
    } catch(_) {}
    __quaggaRunning = false;

    // Réaffiche la vidéo native si on l’avait cachée
    try { if ($video) $video.style.display = ''; } catch(_) {}
  }

  async function startQuaggaInTarget(){
    const Q = window.Quagga;
    if (!Q) {
      console.warn('[Quagga] Quagga non chargé (script manquant).');
      try { showScannerError("Quagga non chargé (script)."); } catch(_) {}
      return;
    }

    // IMPORTANT : éviter conflits caméra → stoppe ton stream avant Quagga
    await stopStream(); // stopStream appelle dÃ©jÃ  stopZXing; on va y ajouter stopQuagga plus bas

    // Quagga va créer son propre flux ; on masque la vidéo native
    try { if ($video) $video.style.display = 'none'; } catch(_) {}

    const targetEl = document.querySelector('.video-wrap') || document.body;

    return await new Promise((resolve) => {
      Q.init({
        inputStream: {
          type: "LiveStream",
          target: targetEl,
          constraints: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        locator: {
          halfSample: true
        },
        decoder: {
          readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader"]
        },
        locate: true
      }, (err) => {
        if (err) {
          console.warn('[Quagga] init error:', err);
          try { showScannerError("Impossible de démarrer le scan (Quagga)."); } catch(_) {}
          __quaggaRunning = false;
          return resolve(false);
        }

        __quaggaRunning = true;

        // Important : éviter doublons
        let last = '';
        let lastAt = 0;

        Q.onDetected((data) => {
          try {
            const code = data && data.codeResult && data.codeResult.code ? String(data.codeResult.code).trim() : '';
            const now = Date.now();
            if (!code) return;
            if (code === last && (now - lastAt) < 1200) return;

            last = code; lastAt = now;
            console.info('[Quagga] detected:', code);

            if (typeof window.handleEanDetected === 'function') {
              window.handleEanDetected(code);
            }

            // Stoppe aprÃ¨s dÃ©tection (optionnel, mais utile pour Ã©viter â€œrafalesâ€)
            stopQuagga();
          } catch(_) {}
        });

        Q.start();
        resolve(true);
      });
    });
  }

  let torchSupported = false;
  let torchOn = false;

  async function detectTorchSupport(track){
  torchSupported = false;
  torchOn = false;

  try {
    if ($torch) {
      $torch.disabled = true;
      $torch.classList.remove('torch-on');
      $torch.textContent = 'Lampe';
    }
  } catch (_) {}

  try {
    if (!track || !track.getCapabilities) return false;
    const caps = track.getCapabilities();
    torchSupported = !!caps.torch;

    try { if ($torch) $torch.disabled = !torchSupported; } catch (_) {}
    return torchSupported;
  } catch (_) {
    torchSupported = false;
    try { if ($torch) $torch.disabled = true; } catch (_) {}
    return false;
  }
}



  let lastChallengeAutoEval = 0;

  // --- ZXing (EAN/Code-barres) : iPhone stable ---
  // Important : on Ã©vite decodeFromVideoDevice (double ouverture camÃ©ra). On scanne depuis le stream dÃ©jÃ  ouvert.
  let __zxingReader = null;
  let __zxingControls = null;
  let __lastZxingText = '';
  let __lastZxingAt = 0;

  let __stableEan = '';
  let __stableHits = 0;
  let __stableAt = 0;
  // H-007: anti-répétition (évite ajout en boucle si l’EAN reste dans le champ)
  let __lastAcceptedEan = '';
  let __lastAcceptedAt = 0;



  function stopZXing() {
    // Reset du reader réellement utilisé (singleton global)
try {
    const r = window.__HONOUA_ZXING_READER__;
        if (r && typeof r.reset === 'function') r.reset();
      } catch (_) {}

    try { if (__zxingControls && typeof __zxingControls.stop === 'function') __zxingControls.stop(); } catch (_) {}
    __zxingControls = null;

    try { if (__zxingReader && typeof __zxingReader.reset === 'function') __zxingReader.reset(); } catch (_) {}
    __zxingReader = null;

    __lastZxingText = '';
    __lastZxingAt = 0;
   
    __stableEan = '';
    __stableHits = 0;
    __stableAt = 0;

  }
   
   async function startZXingFromStream(stream) {
  // iOS SAFE MODE
  // Do NOT use decodeFromStream (can trigger cleanVideoSource / aborted play on iOS)

  const video = document.getElementById('preview');
  if (!video) {
    throw new Error('Missing <video id="preview">');
  }

  // Bind stream to the video element (stable path)
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;

try { await video.play(); } catch (_) { /* iOS peut "jouer" malgré l’exception */ }

  // Reuse a singleton reader to avoid multiple concurrent decoders
  if (!window.__HONOUA_ZXING_READER__) {
    window.__HONOUA_ZXING_READER__ = new ZXingBrowser.BrowserMultiFormatReader();
  }
  const reader = window.__HONOUA_ZXING_READER__;
  __zxingReader = reader; // IMPORTANT: stopZXing() resettera le bon reader

  if (window.__HONOUA_SCAN_LOCK__) return;


  // Decode from the VIDEO ELEMENT (not from stream)
  reader.decodeFromVideoElement(video, (result, err) => {
  // Après un scan validé, ignorer TOUT (résultats + erreurs) pour éviter spam + instabilité iOS
  if (window.__HONOUA_SCAN_LOCK__) return;

  // 1) Erreurs attendues en scan continu : ne pas fermer la caméra
  if ((!result || !result.text) && err) {
    const name = err?.name || err?.constructor?.name || '';

    if (
      name.includes('NotFound') ||
      name.includes('Checksum') ||
      name.includes('Format') ||
      name.includes('IndexSizeError')
    ) {
      return;
    }


    // Trop bruyant en scan continu (iOS/Firefox). On ignore.
    return;

  }

  if (result && result.text) {
    const ean = String(result.text).trim();
    if (!ean) return;

    // Filtre anti faux-positifs : EAN-8 (8), UPC-A (12), EAN-13 (13), EAN-14 (14)
    if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(ean)) return;
    
    // Checksum GTIN : bloque les faux positifs (très fréquent sur iPhone)
    if (!isValidGTIN(ean)) return;

    // 2) Stabilisation iOS : exiger 2 détections identiques rapprochées
    const now = Date.now();
    if (__stableEan === ean && (now - __stableAt) < 900) {
      __stableHits += 1;
    } else {
      __stableEan = ean;
      __stableHits = 1;
    }
    __stableAt = now;

    if (__stableHits < 2) return;

    // H-007: anti-répétition "même EAN" sur une courte fenêtre
      const t = Date.now();
      if (ean === __lastAcceptedEan && (t - __lastAcceptedAt) < 3500) return;
      __lastAcceptedEan = ean;
      __lastAcceptedAt = t;


    // Verrou anti double-détection ...
      if (window.__HONOUA_SCAN_LOCK__) return;
      window.__HONOUA_SCAN_LOCK__ = true;
      console.log('[Scan OK]', ean);

        // On traite l’EAN (même chemin que manuel)
        if (typeof fetchCo2ForEan === 'function') {
          fetchCo2ForEan(ean);
        } else if (typeof handleEAN === 'function') {
          handleEAN(ean);
        }

        // IMPORTANT : on NE COUPE PAS la caméra sur iOS (évite écran noir / "crash").
        // On met juste un cooldown puis on réarme le scan.
        setTimeout(() => {
          window.__HONOUA_SCAN_LOCK__ = false;
          __stableEan = '';
          __stableHits = 0;
          __stableAt = 0;
        }, 1200);

        return;

    }
  });
}
    


     function isValidGTIN(code) {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code)) return false;

  const len = code.length;
  let sum = 0;

  // On calcule sur tous les digits sauf le dernier (check digit), en partant de la droite
  for (let i = 0; i < len - 1; i++) {
    const digit = code.charCodeAt((len - 2) - i) - 48; // de droite vers gauche
    const weight = (i % 2 === 0) ? 3 : 1;            // alternance 3,1,3,1...
    sum += digit * weight;
  }

  const check = (10 - (sum % 10)) % 10;
  const last = code.charCodeAt(len - 1) - 48;
  return check === last;
}

  // === Localisation utilisateur (GPS) ===
  const userLocation = {
    lat: null,
    lon: null,
    status: 'pending',  // 'pending' | 'ok' | 'error' | 'unsupported'
    error: null
  };

  // On expose la localisation pour les autres scripts (EcoSelect, ScanImpact, etc.)
  window.HonouaUserLocation = userLocation;

  // Fonction unique pour initialiser la localisation
  function initUserLocation() {
    // 1) Essayer d'abord de relire une localisation dÃ©jÃ  stockÃ©e
    try {
      const raw = localStorage.getItem('honoua_user_location');
      if (raw) {
        const saved = JSON.parse(raw);
        if (
          saved &&
          typeof saved.lat === 'number' &&
          typeof saved.lon === 'number'
        ) {
          userLocation.lat = saved.lat;
          userLocation.lon = saved.lon;
          userLocation.status = 'ok';
          userLocation.error = null;

          console.log('[Honoua] Localisation rechargée depuis localStorage :', saved);
          return; // on a une localisation valide, pas besoin de redemander
        }
      }
    } catch (e) {
      console.warn('[Honoua] Impossible de relire la localisation sauvegardée :', e);
    }

    // 2) Sinon, tenter une nouvelle géolocalisation
    if (!('geolocation' in navigator)) {
      userLocation.status = 'unsupported';
      userLocation.error = 'Géolocalisation non supportée par ce navigateur.';
      console.warn('[Honoua] Géolocalisation non supportée.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = pos.coords || {};
        userLocation.lat = typeof coords.latitude === 'number' ? coords.latitude : null;
        userLocation.lon = typeof coords.longitude === 'number' ? coords.longitude : null;
        userLocation.status = 'ok';
        userLocation.error = null;

        console.log('[Honoua] Localisation utilisateur capturée :', {
          lat: userLocation.lat,
          lon: userLocation.lon
        });

        // ✅ On persiste la localisation pour les autres pages / rechargements
        try {
          const toStore = {
            lat: userLocation.lat,
            lon: userLocation.lon,
            ts: Date.now()
          };
          localStorage.setItem('honoua_user_location', JSON.stringify(toStore));
        } catch (e) {
          console.warn('[Honoua] Impossible de stocker la localisation dans localStorage :', e);
        }
      },
      (err) => {
        userLocation.status = 'error';
        userLocation.error = err && err.message ? err.message : 'Erreur de géolocalisation.';
        console.warn('[Honoua] Erreur géolocalisation :', userLocation.error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }

  // On lance la tentative de récupération des coordonnées dès le chargement du scanner
  initUserLocation();
  
    // === Identifiant utilisateur anonyme (GLOBAL, robuste) ===
  (function ensureHonouaUserIdGlobal() {
    const KEY = 'honoua_user_id';

    // 1) Crée si absent
    let id = null;
    try { id = localStorage.getItem(KEY); } catch(e) {}

    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : ('uid_' + Math.random().toString(16).slice(2) + Date.now().toString(16));
      try { localStorage.setItem(KEY, id); } catch(e) {}
      console.log('[Honoua] user_id créé :', id);
    } else {
      console.log('[Honoua] user_id existant :', id);
    }

    // 2) Expose un getter global (utilisable par tous les scripts)
    window.HONOUA_USER_ID = id;
    window.getHonouaUserId = function () {
      try {
        return localStorage.getItem(KEY) || window.HONOUA_USER_ID || '';
      } catch (e) {
        return window.HONOUA_USER_ID || '';
      }
    };
  })();


          // ✅ Alias global sûr (optionnel mais pratique)
          // Permet d'appeler getHonouaUserId() sans risquer un ReferenceError
          function getHonouaUserId() {
            return (window.getHonouaUserId ? window.getHonouaUserId() : '');
          }



  // Messages UX harmonisés pour le Panier CO₂ et l'historique
const CART_MESSAGES = {
  emptyCart: "Votre panier est vide. Scannez des produits en mode Panier pour les ajouter.",
  historyIntro: "Retrouvez ici vos derniers paniers validés et leur impact carbone.",
  noValidatedCart: "Aucun panier validé pour le moment. Validez un panier pour afficher votre historique.",
  addError: "Un problème est survenu lors de l’ajout du produit au panier. Veuillez réessayer."
};

// =============================
// Sécurisation des messages Panier CO₂ pour scanner.html
// =============================
window.CART_MESSAGES = window.CART_MESSAGES || {
  EMPTY: "Votre Panier CO₂ est vide. Scannez des produits avant de générer un rapport.",
  ERROR: "Erreur lors de l’affichage du Panier CO₂.",
};

  // === A55.9 — Gestion unifiée des messages du scanner ===
const $scannerMessage = document.getElementById('scanner-message');
let scannerMessageTimeout = null;

/**
 * Efface tout le contenu et masque le message.
 */
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

/**
 * Affiche un message "info" (scan OK, ajout panier, chargement…)
 * @param {string} text
 * @param {number|null} durationMs Durée auto-masquage (ou null = permanent)
 */
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

/**
 * Affiche un message "erreur" (produit introuvable, réseau…)
 * @param {string} text
 * @param {boolean} persistent Si true = ne disparaît pas automatiquement
 */
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


  // === Helpers CO₂ ===
  function formatKg(value){
    if (value == null || isNaN(value)) return '0.0';
    return Number(value).toFixed(2);
  }

      // === Test manuel EAN (simplifié) ===
  function triggerManualEan(){
    if(!$eanInput) return;

    const raw = ($eanInput.value || '').trim();

    if(!raw){
      showScannerError("Entrez un code EAN avant de lancer le test.");
      $eanInput.focus();
      return;
  }


    console.log('[Honoua] triggerManualEan appelé avec :', raw);

    // Appel direct au service CO₂
    if (typeof fetchCo2ForEan === 'function') {
      fetchCo2ForEan(raw);
    } else {
      console.warn('[Honoua] fetchCo2ForEan n’est pas défini');
    }
  }

  if ($btnTestEan){
    $btnTestEan.onclick = () => triggerManualEan();
  }

  if ($eanInput){
    $eanInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter'){
        e.preventDefault();
        triggerManualEan();
      }
    });
  }


  // === Affichage / masquage de la fiche produit CO₂ ===
  if ($co2SummaryInfoBtn && $co2Details) {
    $co2SummaryInfoBtn.addEventListener('click', () => {
      const isHidden = $co2Details.classList.contains('hidden');

      if (isHidden) {
        $co2Details.classList.remove('hidden');
        $co2SummaryInfoBtn.setAttribute('aria-expanded', 'true');
      } else {
        $co2Details.classList.add('hidden');
        $co2SummaryInfoBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }






  function setCo2Waiting(){
    if(!$co2Card) return;
    $co2Badge.textContent = 'En attente de scan';
    $co2Empty.textContent = 'Scannez un code-barres pour afficher l’empreinte CO₂ (production, emballage, transport).';
    $co2Empty.classList.remove('hidden');
    $co2Content.classList.add('hidden');
  }


  function setCo2Loading(ean){
    if(!$co2Card) return;
    $co2Badge.textContent = 'Recherche…';
    $co2Empty.textContent = `Code scanné : ${ean} — recherche de l’empreinte CO₂…`;
    $co2Empty.classList.remove('hidden');
    $co2Content.classList.add('hidden');
  }

  function setCo2Error(message){
    if(!$co2Card) return;
    $co2Badge.textContent = 'Données indisponibles';
    $co2Empty.textContent = message || `Nous n’avons pas encore de données CO₂ pour ce produit.`;
    $co2Empty.classList.remove('hidden');
    $co2Content.classList.add('hidden');
  }

    function renderCo2Result(payload){
    if (!$co2Card) return;

    const {
      product_name,
      carbon_total_kg,
      carbon_product_kg,
      carbon_pack_kg,
      carbon_transport_kg,
      // Champs ajoutés par l’API FastAPI
      origin_country,
      origin_label,
      distance_km,
      reliability_score,
      reliability_level
    } = payload || {};

    // ====== 1. Affichage CO₂ (comportement actuel) ======
    $co2Badge.textContent = 'Données CO₂ trouvées';
    $co2Empty.classList.add('hidden');
    $co2Content.classList.remove('hidden');

    // Libellé produit
    $co2ProductLabel.textContent = product_name || 'Produit alimentaire';

    // Valeurs CO₂ (total + détail prod/pack/transport)
    $co2Total.textContent = formatKg(carbon_total_kg);
    $co2Prod.textContent  = formatKg(carbon_product_kg);
    $co2Pack.textContent  = formatKg(carbon_pack_kg);
    $co2Trans.textContent = formatKg(carbon_transport_kg);

    // ====== 2. Origine + distance (résumé + fiche détaillée) ======
    // Distance arrondie si présente
    const distanceKm =
      typeof distance_km === 'number' && isFinite(distance_km)
        ? Math.round(distance_km)
        : null;

    // Texte d’origine : label prioritaire, sinon code pays, sinon générique
    const originText =
      (origin_label && String(origin_label).trim()) ||
      (origin_country && String(origin_country).trim()) ||
      'Origine inconnue';

    // Bandeau résumé : "France • 1100 km"
    if ($co2Origin) {
      const parts = [];
      if (originText) parts.push(originText);
      if (distanceKm !== null) parts.push(`${distanceKm} km`);

      $co2Origin.textContent =
        parts.length > 0 ? parts.join(' • ') : 'Origine – distance';
    }

    // Bloc détaillé – distance
    if ($co2DetailsDistance) {
      if (distanceKm !== null) {
        $co2DetailsDistance.textContent = `Distance : ${distanceKm} km`;
      } else {
        $co2DetailsDistance.textContent =
          'Distance : donnée en cours de calcul';
      }
    }

    // Bloc détaillé – origine
    if ($co2DetailsOrigin) {
      $co2DetailsOrigin.textContent = `Origine : ${originText}`;
    }

    // Bloc détaillé – type d’emballage (placeholder pour l’instant)
    if ($co2DetailsPackage) {
      $co2DetailsPackage.textContent =
        'Type d’emballage : fonctionnalité en construction';
    }

    // ====== 3. Fiabilité de la donnée CO₂ ======
    if ($co2ReliabilityIcon && $co2ReliabilityLabel) {
      const score = (typeof reliability_score === 'number' && isFinite(reliability_score))
        ? Math.round(reliability_score)
        : null;

      let level = (reliability_level || '').toLowerCase();

      // Si le backend n’envoie pas de level mais envoie un score, on déduit le niveau
      if (!level && score !== null) {
        if (score >= 80)      level = 'élevée';
        else if (score >= 50) level = 'moyenne';
        else                  level = 'faible';
      }

      let icon = '⚪';
      let text = 'Fiabilité inconnue';

      if (level === 'élevée') {
        icon = '🟢';
        text = 'Fiabilité élevée';
      } else if (level === 'moyenne') {
        icon = '🟡';
        text = 'Fiabilité moyenne';
      } else if (level === 'faible') {
        icon = '🔴';
        text = 'Fiabilité faible';
      }

      if (score !== null) {
        text += ` (${score}/100)`;
      }

      $co2ReliabilityIcon.textContent  = icon;
      $co2ReliabilityLabel.textContent = text;
    }

    // Etiquette Ã  droite du total
    if ($co2PackageLabel) {
      $co2PackageLabel.textContent = 'Type d’emballage';
    }

    // ====== 3. Jours d’arbre (inchangé) ======
    if ($co2TreeCapture) {
      let text = '';

      if (typeof window.computeDaysTreeCapture === 'function' &&
          typeof window.formatDaysTreeCapture === 'function' &&
          typeof carbon_total_kg === 'number' &&
          !isNaN(carbon_total_kg) &&
          carbon_total_kg > 0) {

        const days = window.computeDaysTreeCapture(carbon_total_kg);
        const label = window.formatDaysTreeCapture(days);

        text = `Un arbre mettrait environ ${label} pour capter les émissions de ce produit.`;
      }

      $co2TreeCapture.textContent = text;
    }
  }


    async function fetchCo2ForEan(ean){
  if (!ean) return;

  setCo2Loading(ean);
    // A55.10 — Message de chargement
  showScannerInfo("Analyse en cours…", null);


  try{
        // Construction de l’URL avec éventuelles coordonnées utilisateur
    let url = `${CO2_API_BASE}/${encodeURIComponent(ean)}`;

    const loc = window.HonouaUserLocation;
    if (
      loc &&
      loc.status === 'ok' &&
      typeof loc.lat === 'number' &&
      typeof loc.lon === 'number'
    ) {
      const params = new URLSearchParams({
        user_lat: String(loc.lat),
        user_lon: String(loc.lon)
      });
      url += `?${params.toString()}`;
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Accept':'application/json' }
    });


      // 404 : produit non trouvé → cas métier attendu en MVP (ne doit pas casser l’UX)
    if (resp.status === 404) {
      console.warn("[CO2 404 HANDLED]", ean);
      let detail = "Nous n’avons pas encore de données CO₂ pour ce produit.";
      try {
        const err = await resp.json();
        if (err && typeof err.detail === "string" && err.detail.trim()) {
          detail = err.detail.trim();
        }
      } catch (_) {}

      setCo2Error(detail);

            // Message non bloquant (robuste) : on tente tous les canaux disponibles
      if (typeof window.updateEcoSelectMessage === "function") {
        window.updateEcoSelectMessage(detail, "warn");
      }

      if (typeof window.showScanImpactStatus === "function") {
        window.showScanImpactStatus(detail, "warn");
      }

      // fallback : toast scanner (si disponible)
      if (typeof window.showScannerError === "function") {
        window.showScannerError(detail, 2500);
      }


      // Important : on sort sans throw, et on laisse l’app continuer
      return null;
    }



    // Autre erreur HTTP → encart CO₂ uniquement
    if (!resp.ok){
  setCo2Error("Erreur lors de la récupération des données CO₂.");
  // A55.10 — Message erreur neutre
  showScannerError("Erreur lors de la récupération des données CO₂.");
  return;
}


    const data = await resp.json();

    // 1ï¸âƒ£ Mise Ã  jour de la carte COâ‚‚ (comportement existant)
    renderCo2Result(data);

    // A55.10 — Message succès
if (typeof data.co2_kg_total === "number") {
  showScannerInfo(`Scan réussi. ${Number(data.co2_kg_total).toFixed(2)} kg CO₂e.`);
} else {
  showScannerInfo("Scan réussi.");
}

    // 2ï¸âƒ£ Construction de lâ€™objet ecoProduct pour EcoSELECT
    try {
      // On récupère le total CO₂ en kg depuis les bons champs de l’API
      let co2TotalKg = null;
      if (typeof data.carbon_total_kg === 'number' && !isNaN(data.carbon_total_kg)) {
        co2TotalKg = data.carbon_total_kg;
      } else if (typeof data.co2_total_kg === 'number' && !isNaN(data.co2_total_kg)) {
        co2TotalKg = data.co2_total_kg;
      } else if (typeof data.co2_kg_total === 'number' && !isNaN(data.co2_kg_total)) {
        co2TotalKg = data.co2_kg_total;
      }

      const hasCo2Data = co2TotalKg !== null;

      // Distance : prioritÃ© Ã  distance_km
      let distanceKm = null;
      if (typeof data.distance_km === 'number' && !isNaN(data.distance_km)) {
        distanceKm = data.distance_km;
      } else if (typeof data.transport_km === 'number' && !isNaN(data.transport_km)) {
        distanceKm = data.transport_km;
      }

      // Origine (label > pays > fallback)
      const origin =
        (data.origin_label && String(data.origin_label).trim()) ||
        (data.origin_country && String(data.origin_country).trim()) ||
        null;

      // Niveau de fiabilité (si tu veux l’exploiter dans EcoSELECT plus tard)
      const reliabilityScore = typeof data.reliability_score === 'number'
        ? data.reliability_score
        : null;
      const reliabilityLevel = data.reliability_level || null;

      const ecoProduct = {
        ean: String(ean).trim(),
        label: data.product_name || data.product_label || 'Produit alimentaire',
        co2Total: co2TotalKg,     // en kg CO₂e
        distanceKm: distanceKm,   // en km
        origin: origin,
        hasCo2Data: hasCo2Data,
        reliabilityScore,
        reliabilityLevel
      };

      // 3ï¸âƒ£ Envoi Ã  EcoSELECT (si dispo)
      if (typeof window.ecoSelectAddProduct === 'function') {
        window.ecoSelectAddProduct(ecoProduct);
      } else {
        console.warn('[Honoua] ecoSelectAddProduct n’est pas disponible.');
      }

    } catch (err) {
      console.warn('[Honoua] Erreur lors de la construction de ecoProduct :', err, data);
    }
     


    // === Panier CO₂ – A51.4 + A51.7 : ajout + rendu ===
        // === Panier CO₂ – A51.4 + A51.7 : ajout + rendu ===
    try {
      addToCartFromApiResponse(data, ean);

      // Mise Ã  jour de l'UI du panier
      if (typeof renderCo2Cart === 'function') {
        renderCo2Cart();
      }

      // Logs de contrôle (facultatif, mais utile pour debug)
      const totals = getCartTotals();
      console.log('[Panier CO2] contenu actuel :', co2Cart);
      console.log('[Panier CO2] totaux :', totals);
    } catch (err) {
      console.error(CART_MESSAGES.addError);
    }

        // 🔥 A54.27 – Auto-évaluation intelligente (au max toutes les 20 secondes)
    if (typeof evaluateAllCo2Challenges === 'function') {
      try {
        const now = Date.now();

        // On évite de spammer l'API : max 1 évaluation toutes les 20s
        if (now - lastChallengeAutoEval > 20000) { // 20 000 ms = 20 secondes
          evaluateAllCo2Challenges(CO2_CHALLENGES_USER_ID);
          lastChallengeAutoEval = now;
        }
      } catch (errEval) {
        console.error('[Défis CO2] Erreur lors de l’évaluation auto :', errEval);
      }
    } else {
      console.warn('[Défis CO2] evaluateAllCo2Challenges n’est pas disponible.');
    }

  }catch(e){
  setCo2Error("Impossible de joindre le service CO₂.");
  // A55.10 — message erreur réseau
  showScannerError("Impossible de joindre le service CO₂.");
}

}


  // État initial CO₂
  setCo2Waiting();

  function vibrate(ms=60){ if(navigator.vibrate) navigator.vibrate(ms); }

  function setStatus(text,on=false){
    $state.textContent = text;
    $badge.textContent = on ? 'Actif' : 'Arrêté';
    $badge.className = 'badge ' + (on ? 'ok' : 'off');
    $reticle.classList.toggle('active', on);
    if(on) vibrate(50);
  }

   async function stopStream(reason = 'user'){
    // Stop le décodage EAN si actif
    stopZXing();
    stopQuagga();

    // IMPORTANT: sur success, on ne stoppe pas les tracks (évite écran noir iPhone)
  if (reason !== 'success' && currentStream){
        currentStream.getTracks().forEach(t=>t.stop());
        currentStream=null; currentTrack=null;
      }

    // iOS: éviter écran noir brutal -> on garde la dernière frame
  try { $video.pause(); } catch (_) {}
  

  // iOS: éviter écran noir brutal -> on pause et on libère le flux avec un léger délai
  try { $video.pause(); } catch (_) {}

  const _old = $video.srcObject;
  // NE PAS faire srcObject=null tout de suite (sinon écran noir immédiat sur iOS)
  if (reason !== 'success') {
  setTimeout(() => {
    try { $video.srcObject = null; } catch (_) {}
  }, 250);
}
// Sur succès : on ne null pas srcObject => évite écran noir (frame figée)


    $torch.disabled = true; $torch.classList.remove('torch-on'); $torch.textContent='Lampe';
    setStatus('Flux arrêté',false);

     // A55.13 — message d'information
   if (reason === 'success') {
      showScannerInfo("EAN détecté. Chargement…", 1200);
    } else {
      if (reason === 'success') {
          showScannerInfo("EAN détecté. Chargement…", 1200);
        } else {
          showScannerInfo("Caméra arrêtée. Relancez le scanner pour continuer.");
        }

    }


  }

  async function listCameras(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(d=>d.kind==='videoinput');
    $cams.innerHTML='';
    videos.forEach(d=>{
      const opt=document.createElement('option');
      opt.value=d.deviceId; opt.textContent=d.label||'Caméra ';
      $cams.appendChild(opt);
    });
    if (videos.length===0) {
  setStatus('Aucune caméra détectée', false);
  showScannerError("Aucune caméra détectée. Vérifiez votre appareil.");
    return videos;
  }
}

 function pickBackCamera(devices){
  const list = Array.isArray(devices) ? devices : [];

  // 1) Heuristique iOS/Android : "back", "rear", "environment"
  const byLabel = list.find(d =>
    d && typeof d.label === 'string' &&
    /back|rear|environment|arrière|arri[eè]re/i.test(d.label)
  );
  if (byLabel) return byLabel;

  // 2) Sinon : si on a plusieurs caméras, la dernière est souvent la back cam (mobile)
  if (list.length > 1) return list[list.length - 1];

  // 3) Sinon : unique caméra ou rien
  return list[0] || null;
}

  async function toggleTorch(){
    if(!currentTrack || !torchSupported) return;
    try{
      torchOn = !torchOn;
      await currentTrack.applyConstraints({advanced:[{torch: torchOn}]});
      $torch.classList.toggle('torch-on', torchOn);
      $torch.textContent = torchOn ? 'Lampe ON' : 'Lampe';
    }catch(e){ $torch.disabled=true; }
  }

// --- A. Scan Watchdog (diagnostic iPhone) ---
  let __lastEanDetectedAt = 0;
  let __scanWatchdogTimer = null;

  function markEanDetected(){
    __lastEanDetectedAt = Date.now();
  }

  function startScanWatchdog(){
    // Si aucun EAN n’est détecté après X secondes, on remonte un diagnostic utile.
    if (__scanWatchdogTimer) clearTimeout(__scanWatchdogTimer);

    __scanWatchdogTimer = setTimeout(() => {
      try {
        // si le flux n’est pas actif, inutile
        if (!currentStream || !$video) return;

        // si un EAN vient d’être détecté, inutile
        if (__lastEanDetectedAt && (Date.now() - __lastEanDetectedAt) < 1500) return;

        // diagnostic vidéo
        const diag = {
          readyState: $video.readyState,
          videoW: $video.videoWidth,
          videoH: $video.videoHeight,
          trackSettings: currentTrack?.getSettings ? currentTrack.getSettings() : null
        };

        console.warn('[Scan][Watchdog] Aucun EAN détecté après 6s. Probable lecteur EAN inactif (iOS).', diag);

        // message UX (sans bloquer)
        showScannerError("Scan iPhone : aucune détection EAN. Si le cadre est sombre ou si rien n’est détecté, utilise le test EAN manuel. Diagnostic enregistré dans la console.");
      } catch (_) {}
    }, 6000);
  }
  async function waitForVideoReady(video, timeoutMs = 2500) {
    if (!video) return false;

    // Si dÃ©jÃ  prÃªt
    if (video.videoWidth > 0 && video.videoHeight > 0) return true;

    return await new Promise((resolve) => {
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        try { video.removeEventListener('loadedmetadata', onMeta); } catch(_) {}
        try { video.removeEventListener('playing', onPlay); } catch(_) {}
        resolve(!!ok);
      };

      const onMeta = () => finish(video.videoWidth > 0 && video.videoHeight > 0);
      const onPlay = () => finish(video.videoWidth > 0 && video.videoHeight > 0);

      try { video.addEventListener('loadedmetadata', onMeta, { once: true }); } catch(_) {}
      try { video.addEventListener('playing', onPlay, { once: true }); } catch(_) {}

      // Filet de sécurité
      setTimeout(() => finish(video.videoWidth > 0 && video.videoHeight > 0), timeoutMs);
    });
  }

async function startWith(deviceId){
  try{
    await stopStream();

        // H-005: reset propre avant un NOUVEAU scan
    window.__HONOUA_SCAN_LOCK__ = false;
    __stableEan = '';
    __stableHits = 0;
    __stableAt = 0;


        // iPhone : utiliser Quagga2 (plus robuste que ZXing en live sur iOS)
       // iPhone : tenter Quagga2 en priorité, mais NE PAS bloquer si Quagga échoue
    if (false && isIphoneIOS() && window.Quagga) {
      setStatus('Caméra active', true);

      const ok = await startQuaggaInTarget();
      if (ok) return;

      console.warn('[Quagga] Échec init → fallback caméra native + ZXing.');
      // IMPORTANT : on continue (pas de return)
    }



    // iOS: stabilise la lecture vidéo (indispensable pour analyse frame/ZXing)
    if ($video) {
      $video.setAttribute('playsinline', '');
      $video.setAttribute('webkit-playsinline', '');
      $video.muted = true;
      $video.autoplay = true;
    }

    // Résolution/contraintes robustes iOS pour EAN (tentatives successives)
    const baseVideo = {
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 480 },
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: 30, max: 60 }
    };

    // Certaines contraintes avancées ne sont pas supportées partout : iOS les ignore si non supportées.
    const advanced = [
      { focusMode: "continuous" },
      { exposureMode: "continuous" },
      { whiteBalanceMode: "continuous" }
    ];

    const candidates = [];

    // 1) Si l’utilisateur impose un deviceId (dropdown), on essaie en priorité
    if (deviceId) {
      candidates.push({
        video: {
          ...baseVideo,
          deviceId: { exact: deviceId },
          advanced
        }
      });
    }

    // 2) iOS/Android : tenter environment EXACT d’abord (si dispo)
    candidates.push({
      video: {
        ...baseVideo,
        facingMode: { exact: "environment" },
        advanced
      }
    });

    // 3) Puis environment IDEAL
    candidates.push({
      video: {
        ...baseVideo,
        facingMode: { ideal: "environment" },
        advanced
      }
    });

    // 4) Fallback ultime
    candidates.push({ video: true });

    let stream = null;
    let firstError = null;

    for (const c of candidates) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }

    if (!stream) {
      throw firstError || new Error("getUserMedia failed");
    }

    // Diagnostic utile (iPhone)
    try {
      const t = stream.getVideoTracks && stream.getVideoTracks()[0];
      if (t && t.getSettings) {
        console.info("[Cam] settings:", t.getSettings());
      }
      if (t && t.getConstraints) {
        console.info("[Cam] constraints:", t.getConstraints());
      }
    } catch (_) {}


    currentStream = stream;
    $video.srcObject = stream;

    try { await $video.play(); } catch(_) {}

    // IMPORTANT iPhone : attendre les dimensions réelles de la vidéo avant ZXing
    await waitForVideoReady($video, 3000);
    await startZXingFromStream(stream);


    currentTrack = stream.getVideoTracks()[0] || null;
    setStatus('Caméra active', true);

    if(currentTrack) await detectTorchSupport(currentTrack);

    // BONUS iPhone : zoom léger si supporté (améliore énormément la lecture EAN)
    try {
      if (currentTrack && currentTrack.getCapabilities) {
        const caps = currentTrack.getCapabilities();
        if (caps && caps.zoom) {
          const targetZoom = Math.min(2, caps.zoom.max || 2);
          await currentTrack.applyConstraints({ advanced: [{ zoom: targetZoom }] });
        }
      }
    } catch (_) {}

    // Démarre le décodage EAN (si ZXing est chargé sur la page)
    await startZXingFromStream(stream);


      } catch (e) {
    console.warn('[Scan] startWith error:', e);
    setStatus('Erreur ou refus caméra', false);

    const name = (e && e.name) ? e.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      showScannerError("Accès caméra refusé. Autorisez la caméra dans Safari (Réglages).", true);
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      showScannerError("Caméra introuvable ou contraintes incompatibles. Essayez sans sélection caméra.", true);
    } else if (name === 'NotReadableError') {
      showScannerError("Caméra occupée par une autre app. Fermez les apps utilisant la caméra puis réessayez.", true);
    } else {
      showScannerError("Impossible d’ouvrir la caméra. Détail console: " + (name || 'Erreur inconnue'), true);
    }
  }

 
   } if ($start) {
    $start.onclick = async () => {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
        tmp.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      const vids = await listCameras().catch(() => []);
      const back = pickBackCamera(vids);
      await startWith(back?.deviceId);
    };
  }

  if ($cams) {
    $cams.onchange = (e) => startWith(e.target.value);
  }

  if ($reset) {
    $reset.onclick = () => {
      stopStream();                 // Arrête la caméra
      setCo2Waiting();              // Remet l'encart CO₂ en état initial
      showScannerInfo("Scanner réinitialisé."); // Message UX clair
    };
  }

  if ($torch) {
    $torch.onclick = () => toggleTorch();
  }



  // === Point d’entrée appelé par le lecteur de code-barres ===
  
   if(!('mediaDevices' in navigator)){
  setStatus('API média non supportée', false);
  showScannerError("Caméra non supportée sur cet appareil.");
  return;
   }

   // Fallback global pour être sûr que handleEanDetected existe
  window.handleEanDetected = function(ean){
    if (!ean) return;

    // Marque une dÃ©tection (empÃªche le watchdog de conclure Ã  une absence de scan)
    markEanDetected();

    console.log('handleEanDetected (fallback) appelé avec :', ean);

    if (typeof fetchCo2ForEan === 'function') {
      fetchCo2ForEan(String(ean).trim());
    }
  };


/* ============================================================================
   EcoSELECT (AUTONOME) — rendu du comparateur dans scanner.html
   Dépendances: #eco-select-list, #sort-by-co2, #sort-by-distance
   Expose: window.ecoSelectAddProduct, window.ecoSelectSetSortMode
   Fix:
   - tri CO2 / distance fonctionnel (boutons)
   - badge "CO₂" / "DIST" affiché une seule fois (sur la 1ère ligne)
   ============================================================================ */

(function(){
  const listEl = document.getElementById('eco-select-list');
  const msgEl  = document.getElementById('eco-select-message');
  const btnCo2 = document.getElementById('sort-by-co2');
  const btnDist = document.getElementById('sort-by-distance');

  if (!listEl) {
    console.warn('[EcoSELECT][inline] #eco-select-list introuvable. Comparateur non initialisé.');
    return;
  }

  // Etat
  let sortMode = 'co2'; // 'co2' | 'distance'
  const items = [];     // { ean, label, co2Total, distanceKm, origin, ... }



  function safeText(v, fallback='—'){
    const s = (v == null) ? '' : String(v).trim();
    return s ? s : fallback;
  }

  function formatCo2Kg(v){
    if (!Number.isFinite(v)) return '—';
    return v < 1 ? `${Math.round(v * 1000)} g` : `${v.toFixed(2)} kg`;
  }

  function formatKm(v){
    if (!Number.isFinite(v)) return '—';
    return `${Math.round(v)} km`;
  }

  function setMessage(text=''){
    if (!msgEl) return;
    msgEl.textContent = text || '';
  }

  function setActiveButtons(){
    if (!btnCo2 || !btnDist) return;
    btnCo2.classList.toggle('eco-sort-btn-active', sortMode === 'co2');
    btnDist.classList.toggle('eco-sort-btn-active', sortMode === 'distance');
  }

  function upsertProduct(p){
    const ean = safeText(p?.ean, '');
    if (!ean) return;

    const idx = items.findIndex(x => x.ean === ean);
    if (idx === -1) items.push(p);
    else items[idx] = { ...items[idx], ...p };
  }

    function sortItems(){
    const arr = items.slice();

    const toSortableNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    };

    const tieBreak = (a, b) => {
      const la = safeText(a?.label, '').toLowerCase();
      const lb = safeText(b?.label, '').toLowerCase();
      if (la && lb && la !== lb) return la.localeCompare(lb, 'fr');
      const ea = safeText(a?.ean, '');
      const eb = safeText(b?.ean, '');
      return ea.localeCompare(eb, 'fr');
    };

    if (sortMode === 'distance') {
      arr.sort((a,b) => {
        const da = toSortableNumber(a?.distanceKm);
        const db = toSortableNumber(b?.distanceKm);
        if (da !== db) return da - db;
        return tieBreak(a,b);
      });
    } else {
      arr.sort((a,b) => {
        const ca = toSortableNumber(a?.co2Total);
        const cb = toSortableNumber(b?.co2Total);
        if (ca !== cb) return ca - cb;
        return tieBreak(a,b);
      });
    }

    return arr;
  }


  function render(){
    const arr = sortItems();
    listEl.innerHTML = '';

    if (!arr.length) {
      setMessage('Scannez un produit pour l’ajouter au comparateur.');
      setActiveButtons();
      return;
    }

    setMessage('');
    setActiveButtons();

    arr.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'eco-item';

      // Badge dynamique : affiché UNIQUEMENT sur la 1ère ligne
      const badge = document.createElement('div');
      badge.className = 'eco-item-badge';
      badge.textContent = (sortMode === 'distance') ? 'DIST' : 'CO₂';
      // Important : visible 1 seule fois
      badge.style.visibility = (idx === 0) ? 'visible' : 'hidden';

      const main = document.createElement('div');
      main.className = 'eco-item-main';

      const title = document.createElement('div');
      title.className = 'eco-item-title';
      title.textContent = safeText(p.label, 'Produit');

      const meta = document.createElement('div');
      meta.className = 'eco-item-meta';

      // Valeur principale selon tri
      const primary = document.createElement('span');
      primary.className = 'eco-item-primary';
      primary.textContent = (sortMode === 'distance')
        ? formatKm(p.distanceKm)
        : formatCo2Kg(p.co2Total);

      // Valeur secondaire (l’autre métrique)
      const secondary = document.createElement('span');
      secondary.className = 'eco-item-secondary';
      secondary.textContent = (sortMode === 'distance')
        ? `CO₂: ${formatCo2Kg(p.co2Total)}`
        : `Dist: ${formatKm(p.distanceKm)}`;

      // Origine
      const origin = document.createElement('span');
      origin.className = 'eco-item-origin';
      origin.textContent = p.origin ? `Origine: ${safeText(p.origin)}` : 'Origine: —';

      meta.appendChild(primary);
      meta.appendChild(secondary);
      meta.appendChild(origin);

      main.appendChild(title);
      main.appendChild(meta);

      // Clic = ré-ouvrir la fiche produit (via ton flux existant)
      row.addEventListener('click', () => {
        if (typeof window.handleEanDetected === 'function') {
          window.handleEanDetected(p.ean);
        }
      });

      row.appendChild(badge);
      row.appendChild(main);
      listEl.appendChild(row);
    });
  }

  // Boutons tri (si présents)

  if (btnCo2) {
    btnCo2.addEventListener('click', (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      sortMode = 'co2';
      render();
    });
  }
  if (btnDist) {
    btnDist.addEventListener('click', (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      sortMode = 'distance';
      render();
    });
  }
 

  // API globale appelée par fetchCo2ForEan()
  window.ecoSelectAddProduct = function(product){
    try {
      upsertProduct(product);
      render();
      console.log('[EcoSELECT][inline] Produit ajouté:', product?.ean);
    } catch (e) {
      console.warn('[EcoSELECT][inline] addProduct error:', e);
    }
  };

  window.ecoSelectSetSortMode = function(mode){
    sortMode = (mode === 'distance') ? 'distance' : 'co2';
    render();
  };

  // Initial render
  render();
})();

  // === Panier CO2 – A51 : logique de données uniquement ===

// Tableau principal du panier
let co2Cart = [];

window.co2Cart = co2Cart;
// window.co2Cart pointe maintenant sur le panier utilisé par le scan



/**
 * Trouve l'index d'un produit dans le panier Ã  partir de son EAN.
 * @param {string|number} ean
 * @returns {number} index ou -1 si non trouvé
 */
function findCartItemIndex(ean) {
  const eanStr = String(ean);
  return co2Cart.findIndex(item => item.ean === eanStr);
}

/**
 * Ajoute / met Ã  jour un produit dans le panier Ã  partir de la rÃ©ponse API.
 * NE GÈRE PAS LE DOM.
 * @param {object} apiData - données renvoyées par /api/v1/co2/product/{ean}
 * @param {string|number} ean - code-barres scanné
 */

   function addToCartFromApiResponse(apiData, ean) {
  const eanStr = String(ean);

  // ==== 1. Normalisation des champs depuis l'API ====
  // âš ï¸ Adapte ici les noms exacts de champs de ton API si besoin.
 
  const productName =
    apiData.product_name ||      // cas 1 : nom "standard"
    apiData.product_label ||     // cas 2 : nom de ta base CO₂
    apiData.label ||             // cas 3 : simple "label"
    apiData.name ||              // cas 4 : autre champ générique
    apiData.nom ||               // cas 5 : version FR éventuelle
    "Produit sans nom";          // fallback ultime


  // CO2 par unité (en g CO2e)
  let co2UnitG = null;

  // 1) Ancien format : dÃ©jÃ  en grammes
  if (typeof apiData.co2_total_g === "number") {
    co2UnitG = apiData.co2_total_g;

  } else if (typeof apiData.co2_total === "number") {
    // Peut dÃ©jÃ  Ãªtre en g dans certains anciens endpoints
    co2UnitG = apiData.co2_total;

  // 2) Nouveau format : en kilogrammes → on convertit en g
  } else if (typeof apiData.carbon_total_kg === "number") {
    co2UnitG = apiData.carbon_total_kg * 1000;

  } else if (typeof apiData.carbon_total === "number") {
    co2UnitG = apiData.carbon_total * 1000;
  }



  // Distance (en km)
  let distanceKm = null;
  if (typeof apiData.distance_km === "number") {
    distanceKm = apiData.distance_km;
  } else if (typeof apiData.distance === "number") {
    distanceKm = apiData.distance;
  }

  // CO2 emballage (en g CO2e)
  let co2PackagingG = null;

  if (typeof apiData.co2_packaging_g === "number") {
    co2PackagingG = apiData.co2_packaging_g;

  } else if (typeof apiData.co2_packaging === "number") {
    co2PackagingG = apiData.co2_packaging;

  } else if (typeof apiData.carbon_pack_kg === "number") {
    co2PackagingG = apiData.carbon_pack_kg * 1000;
  }



  // Origine (pays / zone)
  const origin =
    apiData.origin ||
    apiData.origine ||
    null;

  // Poids utilisé pour le calcul (en g)
  let weightG = null;
  if (typeof apiData.weight_g === "number") {
    weightG = apiData.weight_g;
  } else if (typeof apiData.weight === "number") {
    weightG = apiData.weight;
  } else if (typeof apiData.poids_g === "number") {
    weightG = apiData.poids_g;
  } else {
    // défaut défini dans l'app : 500 g
    weightG = 500;
  }

  const hasCo2Data = Number.isFinite(co2UnitG) && co2UnitG > 0;

  // ==== 2. Mise Ã  jour du panier ====
  const idx = findCartItemIndex(eanStr);
  const now = Date.now();

  if (idx === -1) {
    // 🆕 Nouveau produit : on ajoute directement
    const quantity = 1;
    const co2TotalG = hasCo2Data ? co2UnitG * quantity : 0;

    // Catégorie (normalisation "safe" : toujours une chaîne)
const categoryRawCandidate =
  apiData.category ??
  apiData.product_category ??
  apiData.main_category ??
  apiData.categorie ??
  apiData.category_name ??
  apiData.categories ??
  apiData.categories_fr ??
  apiData.off_categories ??
  null;

const categoryRaw = Array.isArray(categoryRawCandidate)
  ? categoryRawCandidate.join(', ')
  : (categoryRawCandidate != null ? String(categoryRawCandidate) : null);


    const newItem = {
      ean: eanStr,
      product_name: productName,

      category: categoryRaw, // ✅ ajouté

      quantity: quantity,

      co2_unit_g: hasCo2Data ? co2UnitG : null,
      co2_total_g: co2TotalG,

      distance_km: distanceKm,
      co2_packaging_g: co2PackagingG,

      origin: origin,
      weight_g: weightG,

      has_co2_data: hasCo2Data,
      last_scan_at: now
    };




    co2Cart.push(newItem);
  } else {
    // â™»ï¸ Produit dÃ©jÃ  prÃ©sent â†’ demander confirmation avant d'augmenter la quantitÃ©
    const item = co2Cart[idx];

    // On met Ã  jour les infos les plus rÃ©centes (mÃªme si l'utilisateur refuse)
    if (distanceKm != null) item.distance_km = distanceKm;
    if (co2PackagingG != null) item.co2_packaging_g = co2PackagingG;
    if (origin != null) item.origin = origin;
    if (weightG != null) item.weight_g = weightG;

    const currentQty = item.quantity || 1;
        const confirmMsg =
          `Produit dÃ©jÃ  scannÃ© (quantitÃ© actuelle : x${currentQty}).\n\n` +
          `Ajouter Ã  nouveau ?`;

        const ok = window.confirm(confirmMsg);


    if (!ok) {
      // âŒ L'utilisateur refuse : on ne change pas la quantitÃ© ni le total COâ‚‚
      item.last_scan_at = now;
      return;
    }

    // ✅ L'utilisateur accepte : on ajoute 1
    item.quantity += 1;

    // On ne change co2_unit_g que si on a de nouvelles données valides
    if (hasCo2Data && Number.isFinite(co2UnitG)) {
      item.co2_unit_g = co2UnitG;
    }

    // Mise Ã  jour du total CO2 (0 si pas de donnÃ©es CO2)
    if (item.has_co2_data || hasCo2Data) {
      // Si l'item avait dÃ©jÃ  des donnÃ©es CO2 ou en a maintenant
      item.has_co2_data = item.has_co2_data || hasCo2Data;
      const unit = item.co2_unit_g;
      item.co2_total_g = Number.isFinite(unit) ? unit * item.quantity : 0;
    } else {
      item.co2_total_g = 0;
    }

    item.last_scan_at = now;
  }
}

   

/**
 * Supprime complètement un produit du panier (tous les exemplaires d'un EAN).
 * @param {string|number} ean
 */
function removeProductFromCart(ean) {
  const eanStr = String(ean);
  const idx = co2Cart.findIndex(it => it.ean === eanStr);
  if (idx >= 0) co2Cart.splice(idx, 1); // mutation -> références conservées
}

function clearCart() {
  co2Cart.length = 0; // mutation -> références conservées
}

/**
 * Calcule les totaux du panier.
 * @returns {{ total_co2_g: number, total_items: number, distinct_products: number }}
 */
function getCartTotals() {
  let totalCo2G = 0;
  let totalItems = 0;

  for (const item of co2Cart) {
    totalItems += item.quantity;

    if (item.has_co2_data && Number.isFinite(item.co2_total_g)) {
      totalCo2G += item.co2_total_g;
    }
  }

  return {
    total_co2_g: totalCo2G,
    total_items: totalItems,
    distinct_products: co2Cart.length
  };
}

/**
 * Retourne le dernier produit scanné (basé sur last_scan_at),
 * ou null si le panier est vide.
 * @returns {object|null}
 */
function getLastScannedItem() {
  if (co2Cart.length === 0) return null;

  let lastItem = co2Cart[0];

  for (let i = 1; i < co2Cart.length; i++) {
    if (co2Cart[i].last_scan_at > lastItem.last_scan_at) {
      lastItem = co2Cart[i];
    }
  }

  return lastItem;
}

/**
 * Analyse le panier et retourne les recommandations
 * basées sur le CO2 unitaire (co2_unit_g).
 *
 * @param {Array} cart - tableau co2Cart
 * @returns {{ topLow: Array, topHigh: Array }}
 */
function getRecoFromCart(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return { topLow: [], topHigh: [] };
  }

  // 1. On ne garde que les produits avec une donnée CO2 unitaire exploitable
  const itemsWithCo2 = cart.filter(item =>
    item &&
    item.has_co2_data &&
    typeof item.co2_unit_g === 'number' &&
    isFinite(item.co2_unit_g)
  );

  if (itemsWithCo2.length === 0) {
    return { topLow: [], topHigh: [] };
  }

  // 2. On travaille sur une copie pour ne pas modifier le panier
  const sorted = itemsWithCo2.slice().sort((a, b) => a.co2_unit_g - b.co2_unit_g);

  // 3. Top 3 les moins émissifs (début du tableau)
  const topLow = sorted.slice(0, 3);

  // 4. Top 3 les plus émissifs (fin du tableau)
  const topHigh = sorted.slice(-3).reverse(); // du plus élevé au moins élevé

  return { topLow, topHigh };
}


/**
 * Retourne l'une des 5 catégories officielles :
 * "Viande", "Végétaux", "Épicerie", "Boisson", "Autres"
 * en analysant la présence de mots-clés dans la colonne `category`.
 */
function mapCategoryForGraph(rawCategoryText) {
  const text = (rawCategoryText || "").toLowerCase();

  // ---- Viande ----
  const viandeKeywords = [
    "viande", "bœuf", "boeuf", "porc", "poulet",
    "volaille", "dinde", "agneau", "charcuterie", "steak"
  ];
  if (viandeKeywords.some(k => text.includes(k))) {
    return "Viande";
  }

  // ---- Végétaux ----
  const vegetalKeywords = [
    "légume", "legume", "légumes", "legumes",
    "fruit", "fruits",
    "végétal", "vegetal", "végétaux", "vegetaux",
    "céréale", "cereale", "céréales", "cereales",
    "légumineuse", "legumineuse", "légumineuses", "legumineuses"
  ];
  if (vegetalKeywords.some(k => text.includes(k))) {
    return "Végétaux";
  }

  // ---- Épicerie ----
  const epicerieKeywords = [
    "épicerie", "epicerie",
    "sucré", "sucre", "sucrerie",
    "chocolat",
    "biscuit", "biscuits",
    "gâteau", "gateau", "gâteaux", "gateaux",
    "pâtisserie", "patisserie",
    "snack", "barre", "barres"
  ];
  if (epicerieKeywords.some(k => text.includes(k))) {
    return "Épicerie";
  }

  // ---- Boisson ----
  const boissonKeywords = [
    "boisson", "boissons",
    "eau", "soda", "limonade",
    "jus", "sirop"
  ];
  if (boissonKeywords.some(k => text.includes(k))) {
    return "Boisson";
  }

  // ---- Autres ----
  return "Autres";
}
/**
 * Couleur associÃ©e Ã  chaque catÃ©gorie pour le graphique.
 * (Version globale, utilisable partout)
 */
function getCategoryColor(cat) {
  switch (cat) {
    case 'Viande':
      return '#D9534F'; // rouge doux
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

/**
 * Dessine un camembert simple Ã  partir des totaux COâ‚‚ par catÃ©gorie.
 *
 * @param {Object} totals - ex : { 'Viande': 1234, 'Végétaux': 567, ... } en g
 * @param {number} totalAll - somme de toutes les catégories en g
 */
   



  window.HonouaUI = window.HonouaUI || {};

window.HonouaUI.onValidateCartClick = function () {
  console.log('[Panier CO2] click Valider le panier (onclick)');

  const cart = (Array.isArray(window.co2Cart) ? window.co2Cart
            : (typeof co2Cart !== 'undefined' && Array.isArray(co2Cart) ? co2Cart : []));

if (cart.length === 0) {
  alert('Votre panier est vide. Scannez au moins un produit avant de le valider.');
  return;
}


  // 2) Afficher la section Rapport
  const $reportSection = document.getElementById('co2-cart-report');
  if ($reportSection) {
    $reportSection.classList.remove('hidden');
    $reportSection.style.display = '';
    console.log('[Panier CO2] #co2-cart-report affiché (onclick)');
    $reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    console.warn('[Panier CO2] #co2-cart-report introuvable (onclick)');
  }

  // 3) Générer le rapport (recommandations)
  try {
    if (typeof generateCo2CartReport === 'function') {
      generateCo2CartReport();
      console.log('[Panier CO2] generateCo2CartReport OK (onclick)');

      const HONOUA_CART_HISTORY_KEY = 'honoua_cart_history_v1';

        function honouaGetCartHistory() {
          try {
            const raw = localStorage.getItem(HONOUA_CART_HISTORY_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
          } catch (e) {
            console.warn('[History] JSON invalide, reset.', e);
            return [];
          }
        }

        function honouaSaveCartToHistory(cartItems, totalsSummary) {
          const history = honouaGetCartHistory();

          history.unshift({
            ts: Date.now(),
            items: Array.isArray(cartItems) ? cartItems : [],
            totals: totalsSummary || null
          });

          localStorage.setItem(HONOUA_CART_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
        }

        function honouaRenderLastTwoCartsInReco() {
          const ul = document.getElementById('co2-report-reco-list');
          if (!ul) return;

          const history = honouaGetCartHistory().slice(0, 2);

          // Supprime l'ancien bloc si dÃ©jÃ  rendu
          ul.querySelectorAll('li[data-lastcarts="1"]').forEach(n => n.remove());

          const li = document.createElement('li');
          li.setAttribute('data-lastcarts', '1');

          if (history.length === 0) {
            li.innerHTML = `<strong>Derniers paniers</strong><br>Aucun panier sauvegardé pour l’instant.`;
            ul.insertAdjacentElement('afterbegin', li);
            return;
          }

          const fmtDate = (ts) => {
            try { return new Date(ts).toLocaleString('fr-FR'); } catch { return ''; }
          };

          const lines = history.map((h, idx) => {
            const nb = Array.isArray(h.items) ? h.items.length : 0;
            const co2 = h.totals?.total_co2_text ? ` — ${h.totals.total_co2_text}` : '';
            return `• Panier ${idx + 1} (${fmtDate(h.ts)}) — ${nb} produits${co2}`;
          }).join('<br>');

          li.innerHTML = `<strong>Derniers paniers</strong><br>${lines}`;
          ul.insertAdjacentElement('afterbegin', li);
        }

      // 4) Sauvegarde + affichage des 2 derniers paniers (dans Recommandations)
        try {
          // Totaux : on prend ce que tu affiches dÃ©jÃ  dans le DOM (robuste)
          const totalCo2Text = document.getElementById('co2-cart-total-co2')?.textContent || '';
          const totalsSummary = { total_co2_text: totalCo2Text, total_co2_g: null };

          honouaSaveCartToHistory(cart, totalsSummary);
          honouaRenderLastTwoCartsInReco();
          console.log('[History] 2 derniers paniers rendus dans Recos');
        } catch (e) {
          console.warn('[History] save/render failed', e);
        }

    } else {
      console.warn('[Panier CO2] generateCo2CartReport non défini (onclick)');
    }
  } catch (e) {
    console.error('[Panier CO2] generateCo2CartReport ERROR (onclick)', e);
  }
};




      
    // === A51.7 – Rendu du Panier CO₂ dans l’UI ===

/**
 * Formate un nombre avec la locale fr-FR.
 * @param {number} value
 * @param {number} decimals
 */
function formatNumberFr(value, decimals = 0) {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Met Ã  jour l'affichage du panier COâ‚‚ dans la section HTML dÃ©diÃ©e
 * + les 4 cercles + les 3 lignes de résumé sous les cercles.
 */
function renderCo2Cart() {
  const $list              = document.getElementById('co2-cart-list');
  const $totalItems        = document.getElementById('co2-cart-total-items');
  const $distinctProducts  = document.getElementById('co2-cart-distinct-products');
  const $totalCo2          = document.getElementById('co2-cart-total-co2');

  const $circleTotalCo2    = document.getElementById('co2-circle-total-co2-value');
  const $circleTotalDist   = document.getElementById('co2-circle-total-distance-value');
  const $circleAvgCo2      = document.getElementById('co2-circle-avg-co2-value');
  const $circleAvgDist     = document.getElementById('co2-circle-avg-distance-value');

  if (!$list || !$totalItems || !$distinctProducts || !$totalCo2) {
    //console.warn('[Panier CO2] Éléments DOM manquants pour le rendu.');
    return;
  }

  // Nettoyage de la liste
  $list.innerHTML = '';

  // ===== Cas panier vide =====
  if (!co2Cart || co2Cart.length === 0) {
    const $empty = document.createElement('p');
    $empty.className = 'co2-cart-empty';
    $empty.textContent = CART_MESSAGES.emptyCart;
    $list.appendChild($empty);

    $totalItems.textContent       = '0 article scanné';
    $distinctProducts.textContent = '0 produit distinct';
    $totalCo2.textContent         = 'Total : 0 g CO₂e';

    if ($circleTotalCo2)  $circleTotalCo2.textContent  = '0 g CO₂e';
    if ($circleTotalDist) $circleTotalDist.textContent = '0 km';
    if ($circleAvgCo2)    $circleAvgCo2.textContent    = '0 g CO₂e';
    if ($circleAvgDist)   $circleAvgDist.textContent   = '0 km';

    return;
  }

  // =========================
  // 1) Cartes produits
  // =========================
  for (const item of co2Cart) {
    const $row = document.createElement('div');
    $row.className = 'co2-cart-item';

    // ----- Ligne 1 : nom + xQ + X -----
    const $header = document.createElement('div');
    $header.className = 'co2-cart-item-header';

    const $name = document.createElement('div');
    $name.className = 'co2-cart-name';
    $name.textContent = item.product_name || 'Produit alimentaire';

    const $right = document.createElement('div');
    $right.className = 'co2-cart-item-header-right';

    const $qty = document.createElement('span');
    $qty.className = 'co2-cart-qty-badge';
    $qty.textContent = 'x' + (item.quantity || 1);

    const $remove = document.createElement('button');
    $remove.type = 'button';
    $remove.className = 'co2-cart-remove-x';
    $remove.textContent = '×';

    // clic sur X → supprime sans ouvrir la fiche
    $remove.addEventListener('click', function (event) {
      event.stopPropagation();
      removeProductFromCart(item.ean);
      renderCo2Cart();
    });

    $right.appendChild($qty);
    $right.appendChild($remove);
    $header.appendChild($name);
    $header.appendChild($right);

    // ----- Ligne 2 : CO₂ + distance -----
    const $meta = document.createElement('div');
    $meta.className = 'co2-cart-item-meta';

    let co2Text = 'CO₂ indisponible';
    if (item.has_co2_data && Number.isFinite(item.co2_unit_g)) {
      const unit = item.co2_unit_g;
      if (unit < 1000) {
        co2Text = formatNumberFr(Math.round(unit)) + ' g CO₂e / Dist';
      } else {
        co2Text = formatNumberFr(unit / 1000, 1) + ' kg CO₂e / Dist';
      }
    }

    const $co2 = document.createElement('span');
    $co2.className = 'co2-cart-info';
    $co2.textContent = co2Text;
    $meta.appendChild($co2);

    if (typeof item.distance_km === 'number' && isFinite(item.distance_km)) {
      const kmRounded = Math.round(item.distance_km);

      const $sep = document.createElement('span');
      $sep.className = 'co2-cart-info';
      $sep.textContent = ' · ';
      $meta.appendChild($sep);

      const $dist = document.createElement('span');
      $dist.className = 'co2-cart-info';
      $dist.textContent = formatNumberFr(kmRounded) + ' km';
      $meta.appendChild($dist);
    }

    // Clic sur la carte → réaffiche la fiche CO₂ du produit
    $row.addEventListener('click', function () {
      if (typeof window.handleEanDetected === 'function') {
        window.handleEanDetected(String(item.ean).trim());
      } else if (typeof fetchCo2ForEan === 'function') {
        fetchCo2ForEan(String(item.ean).trim());
      }
    });

    $row.appendChild($header);
    $row.appendChild($meta);
    $list.appendChild($row);
  }

  // =========================
  // 2) Mise Ã  jour des 4 cercles
  // =========================
  if ($circleTotalCo2 && $circleTotalDist && $circleAvgCo2 && $circleAvgDist) {
    let totalCo2G        = 0;
    let totalItems       = 0;
    let totalDistanceKm  = 0;
    let nbWithDistance   = 0;

    for (const item of co2Cart) {
      const qty = item.quantity || 0;
      totalItems += qty;

      if (item.has_co2_data && Number.isFinite(item.co2_total_g)) {
        totalCo2G += item.co2_total_g;
      }

      if (typeof item.distance_km === 'number' && isFinite(item.distance_km)) {
        totalDistanceKm += item.distance_km * qty;
        nbWithDistance += qty;
      }
    }

    // 1) CO₂ total
    if (totalCo2G < 1000) {
      $circleTotalCo2.textContent =
        formatNumberFr(Math.round(totalCo2G)) + ' g CO₂e';
    } else {
      $circleTotalCo2.textContent =
        formatNumberFr(totalCo2G / 1000, 1) + ' kg CO₂e';
    }

    // 2) Distance totale
    const totalKmRounded = Math.round(totalDistanceKm);
    $circleTotalDist.textContent =
      formatNumberFr(totalKmRounded) + ' km';

    // 3) CO₂ moyen / produit
    const avgCo2PerItem = totalItems > 0 ? totalCo2G / totalItems : 0;
    if (avgCo2PerItem < 1000) {
      $circleAvgCo2.textContent =
        formatNumberFr(Math.round(avgCo2PerItem)) + ' g CO₂e';
    } else {
      $circleAvgCo2.textContent =
        formatNumberFr(avgCo2PerItem / 1000, 1) + ' kg CO₂e';
    }

    // 4) Distance moyenne / produit
    const avgDistanceKm = nbWithDistance > 0
      ? totalDistanceKm / nbWithDistance
      : 0;

    $circleAvgDist.textContent =
      formatNumberFr(Math.round(avgDistanceKm)) + ' km';
  }

  // =========================
  // 3) Totaux texte sous les cercles
  // =========================
  const totals       = getCartTotals();
  const totalItems   = totals.total_items || 0;
  const dp           = totals.distinct_products || 0;
  const totalG       = totals.total_co2_g || 0;

  const labelArticles = totalItems <= 1 ? 'article' : 'articles';
  $totalItems.textContent = `🛒 ${totalItems} ${labelArticles}`;

  const labelProduits  = dp <= 1 ? 'produit' : 'produits';
  const suffixDistinct = dp <= 1 ? 'distinct' : 'distincts';
  $distinctProducts.textContent =
    `📦 ${dp} ${labelProduits} ${suffixDistinct}`;

  if (totalG < 1000) {
    $totalCo2.textContent =
      '🌿 ' + formatNumberFr(Math.round(totalG)) + ' g CO₂e';
  } else {
    $totalCo2.textContent =
      '🌿 ' + formatNumberFr(totalG / 1000, 1) + ' kg CO₂e';
  }

  // Petite animation sur le cercle CO₂ total
  const totalCircle = document.querySelector('.co2-circle-total-co2');
  if (totalCircle) {
    totalCircle.classList.remove('co2-circle--animate');
    void totalCircle.offsetWidth;
    totalCircle.classList.add('co2-circle--animate');
  }
}

// Initialisation des boutons du panier (vider + valider) + rendu initial
document.addEventListener('DOMContentLoaded', function () {
  const $clearBtn    = document.getElementById('co2-cart-clear-btn');
  const $validateBtn = document.getElementById('co2-cart-validate-btn');

  if ($clearBtn) {
    $clearBtn.addEventListener('click', function () {
      clearCart();
      renderCo2Cart();

      const $reportSection = document.getElementById('co2-cart-report');
      if ($reportSection) {
        $reportSection.classList.add('hidden');
      }
    });
  }

  if ($validateBtn) {
    $validateBtn.addEventListener('click', function () {
      if (!co2Cart || co2Cart.length === 0) {
        alert('Votre panier est vide. Scannez au moins un produit avant de le valider.');
        return;
      }

     const $reportSection = document.getElementById('co2-cart-report');
        if ($reportSection) $reportSection.classList.remove('hidden');



      // Génération du rapport local
      generateCo2CartReport();

      // Sauvegarde + affichage des 2 derniers paniers (dans Recos)
      try {
        const totalsSummary = (typeof window.getCo2CartTotals === 'function')
          ? window.getCo2CartTotals()
          : null;

        honouaSaveCartToHistory(cart, totalsSummary);
        honouaRenderLastTwoCartsInReco();
      } catch (e) {
        console.warn('[History] save/render failed', e);
      }


      // Enregistrement backend + rechargement de l’historique
     if (typeof saveCartHistoryFromCart === 'function') saveCartHistoryFromCart();
     if (typeof loadCo2CartHistory === 'function') loadCo2CartHistory();

    });
  }

  // Rendu initial (panier vide)            
  renderCo2Cart();
});

   // ==============================
// A53 – Save historique panier (minimal)
// ==============================
function saveCartHistoryFromCart() {
  try {
    const totals = (typeof getCartTotals === 'function') ? getCartTotals() : null;
    if (!totals) {
      console.warn('[Historique CO2] getCartTotals indisponible.');
      return;
    }

    const totalCo2G   = Number(totals.total_co2_g) || 0;
    const nbArticles  = Number(totals.total_items) || 0;
    const nbDistinct  = Number(totals.distinct_products) || 0;

    // Distance totale (pondérée par quantité) – minimal
    let totalDistanceKm = 0;
    for (const it of (co2Cart || [])) {
      const qty = Number(it.quantity) || 0;
      if (Number.isFinite(it.distance_km)) totalDistanceKm += it.distance_km * qty;
    }

    // On n’enregistre pas un panier vide
    if (nbArticles <= 0 || totalCo2G <= 0) {
      console.warn('[Historique CO2] Panier vide ou CO2=0 → skip save.');
      return;
    }

    const totalCo2Kg = totalCo2G / 1000;
    const days = (typeof window.computeDaysTreeCapture === 'function')
      ? (Number(window.computeDaysTreeCapture(totalCo2Kg)) || 0)
      : 0;

    const treeEq = days > 0 ? (days / 30) : 0;

        const payload = {
      total_co2_g: Math.round(Number(totalCo2G) || 0),
      nb_articles: Math.round(Number(nbArticles) || 0),
      nb_distinct_products: Math.round(Number(nbDistinct) || 0),
      total_distance_km: Number.isFinite(totalDistanceKm) ? Math.round(totalDistanceKm) : 0,
      days_captured_by_tree: Number.isFinite(days) ? Number(days) : 0,
      tree_equivalent: Number.isFinite(treeEq) ? Number(treeEq) : 0
       };

       return fetch((window.CART_HISTORY_ENDPOINT || CART_HISTORY_ENDPOINT), {
      method: 'POST',
      credentials: 'same-origin',
     headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Honoua-User-Id': (window.getHonouaUserId ? window.getHonouaUserId() : '')

         },

      body: JSON.stringify(payload)
    })
    .then(async (res) => {
      if (res.ok) return;

      // ✅ IMPORTANT : lire le détail FastAPI (souvent { detail: [...] })
      let detail = null;
      try { detail = await res.json(); } catch (_) {}

      console.error('[Historique CO2] POST /api/cart/history erreur :', res.status, detail);
    })
    .catch((err) => {
      console.error('[Historique CO2] POST /api/cart/history erreur réseau :', err);
    });


  } catch (err) {
    console.error('[Historique CO2] saveCartHistoryFromCart erreur :', err);
  }
}

  
  // =========================
// Honoua — Historique paniers (storage)
// =========================
if (!window.honouaAppendCartToHistory) {
  window.honouaAppendCartToHistory = function ({ co2Kg, distanceKm, itemsCount }) {
    const key = "honoua_cart_history_v1";
    const arr = JSON.parse(localStorage.getItem(key) || "[]");

    arr.push({
      timestamp: Date.now(),
      co2_kg: Number(co2Kg) || 0,
      distance_km: Number(distanceKm) || 0,
      items_count: Number(itemsCount) || 0
    });

    localStorage.setItem(key, JSON.stringify(arr));
  };
}

  // =========================
// Honoua — Historique paniers (localStorage)
// =========================
        if (!window.honouaAppendCartToHistory) {
          window.honouaAppendCartToHistory = function ({ co2Kg, distanceKm, itemsCount }) {
            const key = "honoua_cart_history_v1";
            const arr = JSON.parse(localStorage.getItem(key) || "[]");

            arr.push({
              timestamp: Date.now(),
              co2_kg: Number(co2Kg) || 0,
              distance_km: Number(distanceKm) || 0,
              items_count: Number(itemsCount) || 0
            });

            localStorage.setItem(key, JSON.stringify(arr));
          };
        }



    /**
   * Génère et affiche le rapport CO₂ du panier
   * (A52 – Conversion CO₂ → jours de captation d’un arbre).
   */
  function generateCo2CartReport() {
   const $reportSection        = document.getElementById('co2-cart-report');

// Période / titre du rapport (dans ton HTML : id="co2-report-period")
const $reportPeriod         = document.getElementById('co2-report-period');

// Arbres / captation
const $reportTree           = document.getElementById('co2-cart-report-tree');

// Émissions
const $reportEmissionsTotal = document.getElementById('co2-report-emissions-total');
const $reportEmissionsAvg   = document.getElementById('co2-report-emissions-avg');

// Distances
const $reportDistTotal      = document.getElementById('co2-report-distance-total');
const $reportDistAvg        = document.getElementById('co2-report-distance-avg');
const $reportDistComment    = document.getElementById('co2-report-distance-comment');

// Recommandations
const $recoIntro            = document.getElementById('co2-report-reco-intro');
const $recoList             = document.getElementById('co2-report-reco-list');

// Catégories
const $catBox               = document.getElementById('co2-cart-report-categories');



    if (!$reportSection) {
      console.warn('[Panier CO2] Section de rapport non trouvée.');
      return;
    }

    if (!co2Cart || co2Cart.length === 0) {
      alert('Votre Panier CO₂ est vide. Scannez des produits avant de générer un rapport.');
      $reportSection.classList.add('hidden');
      return;
    }

    // ✅ Afficher la section rapport (recommandations)
      $reportSection.classList.remove('hidden');
      $reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });


    // 1) Nom du panier (date/heure actuelle)
    if ($reportPeriod) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('fr-FR');
      const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      $reportPeriod.textContent = `Panier du ${dateStr} - ${timeStr}`;

    }

    // 2) Totaux CO2
    const totals = getCartTotals();
    const totalCo2G = totals.total_co2_g || 0;
    const totalItems = totals.total_items || 0;

    const totalCo2Kg = totalCo2G / 1000;
    // =========================
// Suivi CO2 — sauvegarde du panier (MVP)
// =========================
    window.honouaAppendCartToHistory({
      co2Kg: totalCo2Kg,
      distanceKm: 0, // distance non gérée dans getCartTotals() pour l’instant
      itemsCount: totals.distinct_products || co2Cart.length || 0
    });


    if ($reportEmissionsTotal) {
      if (totalCo2G < 1000) {
         $reportEmissionsTotal.textContent =
          `Émissions totales : ${formatNumberFr(Math.round(totalCo2G))} g CO₂e.`;
      } else {
        $reportEmissionsTotal.textContent =
          `Émissions totales : ${formatNumberFr(totalCo2Kg, 1)} kg CO₂e.`;
      }
    }

    if ($reportEmissionsAvg) {
      if (totalItems > 0) {
        const avgCo2G = totalCo2G / totalItems;
        if (avgCo2G < 1000) {
          $reportEmissionsAvg.textContent =
            `Émissions moyennes par produit : ${formatNumberFr(Math.round(avgCo2G))} g CO₂e.`;
        } else {
          $reportEmissionsAvg.textContent =
            `Émissions moyennes par produit : ${formatNumberFr(avgCo2G / 1000, 2)} kg CO₂e.`;
        }
      } else {
        $reportEmissionsAvg.textContent = `Émissions moyennes par produit : données indisponibles.`;
      }
    }

    // 3) Conversion CO2 total → jours d’un arbre
    // 3) Conversion CO2 total → nombre d’arbres
    // 3) Conversion CO₂ total → nombre d’arbres (règle 30 jours = 1 arbre)

            // === A52/A53 — Utils arbre (minimal, global) ===
        // Calibré sur ton historique: 13,6 kg -> ~225,6 jours => ~22 kg/an/arbre
        (function () {
          const TREE_CO2_KG_PER_YEAR = 22; // cohérent avec tes valeurs backend/historique
          const DAYS_PER_YEAR = 365;

          if (typeof window.computeDaysTreeCapture !== 'function') {
            window.computeDaysTreeCapture = function (co2Kg) {
              const v = Number(co2Kg);
              if (!Number.isFinite(v) || v <= 0) return 0;
              return (v * DAYS_PER_YEAR) / TREE_CO2_KG_PER_YEAR;
            };
          }

          if (typeof window.formatDaysTreeCapture !== 'function') {
            window.formatDaysTreeCapture = function (days) {
              const d = Number(days);
              if (!Number.isFinite(d) || d <= 0) return '—';
              if (d < 1) return '< 1 jour';
              if (d < 2) return '1 jour';
              return `${Math.round(d)} jours`;
            };
          }
        })();


    if ($reportTree) {
      let text = `Ce panier ne contient pas encore assez d’informations pour estimer une équivalence en arbres.`;
      const $treeNumber = document.getElementById('co2-tree-number');

      if (typeof window.computeDaysTreeCapture === 'function' &&
          Number.isFinite(totalCo2Kg) &&
          totalCo2Kg > 0) {

        // Nombre de jours de captation total pour ce panier
        const daysCaptured = window.computeDaysTreeCapture(totalCo2Kg);

        // Règle : 1 arbre = 30 jours de captation
        const treeEquivalent = daysCaptured / 30;

        // Mise Ã  jour du petit bloc numÃ©rique
        if ($treeNumber) {
          if (treeEquivalent < 1) {
            $treeNumber.textContent = '< 1';
          } else if (treeEquivalent < 10) {
            $treeNumber.textContent = formatNumberFr(treeEquivalent, 1);
          } else {
            $treeNumber.textContent = formatNumberFr(Math.round(treeEquivalent));
          }
        }

        // Phrase détaillée
        const daysRounded = Math.round(daysCaptured);

        if (treeEquivalent < 1) {
          text = `Ce panier représente moins d’un arbre captant pendant ${daysRounded} jours.`;
        } else if (treeEquivalent < 10) {
          text = `Ce panier représente environ ${formatNumberFr(treeEquivalent, 1)} arbres captant pendant ${daysRounded} jours.`;
        } else {
          text = `Ce panier représente environ ${formatNumberFr(Math.round(treeEquivalent))} arbres captant pendant ${daysRounded} jours.`;
        }

        // Gestion du badge visuel d'arbres
const $treeIcons  = document.getElementById('co2-tree-icons');
const $treeBadge  = document.getElementById('co2-tree-number-badge');

if ($treeIcons && $treeBadge) {
    const value = treeEquivalent; // nombre réel
    const iconsCount = Math.floor(value); // nombre d’arbres pleins

    let icons = "";

    // Maximum 10 arbres
    const maxIcons = 10;

    if (iconsCount >= 1) {
        const countToShow = Math.min(iconsCount, maxIcons);
        icons = "🌳".repeat(countToShow);

        // Ajout du "+" si on dépasse le max
        if (iconsCount > maxIcons) {
            icons += "+";
        }
    } else {
        // Cas < 1 arbre → un mini arbre grisé
        icons = "🌱";
    }

    $treeIcons.textContent = icons;

    // Mise Ã  jour du nombre rÃ©el
    if (treeEquivalent < 1) {
      $treeBadge.textContent = "(< 1)";
    } else {
      $treeBadge.textContent = `(${formatNumberFr(treeEquivalent, 1)})`;
    }
}


      } else if ($treeNumber) {
        // Pas de données exploitables → on garde le tiret
        $treeNumber.textContent = '—';
          const $treeIcons  = document.getElementById('co2-tree-icons');
        const $treeBadge  = document.getElementById('co2-tree-number-badge');
        if ($treeIcons && $treeBadge) {
          $treeIcons.textContent = '—';
          $treeBadge.textContent = '(—)';
        }
      }

      $reportTree.textContent = text;
    }


   

    // 4) Distances (totale & moyenne, pondérées par la quantité)
    let sumDistanceKm = 0;
    let countDistanceItems = 0;

    for (const item of co2Cart) {
      if (typeof item.distance_km === 'number' && isFinite(item.distance_km)) {
        const qty = item.quantity || 1;
        sumDistanceKm += item.distance_km * qty;
        countDistanceItems += qty;
      }
    }

    const totalDistanceKm = sumDistanceKm;
    const avgDistanceKm = countDistanceItems > 0 ? (sumDistanceKm / countDistanceItems) : 0;
    const localThreshold = 250;

    if ($reportDistTotal) {
      if (totalDistanceKm > 0) {
        $reportDistTotal.textContent =
          `Distance totale parcourue (pondérée par la quantité) : ${formatNumberFr(Math.round(totalDistanceKm))} km.`;
      } else {
        $reportDistTotal.textContent = 'Distance totale parcourue : données indisponibles.';
      }
    }

   if ($reportDistAvg) {
        if (avgDistanceKm > 0) {
          $reportDistAvg.textContent =
            `Distance moyenne par produit : ${formatNumberFr(Math.round(avgDistanceKm))} km.`;
        } else {
          $reportDistAvg.textContent = 'Distance moyenne par produit : données indisponibles.';
        }
      }


    if ($reportDistComment) {
      if (avgDistanceKm > 0) {
        if (avgDistanceKm <= localThreshold) {
          $reportDistComment.textContent =
            `Votre panier est plutôt local (distance moyenne inférieure au seuil de ${localThreshold} km).`;
        } else {
          $reportDistComment.textContent =
            `Votre panier est plutôt éloigné (distance moyenne supérieure au seuil de ${localThreshold} km).`;
        }
      } else {
        $reportDistComment.textContent =
          'Impossible de qualifier le caractère local du panier (distances manquantes).';
      }
    }

         // 5) Recommandations (bas carbone / haut impact)
if ($recoIntro && $recoList) {
  $recoList.innerHTML = '';

  const { topLow, topHigh } = getRecoFromCart(co2Cart);

  if ((!topLow || topLow.length === 0) && (!topHigh || topHigh.length === 0)) {
    $recoIntro.textContent =
      "Pas assez de données CO₂ unitaires pour proposer des recommandations sur ce panier.";
  } else {
    $recoIntro.textContent =
      "Voici les produits les moins Ã©missifs et ceux Ã  surveiller dans ce panier.";

    if (topLow && topLow.length) {
      const liTitle = document.createElement('li');
      liTitle.innerHTML = '<strong>Top bas carbone</strong>';
      $recoList.appendChild(liTitle);

      topLow.forEach((it) => {
        const li = document.createElement('li');
        li.textContent =
          `${it.product_name || 'Produit'} – ≈ ${formatNumberFr(Math.round(it.co2_unit_g))} g CO₂e / unité`;
        $recoList.appendChild(li);
      });
    }

    if (topHigh && topHigh.length) {
      const liTitle = document.createElement('li');
      liTitle.innerHTML = '<strong>Top Ã  fort impact</strong>';
      $recoList.appendChild(liTitle);

      topHigh.forEach((it) => {
        const li = document.createElement('li');
        li.textContent =
          `${it.product_name || 'Produit'} â€“ â‰ˆ ${formatNumberFr(Math.round(it.co2_unit_g))} g COâ‚‚e / unitÃ© (Ã  remplacer si possible)`;
        $recoList.appendChild(li);
      });
    }
  }
}
 
console.log('[Reco] introEl/listEl:', $recoIntro, $recoList);
console.log('[Reco] recoList HTML:', $recoList ? $recoList.innerHTML : null);

         // 6) RÃ©partition par catÃ©gories â€“ calcul Ã  partir du panier
    if ($catBox) {
       
             // Fonction locale (défensive) : mappe une catégorie brute → catégorie graphique
      function mapCategoryForGraph(rawCategory) {
        const c = String(rawCategory || '').toLowerCase();

        // Viande
        if (
          c.includes('viande') ||
          c.includes('boeuf') ||
          c.includes('bœuf') ||
          c.includes('porc') ||
          c.includes('poulet') ||
          c.includes('dinde') ||
          c.includes('agneau') ||
          c.includes('charcut')
        ) {
          return 'Viande';
        }

        // Végétaux
        if (
          c.includes('legume') ||
          c.includes('légume') ||
          c.includes('fruit') ||
          c.includes('cereal') ||
          c.includes('céréale') ||
          c.includes('riz') ||
          c.includes('pate') ||
          c.includes('pâte') ||
          c.includes('lentille') ||
          c.includes('haricot')
        ) {
          return 'Végétaux';
        }

        // Épicerie
        if (
          c.includes('epicerie') ||
          c.includes('épicerie') ||
          c.includes('sauce') ||
          c.includes('condiment') ||
          c.includes('biscuit') ||
          c.includes('chocolat') ||
          c.includes('sucre') ||
          c.includes('confiture')
        ) {
          return 'Épicerie';
        }

        // Boisson
        if (
          c.includes('boisson') ||
          c.includes('jus') ||
          c.includes('soda') ||
          c.includes('biere') ||
          c.includes('bière') ||
          c.includes('vin') ||
          c.includes('eau') ||
          c.includes('sirop')
        ) {
          return 'Boisson';
        }

        return 'Autres';
      }

      }

      // 6.2 – Initialisation des totaux CO₂ par catégorie (en g)
      const categoryTotals = {
        'Viande': 0,
        'Végétaux': 0,
        'Épicerie': 0,
        'Boisson': 0,
        'Autres': 0
      };

      // 6.3 – Agrégation du CO₂ total pour chaque catégorie
      co2Cart.forEach(item => {
        const rawCategory =
          item.category ||
          item.product_category ||
          item.main_category ||
          item.categorie ||
          item.category_name ||
          null;

        const cat = mapCategoryForGraph(rawCategory);

        const co2TotalG = Number.isFinite(item.co2_total_g)
          ? item.co2_total_g
          : 0;

        categoryTotals[cat] += co2TotalG;
      });

      const totalAll = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);

      // 6.4 – Rendu texte dans le bloc #co2-cart-report-categories
      $catBox.innerHTML = '';

      if (totalAll <= 0) {
        const p = document.createElement('p');
        p.textContent =
          "Impossible de calculer la répartition par catégories (données CO₂ insuffisantes dans le panier).";
        $catBox.appendChild(p);
      } else {
        const ul = document.createElement('ul');
        ul.className = 'co2-cart-cat-list';

        function addLine(label) {
          const valueG = categoryTotals[label];
          if (!valueG || valueG <= 0) return;

          const valueKg = valueG / 1000;
          const share = Math.round((valueG / totalAll) * 100);

          const li = document.createElement('li');
          li.textContent =
            `${label} : ${formatNumberFr(valueKg, 1)} kg CO₂e (${share} %)`;
          ul.appendChild(li);
        }

        addLine('Viande');
        addLine('Végétaux');
        addLine('Épicerie');
        addLine('Boisson');
        addLine('Autres');

        $catBox.appendChild(ul);


        /* =========================================================
   ScanImpact — Camembert catégories (version robuste)
   Cible les IDs de scan-impact.html :
   #co2-category-pie, #co2-category-dominant, #co2-category-legend
   ========================================================= */
window.HonouaReportPie = window.HonouaReportPie || (function () {
  const ORDERED = ['Viande', 'Végétaux', 'Épicerie', 'Boisson', 'Autres'];

  function safeNumber(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }

  function getColor(cat) {
    // Réutilise ta fonction si elle existe, sinon fallback
    if (typeof window.getCategoryColor === 'function') {
      const c = window.getCategoryColor(cat);
      if (typeof c === 'string' && c.trim()) return c;
    }
    // Fallback neutre
    return '#999';
  }

  function pickDominant(categoryTotalsG, totalAllG) {
    const total = safeNumber(totalAllG);
    if (total <= 0) return { cat: null, share: 0 };

    let bestCat = null;
    let bestVal = 0;

    ORDERED.forEach(cat => {
      const v = safeNumber(categoryTotalsG?.[cat]);
      if (v > bestVal) {
        bestVal = v;
        bestCat = cat;
      }
    });

    if (!bestCat || bestVal <= 0) return { cat: null, share: 0 };
    return { cat: bestCat, share: Math.round((bestVal / total) * 100) };
  }

  function renderLegend($legend, $dominant, categoryTotalsG, totalAllG) {
    if (!$legend) return;

    const total = safeNumber(totalAllG);
    $legend.innerHTML = '';

    const defaultText = $dominant ? $dominant.textContent : '';

    ORDERED.forEach(cat => {
      const valueG = safeNumber(categoryTotalsG?.[cat]);
      if (valueG <= 0 || total <= 0) return;

      const share = Math.round((valueG / total) * 100);
      const valueKg = valueG / 1000;

      const li = document.createElement('li');

      const colorBox = document.createElement('span');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = getColor(cat);

      const textSpan = document.createElement('span');
      // si formatNumberFr existe, on l'utilise
      const fmt = (typeof window.formatNumberFr === 'function')
        ? window.formatNumberFr(valueKg, 1)
        : valueKg.toFixed(1).replace('.', ',');
      textSpan.textContent = `${cat} – ${share} % (${fmt} kg CO₂e)`;

      li.appendChild(colorBox);
      li.appendChild(textSpan);

      // Hover / click (mobile friendly)
      li.addEventListener('mouseenter', () => {
        if ($dominant) $dominant.textContent = `${cat} : ${share} % (${fmt} kg CO₂e)`;
        li.classList.add('active');
      });
      li.addEventListener('mouseleave', () => {
        if ($dominant && defaultText) $dominant.textContent = defaultText;
        li.classList.remove('active');
      });
      li.addEventListener('click', () => {
        if ($dominant) $dominant.textContent = `${cat} : ${share} % (${fmt} kg CO₂e)`;
        Array.from($legend.querySelectorAll('li')).forEach(x => x.classList.remove('active'));
        li.classList.add('active');
      });

      $legend.appendChild(li);
    });
  }

  function drawPie(canvas, categoryTotalsG, totalAllG) {
    const total = safeNumber(totalAllG);
    if (!canvas || !canvas.getContext || total <= 0) {
      console.warn('[CatGraph] Canvas ou total invalide.', { totalAllG });
      return { drawn: false };
    }

    const ctx = canvas.getContext('2d');

    // Taille interne stable (indépendante du CSS)
    canvas.width = 180;
    canvas.height = 180;

    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) / 2 - 6;

    let start = -Math.PI / 2;

    let drewAtLeastOne = false;

    ORDERED.forEach(cat => {
      const valueG = safeNumber(categoryTotalsG?.[cat]);
      if (valueG <= 0) return;

      const slice = (valueG / total) * 2 * Math.PI;
      if (!Number.isFinite(slice) || slice <= 0) return;

      const end = start + slice;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();

      ctx.fillStyle = getColor(cat);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      start = end;
      drewAtLeastOne = true;
    });

    // Pixel test (debug fiable)
    const px = Array.from(ctx.getImageData(90, 90, 1, 1).data);
    console.log('[CatGraph] pie pixel@center', px, 'total=', total, 'categoryTotals=', categoryTotalsG);

    return { drawn: drewAtLeastOne, px };
  }

  function render(categoryTotalsG, totalAllG) {
    const canvas = document.getElementById('co2-category-pie');
    const $dominant = document.getElementById('co2-category-dominant');
    const $legend = document.getElementById('co2-category-legend');

    const total = safeNumber(totalAllG);

    // Bandeau catégorie dominante (ou message)
    if ($dominant) {
      const dom = pickDominant(categoryTotalsG, total);
      if (dom.cat) {
        $dominant.textContent = `Catégorie dominante : ${dom.cat} (${dom.share} %)`;
      } else {
        $dominant.textContent = 'Aucune catégorie dominante (données insuffisantes).';
      }
    }

    // Légende + interactions
    renderLegend($legend, $dominant, categoryTotalsG, total);

    // Camembert
    const res = drawPie(canvas, categoryTotalsG, total);
    if (res.drawn) {
      console.log('[CatGraph] Camembert dessiné.');
    } else {
      console.warn('[CatGraph] Aucun secteur dessiné (données catégories vides).', { categoryTotalsG, total });
    }
    return res;
  }

  return { render };
})();

  window.HonouaReportPie.render(categoryTotals, totalAll);
        if ($graph) {
          // Catégorie dominante
          if ($dominant) {
            let dominantCat = null;
            let dominantVal = 0;

            Object.keys(categoryTotals).forEach(cat => {
              const v = categoryTotals[cat];   // <-- ligne indispensable
              if (v > dominantVal) {
                dominantVal = v;
                dominantCat = cat;
              }
            });


            if (dominantCat && dominantVal > 0) {
              const shareDom = Math.round((dominantVal / totalAll) * 100);
              $dominant.textContent =
                `Catégorie dominante : ${dominantCat} (${shareDom} %)`;
            } else {
              $dominant.textContent =
                "Aucune catégorie dominante (données insuffisantes).";
            }
          }

          // Légende
                // Légende + mini-hover (Option C)
          if ($legend) {
            $legend.innerHTML = '';

            const ordered = ['Viande', 'Végétaux', 'Épicerie', 'Boisson', 'Autres'];

            // Texte par défaut du bandeau (catégorie dominante)
            const defaultDominantText = $dominant ? $dominant.textContent : '';

            ordered.forEach(cat => {
              const valueG = Number(totals[cat]);

              if (!Number.isFinite(valueG) || valueG <= 0) {
                return;
              
                }

              const valueKg = valueG / 1000;
              const share   = Math.round((valueG / totalAll) * 100);

              const li = document.createElement('li');

              const colorBox = document.createElement('span');
              colorBox.className = 'legend-color';
              colorBox.style.backgroundColor = getCategoryColor(cat);

              const textSpan = document.createElement('span');
              textSpan.textContent =
                `${cat} – ${share} % (${formatNumberFr(valueKg, 1)} kg CO₂e)`;

              li.appendChild(colorBox);
              li.appendChild(textSpan);

              // Mini-hover : survol
              li.addEventListener('mouseenter', () => {
                if ($dominant) {
                  $dominant.textContent =
                    `${cat} : ${share} % (${formatNumberFr(valueKg, 1)} kg CO₂e)`;
                }
                li.classList.add('active');
              });

              // On restaure le texte par défaut quand on sort
              li.addEventListener('mouseleave', () => {
                if ($dominant && defaultDominantText) {
                  $dominant.textContent = defaultDominantText;
                }
                li.classList.remove('active');
              });

              // Clic (mobile friendly)
              li.addEventListener('click', () => {
                if ($dominant) {
                  $dominant.textContent =
                    `${cat} : ${share} % (${formatNumberFr(valueKg, 1)} kg CO₂e)`;
                }
                // on enlève l'état actif des autres <li>
                Array.from($legend.querySelectorAll('li')).forEach(liOther => {
                  liOther.classList.remove('active');
                });
                li.classList.add('active');
              });

              $legend.appendChild(li);
            });
          }

          // Dessin du camembert (canvas)
         //drawCategoryPie(categoryTotals, totalAll);

        }
      }
    

    // 7) Affichage du rapport
    $reportSection.classList.remove('hidden');
  
  }

// ==============================
// A53 – Chargement de l'historique CO₂
// ==============================
// ================================
// Historique : stocker + afficher 2 derniers paniers
// ================================
const HONOUA_CART_HISTORY_KEY = 'honoua_cart_history_v1';

function honouaGetCartHistory() {
  try {
    const raw = localStorage.getItem(HONOUA_CART_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('[History] JSON invalide, reset.', e);
    return [];
  }
}

function honouaSaveCartToHistory(cartItems, totalsSummary) {
  const history = honouaGetCartHistory();

  history.unshift({
    ts: Date.now(),
    items: Array.isArray(cartItems) ? cartItems : [],
    totals: totalsSummary || null
  });

  // On garde un historique raisonnable
  const trimmed = history.slice(0, 30);

  localStorage.setItem(HONOUA_CART_HISTORY_KEY, JSON.stringify(trimmed));
}

function honouaRenderLastTwoCartsInReco() {
  const ul = document.getElementById('co2-report-reco-list');
  if (!ul) return;

  const history = honouaGetCartHistory().slice(0, 2);

  // On retire un ancien bloc si on rerend
  const old = ul.querySelector('li[data-lastcarts="1"]');
  if (old) old.remove();

  const li = document.createElement('li');
  li.setAttribute('data-lastcarts', '1');

  if (history.length === 0) {
    li.innerHTML = `<strong>Derniers paniers</strong><br>Aucun panier sauvegardé pour l’instant.`;
    ul.insertAdjacentElement('afterbegin', li);
    return;
  }

  const fmtDate = (ts) => {
    try { return new Date(ts).toLocaleString('fr-FR'); } catch { return ''; }
  };

  const lines = history.map((h, idx) => {
    const co2g =
      (h.totals && (h.totals.total_co2_g ?? h.totals.totalCo2G ?? h.totals.total_all_g)) ?? null;
    const co2kg = (co2g != null) ? (Number(co2g) / 1000) : null;

    const label =
      (h.totals && (h.totals.distinct_products ?? h.totals.distinctProducts)) ??
      (Array.isArray(h.items) ? h.items.length : 0);

    const co2Txt = (co2kg != null && Number.isFinite(co2kg))
      ? ` — ≈ ${co2kg.toFixed(2).replace('.', ',')} kg CO₂e`
      : '';

    return `• Panier ${idx + 1} (${fmtDate(h.ts)}) — ${label} produits${co2Txt}`;
  }).join('<br>');

  li.innerHTML = `<strong>Derniers paniers</strong><br>${lines}`;
  ul.insertAdjacentElement('afterbegin', li);
}

// ==============================
// A53 – Chargement de l'historique CO₂ (fiabilisé)
// ==============================
// Endpoint /api/cart/history absent en prod (404) : on désactive côté front pour éviter le spam réseau/console.
// Le jour oÃ¹ lâ€™endpoint est disponible, repasser Ã  false.
let __CO2_CART_HISTORY_DISABLED = true;


async function loadCo2CartHistory(limit = 5) {
  const $list = document.getElementById("co2-cart-history-list");
  const $reportList = document.getElementById("co2-report-history-list"); // ✅ historique dans le rapport

  if (!$list) {
    console.warn("[Historique CO2] Élément #co2-cart-history-list introuvable.");
    return;
  }

  // Si l’endpoint n’existe pas en API (404), on stoppe les refetch suivants.
  if (__CO2_CART_HISTORY_DISABLED) {
    $list.innerHTML = `
      <p class="co2-cart-history-empty">
        Historique indisponible pour le moment.
      </p>`;
    if ($reportList) $reportList.innerHTML = "";
    return;
  }

  try {
    const res = await fetch(`${CART_HISTORY_ENDPOINT}?limit=${limit}`, {

      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'X-Honoua-User-Id': (window.getHonouaUserId ? window.getHonouaUserId() : '')
      }
    });


      if (!res.ok) {
      // 404 = endpoint non disponible : on désactive définitivement côté front
      if (res.status === 404) {
        __CO2_CART_HISTORY_DISABLED = true;
        console.info("[Historique CO2] /api/cart/history indisponible (404) -> historique désactivé côté front.");
        $list.innerHTML = `
          <p class="co2-cart-history-empty">
            Historique indisponible pour le moment.
          </p>`;
        if ($reportList) $reportList.innerHTML = "";
        return;
      }

      // Autres erreurs : on garde un message, mais sans spam agressif
      console.warn("[Historique CO2] Erreur HTTP /api/cart/history :", res.status);
      $list.innerHTML = `
        <p class="co2-cart-history-empty">
          Historique indisponible (erreur de chargement).
        </p>`;
      if ($reportList) $reportList.innerHTML = "";
      return;
    }


    const raw = await res.json();
    // On réutilise normalizeHistoryResponse défini plus haut
    const history = normalizeHistoryResponse(raw);

    // Vider la liste
      $list.innerHTML = "";
      if ($reportList) $reportList.innerHTML = "";


    if (!history || history.length === 0) {
      $list.innerHTML = `
        <p class="co2-cart-history-empty">
          Aucun panier validé pour le moment. Validez un panier pour voir son historique ici.
        </p>`;
      return;
    }

    history.forEach((item) => {
      if (!item) return;

      const co2Kg        = (Number(item.total_co2_g) || 0) / 1000;
      const createdAt    = item.created_at
        ? new Date(item.created_at).toLocaleDateString("fr-FR")
        : (item.period_label || "Période inconnue");

      const nbArticles   = Number(item.nb_articles) || 0;
      const nbDistinct   = Number(item.nb_distinct_products) || 0;
      const distanceKm   = Number(item.total_distance_km) || 0;
      const treeEq       = Number(item.tree_equivalent) || 0;
      const daysCaptured = Number(item.days_captured_by_tree) || 0;

      const format = (val, dec = 0) =>
        typeof formatNumberFr === "function"
          ? formatNumberFr(val, dec)
          : (val || 0).toFixed(dec);

      const card = document.createElement("div");
      card.className = "co2-history-card";

      card.innerHTML = `
        <div class="co2-history-card-header">
          <h3>Panier #${item.id ?? "N/A"}</h3>
          <span class="co2-history-date">${createdAt}</span>
        </div>

        <div class="co2-history-card-content">
          <p><strong>CO₂ total :</strong> ${format(co2Kg, 2)} kg CO₂</p>
          <p><strong>Articles :</strong> ${nbArticles} articles (${nbDistinct} distincts)</p>
          <p><strong>Distance :</strong> ${format(distanceKm, 1)} km parcourus</p>
          <p><strong>Équivalent arbres :</strong> ${format(treeEq, 2)} arbre(s) (théorique)</p>
          <p><strong>Jours de captation :</strong> ${format(daysCaptured, 1)} jours</p>
        </div>
      `;

      $list.appendChild(card);
      if ($reportList) $reportList.appendChild(card.cloneNode(true));

    });

  } catch (err) {
    console.error("[Historique CO2] Erreur réseau :", err);
    $list.innerHTML = `
      <p class="co2-cart-history-empty">
        Historique indisponible (problème de connexion).
      </p>`;
  }
}


// Charger automatiquement l'historique au démarrage
document.addEventListener("DOMContentLoaded", () => {
  loadCo2CartHistory();
});



  // ============================
  // Suivi CO₂ – Bloc 1 : Budget annuel
  // ============================

  // Budget GIEC par personne (en kg CO₂ / an)
  const BUDGET_PER_PERSON_KG = 2000;

  // --- Foyer : persistance localStorage (MVP) ---
const HONOUA_HOUSEHOLD_SIZE_KEY = 'honoua_household_size';

function getHouseholdSize() {
  let n = 1;
  try {
    n = Number(localStorage.getItem(HONOUA_HOUSEHOLD_SIZE_KEY));
  } catch (e) {}
  if (!Number.isFinite(n) || n < 1) n = 1;
  if (n > 12) n = 12; // garde-fou MVP
  return Math.round(n);
}

function setHouseholdSize(value) {
  let n = Number(value);
  if (!Number.isFinite(n) || n < 1) n = 1;
  if (n > 12) n = 12;
  n = Math.round(n);
  try {
    localStorage.setItem(HONOUA_HOUSEHOLD_SIZE_KEY, String(n));
  } catch (e) {}
  // Rafraîchit l'affichage du budget si la fonction existe (évite toute régression)
if (typeof refreshBudgetFromApi === 'function') {
  refreshBudgetFromApi();
}

  return n;
}




  /**
   * Normalise la réponse de /api/cart/history
   * (gère les deux formats : tableau direct ou { value: [...] })
   */
  function normalizeHistoryResponse(raw) {
    if (Array.isArray(raw)) {
      return raw;
    }
    if (raw && Array.isArray(raw.value)) {
      return raw.value;
    }
    return [];
  }

  /**
   * Calcule l'Ã©tat du budget annuel Ã  partir de l'historique.
   * @param {Array} items - historique des paniers
   * @returns {Object} budgetState
   */
  function computeBudgetStateFromHistory(items) {
    const currentYear = new Date().getFullYear();
    let totalCo2GYear = 0;

    (items || []).forEach(item => {
      if (!item) return;

      let itemYear = null;

      // 1) On privilégie created_at si présent
      if (item.created_at) {
        const d = new Date(item.created_at);
        if (!isNaN(d)) {
          itemYear = d.getFullYear();
        }
      }

      // 2) Sinon on tente period_label (ex : "2025-11" ou "2025-W49")
      if (!itemYear && item.period_label) {
        const yStr = String(item.period_label).slice(0, 4);
        const yNum = parseInt(yStr, 10);
        if (!isNaN(yNum)) {
          itemYear = yNum;
        }
      }

      if (itemYear === currentYear) {
        const co2 = Number(item.total_co2_g) || 0;
        totalCo2GYear += co2;
      }
    });

    const co2AnnualKg = totalCo2GYear / 1000;
    const nbPersons = getHouseholdSize();
    const budgetAnnualKg = BUDGET_PER_PERSON_KG * nbPersons;


    let percentUsed = 0;
    if (budgetAnnualKg > 0) {
      percentUsed = (co2AnnualKg / budgetAnnualKg) * 100;
    }
    if (!isFinite(percentUsed) || percentUsed < 0) {
      percentUsed = 0;
    }

    let percentRemaining = 100 - percentUsed;
    if (percentRemaining < 0) {
      percentRemaining = 0;
    }

    let budgetRemainingKg = budgetAnnualKg - co2AnnualKg;
    if (budgetRemainingKg < 0) {
      budgetRemainingKg = 0;
    }

    // Statut simple selon % utilisé
    let statusKey = "ok";
    if (percentUsed > 100) {
      statusKey = "over";
    } else if (percentUsed > 80) {
      statusKey = "warning";
    }

    let statusLabel = "";
    let statusLevel = "";

    if (statusKey === "ok") {
      statusLabel = "Budget maîtrisé";
      statusLevel = "green";
    } else if (statusKey === "warning") {
      statusLabel = "Budget Ã  surveiller";
      statusLevel = "orange";
    } else {
      statusLabel = "Budget dépassé";
      statusLevel = "red";
    }

    return {
      currentYear,
      nbPersons,
      budgetAnnualKg,
      co2AnnualKg,
      percentUsed,
      percentRemaining,
      budgetRemainingKg,
      statusKey,
      statusLabel,
      statusLevel
    };
  }

  /**
   * Met Ã  jour le DOM du Bloc Budget Ã  partir de budgetState.
   * @param {Object} state
   */
  function renderBudgetFromState(state) {
    if (!state) return;

    const $budgetTotal   = document.getElementById('budget-total');
    const $co2Consomme  = document.getElementById('co2-consomme');
    const $budgetUsed    = document.getElementById('budget-used');
    const $budgetLeft    = document.getElementById('budget-left');
    const $progressBar   = document.getElementById('budget-progress-bar');
    const $budgetStatus  = document.getElementById('budget-status');

    if (!$budgetTotal || !$co2Consomme || !$budgetUsed || !$budgetLeft || !$progressBar || !$budgetStatus) {
      console.warn('[Suivi CO2] Éléments DOM du bloc Budget manquants.');
      return;
    }

    // Helpers de format (on réutilise formatNumberFr si dispo)
    const formatKg = (kg, decimals = 0) => {
      if (typeof formatNumberFr === 'function') {
        return formatNumberFr(kg, decimals);
      }
      return (kg || 0).toFixed(decimals);
    };

    const formatPercent = (val, decimals = 1) => {
      const v = isFinite(val) ? val : 0;
      if (typeof formatNumberFr === 'function') {
        return formatNumberFr(v, decimals);
      }
      return v.toFixed(decimals);
    };

    // Valeurs principales
    $budgetTotal.textContent  = formatKg(state.budgetAnnualKg, 0) + ' kg';
    $co2Consomme.textContent  = formatKg(state.co2AnnualKg, 1) + ' kg';
    $budgetUsed.textContent   = formatPercent(state.percentUsed, 1) + ' %';

    const leftText =
      formatKg(state.budgetRemainingKg, 0) +
      ' kg (' +
      formatPercent(state.percentRemaining, 1) +
      ' %)';
    $budgetLeft.textContent = leftText;

    // Jauge
    const percentForBar = Math.max(0, Math.min(state.percentUsed, 100));
    $progressBar.style.width = percentForBar + '%';

    // Couleur de la jauge
    let barColor = getComputedStyle(document.documentElement).getPropertyValue('--green') || '#062909';
    if (state.statusLevel === 'orange') {
      barColor = '#F5C147';
    } else if (state.statusLevel === 'red') {
      barColor = '#C62828';
    }
    $progressBar.style.backgroundColor = barColor;

    // Statut : texte + classes
    $budgetStatus.textContent =
      state.statusLabel + ' — ' +
      formatPercent(state.percentUsed, 1) +
      ' % du budget utilisé en ' +
      state.currentYear;

    $budgetStatus.classList.remove('status-green', 'status-orange', 'status-red');
    $budgetStatus.classList.add('status-' + state.statusLevel);
  }

  /**
 * Agrège l'historique par année / mois / semaine.
 * Unité pivot : total_co2_g (grammes).
 * Compat : gère created_at, validated_at, period_month, period_week, period_label.
 */
function aggregateHistoryByPeriod(items) {
  const byYear = Object.create(null);
  const byMonth = Object.create(null);
  const byWeek = Object.create(null);

  const safeAdd = (bucket, key, co2g, distKm) => {
  if (!key) return;
  const k = String(key);
  if (!bucket[k]) {
    bucket[k] = { total_co2_g: 0, total_distance_km: 0, count: 0 };
  }
  bucket[k].total_co2_g += co2g;
  bucket[k].total_distance_km += distKm;
  bucket[k].count += 1;
};



  const toYearKey = (dateObj) => String(dateObj.getFullYear());
  const pad2 = (n) => String(n).padStart(2, "0");

  // ISO week (YYYY-Www) – calcul minimal robuste
  const toIsoWeekKey = (dateObj) => {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    // Jeudi de la semaine ISO
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  };

  const toMonthKey = (dateObj) => `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}`;

  (items || []).forEach((item) => {
    if (!item) return;

    // 1) CO2 en g (pivot)
    let co2g = Number(item.total_co2_g);
    if (!Number.isFinite(co2g) || co2g < 0) co2g = 0;


// ✅ AJOUT ICI (juste après co2g)
    let distKm = Number(item.total_distance_km);
    if (!Number.isFinite(distKm) || distKm < 0) distKm = 0;

    // 2) Clés période : on privilégie les champs backend si présents
    const yearFromLabel = () => {
      const src = item.period_label || item.period_month || item.period_week;
      if (!src) return null;
      const y = parseInt(String(src).slice(0, 4), 10);
      return Number.isFinite(y) ? String(y) : null;
    };

    let yearKey = yearFromLabel();
    let monthKey = item.period_month ? String(item.period_month) : null;
    let weekKey = item.period_week ? String(item.period_week) : null;

    // 3) Si period_label = "2025-11" on peut le traiter comme month
    if (!monthKey && item.period_label && /^\d{4}-\d{2}$/.test(String(item.period_label))) {
      monthKey = String(item.period_label);
    }
    // 4) Si period_label = "2025-W49" on peut le traiter comme week
    if (!weekKey && item.period_label && /^\d{4}-W\d{1,2}$/.test(String(item.period_label))) {
      const w = String(item.period_label).replace(/-W(\d)$/, "-W0$1");
      weekKey = w;
    }

    // 5) Fallback date si besoin (created_at puis validated_at)
    if (!yearKey || (!monthKey && !weekKey)) {
      const dtRaw = item.created_at || item.validated_at || null;
      if (dtRaw) {
        const d = new Date(dtRaw);
        if (!isNaN(d)) {
          if (!yearKey) yearKey = toYearKey(d);
          if (!monthKey) monthKey = toMonthKey(d);
          if (!weekKey) weekKey = toIsoWeekKey(d);
        }
      }
    }

    // 6) Ajouts
   safeAdd(byYear, yearKey, co2g, distKm);
   safeAdd(byMonth, monthKey, co2g, distKm);
   safeAdd(byWeek, weekKey, co2g, distKm);

  });

  // 7) Sorties triées (utile pour le graphique ensuite)
  const toSortedSeries = (bucket) =>
    Object.keys(bucket)
      .sort()
      .map((key) => ({
      period: key,
      total_co2_g: bucket[key].total_co2_g,
      total_distance_km: bucket[key].total_distance_km,
      count: bucket[key].count,
    }));


  return {
    byYear,
    byMonth,
    byWeek,
    seriesYear: toSortedSeries(byYear),
    seriesMonth: toSortedSeries(byMonth),
    seriesWeek: toSortedSeries(byWeek),
  };
}


  /**
   * RÃ©cupÃ¨re l'historique et met Ã  jour le bloc Budget.
   */
  async function refreshBudgetFromApi() {
    const $budgetStatus = document.getElementById('budget-status');

    if (__CO2_CART_HISTORY_DISABLED) {
      if ($budgetStatus) {
        $budgetStatus.textContent = "Budget indisponible pour le moment.";
        $budgetStatus.classList.remove('status-green', 'status-orange');
        $budgetStatus.classList.add('status-red');
      }
      return;
    }

    try {

             const userId =
          (window.getHonouaUserId && typeof window.getHonouaUserId === 'function')
            ? window.getHonouaUserId()
            : (localStorage.getItem('honoua_user_id') || '');

        const resp = await fetch(`${CART_HISTORY_ENDPOINT}?limit=100`, {
          headers: {
            'Accept': 'application/json',
            'X-Honoua-User-Id': userId
          }
  
        });

    // âœ… DÃ©fis : auto-refresh aprÃ¨s mise Ã  jour des donnÃ©es (guard anti-rÃ©gression)
    if (typeof buildChallengesFromAgg === "function" && typeof renderCo2ChallengesList === "function") {
      renderCo2ChallengesList(buildChallengesFromAgg(window.__honouaSuiviAgg, window.__honouaSuiviTrend));
    }

      if (!resp.ok) {
        if (resp.status === 404) {
          __CO2_CART_HISTORY_DISABLED = true;
          console.info('[Suivi CO2] /api/cart/history indisponible (404) -> historique désactivé côté front.');
          if ($budgetStatus) {
            $budgetStatus.textContent = "Budget indisponible pour le moment.";
            $budgetStatus.classList.remove('status-green', 'status-orange');
            $budgetStatus.classList.add('status-red');
          }
          return;
        }

        console.warn('[Suivi CO2] Erreur HTTP /api/cart/history :', resp.status);
        if ($budgetStatus) {
          $budgetStatus.textContent = "Budget indisponible (erreur de chargement).";
          $budgetStatus.classList.remove('status-green', 'status-orange');
          $budgetStatus.classList.add('status-red');
        }
        return;
      }


      const raw = await resp.json();
      const items = normalizeHistoryResponse(raw);

      const agg = aggregateHistoryByPeriod(items);

        // Debug MVP (temporaire) : exposer les séries pour inspection console
        window.__honouaSuiviAgg = agg;

    // ✅ Préparation série mois + indicateurs (sans UI)
      const monthSeries = agg.seriesMonth || [];
      const last = monthSeries.length > 0 ? monthSeries[monthSeries.length - 1] : null;
      const prev = monthSeries.length > 1 ? monthSeries[monthSeries.length - 2] : null;

      const lastMonthCo2_g = last ? Number(last.total_co2_g) : 0;
      const prevMonthCo2_g = prev ? Number(prev.total_co2_g) : 0;

      const deltaMonth_g = lastMonthCo2_g - prevMonthCo2_g;
      const deltaMonth_pct = prevMonthCo2_g > 0 ? (deltaMonth_g / prevMonthCo2_g) : null;

      // Expose pour inspection console (temporaire MVP)
      window.__honouaSuiviTrend = {
        lastMonth: last ? last.period : null,
        prevMonth: prev ? prev.period : null,
        lastMonthCo2_g,
        prevMonthCo2_g,
        deltaMonth_g,
        deltaMonth_pct
      };

      // ✅ UI minimale (si les éléments existent)
      const $mLabel = document.getElementById("suiviLastMonthLabel");
      const $mCo2 = document.getElementById("suiviLastMonthCo2");
      const $dG = document.getElementById("suiviDeltaMonth");
      const $dPct = document.getElementById("suiviDeltaMonthPct");

      const trend = window.__honouaSuiviTrend;

      // format en kg (lisible MVP) ; si tu préfères tCO2, on bascule ensuite
      const fmtKg = (g) => `${Math.round((Number(g) || 0) / 1000)} kgCO₂`;
      const fmtPct = (p) => (p === null || !Number.isFinite(p)) ? "—" : `${Math.round(p * 100)}%`;

      if ($mLabel) $mLabel.textContent = trend.lastMonth || "—";
      if ($mCo2) $mCo2.textContent = fmtKg(trend.lastMonthCo2_g);
      if ($dG) $dG.textContent = (trend.prevMonth ? `${trend.deltaMonth_g >= 0 ? "+" : ""}${fmtKg(trend.deltaMonth_g)}` : "—");
      if ($dPct) $dPct.textContent = (trend.prevMonth ? fmtPct(trend.deltaMonth_pct) : "—");


      console.log("[Suivi CO2] Trend:", window.__honouaSuiviTrend);



        console.log("[Suivi CO2] Aggregation month sample:", agg.seriesMonth.slice(0, 3));
        console.log("[Suivi CO2] Aggregation week sample:", agg.seriesWeek.slice(0, 3));

      const budgetState = computeBudgetStateFromHistory(items);
      renderBudgetFromState(budgetState);

    } catch (err) {
      console.error('[Suivi CO2] Erreur réseau /api/cart/history :', err);
      if ($budgetStatus) {
        $budgetStatus.textContent = "Budget indisponible (problème de connexion).";
        $budgetStatus.classList.remove('status-green', 'status-orange');
        $budgetStatus.classList.add('status-red');
      }
    }
  }

  // On lance le calcul du budget quand la page est prête
  document.addEventListener('DOMContentLoaded', function () {
    refreshBudgetFromApi();
  });

/* ============================================================================
   SUIVI CO₂ — BLOC 2 : ÉVOLUTION DES ÉMISSIONS (Données + graphique)
   ============================================================================ */
/** Label lisible pour l'axe X */
function formatLabelFromPeriod(periodType, periodLabel) {
  if (!periodLabel) return "";
  if (periodType === "month") {
    const [year, month] = periodLabel.split("-");
    const moisNoms = ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
    const mIndex = parseInt(month, 10) - 1;
    const moisTxt = moisNoms[mIndex] || month;
    return `${moisTxt} ${year}`;
  }

  if (periodType === "week") {
    const parts = periodLabel.split("-W");
    const year = parts[0];
    const week = parts[1] || "";
    return `Sem. ${week} (${year})`;
  }

  return periodLabel;
}

/** Variation en % avec garde-fou */
function safePctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/* -------- 1) Construction de la série -------- */

function buildEvolutionSeries(items, periodType) {
  const filtered = (items || []).filter(
    (it) => it && it.period_type === periodType
  );

  const points = filtered.map((it) => {
    const co2Kg = (Number(it.total_co2_g) || 0) / 1000;
    const distanceKm = Number(it.total_distance_km) || 0;

    return {
      key: it.period_label,
      label: formatLabelFromPeriod(periodType, it.period_label),
      co2Kg,
      distanceKm
    };
  });

  points.sort((a, b) => a.key.localeCompare(b.key));
  return points;
}

/* -------- 2) Résumé période actuelle vs précédente -------- */

function buildEvolutionSummary(points, periodType) {
  if (!points.length) return null;

  if (points.length === 1) {
    const p = points[0];
    return {
      periodType,
      currentKey: p.key,
      current: { ...p },
      previousKey: null,
      previous: null,
      co2ChangePct: null,
      distanceChangePct: null
    };
  }

  const last = points[points.length - 1];
  const prev = points[points.length - 2];

  return {
    periodType,
    currentKey: last.key,
    previousKey: prev.key,
    current: { ...last },
    previous: { ...prev },
    co2ChangePct: safePctChange(last.co2Kg, prev.co2Kg),
    distanceChangePct: safePctChange(last.distanceKm, prev.distanceKm)
  };
}

/* -------- 3) Injection du résumé dans le DOM -------- */

function renderEvolutionSummary(summary) {
  if (!summary) return;

  const $period  = document.getElementById("evo-current-period");
  const $co2     = document.getElementById("evo-current-co2");
  const $dist    = document.getElementById("evo-current-distance");
  const $co2Chg  = document.getElementById("evo-co2-change");
  const $distChg = document.getElementById("evo-distance-change");

   // ✅ Fix: si la page ne contient pas le module Evolution, on ne fait rien
  if (!$period || !$co2 || !$dist || !$co2Chg || !$distChg) return;

  const fmt = (n) => (n === null || isNaN(n) ? "—" : n.toFixed(1));

  if (summary.current) {
    $period.textContent = summary.current.label;
    $co2.textContent    = fmt(summary.current.co2Kg) + " kg";
    $dist.textContent   = fmt(summary.current.distanceKm) + " km";
  } else {
    $period.textContent = "—";
    $co2.textContent    = "— kg";
    $dist.textContent   = "— km";
  }

  if (summary.previous && summary.co2ChangePct !== null) {
    const pct = summary.co2ChangePct;
    $co2Chg.textContent = (pct > 0 ? "+" : "") + pct.toFixed(1) + " %";
  } else {
    $co2Chg.textContent = "— %";
  }

  if (summary.previous && summary.distanceChangePct !== null) {
    const pct = summary.distanceChangePct;
    $distChg.textContent = (pct > 0 ? "+" : "") + pct.toFixed(1) + " %";
  } else {
    $distChg.textContent = "— %";
  }
}

/* -------- 4) Dessin du graphique dans le canvas -------- */

function drawEvolutionChart(series) {
  const canvas = document.getElementById("evo-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  if (!series || !series.length) {
    ctx.fillStyle = "#666";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Pas encore assez de données pour afficher un graphique.", width / 2, height / 2);
    return;
  }

  // Max CO2 pour l'échelle
  let maxCo2 = 0;
  series.forEach((p) => {
    if (p.co2Kg > maxCo2) maxCo2 = p.co2Kg;
  });
  if (maxCo2 <= 0) maxCo2 = 1;

  const margin = { top: 10, right: 10, bottom: 26, left: 35 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Axes
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + innerH);
  ctx.lineTo(margin.left + innerW, margin.top + innerH);
  ctx.stroke();

  // Graduations Y (0, 50%, 100%)
  ctx.fillStyle = "#777";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const ticks = 3;
  for (let i = 0; i <= ticks; i++) {
    const t = (maxCo2 * i) / ticks;
    const y = margin.top + innerH - (innerH * t / maxCo2);

    ctx.fillText(t.toFixed(0), margin.left - 4, y);
    ctx.strokeStyle = "#eeeeee";
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + innerW, y);
    ctx.stroke();
  }

  const n = series.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  // Courbe CO₂
  ctx.strokeStyle = "#062909";
  ctx.lineWidth = 2;
  ctx.beginPath();

  series.forEach((p, idx) => {
    const x = n > 1 ? margin.left + stepX * idx : margin.left + innerW / 2;
    const y = margin.top + innerH - (innerH * p.co2Kg / maxCo2);

    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points
  ctx.fillStyle = "#062909";
  series.forEach((p, idx) => {
    const x = n > 1 ? margin.left + stepX * idx : margin.left + innerW / 2;
    const y = margin.top + innerH - (innerH * p.co2Kg / maxCo2);

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Labels X (on limite pour rester lisible)
  ctx.fillStyle = "#555";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const maxLabels = 6;
  const stepLabel = n > maxLabels ? Math.ceil(n / maxLabels) : 1;

  series.forEach((p, idx) => {
    if (idx % stepLabel !== 0 && idx !== n - 1) return;
    const x = n > 1 ? margin.left + stepX * idx : margin.left + innerW / 2;
    const y = margin.top + innerH + 4;
    ctx.fillText(p.label, x, y);
  });
}

/* -------- 5) Fonction principale appelée par la page -------- */

let currentEvolutionPeriodType = "month";

function buildEvolutionSeriesFromAgg(agg, periodType) {
  const src = periodType === "week" ? (agg.seriesWeek || []) : (agg.seriesMonth || []);

  return src.map((p) => ({
    key: p.period,
    label: p.period, // MVP : label brut (on raffinera après)
    co2Kg: (Number(p.total_co2_g) || 0) / 1000,
    distanceKm: Number(p.total_distance_km) || 0
  }));
}


async function refreshEvolution(periodType = "month") {
  currentEvolutionPeriodType = periodType;

  if (__CO2_CART_HISTORY_DISABLED) {
    // L’endpoint historique est indisponible : on évite les refetch et le spam console.
    return;
  }

  try {
    const userId =
      (window.getHonouaUserId && typeof window.getHonouaUserId === "function")
        ? window.getHonouaUserId()
        : (localStorage.getItem("honoua_user_id") || "");

    const resp = await fetch(`${CART_HISTORY_ENDPOINT}?limit=150`, {
      headers: {
        "Accept": "application/json",
        "X-Honoua-User-Id": userId
      }
    });

    if (!resp.ok) {
      if (resp.status === 404) {
        __CO2_CART_HISTORY_DISABLED = true;
        console.info("[Evolution] /api/cart/history indisponible (404) -> évolution désactivée côté front.");
        return;
      }
      console.warn("[Evolution] Erreur HTTP :", resp.status);
      return;
    }


    const raw = await resp.json();
    const items = normalizeHistoryResponse(raw);

    const agg = aggregateHistoryByPeriod(items);
    const series = buildEvolutionSeriesFromAgg(agg, periodType);
    const summary = buildEvolutionSummary(series, periodType);

    renderEvolutionSummary(summary);
    drawEvolutionChart(series);

    console.log("[Evolution] periodType =", periodType);
    console.log("=== SERIES ===", series);
    console.log("=== SUMMARY ===", summary);

  } catch (err) {
    console.error("[Evolution] Erreur réseau :", err);
  }
}

/* -------- 6) Gestion des boutons Mois / Semaines -------- */

function setupEvolutionPeriodToggle() {
  const btnMonth = document.getElementById("evo-period-month");
  const btnWeek  = document.getElementById("evo-period-week");

  if (!btnMonth || !btnWeek) return;

  btnMonth.addEventListener("click", () => {
    if (currentEvolutionPeriodType === "month") return;
    btnMonth.classList.add("evo-period-btn-active");
    btnWeek.classList.remove("evo-period-btn-active");
    refreshEvolution("month");
  });

  btnWeek.addEventListener("click", () => {
    if (currentEvolutionPeriodType === "week") return;
    btnWeek.classList.add("evo-period-btn-active");
    btnMonth.classList.remove("evo-period-btn-active");
    refreshEvolution("week");
  });
}

/* -------- 7) Initialisation -------- */

document.addEventListener("DOMContentLoaded", () => {
  setupEvolutionPeriodToggle();
  refreshEvolution("month");
});

/* ============================================================================
   SUIVI CO₂ — BLOC 4 : Défis personnels (MVP – version finale)
   ============================================================================ */

console.log("[Défis CO2][MVP] script inline chargé");

// 1) Défis personnels statiques pour le MVP
const PERSONAL_CHALLENGES_MVP = [
  {
    id: "reduce_10_percent_30_days",
    icon: "🆙",
    name: "Réduire ton CO₂ de 10 % sur 30 jours",
    status: "en_cours",
    progressPct: 63,
    message: "Tu as réduit ton CO₂ de 7 %, objectif : 10 %. Continue !"
  },
  {
    id: "local_week",
    icon: "🅲",
    name: "Une semaine 100 % locale",
    status: "en_cours",
    progressPct: 40,
    message: "40 % de tes produits sont déjà locaux cette semaine."
  },
  {
    id: "short_distance_month",
    icon: "🚲",
    name: "Limiter la distance moyenne des produits",
    status: "reussi",
    progressPct: 100,
    message: "Bravo ! Ta distance moyenne est restée sous ton objectif ce mois-ci."
  }
];

// 1bis) Défis dynamiques (basés sur données réelles) — fallback sur MVP si données absentes
function buildChallengesFromAgg(agg, trend) {
  const monthSeries = agg?.seriesMonth || [];
  const hasAtLeast2Months = monthSeries.length >= 2;

  // Valeurs mois (via trend si dispo, sinon depuis monthSeries)
  const last = trend?.lastMonth ? { period: trend.lastMonth, total_co2_g: trend.lastMonthCo2_g } : monthSeries[monthSeries.length - 1];
  const prev = trend?.prevMonth ? { period: trend.prevMonth, total_co2_g: trend.prevMonthCo2_g } : monthSeries[monthSeries.length - 2];

  // Helpers
  const fmtKg = (g) => Math.round((Number(g) || 0) / 1000);
  const fmtPct = (x) => Math.round((Number(x) || 0) * 100);

  // --- Défi 1 : Réduire CO₂ de 10% (comparaison dernier mois vs précédent) ---
  let reduceStatus = "en_cours";
  let reduceProgress = 0;
  let reduceMsg = "Historique insuffisant : il faut au moins 2 mois de données.";

  if (hasAtLeast2Months && prev && Number(prev.total_co2_g) > 0) {
    const lastG = Number(last?.total_co2_g) || 0;
    const prevG = Number(prev.total_co2_g) || 0;

    const achievedReduction = Math.max(0, (prevG - lastG) / prevG); // 0..1
    const target = 0.10;

    reduceProgress = Math.min(100, Math.round((achievedReduction / target) * 100));

    if (achievedReduction >= target) {
      reduceStatus = "reussi";
      reduceMsg = `Bravo ! -${fmtPct(achievedReduction)}% vs ${prev.period} (objectif : -10%).`;
    } else if (lastG > prevG) {
      reduceStatus = "en_cours";
      reduceProgress = 0;
      reduceMsg = `CO₂ en hausse : ${fmtKg(lastG)} kg vs ${fmtKg(prevG)} kg (${prev.period}). Objectif : -10%.`;
    } else {
      reduceStatus = "en_cours";
      reduceMsg = `Réduction actuelle : -${fmtPct(achievedReduction)}% (objectif : -10%). Continue.`;
    }
  }

  // --- Défi 2 : Une semaine 100% locale (donnée indisponible pour l’instant) ---
  // Respect contrainte : pas de spÃ©culation, donc on affiche "Ã  venir".
  const localStatus = "non_atteint";
  const localProgress = 0;
  const localMsg = "Ã€ venir : lâ€™origine/label â€œlocalâ€ nâ€™est pas encore enregistrÃ© dans les donnÃ©es.";

  // --- Défi 3 : Réduire la distance totale (dernier mois vs précédent) ---
  // BasÃ© sur total_distance_km agrÃ©gÃ© (dÃ©jÃ  calculÃ© dans agg).
  let distStatus = "en_cours";
  let distProgress = 0;
  let distMsg = "Historique insuffisant : il faut au moins 2 mois de données.";

  if (hasAtLeast2Months) {
    const lastPoint = agg.seriesMonth[agg.seriesMonth.length - 1];
    const prevPoint = agg.seriesMonth[agg.seriesMonth.length - 2];

    const lastKm = Number(lastPoint?.total_distance_km) || 0;
    const prevKm = Number(prevPoint?.total_distance_km) || 0;

    if (prevKm > 0) {
      const achieved = Math.max(0, (prevKm - lastKm) / prevKm); // 0..1
      // objectif MVP : -10% comme règle générique (pas d’objectif absolu en km)
      const target = 0.10;

      distProgress = Math.min(100, Math.round((achieved / target) * 100));

      if (achieved >= target) {
        distStatus = "reussi";
        distMsg = `Bravo ! Distance en baisse de ${fmtPct(achieved)}% vs ${prevPoint.period}.`;
      } else if (lastKm > prevKm) {
        distStatus = "en_cours";
        distProgress = 0;
        distMsg = `Distance en hausse : ${Math.round(lastKm)} km vs ${Math.round(prevKm)} km (${prevPoint.period}).`;
      } else {
        distStatus = "en_cours";
        distMsg = `Baisse actuelle : ${fmtPct(achieved)}% (objectif : 10%).`;
      }
    } else {
      // cas où prevKm=0 : on ne peut pas calculer un % fiable
      distStatus = "en_cours";
      distProgress = 0;
      distMsg = `Distance dernier mois : ${Math.round(lastKm)} km (base précédente nulle).`;
    }
  }

  // Si aucune donnée d’agrégation exploitable, fallback sur challenges statiques
  if (!monthSeries.length) return PERSONAL_CHALLENGES_MVP;

  return [
    {
      id: "reduce_10_percent_30_days",
      icon: "Co²",
      name: "Réduire ton CO₂ de 10 % (dernier mois vs précédent)",
      status: reduceStatus,
      progressPct: reduceProgress,
      message: reduceMsg
    },
    {
      id: "local_week",
      icon: "🏆",
      name: "Une semaine 100 % locale (Ã  venir)",
      status: localStatus,
      progressPct: localProgress,
      message: localMsg
    },
    {
      id: "short_distance_month",
      icon: "🚲",
      name: "Réduire la distance totale (dernier mois vs précédent)",
      status: distStatus,
      progressPct: distProgress,
      message: distMsg
    }
  ];
}


// 2) Helpers d'affichage
function getChallengeStatusMeta(status) {
  switch (status) {
    case "reussi":
      return { label: "Réussi", className: "status-reussi" };
    case "non_atteint":
      return { label: "Non atteint", className: "status-non-atteint" };
    case "en_cours":
    default:
      return { label: "En cours", className: "status-en-cours" };
  }
}

function createCo2ChallengeCard(challenge) {
  const card = document.createElement("div");
  card.className = "co2-challenge-card";

  const meta = getChallengeStatusMeta(challenge.status);
  const progress = Math.max(0, Math.min(challenge.progressPct || 0, 100));

  card.innerHTML = `
    <div class="co2-challenge-header">
      <span class="co2-challenge-icon">${challenge.icon || "🆙"}</span>
      <span class="co2-challenge-name">
        ${challenge.name || "Défi CO₂"}
      </span>
    </div>

    <div class="co2-challenge-status ${meta.className}">
      ${meta.label}
    </div>

    <div class="co2-challenge-progress">
      <div class="co2-challenge-progress-bar">
        <div class="co2-challenge-progress-fill" style="width: ${progress}%;"></div>
      </div>
      <span class="co2-challenge-progress-label">${progress.toFixed(0)}&nbsp;%</span>
    </div>

    <p class="co2-challenge-message">
      ${challenge.message || ""}
    </p>
  `;

  return card;
}

// 3) Rendu de la liste dans #co2-challenges-list
function renderCo2ChallengesList(challenges) {
  const $list = document.getElementById("co2-challenges-list");
  if (!$list) {
    console.warn("[Défis CO2] Élément #co2-challenges-list introuvable.");
    return;
  }

  $list.innerHTML = "";

  if (!challenges || !challenges.length) {
    $list.innerHTML = `
      <div class="co2-challenge-empty">
        Aucun défi actif pour le moment. Active ton premier défi pour suivre ta progression.
      </div>
    `;
    return;
  }

challenges.forEach((c) => {
  try {
    $list.appendChild(createCo2ChallengeCard(c));
    renderedCount++;
  } catch (err) {
    console.error("[Défis CO2] Erreur rendu carte défi:", err, c);
  }
});

if (renderedCount === 0) {
  $list.innerHTML = `
    <div class="co2-challenge-empty">
      Impossible d’afficher les défis (erreur front). Recharge la page.
    </div>
  `;
}

  challenges.forEach((c) => {
    const card = createCo2ChallengeCard(c);
    $list.appendChild(card);
  });
}

// 4) Initialisation + protection du bouton contre les autres scripts
function setupCo2ChallengesMvp() {
  console.log("[Défis CO2][MVP] initialisation");

  const $btnRefresh = document.getElementById("co2-challenges-refresh");
  if ($btnRefresh) {
    // On capte le clic AVANT les autres gestionnaires éventuels
    $btnRefresh.addEventListener("click", (evt) => {
      evt.preventDefault();
      // On bloque la propagation pour éviter que d'autres scripts effacent la liste
      evt.stopPropagation();
      if (typeof evt.stopImmediatePropagation === "function") {
        evt.stopImmediatePropagation();
      }

      console.log("[Défis CO2][MVP] clic sur refresh");
      renderCo2ChallengesList(buildChallengesFromAgg(window.__honouaSuiviAgg, window.__honouaSuiviTrend));
    }, true); // <-- capture = true : notre handler passe en premier
  }

  // Premier rendu
  renderCo2ChallengesList(buildChallengesFromAgg(window.__honouaSuiviAgg, window.__honouaSuiviTrend));
}

// 5) On attend que tout soit chargé, puis on force quelques re-rendus
window.addEventListener("load", () => {
  setupCo2ChallengesMvp();

  // Si un autre script touche Ã  la liste aprÃ¨s coup, on repasse derriÃ¨re
  setTimeout(() => {
    console.log("[Défis CO2][MVP] re-render +1000ms");
    renderCo2ChallengesList(buildChallengesFromAgg(window.__honouaSuiviAgg, window.__honouaSuiviTrend));
  }, 1000);

  setTimeout(() => {
    console.log("[Défis CO2][MVP] re-render +3000ms");
    renderCo2ChallengesList(buildChallengesFromAgg(window.__honouaSuiviAgg, window.__honouaSuiviTrend));
  }, 3000);
});

// =========================
// SAFE: Honoua cart history writer (no-crash guard)
// =========================
(function () {
  if (window.__HONOUA_APPEND_CART_HISTORY__) return;

  window.__HONOUA_APPEND_CART_HISTORY__ = function (payload) {
    try {
      const key = "honoua_cart_history_v1";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");

      const co2Kg = Number(payload?.co2Kg) || 0;
      const distanceKm = Number(payload?.distanceKm) || 0;
      const itemsCount = Number(payload?.itemsCount) || 0;

      arr.push({
        timestamp: Date.now(),
        co2_kg: co2Kg,
        distance_km: distanceKm,
        items_count: itemsCount,
      });

      localStorage.setItem(key, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn("[Honoua] history write skipped:", e);
      return false;
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('[Scanner] getUserMedia indisponible');
    // si tu as une fonction d’erreur existante :
    // showScannerError("Votre navigateur ne supporte pas l'accÃ¨s Ã  la camÃ©ra.", true);
    return;
  }

  const isSecure =
    location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';

  if (!isSecure) {
    console.warn('[Scanner] Contexte non sécurisé (HTTPS requis hors localhost)');
  }
});

})();
