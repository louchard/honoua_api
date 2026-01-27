import os
import json
import urllib.request
import urllib.error
import pytest

# Live Honoua API integration tests are disabled by default.
# Enable explicitly with: set HONOUA_INTEGRATION=1
if os.getenv("HONOUA_INTEGRATION") != "1":
    pytest.skip(
        "Live Honoua API integration tests disabled by default (set HONOUA_INTEGRATION=1 to enable).",
        allow_module_level=True,
    )

BASE = os.getenv("HONOUA_BASE", "https://api.honoua.com").rstrip("/")
USER_ID = int(os.getenv("HONOUA_USER_ID", "1"))
INSTANCE_ID = int(os.getenv("HONOUA_INSTANCE_ID", "3"))

FORBIDDEN_IN_MESSAGE = [
    "\uFFFD",        # replacement char
    "\u201A",        # single low-9 quotation mark (often shows as ",,")
    "CO2,,",
    "CO,,",
    "CO\u00E2",      # "COÃƒÂ¢"
    "\u00C3",        # "ÃƒÆ’"
    "\u00F0\u0178",  # "ÃƒÂ°Ã…Â¸" (mojibake emoji prefix)
]

FORBIDDEN_IN_NAME = [
    "\uFFFD",
    "R\u00C3",       # "RÃƒÆ’"
    "CO\u00E2",
    "\u00F0\u0178",
]

class _Resp:
    def __init__(self, status_code: int, content: bytes):
        self.status_code = status_code
        self.content = content
        try:
            self.text = content.decode("utf-8", errors="replace")
        except Exception:
            self.text = repr(content)

def _evaluate():
    url = f"{BASE}/users/{USER_ID}/challenges/{INSTANCE_ID}/evaluate"
    req = urllib.request.Request(
        url,
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return _Resp(resp.getcode(), resp.read())
    except urllib.error.HTTPError as e:
        return _Resp(e.code, e.read())

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
        assert bad not in msg, f"Artefact {bad!r} trouvÃƒÂ© dans message: {msg!r}"

    assert ("CO2" in msg) or ("CO\u2082" in msg), f"Message sans CO2/CO\u2082: {msg!r}"
    assert "CO2,," not in msg
    assert "CO2," not in msg

def test_evaluate_name_has_no_mojibake():
    r = _evaluate()
    data = json.loads(r.content.decode("utf-8", "strict"))
    name = data.get("name") or ""

    for bad in FORBIDDEN_IN_NAME:
        assert bad not in name, f"Mojibake {bad!r} trouvÃƒÂ© dans name: {name!r}"

    assert name.strip() != "", f"Nom vide inattendu: {name!r}"