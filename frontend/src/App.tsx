import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ComposePage } from './pages/ComposePage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { EmailsPage } from './pages/EmailsPage';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/scheduled" replace />} />
        <Route path="/scheduled" element={<EmailsPage mode="scheduled" />} />
        <Route path="/sent" element={<EmailsPage mode="sent" />} />
        <Route path="/emails/:id" element={<EmailDetailPage />} />
        <Route path="/compose" element={<ComposePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
