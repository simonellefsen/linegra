import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  fetchE2eAccessTokens,
  mintE2eAccessToken,
  revokeE2eAccessToken,
  type E2eAccessTokenRow,
} from '../../services/e2eTokens';

interface AdminE2eTokensPanelProps {
  supabaseActive: boolean;
}

const formatUtc = (value: string | null | undefined): string => {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
};

const AdminE2eTokensPanel: React.FC<AdminE2eTokensPanelProps> = ({ supabaseActive }) => {
  const [tokens, setTokens] = useState<E2eAccessTokenRow[]>([]);
  const [label, setLabel] = useState('GitHub CI');
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!supabaseActive) return;
    setLoading(true);
    setError(null);
    try {
      setTokens(await fetchE2eAccessTokens());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load E2E tokens.');
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, [supabaseActive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleMint = async () => {
    setMinting(true);
    setError(null);
    setFreshToken(null);
    try {
      const minted = await mintE2eAccessToken(label.trim() || 'CI', days);
      setFreshToken(minted.token);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mint token.');
    } finally {
      setMinting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setError(null);
    try {
      await revokeE2eAccessToken(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token.');
    }
  };

  if (!supabaseActive) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-6">
      <div className="flex items-start gap-3">
        <KeyRound className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
            Playwright CI
          </p>
          <h4 className="text-lg font-serif font-bold text-slate-900">E2E access tokens</h4>
          <p className="text-sm text-slate-500 max-w-3xl">
            Mint revocable tokens for GitHub Actions and local Playwright runs. Tokens redeem a
            dedicated service-user session via <code className="text-xs">POST /api/e2e/redeem</code>{' '}
            — store the plaintext once as the <code className="text-xs">E2E_ACCESS_TOKEN</code>{' '}
            repository secret.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs font-bold text-slate-500 flex flex-col gap-2">
          Label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 min-w-[12rem]"
            placeholder="GitHub CI"
          />
        </label>
        <label className="text-xs font-bold text-slate-500 flex flex-col gap-2">
          Expires (days)
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 w-28"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleMint()}
          disabled={minting}
          className="px-5 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-[0.2em] disabled:opacity-60"
        >
          {minting ? 'Minting…' : 'Mint token'}
        </button>
      </div>

      {freshToken && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Copy now — shown once
          </p>
          <code className="block text-sm text-amber-950 break-all font-mono">{freshToken}</code>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading tokens…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.15em] text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4">Label</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Last used</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-slate-400">
                    No tokens minted yet.
                  </td>
                </tr>
              ) : (
                tokens.map((row) => {
                  const revoked = Boolean(row.revokedAt);
                  const expired = !revoked && new Date(row.expiresAt).getTime() < Date.now();
                  const status = revoked ? 'Revoked' : expired ? 'Expired' : 'Active';
                  return (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="py-3 pr-4 font-medium text-slate-800">{row.label}</td>
                      <td className="py-3 pr-4 text-slate-500">{formatUtc(row.createdAt)}</td>
                      <td className="py-3 pr-4 text-slate-500">{formatUtc(row.expiresAt)}</td>
                      <td className="py-3 pr-4 text-slate-500">{formatUtc(row.lastUsedAt)}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`text-xs font-bold uppercase tracking-[0.15em] ${
                            status === 'Active' ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {!revoked && (
                          <button
                            type="button"
                            onClick={() => void handleRevoke(row.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminE2eTokensPanel;
