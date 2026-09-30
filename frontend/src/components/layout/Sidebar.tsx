import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { Counts } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { ChevronDownIcon, ClockIcon, SendIcon } from '../ui/Icons';
import { SlackCard } from './SlackCard';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-brand-soft font-semibold' : 'hover:bg-surface'}`;

/** Header block from the Figma: avatar + name + email + logout, then Compose and the two tabs. */
export function Sidebar({ counts }: { counts: Counts | undefined }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) return null;

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-5 border-r border-line p-4">
      <div ref={ref} className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          className="flex w-full items-center gap-3 rounded-xl bg-surface p-2.5 text-left"
          aria-haspopup="menu"
        >
          <Avatar name={user.name} src={user.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <ChevronDownIcon className="text-muted" />
        </button>
        {menu && (
          <div role="menu" className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-1 shadow-lg">
            <button
              role="menuitem"
              onClick={() => logout().catch((e: Error) => toast('error', e.message))}
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface"
            >
              Log out
            </button>
          </div>
        )}
      </div>

      <Link to="/compose">
        <Button className="w-full">Compose</Button>
      </Link>

      <nav className="flex flex-col gap-1">
        <p className="px-3 text-[11px] font-medium tracking-wider text-muted uppercase">Core</p>
        <NavLink to="/scheduled" className={navClass}>
          <ClockIcon />
          <span className="flex-1">Scheduled</span>
          <span className="text-xs text-muted">{counts?.scheduled ?? '–'}</span>
        </NavLink>
        <NavLink to="/sent" className={navClass}>
          <SendIcon />
          <span className="flex-1">Sent</span>
          <span className="text-xs text-muted">{counts?.sent ?? '–'}</span>
        </NavLink>
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <SlackCard />
        <a href="/admin/queues" target="_blank" rel="noreferrer" className="px-3 text-xs text-muted hover:text-ink">
          Open BullMQ dashboard ↗
        </a>
      </div>
    </aside>
  );
}
