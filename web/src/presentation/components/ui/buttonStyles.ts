/** Estilos de los botones (compartidos con enlaces y selectores de archivo). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary-strong text-white hover:bg-primary shadow-lg shadow-primary-strong/20',
  secondary: 'border border-line bg-surface-2 text-ink hover:border-primary/60',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function buttonClassName(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = ''): string {
  return `inline-flex items-center justify-center rounded-xl font-medium transition-colors
    disabled:pointer-events-none disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}
