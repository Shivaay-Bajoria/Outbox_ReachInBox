import { Link } from 'react-router-dom';
import type { EmailGroup, EmailItem } from '../../types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Spinner } from '../ui/Spinner';
import { EmailRow } from './EmailRow';

interface Props {
  mode: EmailGroup;
  items: EmailItem[] | undefined;
  loading: boolean;
  error: string | null;
  searching: boolean;
  onRetry: () => void;
}

const COPY = {
  scheduled: { title: 'No scheduled emails', hint: 'Compose an email and upload a list of leads to schedule a campaign.' },
  sent: { title: 'No sent emails yet', hint: 'Emails appear here as soon as the scheduler delivers them.' },
};

export function EmailList({ mode, items, loading, error, searching, onRetry }: Props) {
  if (error) {
    return <EmptyState title="Couldn't load emails" hint={error} action={<Button onClick={onRetry}>Try again</Button>} />;
  }
  if (loading && !items) {
    return (
      <div className="flex justify-center py-24 text-brand">
        <Spinner />
      </div>
    );
  }
  if (!items?.length) {
    return searching ? (
      <EmptyState title="No matches" hint="Try a different search term." />
    ) : (
      <EmptyState
        {...COPY[mode]}
        action={mode === 'scheduled' ? <Link to="/compose"><Button variant="solid">Compose new email</Button></Link> : undefined}
      />
    );
  }
  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
      {items.map((e) => (
        <EmailRow key={e.id} email={e} mode={mode} />
      ))}
    </div>
  );
}
