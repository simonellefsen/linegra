import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Person, Relationship } from '../../types';
import { buildPedigreeLayout } from '../../lib/pedigreeLayout';
import { getAvatarForPerson } from '../../lib/avatar';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Home,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface PedigreeTreeProps {
  people: Person[];
  relationships: Relationship[];
  focusId?: string;
  onPersonSelect: (person: Person) => void;
  maxAncestors?: number;
  maxDescendants?: number;
  selectedPersonId?: string;
  ancestorsRemaining?: boolean;
  descendantsRemaining?: boolean;
  showPlaceholders?: boolean;
  siblingHints?: Record<string, boolean>;
  childHints?: Record<string, boolean>;
  onExpandAncestors?: () => void;
  onExpandDescendants?: () => void;
  onExpandSiblings?: (personId: string) => void;
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
}

const horizontalSpacing = 220;
const verticalSpacing = 180;
const cardWidth = 180;
const cardHeight = 152;
const TOP_CANVAS_PADDING = 28;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.15;
const MIN_ROW_GAP = 1;

const extractYear = (value?: string) => {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? match[1] : null;
};

const PedigreeTree: React.FC<PedigreeTreeProps> = ({
  people,
  relationships,
  focusId,
  onPersonSelect,
  maxAncestors = 4,
  maxDescendants = 3,
  selectedPersonId,
  ancestorsRemaining = false,
  descendantsRemaining = false,
  showPlaceholders = true,
  siblingHints = {},
  childHints = {},
  onExpandAncestors,
  onExpandDescendants,
  onExpandSiblings,
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
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHomeRecenter, setPendingHomeRecenter] = useState(false);
  const [zoom, setZoom] = useState(1);
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

  const packedRowByNodeId = useMemo(() => {
    const byColumn = new Map<number, typeof layout.nodes>();
    layout.nodes.forEach((node) => {
      const list = byColumn.get(node.column) || [];
      list.push(node);
      byColumn.set(node.column, list);
    });

    const packed = new Map<string, number>();
    byColumn.forEach((nodesInColumn) => {
      const sorted = [...nodesInColumn].sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        // Keep real people closer to their computed row and push placeholders outward first.
        if (!!a.placeholder === !!b.placeholder) return 0;
        return a.placeholder ? 1 : -1;
      });

      let lastRow = Number.NEGATIVE_INFINITY;
      sorted.forEach((node) => {
        let nextRow = node.row;
        if (nextRow - lastRow < MIN_ROW_GAP) {
          nextRow = lastRow + MIN_ROW_GAP;
        }
        packed.set(node.id, nextRow);
        lastRow = nextRow;
      });
    });

    return packed;
  }, [layout]);

  const packedRows = useMemo(() => Array.from(packedRowByNodeId.values()), [packedRowByNodeId]);
  const columnOffset = -layout.minColumn;
  const minPackedRow = packedRows.length ? Math.min(...packedRows) : layout.minRow;
  const maxPackedRow = packedRows.length ? Math.max(...packedRows) : layout.maxRow;
  const rowOffset = -minPackedRow;
  const totalGenerations = layout.maxColumn - layout.minColumn + 1 || 1;
  const totalRows = maxPackedRow - minPackedRow + 1 || 1;
  const width = totalRows * horizontalSpacing + cardWidth;
  const height = totalGenerations * verticalSpacing + cardHeight + TOP_CANVAS_PADDING;
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;

  const nodeRects = useMemo(() => {
    const map = new Map<string, { left: number; top: number }>();
    layout.nodes.forEach((node) => {
      const depthIndex = node.column + columnOffset;
      const packedRow = packedRowByNodeId.get(node.id) ?? node.row;
      const left =
        (packedRow + rowOffset) * horizontalSpacing + horizontalSpacing / 2 - cardWidth / 2;
      const top = depthIndex * verticalSpacing + TOP_CANVAS_PADDING;
      map.set(node.id, { left, top });
    });
    return map;
  }, [layout, columnOffset, rowOffset, packedRowByNodeId]);
  const nodeById = useMemo(() => {
    const map = new Map<string, typeof layout.nodes[number]>();
    layout.nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [layout]);

  const childEdgeGroups = useMemo(() => {
    const groups = new Map<string, typeof layout.edges>();
    layout.edges.forEach((edge) => {
      const arr = groups.get(edge.toId) || [];
      arr.push(edge);
      groups.set(edge.toId, arr);
    });
    return groups;
  }, [layout]);

  useEffect(() => {
    if (!pendingHomeRecenter || !focusId) return;
    const container = scrollContainerRef.current;
    const rect = nodeRects.get(focusId);
    if (!container || !rect) return;
    const targetLeft = rect.left * zoom + (cardWidth * zoom) / 2 - container.clientWidth / 2;
    const targetTop = rect.top * zoom + (cardHeight * zoom) / 2 - container.clientHeight / 2;
    container.scrollTo({
      left: Math.max(0, targetLeft),
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
    setPendingHomeRecenter(false);
  }, [pendingHomeRecenter, focusId, nodeRects, zoom]);

  const handleHomeClick = () => {
    if (!homeEnabled || !onFocusHome) return;
    setZoom(1);
    setMenuOpen(false);
    setMinimapOpen(false);
    onFocusHome();
    setPendingHomeRecenter(true);
  };

  return (
    <div className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-hidden shadow-inner">
      <div ref={scrollContainerRef} className="w-full h-full overflow-auto pb-20">
        <div style={{ width: scaledWidth, height: scaledHeight }} className="relative min-h-full min-w-full">
          <div
            className="absolute top-0 left-0"
            style={{ width, height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
          <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
            {Array.from(childEdgeGroups.entries()).map(([childId, edges]) => {
              const childRect = nodeRects.get(childId);
              if (!childRect) return null;
              if (edges.length >= 2) {
                const parents = edges
                  .map((edge) => {
                    const rect = nodeRects.get(edge.fromId);
                    const node = nodeById.get(edge.fromId);
                    if (!rect || !node) return null;
                    return { rect, node, edge };
                  })
                  .filter(Boolean) as Array<{
                    rect: { left: number; top: number };
                    node: typeof layout.nodes[number];
                    edge: typeof layout.edges[number];
                  }>;
                if (parents.length < 2) {
                  // Fallback to single line if only one parent with rect.
                  const fallbackEdge = parents[0];
                  if (!fallbackEdge) return null;
                  const fromX = fallbackEdge.rect.left + cardWidth / 2;
                  const fromY = fallbackEdge.rect.top + cardHeight;
                  const toX = childRect.left + cardWidth / 2;
                  const toY = childRect.top;
                  const midY = (fromY + toY) / 2;
                  const dash = fallbackEdge.node.placeholder ? '6,5' : 'none';
                  return (
                    <path
                      key={`${fallbackEdge.edge.id}-single`}
                      d={`M${fromX},${fromY} L${fromX},${midY} L${toX},${midY} L${toX},${toY}`}
                      stroke="#CBD5F5"
                      strokeWidth={2}
                      fill="none"
                      strokeDasharray={dash}
                    />
                  );
                }
                parents.sort((a, b) => a.rect.left - b.rect.left);
                const parentXs = parents.map((p) => p.rect.left + cardWidth / 2);
                let unionY = Math.min(...parents.map((p) => p.rect.top + cardHeight)) + 20;
                unionY = Math.min(unionY, childRect.top - 20);
                const midX = (Math.min(...parentXs) + Math.max(...parentXs)) / 2;
                return (
                  <g key={`${childId}-union`}>
                    {parents.map((parent, idx) => (
                      <line
                        key={`${childId}-parent-${idx}`}
                        x1={parent.rect.left + cardWidth / 2}
                        y1={parent.rect.top + cardHeight}
                        x2={parent.rect.left + cardWidth / 2}
                        y2={unionY}
                        stroke="#CBD5F5"
                        strokeWidth={2}
                        strokeDasharray={parent.node.placeholder ? '6,5' : 'none'}
                      />
                    ))}
                    <line
                      x1={Math.min(...parentXs)}
                      x2={Math.max(...parentXs)}
                      y1={unionY}
                      y2={unionY}
                      stroke="#CBD5F5"
                      strokeWidth={2}
                    />
                    <line
                      x1={midX}
                      x2={midX}
                      y1={unionY}
                      y2={childRect.top}
                      stroke="#CBD5F5"
                      strokeWidth={2}
                    />
                  </g>
                );
              }
              const edge = edges[0];
              const parentNode = nodeById.get(edge.fromId);
              const fromRect = nodeRects.get(edge.fromId);
              if (!fromRect || !parentNode) return null;
              const fromX = fromRect.left + cardWidth / 2;
              const fromY = fromRect.top + cardHeight;
              const toX = childRect.left + cardWidth / 2;
              const toY = childRect.top;
              const midY = (fromY + toY) / 2;
              const dash = parentNode.placeholder ? '6,5' : 'none';
              return (
                <path
                  key={edge.id}
                  d={`M${fromX},${fromY} L${fromX},${midY} L${toX},${midY} L${toX},${toY}`}
                  stroke="#CBD5F5"
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray={dash}
                />
              );
            })}
          </svg>

          {layout.nodes.map((node) => {
            const rect = nodeRects.get(node.id);
            if (!rect) return null;
            const isSelected = node.person?.id === selectedPersonId;
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
            const cardClasses = [
              'absolute',
              'rounded-[24px]',
              'shadow-lg',
              'px-4',
              'py-3',
              'transition-all',
              'border',
              isPlaceholder ? 'bg-white/70 border-dashed border-slate-300 text-slate-400' : 'bg-white border-slate-200',
              isSelected ? 'ring-4 ring-blue-300' : '',
            ].join(' ');
            return (
              <button
                key={node.id}
                className={cardClasses}
                style={{ left: rect.left, top: rect.top, width: cardWidth, height: cardHeight }}
                disabled={!node.person}
                onClick={() => node.person && onPersonSelect(node.person)}
              >
                {node.person && siblingHints[node.person.id] && onExpandSiblings && (
                  <>
                    <button
                      type="button"
                      className="absolute -left-4 top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full shadow p-1 text-slate-500 hover:bg-slate-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExpandSiblings?.(node.person!.id);
                      }}
                      aria-label="Show siblings"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="absolute -right-4 top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full shadow p-1 text-slate-500 hover:bg-slate-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExpandSiblings?.(node.person!.id);
                      }}
                      aria-label="Show siblings"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </>
                )}
                <div className="flex h-full flex-col items-center text-center">
                  <div
                    className={`w-14 h-14 rounded-2xl overflow-hidden ${
                      node.placeholder ? 'bg-slate-100 border border-dashed border-slate-300' : ''
                    }`}
                  >
                    {node.person ? (
                      <img src={getAvatarForPerson(node.person)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-slate-400">
                        Add
                        <br />
                        {node.placeholder === 'father' ? 'Father' : node.placeholder === 'mother' ? 'Mother' : 'Parent'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 w-full mt-2">
                    {node.person ? (
                      <p className="text-sm font-bold text-slate-900 leading-5 line-clamp-2">
                        {node.person.firstName} {node.person.lastName}
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                        {node.placeholder === 'father' ? 'Add Father' : 'Add Mother'}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto space-y-1">
                    {lifeLabel && (
                      <div className="flex items-center justify-center text-xs text-slate-500 font-medium">
                        <span className="truncate">{lifeLabel}</span>
                      </div>
                    )}
                    {node.person && childHints[node.person.id] && (
                      <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-semibold">
                        <ChevronDown className="w-3 h-3" />
                        <span>Descendants</span>
                      </div>
                    )}
                  </div>
                </div>
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
                {node.person && descendantsRemaining && node.column === layout.maxColumn && onExpandDescendants && (
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
            {layout.nodes.map((node) => {
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
