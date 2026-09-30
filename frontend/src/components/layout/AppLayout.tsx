import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import type { Counts } from '../../types';
import { Spinner } from '../ui/Spinner';
import { Sidebar } from './Sidebar';

interface LayoutContext {
  refreshCounts: () => void;
}
export const useLayout = () => useOutletContext<LayoutContext>();

export function AppLayout() {
  const { user, loading } = useAuth();
  const counts = useAsync<Counts>(() => api.counts(), [user?.id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-brand">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen">
      <Sidebar counts={counts.data} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet context={{ refreshCounts: counts.reload } satisfies LayoutContext} />
      </main>
    </div>
  );
}
