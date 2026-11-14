#!/usr/bin/env bash
# Descarga las herramientas de compilacion en tools/ (Linux, macOS o Windows con Git Bash),
# segun el sistema y el procesador. Comprueba las descargas (SHA-256) cuando el proveedor lo
# publica. Lo que ya existe no se vuelve a descargar. Uso: make setup  (o este script).
#   tools/zig            Zig 0.13 (compila gpmapper para ARM64)
#   tools/jdk            JDK 21 (Temurin)
#   tools/android-sdk    platform android-36, build-tools 36.1.0, platform-tools (adb)
#   tools/bundletool.jar bundletool (App Bundle para Google Play)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tools="$root/tools"
dl="$tools/.descargas"
mkdir -p "$tools" "$dl"

ZIG_VERSION=0.13.0
JDK_MAJOR=21
CMDLINE_TOOLS=11076708
BUNDLETOOL_VERSION=1.18.3
PLATFORM="${PLATFORM:-android-36}"
BUILD_TOOLS="${BUILD_TOOLS:-36.1.0}"

PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "Falta Python 3 (python3 o python)" >&2; exit 1; }

case "$(uname -s)" in
    Linux)  os=linux ;;
    Darwin) os=mac ;;
    MINGW*|MSYS*|CYGWIN*) os=windows ;;
    *) echo "Sistema no soportado: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
    x86_64|amd64) arch=x86_64 ;;
    arm64|aarch64) arch=aarch64 ;;
    *) echo "Procesador no soportado: $(uname -m)" >&2; exit 1 ;;
esac
echo "Sistema: $os / $arch"

fetch() {  # fetch URL DESTINO
    echo "  descargando $(basename "$2")..."
    curl -fL --retry 3 --progress-bar -o "$2.part" "$1"
    mv "$2.part" "$2"
}
sha_check() {  # sha_check ARCHIVO SHA256_ESPERADO
    local got
    got="$("$PY" -I -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1")"
    [ "$got" = "$2" ] || { echo "  SHA-256 NO coincide en $(basename "$1"): descarga corrupta" >&2; rm -f "$1"; exit 1; }
    echo "  SHA-256 correcto"
}
extract() {  # extract ARCHIVO DESTINO (quita la carpeta superior)
    local tmp="$dl/x"; rm -rf "$tmp"; mkdir -p "$tmp"
    case "$1" in
        *.zip) "$PY" -I -c 'import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$tmp" ;;
        *) tar -xf "$1" -C "$tmp" ;;
    esac
    local top; top="$(ls "$tmp")"
    rm -rf "$2"; mv "$tmp/$top" "$2"; rm -rf "$tmp"
}

# --- Zig -------------------------------------------------------------------------------
if [ -x "$tools/zig/zig" ] || [ -f "$tools/zig/zig.exe" ]; then echo "Zig: ya instalado"; else
    echo "Zig $ZIG_VERSION:"
    zos=$os; [ "$os" = mac ] && zos=macos
    key="$arch-$zos"; [ "$zos" = macos ] && key="$arch-macos"
    ext=tar.xz; [ "$os" = windows ] && ext=zip
    file="zig-$zos-$arch-$ZIG_VERSION.$ext"
    fetch "https://ziglang.org/download/$ZIG_VERSION/$file" "$dl/$file"
    sum="$(curl -fsSL https://ziglang.org/download/index.json | "$PY" -I -c 'import json,sys;print(json.load(sys.stdin)[sys.argv[1]][sys.argv[2]]["shasum"])' "$ZIG_VERSION" "$key")"
    sha_check "$dl/$file" "$sum"
    extract "$dl/$file" "$tools/zig"
fi

# --- JDK ---------------------------------------------------------------------------------
if [ -f "$tools/jdk/bin/javac" ] || [ -f "$tools/jdk/bin/javac.exe" ]; then echo "JDK: ya instalado"; else
    echo "JDK $JDK_MAJOR (Temurin):"
    jarch=x64; [ "$arch" = aarch64 ] && jarch=aarch64
    api="https://api.adoptium.net/v3"
    info="$(curl -fsSL "$api/assets/latest/$JDK_MAJOR/hotspot?architecture=$jarch&image_type=jdk&os=$os&vendor=eclipse")"
    read -r url name sum < <("$PY" -I -c 'import json,sys;p=json.loads(sys.argv[1])[0]["binary"]["package"];print(p["link"],p["name"],p["checksum"])' "$info")
    fetch "$url" "$dl/$name"
    sha_check "$dl/$name" "$sum"
    extract "$dl/$name" "$tools/jdk"
    # macOS: el JDK viene dentro de Contents/Home
    if [ -d "$tools/jdk/Contents/Home" ]; then mv "$tools/jdk" "$tools/jdk.mac"; mv "$tools/jdk.mac/Contents/Home" "$tools/jdk"; rm -rf "$tools/jdk.mac"; fi
fi
export JAVA_HOME="$tools/jdk"

# --- Android SDK -------------------------------------------------------------------------
sdk="$tools/android-sdk"
have_sdk() { [ -f "$sdk/platforms/$PLATFORM/android.jar" ] && [ -d "$sdk/build-tools/$BUILD_TOOLS" ] && [ -d "$sdk/platform-tools" ]; }
if have_sdk; then echo "Android SDK: ya instalado"; else
    echo "Android SDK ($PLATFORM, build-tools $BUILD_TOOLS, platform-tools):"
    cl="$sdk/cmdline-tools/latest"
    if [ ! -d "$cl" ]; then
        cos=$os; [ "$os" = windows ] && cos=win
        file="commandlinetools-$cos-${CMDLINE_TOOLS}_latest.zip"
        fetch "https://dl.google.com/android/repository/$file" "$dl/$file"
        mkdir -p "$sdk/cmdline-tools"
        extract "$dl/$file" "$cl"
    fi
    sdkm="$cl/bin/sdkmanager"; [ "$os" = windows ] && sdkm="$sdkm.bat"
    chmod +x "$cl/bin/"* 2>/dev/null || true
    yes | "$sdkm" --sdk_root="$sdk" --licenses > /dev/null 2>&1 || true
    "$sdkm" --sdk_root="$sdk" "platforms;$PLATFORM" "build-tools;$BUILD_TOOLS" "platform-tools" > /dev/null
    have_sdk || { echo "No se pudo instalar el Android SDK" >&2; exit 1; }
fi

# --- bundletool ----------------------------------------------------------------------------
if [ -f "$tools/bundletool.jar" ]; then echo "bundletool: ya instalado"; else
    echo "bundletool $BUNDLETOOL_VERSION:"
    fetch "https://github.com/google/bundletool/releases/download/$BUNDLETOOL_VERSION/bundletool-all-$BUNDLETOOL_VERSION.jar" "$tools/bundletool.jar"
fi

rm -rf "$dl"
echo
echo "Herramientas listas en tools/  (siguiente paso: make build)"
