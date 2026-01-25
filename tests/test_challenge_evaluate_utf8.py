import os
import json
import requests


BASE = os.getenv("HONOUA_BASE", "https://api.honoua.com").rstrip("/")
USER_ID = int(os.getenv("HONOUA_USER_ID", "1"))
INSTANCE_ID = int(os.getenv("HONOUA_INSTANCE_ID", "3"))


# Artefacts typiques d'encodage (mojibake)
FORBIDDEN_IN_MESSAGE = [
    "\ufffd",         # "�" replacement char
    "\u201a",         # "‚" (souvent affiché comme ",,")
    "CO2,,",
    "CO,,",
    "CO\u00e2",       # "COâ"
    "\u00c3",         # "Ã"
    "\u00f0\u0178",   # "ðŸ" (début classique de mojibake d'emoji)
]


FORBIDDEN_IN_NAME = [
    "\ufffd",
    "R\u00c3",        # "RÃ"
    "CO\u00e2",       # "COâ"
    "\u00f0\u0178",   # "ðŸ"
]


def _evaluate():
    url = f"{BASE}/users/{USER_ID}/challenges/{INSTANCE_ID}/evaluate"
    r = requests.post(url, json={}, headers={"Content-Type": "application/json"})
    return r


def test_evaluate_is_utf8_and_json_parses():
    r = _evaluate()
    assert r.status_code == 200, f"HTTP {r.status_code} - body: {r.text[:300]!r}"
    raw = r.content
    raw.decode("utf-8", "strict")
    data = json.loads(raw.decode("utf-8"))
    assert isinstance(data, dict)
    assert "message" in data
    assert "name" in data


def test_evaluate_message_has_no_artifacts():
    r = _evaluate()
    data = json.loads(r.content.decode("utf-8", "strict"))
    msg = data.get("message") or ""

    for bad in FORBIDDEN_IN_MESSAGE:
        assert bad not in msg, f"Artefact {bad!r} trouvé dans message: {msg!r}"

    # CO2 ou CO₂ (U+2082)
    assert ("CO2" in msg) or ("CO\u2082" in msg), f"Message sans CO2/CO₂: {msg!r}"
    assert "CO2,," not in msg
    assert "CO2," not in msg


def test_evaluate_name_has_no_mojibake():
    r = _evaluate()
    data = json.loads(r.content.decode("utf-8", "strict"))
    name = data.get("name") or ""

    for bad in FORBIDDEN_IN_NAME:
        assert bad not in name, f"Mojibake {bad!r} trouvé dans name: {name!r}"

    assert "Réduire" in name, f"Nom inattendu: {name!r}"