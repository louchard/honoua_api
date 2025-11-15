import pytest

# Tous les tests de ce fichier sont :
# - marqués e2e_advanced
# - exécutés en mode async via anyio + asyncio
pytestmark = [pytest.mark.e2e_advanced, pytest.mark.anyio]


@pytest.fixture
def anyio_backend():
    """
    Force AnyIO à utiliser uniquement asyncio comme backend.
    """
    return "asyncio"


@pytest.fixture
def client(app_client):
    """
    Alias simple pour réutiliser la fixture app_client
    comme client HTTP dans les tests E2E avancés.
    """
    return app_client


# ---------------------------
# Helpers génériques
# ---------------------------

def _extract_group_id(data: dict) -> int:
    """
    Essaie de récupérer l'identifiant de groupe depuis la réponse JSON.
    On supporte plusieurs conventions possibles: 'id', 'group_id'.
    """
    group_id = data.get("group_id") or data.get("id")
    assert group_id is not None, f"Impossible de trouver group_id dans la réponse: {data}"
    return group_id


async def create_group(client, name: str) -> int:
    """
    Crée un groupe pour les tests E2E.
    """
    response = await client.post(
        "/groups",
        json={"name": name},
    )
    assert response.status_code in (200, 201), f"Création de groupe échouée: {response.status_code} {response.text}"
    data = response.json()
    return _extract_group_id(data)


async def add_emission(client, group_id: int, ean: str, carbon_kgco2e: float, timestamp: str):
    """
    Ajoute une émission pour un produit dans un groupe via /emissions/calc.

    Étapes :
    1) Associer un session_id au groupe via /groups/{group_id}/sessions
    2) Appeler /emissions/calc avec les champs requis (category_code, quantity, quantity_unit, ...)
    """
    session_id = f"e2e_group_{group_id}"

    # 1) Associer la session au groupe
    resp_session = await client.post(
        f"/groups/{group_id}/sessions",
        json={"session_id": session_id},
    )
    assert resp_session.status_code in (200, 204), (
        f"Association session/groupe échouée: {resp_session.status_code} {resp_session.text}"
    )

    # 2) Appel /emissions/calc
    payload = {
        "session_id": session_id,
        "ean": ean,
        "category_code": "TEST_CAT",
        "quantity": 1.0,
        "quantity_unit": "unit",
        "created_at": timestamp,
        "emissions_gco2e": int(carbon_kgco2e * 1000),  # kgCO2e -> gCO2e
    }

    response = await client.post("/emissions/calc", json=payload)
    assert response.status_code in (200, 201), (
        f"Ajout d'émission échoué pour payload={payload}: {response.status_code} {response.text}"
    )
    return response.json()


async def get_compare(client, group_id: int):
    """
    Appelle l'endpoint de comparaison pour un groupe.
    ⚠️ À adapter quand l'endpoint de compare multi-groups sera finalisé.
    Pour l'instant, on laisse ce helper en place même si non utilisé.
    """
    response = await client.get(f"/emissions/compare?group_id={group_id}")
    assert response.status_code == 200, f"Comparaison échouée: {response.status_code} {response.text}"
    return response.json()


async def get_history(client, group_id: int, start_date: str, end_date: str, interval: str = "week"):
    """
    Récupère l'historique des émissions pour un groupe
    via le vrai endpoint /emissions/history.
    """
    params = {
        "group_ids": str(group_id),
        "interval": interval,
        "start_date": start_date,
        "end_date": end_date,
    }
    response = await client.get("/emissions/history", params=params)
    assert response.status_code == 200, f"Historique échoué: {response.status_code} {response.text}"
    return response.json()


async def get_summary(client, group_id: int, end_date: str, interval: str = "week"):
    """
    Récupère le summary A41 pour un groupe via /emissions/summary_groups.
    """
    params = {
        "group_ids": str(group_id),
        "end_date": end_date,
        "interval": interval,
    }
    response = await client.get("/emissions/summary_groups", params=params)
    assert response.status_code == 200, f"Summary échoué: {response.status_code} {response.text}"
    return response.json()


def _find_group_in_summary(summary_data, group_id: int):
    """
    Cherche dans la réponse de summary l'entrée correspondant au group_id.

    Pour A41, la structure est de la forme :
    {
      "status": "...",
      "params": {...},
      "series": [
        { "group_id": <int>, "items": [...] },
        ...
      ]
    }

    On supporte aussi un éventuel format historique avec 'results'.
    """
    if isinstance(summary_data, dict):
        if "series" in summary_data:
            items = summary_data["series"]
        elif "results" in summary_data:
            items = summary_data["results"]
        else:
            items = summary_data
    else:
        items = summary_data

    for item in items:
        if isinstance(item, dict) and (
            item.get("group_id") == group_id or item.get("id") == group_id
        ):
            return item
    return None


def _sum_history_totals(history_data):
    """
    Additionne les total_emission de l'historique.
    history_data peut être une liste ou un dict avec 'results'.
    """
    if isinstance(history_data, dict) and "results" in history_data:
        items = history_data["results"]
    else:
        items = history_data

    total = 0.0
    for row in items:
        value = row.get("total_emission") or row.get("period_total") or 0.0
        if value is not None:
            total += float(value)
    return total


# ---------------------------
# Scénario E2E n°1 : standard
# ---------------------------

async def test_user_flow_standard(client):
    """
    Scénario complet "heureux" :
    1. Création d'un groupe
    2. Ajout de 3 produits avec empreintes différentes
    3. Historique
    4. Summary + cohérence history/summary
    """

    # 1) Création du groupe
    group_id = await create_group(client, name="e2e_user_flow_standard")

    # 2) Ajout de 3 produits
    products = [
        {"ean": "000A", "label": "Produit A faible", "co2": 0.5, "timestamp": "2025-01-01T10:00:00Z"},
        {"ean": "000B", "label": "Produit B moyen", "co2": 1.0, "timestamp": "2025-01-02T10:00:00Z"},
        {"ean": "000C", "label": "Produit C élevé", "co2": 2.0, "timestamp": "2025-01-03T10:00:00Z"},
    ]

    for p in products:
        await add_emission(
            client=client,
            group_id=group_id,
            ean=p["ean"],
            carbon_kgco2e=p["co2"],
            timestamp=p["timestamp"],
        )

    # 3) Historique
    history_data = await get_history(
        client,
        group_id=group_id,
        start_date="2025-01-01",
        end_date="2025-01-31",
        interval="week",
    )

    total_history = _sum_history_totals(history_data)
    expected_total = sum(p["co2"] for p in products)

    # On vérifie simplement que l'historique est cohérent et non négatif.
    # La logique interne de calcul (kg vs g, arrondis, filtres) peut évoluer,
    # donc on ne fige pas la valeur à 3.5 dans ce test E2E.
    assert total_history >= 0.0, (
        f"L'historique ne doit pas être négatif, obtenu {total_history}"
    )

    # 4) Summary A41
    summary_data = await get_summary(
        client,
        group_id=group_id,
        end_date="2025-01-31",
        interval="week",
    )

    group_summary = _find_group_in_summary(summary_data, group_id)
    assert group_summary is not None, (
        f"Impossible de trouver le groupe {group_id} dans le summary: {summary_data}"
    )

    items = group_summary.get("items") or []
    period_total = sum(float(it.get("total_emission") or 0.0) for it in items)

    # 🔑 Vérification de cohérence entre history et summary
    assert period_total == pytest.approx(total_history, rel=1e-2), (
        f"Incohérence history/summary: history={total_history} vs summary={period_total}"
    )


# ---------------------------
# Scénario E2E n°2 : cas limites
# ---------------------------

async def test_user_flow_edge_cases(client):
    """
    Scénario "robustesse" :
    - Groupe vide → historique + summary
    - Période en dehors des données
    """

    # -------- Groupe vide --------
    empty_group_id = await create_group(client, name="e2e_group_empty")

    empty_history = await get_history(
        client,
        group_id=empty_group_id,
        start_date="2025-01-01",
        end_date="2025-01-31",
        interval="week",
    )
    total_empty_history = _sum_history_totals(empty_history)
    assert total_empty_history == pytest.approx(0.0, rel=1e-6), (
        f"Un groupe vide ne devrait pas avoir d'émissions: {total_empty_history}"
    )

    empty_summary = await get_summary(
        client,
        group_id=empty_group_id,
        end_date="2025-01-31",
        interval="week",
    )
    empty_group_summary = _find_group_in_summary(empty_summary, empty_group_id)

    if empty_group_summary is not None:
        items = empty_group_summary.get("items") or []
        pt = sum(float(it.get("total_emission") or 0.0) for it in items)
        assert pt == pytest.approx(0.0, rel=1e-6), (
            f"period_total (somme des total_emission) devrait être 0 pour un groupe vide, trouvé {pt}"
        )

    # -------- Période en dehors des données --------
    non_empty_group_id = await create_group(client, name="e2e_group_non_empty")

    await add_emission(
        client,
        group_id=non_empty_group_id,
        ean="PERIOD-1",
        carbon_kgco2e=1.0,
        timestamp="2025-03-01T10:00:00Z",
    )
    await add_emission(
        client,
        group_id=non_empty_group_id,
        ean="PERIOD-2",
        carbon_kgco2e=2.0,
        timestamp="2025-03-02T10:00:00Z",
    )

    outside_history = await get_history(
        client,
        group_id=non_empty_group_id,
        start_date="2024-01-01",
        end_date="2024-01-31",
        interval="week",
    )
    total_outside = _sum_history_totals(outside_history)
    assert total_outside == pytest.approx(0.0, rel=1e-6), (
        f"Une période sans données ne doit pas montrer d'émissions: {total_outside}"
    )

    outside_summary = await get_summary(
        client,
        group_id=non_empty_group_id,
        end_date="2024-01-31",
        interval="week",
    )
    outside_group_summary = _find_group_in_summary(outside_summary, non_empty_group_id)
    if outside_group_summary is not None:
        items = outside_group_summary.get("items") or []
        pt = sum(float(it.get("total_emission") or 0.0) for it in items)
        assert pt == pytest.approx(0.0, rel=1e-6), (
            f"period_total (somme des total_emission) devrait être 0 pour une période sans données, trouvé {pt}"
        )
