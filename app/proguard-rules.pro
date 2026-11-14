# Reglas de R8 (reduce, optimiza y ofusca el codigo de la app). Las usa app/build.sh.
# Ademas de estas, aapt2 genera build/aapt-rules.pro con las clases que nombra el manifest
# (por si se anade un componente y se olvida aqui). Para compilar sin R8: NO_R8=1 ./app/build.sh
#
# Regla general: solo se conserva el NOMBRE de lo que Android (o Shizuku) busca por texto.
# Todo lo demas se puede renombrar, mover y eliminar.

# --- Optimizacion ---------------------------------------------------------
# (R8 ya optimiza en varias pasadas y no usa esta opcion; se deja por compatibilidad con ProGuard)
-optimizationpasses 5
-allowaccessmodification
# Las clases ofuscadas van al paquete raiz con nombres cortos (a, b, c...)
-repackageclasses ''

# --- Informes de errores legibles -----------------------------------------
# Numeros de linea en las trazas; el nombre del archivo se oculta ("SourceFile").
# Play Console las traduce con el mapping incluido en el AAB.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Componentes del AndroidManifest.xml (Android los crea por su nombre) --
-keep class com.gamepadmapper.app.MainActivity { <init>(); }
-keep class com.gamepadmapper.app.BootReceiver { <init>(); }
# Servicio de accesibilidad (Ajustes > Accesibilidad lo guarda como
# "com.gamepadmapper.app/.PadService" en enabled_accessibility_services)
-keep class com.gamepadmapper.app.PadService { <init>(); }
# Boton de Ajustes rapidos (el sistema recuerda su ComponentName)
-keep class com.gamepadmapper.app.PauseTile { <init>(); }
-keep class com.gamepadmapper.app.OverlayService { <init>(); }
# ContentProvider al que Shizuku entrega su binder ("sendBinder")
-keep class com.gamepadmapper.app.ShizukuClient$Provider { <init>(); }

# --- Shizuku --------------------------------------------------------------
# El servidor de Shizuku escribe en el Bundle el nombre "moe.shizuku.api.BinderContainer" y
# Android lo vuelve a crear por reflexion (campo CREATOR): paquete, nombre y CREATOR exactos.
-keep class moe.shizuku.api.BinderContainer {
    public static final android.os.Parcelable$Creator CREATOR;
    public android.os.IBinder binder;
    <init>(...);
}

# --- Parcelable en general (Parcel busca el campo CREATOR por reflexion) ----
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# --- Codigo que el sistema llama por nombre -------------------------------
# No hay layouts XML ni android:onClick ni @JavascriptInterface ni reflexion propia: las vistas
# (PadTestView, ProfilePreviewView...) se crean en codigo y se pueden ofuscar.
# Metodos nativos (no hay ahora; si se anaden, JNI los busca por nombre)
-keepclasseswithmembernames class * {
    native <methods>;
}
