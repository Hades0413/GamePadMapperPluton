/** Estilos de boton (los mismos que la web: web/src/presentation/components/ui/buttonStyles.ts). */
export type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
export type Tamano = 'sm' | 'md';

const VARIANTE: Record<Variante, string> = {
  primario: 'bg-primary-strong text-white hover:bg-primary shadow-lg shadow-primary-strong/20',
  secundario: 'border border-line bg-surface-2 text-ink hover:border-primary/60',
  fantasma: 'text-muted hover:bg-surface-2 hover:text-ink',
  peligro: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
};

const TAMANO: Record<Tamano, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export function claseBoton(variante: Variante = 'secundario', tamano: Tamano = 'md', extra = ''): string {
  return `inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium transition-colors cursor-pointer
    disabled:pointer-events-none disabled:opacity-50 ${VARIANTE[variante]} ${TAMANO[tamano]} ${extra}`;
}
