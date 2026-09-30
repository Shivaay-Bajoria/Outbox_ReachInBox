import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'outline' | 'solid' | 'ghost';
  loading?: boolean;
}

const styles = {
  outline: 'border border-brand text-brand hover:bg-brand-soft',
  solid: 'bg-brand text-white hover:bg-brand-dark border border-brand',
  ghost: 'text-muted hover:bg-surface border border-transparent',
};

export function Button({ variant = 'outline', loading, disabled, className = '', children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}
