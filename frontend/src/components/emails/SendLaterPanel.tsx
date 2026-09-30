import { useState } from 'react';
import { Button } from '../ui/Button';

interface Props {
  value: string; // datetime-local string or ''
  onCancel: () => void;
  onDone: (value: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function tomorrowAt(hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return toLocalInput(d);
}

const PRESETS = [
  { label: 'Tomorrow', value: () => tomorrowAt(9) },
  { label: 'Tomorrow, 10:00 AM', value: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', value: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', value: () => tomorrowAt(15) },
];

/** The "Send Later" popover from the Figma. Empty value = start immediately. */
export function SendLaterPanel({ value, onCancel, onDone }: Props) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-line bg-white p-4 shadow-xl">
      <p className="mb-3 text-sm font-semibold">Send Later</p>
      <input
        type="datetime-local"
        value={draft}
        min={toLocalInput(new Date())}
        onChange={(e) => setDraft(e.target.value)}
        className="mb-3 w-full rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
      />
      <ul className="mb-4 flex flex-col text-sm">
        {PRESETS.map((p) => (
          <li key={p.label}>
            <button type="button" onClick={() => setDraft(p.value())} className="w-full rounded px-1 py-1.5 text-left hover:bg-surface">
              {p.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" className="!py-1.5" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="!py-1.5" onClick={() => onDone(draft)}>
          Done
        </Button>
      </div>
    </div>
  );
}
