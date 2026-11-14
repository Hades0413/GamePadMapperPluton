import type { SVGProps } from 'react';

/** Iconos de trazo propios (24x24). */
function Icono({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const IconoVarita = () => (
  <Icono><path d="m15 4 5 5M4 20 15 9" /><path d="M9 3v2M3 9h2M6 5 5 6M19 13v2M17 15h4" /></Icono>
);
export const IconoAuto = () => (
  <Icono><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></Icono>
);
export const IconoVibrar = () => (
  <Icono><rect x="7" y="4" width="10" height="16" rx="2" /><path d="M3 9v6M21 9v6" /></Icono>
);
export const IconoGuardar = () => (
  <Icono><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></Icono>
);
export const IconoDeshacer = () => (
  <Icono><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7l-3 3" /></Icono>
);
export const IconoUsb = () => (
  <Icono><path d="M12 2v14M8 6l4-4 4 4M7 11v3l5 3 5-3v-3" /><circle cx="12" cy="19" r="2" /></Icono>
);
export const IconoBluetooth = () => <Icono><path d="m7 7 10 10-5 5V2l5 5L7 17" /></Icono>;
export const IconoMando = () => (
  <Icono><path d="M6 8h12a4 4 0 0 1 4 4v3a3 3 0 0 1-5.2 2L15 15H9l-1.8 2A3 3 0 0 1 2 15v-3a4 4 0 0 1 4-4z" /><path d="M7 11v3M5.5 12.5h3M16 12h.01M18 13.5h.01" /></Icono>
);
export const IconoCopiar = () => (
  <Icono><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Icono>
);
export const IconoSubir = () => <Icono><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Icono>;
