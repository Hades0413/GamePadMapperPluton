# Cómo contribuir

¡Gracias por querer mejorar Gamepad Mapper Plutón! Estas son las reglas para que todo vaya ordenado.

## Ramas

| Rama | Para qué | Quién escribe |
|---|---|---|
| `main` | Versión estable. Cada tag `vX.Y` publica un Release. | Solo por pull request desde `develop`, aprobado por el autor. |
| `develop` | Integración de cambios para la próxima versión. | Solo por pull request, aprobado por el autor. |
| `tu-rama` | Tu cambio (en tu fork). | Tú. |

Nombres recomendados para tu rama: `arreglo/descripcion-corta`, `mejora/descripcion-corta`,
`perfil/nombre-del-juego`, `docs/...`.

## Pasos

1. Haz un **fork** del repositorio y crea tu rama a partir de `develop`.
2. Prepara el entorno: `make setup` (descarga las herramientas en `tools/`).
3. Haz tu cambio y comprueba:
   - `make test` (formato de perfiles en la app y en `gpmapper`).
   - `make build` si tocas la app o el módulo.
   - `make web-check` si tocas `web/` (necesita Node 22+ y **pnpm**).
4. Abre un **pull request contra `develop`** y rellena la plantilla.
5. El CI se ejecuta cuando el autor lo autoriza (la primera vez que contribuyes). Todo cambio
   necesita la **aprobación del autor** antes de entrar.

## Normas del código

- Idioma: **español** (comentarios de código sin tildes en Java/C; la interfaz con tildes y ñ).
- Sin dependencias nuevas sin hablarlo antes en un issue (la app se compila sin Gradle).
- La web usa **pnpm**, TypeScript estricto y su arquitectura por capas (ver `web/README.md`).
- Si cambias el formato de los perfiles `.conf`, actualízalo en todos los sitios que lo leen
  (`Profile.java`, `mapper/src/core/gpm_core.c`, `web/src/domain/profile/conf/validateConf.ts`, `supabase/migrations`).
- Si cambias el motor (`mapper/src/core/`), `make test` repite los guiones de `tests/engine/`: si el cambio
  de los toques es a propósito, `ACTUALIZAR=1 make test` y revisa el diff de los `.esperado`.
- Nunca subas claves, contraseñas, keystores (`*.jks`) ni archivos `.env`.

## Perfiles de juegos

Los perfiles se comparten desde la web (https://hades0413.github.io/GamePadMapperPluton/), no por
pull request. En el repositorio solo están los perfiles de ejemplo de `presets/`.

## Seguridad

Si encuentras una vulnerabilidad, **no abras un issue público**: sigue [SECURITY.md](SECURITY.md).

## Licencia

Al contribuir aceptas que tu aportación se publique bajo la licencia del proyecto,
[PolyForm Noncommercial 1.0.0](LICENSE).
