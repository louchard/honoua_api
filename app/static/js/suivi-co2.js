

// =========================
// SUIVI CO2 — DEMO DATA (SAFE, désactivable)
// =========================
(function () {
  const KEY = "honoua_cart_history_v1";
  const ENABLE_DEMO = true; // <- mets false dès que l’intégration ScanImpact écrit de vraies données

  if (!ENABLE_DEMO) return;
  if (localStorage.getItem(KEY)) return; // ne touche pas si déjà présent

  const now = Date.now();
  const days = (n) => n * 24 * 60 * 60 * 1000;

  const demo = [
    { timestamp: now - days(2),  co2_kg: 4.2, distance_km: 3.1, items_count: 6 },
    { timestamp: now - days(6),  co2_kg: 6.8, distance_km: 12.4, items_count: 9 },
    { timestamp: now - days(12), co2_kg: 3.5, distance_km: 5.2, items_count: 4 },
    { timestamp: now - days(20), co2_kg: 7.9, distance_km: 18.0, items_count: 11 },
    { timestamp: now - days(33), co2_kg: 5.1, distance_km: 7.8, items_count: 7 },
    { timestamp: now - days(47), co2_kg: 8.6, distance_km: 22.3, items_count: 13 },
  ];

  localStorage.setItem(KEY, JSON.stringify(demo));
  console.log("[Suivi CO2] Demo history injected:", demo.length, "items");
})();


// ============================================================================
// CONFIGURATION GLOBALE
// ============================================================================

// Budget du GIEC : 2 tCO₂/an/personne → 2000 kg
const BUDGET_PER_PERSON_KG_LOCAL = 2000;

// Clé de stockage local pour la taille du foyer
const HOUSEHOLD_STORAGE_KEY = "honoua_foyer_size";
let currentHouseholdSize = 1; // valeur par défaut


// Petite fonction locale au cas où formatNumberFr n'est pas défini globalement
function formatNumberLocal(num, decimals = 0) {
  if (typeof window.formatNumberFr === "function") {
    return window.formatNumberFr(num, decimals);
  }

  return Number(num || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function normalizeHistoryResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.value)) return raw.value;
  return [];
}

// ============================
// Gestion de la taille du foyer (formulaire)
// ============================
// ============================
// Gestion de la taille du foyer (formulaire)
// ============================
function loadHouseholdSizeFromStorage() {
  try {
    const raw = localStorage.getItem(HOUSEHOLD_STORAGE_KEY);
    const n = parseInt(raw, 10);
    if (n && n > 0 && n <= 10) {
      currentHouseholdSize = n;
    } else {
      currentHouseholdSize = 1;
    }
  } catch (e) {
    console.warn("[Suivi CO₂] Impossible de lire la taille du foyer", e);
    currentHouseholdSize = 1;
  }
}

function syncHouseholdForm() {
  const input = document.getElementById("household-size-input");
  if (!input) return;
  input.value = String(currentHouseholdSize);
}

function setHouseholdSize(n) {
  let value = parseInt(n, 10);
  if (isNaN(value) || value < 1) value = 1;
  if (value > 10) value = 10;

  currentHouseholdSize = value;

  try {
    localStorage.setItem(HOUSEHOLD_STORAGE_KEY, String(currentHouseholdSize));
  } catch (e) {
    console.warn("[Suivi CO₂] Impossible d'enregistrer la taille du foyer", e);
  }

  syncHouseholdForm();
  refreshBudget();
}

function setupHouseholdForm() {
  const input = document.getElementById("household-size-input");
  const btn = document.getElementById("household-size-save");

  if (!input || !btn) {
    console.warn("[Suivi CO₂] Formulaire foyer introuvable dans le DOM");
    return;
  }

  btn.addEventListener("click", () => {
    setHouseholdSize(input.value);
  });

  input.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      setHouseholdSize(input.value);
    }
  });

  syncHouseholdForm();
}


function setupHouseholdForm() {
  const input = document.getElementById("household-size-input");
  const btn = document.getElementById("household-size-save");

  if (!input || !btn) {
    console.warn("[Suivi CO₂] Formulaire foyer introuvable dans le DOM");
    return;
  }

  // Quand on clique sur "Mettre à jour"
  btn.addEventListener("click", () => {
    setHouseholdSize(input.value);
  });

  // Option : Enter dans l'input déclenche aussi la mise à jour
  input.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      setHouseholdSize(input.value);
    }
  });

  // Synchronise la valeur affichée au démarrage
  syncHouseholdForm();
}



// ============================================================================
// BLOC 1 — BUDGET ANNUEL
// ============================================================================

function computeBudgetStateFromHistory(items) {
  const currentYear = new Date().getFullYear();
  let totalCo2GYear = 0;

  (items || []).forEach((item) => {
    if (!item) return;

    let itemYear = null;

    // created_at → fiable
    if (item.created_at) {
      const d = new Date(item.created_at);
      if (!isNaN(d)) itemYear = d.getFullYear();
    }

    // fallback : period_label → "2025-12"
    if (!itemYear && item.period_label) {
      const yStr = String(item.period_label).slice(0, 4);
      const yNum = parseInt(yStr, 10);
      if (!isNaN(yNum)) itemYear = yNum;
    }

    if (itemYear === currentYear) {
      totalCo2GYear += Number(item.total_co2_g) || 0;
    }
  });

    const co2AnnualKg = totalCo2GYear / 1000;
  const budgetAnnualKg = BUDGET_PER_PERSON_KG * (currentHouseholdSize || 1);

  let percentUsed = (co2AnnualKg / budgetAnnualKg) * 100;
  if (!isFinite(percentUsed) || percentUsed < 0) percentUsed = 0;
  if (percentUsed > 300) percentUsed = 300;


  const percentRemaining = Math.max(0, 100 - percentUsed);
  const budgetRemainingKg = Math.max(0, budgetAnnualKg - co2AnnualKg);

  let statusKey = "ok";
  if (percentUsed > 100) statusKey = "over";
  else if (percentUsed > 80) statusKey = "warning";

  let statusLabel = {
    ok: "Budget maîtrisé",
    warning: "Budget à surveiller",
    over: "Budget dépassé",
  }[statusKey];

  let statusLevel = {
    ok: "green",
    warning: "orange",
    over: "red",
  }[statusKey];

  return {
    currentYear,
    budgetAnnualKg,
    co2AnnualKg,
    percentUsed,
    percentRemaining,
    budgetRemainingKg,
    statusKey,
    statusLabel,
    statusLevel,
  };
}

function renderBudgetFromState(state) {
  if (!state) return;

  const $total = document.getElementById("budget-total");
  const $co2 = document.getElementById("co2-consomme");
  const $used = document.getElementById("budget-used");
  const $left = document.getElementById("budget-left");
  const $bar = document.getElementById("budget-progress-bar");
  const $status = document.getElementById("budget-status");

  $total.textContent = formatNumberLocal(state.budgetAnnualKg) + " kg";
  $co2.textContent = formatNumberLocal(state.co2AnnualKg) + " kg";
  $used.textContent = formatNumberLocal(state.percentUsed, 1) + " %";
  $left.textContent =
    formatNumberLocal(state.budgetRemainingKg) +
    " kg (" +
    formatNumberLocal(state.percentRemaining, 1) +
    " %)";

  // Couleur barre
  const barWidth = Math.min(state.percentUsed, 100);
  $bar.style.width = barWidth + "%";

  let color = "#062909"; // vert
  if (state.statusLevel === "orange") color = "#F5C147";
  if (state.statusLevel === "red") color = "#C62828";
  $bar.style.backgroundColor = color;

  // Statut
  $status.textContent =
    `${state.statusLabel} — ${formatNumberLocal(state.percentUsed, 1)} % du budget utilisé en ${state.currentYear}`;
  $status.className = "suivi-budget-status status-" + state.statusLevel;
}

// Base API (évite les fetch relatifs sur app.honoua.com)
    function getApiBase() {
      return (window.HONOUA_API_BASE || "https://api.honoua.com").replace(/\/$/, "");
    }

    // Endpoint historique (centralisé)
    function cartHistoryUrl(limit) {
      return `${getApiBase()}/api/cart/history?limit=${encodeURIComponent(limit)}`;
    }


async function refreshBudget() {
  if (__SUIVI_CO2_HISTORY_DISABLED) return;

  try {
    const res = await fetch(cartHistoryUrl(200), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Erreur HTTP: " + res.status);

    const raw = await res.json();
    const items = normalizeHistoryResponse(raw);
    const state = computeBudgetStateFromHistory(items);
    renderBudgetFromState(state);
  } catch (err) {
    console.error("[Suivi CO₂] Erreur budget :", err);
  }
}

// ============================================================================
// BLOC 2 — ÉVOLUTION (GRAPHIQUE)
// ============================================================================

function formatPeriodLabel(type, label) {
  if (type === "month") {
    const [year, m] = label.split("-");
    const names = [
      "Jan.", "Fév.", "Mars", "Avr.",
      "Mai", "Juin", "Juil.", "Août",
      "Sept.", "Oct.", "Nov.", "Déc.",
    ];
    const idx = parseInt(m, 10) - 1;
    return names[idx] + " " + year;
  }
  if (type === "week") {
    const [y, w] = label.split("-W");
    return `Sem. ${w} (${y})`;
  }
  return label;
}

function buildEvolutionSeries(items, type) {
  const filtered = items.filter((i) => i.period_type === type);

  const arr = filtered.map((i) => ({
    key: i.period_label,
    label: formatPeriodLabel(type, i.period_label),
    co2Kg: (Number(i.total_co2_g) || 0) / 1000,
    distanceKm: Number(i.total_distance_km) || 0,
  }));

  arr.sort((a, b) => a.key.localeCompare(b.key));
  return arr;
}

function pctChange(cur, prev) {
  if (!prev || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function evolutionSummary(series, type) {
  if (!series.length) return null;
  if (series.length === 1) {
    return {
      periodType: type,
      current: series[0],
      previous: null,
      co2ChangePct: null,
      distanceChangePct: null,
    };
  }

  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  return {
    periodType: type,
    current: last,
    previous: prev,
    co2ChangePct: pctChange(last.co2Kg, prev.co2Kg),
    distanceChangePct: pctChange(last.distanceKm, prev.distanceKm),
  };
}

function renderEvolutionSummary(s) {
  if (!s) return;

  document.getElementById("evo-current-period").textContent = s.current.label;
  document.getElementById("evo-current-co2").textContent =
    formatNumberLocal(s.current.co2Kg, 1) + " kg";
  document.getElementById("evo-current-distance").textContent =
    formatNumberLocal(s.current.distanceKm, 1) + " km";

  const fmt = (v) =>
    v === null ? "— %" : ((v > 0 ? "+" : "") + formatNumberLocal(v, 1) + " %");

  document.getElementById("evo-co2-change").textContent = fmt(s.co2ChangePct);
  document.getElementById("evo-distance-change").textContent =
    fmt(s.distanceChangePct);
}

function drawEvolutionChart(series) {
  const canvas = document.getElementById("evo-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!series.length) {
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Pas assez de données", canvas.width / 2, canvas.height / 2);
    return;
  }

  let maxCo2 = Math.max(...series.map((p) => p.co2Kg), 1);

  const margin = { top: 10, left: 30, right: 10, bottom: 26 };
  const w = canvas.width - margin.left - margin.right;
  const h = canvas.height - margin.top - margin.bottom;

  // Axes
  ctx.strokeStyle = "#ccc";
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + h);
  ctx.lineTo(margin.left + w, margin.top + h);
  ctx.stroke();

  // Ligne CO₂
  ctx.strokeStyle = "#062909";
  ctx.lineWidth = 2;
  ctx.beginPath();

  const stepX = w / Math.max(series.length - 1, 1);

  series.forEach((p, i) => {
    const x = margin.left + stepX * i;
    const y = margin.top + h - (p.co2Kg / maxCo2) * h;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points
  ctx.fillStyle = "#062909";
  series.forEach((p, i) => {
    const x = margin.left + stepX * i;
    const y = margin.top + h - (p.co2Kg / maxCo2) * h;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Période courante
let currentPeriod = "month";

async function refreshEvolution(type = "month") {
  currentPeriod = type;

  if (__SUIVI_CO2_HISTORY_DISABLED) return;

  try {
    const resp = await fetch(cartHistoryUrl(200), { headers: { Accept: "application/json" } });
    if (!resp.ok) return;

    const raw = await resp.json();
    const items = normalizeHistoryResponse(raw);

    const series = buildEvolutionSeries(items, type);
    const summary = evolutionSummary(series, type);

    renderEvolutionSummary(summary);
    drawEvolutionChart(series);
  } catch (err) {
    console.error("[Evolution] Erreur :", err);
  }
}

function setupPeriodToggle() {
  const btnM = document.getElementById("evo-period-month");
  const btnW = document.getElementById("evo-period-week");

  btnM.addEventListener("click", () => {
    btnM.classList.add("evo-period-btn-active");
    btnW.classList.remove("evo-period-btn-active");
    refreshEvolution("month");
  });

  btnW.addEventListener("click", () => {
    btnW.classList.add("evo-period-btn-active");
    btnM.classList.remove("evo-period-btn-active");
    refreshEvolution("week");
  });

  // --- DEBUG + Toggle métrique (CO2 / Distance)
const btnCo2 = document.getElementById("evo-metric-co2");
const btnDist = document.getElementById("evo-metric-distance");

console.log("[EVO] btnCo2:", !!btnCo2, "btnDist:", !!btnDist);

function setMetricActive(metric) {
  window.__HONOUA_EVO_METRIC__ = metric;
  if (btnCo2) btnCo2.classList.toggle("evo-metric-btn-active", metric === "co2");
  if (btnDist) btnDist.classList.toggle("evo-metric-btn-active", metric === "distance");
}

// défaut
setMetricActive("co2");

if (btnCo2) btnCo2.addEventListener("click", () => {
  console.log("[EVO] metric -> co2");
  setMetricActive("co2");
  renderEvolution(mode);
});

if (btnDist) btnDist.addEventListener("click", () => {
  console.log("[EVO] metric -> distance");
  setMetricActive("distance");
  renderEvolution(mode);
});

}

// ============================================================================
// BLOC 3 — HISTORIQUE PANIER
// ============================================================================

  let historySortMode = "co2"; // "co2" | "distance"
  let lastHistoryRaw = [];     // cache pour re-render sans refetch
  // L’endpoint /api/cart/history n’est pas encore disponible côté API.
  // On désactive le suivi CO₂ côté front pour éviter les 404 et le spam console.
  // À remettre à false quand l’API Railway sera prête.
  let __SUIVI_CO2_HISTORY_DISABLED = true;


async function loadCo2History(limit = 5) {
  const $list = document.getElementById("co2-cart-history-list");
  if (!$list) return;

   // Si l’endpoint n’existe pas (404), on stoppe les refetch suivants.
  if (__SUIVI_CO2_HISTORY_DISABLED) {
    $list.innerHTML =
      `<p class="co2-cart-history-empty">Historique indisponible pour le moment.</p>`;
    return;
  }

  try {
    const base = (window.HONOUA_API_BASE || "https://api.honoua.com");
    const url = `${base}/api/cart/history?limit=${limit}`;

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!res.ok) {
      if (res.status === 404) {
        __SUIVI_CO2_HISTORY_DISABLED = true;
        console.info("[Suivi CO2] /api/cart/history indisponible (404) -> historique désactivé côté front.");
        $list.innerHTML =
          `<p class="co2-cart-history-empty">Historique indisponible pour le moment.</p>`;
        return;
      }
      console.warn("[Suivi CO2] Erreur HTTP /api/cart/history :", res.status);
      $list.innerHTML =
        `<p class="co2-cart-history-empty">Impossible de charger les données</p>`;
      return;
    }

    const raw = await res.json();
    const hist = normalizeHistoryResponse(raw);
    lastHistoryRaw = Array.isArray(hist) ? hist.slice() : [];



    $list.innerHTML = "";

    if (!hist.length) {
      $list.innerHTML =
        `<p class="co2-cart-history-empty">Aucun panier enregistré.</p>`;
      return;
    }

const sorted = (lastHistoryRaw || []).slice();

sorted.sort((a, b) => {
  if (historySortMode === "distance") {
    return (Number(b.total_distance_km) || 0) - (Number(a.total_distance_km) || 0);
  }
  // mode "co2"
  return (Number(b.total_co2_g) || 0) - (Number(a.total_co2_g) || 0);
});

sorted.forEach((item) => {
  // ... votre code existant (co2Kg, distance, card.innerHTML, appendChild)
});

  } catch (err) {
    console.error("[Historique] Erreur :", err);
    $list.innerHTML =
      `<p class="co2-cart-history-empty">Impossible de charger les données</p>`;
  }
}

// ============================================================================
// BLOC 4 — DÉFIS CO₂ (MVP PERSO)
// ============================================================================

const PERSONAL_CHALLENGES = [
  {
    id: "reduce_10",
    icon: "🏆",
    name: "Réduire ton CO₂ de 10 %",
    status: "en_cours",
    progressPct: 63,
    message: "Tu as réduit ton CO₂ de 7 %, objectif : 10 %.",
  },
  {
    id: "local_week",
    icon: "🌍",
    name: "Une semaine 100 % locale",
    status: "en_cours",
    progressPct: 40,
    message: "40 % de tes produits sont déjà locaux.",
  },
  {
    id: "short_distance",
    icon: "🚲",
    name: "Limiter la distance moyenne",
    status: "reussi",
    progressPct: 100,
    message: "Objectif atteint ce mois-ci !",
  },
];

function getChallengeStatusMeta(status) {
  switch (status) {
    case "reussi":
      return { label: "Réussi", className: "status-reussi" };
    case "non_atteint":
      return { label: "Non atteint", className: "status-non-atteint" };
    default:
      return { label: "En cours", className: "status-en-cours" };
  }
}

function createChallengeCard(ch) {
  const card = document.createElement("div");
  card.className = "co2-challenge-card";
  const meta = getChallengeStatusMeta(ch.status);

  card.innerHTML = `
    <div class="co2-challenge-header">
      <span class="co2-challenge-icon">${ch.icon}</span>
      <span class="co2-challenge-name">${ch.name}</span>
    </div>

    <div class="co2-challenge-status ${meta.className}">
      ${meta.label}
    </div>

    <div class="co2-challenge-progress">
      <div class="co2-challenge-progress-bar">
        <div class="co2-challenge-progress-fill" style="width:${ch.progressPct}%"></div>
      </div>
      <span class="co2-challenge-progress-label">${ch.progressPct}%</span>
    </div>

    <p class="co2-challenge-message">${ch.message}</p>
  `;

  return card;
}

function renderChallenges(list) {
  const $list = document.getElementById("co2-challenges-list");
  if (!$list) return;

  $list.innerHTML = "";
  list.forEach((ch) => $list.appendChild(createChallengeCard(ch)));
}

function setupChallenges() {
  const $btn = document.getElementById("co2-challenges-refresh");

  if ($btn) {
    $btn.addEventListener(
      "click",
      (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation?.();

        renderChallenges(PERSONAL_CHALLENGES);
      },
      true
    );
  }

  // Premier affichage
  renderChallenges(PERSONAL_CHALLENGES);
}

// ============================================================================
// INITIALISATION GLOBALE
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  // 1) Charger la taille du foyer depuis le localStorage
  loadHouseholdSizeFromStorage();

  // 2) Brancher le formulaire (input + bouton "Mettre à jour")
  setupHouseholdForm();

  // 3) Puis lancer le reste du Suivi CO₂
  refreshEvolution("month");
  setupHistorySort();
  loadCo2History();
  setupChallenges();

});

function setupHistorySort() {
  const btnCo2 = document.getElementById("history-sort-co2");
  const btnDist = document.getElementById("history-sort-distance");

  if (!btnCo2 || !btnDist) {
    console.warn("[Historique] Boutons de tri introuvables (IDs attendus: history-sort-co2 / history-sort-distance)");
    return;
  }

  const applyUi = () => {
    btnCo2.classList.toggle("eco-sort-btn-active", historySortMode === "co2");
    btnDist.classList.toggle("eco-sort-btn-active", historySortMode === "distance");
  };

  btnCo2.addEventListener("click", (e) => {
    e.preventDefault();
    historySortMode = "co2";
    applyUi();

    // re-render sans refetch si possible
    if (lastHistoryRaw && lastHistoryRaw.length) {
      const limit = Math.min(lastHistoryRaw.length, 5);
      // on reconstruit le DOM via un appel “normal”
      loadCo2History(limit);
    } else {
      loadCo2History();
    }
  });

  btnDist.addEventListener("click", (e) => {
    e.preventDefault();
    historySortMode = "distance";
    applyUi();

    if (lastHistoryRaw && lastHistoryRaw.length) {
      const limit = Math.min(lastHistoryRaw.length, 5);
      loadCo2History(limit);
    } else {
      loadCo2History();
    }
  });

  applyUi();
}


/* =========================
   Suivi CO2 — Nav interne active
   ========================= */
(function () {
  function initSuiviCo2NavActive() {
    const nav = document.getElementById("suivi-co2-nav");
    if (!nav) return;

    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;

    // Map: sectionId -> link
    const sectionToLink = new Map();
    const sections = [];

    for (const link of links) {
      const hash = link.getAttribute("href");
      if (!hash || hash.length < 2) continue;

      const id = hash.slice(1);
      const sectionEl = document.getElementById(id);
      if (!sectionEl) continue;

      sectionToLink.set(id, link);
      sections.push(sectionEl);

      // Click: feedback immédiat (même si IO non supporté)
      link.addEventListener("click", () => setActiveLink(id));
    }

    function setActiveLink(activeId) {
      for (const l of links) l.classList.remove("is-active");
      const activeLink = sectionToLink.get(activeId);
      if (activeLink) activeLink.classList.add("is-active");
    }

    // Défaut: première section existante
    if (sections[0]) setActiveLink(sections[0].id);

    // IntersectionObserver (léger, moderne)
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          // on prend la section la plus visible parmi les entries
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];

          if (visible && visible.target && visible.target.id) {
            setActiveLink(visible.target.id);
          }
        },
        {
          // Ajuste la “zone active” : on considère active quand le haut de la section passe dans la zone
          root: null,
          rootMargin: "-30% 0px -55% 0px",
          threshold: [0.01, 0.1, 0.25, 0.4, 0.6],
        }
      );

      sections.forEach((s) => io.observe(s));
    } else {
      // Fallback ultra simple (si vieux navigateur)
      window.addEventListener("scroll", () => {
        let best = null;
        let bestTop = -Infinity;

        for (const s of sections) {
          const rect = s.getBoundingClientRect();
          if (rect.top <= 120 && rect.top > bestTop) {
            bestTop = rect.top;
            best = s;
          }
        }
        if (best) setActiveLink(best.id);
      }, { passive: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSuiviCo2NavActive);
  } else {
    initSuiviCo2NavActive();
  }
})();

/* =========================
   SUIVI CO2 — BLOC 1 : Budget annuel (MVP)
   - budget = 2000 kg CO2 / personne / an
   - conso = somme des paniers depuis le 1er janvier (si historique trouvé)
   ========================= */
(function () {
  const YEARLY_BUDGET_KG_PER_PERSON = 2000;

  const STORAGE_KEYS = {
    householdSize: "honoua_household_size",
    // On tente plusieurs clés possibles pour l'historique (robuste)
    cartHistoryCandidates: [
      "honoua_cart_history_v1",
      "co2_cart_history",
      "honoua_cart_history",
      "cart_history",
      "scanimpact_cart_history",
    ],
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeNumber(x, fallback = 0) {
    const n = typeof x === "string" ? parseFloat(x.replace(",", ".")) : Number(x);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatKg(n) {
    const v = Math.round(n);
    return `${v.toLocaleString("fr-FR")} kg`;
  }

  function formatPct(n) {
    const v = Math.round(n);
    return `${v.toLocaleString("fr-FR")} %`;
  }

  function startOfYearTs() {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
  }

  function parseCartTimestamp(cart) {
    const raw =
      cart?.timestamp ??
      cart?.ts ??
      cart?.date ??
      cart?.createdAt ??
      cart?.created_at;

    if (raw == null) return null;

    // number (ms or s)
    if (typeof raw === "number") {
      return raw < 2e10 ? raw * 1000 : raw; // si secondes -> ms
    }

    // string date
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }

  function parseCartCo2Kg(cart) {
  // Format Honoua actuel : { ts, items, totals: { total_co2_g, total_co2_text, ... } }
  const g =
    cart?.totals?.total_co2_g ??
    cart?.totals?.totalCo2G ??
    cart?.total_co2_g ??
    cart?.totalCo2G ??
    null;

  if (g != null) return safeNumber(g, 0) / 1000;

  const kg =
    cart?.totals?.total_co2_kg ??
    cart?.totals?.totalCo2Kg ??
    cart?.total_co2_kg ??
    cart?.totalCo2Kg ??
    cart?.co2_kg ??
    cart?.co2Kg ??
    cart?.totalCo2Kg ??
    cart?.co2TotalKg ??
    cart?.co2_total_kg ??
    cart?.total_co2_kg ??
    cart?.totalCo2 ??
    cart?.co2 ??
    null;

  if (kg != null) return safeNumber(kg, 0);

  // Fallback : tenter de parser "≈ 4,20 kg CO₂e" depuis total_co2_text
  const t =
    cart?.totals?.total_co2_text ??
    cart?.totals?.totalCo2Text ??
    cart?.total_co2_text ??
    "";

  if (typeof t === "string") {
    const m = t.match(/([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
    if (m) return safeNumber(m[1], 0);
  }

  return 0;
}


  function readCartHistory() {
    for (const k of STORAGE_KEYS.cartHistoryCandidates) {
      const s = localStorage.getItem(k);
      if (!s) continue;
      try {
        const data = JSON.parse(s);
        if (Array.isArray(data)) return data;
        // parfois emballé
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.history)) return data.history;
      } catch (_) {
        // ignore
      }
    }
    return [];
  }

  function computeConsumedKgThisYear() {
    const history = readCartHistory();
    const minTs = startOfYearTs();
    let total = 0;

    for (const cart of history) {
      const ts = parseCartTimestamp(cart);
      if (ts != null && ts < minTs) continue;
      total += parseCartCo2Kg(cart);
    }
    return total;
  }

  function setStatus(el, level, text) {
    el.classList.remove("status-green", "status-orange", "status-red");
    el.classList.add(level);
    el.textContent = text;
  }

  function renderBudget() {
    const input = $("household-size-input");
    const btn = $("household-size-save");

    const elBudgetTotal = $("budget-total");
    const elConsumed = $("co2-consomme");
    const elUsed = $("budget-used");
    const elLeft = $("budget-left");
    const elBar = $("budget-progress-bar");
    const elStatus = $("budget-status");

    if (!input || !btn || !elBudgetTotal || !elConsumed || !elUsed || !elLeft || !elBar || !elStatus) {
      console.warn("[Suivi CO2] Bloc Budget: éléments DOM manquants.");
      return;
    }

    // 1) foyer
    const savedSize = safeNumber(localStorage.getItem(STORAGE_KEYS.householdSize), 1);
    const householdSize = Math.min(Math.max(savedSize, 1), 10);
    input.value = String(householdSize);

    // 2) budget
    const budgetTotalKg = householdSize * YEARLY_BUDGET_KG_PER_PERSON;

    // 3) conso
    const consumedKg = computeConsumedKgThisYear();

    const usedRatio = budgetTotalKg > 0 ? consumedKg / budgetTotalKg : 0;
    const usedPct = Math.max(0, Math.min(usedRatio * 100, 999));
    const leftKg = Math.max(0, budgetTotalKg - consumedKg);
    const leftPct = Math.max(0, 100 - usedPct);

    // 4) rendu
    elBudgetTotal.textContent = formatKg(budgetTotalKg);
    elConsumed.textContent = formatKg(consumedKg);
    elUsed.textContent = formatPct(usedPct);
    elLeft.textContent = `${formatKg(leftKg)} (${Math.round(leftPct)} %)`;

    elBar.style.width = `${Math.min(100, usedPct)}%`;

    // 5) statut
    if (usedPct < 50) {
      setStatus(elStatus, "status-green", "Trajectoire maîtrisée : vous êtes largement sous le budget annuel.");
      elBar.style.backgroundColor = "var(--green)";
    } else if (usedPct < 80) {
      setStatus(elStatus, "status-orange", "Zone de vigilance : vous consommez une part importante de votre budget annuel.");
      elBar.style.backgroundColor = "#E65100";
    } else {
      setStatus(elStatus, "status-red", "Alerte : budget annuel presque consommé. Prioriser les actions de réduction.");
      elBar.style.backgroundColor = "#7A1A1A";
    }

    // 6) sauvegarde foyer
    btn.addEventListener("click", () => {
      const v = safeNumber(input.value, householdSize);
      const clamped = Math.min(Math.max(Math.round(v), 1), 10);
      localStorage.setItem(STORAGE_KEYS.householdSize, String(clamped));
      // re-render immédiat
      renderBudget();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBudget);
  } else {
    renderBudget();
  }
})();

/* =========================
   SUIVI CO2 — BLOC 3 : Historique paniers (MVP)
   ========================= */
(function () {
  const STORAGE_KEYS = {
    cartHistoryCandidates: [
      "honoua_cart_history_v1",
      "co2_cart_history",
      "honoua_cart_history",
      "cart_history",
      "scanimpact_cart_history",
    ],
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeNumber(x, fallback = 0) {
    const n = typeof x === "string" ? parseFloat(x.replace(",", ".")) : Number(x);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatKg(n) {
    const v = Math.round(n);
    return `${v.toLocaleString("fr-FR")} kg`;
  }

  function formatKm(n) {
    const v = Math.round(n * 10) / 10; // 1 décimale max
    return `${v.toLocaleString("fr-FR")} km`;
  }

  function formatDate(ts) {
    try {
      return new Date(ts).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "2-digit" });
    } catch (_) {
      return "—";
    }
  }

  function parseCartTimestamp(cart) {
    const raw =
      cart?.timestamp ??
      cart?.ts ??
      cart?.date ??
      cart?.createdAt ??
      cart?.created_at;

    if (raw == null) return null;

    if (typeof raw === "number") {
      return raw < 2e10 ? raw * 1000 : raw; // secondes -> ms
    }

    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }

  function parseCartCo2Kg(cart) {
  // Format Honoua actuel : { ts, items, totals: { total_co2_g, total_co2_text, ... } }
  const g =
    cart?.totals?.total_co2_g ??
    cart?.totals?.totalCo2G ??
    cart?.total_co2_g ??
    cart?.totalCo2G ??
    null;

  if (g != null) return safeNumber(g, 0) / 1000;

  const kg =
    cart?.totals?.total_co2_kg ??
    cart?.totals?.totalCo2Kg ??
    cart?.total_co2_kg ??
    cart?.totalCo2Kg ??
    cart?.co2_kg ??
    cart?.co2Kg ??
    cart?.totalCo2Kg ??
    cart?.co2TotalKg ??
    cart?.co2_total_kg ??
    cart?.total_co2_kg ??
    cart?.totalCo2 ??
    cart?.co2 ??
    null;

  if (kg != null) return safeNumber(kg, 0);

  // Fallback : tenter de parser "≈ 4,20 kg CO₂e" depuis total_co2_text
  const t =
    cart?.totals?.total_co2_text ??
    cart?.totals?.totalCo2Text ??
    cart?.total_co2_text ??
    "";

  if (typeof t === "string") {
    const m = t.match(/([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
    if (m) return safeNumber(m[1], 0);
  }

  return 0;
}


  function parseCartDistanceKm(cart) {
  const raw =
    cart?.totals?.total_distance_km ??
    cart?.totals?.totalDistanceKm ??
    cart?.total_distance_km ??
    cart?.totalDistanceKm ??
    cart?.distance_km ??
    cart?.distanceKm ??
    cart?.totalDistanceKm ??
    cart?.distance_total_km ??
    cart?.distance ??
    cart?.km;

  return safeNumber(raw, 0);
}


  function parseCartItemsCount(cart) {
  const raw =
    cart?.totals?.distinct_products ??
    cart?.totals?.distinctProducts ??
    cart?.items_count ??
    cart?.itemsCount ??
    cart?.productsCount ??
    cart?.count ??
    (Array.isArray(cart?.items) ? cart.items.length : null) ??
    (Array.isArray(cart?.products) ? cart.products.length : null);

  const n = safeNumber(raw, 0);
  return Math.max(0, Math.round(n));
}



  function readCartHistory() {
    for (const k of STORAGE_KEYS.cartHistoryCandidates) {
      const s = localStorage.getItem(k);
      if (!s) continue;
      try {
        const data = JSON.parse(s);
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.history)) return data.history;
      } catch (_) {}
    }
    return [];
  }

  function renderHistory() {
    const listEl = $("co2-cart-history-list");
    if (!listEl) return;

    const history = readCartHistory()
      .map((cart) => {
        const ts = parseCartTimestamp(cart) ?? 0;
        return {
          raw: cart,
          ts,
          co2Kg: parseCartCo2Kg(cart),
          km: parseCartDistanceKm(cart),
          itemsCount: parseCartItemsCount(cart),
        };
      })
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));

    if (!history.length) {
      listEl.innerHTML = `
        <p class="co2-cart-history-empty">
          Aucun panier enregistré pour le moment.
        </p>
      `;
      return;
    }

    const maxItems = 20;
    const slice = history.slice(0, maxItems);

    listEl.innerHTML = slice
      .map((h, i) => {
        const dateLabel = h.ts ? formatDate(h.ts) : "—";
        const itemsLabel = h.itemsCount ? `${h.itemsCount} produit(s)` : "Panier";
        const kmHtml = h.km > 0 ? `<span class="co2-cart-history-meta">🚚 ${formatKm(h.km)}</span>` : "";
        return `
          <div class="co2-cart-history-item" data-idx="${i}">
            <div class="co2-cart-history-item__top">
              <div class="co2-cart-history-item__title">${itemsLabel}</div>
              <div class="co2-cart-history-item__date">${dateLabel}</div>
            </div>

            <div class="co2-cart-history-item__stats">
              <span class="co2-cart-history-meta">🌿 ${formatKg(h.co2Kg)}</span>
              ${kmHtml}
            </div>
          </div>
        `;
      })
      .join('');

// --- Historique : permettre le clic pour afficher un détail (délégation) ---
window.__honouaHistorySlice = slice;

      // --- Clic sur un panier -> affichage détail ---
const detailEl = document.getElementById("co2-cart-history-detail");
if (detailEl) {
  // On remplace les handlers à chaque rendu (pas de doublons)
  listEl.querySelectorAll('.co2-cart-history-item[data-idx]').forEach((el) => {
    el.onclick = () => {
      const idx = Number(el.getAttribute("data-idx"));
      if (!Number.isFinite(idx)) return;

      const h = slice[idx];
      if (!h) return;

      const raw = h.raw || h;
      const items =
        Array.isArray(raw.items) ? raw.items :
        (Array.isArray(raw.products) ? raw.products : []);

      const dateLabel = h.ts ? formatDate(h.ts) : "—";
      const kmTxt = (h.km > 0) ? ` — 🚚 ${formatKm(h.km)}` : "";

      const itemsHtml = items.slice(0, 30).map((it) => {
        const name = escapeHtml(String(it.product_name || it.name || "Produit"));
        const qty = (it.qty ?? it.quantity ?? 1);
        return `<li>${name} <span class="co2-muted">×${qty}</span></li>`;
      }).join('');

      detailEl.innerHTML = `
        <div class="co2-history-detail-card">
          <div class="co2-history-detail-title"><strong>Détail du panier</strong> — ${dateLabel}</div>
          <div class="co2-history-detail-meta">🌿 ${formatKg(h.co2Kg)}${kmTxt}</div>
          <div class="co2-history-detail-items">
            <strong>Produits</strong>
            <ul>${itemsHtml || "<li>Détail indisponible (format ancien)</li>"}</ul>
          </div>
        </div>
      `;

      detailEl.classList.remove("hidden");
    };
  });
}


    if (history.length > maxItems) {
      const more = history.length - maxItems;
      listEl.insertAdjacentHTML(
        "beforeend",
        `<p class="co2-cart-history-empty">… et ${more} panier(s) plus ancien(s).</p>`
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderHistory);
  } else {
    renderHistory();
  }
})();

/* =========================
   SUIVI CO2 — BLOC 2 : Evolution (Canvas léger, Mois / Semaines)
   ========================= */
(function () {
  const STORAGE_KEYS = {
    cartHistoryCandidates: [
      "honoua_cart_history_v1",
      "co2_cart_history",
      "honoua_cart_history",
      "cart_history",
      "scanimpact_cart_history",
    ],
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeNumber(x, fallback = 0) {
    const n = typeof x === "string" ? parseFloat(x.replace(",", ".")) : Number(x);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatKg(n) {
    const v = Math.round(n);
    return `${v.toLocaleString("fr-FR")} kg`;
  }

  function formatKm(n) {
    const v = Math.round(n * 10) / 10;
    return `${v.toLocaleString("fr-FR")} km`;
  }

  function formatPctSigned(p) {
    if (!Number.isFinite(p)) return "— %";
    const v = Math.round(p);
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toLocaleString("fr-FR")} %`;
  }

  function parseCartTimestamp(cart) {
    const raw =
      cart?.timestamp ??
      cart?.ts ??
      cart?.date ??
      cart?.createdAt ??
      cart?.created_at;

    if (raw == null) return null;

    if (typeof raw === "number") return raw < 2e10 ? raw * 1000 : raw;

    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }

  function parseCartCo2Kg(cart) {
  // Format Honoua actuel : { ts, items, totals: { total_co2_g, total_co2_text, ... } }
  const g =
    cart?.totals?.total_co2_g ??
    cart?.totals?.totalCo2G ??
    cart?.total_co2_g ??
    cart?.totalCo2G ??
    null;

  if (g != null) return safeNumber(g, 0) / 1000;

  const kg =
    cart?.totals?.total_co2_kg ??
    cart?.totals?.totalCo2Kg ??
    cart?.total_co2_kg ??
    cart?.totalCo2Kg ??
    cart?.co2_kg ??
    cart?.co2Kg ??
    cart?.totalCo2Kg ??
    cart?.co2TotalKg ??
    cart?.co2_total_kg ??
    cart?.total_co2_kg ??
    cart?.totalCo2 ??
    cart?.co2 ??
    null;

  if (kg != null) return safeNumber(kg, 0);

  // Fallback : tenter de parser "≈ 4,20 kg CO₂e" depuis total_co2_text
  const t =
    cart?.totals?.total_co2_text ??
    cart?.totals?.totalCo2Text ??
    cart?.total_co2_text ??
    "";

  if (typeof t === "string") {
    const m = t.match(/([0-9]+(?:[.,][0-9]+)?)\s*kg/i);
    if (m) return safeNumber(m[1], 0);
  }

  return 0;
}


  function parseCartDistanceKm(cart) {
  const raw =
    cart?.totals?.total_distance_km ??
    cart?.totals?.totalDistanceKm ??
    cart?.total_distance_km ??
    cart?.totalDistanceKm ??
    cart?.distance_km ??
    cart?.distanceKm ??
    cart?.totalDistanceKm ??
    cart?.distance_total_km ??
    cart?.distance ??
    cart?.km;

  return safeNumber(raw, 0);
}


  function readCartHistory() {
    for (const k of STORAGE_KEYS.cartHistoryCandidates) {
      const s = localStorage.getItem(k);
      if (!s) continue;
      try {
        const data = JSON.parse(s);
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.history)) return data.history;
      } catch (_) {}
    }
    return [];
  }

  // ISO week helpers
  function getISOWeekYearAndNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
  }

  function monthKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function weekKey(date) {
    const w = getISOWeekYearAndNumber(date);
    const ww = String(w.week).padStart(2, "0");
    return `${w.year}-W${ww}`;
  }

  function labelForKey(key, mode) {
    if (mode === "month") {
      // key: YYYY-MM
      const [y, m] = key.split("-");
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    }
    // week: YYYY-W##
    return key.replace("-", " ");
  }

  function aggregate(mode) {
    const history = readCartHistory();
    const map = new Map(); // key -> { co2Kg, km }
    for (const cart of history) {
      const ts = parseCartTimestamp(cart);
      if (!ts) continue;
      const d = new Date(ts);
      const key = mode === "month" ? monthKey(d) : weekKey(d);
      const prev = map.get(key) || { co2Kg: 0, km: 0 };
      prev.co2Kg += parseCartCo2Kg(cart);
      prev.km += parseCartDistanceKm(cart);
      map.set(key, prev);
    }

    const keys = Array.from(map.keys()).sort(); // lexical ok for YYYY-MM and YYYY-W##
    const points = keys.map((k) => ({
      key: k,
      label: labelForKey(k, mode),
      co2Kg: map.get(k).co2Kg,
      km: map.get(k).km,
    }));

    // On limite à 12 points (12 mois / 12 semaines récentes) pour rester lisible
    const max = 12;
    return points.length > max ? points.slice(points.length - max) : points;
  }

  function computeDeltaPct(current, previous) {
    if (!Number.isFinite(previous) || previous <= 0) return null;
    return ((current - previous) / previous) * 100;
  }

  function clearCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Aucune donnée à afficher", 12, 22);
  }

  function drawBarChart(canvas, labels, values) {
    const ctx = canvas.getContext("2d");

    // Ajuste au ratio device (évite le flou)
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssW, cssH);

    const padding = { l: 10, r: 10, t: 10, b: 26 };
    const w = cssW - padding.l - padding.r;
    const h = cssH - padding.t - padding.b;

    const max = Math.max(1, ...values);
    const n = values.length;
    const gap = 8;
    const barW = n > 0 ? Math.max(10, Math.floor((w - gap * (n - 1)) / n)) : 0;

    // axes baseline
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.l, padding.t + h);
    ctx.lineTo(padding.l + w, padding.t + h);
    ctx.stroke();

    // bars + labels
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";

    for (let i = 0; i < n; i++) {
      const v = values[i];
      const barH = Math.round((v / max) * (h - 4));
      const x = padding.l + i * (barW + gap);
      const y = padding.t + h - barH;

      // bar
      ctx.fillStyle = "rgba(0,0,0,0.20)";
      ctx.fillRect(x, y, barW, barH);

      // label (1 sur 2 si serré)
      if (n <= 8 || i % 2 === 0) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillText(labels[i], x + barW / 2, padding.t + h + 18);
      }
    }
  }

  function setToggleActive(mode) {
    const btnM = $("evo-period-month");
    const btnW = $("evo-period-week");
    if (!btnM || !btnW) return;

    btnM.classList.toggle("evo-period-btn-active", mode === "month");
    btnW.classList.toggle("evo-period-btn-active", mode === "week");
  }

  function renderEvolution(mode) {
    const canvas = $("evo-chart");
    const elPeriod = $("evo-current-period");
    const elCo2 = $("evo-current-co2");
    const elKm = $("evo-current-distance");
    const elCo2Ch = $("evo-co2-change");
    const elKmCh = $("evo-distance-change");

    if (!canvas || !elPeriod || !elCo2 || !elKm || !elCo2Ch || !elKmCh) return;

    const points = aggregate(mode);
    if (!points.length) {
      clearCanvas(canvas);
      elPeriod.textContent = "—";
      elCo2.textContent = "— kg";
      elKm.textContent = "— km";
      elCo2Ch.textContent = "— %";
      elKmCh.textContent = "— %";
      return;
    }

    const metric = window.__HONOUA_EVO_METRIC__ || "co2"; // "co2" ou "distance"
    const labels = points.map((p) => p.label);
    const values = points.map((p) => (metric === "distance" ? p.km : p.co2Kg));

    drawBarChart(canvas, labels, values);

    const legend = document.getElementById("evo-legend");
      if (legend) {
        legend.textContent =
          metric === "distance"
            ? "Graphique : Distance (km) par période"
            : "Graphique : CO₂ (kg) par période";
      }


    const cur = points[points.length - 1];
    const prev = points.length >= 2 ? points[points.length - 2] : null;

    elPeriod.textContent = cur.label;
    elCo2.textContent = formatKg(cur.co2Kg);
    elKm.textContent = formatKm(cur.km);

    const dCo2 = prev ? computeDeltaPct(cur.co2Kg, prev.co2Kg) : null;
    const dKm = prev ? computeDeltaPct(cur.km, prev.km) : null;

    elCo2Ch.textContent = dCo2 == null ? "— %" : formatPctSigned(dCo2);
    elKmCh.textContent = dKm == null ? "— %" : formatPctSigned(dKm);
  }

  // --- Sous-étape 10 : toggle métrique (CO2 / Distance)
const btnCo2 = document.getElementById("evo-metric-co2");
const btnDist = document.getElementById("evo-metric-distance");

function setMetricActive(metric) {
      window.__HONOUA_EVO_METRIC__ = metric;
      if (btnCo2) btnCo2.classList.toggle("evo-metric-btn-active", metric === "co2");
      if (btnDist) btnDist.classList.toggle("evo-metric-btn-active", metric === "distance");
    }

    // Défaut : CO2
    setMetricActive("co2");

    if (btnCo2) btnCo2.addEventListener("click", () => {
      setMetricActive("co2");
      renderEvolution(mode);
    });

    if (btnDist) btnDist.addEventListener("click", () => {
      setMetricActive("distance");
      renderEvolution(mode);
    });


  function initEvolution() {
    const btnM = $("evo-period-month");
    const btnW = $("evo-period-week");
    if (!btnM || !btnW) return;

    // mode par défaut: mois (comme ton HTML)
    let mode = btnM.classList.contains("evo-period-btn-active") ? "month" : "week";
    setToggleActive(mode);
    renderEvolution(mode);

    btnM.addEventListener("click", () => {
      mode = "month";
      setToggleActive(mode);
      renderEvolution(mode);
    });

    btnW.addEventListener("click", () => {
      mode = "week";
      setToggleActive(mode);
      renderEvolution(mode);
    });

    // Si l’historique est mis à jour pendant la session (optionnel)
    window.addEventListener("storage", (e) => {
      if (STORAGE_KEYS.cartHistoryCandidates.includes(e.key)) {
        renderEvolution(mode);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEvolution);
  } else {
    initEvolution();
  }
})();

 // code nouvelle fonctionnalité
function showCartHistoryDetailByIndex(idx) {
  const $detail = document.getElementById("co2-cart-history-detail");
  if (!$detail) return;

  const history = honouaGetCartHistory();
  const h = history[idx];
  if (!h) return;

  const co2g =
    (h.totals && (h.totals.total_co2_g ?? h.totals.totalCo2G ?? h.totals.total_all_g)) ?? null;
  const co2kg = (co2g != null && Number.isFinite(Number(co2g))) ? (Number(co2g) / 1000) : null;

  const titleDate = (() => { try { return new Date(h.ts).toLocaleString('fr-FR'); } catch { return ''; } })();

  const items = Array.isArray(h.items) ? h.items : [];
  const lines = items.slice(0, 30).map((it) => {
    const name = it.product_name || it.name || "Produit";
    const qty = it.qty ?? it.quantity ?? 1;
    return `<li>${escapeHtml(String(name))} <span class="co2-muted">×${qty}</span></li>`;
  }).join('');

  $detail.innerHTML = `
    <div class="co2-history-detail-card">
      <div class="co2-history-detail-title"><strong>Panier</strong> — ${titleDate}</div>
      <div class="co2-history-detail-meta">Total : ${co2kg != null ? `≈ ${co2kg.toFixed(2).replace('.', ',')} kg CO₂e` : '—'}</div>

      <div class="co2-history-detail-actions">
        <button id="co2-history-reload-cart" class="honoua-btn">Recharger ce panier</button>
      </div>

      <div class="co2-history-detail-items">
        <strong>Produits</strong>
        <ul>${lines || "<li>Aucun produit.</li>"}</ul>
      </div>
    </div>
  `;

  $detail.classList.remove("hidden");

  const $reload = document.getElementById("co2-history-reload-cart");
  if ($reload) {
    $reload.onclick = () => {
      // Réinjecte dans la clé utilisée par ScanImpact/Honoua core
      localStorage.setItem("honoua_co2_cart_v1", JSON.stringify(items));
      alert("Panier rechargé. Retournez sur ScanImpact pour voir les recommandations.");
    };
  }
}

// Petit helper si pas déjà présent
function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("click", (e) => {
  const el = e.target && e.target.closest ? e.target.closest(".co2-history-item") : null;
  if (!el) return;
  const idx = Number(el.getAttribute("data-idx"));
  if (!Number.isFinite(idx)) return;
  showCartHistoryDetailByIndex(idx);
});

// code supplémentaire 
document.addEventListener("click", (e) => {
  const el = e.target && e.target.closest ? e.target.closest(".co2-cart-history-item") : null;
  if (!el) return;

  const idx = Number(el.getAttribute("data-idx"));
  if (!Number.isFinite(idx)) return;

  console.log("[History] click idx=", idx);
  // Étape suivante : afficher un détail / recharger le panier
});


