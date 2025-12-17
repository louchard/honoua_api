/* honoua-core.js — tronc commun minimal, sans dépendance DOM */

(function () {
  "use strict";

  // Namespace unique pour éviter les collisions
  const HonouaCore = (window.HonouaCore = window.HonouaCore || {});

  // ----------------------------
  // 1) User ID anonyme (persistant)
  // ----------------------------
  const USER_ID_KEY = "honoua_user_id";

  function ensureUserId() {
    let id = null;
    try {
      id = localStorage.getItem(USER_ID_KEY);
    } catch (e) {}

    if (!id) {
      // UUID v4 simple (suffisant pour un ID anonyme local)
      id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      try {
        localStorage.setItem(USER_ID_KEY, id);
      } catch (e) {}
    }
    return id;
  }

  function getUserId() {
    // Ne force pas la création si déjà présent, mais assure une valeur
    try {
      const existing = localStorage.getItem(USER_ID_KEY);
      return existing || ensureUserId();
    } catch (e) {
      return ensureUserId();
    }
  }

  // Compat : si d’autres scripts appellent déjà window.getHonouaUserId()
  if (typeof window.getHonouaUserId !== "function") {
    window.getHonouaUserId = getUserId;
  }

  HonouaCore.user = {
    ensureId: ensureUserId,
    getId: getUserId,
    KEY: USER_ID_KEY
  };

  // ----------------------------
  // 2) Foyer (household size)
  // ----------------------------
  const HOUSEHOLD_KEY = "honoua_household_size";

  function getHouseholdSize() {
    let n = 1;
    try {
      n = Number(localStorage.getItem(HOUSEHOLD_KEY));
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
      localStorage.setItem(HOUSEHOLD_KEY, String(n));
    } catch (e) {}
    return n;
  }

  HonouaCore.household = {
    getSize: getHouseholdSize,
    setSize: setHouseholdSize,
    KEY: HOUSEHOLD_KEY
  };

  // ----------------------------
  // 3) Fetch wrapper avec header X-Honoua-User-Id
  // ----------------------------
  async function honouaFetch(input, options) {
    const userId = getUserId();
    const opts = options ? { ...options } : {};
    const headers = new Headers(opts.headers || {});
    headers.set("X-Honoua-User-Id", userId);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    opts.headers = headers;
    return fetch(input, opts);
  }

  async function honouaFetchJson(url, options) {
    const resp = await honouaFetch(url, options);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const err = new Error(`HTTP ${resp.status} on ${url}`);
      err.status = resp.status;
      err.body = text;
      throw err;
    }
    return resp.json();
  }

  HonouaCore.api = {
    fetch: honouaFetch,
    fetchJson: honouaFetchJson
  };

  // ----------------------------
  // 4) Normalisation GET /api/cart/history
  // ----------------------------
  function normalizeHistoryResponse(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.results)) return raw.results;
    if (Array.isArray(raw.items)) return raw.items;
    return [];
  }

  HonouaCore.history = HonouaCore.history || {};
  HonouaCore.history.normalize = normalizeHistoryResponse;

  // ----------------------------
  // 5) Agrégation par période (année / mois / semaine) + distance
  // ----------------------------
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

    const pad2 = (n) => String(n).padStart(2, "0");
    const toMonthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

    const toIsoWeekKey = (dateObj) => {
      const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    };

    const yearFromLabel = (item) => {
      const src = item?.period_label || item?.period_month || item?.period_week;
      if (!src) return null;
      const y = parseInt(String(src).slice(0, 4), 10);
      return Number.isFinite(y) ? String(y) : null;
    };

    (items || []).forEach((item) => {
      if (!item) return;

      let co2g = Number(item.total_co2_g);
      if (!Number.isFinite(co2g) || co2g < 0) co2g = 0;

      let distKm = Number(item.total_distance_km);
      if (!Number.isFinite(distKm) || distKm < 0) distKm = 0;

      let yearKey = yearFromLabel(item);
      let monthKey = item.period_month ? String(item.period_month) : null;
      let weekKey = item.period_week ? String(item.period_week) : null;

      if (!monthKey && item.period_label && /^\d{4}-\d{2}$/.test(String(item.period_label))) {
        monthKey = String(item.period_label);
      }
      if (!weekKey && item.period_label && /^\d{4}-W\d{1,2}$/.test(String(item.period_label))) {
        weekKey = String(item.period_label).replace(/-W(\d)$/, "-W0$1");
      }

      if (!yearKey || (!monthKey && !weekKey)) {
        const dtRaw = item.created_at || item.validated_at || null;
        if (dtRaw) {
          const d = new Date(dtRaw);
          if (!isNaN(d)) {
            if (!yearKey) yearKey = String(d.getFullYear());
            if (!monthKey) monthKey = toMonthKey(d);
            if (!weekKey) weekKey = toIsoWeekKey(d);
          }
        }
      }

      safeAdd(byYear, yearKey, co2g, distKm);
      safeAdd(byMonth, monthKey, co2g, distKm);
      safeAdd(byWeek, weekKey, co2g, distKm);
    });

    const toSortedSeries = (bucket) =>
      Object.keys(bucket)
        .sort()
        .map((key) => ({
          period: key,
          total_co2_g: bucket[key].total_co2_g,
          total_distance_km: bucket[key].total_distance_km,
          count: bucket[key].count
        }));

    return {
      byYear,
      byMonth,
      byWeek,
      seriesYear: toSortedSeries(byYear),
      seriesMonth: toSortedSeries(byMonth),
      seriesWeek: toSortedSeries(byWeek)
    };
  }

  HonouaCore.history.aggregateByPeriod = aggregateHistoryByPeriod;

  // ----------------------------
  // 6) Formatters minimal
  // ----------------------------
  function formatNumberFr(value, decimals = 0) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return safe.toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function gToKg(g) {
    const n = Number(g);
    return Number.isFinite(n) ? n / 1000 : 0;
  }

  function gToT(g) {
    const n = Number(g);
    return Number.isFinite(n) ? n / 1_000_000 : 0;
  }

  HonouaCore.format = {
    numberFr: formatNumberFr,
    gToKg,
    gToT
  };

  // Init ID au chargement (utile pour que tout soit prêt)
  ensureUserId();
})();
