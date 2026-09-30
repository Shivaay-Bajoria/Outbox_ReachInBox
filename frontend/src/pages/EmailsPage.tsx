import { useEffect, useState } from 'react';
import { EmailList } from '../components/emails/EmailList';
import { useLayout } from '../components/layout/AppLayout';
import { RefreshIcon, SearchIcon } from '../components/ui/Icons';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import type { EmailGroup } from '../types';

/** One page component for both tabs - the only differences are the API filter and the copy. */
export function EmailsPage({ mode }: { mode: EmailGroup }) {
  const { refreshCounts } = useLayout();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  // Debounce so we don't hit Elasticsearch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => setInput(''), [mode]);

  const { data, loading, error, reload } = useAsync(() => api.list(mode, q), [mode, q]);

  // Live-ish view: poll while the tab is open so scheduled -> sent transitions show up.
  useEffect(() => {
    const t = setInterval(() => {
      reload();
      refreshCounts();
    }, 10_000);
    return () => clearInterval(t);
  }, [reload, refreshCounts]);

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-white px-6 py-3">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-surface px-4 py-2 text-muted">
          <SearchIcon width={16} height={16} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>
        <button onClick={() => (reload(), refreshCounts())} className="rounded-full p-2 text-muted hover:bg-surface" aria-label="Refresh">
          <RefreshIcon />
        </button>
      </div>
      <EmailList mode={mode} items={data?.items} loading={loading} error={error} searching={!!q} onRetry={reload} />
    </div>
  );
}
