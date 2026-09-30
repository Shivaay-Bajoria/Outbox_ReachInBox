import { Link } from 'react-router-dom';
import { formatPill } from '../../lib/format';
import type { EmailItem } from '../../types';
import { ClockIcon } from '../ui/Icons';

const pill = {
  scheduled: 'bg-amber-pill text-amber-ink',
  processing: 'bg-blue-100 text-blue-700',
  sent: 'bg-brand-soft text-brand-dark',
  failed: 'bg-red-100 text-red-700',
} as const;

const label = { scheduled: 'Scheduled', processing: 'Sending', sent: 'Sent', failed: 'Failed' } as const;

export function EmailRow({ email, mode }: { email: EmailItem; mode: 'scheduled' | 'sent' }) {
  const when = mode === 'scheduled' ? email.scheduledAt : (email.sentAt ?? email.scheduledAt);
  const row = (
    <div className="flex items-center gap-4 border-b border-line px-6 py-3.5 text-sm hover:bg-surface/70">
      <span className="w-52 shrink-0 truncate">To: {email.to}</span>
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pill[email.status]}`}>
        <ClockIcon width={13} height={13} />
        {formatPill(when)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{email.subject}</span>
        <span className="text-muted"> - {email.error ?? email.preview}</span>
      </span>
      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${pill[email.status]}`}>{label[email.status]}</span>
    </div>
  );
  return (
    <Link to={`/emails/${email.id}`} className="block" aria-label={`Open email to ${email.to}: ${email.subject}`}>
      {row}
    </Link>
  );
}
