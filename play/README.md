# Google Play: preparación para producción

Todo lo necesario para pasar de la prueba cerrada a producción con una cuenta **personal** de
desarrollador. Español e inglés.

| Archivo | Qué es |
|---|---|
| [`ficha-es.md`](ficha-es.md) / [`ficha-en.md`](ficha-en.md) | Nombre, descripción breve y completa, y Novedades de la 1.7 (comprobado con `comprobar-ficha.sh`) |
| [`prueba-cerrada.md`](prueba-cerrada.md) | Plan de 14 días con ≥ 12 testers, checklist de Play Console, mensaje para reclutar (ES/EN) y respuestas para «Solicitar acceso a producción» |
| [`testers.csv`](testers.csv) | Plantilla de seguimiento de testers (guarda la copia con correos FUERA del repositorio) |
| [`politicas.md`](politicas.md) | Seguridad de los datos, declaración de la API de Accesibilidad, servicio en primer plano, permisos, clasificación IARC y público objetivo |
| [`capturas.sh`](capturas.sh) | Regenera las capturas desde el emulador (`adb screencap` a 1080×2400), con un juego de demostración para la burbuja y el editor |
| `capturas/es`, `capturas/en` | Capturas listas para subir (1080×2160 verticales, 2160×1080 horizontales: Play admite como mucho 2:1) |
| [`demo-juego/`](demo-juego) | Juego de demostración (solo para las capturas; no se publica) y su perfil |

```bash
make apk                                     # o el APK que vayas a enseñar
~/Android/Sdk/emulator/emulator -avd Pixel_7_API_35 -no-snapshot-save -no-audio &
./play/capturas.sh                           # solo emuladores (se niega con un teléfono real)
./play/comprobar-ficha.sh                    # límites de caracteres de la ficha
```

## Subida automática a Play (prueba interna)

Al publicar una versión (`make release`, tag `v*`), GitHub Actions compila y firma el AAB y lo sube
solo a la pista **Prueba interna** (job `play` de `build.yml`, script `scripts/play-subir.py`).

- **Notas de la versión**: `play/novedades/<versión>/es-ES.txt` y `en-US.txt` (máx. 500
  caracteres), **antes** de `make release` (no publica si faltan).
- **Mientras la app no haya pasado la primera revisión de Google** («(unreviewed)»), Play solo
  acepta borradores por la API: la versión queda como borrador en *Prueba interna* y hay que
  pulsar *Guardar y publicar* en Play Console. Después de la revisión se publica sola.
- **Si el código de versión ya está en Play** (subido a mano), se usa ese bundle sin volver a subirlo.
- **Pasar a la prueba cerrada**: `PLAY_SERVICE_ACCOUNT_JSON_FILE=… make play-promover` (misma
  versión y notas que la prueba interna; `PISTA=beta` para la abierta). **Producción**, solo a mano
  en Play Console (*Promocionar versión*): la cuenta de servicio no tiene ese permiso a propósito.
- **En local**: `PLAY_SERVICE_ACCOUNT_JSON_FILE=/ruta/fuera/del/repo/clave.json make play-subir`.

### Cuenta de servicio (una sola vez)

1. Google Cloud Console → proyecto propio (p. ej. «gamepad-mapper-play») → *APIs y servicios* →
   activa **Google Play Android Developer API**.
2. *IAM y administración › Cuentas de servicio* → *Crear cuenta de servicio* (sin roles de Cloud).
   En la cuenta → *Claves › Agregar clave › JSON*: descarga el archivo y guárdalo **fuera** del
   repositorio.
3. Play Console → *Usuarios y permisos* → *Invitar a usuarios nuevos* → el correo de la cuenta de
   servicio (`…@….iam.gserviceaccount.com`) → pestaña *Permisos de la app* → esta app →
   *Publicar en pistas de prueba* (y *Ver información de la app*). Sin permisos de cuenta.
4. El JSON va al secreto `PLAY_SERVICE_ACCOUNT_JSON` del entorno **google-play** del repositorio
   (solo lo pueden usar los tags `v*`).

## Antes de subir esta versión

- **Versión**: 1.7.1 (versionCode 10, optimizada con R8), con los mandos de la comunidad en modo root y la copia en la nube. Sube el AAB de `make aab`.
- **Código ofuscado (R8)**: el AAB ya lleva el mapping (`BUNDLE-METADATA/.../proguard.map`), así
  que Play traduce solo las trazas de *Android vitals*. Si Play pidiera el archivo de
  desofuscación (o para una versión subida sin él): *Probar y publicar › Explorador de apps y
  paquetes* › la versión › *Descargas* › *Archivo de desofuscación* → sube
  `dist/GamepadMapper-<versión>-mapping.txt` (de la **misma** compilación que el AAB).
- **Módulo root**: esta rama trae gpmapper **v7** (lee `mando.map`). La app avisa a quien tenga la
  v6 de que actualice el módulo.
- **Privacidad**: actualiza la página de privacidad de la web (ver final de `politicas.md`).

## Copia en la nube: pasos en Supabase (una sola vez)

La app inicia sesión con GitHub mediante Supabase Auth (OAuth con PKCE en el navegador) y vuelve
con `gpmapper://auth`. No hace falta otra OAuth App de GitHub: usa el proveedor GitHub que ya
tiene la web.

1. **Aplicar la migración** `supabase/migrations/20261114070000_copias_de_perfiles.sql`
   (*SQL Editor* → pegar → *Run*). Crea la tabla privada `profile_backups` y las funciones
   `backup_put`, `backup_list`, `backup_get`, `backup_delete` y `backup_delete_all`. Se prueba con
   `make db-test` (`supabase/tests/95_copias.sql`).
2. **URL de vuelta**: *Authentication → URL Configuration → Redirect URLs → Add URL*:
   `gpmapper://auth**`
   (con `**`: la app vuelve a `gpmapper://auth?state=…` y Supabase compara la dirección completa;
   sin el comodín, Supabase la rechaza y manda al usuario a la web). No cambies la *Site URL*.
3. Nada más: el proveedor GitHub, el registro solo con GitHub y el límite de 100 filas ya están
   configurados para la web. `delete_my_account` (web) borra también la copia (borrado en cascada).

Seguridad de la app: el `code_verifier` (PKCE) y el `state` se guardan cifrados hasta volver (10
minutos como mucho, un solo intento); el token de refresco se guarda cifrado con una clave AES-GCM
del Android Keystore (no exportable) y el de acceso solo en memoria; *Cerrar sesión* revoca el token
y borra la sesión y la clave. `allowBackup="false"`: nada de esto entra en las copias de Android.
