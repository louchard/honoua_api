from pathlib import Path

# ASCII-only file. Patterns use unicode escapes to avoid console encoding issues.
FORBIDDEN = [
    "\u00C3",       # U+00C3 mojibake marker
    "\uFFFD",       # U+FFFD replacement char
    "CO\u00E2",     # "CO" + U+00E2
    "\u00F0\u0178", # U+00F0 + U+0178 (common mojibake emoji prefix)
    "\u00F0Y",      # truncated mojibake pattern
]

def test_challenges_py_is_utf8_and_has_no_mojibake():
    root = Path(__file__).resolve().parents[1]
    p = root / "app" / "routers" / "challenges.py"
    raw = p.read_bytes()

    raw.decode("utf-8", "strict")
    txt = raw.decode("utf-8")

    for bad in FORBIDDEN:
        assert bad not in txt, f"Artefact {bad!r} found in {p}"