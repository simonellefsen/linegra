import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Person, Relationship, RelationshipConfidence } from '../../types';
import { buildPedigreeLayout } from '../../lib/pedigreeLayout';
import { buildFanLayout } from '../../lib/fanLayout';
import { dnaSupportMatchIds } from '../../lib/dnaSupport';
import { getAvatarForPerson } from '../../lib/avatar';
import {
  ChevronDown,
  ChevronUp,
  Dna,
  Home,
  Maximize2,
  Plus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface FanTreeProps {
  people: Person[];
  relationships: Relationship[];
  allRelationships?: Relationship[];
  dnaMatchCmById?: Map<string, number>;
  focusId?: string;
  onPersonSelect: (person: Person) => void;
  maxAncestors?: number;
  selectedPersonId?: string;
  ancestorsRemaining?: boolean;
  showPlaceholders?: boolean;
  onExpandAncestors?: () => void;
  onFocusHome?: () => void;
  homeEnabled?: boolean;
  ancestorDepth?: number;
  maxAncestorDepthLimit?: number;
  onDecreaseAncestors?: () => void;
  onIncreaseAncestors?: () => void;
  onResetDepths?: () => void;
}

const cardWidth = 160;
const cardHeight = 136;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.15;

const CONFIDENCE_STROKE: Record<
  RelationshipConfidence,
  { color: string; width: number; dash: string; opacity: number }
> = {
  Confirmed: { color: '#4f46e5', width: 3, dash: 'none', opacity: 0.95 },
  Probable: { color: '#6366f1', width: 2.5, dash: 'none', opacity: 0.9 },
  Assumed: { color: '#94a3b8', width: 2, dash: 'none', opacity: 0.8 },
  Speculative: { color: '#cbd5e1', width: 2, dash: '5,4', opacity: 0.7 },
  Unknown: { color: '#cbd5e1', width: 1.5, dash: '1,5', opacity: 0.55 },
};
const DEFAULT_LINEAGE_STROKE = { color: '#a5b4fc', width: 2, dash: 'none', opacity: 0.9 };
const DNA_STROKE = { color: '#059669', width: 3, dash: 'none', opacity: 1 };
const PLACEHOLDER_OVERRIDE = { dash: '6,5', width: 2, opacity: 0.5 };

const strokeForConfidence = (conf?: RelationshipConfidence) =>
  conf ? CONFIDENCE_STROKE[conf] : DEFAULT_LINEAGE_STROKE;

const extractYear = (value?: string) => {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? match[1] : null;
};

const FanTree: React.FC<FanTreeProps> = ({
  people,
  relationships,
  allRelationships,
  dnaMatchCmById,
  focusId,
  onPersonSelect,
  maxAncestors = 4,
  selectedPersonId,
  ancestorsRemaining = false,
  showPlaceholders = true,
  onExpandAncestors,
  onFocusHome,
  homeEnabled = false,
  ancestorDepth = 1,
  maxAncestorDepthLimit = 8,
  onDecreaseAncestors,
  onIncreaseAncestors,
  onResetDepths,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHomeRecenter, setPendingHomeRecenter] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      buildPedigreeLayout(people, relationships, {
        focusId,
        maxAncestorDepth: maxAncestors,
        maxDescendantDepth: 0,
        allowPlaceholders: showPlaceholders,
      }),
    [people, relationships, focusId, maxAncestors, showPlaceholders]
  );

  const fan = useMemo(
    () => buildFanLayout(layout, { cardWidth, cardHeight }),
    [layout]
  );

  const nodeById = useMemo(() => {
    const map = new Map<string, (typeof layout.nodes)[number]>();
    layout.nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [layout]);

  const ancestorEdges = useMemo(
    () => layout.edges.filter((edge) => fan.positions.has(edge.fromId) && fan.positions.has(edge.toId)),
    [layout.edges, fan.positions]
  );

  const dnaSupportByPersonId = useMemo(() => {
    const source = allRelationships ?? relationships;
    const supportMap = new Map<string, Set<string>>();
    source.forEach((relationship) => {
      const matchIds = dnaSupportMatchIds(
        relationship.metadata as Record<string, unknown> | undefined
      );
      if (!matchIds.length) return;
      [relationship.personId, relationship.relatedId].forEach((personId) => {
        if (!personId) return;
        const existing = supportMap.get(personId) || new Set<string>();
        matchIds.forEach((matchId) => existing.add(matchId));
        supportMap.set(personId, existing);
      });
    });
    return supportMap;
  }, [allRelationships, relationships]);

  const dnaCmByPersonId = useMemo(() => {
    const map = new Map<string, number>();
    if (!dnaMatchCmById || dnaMatchCmById.size === 0) return map;
    dnaSupportByPersonId.forEach((matchIds, personId) => {
      let max = 0;
      matchIds.forEach((mid) => {
        const cm = dnaMatchCmById.get(mid);
        if (cm && cm > max) max = cm;
      });
      if (max > 0) map.set(personId, max);
    });
    return map;
  }, [dnaSupportByPersonId, dnaMatchCmById]);

  const parentalRelByKey = useMemo(() => {
    const source = allRelationships ?? relationships;
    const map = new Map<string, Relationship>();
    for (const rel of source) {
      if (!rel.personId || !rel.relatedId) continue;
      map.set(`${rel.personId}->${rel.relatedId}`, rel);
    }
    return map;
  }, [allRelationships, relationships]);

  const { width, height } = fan;
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;
  const highlightedChildId = hoveredPersonId || selectedPersonId || null;

  useEffect(() => {
    if (!pendingHomeRecenter || !focusId) return;
    const container = scrollContainerRef.current;
    const pos = fan.positions.get(focusId);
    if (!container || !pos) return;
    const targetLeft = pos.centerX * zoom - container.clientWidth / 2;
    const targetTop = pos.centerY * zoom - container.clientHeight / 2;
    container.scrollTo({
      left: Math.max(0, targetLeft),
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
    setPendingHomeRecenter(false);
  }, [pendingHomeRecenter, focusId, fan.positions, zoom]);

  const handleHomeClick = () => {
    if (!homeEnabled || !onFocusHome) return;
    setZoom(1);
    setMenuOpen(false);
    setMinimapOpen(false);
    onFocusHome();
    setPendingHomeRecenter(true);
  };

  const visibleNodes = layout.nodes.filter((node) => fan.positions.has(node.id));

  return (
    <div data-tree-export-root className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-hidden shadow-inner">
      <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-2xl bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm backdrop-blur">
        Fan view · ancestors only
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm backdrop-blur max-w-[72%]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded-full bg-emerald-600" />DNA-backed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded-full bg-indigo-600" />Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 rounded-full bg-indigo-300" />Lineage</span>
      </div>
      <div ref={scrollContainerRef} className="w-full h-full overflow-auto pb-20">
        <div style={{ width: scaledWidth, height: scaledHeight }} className="relative min-h-full min-w-full">
          <div
            className="absolute top-0 left-0"
            style={{ width, height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
            <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
              {ancestorEdges.map((edge) => {
                const parentPos = fan.positions.get(edge.fromId);
                const childPos = fan.positions.get(edge.toId);
                const parentNode = nodeById.get(edge.fromId);
                if (!parentPos || !childPos || !parentNode) return null;

                const childDnaCount = dnaSupportByPersonId.get(edge.toId)?.size ?? 0;
                const isDna = childDnaCount > 0;
                const isHighlighted = !highlightedChildId || highlightedChildId === edge.toId;
                const edgeOpacity = isHighlighted ? 1 : 0.2;
                const confidence = parentalRelByKey.get(`${edge.fromId}->${edge.toId}`)?.confidence;
                const stroke = parentNode.placeholder
                  ? { ...DEFAULT_LINEAGE_STROKE, ...PLACEHOLDER_OVERRIDE }
                  : isDna
                  ? DNA_STROKE
                  : strokeForConfidence(confidence);

                const fromX = parentPos.centerX;
                const fromY = parentPos.centerY + cardHeight / 2;
                const toX = childPos.centerX;
                const toY = childPos.centerY - cardHeight / 2;
                const midX = (fromX + toX) / 2;
                const midY = (fromY + toY) / 2;

                return (
                  <path
                    key={edge.id}
                    d={`M${fromX},${fromY} Q${midX},${midY} ${toX},${toY}`}
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    fill="none"
                    strokeDasharray={stroke.dash}
                    opacity={stroke.opacity * edgeOpacity}
                  />
                );
              })}
            </svg>

            {visibleNodes.map((node) => {
              const pos = fan.positions.get(node.id);
              if (!pos) return null;
              const isSelected = node.person?.id === selectedPersonId;
              const placeholderLabel =
                node.placeholder === 'father'
                  ? 'Add father'
                  : node.placeholder === 'mother'
                  ? 'Add mother'
                  : 'Add parent';
              const birthYear = extractYear(node.person?.birthDate);
              const deathYear = extractYear(node.person?.deathDate);
              const lifeLabel =
                birthYear && deathYear ? `${birthYear} - ${deathYear}` : birthYear || deathYear || undefined;
              const isPlaceholder = !!node.placeholder;
              const dnaSupportCount = node.person
                ? dnaSupportByPersonId.get(node.person.id)?.size ?? 0
                : 0;
              const dnaCm = node.person ? dnaCmByPersonId.get(node.person.id) : undefined;
              const generation = Math.abs(node.column);

              return (
                <button
                  key={node.id}
                  className={[
                    'absolute rounded-[22px] shadow-lg px-3 py-2 transition-all border',
                    isPlaceholder
                      ? 'bg-white/70 border-dashed border-slate-300 text-slate-400'
                      : 'bg-white border-slate-200',
                    isSelected ? 'ring-4 ring-blue-300' : '',
                  ].join(' ')}
                  style={{ left: pos.left, top: pos.top, width: cardWidth, height: cardHeight }}
                  disabled={!node.person}
                  onClick={() => node.person && onPersonSelect(node.person)}
                  onMouseEnter={() => setHoveredPersonId(node.person?.id ?? null)}
                  onMouseLeave={() =>
                    setHoveredPersonId((prev) => (prev === node.person?.id ? null : prev))
                  }
                >
                  {generation > 0 && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase tracking-wider text-slate-400 bg-white px-1.5 rounded-full border border-slate-100">
                      Gen {generation}
                    </span>
                  )}
                  <div className="flex h-full flex-col items-center text-center">
                    {node.person && dnaSupportCount > 0 && (
                      <div className="absolute top-2 right-2 inline-flex flex-col items-center justify-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Dna className="w-3 h-3" />
                          <span className="text-[9px] font-black leading-none">{dnaSupportCount}</span>
                        </span>
                        {dnaCm ? (
                          <span className="text-[8px] font-bold leading-none opacity-80">
                            {Math.round(dnaCm)}cM
                          </span>
                        ) : null}
                      </div>
                    )}
                    <div
                      className={`w-12 h-12 rounded-xl overflow-hidden ${
                        node.placeholder ? 'bg-slate-100 border border-dashed border-slate-300' : ''
                      }`}
                    >
                      {node.person ? (
                        <img
                          src={getAvatarForPerson(node.person)}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Plus className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 w-full mt-1.5">
                      {node.person ? (
                        <p className="text-xs font-bold text-slate-900 leading-4 line-clamp-2">
                          {node.person.firstName} {node.person.lastName}
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-slate-500">{placeholderLabel}</p>
                      )}
                    </div>
                    {lifeLabel && (
                      <p className="mt-auto text-[10px] text-slate-500 font-medium truncate w-full">
                        {lifeLabel}
                      </p>
                    )}
                  </div>
                  {node.person &&
                    ancestorsRemaining &&
                    node.column === layout.minColumn &&
                    onExpandAncestors && (
                      <button
                        type="button"
                        className="absolute left-1/2 -translate-x-1/2 -top-4 bg-white border border-slate-200 rounded-full shadow p-1 text-slate-500 hover:bg-slate-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExpandAncestors();
                        }}
                        aria-label="Show more ancestors"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                    )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {minimapOpen && (
        <div className="absolute bottom-20 right-4 bg-white/90 border border-slate-200 rounded-2xl shadow-2xl p-3 z-30">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-2">Overview</div>
          <div className="relative w-40 h-24 bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
            {visibleNodes.map((node) => {
              const pos = fan.positions.get(node.id);
              if (!pos) return null;
              const miniX = (pos.left / width) * 160 + 10;
              const miniY = (pos.top / height) * 80 + 10;
              return (
                <span
                  key={`mini-${node.id}`}
                  className={`absolute w-2 h-2 rounded-sm ${node.person ? 'bg-slate-700' : 'bg-slate-300'}`}
                  style={{ left: miniX, top: miniY }}
                />
              );
            })}
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="fixed md:absolute left-3 md:left-4 bottom-16 md:bottom-20 z-[60] bg-white/95 border border-slate-200 rounded-2xl shadow-2xl p-3 w-[220px]">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Fan Controls</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onDecreaseAncestors?.()}
              disabled={!onDecreaseAncestors || ancestorDepth <= 1}
              className="px-2 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 disabled:opacity-40"
            >
              - Gen
            </button>
            <button
              type="button"
              onClick={() => onIncreaseAncestors?.()}
              disabled={!onIncreaseAncestors || ancestorDepth >= maxAncestorDepthLimit}
              className="px-2 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 disabled:opacity-40"
            >
              + Gen
            </button>
          </div>
          <button
            type="button"
            onClick={() => onResetDepths?.()}
            disabled={!onResetDepths}
            className="mt-2 w-full px-2 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 disabled:opacity-40"
          >
            Reset depth
          </button>
        </div>
      )}

      <div className="fixed md:absolute bottom-0 left-0 right-0 md:left-0 md:right-0 z-50 md:z-20 flex items-center gap-3 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-white/90 border-t border-slate-200 backdrop-blur">
        <button
          type="button"
          className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-slate-600 flex items-center gap-2 px-2"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
          {menuOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        <div className="ml-auto flex items-center text-slate-500 divide-x divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            className="w-11 h-11 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
            onClick={handleHomeClick}
            disabled={!homeEnabled || !onFocusHome}
            aria-label="Focus tree home person"
          >
            <Home className="w-5 h-5" />
          </button>
          <button
            className="w-11 h-11 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
            onClick={() => setZoom((current) => Math.min(MAX_ZOOM, Number((current + ZOOM_STEP).toFixed(2))))}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            className="w-11 h-11 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
            onClick={() => setZoom((current) => Math.max(MIN_ZOOM, Number((current - ZOOM_STEP).toFixed(2))))}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            className={`w-11 h-11 flex items-center justify-center hover:bg-slate-50 ${minimapOpen ? 'text-slate-900' : ''}`}
            onClick={() => setMinimapOpen((prev) => !prev)}
            aria-label="Toggle overview"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FanTree;
