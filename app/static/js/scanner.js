
// === A52 – Conversion CO₂ → Jours de captation d’un arbre ===


/**
 * Calcule le nombre de jours nécessaires à un arbre
 * pour capter une quantité de CO₂ exprimée en kilogrammes.
 *
 * Formule officielle Honoua :
 *    jours = (co2_kg / 22) * 365
 *
 * @param {number} co2Kg - CO₂ total en kg
 * @returns {number} nombre de jours
 */
 // Messages UX harmonisés pour le scanner CO₂
        const SCANNER_MESSAGES = {
          scanPrompt: "Scannez un code-barres pour afficher l’empreinte CO₂ du produit.",
          noCo2Data: "Nous n’avons pas encore de données CO₂ pour ce produit.",
          fetchError: "Impossible de récupérer les données CO₂. Veuillez réessayer.",
          serviceUnavailable: "Impossible de joindre le service CO₂. Vérifiez votre connexion et réessayez.",
          treeText: (days) =>
            `Pour compenser les émissions de ce produit, un arbre mettrait environ ${days} jours à les absorber.`
        };

const CO2_CHALLENGE_MESSAGES = {
  noActiveChallenge: "Aucun défi actif pour le moment. Activez votre premier défi pour suivre votre progression.",
  loadError: "Impossible de charger les défis CO₂. Veuillez réessayer dans un instant.",
  fetchError: "Les défis n’ont pas pu être récupérés. Vérifiez votre connexion et réessayez.",
  evaluateError: "Un problème est survenu pendant l’évaluation de vos défis. Réessayez dans un instant.",
  genericError: "Une erreur est survenue. Veuillez réessayer dans un instant."
};


function computeDaysTreeCapture(co2Kg) {
  if (!Number.isFinite(co2Kg) || co2Kg <= 0) {
    return 0;
  }
  return (co2Kg / 22) * 365;
}

/**
 * Formate le nombre de jours selon la règle A52.3.
 * @param {number} days
 * @returns {string}
 */
function formatDaysTreeCapture(days) {
  if (!Number.isFinite(days) || days <= 0) {
    return "< 1 jour";
  }
  if (days < 10) {
    return days.toFixed(1) + " jours";
  }
  return Math.round(days) + " jours";
}

// === Export global si besoin dans d’autres scripts (eco-select, panier...)
window.computeDaysTreeCapture = computeDaysTreeCapture;
window.formatDaysTreeCapture = formatDaysTreeCapture;


// =======================================================
// Défis CO2 - Affichage des défis actifs (Variante A)
// =======================================================

// TODO : adapter si tu as un vrai système d'utilisateur.
// Pour l'instant, on suppose que l'utilisateur courant a l'id 1.
const CO2_CHALLENGES_USER_ID = 1;

// Fonction utilitaire : créer un élément avec classes
function createElementWithClass(tag, className) {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  return el;
}

// Mapper un statut backend -> classe CSS
function getStatusClass(status) {
  switch (status) {
    case "reussi":
      return "status-reussi";
    case "echoue":
      return "status-echoue";
    case "expire":
      return "status-expire";
    case "en_cours":
    default:
      return "status-en-cours";
  }
}

// Mapper un statut backend -> label texte
function getStatusLabel(status) {
  switch (status) {
    case "reussi":
      return "Réussi";
    case "echoue":
      return "Échoué";
    case "expire":
      return "Expiré";
    case "en_cours":
    default:
      return "En cours";
  }
}

// Rendre la liste des défis dans #co2-challenges-list
function renderCo2Challenges(challenges) {
  const container = document.getElementById("co2-challenges-list");
  if (!container) {
    console.warn("⚠️ Élément #co2-challenges-list introuvable dans le DOM.");
    return;
  }

  // On vide le contenu actuel
  container.innerHTML = "";

  if (!challenges || challenges.length === 0) {
    const emptyDiv = createElementWithClass("div", "co2-challenge-empty");
    emptyDiv.textContent = CO2_CHALLENGE_MESSAGES.noActiveChallenge;
    container.appendChild(emptyDiv);
    return;
  }

  challenges.forEach((challenge) => {
    const card = createElementWithClass("div", "co2-challenge-card");

        // Style de la carte selon le statut
    if (challenge.status) {
      const st = challenge.status;
      if (st === "reussi") {
        card.classList.add("co2-challenge-card-success");
      } else if (st === "echoue" || st === "expire") {
        card.classList.add("co2-challenge-card-failed");
      } else if (st === "en_cours") {
        card.classList.add("co2-challenge-card-active");
      }
    }


    // Header : icône + nom
    const header = createElementWithClass("div", "co2-challenge-header");
    const iconSpan = createElementWithClass("span", "co2-challenge-icon");
    iconSpan.textContent = "🏆";

    const nameSpan = createElementWithClass("span", "co2-challenge-name");
    nameSpan.textContent = challenge.name || challenge.code || "Défi CO₂";

    header.appendChild(iconSpan);
    header.appendChild(nameSpan);
    card.appendChild(header);


    // Statut
    const statusDiv = createElementWithClass(
      "div",
      "co2-challenge-status " + getStatusClass(challenge.status)
    );
    statusDiv.textContent = getStatusLabel(challenge.status);
    card.appendChild(statusDiv);

        // Badge spécial si le défi est réussi
    if (challenge.status === "reussi") {
      const badge = createElementWithClass("div", "co2-challenge-badge");
      badge.textContent = "🏅 Défi réussi";
      card.appendChild(badge);
    }


    // Progression
    const progressWrapper = createElementWithClass(
      "div",
      "co2-challenge-progress"
    );
    const progressBar = createElementWithClass(
      "div",
      "co2-challenge-progress-bar"
    );
    const progressFill = createElementWithClass(
      "div",
      "co2-challenge-progress-fill"
    );

    // Élément qui affiche les messages du scanner (adapter l'id si besoin)
const scannerMessageEl = document.getElementById("scanner-message");

// Affichage des messages UX du scanner avec le style Honoua
function showScannerMessage(type, text) {
  if (!scannerMessageEl) return;

  if (!text) {
    scannerMessageEl.innerHTML = "";
    return;
  }

  const normalizedType = (type || "info").toLowerCase();

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

  scannerMessageEl.innerHTML = `
    <div class="honoua-alert ${variantClass}">
      <span class="honoua-alert-icon">${icon}</span>
      <span class="honoua-alert-text">${text}</span>
    </div>
  `;
}

          const cartMessageEl = document.getElementById("cart-message"); // adapter l'id si besoin

function showCartMessage(type, text) {
  if (!cartMessageEl) return;

  if (!text) {
    cartMessageEl.innerHTML = "";
    return;
  }

  const normalizedType = (type || "info").toLowerCase();

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
  }

  cartMessageEl.innerHTML = `
    <div class="honoua-alert ${variantClass}">
      <span class="honoua-alert-icon">${icon}</span>
      <span class="honoua-alert-text">${text}</span>
    </div>
  `;
}


    const historyMessageEl = document.getElementById("history-message"); // adapter si nécessaire

function showHistoryMessage(type, text) {
  if (!historyMessageEl) return;

  if (!text) {
    historyMessageEl.innerHTML = "";
    return;
  }

  const normalizedType = (type || "info").toLowerCase();

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
  }

  historyMessageEl.innerHTML = `
    <div class="honoua-alert ${variantClass}">
      <span class="honoua-alert-icon">${icon}</span>
      <span class="honoua-alert-text">${text}</span>
    </div>
  `;
}
     

    // ProgressPercent peut être null si pas assez de données
    let percent = challenge.progress_percent;
    if (typeof percent !== "number" || isNaN(percent)) {
      percent = 0;
    }
    // Bornage 0–100
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    progressFill.style.width = percent + "%";
    progressBar.appendChild(progressFill);

    const progressLabel = createElementWithClass(
      "span",
      "co2-challenge-progress-label"
    );
    progressLabel.textContent = percent.toFixed(0) + " %";

    progressWrapper.appendChild(progressBar);
    progressWrapper.appendChild(progressLabel);
    card.appendChild(progressWrapper);

    // Message (optionnel, envoyé par l'API d'évaluation)
    if (challenge.message) {
      const messageP = createElementWithClass(
        "p",
        "co2-challenge-message"
      );
      messageP.textContent = challenge.message;
      card.appendChild(messageP);
    }

    container.appendChild(card);
  });
}

// Charger les défis actifs depuis l'API
async function fetchCo2ChallengesForUser(userId) {
  try {
    const response = await fetch(`/users/${userId}/challenges/active`);
    if (!response.ok) {
      console.error("Erreur lors du chargement des défis CO2 :", response.status);
      renderCo2Challenges([]);
      return;
    }
    const data = await response.json();
    renderCo2Challenges(data);
  } catch (error) {
    console.error("Erreur réseau lors du chargement des défis CO2 :", error);
    renderCo2Challenges([]);
  }
}

// Appel automatique au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  fetchCo2ChallengesForUser(CO2_CHALLENGES_USER_ID);
});



// =======================================================
// Défis CO2 - Mise à jour (evaluate)
// =======================================================

// Fonction : évaluer tous les défis actifs pour un user
async function evaluateAllCo2Challenges(userId) {
  try {
    // Étape 1 : récupérer les défis actifs
    const activeRes = await fetch(`/users/${userId}/challenges/active`);
    if (!activeRes.ok) {
      console.error("Erreur : impossible de récupérer les défis actifs.");
      return;
    }

    const activeChallenges = await activeRes.json();

    // Si aucun défi actif → rien à évaluer
    if (!activeChallenges || activeChallenges.length === 0) {
      console.log("Aucun défi actif à évaluer.");
      renderCo2Challenges([]);
      return;
    }

    // Étape 2 : évaluer chaque défi
    for (const ch of activeChallenges) {
      try {
        const evalRes = await fetch(
          `/users/${userId}/challenges/${ch.instance_id}/evaluate`,
          { method: "POST" }
        );

        if (!evalRes.ok) {
          console.error(`Erreur évaluation défi ${ch.instance_id}`);
          continue;
        }
      } catch (errEval) {
        console.error(
          `Erreur réseau pendant l'évaluation du défi ${ch.instance_id}:`,
          errEval
        );
      }
    }

    // Étape 3 : recharger pour afficher les nouvelles valeurs
    fetchCo2ChallengesForUser(userId);

  } catch (error) {
    console.error("Erreur globale evaluateAllCo2Challenges :", error);
  }
}

 console.log('💚 TEST ECOSELECT — fichier scanner.js bien chargé');

// Activation du bouton 🔄
document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("co2-challenges-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      evaluateAllCo2Challenges(CO2_CHALLENGES_USER_ID);
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const infoBtn = document.getElementById('co2SummaryInfoBtn');
  const details = document.getElementById('co2Details');

  if (infoBtn && details) {
    // État initial : fermé
    infoBtn.setAttribute('aria-expanded', 'false');

    infoBtn.addEventListener('click', () => {
      const isHidden = details.classList.contains('hidden');

      if (isHidden) {
        // Ouvrir la fiche produit
        details.classList.remove('hidden');
        infoBtn.setAttribute('aria-expanded', 'true');
      } else {
        // Fermer la fiche produit
        details.classList.add('hidden');
        infoBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
});

  // ===========================
  // Code du rendu de l'info bulle
  // ===========================

function renderCo2Result(payload) {
  const {
    product_label,
    product_name,
    label,
    nom,
    co2_kg_total,
    co2_kg_details = {},
    origin_country,
    distance_km,
    packaging_type,
    packaging_label,
  } = payload || {};

  // ===========================
  // Sélection des éléments DOM
  // ===========================
  const badge = document.getElementById("co2Badge");
  const emptyMessage = document.getElementById("co2Empty");
  const content = document.getElementById("co2Content");

  // Résumé (ligne principale)
  const summaryName = document.getElementById("co2ProductLabel");
  const summaryTotal = document.getElementById("co2Total");
  const summaryOrigin = document.getElementById("co2Origin");
  const summaryPackage = document.getElementById("co2PackageLabel");

  // Bloc détail (fiche déroulante)
  const details = document.getElementById("co2Details");
  const detailsName = document.getElementById("co2DetailsProductName");
  const detailsTotal = document.getElementById("co2DetailsTotal");
  const detailsDistance = document.getElementById("co2DetailsDistance");
  const detailsOrigin = document.getElementById("co2DetailsOrigin");
  const detailsPackage = document.getElementById("co2DetailsPackage");

  // Détails CO2 (déjà existants dans ton code)
  const co2Prod = document.getElementById("co2Prod");
  const co2Pack = document.getElementById("co2Pack");
  const co2Trans = document.getElementById("co2Trans");

  // Phrase "jours d'arbre"
  const treeCapture = document.getElementById("co2TreeCapture");

  // ===========================
  // Détection du nom
  // ===========================
  const name =
    product_label ||
    product_name ||
    label ||
    nom ||
    "Nom indisponible";

  // ===========================
  // Si aucune donnée CO₂
  // ===========================
  if (!co2_kg_total && co2_kg_total !== 0) {
    badge.textContent = "Données indisponibles";
    badge.className = "co2-badge co2-product-status--missing";

    emptyMessage.classList.remove("hidden");
    content.classList.add("hidden");

    return;
  }

  // ===========================
  // Si données trouvées
  // ===========================
  badge.textContent = "Données CO₂ trouvées";
  badge.className = "co2-badge co2-product-status--found";

  emptyMessage.classList.add("hidden");
  content.classList.remove("hidden");

  // ===========================
  // Conversion CO2 (en kg)
  // ===========================
  const formattedTotal = `${co2_kg_total.toFixed(2)} kg CO₂`;

  // ===========================
  // Origine & distance
  // ===========================
  const origin = origin_country || "—";
  const distanceText = distance_km ? `${distance_km} km` : "—";

  // ===========================
  // Emballage
  // ===========================
  const pack =
    packaging_label ||
    packaging_type ||
    "—";

  // ===========================
  // Jours arbre (calcul existant)
  // ===========================
  const days = computeDaysTreeCapture(co2_kg_total);
  const daysText = formatDaysTreeCapture(days);

  // ===========================
  // Injection des données
  // ===========================

  // --- Résumé ---
  summaryName.textContent = name;
  summaryTotal.textContent = formattedTotal;
  summaryOrigin.textContent = `Origine : ${origin}`;
  summaryPackage.textContent = pack;

  // --- Fiche détaillée ---
  detailsName.textContent = name;
  detailsTotal.textContent = formattedTotal;
  detailsDistance.textContent = `Distance : ${distanceText}`;
  detailsOrigin.textContent = `Origine : ${origin}`;
  detailsPackage.textContent = `Type d’emballage : ${pack}`;

  // --- Détail CO2 ---
  co2Prod.textContent = `${(co2_kg_details.product || 0).toFixed(2)} kg`;
  co2Pack.textContent = `${(co2_kg_details.packaging || 0).toFixed(2)} kg`;
  co2Trans.textContent = `${(co2_kg_details.transport || 0).toFixed(2)} kg`;

  // --- Jours arbre ---
  treeCapture.textContent = daysText;

  // On ferme systématiquement la fiche détaillée (option UX propre)
  details.classList.add("hidden");
}
