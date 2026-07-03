import React, { useEffect, useState } from 'react';
import { X, Lock, Mail, ShieldCheck, ArrowRight, Loader2, AlertCircle, UserPlus } from 'lucide-react';
import { signInWithEmail, signUpWithEmail } from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}

type Stage = 'login' | 'signup';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthenticated }) => {
  const [stage, setStage] = useState<Stage>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStage('login');
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError(null);
    setNotice(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { session } = await signInWithEmail(email.trim(), password);
      if (!session) {
        setNotice('Check your email to confirm your account before signing in.');
        return;
      }
      onAuthenticated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { session, user } = await signUpWithEmail(email.trim(), password, displayName.trim());
      if (!session) {
        setNotice(
          user
            ? 'Account created. Check your email for a confirmation link, then sign in.'
            : 'Account created. You can sign in once email confirmation is enabled in your Supabase project.'
        );
        setStage('login');
        return;
      }
      onAuthenticated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed.');
    } finally {
      setLoading(false);
    }
  };

  const renderLoginForm = () => (
    <form className="space-y-4" onSubmit={handleLogin}>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Password</label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="password"
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 mt-4 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Signing in...
          </>
        ) : (
          <>
            Sign In
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );

  const renderSignupForm = () => (
    <form className="space-y-4" onSubmit={handleSignup}>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Display name</label>
        <div className="relative">
          <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="How you appear in audit logs"
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Password</label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="password"
            placeholder="At least 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 mt-4 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating account...
          </>
        ) : (
          <>
            Create Account
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="relative p-8">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>

          <div className="mb-8">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-slate-900">
              {stage === 'login' ? 'Sign in to Linegra' : 'Create your account'}
            </h2>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              {stage === 'login'
                ? 'Use your Supabase account to edit trees you own or collaborate on. Public archives remain readable without signing in.'
                : 'The first account on a fresh database becomes the super administrator. Later accounts join via owner invitations.'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-start gap-3 text-sm text-rose-800">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {notice && (
            <div className="mb-6 p-4 rounded-xl bg-sky-50 border border-sky-100 text-sm text-sky-900">
              {notice}
            </div>
          )}

          {stage === 'login' ? renderLoginForm() : renderSignupForm()}

          <div className="mt-6 text-center text-sm text-slate-500">
            {stage === 'login' ? (
              <button
                type="button"
                className="font-bold text-slate-900 hover:underline"
                onClick={() => {
                  setStage('signup');
                  setError(null);
                  setNotice(null);
                }}
              >
                Need an account? Create one
              </button>
            ) : (
              <button
                type="button"
                className="font-bold text-slate-900 hover:underline"
                onClick={() => {
                  setStage('login');
                  setError(null);
                  setNotice(null);
                }}
              >
                Already registered? Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
