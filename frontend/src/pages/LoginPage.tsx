import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'register';

const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const fieldClass =
  'w-full rounded-lg bg-surface px-4 py-3.5 text-[15px] outline-none placeholder:text-muted focus:ring-2 focus:ring-cta/40';

/** Login screen following the Figma: Google button, "or sign up through email" divider, email + password, green Login. */
export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(params.get('error') ? `Google sign-in failed (${params.get('error')}). Please try again.` : null);

  if (!loading && user) return <Navigate to="/scheduled" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError('Enter your email and password');
    if (mode === 'register' && password.length < 8) return setError('Password must be at least 8 characters');
    setSubmitting(true);
    try {
      await signIn(mode, email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-[390px] rounded-xl border border-line bg-white px-11 py-10">
        <h1 className="mb-7 text-center text-[32px] leading-tight font-bold">{mode === 'login' ? 'Login' : 'Sign up'}</h1>

        {/* Full-page navigation: the backend runs the real Google OAuth authorization-code flow. */}
        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-brand-soft py-3 text-base font-medium transition-colors hover:bg-[#dcefe3]"
        >
          <GoogleLogo />
          {mode === 'login' ? 'Login with Google' : 'Sign up with Google'}
        </a>

        <div className="my-5 flex items-center gap-3 text-sm text-muted">
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email ID"
            autoComplete="email"
            required
            aria-label="Email ID"
            className={fieldClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            aria-label="Password"
            className={fieldClass}
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-cta py-3 text-lg font-normal text-white transition-colors hover:bg-cta-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Spinner className="h-4 w-4" />}
            {mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => (setMode(mode === 'login' ? 'register' : 'login'), setError(null))}
            className="font-medium text-cta-dark hover:underline"
          >
            {mode === 'login' ? 'Create an account' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}
