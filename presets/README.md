# Catálogo de perfiles

Esta carpeta es el catálogo que la app **Gamepad Mapper** descarga con
*Biblioteca → Descargar perfiles*.

Cuando subas el proyecto a GitHub, configura en la app (*Biblioteca → Fuente*) la
dirección del `index.json` en formato *raw*:

```
https://raw.githubusercontent.com/Hades0413/GamePadMapperPluton/main/presets/index.json
```

## Añadir un perfil

1. Crea el perfil en la app (*+ Nuevo perfil* y el editor flotante) y guárdalo.
2. Cópialo aquí. Lo encuentras en el celular en `/sdcard/Android/data/com.gamepadmapper.app/files/profiles/<paquete>.conf`:
   ```powershell
   ..\tools\platform-tools\adb.exe pull /sdcard/Android/data/com.gamepadmapper.app/files/profiles/<paquete>.conf .
   ```
3. Añade una entrada en `index.json`:
   ```json
   { "name": "Nombre del juego", "package": "com.paquete.juego", "file": "<paquete>.conf",
     "author": "tu nombre", "description": "que incluye" }
   ```

Las coordenadas se guardan con el tamaño de pantalla (`screen = ANCHOxALTO`) y se
adaptan solas a otras resoluciones. Si un móvil tiene una proporción distinta
(por ejemplo 20:9 frente a 16:9), puede hacer falta ajustar un poco las posiciones con el editor.
