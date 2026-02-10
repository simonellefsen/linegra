import React, { useMemo, useState } from 'react';
import { Person, Relationship } from '../../types';
import { buildPedigreeLayout } from '../../lib/pedigreeLayout';
import { getAvatarForPerson } from '../../lib/avatar';
import { Baby, Droplet, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Home } from 'lucide-react';

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
}

const horizontalSpacing = 220;
const verticalSpacing = 180;
const cardWidth = 180;
const cardHeight = 120;

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
}) => {
  const [minimapOpen, setMinimapOpen] = useState(false);
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

  const columnOffset = -layout.minColumn;
  const rowOffset = -layout.minRow;
  const totalGenerations = layout.maxColumn - layout.minColumn + 1 || 1;
  const totalRows = layout.maxRow - layout.minRow + 1 || 1;
  const width = totalRows * horizontalSpacing + cardWidth;
  const height = totalGenerations * verticalSpacing + cardHeight;

  const nodeRects = useMemo(() => {
    const map = new Map<string, { left: number; top: number }>();
    layout.nodes.forEach((node) => {
      const depthIndex = node.column + columnOffset;
      const left =
        (node.row + rowOffset) * horizontalSpacing + horizontalSpacing / 2 - cardWidth / 2;
      const top = depthIndex * verticalSpacing;
      map.set(node.id, { left, top });
    });
    return map;
  }, [layout, columnOffset, rowOffset]);
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

  return (
    <div className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-hidden shadow-inner">
      <div className="w-full h-full overflow-auto">
        <div style={{ width, height }} className="relative min-h-full min-w-full">
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
            const lifeTag =
              node.person?.birthDate ||
              node.person?.events?.find((ev) => /christen|baptis/i.test(ev.type || ''));
            const LifeIcon = node.person?.birthDate ? Baby : Droplet;
            const lifeLabel = node.person?.birthDate
              ? node.person.birthDate
              : lifeTag?.date ?? node.person?.deathDate ?? undefined;
            const isPlaceholder = !!node.placeholder;
            const cardClasses = [
              'absolute',
              'rounded-[24px]',
              'shadow-lg',
              'px-4',
              'py-4',
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
                <div className="flex flex-col items-center text-center gap-2">
                  <div
                    className={`w-16 h-16 rounded-2xl overflow-hidden ${
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
                  <div className="min-w-0 w-full">
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
                  {lifeLabel && (
                    <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
                      <LifeIcon className="w-3 h-3" />
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

          {minimapOpen && (
            <div className="absolute bottom-24 right-4 bg-white/90 border border-slate-200 rounded-2xl shadow-2xl p-3 z-30">
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
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-white/85 border-t border-slate-200 backdrop-blur">
        <button className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
          Menu
        </button>
        <button
          className="px-4 py-2 rounded-2xl border border-slate-200 text-xs font-bold uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2 disabled:opacity-40"
          onClick={onFocusHome}
          disabled={!homeEnabled || !onFocusHome}
        >
          <Home className="w-4 h-4" />
          Home
        </button>
        <div className="flex items-center gap-2 text-slate-500">
          <button
            className="px-4 py-2 rounded-2xl border border-slate-200 text-xs font-bold uppercase tracking-[0.3em]"
            onClick={() => setMinimapOpen((prev) => !prev)}
          >
            {minimapOpen ? 'Hide Overview' : 'Overview'}
          </button>
          <button className="px-3 py-2 rounded-2xl border border-slate-200 text-xs font-bold uppercase tracking-[0.3em]">
            ⤢
          </button>
        </div>
      </div>
    </div>
  );
};

export default PedigreeTree;
