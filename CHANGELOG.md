# Changelog
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).  
Ce projet suit un versionnage sémantique simplifié.

## [v0.13.0] - 2025-10-17
### Ajouté
- **A12 — Barre de recherche & filtres** dans l’historique : recherche live (date/tri/ordre/filtres/requête/EANs), filtres rapides (Actuelles, Épinglées, 24h, 7j), tri asc/desc.
- **A13 — Export / Import JSON** de l’historique : drag&drop, validation, dédup par `params`, merge non destructif, borne ≤ 50 (pinned prioritaires).
- **A13.bis — Mode maintenance** : pause des snapshots automatiques, **backup instantané**, **restore**, **backup auto avant import**.

### Changé
- Indicateurs visuels dans l’historique : pastille d’état (épinglée/actuelle), badge “Actuelle”, mini-chips (tri/ordre/filtres/recherche).

### Notes de migration
- Aucune. Fonctionne sans modification du HTML/CSS existant hors section `#compare-history`.

## [v0.11.0] - 2025-10-17
### Ajouté
- **A11 — Historique des comparaisons** :
  - Étape 1 : stockage auto de chaque session (URL = vérité, dédup, borne 50).
  - Étape 2 : liste historique (date/heure, nb produits, bouton **Recharger**).
  - Étape 3 : actions (**Vider**, **Épingler/Désépingler**, **Supprimer**) + mini-CSS.
  - Indicateurs visuels + badge “Épinglé”.

### Notes
- Tag créé : `v0.11.0`.

## [v0.10.0] - 2025-10-15
### Ajouté
- **A10** — Restauration auto de l’état + sync URL + tris/filters + partage (base pour l’historique).
