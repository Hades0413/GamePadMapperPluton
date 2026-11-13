import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary-strong text-white hover:bg-primary shadow-lg shadow-primary-strong/20',
  secondary: 'border border-line bg-surface-2 text-ink hover:border-primary/60',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return `inline-flex items-center justify-center rounded-xl font-medium transition-colors
    disabled:pointer-events-none disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function Button({
  variant, size, icon, loading = false, className = '', children, disabled, type = 'button', ...rest
}: Common & ComponentProps<'button'> & { loading?: boolean }) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, icon, className = '', children, ...rest }: Common & LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

/** Enlace a otra web: siempre en pestana nueva y sin pasarle referencias de esta. */
export function ExternalLink({ variant, size, icon, className, children, ...rest }: Common & ComponentProps<'a'>) {
  const cls = variant || size ? buttonClass(variant, size, className) : className;
  return (
    <a target="_blank" rel="noopener noreferrer" className={cls} {...rest}>
      {icon}
      {children}
    </a>
  );
}
