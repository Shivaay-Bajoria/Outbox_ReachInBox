import { formatBytes } from '../../lib/files';
import type { AttachmentMeta } from '../../types';
import { DownloadIcon, FileIcon } from '../ui/Icons';

interface Props {
  files: AttachmentMeta[];
  hrefFor: (file: AttachmentMeta) => string;
}

/** Download cards shown under an email body, like the attachment tiles in the Figma. */
export function AttachmentList({ files, hrefFor }: Props) {
  if (!files.length) return null;
  return (
    <section aria-label="Attachments" className="mt-8">
      <p className="mb-3 text-sm text-muted">
        {files.length} attachment{files.length > 1 ? 's' : ''}
      </p>
      <ul className="flex flex-wrap gap-4">
        {files.map((f) => (
          <li key={f.id}>
            <a href={hrefFor(f)} download={f.name} className="group block w-44 overflow-hidden rounded-xl bg-surface transition-shadow hover:shadow-md">
              <div className="relative flex h-24 items-center justify-center bg-brand-soft text-brand-dark">
                <FileIcon width={32} height={32} />
                <span className="absolute top-2 right-2 hidden rounded-full bg-white p-1.5 text-ink shadow group-hover:block">
                  <DownloadIcon width={14} height={14} />
                </span>
              </div>
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium" title={f.name}>{f.name}</p>
                <p className="text-xs text-muted">{formatBytes(f.size)}</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
