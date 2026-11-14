// gpm_codigos.h - codigos de entrada de Linux (EV_*, BTN_*, ABS_*) que usa el nucleo.
//
// El nucleo recibe los eventos del mando con los codigos de Linux en todas las plataformas
// (en Windows, la capa XInput traduce a estos codigos). En Linux/Android se usa la cabecera del
// sistema; en otros sistemas, esta copia minima con los mismos valores.
#ifndef GPM_CODIGOS_H
#define GPM_CODIGOS_H

#if defined(__linux__)
#include <linux/input-event-codes.h>
#else
#define EV_SYN 0x00
#define EV_KEY 0x01
#define EV_ABS 0x03
#define EV_FF 0x15
#define SYN_REPORT 0

#define BTN_JOYSTICK 0x120
#define BTN_SOUTH 0x130
#define BTN_A BTN_SOUTH
#define BTN_EAST 0x131
#define BTN_B BTN_EAST
#define BTN_C 0x132
#define BTN_NORTH 0x133
#define BTN_X BTN_NORTH
#define BTN_WEST 0x134
#define BTN_Y BTN_WEST
#define BTN_Z 0x135
#define BTN_TL 0x136
#define BTN_TR 0x137
#define BTN_TL2 0x138
#define BTN_TR2 0x139
#define BTN_SELECT 0x13a
#define BTN_START 0x13b
#define BTN_MODE 0x13c
#define BTN_THUMBL 0x13d
#define BTN_THUMBR 0x13e
#define BTN_DPAD_UP 0x220
#define BTN_DPAD_DOWN 0x221
#define BTN_DPAD_LEFT 0x222
#define BTN_DPAD_RIGHT 0x223
#define BTN_TRIGGER_HAPPY 0x2c0

#define ABS_X 0x00
#define ABS_Y 0x01
#define ABS_Z 0x02
#define ABS_RX 0x03
#define ABS_RY 0x04
#define ABS_RZ 0x05
#define ABS_THROTTLE 0x06
#define ABS_RUDDER 0x07
#define ABS_WHEEL 0x08
#define ABS_GAS 0x09
#define ABS_BRAKE 0x0a
#define ABS_HAT0X 0x10
#define ABS_HAT0Y 0x11
#define ABS_MAX 0x3f
#define ABS_CNT (ABS_MAX + 1)
#endif

#endif
