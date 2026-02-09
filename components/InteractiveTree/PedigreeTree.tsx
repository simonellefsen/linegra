import React, { useMemo, useState } from 'react';
import { Person, Relationship } from '../../types';
import { buildPedigreeLayout } from '../../lib/pedigreeLayout';
import { getAvatarForPerson } from '../../lib/avatar';
import { Baby, Droplet } from 'lucide-react';

interface PedigreeTreeProps {
  people: Person[];
  relationships: Relationship[];
  focusId?: string;
  onPersonSelect: (person: Person) => void;
  maxAncestors?: number;
  maxDescendants?: number;
  selectedPersonId?: string;
  showPivots?: boolean;
  ancestorsRemaining?: boolean;
  descendantsRemaining?: boolean;
  showPlaceholders?: boolean;
  siblingHints?: Record<string, boolean>;
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
  showPivots = false,
  ancestorsRemaining = false,
  descendantsRemaining = false,
  showPlaceholders = true,
  siblingHints = {},
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
  const totalGenerations = layout.maxColumn - layout.minColumn + 1 || 1;
  const totalRows = layout.maxRow + 1 || 1;
  const width = totalRows * horizontalSpacing + cardWidth;
  const height = totalGenerations * verticalSpacing + cardHeight;

  const nodeRects = useMemo(() => {
    const map = new Map<string, { left: number; top: number }>();
    layout.nodes.forEach((node) => {
      const depthIndex = node.column + columnOffset;
      const left = node.row * horizontalSpacing + horizontalSpacing / 2 - cardWidth / 2;
      const top = depthIndex * verticalSpacing;
      map.set(node.id, { left, top });
    });
    return map;
  }, [layout, columnOffset]);

  return (
    <div className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-hidden shadow-inner">
      {showPivots && (
        <div className="absolute z-20 top-4 left-4 flex flex-wrap gap-3 pointer-events-none">
          {ancestorsRemaining && (
            <div className="px-4 py-2 rounded-2xl bg-white/90 border border-slate-200 text-xs font-bold uppercase tracking-[0.3em] text-slate-600 shadow">
              More ancestors available
            </div>
          )}
          {descendantsRemaining && (
            <div className="px-4 py-2 rounded-2xl bg-white/90 border border-slate-200 text-xs font-bold uppercase tracking-[0.3em] text-slate-600 shadow">
              More descendants available
            </div>
          )}
        </div>
      )}
      <div className="w-full h-full overflow-auto">
        <div style={{ width, height }} className="relative min-h-full min-w-full">
          <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
            {layout.edges.map((edge) => {
              const fromRect = nodeRects.get(edge.fromId);
              const toRect = nodeRects.get(edge.toId);
              if (!fromRect || !toRect) return null;
              const fromX = fromRect.left + cardWidth / 2;
              const fromY = fromRect.top + cardHeight;
              const toX = toRect.left + cardWidth / 2;
              const toY = toRect.top;
              const dash = layout.nodes.find((n) => n.id === edge.fromId)?.placeholder ? '6,5' : 'none';
              const ctrlY = (fromY + toY) / 2;
              return (
                <path
                  key={edge.id}
                  d={`M${fromX},${fromY} C ${fromX},${ctrlY} ${toX},${ctrlY} ${toX},${toY}`}
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
                {node.person && siblingHints[node.person.id] && (
                  <div className="absolute -right-3 top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full shadow px-1 text-[10px] text-slate-500">
                    ⇢
                  </div>
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
                </div>
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
