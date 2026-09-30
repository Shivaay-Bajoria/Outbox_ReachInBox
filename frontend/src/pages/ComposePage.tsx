import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SendLaterPanel } from '../components/emails/SendLaterPanel';
import { useLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { ArrowLeftIcon, ClockIcon, FileIcon, PaperclipIcon, UploadIcon } from '../components/ui/Icons';
import { Input } from '../components/ui/Input';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { api } from '../lib/api';
import { formatBytes, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_TOTAL_BYTES, toBase64 } from '../lib/files';
import { extractEmails } from '../lib/leads';

const ALL_SENDERS = 'all';

export function ComposePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshCounts } = useLayout();
  const senders = useAsync(() => api.senders(), []);
  const csvRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLTextAreaElement>(null);

  const [senderId, setSenderId] = useState(ALL_SENDERS);
  const [to, setTo] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delay, setDelay] = useState('');
  const [hourly, setHourly] = useState('');
  const [startTime, setStartTime] = useState('');
  const [showLater, setShowLater] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The To field is the single source of truth: typed addresses and CSV imports both live in it.
  const recipients = extractEmails(to);

  // Grow the To box with its content (capped by max-h in CSS) so imported lists are visible, not hidden off-screen.
  useEffect(() => {
    const el = toRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [to]);

  const onCsv = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) return toast('error', 'File is too large (max 5 MB)');
    const found = extractEmails(await file.text());
    if (!found.length) return toast('error', 'No email addresses found in that file');
    const before = new Set(recipients);
    const fresh = found.filter((e) => !before.has(e));
    setTo((prev) => [prev.trim().replace(/[,\s]+$/, ''), ...fresh].filter(Boolean).join(', '));
    toast('success', `${fresh.length} email addresses added from ${file.name}${found.length > fresh.length ? ` (${found.length - fresh.length} already in the list)` : ''}`);
  };

  const onAttach = (picked: FileList | null) => {
    if (!picked?.length) return;
    const next = [...files];
    for (const f of picked) {
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue; // same file picked twice
      if (f.size > MAX_ATTACHMENT_BYTES) return toast('error', `${f.name} is larger than 5 MB`);
      if (next.length >= MAX_ATTACHMENTS) return toast('error', `You can attach up to ${MAX_ATTACHMENTS} files`);
      if (next.reduce((n, x) => n + x.size, f.size) > MAX_TOTAL_BYTES) return toast('error', 'Attachments can total at most 15 MB');
      next.push(f);
    }
    setFiles(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const bodyText = body.replace(/<[^>]+>/g, '').trim();
    if (!recipients.length) return toast('error', 'Add at least one recipient (type them or upload a CSV)');
    if (!subject.trim()) return toast('error', 'Subject is required');
    if (!bodyText) return toast('error', 'Email body is required');

    setSubmitting(true);
    try {
      const attachments = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, data: await toBase64(f) })));
      const res = await api.schedule({
        subject: subject.trim(),
        body,
        recipients,
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
        delaySeconds: Number(delay) || 0,
        hourlyLimit: Number(hourly) || undefined,
        senderId: senderId === ALL_SENDERS ? undefined : senderId,
        attachments,
      });
      toast('success', `Scheduled ${res.scheduled} emails`);
      refreshCounts();
      navigate('/scheduled');
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl px-6 py-6">
      <header className="relative flex items-center gap-3">
        <Link to="/scheduled" aria-label="Back" className="rounded-full p-1.5 hover:bg-surface">
          <ArrowLeftIcon />
        </Link>
        <h1 className="flex-1 text-2xl font-normal">Compose New Email</h1>

        <input
          ref={attachRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onAttach(e.target.files);
            e.target.value = ''; // allow re-picking a file after removing it
          }}
        />
        <button
          type="button"
          onClick={() => attachRef.current?.click()}
          title="Attach files to this email"
          aria-label="Attach files"
          className={`relative rounded-full p-2 hover:bg-surface ${files.length ? 'text-brand' : 'text-muted'}`}
        >
          <PaperclipIcon />
          {files.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] text-white">{files.length}</span>
          )}
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLater((s) => !s)}
            title="Send later"
            className={`rounded-full p-2 hover:bg-surface ${startTime ? 'text-brand' : 'text-muted'}`}
          >
            <ClockIcon />
          </button>
          {showLater && (
            <SendLaterPanel
              value={startTime}
              onCancel={() => setShowLater(false)}
              onDone={(v) => (setStartTime(v), setShowLater(false))}
            />
          )}
        </div>
        <Button type="submit" loading={submitting}>
          Send
        </Button>
      </header>

      <div className="mt-8 flex flex-col gap-5 pl-10">
        <label className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0">From</span>
          <select
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            className="rounded-md bg-surface px-3 py-1.5 text-sm outline-none"
          >
            <option value={ALL_SENDERS}>All senders (round-robin)</option>
            {senders.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.email}
              </option>
            ))}
          </select>
          {senders.loading && <span className="text-xs text-muted">Loading senders…</span>}
          {senders.error && <span className="text-xs text-red-600">{senders.error}</span>}
        </label>

        <div className="flex items-start gap-3 text-sm">
          <span className="w-16 shrink-0 pt-2">To</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <textarea
                ref={toRef}
                rows={1}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com (comma separated) or upload a CSV"
                aria-label="Recipients"
                className="max-h-28 min-h-9 flex-1 resize-none overflow-y-auto border-b border-line bg-transparent py-2 text-sm break-all outline-none placeholder:text-muted focus:border-brand"
              />
              <input
                ref={csvRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                hidden
                onChange={(e) => {
                  void onCsv(e.target.files?.[0]);
                  e.target.value = ''; // allow re-selecting the same file
                }}
              />
              <Button type="button" className="shrink-0 !py-1.5" onClick={() => csvRef.current?.click()}>
                <UploadIcon width={16} height={16} />
                Upload CSV
              </Button>
            </div>
            <p className="mt-1.5 flex items-center gap-3 text-xs text-muted">
              <span className={recipients.length ? 'font-medium text-brand-dark' : ''}>{recipients.length} email addresses detected</span>
              {recipients.length > 0 && (
                <button type="button" onClick={() => setTo('')} className="underline hover:text-ink">
                  Clear
                </button>
              )}
            </p>
          </div>
        </div>

        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="ml-[-0.25rem]" />

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <label className="flex items-center gap-3">
            Delay between 2 emails (sec)
            <Input inline type="number" min={0} value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="00" />
          </label>
          <label className="flex items-center gap-3">
            Hourly Limit
            <Input inline type="number" min={1} value={hourly} onChange={(e) => setHourly(e.target.value)} placeholder="00" />
          </label>
          {startTime && (
            <span className="rounded-full bg-amber-pill px-3 py-1 text-xs text-amber-ink">Starts {new Date(startTime).toLocaleString()}</span>
          )}
        </div>

        <RichTextEditor onChange={setBody} />

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Attachments">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 rounded-lg bg-surface py-1.5 pr-2 pl-3 text-sm">
                <FileIcon width={15} height={15} className="text-brand-dark" />
                <span className="max-w-48 truncate" title={f.name}>{f.name}</span>
                <span className="text-xs text-muted">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((cur) => cur.filter((x) => x !== f))}
                  aria-label={`Remove ${f.name}`}
                  className="rounded-full px-1.5 text-muted hover:bg-white hover:text-ink"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
