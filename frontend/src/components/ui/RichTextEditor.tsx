import { useRef } from 'react';

const TOOLS: { cmd: string; label: string; cls?: string }[] = [
  { cmd: 'bold', label: 'B', cls: 'font-bold' },
  { cmd: 'italic', label: 'I', cls: 'italic' },
  { cmd: 'underline', label: 'U', cls: 'underline' },
  { cmd: 'insertUnorderedList', label: '• List' },
  { cmd: 'insertOrderedList', label: '1. List' },
  { cmd: 'undo', label: '↶' },
  { cmd: 'redo', label: '↷' },
];

/** Minimal contenteditable editor producing HTML (execCommand is deprecated but universally supported and dependency-free). */
export function RichTextEditor({ onChange }: { onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="rounded-lg border border-line">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Type Your Reply..."
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        className="min-h-56 p-4 text-sm outline-none empty:before:text-muted empty:before:content-[attr(data-placeholder)] [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
      <div className="flex flex-wrap gap-1 border-t border-line p-2">
        {TOOLS.map((t) => (
          <button
            key={t.cmd}
            type="button"
            title={t.cmd}
            // mousedown + preventDefault keeps the selection inside the editor
            onMouseDown={(e) => {
              e.preventDefault();
              document.execCommand(t.cmd);
              onChange(ref.current?.innerHTML ?? '');
            }}
            className={`rounded px-2.5 py-1 text-sm text-muted hover:bg-surface hover:text-ink ${t.cls ?? ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
