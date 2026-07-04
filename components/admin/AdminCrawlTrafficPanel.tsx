import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, Globe2, Loader2, Route } from 'lucide-react';
import { labelCrawlerAgent } from '../../lib/crawlTrafficStats';
import { fetchAdminCrawlTrafficStats, type CrawlTrafficStats } from '../../services/crawlTraffic';

interface AdminCrawlTrafficPanelProps {
  supabaseActive: boolean;
}

const AdminCrawlTrafficPanel: React.FC<AdminCrawlTrafficPanelProps> = ({ supabaseActive }) => {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<CrawlTrafficStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseActive) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminCrawlTrafficStats(days)
      .then((summary) => {
        if (!cancelled) setStats(summary);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load crawl traffic.');
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
        Connect Supabase to view crawler and LLM agent traffic.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-violet-600" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                Public crawl telemetry
              </p>
              <h4 className="text-lg font-serif font-bold text-slate-900">Bot & LLM traffic</h4>
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
          Hits on public crawl surfaces (`/api/public/*`, `/sitemap.xml`) from non-browser user agents —
          search crawlers, GPTBot, ClaudeBot, PerplexityBot, and similar fetchers. Human browser traffic is
          not stored.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading crawl stats…
          </div>
        )}
        {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

        {stats && !loading && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bot hits</p>
                <p className="text-3xl font-serif font-bold text-slate-900 mt-1">{stats.totals.hits}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">LLM agents</p>
                <p className="text-3xl font-serif font-bold text-violet-700 mt-1">{stats.totals.llmHits}</p>
                <p className="text-xs text-slate-500 mt-1">GPTBot, ClaudeBot, Perplexity</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agent types</p>
                <p className="text-3xl font-serif font-bold text-slate-900 mt-1">{stats.totals.uniqueAgents}</p>
              </div>
            </div>

            {stats.totals.hits === 0 && (
              <p className="text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200 px-4 py-3">
                No bot traffic recorded yet. Deploy the crawl APIs and migration
                `20260704150000_public_crawl_traffic.sql`, then verify with a crawler User-Agent or wait for
                indexers to fetch `/sitemap.xml`.
              </p>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Globe2 className="w-4 h-4" /> By agent
                </p>
                {stats.byAgent.length === 0 ? (
                  <p className="text-sm text-slate-400">No agents yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {stats.byAgent.map((row) => (
                      <li
                        key={row.agentBucket}
                        className="flex items-center justify-between gap-3 text-sm border-b border-slate-50 pb-2"
                      >
                        <span className="font-medium text-slate-800">
                          {labelCrawlerAgent(row.agentBucket)}
                        </span>
                        <span className="font-black text-slate-900">{row.hits}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Route className="w-4 h-4" /> By route
                </p>
                {stats.byRoute.length === 0 ? (
                  <p className="text-sm text-slate-400">No routes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {stats.byRoute.map((row) => (
                      <li
                        key={row.route}
                        className="flex items-center justify-between gap-3 text-sm border-b border-slate-50 pb-2"
                      >
                        <span className="font-medium text-slate-800">{row.route}</span>
                        <span className="font-black text-slate-900">{row.hits}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {stats.byDay.length > 0 && (
              <div className="rounded-2xl border border-slate-100 p-4 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Daily bot hits (UTC)
                </p>
                <div className="space-y-2">
                  {stats.byDay.map((row) => (
                    <div key={row.day} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 text-slate-500 font-mono">{row.day}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500/80"
                          style={{ width: `${Math.max(4, (row.hits / maxDayHits) * 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-bold text-slate-700">{row.hits}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.recent.length > 0 && (
              <div className="rounded-2xl border border-slate-100 overflow-hidden">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4">
                  Recent hits
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm mt-2">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                        <th className="px-4 py-2 font-black">Time (UTC)</th>
                        <th className="px-4 py-2 font-black">Agent</th>
                        <th className="px-4 py-2 font-black">Route</th>
                        <th className="px-4 py-2 font-black">Format</th>
                        <th className="px-4 py-2 font-black">Resource</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent.map((row, index) => (
                        <tr key={`${row.recordedAt}-${index}`} className="border-b border-slate-50">
                          <td className="px-4 py-2 font-mono text-xs text-slate-600">
                            {row.recordedAt ? new Date(row.recordedAt).toISOString().replace('T', ' ').slice(0, 19) : '—'}
                          </td>
                          <td className="px-4 py-2 text-slate-800">{labelCrawlerAgent(row.agentBucket)}</td>
                          <td className="px-4 py-2 text-slate-600">{row.route}</td>
                          <td className="px-4 py-2 text-slate-600">{row.responseFormat || '—'}</td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500 max-w-[12rem] truncate">
                            {row.resourceId || '—'}
                          </td>
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

export default AdminCrawlTrafficPanel;
