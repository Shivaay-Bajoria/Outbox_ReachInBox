import type { ReactNode } from 'react';

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center">
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-2xl">✉️</div>
      <p className="text-base font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
