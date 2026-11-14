// gpm_plataforma.h - lo que el nucleo necesita del sistema (Android, Linux, Windows, repeticion).
//
// El nucleo no llama al sistema operativo: cada plataforma rellena esta estructura y la pasa con
// gpm_plataforma(). Los toques llegan en coordenadas normalizadas del DESTINO (la pantalla del
// movil o el rectangulo de la ventana del juego): u = x / (ancho - 1), v = y / (alto - 1), 0..1.
// Los huecos (slot) son 0..GPM_NSLOTS-1 y los reparte el nucleo.
#ifndef GPM_PLATAFORMA_H
#define GPM_PLATAFORMA_H

typedef struct {
    long long (*reloj_us)(void);                   // reloj monotono en microsegundos
    void (*log)(const char *linea);                // una linea de registro (sin '\n')
    int (*depurar)(void);                          // registro detallado (NULL = no); se consulta cada 2 s
    void (*abajo)(int slot, double u, double v);   // apoyar un dedo
    void (*mover)(int slot, double u, double v);   // moverlo
    void (*arriba)(int slot);                      // levantarlo
    void (*sync)(int tocando);                     // fin de un grupo de cambios (tocando: algun dedo apoyado)
    void (*vibrar)(double nivel);                  // vibracion corta del mando, 0..1 (NULL = no)
    void (*aprendido)(const char *nombre);         // modo aprender: boton o eje pulsado (NULL = no)
} gpm_plataforma_t;

#endif
