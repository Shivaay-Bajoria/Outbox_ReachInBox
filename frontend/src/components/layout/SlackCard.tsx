import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';

const RESULT_TOAST = {
  connected: ['success', 'Slack connected'],
  error: ['error', 'Slack connection failed'],
  unconfigured: ['error', 'Slack OAuth is not configured on the server. Paste an Incoming Webhook URL instead.'],
} as const;

/** Slack alerts: real OAuth ("Connect Slack") or, as a fallback, a pasted Incoming Webhook URL verified with a live message. */
export function SlackCard() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, reload } = useAsync(() => api.slackStatus(), []);
  const [showWebhook, setShowWebhook] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'webhook' | 'test' | null>(null);

  useEffect(() => {
    const result = params.get('slack') as keyof typeof RESULT_TOAST | null;
    if (!result || !(result in RESULT_TOAST)) return;
    const [kind, message] = RESULT_TOAST[result];
    toast(kind, message);
    if (result === 'unconfigured') setShowWebhook(true);
    setParams({}, { replace: true });
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (kind: 'webhook' | 'test', action: () => Promise<unknown>, success: string) => {
    setBusy(kind);
    try {
      await action();
      toast('success', success);
      return true;
    } catch (e) {
      toast('error', (e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveWebhook = async (e: FormEvent) => {
    e.preventDefault();
    if (await run('webhook', () => api.slackWebhook(url.trim()), 'Slack connected - check your channel for a confirmation')) {
      setUrl('');
      setShowWebhook(false);
      reload();
    }
  };

  const disconnect = async () => {
    try {
      await api.slackDisconnect();
      toast('success', 'Slack disconnected');
      reload();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  if (loading && !data) return null;

  return (
    <div className="rounded-xl border border-line p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <span className={`h-2 w-2 rounded-full ${data?.connected ? 'bg-brand' : 'bg-muted/50'}`} />
        Slack alerts
      </p>

      {data?.connected ? (
        <>
          <p className="mt-1 text-xs text-muted">
            Connected{data.team ? ` to ${data.team}` : ''}
            {data.channel && data.channel !== 'webhook' ? ` (${data.channel})` : ''}. You'll be pinged when a sender hits its hourly limit.
          </p>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1 !px-2 !py-1.5" loading={busy === 'test'} onClick={() => run('test', api.slackTest, 'Test message sent to Slack')}>
              Send test
            </Button>
            <Button variant="ghost" className="flex-1 !px-2 !py-1.5" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">Get notified when a sender hits its hourly limit.</p>
          {data?.configured && (
            <a href="/api/slack/connect">
              <Button variant="solid" className="mt-2 w-full !py-1.5">
                Connect Slack
              </Button>
            </a>
          )}
          {showWebhook || !data?.configured ? (
            <form onSubmit={saveWebhook} className="mt-2 flex flex-col gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                aria-label="Slack Incoming Webhook URL"
                className="w-full rounded-md border border-line px-2 py-1.5 text-xs outline-none focus:border-brand"
              />
              <Button type="submit" variant={data?.configured ? 'outline' : 'solid'} loading={busy === 'webhook'} disabled={!url.trim()} className="w-full !py-1.5">
                Connect with webhook
              </Button>
            </form>
          ) : (
            <button onClick={() => setShowWebhook(true)} className="mt-2 w-full text-center text-xs text-muted underline hover:text-ink">
              or paste a webhook URL
            </button>
          )}
        </>
      )}
    </div>
  );
}
