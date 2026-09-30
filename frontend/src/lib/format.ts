const fmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

const full = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Tue 9:15:12 AM" like the Figma pills; adds the date when it is more than 6 days away/ago. */
export function formatPill(iso: string): string {
  const d = new Date(iso);
  return Math.abs(d.getTime() - Date.now()) > 6 * 86_400_000 ? full.format(d) : fmt.format(d);
}
