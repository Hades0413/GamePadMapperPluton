# =============================================================================
# Makefile - Gamepad Mapper Plutón
# Funciona en Linux, macOS y Windows (Git Bash o MSYS2, con "make" instalado).
# Uso: make  (o "make help") para ver todos los comandos.
# =============================================================================

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help
.ONESHELL:

comma := ,

# Version de la app (de app/AndroidManifest.xml)
VERSION := $(shell sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' app/AndroidManifest.xml)
CODE    := $(shell sed -n 's/.*android:versionCode="\([^"]*\)".*/\1/p' app/AndroidManifest.xml)
PKG     := com.gamepadmapper.app
APK     := dist/GamepadMapper-$(VERSION).apk
AAB     := dist/GamepadMapper-$(VERSION).aab

# adb: el de tools/ si existe; si no, el del sistema
ADB := $(firstword $(wildcard tools/android-sdk/platform-tools/adb tools/android-sdk/platform-tools/adb.exe) adb)
# Primer telefono conectado y autorizado (vacio si no hay)
DEVICE = $(shell $(ADB) devices 2>/dev/null | awk 'NR>1 && $$2=="device"{print $$1; exit}')

.PHONY: help setup doctor test module touchfix escritorio escritorio-linux escritorio-windows apk aab build install run uninstall \
        logs logs-off devices version bump release clean distclean web-install web-dev web-check web-build db-test

# =============================================================================
# PREPARACION
# =============================================================================

setup: ## Descarga Zig, JDK 21, Android SDK 36 y bundletool en tools/ (segun tu sistema)
	@./scripts/setup-tools.sh

doctor: ## Comprueba herramientas, clave de firma y telefono conectado
	@ok=1
	@for t in tools/zig tools/jdk tools/android-sdk/platforms/android-36 tools/android-sdk/build-tools/36.1.0 tools/bundletool.jar; do \
		if [ -e "$$t" ]; then echo "  ✅ $$t"; else echo "  ❌ $$t  (ejecuta: make setup)"; ok=0; fi; done
	@if [ -f "$${KEYSTORE_DIR:-../../gamepad-mapper-CLAVE-FIRMA-PRIVADA/keystore}/gamepad-mapper.jks" ] || [ -f keystore/gamepad-mapper.jks ]; \
		then echo "  ✅ clave de firma"; else echo "  ❌ clave de firma (KEYSTORE_DIR=<carpeta> o ../../gamepad-mapper-CLAVE-FIRMA-PRIVADA/keystore)"; fi
	@if [ -n "$(DEVICE)" ]; then echo "  ✅ telefono: $(DEVICE)"; else echo "  ⚠️  sin telefono conectado (solo hace falta para install/run/logs)"; fi
	@echo "  version $(VERSION) (versionCode $(CODE))"

# =============================================================================
# PRUEBAS Y COMPILACION
# =============================================================================

test: ## Pruebas del formato de perfil (la app y gpmapper deben entenderlo igual)
	@./tests/run.sh

module: ## Motor root (gpmapper ARM64) + modulo Magisk -> dist/gamepad_mapper-vN.zip
	@./mapper/build.sh

touchfix: ## Modulo "Touch Fix" del GamepadPlus V3 -> dist/gamepadplus_touchfix-vN.zip
	@./build.sh

escritorio-linux: ## Version de escritorio para Linux -> dist/gpm-escritorio-linux-x86_64
	@./desktop/build.sh linux

escritorio-windows: ## Version de escritorio para Windows -> dist/gpm-escritorio-windows-x86_64.exe
	@./desktop/build.sh windows

escritorio: escritorio-linux escritorio-windows ## Las dos versiones de escritorio

# =============================================================================
# APP DE ESCRITORIO (desktop/app/: Tauri v2, Rust + React; necesita Rust, Node 22+ y pnpm)
# =============================================================================

app-escritorio-ui: ## App de escritorio: interfaz (tipos, lint, pruebas) -> desktop/app/ui/dist
	@cd desktop/app/ui && pnpm install --frozen-lockfile && pnpm check && pnpm build

app-escritorio-dev: ## App de escritorio: interfaz en el navegador con un mando simulado (http://localhost:1420)
	@cd desktop/app/ui && pnpm install --frozen-lockfile && pnpm dev

app-escritorio-test: ## App de escritorio: pruebas del nucleo (y con un mando virtual uinput si hay permiso)
	@cd desktop/app && cargo test -p gpm-nucleo
	@if [ -w /dev/uinput ]; then cd desktop/app && cargo test -p gpm-nucleo --test uinput -- --ignored; \
		else echo "⚠️  sin permiso en /dev/uinput: se salta la prueba con mando virtual"; fi

app-escritorio: app-escritorio-ui ## App de escritorio (Tauri) -> desktop/app/target/release/bundle/
	@cd desktop/app && ui/node_modules/.bin/tauri build $(if $(filter Windows_NT,$(OS)),--bundles nsis,--bundles deb$(comma)appimage)

apk: module ## APK firmado para instalar por USB -> dist/GamepadMapper-<version>.apk
	@./app/build.sh apk

aab: module ## App Bundle firmado para Google Play -> dist/GamepadMapper-<version>.aab
	@./app/build.sh aab

build: test module touchfix ## Todo: pruebas + modulos + APK + AAB
	@./app/build.sh all
	@echo ""
	@echo "✅ Listo en dist/:"
	@ls -1 dist/ | sed 's/^/   /'

# =============================================================================
# TELEFONO (depuracion USB)
# =============================================================================

devices: ## Lista los telefonos conectados
	@$(ADB) devices -l

define need_device
	@if [ -z "$(DEVICE)" ]; then echo "❌ No hay telefono conectado y autorizado. Activa la depuracion USB y acepta el aviso."; exit 1; fi
endef

install: ## Instala el APK en el telefono (toca «Instalar» si el telefono lo pide)
	$(need_device)
	@[ -f "$(APK)" ] || $(MAKE) --no-print-directory apk
	@echo "Instalando $(APK) en $(DEVICE)..."
	@$(ADB) -s $(DEVICE) install --no-incremental -r "$(APK)"

run: install ## Instala y abre la app
	@$(ADB) -s $(DEVICE) shell monkey -p $(PKG) -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
	@echo "✅ App abierta en $(DEVICE)"

uninstall: ## Desinstala la app conservando sus datos y perfiles (-k)
	$(need_device)
	@$(ADB) -s $(DEVICE) shell cmd package uninstall -k $(PKG) || true

logs: ## Activa el registro de depuracion y lo muestra en vivo (Ctrl+C para salir)
	$(need_device)
	@$(ADB) -s $(DEVICE) shell touch /sdcard/Android/data/com.gamepadmapper.app/files/debug
	@echo "Registro activado (pad.log / mapper.log). Ctrl+C para salir; luego: make logs-off"
	@$(ADB) -s $(DEVICE) shell 'tail -n 30 -F /sdcard/Android/data/com.gamepadmapper.app/files/pad.log /sdcard/Android/data/com.gamepadmapper.app/files/mapper.log 2>/dev/null'

logs-off: ## Desactiva el registro de depuracion
	$(need_device)
	@$(ADB) -s $(DEVICE) shell rm -f /sdcard/Android/data/com.gamepadmapper.app/files/debug
	@echo "Registro desactivado"

# =============================================================================
# VERSIONES Y PUBLICACION
# =============================================================================

version: ## Muestra la version actual
	@echo "Gamepad Mapper Plutón $(VERSION) (versionCode $(CODE))"

bump: ## Sube la version: make bump V=1.2  (versionCode +1 automatico)
	@[ -n "$(V)" ] || { echo "Uso: make bump V=1.2"; exit 1; }
	@new=$$(( $(CODE) + 1 ))
	@sed -i.bak -e 's/android:versionName="[^"]*"/android:versionName="$(V)"/' \
		-e "s/android:versionCode=\"[^\"]*\"/android:versionCode=\"$$new\"/" app/AndroidManifest.xml
	@sed -i.bak -e 's/GamepadMapperPluton-[0-9][0-9.]*\.apk/GamepadMapperPluton-$(V).apk/' \
		-e 's/^Versión \*\*[0-9][0-9.]*\*\*/Versión **$(V)**/' README.md
	@rm -f app/AndroidManifest.xml.bak README.md.bak
	@echo "✅ Version $(V) (versionCode $$new). Revisa, haz commit y luego: make release"

release: test ## Publica: tag v<version> sobre main (ya fusionado) y GitHub compila, firma y sube el Release
	@[ -z "$$(git status --porcelain)" ] || { echo "❌ Hay cambios sin commit. Haz commit primero."; exit 1; }
	@if git rev-parse "v$(VERSION)" >/dev/null 2>&1; then echo "❌ El tag v$(VERSION) ya existe. Sube la version: make bump V=x.y"; exit 1; fi
	@git fetch -q origin main
	@[ "$$(git rev-parse HEAD)" = "$$(git rev-parse origin/main)" ] || { echo "❌ HEAD no es origin/main. main esta protegida: fusiona el PR develop -> main, luego git checkout main && git pull"; exit 1; }
	@git tag "v$(VERSION)"
	@git push origin "v$(VERSION)"
	@echo "✅ Tag v$(VERSION) subido: GitHub Actions publicara el Release en unos minutos."
	@echo "   Para Google Play: make aab y sube $(AAB) en Play Console."

# =============================================================================
# WEB (web/: React + Vite, necesita Node 22+ y pnpm)
# =============================================================================

db-test: ## Pruebas de la base de datos (migraciones, seguridad, «me gusta»...); necesita Docker
	@./supabase/tests/run.sh

web-install: ## Instala las dependencias de la web
	@cd web && pnpm install --frozen-lockfile

web-dev: ## Web en modo desarrollo (http://localhost:5173)
	@cd web && pnpm dev

web-check: ## Web: tipos, lint y pruebas
	@cd web && pnpm check

web-build: ## Compila la web en web/dist (necesita web/.env.local)
	@cd web && pnpm build

# =============================================================================
# LIMPIEZA
# =============================================================================

clean: ## Borra lo compilado (app/build y dist)
	@rm -rf app/build dist
	@echo "✅ Limpieza completada"

distclean: clean ## Ademas borra las herramientas descargadas (tools/)
	@rm -rf tools
	@echo "✅ Herramientas borradas (make setup para volver a descargarlas)"

# =============================================================================
# AYUDA
# =============================================================================

help: ## Muestra esta ayuda
	@echo "=============================================================================="
	@echo " Gamepad Mapper Plutón $(VERSION) - comandos"
	@echo "=============================================================================="
	@awk 'BEGIN{FS=":.*## "} /^# [A-ZÁÉÍÓÚ][A-ZÁÉÍÓÚ ]+( \(.*\))?$$/{gsub(/^# /,""); printf "\n%s\n", $$0} /^[a-z-]+:.*## /{printf "  make %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Primera vez: make setup  ->  make build  ->  make run"
