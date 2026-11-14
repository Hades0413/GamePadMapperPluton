#!/usr/bin/env bash
# Equivalente Linux de build.ps1: empaqueta un modulo Magisk en dist/<id>-<version>.zip.
# Rutas con "/", textos (.prop .idc .sh .kl .kcm .conf .txt y scripts META-INF) en LF
# y UTF-8 sin BOM; el resto byte a byte.
#   ./build.sh                          # module/ -> dist/
#   ./build.sh <dir_modulo> <dir_salida>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
module_dir="${1:-$here/module}"
out_dir="${2:-$here/dist}"

PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "Falta Python 3 (python3 o python en el PATH)" >&2; exit 1; }
"$PY" -I - "$module_dir" "$out_dir" <<'PY'
import os, re, sys, zipfile
mod, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
prop = os.path.join(mod, 'module.prop')
if not os.path.isfile(prop):
    sys.exit(f'No se encontro {prop}')
props = {}
for line in open(prop, encoding='utf-8-sig'):
    m = re.match(r'^\s*([^#=]+?)\s*=\s*(.*)$', line.rstrip('\r\n'))
    if m: props[m.group(1)] = m.group(2)
for k in ('id', 'version', 'versionCode'):
    if not props.get(k): sys.exit(f"module.prop no tiene '{k}'")
os.makedirs(out, exist_ok=True)
zpath = os.path.join(out, f"{props['id']}-{props['version']}.zip")
if os.path.exists(zpath): os.remove(zpath)
text_ext = {'.prop', '.idc', '.sh', '.kl', '.kcm', '.conf', '.txt'}
text_names = {'update-binary', 'updater-script'}
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for d, _, files in sorted(os.walk(mod)):
        for f in sorted(files):
            full = os.path.join(d, f)
            rel = os.path.relpath(full, mod).replace(os.sep, '/')
            data = open(full, 'rb').read()
            if os.path.splitext(f)[1].lower() in text_ext or f in text_names:
                data = data.decode('utf-8-sig').replace('\r\n', '\n').encode('utf-8')
            z.writestr(rel, data)
            print(f'  + {rel}')
print(f"\nModulo generado: {zpath}")
print(f"  {props.get('name','')} {props['version']} (versionCode {props['versionCode']})")
PY
