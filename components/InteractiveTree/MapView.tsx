import React, { useMemo, useState } from 'react';
import type { Person } from '../../types';
import {
  collectMapPoints,
  collectMigrationSegments,
  projectEquirectangular,
} from '../../lib/placeCoordinates';

interface MapViewProps {
  people: Person[];
  focusId?: string;
  selectedPersonId?: string;
  onPersonSelect: (person: Person) => void;
}

const MAP_W = 960;
const MAP_H = 480;

const KIND_FILL: Record<string, string> = {
  birth: '#0ea5e9',
  death: '#334155',
  burial: '#64748b',
  event: '#8b5cf6',
  residence: '#f59e0b',
};

const MapView: React.FC<MapViewProps> = ({ people, focusId, selectedPersonId, onPersonSelect }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const points = useMemo(() => collectMapPoints(people), [people]);
  const segments = useMemo(() => collectMigrationSegments(people), [people]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const projected = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        ...projectEquirectangular(point.lat, point.lng, MAP_W, MAP_H),
      })),
    [points]
  );

  const projectedSegments = useMemo(
    () =>
      segments.map((segment) => ({
        ...segment,
        from: {
          ...projectEquirectangular(segment.from.lat, segment.from.lng, MAP_W, MAP_H),
          label: segment.from.label,
        },
        to: {
          ...projectEquirectangular(segment.to.lat, segment.to.lng, MAP_W, MAP_H),
          label: segment.to.label,
        },
      })),
    [segments]
  );

  if (!points.length) {
    return (
      <div
        data-tree-export-root
        className="w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] flex items-center justify-center text-center px-8 text-slate-500"
      >
        No geocodable places in the current scope. Add lat/lng on places or include a recognizable country name.
      </div>
    );
  }

  return (
    <div
      data-tree-export-root
      className="relative w-full h-[70vh] bg-slate-50 border border-slate-200 rounded-[40px] overflow-hidden shadow-inner"
    >
      <div className="absolute top-3 left-3 z-10 rounded-2xl bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm">
        Map · {points.length} places · {segments.length} migrations
      </div>
      <div className="h-full overflow-auto p-4 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-[#dbeafe]/30 shadow-inner"
          role="img"
          aria-label="Migration map"
        >
          <rect width={MAP_W} height={MAP_H} fill="#eff6ff" />
          {Array.from({ length: 7 }).map((_, i) => (
            <line
              key={`lat-${i}`}
              x1={0}
              y1={(MAP_H / 6) * i}
              x2={MAP_W}
              y2={(MAP_H / 6) * i}
              stroke="#cbd5e1"
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: 13 }).map((_, i) => (
            <line
              key={`lng-${i}`}
              x1={(MAP_W / 12) * i}
              y1={0}
              x2={(MAP_W / 12) * i}
              y2={MAP_H}
              stroke="#cbd5e1"
              strokeWidth={0.5}
            />
          ))}

          {projectedSegments.map((segment) => (
            <line
              key={segment.id}
              x1={segment.from.x}
              y1={segment.from.y}
              x2={segment.to.x}
              y2={segment.to.y}
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={0.7}
              className="map-migration-line"
            >
              <title>{`${segment.personName}: ${segment.from.label} → ${segment.to.label}`}</title>
            </line>
          ))}

          {projected.map((point) => {
            const isFocus = point.personId === focusId;
            const isSelected = point.personId === selectedPersonId;
            const isHovered = hoveredId === point.id;
            const person = peopleById.get(point.personId);
            return (
              <g
                key={point.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredId(point.id)}
                onMouseLeave={() => setHoveredId((prev) => (prev === point.id ? null : prev))}
                onClick={() => person && onPersonSelect(person)}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isFocus || isSelected ? 8 : 6}
                  fill={KIND_FILL[point.kind] || '#64748b'}
                  stroke={isSelected ? '#2563eb' : isFocus ? '#0284c7' : '#fff'}
                  strokeWidth={2}
                  opacity={isHovered || isFocus || isSelected ? 1 : 0.85}
                />
                {(isHovered || isFocus) && (
                  <text
                    x={point.x + 10}
                    y={point.y - 8}
                    className="fill-slate-700 text-[11px] font-semibold"
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                  >
                    {point.personName} · {point.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <style>{`
        @keyframes map-dash { to { stroke-dashoffset: -20; } }
        .map-migration-line { animation: map-dash 2.5s linear infinite; }
      `}</style>
    </div>
  );
};

export default MapView;
