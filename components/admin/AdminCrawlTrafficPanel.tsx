import React, { useEffect, useState } from 'react';
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
import { crawlTrafficResourceCacheKey } from '../../lib/crawlTrafficResourceLabels';
import { formatGeoLocation } from '../../lib/requestGeo';
import {
  fetchAdminCrawlTrafficStats,
  type CrawlTrafficResourceLabel,
  type CrawlTrafficStats,
} from '../../services/crawlTraffic';
import CrawlTrafficTrendChart from './CrawlTrafficTrendChart';
import CrawlTrafficFormatBreakdown from './CrawlTrafficFormatBreakdown';

interface AdminCrawlTrafficPanelProps {
  supabaseActive: boolean;
  currentUserId?: string | null;
}

const formatUtc = (value: string | null | undefined): string => {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
};

const CrawlTrafficResourceCell: React.FC<{
  route: string;
  resourceId?: string | null;
  resourceKey?: string | null;
  labels: Record<string, CrawlTrafficResourceLabel>;
}> = ({ route, resourceId, resourceKey, labels }) => {
  if (!resourceId && !resourceKey) {
    return <span className="text-slate-400">—</span>;
  }
  const resolved = labels[crawlTrafficResourceCacheKey({ route, resourceId, resourceKey })];
  if (resolved?.href) {
    return (
      <a
        href={resolved.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-violet-700 hover:underline font-medium max-w-[16rem] truncate inline-block"
        title={resolved.raw}
      >
        {resolved.label}
      </a>
    );
  }
  if (resolved?.label) {
    return (
      <span className="text-slate-700 font-medium max-w-[16rem] truncate inline-block" title={resolved.raw}>
        {resolved.label}
      </span>
    );
  }
  return (
    <span
      className="font-mono text-xs text-slate-500 max-w-[12rem] truncate inline-block"
      title={resourceId ?? resourceKey ?? undefined}
    >
      {resourceId ?? resourceKey}
    </span>
  );
};

const AdminCrawlTrafficPanel: React.FC<AdminCrawlTrafficPanelProps> = ({
  supabaseActive,
  currentUserId,
}) => {
  const [days, setDays] = useState(30);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [excludeMyTraffic, setExcludeMyTraffic] = useState(true);
  const [stats, setStats] = useState<CrawlTrafficStats | null>(null);
  const [resourceLabels, setResourceLabels] = useState<Record<string, CrawlTrafficResourceLabel>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseActive) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminCrawlTrafficStats(days, {
      agentFilter,
      excludeViewerUserId: excludeMyTraffic && currentUserId ? currentUserId : null,
    })
      .then((summary) => {
        if (!cancelled) {
          setStats(summary.stats);
          setResourceLabels(summary.resourceLabels);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load traffic stats.');
          setStats(null);
          setResourceLabels({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseActive, days, agentFilter, excludeMyTraffic, currentUserId]);

  const botTrendLabel = agentFilter ? labelCrawlerAgent(agentFilter) : 'Bots';

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
          <div className="flex flex-wrap items-center gap-4">
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
            <label className="text-xs font-bold text-slate-600 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeMyTraffic}
                disabled={!currentUserId}
                onChange={(event) => setExcludeMyTraffic(event.target.checked)}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              Exclude my visits
            </label>
          </div>
        </div>

        <p className="text-sm text-slate-500 max-w-3xl">
          Hits on public `/tree/*` and `/book/*` pages plus crawl APIs (`/api/public/*`, `/sitemap.xml`).
          Visitor geo uses Vercel/Cloudflare edge headers — no IP addresses are stored.
          {excludeMyTraffic && currentUserId ? (
            <>
              {' '}
              Your signed-in browser visits are excluded from the raw event tail (last{' '}
              {stats?.rawRetentionDays ?? 14} days); older daily rollups may still include them.
            </>
          ) : null}
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
            <CrawlTrafficTrendChart
              windowDays={days}
              botByDay={stats.bot.byDay}
              visitorByDay={stats.visitor.byDay}
              botLabel={botTrendLabel}
            />

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

              <CrawlTrafficFormatBreakdown
                rows={stats.bot.byAgentFormat}
                agentOrder={stats.bot.byAgent.map((row) => row.agentBucket)}
                agentFilter={agentFilter}
                rawRetentionDays={stats.rawRetentionDays}
                labelAgent={labelCrawlerAgent}
              />

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
                            <td className="px-4 py-2">
                              <CrawlTrafficResourceCell
                                route={row.route}
                                resourceId={row.resourceId}
                                resourceKey={row.resourceKey}
                                labels={resourceLabels}
                              />
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
                            <td className="px-4 py-2">
                              <CrawlTrafficResourceCell
                                route={row.route}
                                resourceId={row.resourceId}
                                resourceKey={row.resourceKey}
                                labels={resourceLabels}
                              />
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
