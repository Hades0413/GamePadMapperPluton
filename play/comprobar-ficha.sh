#!/usr/bin/env bash
# Comprueba los limites de Google Play en play/ficha-*.md: nombre <= 30, breve <= 80,
# completa <= 4000 y novedades <= 500 caracteres (Unicode, como cuenta Play Console).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
python3 -I - "$here"/ficha-*.md <<'PY'
import re, sys
limits = {"titulo": 30, "breve": 80, "completa": 4000, "novedades": 500}
bad = 0
for path in sys.argv[1:]:
    text = open(path, encoding="utf-8").read()
    for key, lim in limits.items():
        m = re.search(r"<!-- %s -->\n(.*?)\n<!-- /%s -->" % (key, key), text, re.S)
        if not m:
            print(f"{path}: falta el bloque {key}"); bad = 1; continue
        n = len(m.group(1))
        ok = n <= lim
        bad |= not ok
        print(f"{'ok   ' if ok else 'LARGO'} {path.split('/')[-1]:12} {key:10} {n:5} / {lim}")
sys.exit(bad)
PY
