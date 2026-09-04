import React, { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Person, Relationship } from '../../types';
import { buildPedigreeLayout } from '../../lib/pedigreeLayout';
import { layoutPedigreeFamilies, PEDIGREE_CARD_WIDTH, PEDIGREE_CARD_HEIGHT } from '../../lib/pedigreeFamilyLayout';
import PedigreeFamilyConnections from './PedigreeFamilyConnections';
import { centeredPedigreeScrollPosition } from '../../lib/pedigreeViewport';
import { dnaSupportMatchIds } from '../../lib/dnaSupport';
import { getAvatarForPerson } from '../../lib/avatar';
import DnaPersonBadge from '../dna/DnaPersonBadge';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Dna,
  Home,
  Maximize2,
  Plus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface PedigreeTreeProps {
  people: Person[];
  relationships: Relationship[];
  /** All tree relationships (scope-independent) — DNA-support badges are built from this so they stay
      complete and stable regardless of the visible pedigree scope or focus. Defaults to `relationships`. */
  allRelationships?: Relationship[];
  /** shared_cm keyed by dna_matches.id — used to surface the strongest backing cM on DNA badges +
   *  edge tooltips (roadmap L1). Optional; when absent, badges show only the match count. */
  dnaMatchCmById?: Map<string, number>;
  focusId?: string;
  onPersonSelect: (person: Person) => void;
  maxAncestors?: number;
  maxDescendants?: number;
  selectedPersonId?: string;
  ancestorsRemaining?: boolean;
  showPlaceholders?: boolean;
  siblingHints?: Record<string, boolean>;
  childHints?: Record<string, boolean>;
  descendantHints?: Record<string, boolean>;
  onExpandAncestors?: () => void;
  onExpandDescendants?: () => void;
  onExpandSiblings?: (personId: string) => void;
  onAddParent?: (childId: string, parentType: 'father' | 'mother') => void;
  onFocusHome?: () => void;
  homeEnabled?: boolean;
  ancestorDepth?: number;
  descendantDepth?: number;
  maxAncestorDepthLimit?: number;
  maxDescendantDepthLimit?: number;
  onDecreaseAncestors?: () => void;
  onIncreaseAncestors?: () => void;
  onDecreaseDescendants?: () => void;
  onIncreaseDescendants?: () => void;
  onResetDepths?: () => void;
  /** Opens the admin DNA panel focused on this person (K8f). */
  onDnaBadgeClick?: (personId: string) => void;
  /** Ancestor couples with weak/no DNA coverage (K9 amber halo). */
  coverageGapPersonIds?: Set<string>;
  /** Active K9 hypothesis branch — stronger highlight. */
  hypothesisPersonIds?: Set<string>;
}

const cardWidth = PEDIGREE_CARD_WIDTH;
const cardHeight = PEDIGREE_CARD_HEIGHT;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.15;

const extractYear = (value?: string) => {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? match[1] : null;
};

const PedigreeTree: React.FC<PedigreeTreeProps> = ({
  people,
  relationships,
  allRelationships,
  dnaMatchCmById,
  focusId,
  onPersonSelect,
  maxAncestors = 4,
  maxDescendants = 3,
  selectedPersonId,
  ancestorsRemaining = false,
  showPlaceholders = true,
  siblingHints = {},
  childHints = {},
  descendantHints = {},
  onExpandAncestors,
  onExpandDescendants,
  onExpandSiblings,
  onAddParent,
  onFocusHome,
  homeEnabled = false,
  ancestorDepth = 1,
  descendantDepth = 0,
  maxAncestorDepthLimit = 8,
  maxDescendantDepthLimit = 4,
  onDecreaseAncestors,
  onIncreaseAncestors,
  onDecreaseDescendants,
  onIncreaseDescendants,
  onResetDepths,
  onDnaBadgeClick,
  coverageGapPersonIds,
  hypothesisPersonIds,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHomeRecenter, setPendingHomeRecenter] = useState(false);
  const centeredFocusKeyRef = useRef<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const layout = useMemo(
    () =>
      buildPedigreeLayout(people, relationships, {
        focusId,
        maxAncestorDepth: maxAncestors,
        maxDescendantDepth: maxDescendants,
        allowPlaceholders: showPlaceholders,
      }),
    [people, relationships, focusId, maxAncestors, maxDescendants, showPlaceholders]
  );

  const mergedChildHints = useMemo(
    () => ({ ...childHints, ...layout.childHints }),
    [childHints, layout.childHints]
  );
  const mergedDescendantHints = useMemo(
    () => ({ ...descendantHints, ...layout.descendantHints }),
    [descendantHints, layout.descendantHints]
  );
  const mergedSiblingHints = useMemo(
    () => ({ ...siblingHints, ...layout.siblingHints }),
    [siblingHints, layout.siblingHints]
  );

  const familyLayout = useMemo(
    () => layoutPedigreeFamilies(layout, allRelationships ?? relationships),
    [layout, allRelationships, relationships]
  );
  const { width, height } = familyLayout;
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;
  const nodeRects = useMemo(() => new Map(familyLayout.cards.map((card) => [card.id, card])), [familyLayout]);
  const occurrencesByPersonId = useMemo(() => {
    const map = new Map<string, typeof familyLayout.cards>();
    for (const card of familyLayout.cards) {
      const entries = map.get(card.sourceId) ?? [];
      entries.push(card);
      map.set(card.sourceId, entries);
    }
    return map;
  }, [familyLayout]);
  const focusRect = familyLayout.focusCardId ? nodeRects.get(familyLayout.focusCardId) : undefined;

  // A multi-union descendant branch can be thousands of pixels wide. Start each new focus on its
  // card rather than at the canvas origin, where the branch looks disconnected and is easy to misread.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !focusId || !focusRect) return;

    const focusKey = `${focusId}:${focusRect.left}:${focusRect.top}`;
    if (centeredFocusKeyRef.current === focusKey) return;

    const position = centeredPedigreeScrollPosition(
      {
        left: focusRect.left * zoom,
        top: focusRect.top * zoom,
        width: cardWidth * zoom,
        height: cardHeight * zoom,
      },
      { width: scaledWidth, height: scaledHeight },
      { width: container.clientWidth, height: container.clientHeight }
    );
    container.scrollLeft = position.left;
    container.scrollTop = position.top;
    centeredFocusKeyRef.current = focusKey;
  }, [focusId, focusRect, scaledHeight, scaledWidth, zoom]);

  const highlightedChildId = hoveredPersonId || selectedPersonId || null;

  const dnaSupportByPersonId = useMemo(() => {
    // Build from ALL tree relationships (not the visible-scope subset) so DNA badges are complete,
    // the count is right, and they don't flicker when focus/scope changes (roadmap L1 fix).
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

  // Strongest (max) shared cM backing each person's lineage — joined from dnaMatchCmById across the
  // supporting match ids. Shown on the DNA badge + edge tooltip so the strength of the DNA evidence is
  // visible at a glance (roadmap L1). Empty when no cM map is supplied.
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

  // Parental relationship keyed `${parent}->${child}`, built from ALL tree relationships, so each
  // pedigree edge can look up its `confidence` regardless of the visible scope (same scope rule as
  // the DNA-support map above).
  const parentalRelByKey = useMemo(() => {
    const source = allRelationships ?? relationships;
    const map = new Map<string, Relationship>();
    for (const rel of source) {
      if (!rel.personId || !rel.relatedId) continue;
      map.set(`${rel.personId}->${rel.relatedId}`, rel);
    }
    return map;
  }, [allRelationships, relationships]);

  useEffect(() => {
    if (!pendingHomeRecenter || !focusId) return;
    const container = scrollContainerRef.current;
    const rect = focusRect;
    if (!container || !rect) return;
    const position = centeredPedigreeScrollPosition(
      {
        left: rect.left * zoom,
        top: rect.top * zoom,
        width: cardWidth * zoom,
        height: cardHeight * zoom,
      },
      { width: scaledWidth, height: scaledHeight },
      { width: container.clientWidth, height: container.clientHeight }
    );
    container.scrollTo({
      left: position.left,
      top: position.top,
      behavior: 'smooth',
    });
    setPendingHomeRecenter(false);
  }, [pendingHomeRecenter, focusId, focusRect, scaledHeight, scaledWidth, zoom]);

  const handleHomeClick = () => {
    if (!homeEnabled || !onFocusHome) return;
    setZoom(1);
    setMenuOpen(false);
    setMinimapOpen(false);
    onFocusHome();
    setPendingHomeRecenter(true);
  };

  return (
    <div data-tree-export-root className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-hidden shadow-inner">
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm backdrop-blur max-w-[72%]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded-full bg-emerald-600" />DNA-backed</span>
        <span className="flex items-center gap-1"><Dna className="w-3 h-3 text-emerald-700" />Badge · N matches · strongest cM</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-amber-300" />Coverage gap</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-amber-500" />K9 hypothesis</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded-full bg-indigo-600" />Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 rounded-full bg-slate-400" />Assumed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-slate-300" />Speculative</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 rounded-full bg-indigo-300" />Lineage</span>
      </div>
      <div ref={scrollContainerRef} className="w-full h-full overflow-auto pb-20">
        <div style={{ width: scaledWidth, height: scaledHeight }} className="relative min-h-full min-w-full">
          <div
            className="absolute top-0 left-0"
            style={{ width, height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
          <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
            <PedigreeFamilyConnections families={familyLayout.families} cardsById={nodeRects}
              relationshipsByPair={parentalRelByKey} highlightedPersonId={highlightedChildId} />
          </svg>

          {familyLayout.cards.map((node) => {
            const rect = nodeRects.get(node.id);
            if (!rect) return null;
            const isSelected = node.person?.id === selectedPersonId;
            const placeholderLabel =
              node.placeholder === 'father'
                ? 'Add father'
                : node.placeholder === 'mother'
                ? 'Add mother'
                : 'Add parent';
            const christeningEvent = node.person?.events?.find((ev) =>
              /(^|\b)(chr|christen|bapt)/i.test(ev.type || '')
            );
            const deathOrBurialEvent = node.person?.events?.find((ev) =>
              /(^|\b)(deat|death|buri|burial)/i.test(ev.type || '')
            );
            const birthYear =
              extractYear(node.person?.birthDate) ?? extractYear(christeningEvent?.date);
            const deathYear =
              extractYear(node.person?.deathDate) ??
              extractYear(node.person?.burialDate) ??
              extractYear(deathOrBurialEvent?.date);
            const lifeLabel =
              birthYear && deathYear ? `${birthYear} - ${deathYear}` : birthYear || deathYear || undefined;
            const isPlaceholder = !!node.placeholder;
            const canAddParent =
              isPlaceholder &&
              showPlaceholders &&
              !!onAddParent &&
              !!node.relatedPersonId &&
              (node.placeholder === 'father' || node.placeholder === 'mother');
            const showDescendantHint =
              !!node.person &&
              (mergedDescendantHints[node.person.id] ||
                (mergedChildHints[node.person.id] && node.column < layout.maxColumn));
            const dnaSupportCount = node.person
              ? dnaSupportByPersonId.get(node.person.id)?.size ?? 0
              : 0;
            const dnaCm = node.person ? dnaCmByPersonId.get(node.person.id) : undefined;
            const isHypothesis = !!node.person && hypothesisPersonIds?.has(node.person.id);
            const hasCoverageGap =
              !!node.person && !isHypothesis && coverageGapPersonIds?.has(node.person.id);
            const cardClasses = [
              'absolute',
              'rounded-[24px]',
              'shadow-lg',
              'px-4',
              'py-3',
              'transition-all',
              'border',
              isPlaceholder ? 'bg-white/70 border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-500' : 'bg-white border-slate-200',
              isSelected
                ? 'ring-4 ring-blue-300'
                : isHypothesis
                  ? 'ring-4 ring-amber-500'
                  : hasCoverageGap
                    ? 'ring-2 ring-amber-300'
                    : '',
            ].join(' ');
            return (
              <div
                key={node.id}
                data-person-id={node.sourceId}
                className={cardClasses}
                style={{ left: rect.left, top: rect.top, width: cardWidth, height: cardHeight }}
                onMouseEnter={() => setHoveredPersonId(node.person?.id ?? null)}
                onMouseLeave={() => setHoveredPersonId((prev) => (prev === node.person?.id ? null : prev))}
              >
                {node.repeated && (
                  <button
                    type="button"
                    className="absolute top-2 left-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700 hover:bg-blue-100"
                    aria-label={`Show next family view of ${node.person?.firstName} ${node.person?.lastName}`}
                    title="Same person, not a duplicate record. Jump to their next family view."
                    onClick={() => {
                      const entries = occurrencesByPersonId.get(node.sourceId)!;
                      const next = entries[(entries.findIndex((card) => card.id === node.id) + 1) % entries.length];
                      const container = scrollContainerRef.current;
                      if (!container) return;
                      const position = centeredPedigreeScrollPosition(
                        { left: next.left * zoom, top: next.top * zoom, width: cardWidth * zoom, height: cardHeight * zoom },
                        { width: scaledWidth, height: scaledHeight },
                        { width: container.clientWidth, height: container.clientHeight }
                      );
                      container.scrollTo({ ...position, behavior: 'smooth' });
                    }}
                  >
                    {occurrencesByPersonId.get(node.sourceId)?.length} views
                  </button>
                )}
                {node.person && mergedSiblingHints[node.person.id] && onExpandSiblings && (
                  <button
                    type="button"
                    className="absolute -right-4 top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full shadow p-1 text-slate-500 hover:bg-slate-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpandSiblings(node.person!.id);
                    }}
                    aria-label="Show siblings"
                    title="Show siblings"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
                {node.person && dnaSupportCount > 0 && (
                  <DnaPersonBadge
                    matchCount={dnaSupportCount}
                    strongestCm={dnaCm}
                    onClick={
                      onDnaBadgeClick && node.person
                        ? () => onDnaBadgeClick(node.person!.id)
                        : undefined
                    }
                  />
                )}
                <button
                  type="button"
                  className="flex h-full w-full flex-col items-center text-center rounded-xl focus-visible:outline-2 focus-visible:outline-blue-500"
                  disabled={isPlaceholder ? !canAddParent : !node.person}
                  onClick={() => {
                    if (canAddParent && node.relatedPersonId) {
                      onAddParent?.(node.relatedPersonId, node.placeholder as 'father' | 'mother');
                    } else if (node.person) onPersonSelect(node.person);
                  }}
                >
                  <div
                    className={`w-14 h-14 rounded-2xl overflow-hidden ${
                      node.placeholder ? 'bg-slate-100 border border-dashed border-slate-300' : ''
                    }`}
                  >
                    {node.person ? (
                      <img src={getAvatarForPerson(node.person)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center">
                          <Plus className="w-6 h-6" />
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 w-full mt-2">
                    {node.person ? (
                      <p className="text-sm font-bold text-slate-900 leading-5 line-clamp-2">
                        {node.person.firstName} {node.person.lastName}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-slate-500">
                        {placeholderLabel}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto space-y-1">
                    {node.repeated && <div className="text-[9px] font-bold text-slate-500" title="Same person, shown in more than one family group. Not a duplicate record.">Same person · shown again</div>}
                    {lifeLabel && (
                      <div className="flex items-center justify-center text-xs text-slate-500 font-medium">
                        <span className="truncate">{lifeLabel}</span>
                      </div>
                    )}
                    {showDescendantHint && (
                      <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-semibold">
                        <ChevronDown className="w-3 h-3" />
                        <span>Descendants</span>
                      </div>
                    )}
                  </div>
                </button>
                {node.person && ancestorsRemaining && node.column === layout.minColumn && onExpandAncestors && (
                  <button
                    type="button"
                    className="absolute left-1/2 -translate-x-1/2 -top-4 bg-white border border-slate-200 rounded-full shadow p-1 text-slate-500 hover:bg-slate-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpandAncestors?.();
                    }}
                    aria-label="Show more ancestors"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                )}
                {node.person && mergedDescendantHints[node.person.id] && node.column === layout.maxColumn && onExpandDescendants && (
                  <button
                    type="button"
                    className="absolute left-1/2 -translate-x-1/2 -bottom-4 bg-white border border-slate-200 rounded-full shadow p-1 text-slate-500 hover:bg-slate-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpandDescendants?.();
                    }}
                    aria-label="Show more descendants"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>
      {minimapOpen && (
        <div className="absolute bottom-20 right-4 bg-white/90 border border-slate-200 rounded-2xl shadow-2xl p-3 z-30">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-2">Overview</div>
          <div className="relative w-40 h-24 bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
            {familyLayout.cards.map((node) => {
              const rect = nodeRects.get(node.id);
              if (!rect) return null;
              const miniX = (rect.left / width) * 160 + 10;
              const miniY = (rect.top / height) * 80 + 10;
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
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Tree Controls</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onDecreaseAncestors?.()}
              disabled={!onDecreaseAncestors || ancestorDepth <= 1}
              className="px-2 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 disabled:opacity-40"
            >
              - Anc
            </button>
            <button
              type="button"
              onClick={() => onIncreaseAncestors?.()}
              disabled={!onIncreaseAncestors || ancestorDepth >= maxAncestorDepthLimit}
              className="px-2 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 disabled:opacity-40"
            >
              + Anc
            </button>
            <button
              type="button"
              onClick={() => onDecreaseDescendants?.()}
              disabled={!onDecreaseDescendants || descendantDepth <= 0}
              className="px-2 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 disabled:opacity-40"
            >
              - Desc
            </button>
            <button
              type="button"
              onClick={() => onIncreaseDescendants?.()}
              disabled={!onIncreaseDescendants || descendantDepth >= maxDescendantDepthLimit}
              className="px-2 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 disabled:opacity-40"
            >
              + Desc
            </button>
          </div>
          <button
            type="button"
            onClick={() => onResetDepths?.()}
            disabled={!onResetDepths}
            className="mt-2 w-full px-2 py-2 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 disabled:opacity-40"
          >
            Reset
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

export default PedigreeTree;
