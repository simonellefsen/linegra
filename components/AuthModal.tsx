import React, { useEffect, useState } from 'react';
import { X, Lock, User, ShieldCheck, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { ensureBootstrapAdmin, getAdminCredentials, saveAdminCredentials, verifyAdminCredentials } from '../lib/adminAuth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string) => void;
}

type Stage = 'login' | 'reset';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [stage, setStage] = useState<Stage>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresReset, setRequiresReset] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const creds = ensureBootstrapAdmin();
    setRequiresReset(creds.mustReset);
    setStage('login');
    setUsername('');
    setPassword('');
    setNewUsername('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { valid, mustReset } = verifyAdminCredentials(username.trim(), password);
      if (!valid) {
        setError('Invalid super administrator credentials.');
        return;
      }
      if (mustReset) {
        setStage('reset');
        setNewUsername(username.trim());
        setRequiresReset(true);
        setError('Security required: Please set a new username and password.');
        return;
      }
      onLogin(username.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword || !confirmPassword) {
      setError('Please complete all fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      saveAdminCredentials({
        username: newUsername.trim(),
        password: newPassword,
        mustReset: false
      });
      onLogin(newUsername.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const renderLoginForm = () => (
    <form className="space-y-4" onSubmit={handleLogin}>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Username</label>
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Enter super admin username"
            required
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            Verifying...
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

  const renderResetForm = () => (
    <form className="space-y-4" onSubmit={handleReset}>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">New Username</label>
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Choose a unique username"
            required
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">New Password</label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="password" 
            placeholder="Create a strong password"
            required
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Confirm Password</label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="password" 
            placeholder="Re-enter password"
            required
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none transition-all"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
            Saving...
          </>
        ) : (
          <>
            Save Credentials
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );

  const creds = getAdminCredentials();

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
              {stage === 'login' ? 'Super Administrator Login' : 'Secure Your Archive'}
            </h2>
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
              {stage === 'login'
                ? requiresReset
                  ? 'Default credentials detected. Sign in once, then you will be prompted to personalize them.'
                  : 'Sign in with your Linegra super administrator credentials to unlock full archival controls.'
                : 'For security, the default super administrator account must be renamed and protected with a unique password.'}
            </p>
            <p className="text-[11px] text-slate-400 uppercase tracking-[0.25em] mt-4">
              Bootstrapped account: <span className="font-black text-slate-700">{creds.username}</span>
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-start gap-3 text-sm text-rose-800 animate-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {stage === 'login' ? renderLoginForm() : renderResetForm()}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
