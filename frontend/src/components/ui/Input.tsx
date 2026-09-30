import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  inline?: boolean;
}

/** Borderless-underlined field matching the Figma compose form. `inline` renders a small boxed number field. */
export function Input({ label, inline, className = '', ...rest }: Props) {
  const field = (
    <input
      {...rest}
      className={
        inline
          ? `w-14 rounded-md border border-line bg-surface px-2 py-1 text-center text-sm outline-none focus:border-brand ${className}`
          : `flex-1 border-b border-line bg-transparent py-2 text-sm outline-none placeholder:text-muted focus:border-brand ${className}`
      }
    />
  );
  if (!label) return field;
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-auto shrink-0 text-ink">{label}</span>
      {field}
    </label>
  );
}
