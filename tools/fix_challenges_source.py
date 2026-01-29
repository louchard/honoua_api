from pathlib import Path

p = Path("app/routers/challenges.py")
raw = p.read_bytes()

# 1) Strip UTF-8 BOM bytes (EF BB BF)
if raw.startswith(b"\xef\xbb\xbf"):
    raw = raw[3:]

txt = raw.decode("utf-8", "strict")

# 2) Strip Unicode BOM (U+FEFF)
txt = txt.lstrip("\ufeff")

lines = txt.splitlines(True)
if not lines:
    raise SystemExit("Fichier vide")

# 3) Force la ligne 1 (et vire tout parasite éventuel)
eol = "\r\n" if lines[0].endswith("\r\n") else "\n"
lines[0] = "from fastapi import APIRouter, Depends, HTTPException" + eol
txt = "".join(lines)

# 4) Source ASCII-safe: remplacer glyphes interdits par escapes
repl = {
    "\u00C3": r"\u00C3",  # Ã
    "\u00C2": r"\u00C2",  # Â
    "\u00F0": r"\u00F0",  # ð
    "\uFFFD": r"\uFFFD",  # �
}
for ch, esc in repl.items():
    txt = txt.replace(ch, esc)

# 5) Écriture UTF-8 sans BOM + LF
p.write_text(txt, encoding="utf-8", newline="\n")

print("OK: challenges.py rewritten (no BOM + fixed line1 + ASCII-safe source)")