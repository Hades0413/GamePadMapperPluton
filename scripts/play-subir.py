#!/usr/bin/env python3
"""Sube el AAB a una pista de Google Play (por defecto «Prueba interna») con la API oficial.

    python3 -I scripts/play-subir.py dist/GamepadMapper-1.7.1.aab
    python3 -I scripts/play-subir.py --comprobar     (solo comprueba el acceso; no cambia nada)

Credenciales (cuenta de servicio con permiso de publicar en la app), por orden:
  PLAY_SERVICE_ACCOUNT_JSON       contenido del JSON de la clave (asi lo pasa GitHub Actions)
  PLAY_SERVICE_ACCOUNT_JSON_FILE  ruta al JSON (para usarlo en local; nunca dentro del repositorio)
Opcional:
  PLAY_TRACK   internal (por defecto), alpha (prueba cerrada), beta (abierta) o production
  PLAY_STATUS  completed (por defecto) o draft (queda como borrador para revisarlo en Play Console)

Notas de la version: play/novedades/<idioma>.txt (es-ES.txt, en-US.txt...), maximo 500 caracteres.

Solo usa la biblioteca estandar y openssl (para firmar el acceso): sin paquetes de terceros que
puedan ver la clave. La clave privada se escribe en un archivo temporal 0600 y se borra al acabar.
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PAQUETE = "com.gamepadmapper.app"
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PAQUETE}"
SUBIDA = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PAQUETE}"
ALCANCE = "https://www.googleapis.com/auth/androidpublisher"
PISTAS = {"internal", "alpha", "beta", "production"}
RAIZ = Path(__file__).resolve().parent.parent


def fallo(msg: str) -> "None":
    print(f"play-subir: {msg}", file=sys.stderr)
    sys.exit(1)


def b64url(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def cuenta_de_servicio() -> dict:
    texto = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON", "").strip()
    if not texto and os.environ.get("PLAY_SERVICE_ACCOUNT_JSON_FILE"):
        texto = Path(os.environ["PLAY_SERVICE_ACCOUNT_JSON_FILE"]).read_text(encoding="utf-8")
    if not texto:
        fallo("falta PLAY_SERVICE_ACCOUNT_JSON (o PLAY_SERVICE_ACCOUNT_JSON_FILE)")
    try:
        cuenta = json.loads(texto)
    except json.JSONDecodeError:
        fallo("la clave de la cuenta de servicio no es un JSON valido")
    for campo in ("client_email", "private_key", "token_uri"):
        if not cuenta.get(campo):
            fallo(f"a la clave de la cuenta de servicio le falta «{campo}»")
    return cuenta


def token_de_acceso(cuenta: dict) -> str:
    ahora = int(time.time())
    cabecera = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    datos = b64url(json.dumps({
        "iss": cuenta["client_email"], "scope": ALCANCE, "aud": cuenta["token_uri"],
        "iat": ahora, "exp": ahora + 1800,
    }).encode())
    firmar = f"{cabecera}.{datos}".encode()
    fd, ruta = tempfile.mkstemp(suffix=".pem")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(cuenta["private_key"])
        firma = subprocess.run(["openssl", "dgst", "-sha256", "-sign", ruta], input=firmar,
                               capture_output=True, check=True).stdout
    except subprocess.CalledProcessError:
        fallo("openssl no pudo firmar con la clave de la cuenta de servicio")
    finally:
        os.unlink(ruta)
    jwt = f"{cabecera}.{datos}.{b64url(firma)}"
    cuerpo = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": jwt}).encode()
    try:
        return pedir("POST", cuenta["token_uri"], cuerpo, tipo="application/x-www-form-urlencoded")["access_token"]
    except ErrorPlay as e:
        fallo(f"Google rechazo la cuenta de servicio ({e.mensaje}). ¿Clave borrada o de otro proyecto?")


def pedir(metodo: str, url: str, cuerpo: bytes | None = None, token: str | None = None,
          tipo: str = "application/json") -> dict:
    peticion = urllib.request.Request(url, data=cuerpo, method=metodo)
    if cuerpo is not None:
        peticion.add_header("Content-Type", tipo)
    if token:
        peticion.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(peticion, timeout=600) as r:
            texto = r.read().decode()
    except urllib.error.HTTPError as e:
        detalle = e.read().decode(errors="replace")
        try:
            detalle = json.loads(detalle)["error"]["message"]
        except (ValueError, KeyError, TypeError):
            pass
        raise ErrorPlay(e.code, detalle) from None
    except urllib.error.URLError as e:
        fallo(f"sin conexion con {urllib.parse.urlsplit(url).netloc}: {e.reason}")
    return json.loads(texto) if texto.strip() else {}


class ErrorPlay(Exception):
    def __init__(self, codigo: int, mensaje: str):
        super().__init__(f"HTTP {codigo}: {mensaje}")
        self.codigo, self.mensaje = codigo, mensaje


def version_del_aab(aab: Path) -> str:
    """versionName para el nombre de la version en Play (del nombre GamepadMapper-<version>.aab)."""
    m = re.search(r"GamepadMapper-([0-9][0-9A-Za-z.\-]*)\.aab$", aab.name)
    return m.group(1) if m else aab.stem


def codigo_del_manifiesto() -> int:
    """versionCode de app/AndroidManifest.xml (el mismo con el que se compilo el AAB)."""
    texto = (RAIZ / "app" / "AndroidManifest.xml").read_text(encoding="utf-8")
    m = re.search(r'android:versionCode="(\d+)"', texto)
    if not m:
        fallo("no se encontro android:versionCode en app/AndroidManifest.xml")
    return int(m.group(1))


def notas() -> list[dict]:
    carpeta = RAIZ / "play" / "novedades"
    lista = []
    for f in sorted(carpeta.glob("*.txt")) if carpeta.is_dir() else []:
        texto = f.read_text(encoding="utf-8").strip()
        if not texto:
            continue
        if len(texto) > 500:
            fallo(f"{f.relative_to(RAIZ)} pasa de 500 caracteres ({len(texto)})")
        lista.append({"language": f.stem, "text": texto})
    return lista


def comprobar() -> None:
    """Abre una edicion, lee los bundles y las pistas y la descarta: no cambia nada en Play."""
    token = token_de_acceso(cuenta_de_servicio())
    try:
        edicion = pedir("POST", f"{API}/edits", b"{}", token)["id"]
        try:
            bundles = pedir("GET", f"{API}/edits/{edicion}/bundles", None, token).get("bundles", [])
            pistas = pedir("GET", f"{API}/edits/{edicion}/tracks", None, token).get("tracks", [])
        finally:
            pedir("DELETE", f"{API}/edits/{edicion}", None, token)
    except ErrorPlay as e:
        fallo(f"sin acceso a la app en Play ({e.mensaje}). ¿Invitaste la cuenta de servicio en "
              "Usuarios y permisos con esta app y la API activada?")
    print("Acceso correcto a", PAQUETE)
    print("  bundles en Play:", ", ".join(str(b.get("versionCode")) for b in bundles) or "ninguno")
    for p in pistas:
        for v in p.get("releases", []):
            print(f"  pista {p['track']}: {v.get('name')} {v.get('versionCodes')} ({v.get('status')})")


def main() -> None:
    if sys.argv[1:] == ["--comprobar"]:
        return comprobar()
    if len(sys.argv) != 2:
        fallo("uso: play-subir.py <archivo.aab>")
    aab = Path(sys.argv[1])
    if not aab.is_file() or aab.suffix != ".aab":
        fallo(f"no existe el AAB {aab}")
    pista = os.environ.get("PLAY_TRACK", "internal")
    estado = os.environ.get("PLAY_STATUS", "completed")
    if pista not in PISTAS:
        fallo(f"pista desconocida «{pista}» (usa {', '.join(sorted(PISTAS))})")
    if estado not in {"completed", "draft"}:
        fallo("PLAY_STATUS debe ser completed o draft")

    token = token_de_acceso(cuenta_de_servicio())
    nombre = version_del_aab(aab)
    edicion = pedir("POST", f"{API}/edits", b"{}", token)["id"]
    try:
        print(f"Subiendo {aab.name} ({aab.stat().st_size // 1024} KB)...")
        try:
            bundle = pedir("POST", f"{SUBIDA}/edits/{edicion}/bundles?uploadType=media",
                           aab.read_bytes(), token, tipo="application/octet-stream")
            codigo = bundle["versionCode"]
            print(f"  subido: versionCode {codigo}")
        except ErrorPlay as e:
            # Ya subido antes (a mano o en un intento anterior): se usa el que tiene Play.
            codigo = codigo_del_manifiesto()
            subidos = pedir("GET", f"{API}/edits/{edicion}/bundles", None, token).get("bundles", [])
            if not any(b.get("versionCode") == codigo for b in subidos):
                raise e
            print(f"  versionCode {codigo} ya estaba en Play: se usa ese")

        def asignar(est: str) -> None:
            version = {"name": nombre, "versionCodes": [str(codigo)], "status": est}
            if notas():
                version["releaseNotes"] = notas()
            pedir("PUT", f"{API}/edits/{edicion}/tracks/{pista}",
                  json.dumps({"track": pista, "releases": [version]}).encode(), token)

        try:
            asignar(estado)
        except ErrorPlay as e:
            # Mientras la app no haya pasado la primera revision de Google, Play solo acepta borradores.
            if estado == "completed" and "draft" in e.mensaje.lower():
                print("  Play solo acepta borradores en esta app todavia (sin revisar): se deja como borrador.")
                estado = "draft"
                asignar(estado)
            else:
                raise
        pedir("POST", f"{API}/edits/{edicion}:commit", b"{}", token)
    except ErrorPlay as e:
        try:
            pedir("DELETE", f"{API}/edits/{edicion}", None, token)
        except ErrorPlay:
            pass
        if e.codigo == 403 or "permission" in e.mensaje.lower():
            fallo(f"sin permiso en Play Console ({e.mensaje}). ¿La cuenta de servicio esta invitada "
                  "con permiso para publicar en la app y la API «Google Play Android Developer» activada?")
        fallo(e.mensaje)

    if estado == "draft":
        print(f"Listo: version {nombre} ({codigo}) como BORRADOR en la pista «{pista}». "
              "Revisala y pulsa «Guardar y publicar» en Play Console.")
    else:
        print(f"Listo: version {nombre} ({codigo}) publicada en la pista «{pista}».")


if __name__ == "__main__":
    main()
