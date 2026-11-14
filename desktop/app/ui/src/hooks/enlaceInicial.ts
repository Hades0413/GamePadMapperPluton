/**
 * Enlace inicial con el fragmento de la URL: `#mandos/macros/3` abre la pestana «Mandos», la
 * sub-pestana «Macros» y el mando 3; `#opciones` abre «Opciones». Solo se lee al arrancar (sirve
 * para volver al mismo sitio al recargar y para las capturas de la interfaz).
 */
export function enlaceInicial(): { pestana: string | undefined; sub: string | undefined; mando: number | null } {
  const partes = (typeof window === 'undefined' ? '' : window.location.hash).replace(/^#/, '').split('/');
  const mando = Number(partes[2]);
  return { pestana: partes[0] || undefined, sub: partes[1] || undefined, mando: Number.isInteger(mando) && mando > 0 ? mando : null };
}
