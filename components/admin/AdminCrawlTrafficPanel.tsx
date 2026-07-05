import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronRight,
  Globe2,
  Loader2,
  MapPin,
  Route,
  Users,
  X,
} from 'lucide-react';
import { labelCountryCode, labelCrawlerAgent } from '../../lib/crawlTrafficStats';
import { formatGeoLocation } from '../../lib/requestGeo';
import { fetchAdminCrawlTrafficStats, type CrawlTrafficStats } from '../../services/crawlTraffic';

interface AdminCrawlTrafficPanelProps {
  supabaseActive: boolean;
}

const formatUtc = (value: string | null | undefined): string => {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
};

const AdminCrawlTrafficPanel: React.FC<AdminCrawlTrafficPanelProps> = ({ supabaseActive }) => {
  const [days, setDays] = useState(30);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [stats, setStats] = useState<CrawlTrafficStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseActive) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminCrawlTrafficStats(days, { agentFilter })
      .then((summary) => {
        if (!cancelled) setStats(summary);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load traffic stats.');
          setStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseActive, days, agentFilter]);

  const maxBotDayHits = useMemo(
    () => Math.max(1, ...(stats?.bot.byDay.map((row) => row.hits) ?? [1])),
    [stats?.bot.byDay]
  );
  const maxVisitorDayHits = useMemo(
    () => Math.max(1, ...(stats?.visitor.byDay.map((row) => row.hits) ?? [1])),
    [stats?.visitor.byDay]
  );

  if (!supabaseActive) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-sm text-slate-500">
        Connect Supabase to view public traffic analytics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-violet-600" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                Public traffic telemetry
              </p>
              <h4 className="text-lg font-serif font-bold text-slate-900">Site traffic</h4>
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
          Hits on public `/tree/*` and `/book/*` pages plus crawl APIs (`/api/public/*`, `/sitemap.xml`).
          Visitor geo uses Vercel/Cloudflare edge headers — no IP addresses are stored.
          {stats && days > stats.rawRetentionDays ? (
            <>
              {' '}
              Windows longer than {stats.rawRetentionDays} days combine daily rollups with a{' '}
              {stats.rawRetentionDays}-day raw tail for recent drill-down.
            </>
          ) : null}
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading traffic stats…
          </div>
        )}
        {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

        {stats && !loading && (
          <>
            <section className="space-y-6 rounded-[28px] border border-violet-100 bg-violet-50/40 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Bot className="w-5 h-5 text-violet-700" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">
                      Crawlers & LLM agents
                    </p>
                    <h5 className="text-base font-serif font-bold text-slate-900">Bot & LLM traffic</h5>
                  </div>
                </div>
                {agentFilter && (
                  <button
                    type="button"
                    onClick={() => setAgentFilter(null)}
                    className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700"
                  >
                    {labelCrawlerAgent(agentFilter)}
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bot hits</p>
                  <p className="text-3xl font-serif font-bold text-slate-900 mt-1">{stats.bot.totals.hits}</p>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">LLM agent hits</p>
                  <p className="text-3xl font-serif font-bold text-violet-700 mt-1">{stats.bot.totals.llmHits}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {stats.bot.totals.llmHits > 0
                      ? 'GPTBot, ClaudeBot, PerplexityBot'
                      : 'Watching for GPTBot, ClaudeBot, PerplexityBot'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agent types</p>
                  <p className="text-3xl font-serif font-bold text-slate-900 mt-1">
                    {stats.bot.totals.uniqueAgents}
                  </p>
                </div>
              </div>

              {stats.bot.totals.hits === 0 && (
                <p className="text-sm text-slate-500 rounded-2xl border border-dashed border-violet-200 bg-white px-4 py-3">
                  No bot traffic recorded yet. After deploy, verify with a crawler User-Agent or wait for
                  indexers to fetch `/sitemap.xml`.
                </p>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-white bg-white p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Globe2 className="w-4 h-4" /> By agent
                  </p>
                  {stats.bot.byAgent.length === 0 ? (
                    <p className="text-sm text-slate-400">No agents yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {stats.bot.byAgent.map((row) => {
                        const active = agentFilter === row.agentBucket;
                        return (
                          <li key={row.agentBucket}>
                            <button
                              type="button"
                              onClick={() =>
                                setAgentFilter(active ? null : row.agentBucket)
                              }
                              className={`w-full flex items-center justify-between gap-3 text-sm border-b border-slate-50 pb-2 text-left transition ${
                                active ? 'text-violet-700' : 'text-slate-800 hover:text-violet-700'
                              }`}
                            >
                              <span className="inline-flex items-center gap-2 font-medium">
                                {labelCrawlerAgent(row.agentBucket)}
                                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                              </span>
                              <span className="font-black">{row.hits}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="text-xs text-slate-400">Click an agent to drill into routes and recent hits.</p>
                </div>

                <div className="rounded-2xl border border-white bg-white p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Route className="w-4 h-4" />
                    {agentFilter ? `Routes — ${labelCrawlerAgent(agentFilter)}` : 'By route'}
                  </p>
                  {stats.bot.byRoute.length === 0 ? (
                    <p className="text-sm text-slate-400">No routes yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {stats.bot.byRoute.map((row) => (
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

              {stats.bot.byDay.length > 0 && (
                <div className="rounded-2xl border border-white bg-white p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    {agentFilter
                      ? `Daily hits — ${labelCrawlerAgent(agentFilter)} (UTC)`
                      : 'Daily bot hits (UTC)'}
                  </p>
                  <div className="space-y-2">
                    {stats.bot.byDay.map((row) => (
                      <div key={row.day} className="flex items-center gap-3 text-xs">
                        <span className="w-24 shrink-0 text-slate-500 font-mono">{row.day}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-violet-500/80"
                            style={{ width: `${Math.max(4, (row.hits / maxBotDayHits) * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-bold text-slate-700">{row.hits}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.bot.recent.length > 0 && (
                <div className="rounded-2xl border border-white bg-white overflow-hidden">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4">
                    {agentFilter
                      ? `Recent hits — ${labelCrawlerAgent(agentFilter)}`
                      : 'Recent bot hits'}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                          <th className="px-4 py-2 font-black">Time (UTC)</th>
                          <th className="px-4 py-2 font-black">Agent</th>
                          <th className="px-4 py-2 font-black">User-Agent</th>
                          <th className="px-4 py-2 font-black">Route</th>
                          <th className="px-4 py-2 font-black">Format</th>
                          <th className="px-4 py-2 font-black">Resource</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.bot.recent.map((row, index) => (
                          <tr key={`${row.recordedAt}-${index}`} className="border-b border-slate-50">
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">
                              {formatUtc(row.recordedAt)}
                            </td>
                            <td className="px-4 py-2 text-slate-800">{labelCrawlerAgent(row.agentBucket)}</td>
                            <td className="px-4 py-2 font-mono text-xs text-slate-500 max-w-[16rem] truncate">
                              {row.userAgent || '—'}
                            </td>
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
            </section>

            <section className="space-y-6 rounded-[28px] border border-slate-200 bg-slate-50/60 p-6">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-slate-700" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Human visitors
                  </p>
                  <h5 className="text-base font-serif font-bold text-slate-900">Non-bot traffic</h5>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Page views</p>
                  <p className="text-3xl font-serif font-bold text-slate-900 mt-1">
                    {stats.visitor.totals.hits}
                  </p>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Countries</p>
                  <p className="text-3xl font-serif font-bold text-slate-900 mt-1">
                    {stats.visitor.totals.uniqueCountries}
                  </p>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Routes</p>
                  <p className="text-3xl font-serif font-bold text-slate-900 mt-1">
                    {stats.visitor.totals.uniqueRoutes}
                  </p>
                </div>
              </div>

              {stats.visitor.totals.hits === 0 && (
                <p className="text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3">
                  No human visitor traffic recorded yet. Open a public `/tree/…` or `/book/…` page in a normal
                  browser after deploying migration `20260704160000_public_crawl_visitor_traffic.sql`.
                </p>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-white bg-white p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> By country
                  </p>
                  {stats.visitor.byCountry.length === 0 ? (
                    <p className="text-sm text-slate-400">No geo data yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {stats.visitor.byCountry.map((row) => (
                        <li
                          key={row.countryCode}
                          className="flex items-center justify-between gap-3 text-sm border-b border-slate-50 pb-2"
                        >
                          <span className="font-medium text-slate-800">
                            {labelCountryCode(row.countryCode)}
                            <span className="ml-2 font-mono text-xs text-slate-400">{row.countryCode}</span>
                          </span>
                          <span className="font-black text-slate-900">{row.hits}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-white bg-white p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Route className="w-4 h-4" /> By route
                  </p>
                  {stats.visitor.byRoute.length === 0 ? (
                    <p className="text-sm text-slate-400">No routes yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {stats.visitor.byRoute.map((row) => (
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

              {stats.visitor.byDay.length > 0 && (
                <div className="rounded-2xl border border-white bg-white p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Daily visitor hits (UTC)
                  </p>
                  <div className="space-y-2">
                    {stats.visitor.byDay.map((row) => (
                      <div key={row.day} className="flex items-center gap-3 text-xs">
                        <span className="w-24 shrink-0 text-slate-500 font-mono">{row.day}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-slate-500/70"
                            style={{ width: `${Math.max(4, (row.hits / maxVisitorDayHits) * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-bold text-slate-700">{row.hits}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.visitor.recent.length > 0 && (
                <div className="rounded-2xl border border-white bg-white overflow-hidden">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 pt-4">
                    Recent visitors
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                          <th className="px-4 py-2 font-black">Time (UTC)</th>
                          <th className="px-4 py-2 font-black">Country</th>
                          <th className="px-4 py-2 font-black">Location</th>
                          <th className="px-4 py-2 font-black">Route</th>
                          <th className="px-4 py-2 font-black">Resource</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.visitor.recent.map((row, index) => (
                          <tr key={`${row.recordedAt}-${index}`} className="border-b border-slate-50">
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">
                              {formatUtc(row.recordedAt)}
                            </td>
                            <td className="px-4 py-2 text-slate-800">
                              {labelCountryCode(row.countryCode)}
                            </td>
                            <td className="px-4 py-2 text-slate-600">
                              {formatGeoLocation(row.countryCode, row.city, row.region) || '—'}
                            </td>
                            <td className="px-4 py-2 text-slate-600">{row.route}</td>
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
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminCrawlTrafficPanel;
