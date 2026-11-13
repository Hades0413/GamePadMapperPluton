import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles';
import { Spinner } from './Spinner';

type Variant = ButtonVariant;
type Size = ButtonSize;
const buttonClass = buttonClassName;

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
