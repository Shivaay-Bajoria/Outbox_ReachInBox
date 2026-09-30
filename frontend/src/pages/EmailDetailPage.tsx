import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AttachmentList } from '../components/emails/AttachmentList';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ArrowLeftIcon } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { sanitizeHtml } from '../lib/sanitize';

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const statusStyle = {
  scheduled: 'bg-amber-pill text-amber-ink',
  processing: 'bg-blue-100 text-blue-700',
  sent: 'bg-brand-soft text-brand-dark',
  failed: 'bg-red-100 text-red-700',
} as const;

/** Single email view (Figma "open a mail" screen): subject, sender, recipient, date, body, attachments. */
export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: email, loading, error, reload } = useAsync(() => api.email(id), [id]);
  const body = useMemo(() => (email ? sanitizeHtml(email.body) : ''), [email]);

  // Back returns to whichever list the user came from; fall back to the right tab for deep links.
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(email?.status === 'sent' || email?.status === 'failed' ? '/sent' : '/scheduled'));

  if (loading && !email) {
    return (
      <div className="flex justify-center py-24 text-brand">
        <Spinner />
      </div>
    );
  }
  if (error || !email) {
    return (
      <EmptyState
        title="Couldn't open this email"
        hint={error ?? 'It may have been removed.'}
        action={
          <div className="flex gap-2">
            <Button onClick={reload}>Try again</Button>
            <Link to="/scheduled"><Button variant="ghost">Back to list</Button></Link>
          </div>
        }
      />
    );
  }

  const when = email.sentAt ?? email.scheduledAt;
  const label = email.status === 'sent' ? 'Sent' : email.status === 'failed' ? 'Failed' : 'Scheduled for';

  return (
    <article className="mx-auto max-w-4xl px-6 py-6">
      <header className="flex items-start gap-3">
        <button onClick={back} aria-label="Back" className="mt-1 rounded-full p-1.5 hover:bg-surface">
          <ArrowLeftIcon />
        </button>
        <h1 className="flex-1 text-[26px] leading-tight font-normal break-words">{email.subject}</h1>
        <span className={`mt-2 shrink-0 rounded-md px-2 py-0.5 text-xs ${statusStyle[email.status]}`}>{email.status}</span>
      </header>

      <div className="mt-6 flex items-start gap-4 pl-11">
        <Avatar name={email.from.name} src={null} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{email.from.name}</span>{' '}
            <span className="text-muted">&lt;{email.from.email}&gt;</span>
          </p>
          <p className="text-sm text-muted">to {email.to}</p>
        </div>
        <p className="shrink-0 text-xs text-muted" title={new Date(when).toLocaleString()}>
          {label} {dateFmt.format(new Date(when))}
        </p>
      </div>

      <div className="pl-[6.5rem]">
        {email.error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Delivery error: {email.error}</p>}

        <div
          className="mt-6 text-sm leading-relaxed break-words [&_a]:text-brand-dark [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: body }}
        />

        <AttachmentList files={email.attachments} hrefFor={(f) => api.attachmentUrl(email.id, f.id)} />

        {email.previewUrl && (
          <a href={email.previewUrl} target="_blank" rel="noreferrer" className="mt-8 inline-block text-sm text-brand-dark hover:underline">
            View delivered message on Ethereal ↗
          </a>
        )}
      </div>
    </article>
  );
}
