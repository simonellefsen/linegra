import React, { useMemo } from 'react';
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
}

const columnWidth = 240;
const rowHeight = 170;
const cardWidth = 180;
const cardHeight = 104;

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
}) => {
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
  const totalColumns = layout.maxColumn - layout.minColumn + 1 || 1;
  const width = totalColumns * columnWidth + cardWidth;
  const height = (layout.maxRow + 1) * rowHeight + cardHeight;

  const nodePosition = (nodeId: string) => {
    const node = layout.nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    const columnIndex = node.column + columnOffset;
    const x = columnIndex * columnWidth + columnWidth / 2;
    const y = node.row * rowHeight + cardHeight / 2;
    return { x, y };
  };

  return (
    <div className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-auto shadow-inner">
      {showPivots && (
        <div className="absolute z-20 top-4 left-4 flex flex-wrap gap-3">
          {ancestorsRemaining && (
            <div className="px-4 py-2 rounded-2xl bg-white/90 border border-slate-200 text-xs font-bold uppercase tracking-[0.3em] text-slate-600">
              More ancestors available
            </div>
          )}
          {descendantsRemaining && (
            <div className="px-4 py-2 rounded-2xl bg-white/90 border border-slate-200 text-xs font-bold uppercase tracking-[0.3em] text-slate-600">
              More descendants available
            </div>
          )}
        </div>
      )}
      <div style={{ width, height }} className="relative min-h-full min-w-full">
        <svg width={width} height={height} className="absolute inset-0 pointer-events-none">
          {layout.edges.map((edge) => {
            const from = nodePosition(edge.fromId);
            const to = nodePosition(edge.toId);
            const midY = (from.y + to.y) / 2;
            return (
              <path
                key={edge.id}
                d={`M${from.x},${from.y} C ${from.x - 40},${midY} ${to.x + 40},${midY} ${to.x},${to.y}`}
                stroke="#CBD5F5"
                strokeWidth={2}
                fill="none"
                strokeDasharray={layout.nodes.find((n) => n.id === edge.fromId)?.placeholder ? '6,5' : 'none'}
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const columnIndex = node.column + columnOffset;
          const left = columnIndex * columnWidth + columnWidth / 2 - cardWidth / 2;
          const top = node.row * rowHeight;
          const isSelected = node.person?.id === selectedPersonId;

          const lifeTag =
            node.person?.birthDate ||
            node.person?.events?.find((ev) => /christen|baptis/i.test(ev.type || ''));

          const LifeIcon = node.person?.birthDate ? Baby : Droplet;
          const lifeLabel = node.person?.birthDate
            ? node.person.birthDate
            : lifeTag?.date ?? undefined;

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
              style={{ left, top, width: cardWidth, height: cardHeight }}
              disabled={!node.person}
              onClick={() => node.person && onPersonSelect(node.person)}
            >
              <div className="flex items-center gap-3">
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
                <div className="text-left min-w-0 flex-1">
                  {node.person ? (
                    <>
                      <p className="text-sm font-bold text-slate-900 leading-5 line-clamp-2">
                        {node.person.firstName} {node.person.lastName}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                      {node.placeholder === 'father' ? 'Add Father' : 'Add Mother'}
                    </p>
                  )}
                </div>
              </div>
              {lifeLabel && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                  <LifeIcon className="w-3 h-3" />
                  <span className="truncate">{lifeLabel}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PedigreeTree;
