# Honoua API

[![CI](https://github.com/louchard/honoua_api/actions/workflows/ci.yml/badge.svg)](https://github.com/louchard/honoua_api/actions/workflows/ci.yml)

API minimaliste pour les tests CI/CD et la démonstration de l’infrastructure Honoua.

---

## 🌍 À propos du projet
**Honoua API** fait partie du projet Honoua, un assistant personnel dédié à la **décarbonation de l’alimentation**.  
Cette API sert de socle technique pour tester et démontrer l’intégration entre l’application (analyse, comparaison, suivi carbone) et les services backend.  
Elle inclut une **pipeline CI/CD** (tests automatisés, vérification base de données, artefacts de logs) pour assurer la stabilité du projet.

---

## 🚀 Démarrer en local
```bash
pip install uvicorn fastapi
uvicorn app.ci_main:app --host 127.0.0.1 --port 3000
# Ouvrir : http://127.0.0.1:3000/health

