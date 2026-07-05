import React, { useMemo } from 'react';
import { AlertTriangle, Layers } from 'lucide-react';
import { labelCrawlerAgent } from '../../lib/crawlTrafficStats';
import {
  formatCoveragePersonName,
  type CrawlCoverageAgentTreeRow,
  type CrawlCoverageStats,
} from '../../lib/crawlCoverage';
import { buildTreeUrl } from '../../lib/publicRoutes';

interface CrawlTrafficCoverageSectionProps {
  coverage: CrawlCoverageStats;
  agentFilter?: string | null;
  labelAgent?: (bucket: string) => string;
}

const CrawlTrafficCoverageSection: React.FC<CrawlTrafficCoverageSectionProps> = ({
  coverage,
  agentFilter,
  labelAgent = labelCrawlerAgent,
}) => {
  const { byAgentTree, trees, days } = coverage;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const agentMatrix = useMemo(() => {
    const byAgent = new Map<string, CrawlCoverageAgentTreeRow[]>();
    byAgentTree.forEach((row) => {
      const rows = byAgent.get(row.agentBucket) ?? [];
      rows.push(row);
      byAgent.set(row.agentBucket, rows);
    });
    return [...byAgent.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  }, [byAgentTree]);

  if (trees.length === 0) {
    return null;
  }

  return (
    <section className="space-y-6 rounded-[28px] border border-amber-100 bg-amber-50/40 p-6">
      <div className="flex items-center gap-3">
        <Layers className="w-5 h-5 text-amber-700" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
            Sitemap vs crawls
          </p>
          <h5 className="text-base font-serif font-bold text-slate-900">Crawl coverage</h5>
        </div>
      </div>

      <p className="text-sm text-slate-600 max-w-3xl">
        Person URLs in public sitemaps compared to bot fetches in the last {days} days.
        {agentFilter ? (
          <>
            {' '}
            Filtered to <span className="font-semibold">{labelAgent(agentFilter)}</span>.
          </>
        ) : (
          ' Counts any bot that fetched a person page.'
        )}
      </p>

      <div className="rounded-2xl border border-white bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3 font-black">Tree</th>
                <th className="px-4 py-3 font-black">Crawled</th>
                <th className="px-4 py-3 font-black">Coverage</th>
                <th className="px-4 py-3 font-black">Never crawled (sample)</th>
              </tr>
            </thead>
            <tbody>
              {trees.map((tree) => {
                const treeHref = tree.treeSlug || tree.treeId
                  ? buildTreeUrl({ id: tree.treeId, slug: tree.treeSlug }, origin)
                  : null;
                return (
                  <tr key={tree.treeId} className="border-b border-slate-50 align-top">
                    <td className="px-4 py-3">
                      {treeHref ? (
                        <a
                          href={treeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-amber-800 hover:underline"
                        >
                          {tree.treeName}
                        </a>
                      ) : (
                        <span className="font-medium text-slate-800">{tree.treeName}</span>
                      )}
                      <p className="text-xs text-slate-400 mt-1">{tree.totalPersonUrls} person URLs</p>
                    </td>
                    <td className="px-4 py-3 font-black text-slate-900">
                      {tree.crawledPersonUrls}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${Math.min(100, tree.coveragePercent)}%` }}
                          />
                        </div>
                        <span className="font-black text-slate-900">{tree.coveragePercent}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {tree.neverCrawled.length === 0 ? (
                        <span className="text-emerald-700 text-xs font-semibold">Full coverage</span>
                      ) : (
                        <ul className="space-y-1 text-xs">
                          {tree.neverCrawled.slice(0, 8).map((person) => (
                            <li key={person.personId} className="truncate max-w-[14rem]">
                              {formatCoveragePersonName(person)}
                            </li>
                          ))}
                          {tree.neverCrawled.length > 8 ? (
                            <li className="text-slate-400">+{tree.neverCrawled.length - 8} more in sample</li>
                          ) : null}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!agentFilter && agentMatrix.length > 0 && (
        <div className="rounded-2xl border border-white bg-white p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Coverage by agent & tree
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {agentMatrix.map(([agent, rows]) => (
              <div key={agent} className="rounded-xl border border-slate-100 p-3 space-y-2">
                <p className="text-sm font-bold text-slate-800">{labelAgent(agent)}</p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {rows.slice(0, 5).map((row) => (
                    <li key={`${agent}-${row.treeId}`} className="flex justify-between gap-2">
                      <span className="truncate">{row.treeName}</span>
                      <span className="font-black text-slate-900 shrink-0">{row.coveragePercent}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {trees.some((tree) => tree.coveragePercent < 20 && tree.totalPersonUrls >= 10) && (
        <p className="text-sm text-amber-800 rounded-2xl border border-amber-200 bg-white px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Some trees have low bot coverage — check sitemap links, robots.txt, and whether indexers have
          discovered `/sitemap.xml`.
        </p>
      )}
    </section>
  );
};

export default CrawlTrafficCoverageSection;
