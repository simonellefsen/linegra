import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Route, TriangleAlert } from 'lucide-react';
import { labelClientErrorKind } from '../../lib/clientErrorStats';
import { fetchAdminClientErrorStats, type ClientErrorStats } from '../../services/clientErrors';

interface AdminClientErrorsPanelProps {
  supabaseActive: boolean;
}

const formatUtc = (value: string | null | undefined): string => {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
};

const AdminClientErrorsPanel: React.FC<AdminClientErrorsPanelProps> = ({ supabaseActive }) => {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<ClientErrorStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseActive) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminClientErrorStats(days)
      .then((summary) => {
        if (!cancelled) setStats(summary);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load client error stats.');
          setStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseActive, days]);

  const maxDayHits = useMemo(
    () => Math.max(1, ...(stats?.byDay.map((row) => row.hits) ?? [1])),
    [stats?.byDay]
  );

  if (!supabaseActive) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-sm text-slate-500">
        Connect Supabase to view client error telemetry.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <TriangleAlert className="w-6 h-6 text-rose-600" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                Client runtime telemetry
              </p>
              <h4 className="text-lg font-serif font-bold text-slate-900">Client errors</h4>
            </div>
          </div>
          <label className="text-xs font-bold text-slate-500 flex items-center gap-2">
            Window
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        </div>

        <p className="text-sm text-slate-500 max-w-3xl">
          Captures `window.onerror`, unhandled promise rejections, and React error-boundary crashes.
          Only message + stack hash are stored (no full stack traces or PII). Inserts are rate-limited
          per browser session and deduped server-side for five minutes.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading client error stats…
          </div>
        )}
        {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

        {stats && !loading && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-rose-100 bg-rose-50/50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Reports</p>
                <p className="text-3xl font-serif font-bold text-slate-900 mt-1">{stats.totals.hits}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Unique signatures
                </p>
                <p className="text-3xl font-serif font-bold text-slate-900 mt-1">
                  {stats.totals.uniqueSignatures}
                </p>
              </div>
            </div>

            {stats.totals.hits === 0 && (
              <p className="text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
                No client errors recorded yet. Apply migration `20260705200000_client_errors.sql`, then
                trigger a test error in the browser to verify the pipeline.
              </p>
            )}

            {stats.byDay.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Daily rollup
                </p>
                <ul className="space-y-2">
                  {stats.byDay.map((row) => (
                    <li key={row.day} className="flex items-center gap-3 text-sm">
                      <span className="w-24 font-mono text-xs text-slate-500">{row.day}</span>
                      <div className="flex-1 h-2 rounded-full bg-white border border-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-rose-400"
                          style={{ width: `${Math.round((row.hits / maxDayHits) * 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right font-black text-slate-800">{row.hits}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Route className="w-4 h-4" /> By route
                </p>
                {stats.byRoute.length === 0 ? (
                  <p className="text-sm text-slate-400">No route data yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {stats.byRoute.map((row) => (
                      <li
                        key={row.route}
                        className="flex items-center justify-between gap-3 text-sm border-b border-slate-50 pb-2"
                      >
                        <span className="font-mono text-xs text-slate-700 truncate">{row.route}</span>
                        <span className="font-black text-slate-900">{row.hits}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> By kind
                </p>
                {stats.byKind.length === 0 ? (
                  <p className="text-sm text-slate-400">No kind breakdown yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {stats.byKind.map((row) => (
                      <li
                        key={row.kind}
                        className="flex items-center justify-between gap-3 text-sm border-b border-slate-50 pb-2"
                      >
                        <span className="text-slate-700">{labelClientErrorKind(row.kind)}</span>
                        <span className="font-black text-slate-900">{row.hits}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {stats.topErrors.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Top error signatures
                </p>
                <ul className="space-y-3">
                  {stats.topErrors.map((row) => (
                    <li key={`${row.stackHash}-${row.message}`} className="border-b border-slate-50 pb-3">
                      <p className="text-sm font-semibold text-slate-800">{row.message}</p>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        {row.stackHash} · {row.hits} hits · last {formatUtc(row.lastSeen)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stats.recent.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recent reports</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm mt-2">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-black">Time (UTC)</th>
                        <th className="px-4 py-2 font-black">Kind</th>
                        <th className="px-4 py-2 font-black">Route</th>
                        <th className="px-4 py-2 font-black">Source</th>
                        <th className="px-4 py-2 font-black">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent.map((row, index) => (
                        <tr key={`${row.recordedAt}-${index}`} className="border-b border-slate-50">
                          <td className="px-4 py-2 font-mono text-xs text-slate-600">
                            {formatUtc(row.recordedAt)}
                          </td>
                          <td className="px-4 py-2 text-slate-700">{labelClientErrorKind(row.kind)}</td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500 max-w-[12rem] truncate">
                            {row.route || '/'}
                          </td>
                          <td className="px-4 py-2 text-slate-600 max-w-[10rem] truncate">
                            {row.source || '—'}
                          </td>
                          <td className="px-4 py-2 text-slate-800 max-w-[20rem] truncate">{row.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminClientErrorsPanel;
