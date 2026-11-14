//! Toques reales de Windows (8 o posterior) con `InjectTouchInput`, como gpm-escritorio
//! (`desktop/windows/gpm_escritorio_windows.c`): Windows necesita en cada inyeccion TODOS los
//! dedos apoyados, cada hueco del nucleo es un dedo, y los dedos quietos se reenvian cada 100 ms
//! para que el sistema no los cancele. Las coordenadas son pixeles reales de la pantalla (la app
//! es consciente del DPI).

use super::{ErrorSalida, PantallaToques, ToquePixel};
use std::io;
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{GetLastError, RECT};
use windows_sys::Win32::UI::Input::Pointer::{
    InitializeTouchInjection, InjectTouchInput, POINTER_FLAGS, POINTER_FLAG_DOWN, POINTER_FLAG_INCONTACT,
    POINTER_FLAG_INRANGE, POINTER_FLAG_UP, POINTER_FLAG_UPDATE, POINTER_INFO, POINTER_TOUCH_INFO,
    TOUCH_FEEDBACK_DEFAULT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, PT_TOUCH, SM_CXSCREEN, SM_CYSCREEN, TOUCH_FLAG_NONE, TOUCH_MASK_CONTACTAREA,
    TOUCH_MASK_ORIENTATION, TOUCH_MASK_PRESSURE,
};

const DEDOS: usize = 10;
const REENVIO: Duration = Duration::from_millis(100);

#[derive(Clone, Copy, Default)]
struct Dedo {
    activo: bool,
    nuevo: bool,
    soltar: bool,
    x: i32,
    y: i32,
}

pub struct PantallaWindows {
    dedos: [Dedo; DEDOS],
    ultima: Instant,
    error_avisado: bool,
}

impl PantallaWindows {
    pub fn crear() -> Result<Self, ErrorSalida> {
        // SAFETY: llamada sin punteros; se comprueba el resultado.
        if unsafe { InitializeTouchInjection(DEDOS as u32, TOUCH_FEEDBACK_DEFAULT) } == 0 {
            // SAFETY: sin argumentos.
            let e = unsafe { GetLastError() };
            return Err(ErrorSalida::Io(io::Error::from_raw_os_error(e as i32)));
        }
        log::info!("toques de Windows listos (InjectTouchInput, hasta {DEDOS} dedos)");
        Ok(Self { dedos: [Dedo::default(); DEDOS], ultima: Instant::now(), error_avisado: false })
    }

    fn poner(&self, i: usize, flags: POINTER_FLAGS) -> POINTER_TOUCH_INFO {
        let d = self.dedos[i];
        POINTER_TOUCH_INFO {
            pointerInfo: POINTER_INFO {
                pointerType: PT_TOUCH,
                pointerId: i as u32,
                pointerFlags: flags,
                ptPixelLocation: windows_sys::Win32::Foundation::POINT { x: d.x, y: d.y },
                ..Default::default()
            },
            touchFlags: TOUCH_FLAG_NONE,
            touchMask: TOUCH_MASK_CONTACTAREA | TOUCH_MASK_ORIENTATION | TOUCH_MASK_PRESSURE,
            rcContact: RECT { left: d.x - 2, top: d.y - 2, right: d.x + 2, bottom: d.y + 2 },
            rcContactRaw: RECT { left: 0, top: 0, right: 0, bottom: 0 },
            orientation: 90,
            pressure: 32000,
        }
    }

    fn inyectar(&mut self, t: &[POINTER_TOUCH_INFO]) {
        if t.is_empty() {
            return;
        }
        self.ultima = Instant::now();
        // SAFETY: arreglo valido de t.len() elementos.
        if unsafe { InjectTouchInput(t.len() as u32, t.as_ptr()) } == 0 && !self.error_avisado {
            self.error_avisado = true;
            // SAFETY: sin argumentos.
            log::warn!("InjectTouchInput fallo (error {}); se sigue intentando", unsafe { GetLastError() });
        }
    }

    /// Envia el estado de todos los dedos: nuevos (DOWN), apoyados (UPDATE) y levantados (UP).
    fn enviar_dedos(&mut self) {
        const EN_CONTACTO: POINTER_FLAGS = POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT;
        let mut t = Vec::with_capacity(DEDOS);
        // Un dedo apoyado y levantado en el mismo grupo: primero se apoya y luego se levanta.
        if self.dedos.iter().any(|d| d.nuevo && d.soltar) {
            for i in 0..DEDOS {
                let d = self.dedos[i];
                if !d.activo {
                    continue;
                }
                if d.nuevo {
                    t.push(self.poner(i, POINTER_FLAG_DOWN | EN_CONTACTO));
                } else if !d.soltar {
                    t.push(self.poner(i, POINTER_FLAG_UPDATE | EN_CONTACTO));
                }
                self.dedos[i].nuevo = false;
            }
            self.inyectar(&t);
            t.clear();
        }
        for i in 0..DEDOS {
            let d = self.dedos[i];
            if !d.activo {
                continue;
            }
            let flags = if d.soltar {
                POINTER_FLAG_UP
            } else if d.nuevo {
                POINTER_FLAG_DOWN | EN_CONTACTO
            } else {
                POINTER_FLAG_UPDATE | EN_CONTACTO
            };
            t.push(self.poner(i, flags));
        }
        self.inyectar(&t);
        for d in &mut self.dedos {
            if d.soltar {
                d.activo = false;
            }
            d.nuevo = false;
            d.soltar = false;
        }
    }
}

impl PantallaToques for PantallaWindows {
    fn enviar(&mut self, ops: &[ToquePixel]) -> io::Result<()> {
        for op in ops {
            match *op {
                ToquePixel::Abajo { slot, x, y } if slot < DEDOS => {
                    self.dedos[slot] = Dedo { activo: true, nuevo: true, soltar: false, x, y };
                }
                ToquePixel::Mover { slot, x, y } if slot < DEDOS => {
                    self.dedos[slot].x = x;
                    self.dedos[slot].y = y;
                }
                ToquePixel::Arriba { slot } if slot < DEDOS => {
                    if self.dedos[slot].activo {
                        self.dedos[slot].soltar = true;
                    }
                }
                ToquePixel::Sync { .. } => self.enviar_dedos(),
                _ => {}
            }
        }
        Ok(())
    }

    fn mantener(&mut self) -> io::Result<()> {
        if self.dedos.iter().any(|d| d.activo) && self.ultima.elapsed() > REENVIO {
            self.enviar_dedos();
        }
        Ok(())
    }

    fn escritorio(&self) -> (u32, u32) {
        // SAFETY: llamadas sin punteros.
        let (w, h) = unsafe { (GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)) };
        (w.max(2) as u32, h.max(2) as u32)
    }

    fn descripcion(&self) -> String {
        "InjectTouchInput".into()
    }
}

impl Drop for PantallaWindows {
    fn drop(&mut self) {
        for d in &mut self.dedos {
            if d.activo {
                d.soltar = true;
            }
        }
        self.enviar_dedos();
    }
}
