import React from 'react';
import type { Relationship, RelationshipConfidence } from '../../types';
import { dnaSupportMatchIds } from '../../lib/dnaSupport';
import { PEDIGREE_CARD_HEIGHT, PEDIGREE_CARD_WIDTH, type FamilyCard, type PedigreeFamily } from '../../lib/pedigreeFamilyLayout';

interface Props {
  families: PedigreeFamily[];
  cardsById: Map<string, FamilyCard>;
  relationshipsByPair: Map<string, Relationship>;
  highlightedPersonId?: string | null;
}

const confidenceStroke: Record<RelationshipConfidence, { color: string; dash?: string; width: number }> = {
  Confirmed: { color: '#4f46e5', width: 3 },
  Probable: { color: '#6366f1', width: 2.5 },
  Assumed: { color: '#94a3b8', width: 2 },
  Speculative: { color: '#94a3b8', dash: '5,4', width: 2 },
  Unknown: { color: '#94a3b8', dash: '1,5', width: 2 },
};
const name = (card: FamilyCard) => card.person
  ? `${card.person.firstName} ${card.person.lastName}`.trim()
  : card.placeholder === 'father' ? 'Unknown father' : 'Unknown mother';

export default function PedigreeFamilyConnections({ families, cardsById, relationshipsByPair, highlightedPersonId }: Props) {
  return <>{families.map((family) => {
    const parents = family.parentCardIds.map((id) => cardsById.get(id)!);
    const children = family.childCardIds.map((id) => cardsById.get(id)!);
    const left = Math.min(...parents.map((card) => card.left));
    const right = Math.max(...parents.map((card) => card.left + PEDIGREE_CARD_WIDTH));
    const top = Math.min(...parents.map((card) => card.top));
    const bottom = Math.max(...parents.map((card) => card.top + PEDIGREE_CARD_HEIGHT));
    const center = (left + right) / 2;
    const unionY = bottom + 12;
    const busY = children.length ? Math.min(...children.map((card) => card.top)) - 52 : unionY;
    const childXs = children.map((card) => card.left + PEDIGREE_CARD_WIDTH / 2);
    const uniqueChildren = [...new Map(children.map((card) => [card.sourceId, card])).values()];
    const count = uniqueChildren.length;
    const active = !highlightedPersonId || [...parents, ...children].some((card) => card.sourceId === highlightedPersonId);
    const parentNames = parents.map(name).join(' + ');
    const label = `${family.label}${family.reference ? ' \u00b7 Family shown again' : count ? ` \u00b7 ${count} ${count === 1 ? 'child' : 'children'}` : ''}`;
    return (
      <g key={family.id} data-family-id={family.id} data-parent-ids={parents.map((card) => card.sourceId).join(',')}>
        <title>{`${label}: ${parentNames}${children.length ? `. Children: ${uniqueChildren.map(name).join(', ')}` : ''}`}</title>
        <rect x={left - 14} y={top - 32} width={right - left + 28} height={bottom - top + 54} rx={24}
          fill={active ? '#eff6ff' : '#f8fafc'} stroke={active ? '#93c5fd' : '#cbd5e1'} strokeWidth={1.5} />
        <text x={left} y={top - 13} fontSize={11} fontWeight={700} fill="#475569" letterSpacing="0.6">{label}</text>
        {parents.length === 2 && (family.label === 'Married' || family.label === 'Partners') && (
          <line x1={left + PEDIGREE_CARD_WIDTH} x2={right - PEDIGREE_CARD_WIDTH}
            y1={top + PEDIGREE_CARD_HEIGHT / 2} y2={top + PEDIGREE_CARD_HEIGHT / 2}
            stroke="#db2777" strokeWidth={2} strokeDasharray={family.label === 'Partners' ? '5,4' : undefined} />
        )}
        {children.length > 0 && <g opacity={active ? 1 : 0.4} fill="none" stroke="#6366f1" strokeWidth={2.5}>
          {parents.map((parent) => {
            const x = parent.left + PEDIGREE_CARD_WIDTH / 2;
            return <path key={parent.id} d={`M${x},${parent.top + PEDIGREE_CARD_HEIGHT} V${unionY} H${center}`}
              strokeDasharray={parent.placeholder ? '6,5' : undefined} />;
          })}
          <path d={`M${center},${unionY} V${busY} M${Math.min(center, ...childXs)},${busY} H${Math.max(center, ...childXs)}`} />
          <circle cx={center} cy={unionY} r={4} fill="#6366f1" stroke="white" strokeWidth={1} />
          {children.map((child) => {
            const rels = parents.map((parent) => relationshipsByPair.get(`${parent.sourceId}->${child.sourceId}`)).filter((r): r is Relationship => !!r);
            const dna = rels.some((rel) => dnaSupportMatchIds(rel.metadata).length > 0);
            const confidence = rels.find((rel) => rel.confidence)?.confidence;
            const style = dna ? { color: '#059669', width: 3, dash: undefined }
              : confidence ? confidenceStroke[confidence] : { color: '#6366f1', width: 2.5, dash: undefined };
            const x = child.left + PEDIGREE_CARD_WIDTH / 2;
            return <path key={child.id} d={`M${x},${busY} V${child.top}`} stroke={style.color} strokeWidth={style.width} strokeDasharray={style.dash}>
              <title>{`${name(child)}: child of ${parentNames}${dna ? ' \u00b7 DNA-backed' : confidence ? ` \u00b7 ${confidence}` : ''}`}</title>
            </path>;
          })}
        </g>}
      </g>
    );
  })}</>;
}
