import React from 'react';
import { ArrowRight, Info, MapPin } from 'lucide-react';
import type { HaplogroupRouteInfo, UnresolvedHaplogroup } from '../../lib/haplogroupRoutes';

interface HaplogroupMigrationCardProps {
  routes: HaplogroupRouteInfo[];
  unresolved?: UnresolvedHaplogroup[];
}

const HaplogroupMigrationCard: React.FC<HaplogroupMigrationCardProps> = ({
  routes,
  unresolved = [],
}) => {
  const hasHaplogroupInput = routes.length > 0 || unresolved.length > 0;
  if (!hasHaplogroupInput) return null;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-3">
      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Migration routes</p>
      {unresolved.map((item) => (
        <div
          key={`unresolved-${item.line}-${item.haplogroup}`}
          className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-4 space-y-2"
        >
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-50">
                {item.line}: <span className="font-serif">{item.haplogroup}</span>
              </p>
              <p className="text-xs text-amber-100/80 mt-1 leading-relaxed">
                No migration route in Linegra&apos;s reference dataset yet. This haplogroup is valid —
                we just haven&apos;t curated geographic steps for this clade. Nordic-focused entries
                (U5, I/R Y-DNA, etc.) were added first; more macro-haplogroups are planned.
              </p>
            </div>
          </div>
        </div>
      ))}
      {routes.map((route) => (
        <div
          key={`${route.line}-${route.haplogroup}`}
          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 space-y-3"
        >
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-white">
                {route.line}: <span className="font-serif">{route.haplogroup}</span>
                {route.inferred && (
                  <span className="ml-2 text-[9px] font-black uppercase tracking-[0.15em] text-sky-200/70 align-middle">
                    Inferred
                  </span>
                )}
              </p>
              {route.mitotreeTerminal && (
                <p className="text-[11px] text-white/55 mt-0.5">
                  Mitotree terminal: <span className="font-serif">{route.mitotreeTerminal}</span>
                </p>
              )}
            </div>
          </div>

          <div className="text-xs text-white/75 space-y-1">
            <p>
              <span className="text-white/50">Today:</span> {route.region}
            </p>
            <p>
              <span className="text-white/50">Era:</span> {route.era}
            </p>
            <p className="text-white/60 italic leading-relaxed">{route.eraGuide}</p>
          </div>

          <p className="text-xs text-white/70 leading-relaxed">{route.description}</p>

          <div className="space-y-2">
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em]">Route</p>
            {route.migrationSteps.map((step, index) => (
              <div key={`${route.haplogroup}-step-${index}`} className="flex gap-2">
                <div className="flex flex-col items-center pt-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400/80 shrink-0" />
                  {index < route.migrationSteps.length - 1 && (
                    <span className="w-px flex-1 bg-white/15 my-1 min-h-[12px]" />
                  )}
                </div>
                <div className="pb-2">
                  <p className="text-xs font-semibold text-white flex items-center gap-1.5 flex-wrap">
                    {step.region}
                    <span className="text-[10px] font-normal text-sky-200/80">{step.period}</span>
                  </p>
                  <p className="text-[11px] text-white/55 mt-0.5 leading-relaxed">{step.note}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-1 border-t border-white/10">
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em] mb-1">
              Phylogeny
            </p>
            <p className="text-[10px] text-slate-300 font-mono break-all flex flex-wrap items-center gap-1">
              {route.path.map((node, index) => (
                <React.Fragment key={`${route.haplogroup}-${node}-${index}`}>
                  {index > 0 && <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />}
                  <span>{node}</span>
                </React.Fragment>
              ))}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default HaplogroupMigrationCard;
