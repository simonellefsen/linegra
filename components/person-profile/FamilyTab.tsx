import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle,
  HelpCircle,
  Info,
  Search,
  Target,
  GripVertical,
  Unlink as UnlinkIcon,
} from 'lucide-react';
import { FamilyLayoutState, Person, Relationship, RelationshipConfidence } from '../../types';
import { CONFIDENCE_LEVELS, PARENT_LINK_TYPES } from './constants';

interface FamilyTabProps {
  parents: Array<{ person: Person; rel: Relationship }>;
  spouses: Array<{ person: Person; rel: Relationship }>;
  children: Array<{ person: Person; rel: Relationship }>;
  person: Person;
  relationships: Relationship[];
  relConfidences: Record<string, RelationshipConfidence>;
  onUpdateConfidence: (relId: string, confidence: RelationshipConfidence) => void;
  onNavigateToPerson?: (person: Person) => void;
  familyLayout?: FamilyLayoutState;
  onPersistFamilyLayout?: (personId: string, layout: FamilyLayoutState) => void;
}

const formatYear = (input?: string) => {
  if (!input) return null;
  const match = input.match(/(\d{4})/);
  return match ? match[1] : input;
};

const getConfidenceStyle = (level: RelationshipConfidence) => {
  switch (level) {
    case 'Confirmed':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle };
    case 'Probable':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Info };
    case 'Assumed':
      return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: Target };
    case 'Speculative':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: HelpCircle };
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', icon: Search };
  }
};

const RelationCard: React.FC<{
  item: { person: Person; rel: Relationship };
  label: string;
  metadata?: string | null;
  confidence: RelationshipConfidence;
  onConfidenceChange: (relId: string, confidence: RelationshipConfidence) => void;
  onNavigate?: (person: Person) => void;
}> = ({ item, label, metadata, confidence, onConfidenceChange, onNavigate }) => {
  const style = getConfidenceStyle(confidence);
  const StatusIcon = style.icon;
  const initials = `${item.person.firstName?.[0] ?? ''}${item.person.lastName?.[0] ?? ''}`.toUpperCase() || '??';

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(item.person)}
      className="w-full text-left p-4 bg-white border border-slate-100 rounded-3xl hover:border-slate-300 transition-all group shadow-sm hover:shadow-md focus:outline-none"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center font-black tracking-widest">
            {item.person.photoUrl ? (
              <img src={item.person.photoUrl} className="w-full h-full object-cover rounded-2xl" />
            ) : (
              initials
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
              {item.person.firstName} {item.person.lastName}
            </p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{label}</p>
            {metadata && <p className="text-[10px] text-slate-400 mt-1">{metadata}</p>}
          </div>
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-2xl border ${style.bg} ${style.border}`}
          onClick={(e) => e.stopPropagation()}
        >
          <StatusIcon className={`w-3.5 h-3.5 ${style.text}`} />
          <select
            value={confidence}
            onChange={(event) => onConfidenceChange(item.rel.id, event.target.value as RelationshipConfidence)}
            className={`bg-transparent border-none text-[9px] font-black uppercase tracking-widest ${style.text} outline-none cursor-pointer`}
          >
            {CONFIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      </div>
    </button>
  );
};

const FamilyTab: React.FC<FamilyTabProps> = ({
  parents,
  spouses,
  children,
  person,
  relationships,
  relConfidences,
  onUpdateConfidence,
  onNavigateToPerson,
  familyLayout,
  onPersistFamilyLayout,
}) => {
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Kinship Map & Confidence</p>
      <div className="space-y-8">
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Parental Connections</p>
          {parents.map((item) => {
            const meta = item.rel.notes || formatYear(item.rel.date) ? `Linked ${formatYear(item.rel.date) || ''}`.trim() : null;
            const confidence = relConfidences[item.rel.id] || 'Unknown';
            return (
              <RelationCard
                key={item.rel.id}
                item={item}
                label="Ancestral Link"
                metadata={meta}
                confidence={confidence}
                onConfidenceChange={onUpdateConfidence}
                onNavigate={onNavigateToPerson}
              />
            );
          })}
          {parents.length === 0 && <p className="text-xs text-slate-400 italic p-4">No parental records found.</p>}
        </div>
        <FamilyGroups
          personId={person.id}
          spouses={spouses}
          children={children}
          relationships={relationships}
          initialLayout={familyLayout}
          onNavigate={onNavigateToPerson}
          onPersist={onPersistFamilyLayout}
          relConfidences={relConfidences}
          onUpdateConfidence={onUpdateConfidence}
        />
      </div>
    </div>
  );
};

export default FamilyTab;

interface FamilyGroupProps {
  personId: string;
  spouses: Array<{ person: Person; rel: Relationship }>;
  children: Array<{ person: Person; rel: Relationship }>;
  relationships: Relationship[];
  onNavigate?: (person: Person) => void;
  initialLayout?: FamilyLayoutState;
  onPersist?: (personId: string, layout: FamilyLayoutState) => void;
  relConfidences: Record<string, RelationshipConfidence>;
  onUpdateConfidence: (relId: string, confidence: RelationshipConfidence) => void;
}

const FamilyGroups: React.FC<FamilyGroupProps> = ({
  personId,
  spouses,
  children,
  relationships,
  initialLayout,
  onNavigate,
  onPersist,
  relConfidences,
  onUpdateConfidence,
}) => {
  const layoutSeed = useMemo(() => {
    const baseAssignments: Record<string, string | null> = {};
    const spouseIds = new Set(spouses.map((sp) => sp.rel.id));
    const childIds = new Set(children.map((child) => child.rel.id));
    children.forEach((child) => {
      const linkedSpouse = spouses.find((spouse) =>
        relationships.some(
          (rel) =>
            rel.personId === spouse.person.id &&
            rel.relatedId === child.person.id &&
            PARENT_LINK_TYPES.includes(rel.type)
        )
      );
      baseAssignments[child.rel.id] = linkedSpouse?.rel.id ?? null;
    });

    const layoutAssignments = (initialLayout?.assignments ?? {}) as Record<string, string | null>;
    Object.entries(layoutAssignments).forEach(([childId, spouseId]) => {
      if (childIds.has(childId) && (!spouseId || spouseIds.has(spouseId))) {
        baseAssignments[childId] = spouseId;
      }
    });

    const manualOrders: Record<string, string[]> = {};
    const layoutOrders = (initialLayout?.manualOrders ?? {}) as Record<string, string[]>;
    Object.entries(layoutOrders).forEach(([key, order]) => {
      const filtered = order.filter((childId) => childIds.has(childId));
      if (filtered.length) manualOrders[key] = filtered;
    });

    return {
      assignments: baseAssignments,
      manualOrders,
      removedSpouses: new Set(((initialLayout?.removedSpouseIds ?? []) as string[]).filter((id) => spouseIds.has(id))),
      removedChildren: new Set(((initialLayout?.removedChildIds ?? []) as string[]).filter((id) => childIds.has(id))),
    };
  }, [children, spouses, relationships, initialLayout]);

  const [assignments, setAssignments] = useState<Record<string, string | null>>(layoutSeed.assignments);
  const [manualOrders, setManualOrders] = useState<Record<string, string[]>>(layoutSeed.manualOrders);
  const [removedSpouseIds, setRemovedSpouseIds] = useState<Set<string>>(layoutSeed.removedSpouses);
  const [removedChildIds, setRemovedChildIds] = useState<Set<string>>(layoutSeed.removedChildren);
  const hydratingRef = useRef(false);
  const [dragContext, setDragContext] = useState<{ childId: string; groupKey: string } | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const [hoverChild, setHoverChild] = useState<string | null>(null);
  const lastPersistedRef = useRef(
    JSON.stringify({
      assignments: layoutSeed.assignments,
      manualOrders: layoutSeed.manualOrders,
      removedSpouseIds: Array.from(layoutSeed.removedSpouses),
      removedChildIds: Array.from(layoutSeed.removedChildren),
    })
  );

  useEffect(() => {
    hydratingRef.current = true;
    setAssignments(layoutSeed.assignments);
    setManualOrders(layoutSeed.manualOrders);
    setRemovedSpouseIds(new Set(layoutSeed.removedSpouses));
    setRemovedChildIds(new Set(layoutSeed.removedChildren));
    lastPersistedRef.current = JSON.stringify({
      assignments: layoutSeed.assignments,
      manualOrders: layoutSeed.manualOrders,
      removedSpouseIds: Array.from(layoutSeed.removedSpouses),
      removedChildIds: Array.from(layoutSeed.removedChildren),
    });
    const timer = setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [personId, layoutSeed]);

  const keyForGroup = (groupId: string | null) => groupId ?? 'unassigned';

  const parseBirthValue = (value?: string) => {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const match = value.match(/(\d{4})/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const activeSpouses = spouses.filter((sp) => !removedSpouseIds.has(sp.rel.id));
  const activeChildren = children.filter((child) => !removedChildIds.has(child.rel.id));

  const getBaseChildren = useCallback(
    (groupId: string | null): Array<{ person: Person; rel: Relationship }> => {
      return activeChildren
        .filter((child) => keyForGroup(assignments[child.rel.id] ?? null) === keyForGroup(groupId))
        .sort((a, b) => {
          const aVal = parseBirthValue(a.person.birthDate);
          const bVal = parseBirthValue(b.person.birthDate);
          if (aVal !== bVal) return aVal - bVal;
          return `${a.person.lastName}${a.person.firstName}`.localeCompare(
            `${b.person.lastName}${b.person.firstName}`
          );
        });
    },
    [activeChildren, assignments]
  );

  const getDisplayChildren = useCallback(
    (groupId: string | null): Array<{ person: Person; rel: Relationship }> => {
      const base = getBaseChildren(groupId);
      const manual = manualOrders[keyForGroup(groupId)];
      if (!manual || manual.length === 0) return base;
      const remaining = new Map<string, { person: Person; rel: Relationship }>(base.map((child) => [child.rel.id, child]));
      const ordered: Array<{ person: Person; rel: Relationship }> = [];
      manual.forEach((relId) => {
        const child = remaining.get(relId);
        if (child) {
          ordered.push(child);
          remaining.delete(relId);
        }
      });
      return ordered.concat(Array.from(remaining.values()));
    },
    [getBaseChildren, manualOrders]
  );

  const scrubChildFromManualOrders = (childRelId: string) => {
    setManualOrders((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        const filtered = next[key].filter((id) => id !== childRelId);
        if (filtered.length === 0) {
          delete next[key];
        } else {
          next[key] = filtered;
        }
      });
      return next;
    });
  };

  const persistLayout = useCallback(() => {
    if (hydratingRef.current || !onPersist) return;
    const payload: FamilyLayoutState = {
      assignments,
      manualOrders,
      removedSpouseIds: Array.from(removedSpouseIds),
      removedChildIds: Array.from(removedChildIds),
    };
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastPersistedRef.current) return;
    lastPersistedRef.current = snapshot;
    onPersist(personId, payload);
  }, [assignments, manualOrders, removedSpouseIds, removedChildIds, onPersist, personId]);

  const beginDrag = (event: React.DragEvent, childId: string, groupId: string | null) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    setDragContext({ childId, groupKey: keyForGroup(groupId) });
  };

  const endDrag = () => {
    setDragContext(null);
  };

  const handleDragOver = (event: React.DragEvent, groupId: string | null) => {
    if (!dragContext) return;
    const canonical = keyForGroup(groupId);
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setHoverGroup(canonical);
  };

  const normalizeGroupKey = (groupKey: string) => (groupKey === 'unassigned' ? null : groupKey);

  const insertChildInOrder = (order: string[], childId: string, targetChildId: string | null) => {
    const filtered = order.filter((id) => id !== childId);
    if (targetChildId && filtered.includes(targetChildId)) {
      const targetIndex = filtered.indexOf(targetChildId);
      filtered.splice(targetIndex, 0, childId);
    } else {
      filtered.push(childId);
    }
    return filtered;
  };

  const reorderWithinGroup = (targetChildId: string | null, groupId: string | null) => {
    if (!dragContext) return false;
    const canonical = keyForGroup(groupId);
    if (dragContext.groupKey !== canonical) return false;
    const normalized = normalizeGroupKey(canonical);
    const orderedIds = getDisplayChildren(normalized).map((child) => child.rel.id);
    const newOrder = insertChildInOrder(orderedIds, dragContext.childId, targetChildId);
    setManualOrders((prev) => ({ ...prev, [canonical]: newOrder }));
    return true;
  };

  const moveChildToGroup = (targetChildId: string | null, groupId: string | null) => {
    if (!dragContext) return;
    const targetKey = keyForGroup(groupId);
    const sourceKey = dragContext.groupKey;
    if (sourceKey === targetKey) {
      reorderWithinGroup(targetChildId, groupId);
      endDrag();
      return;
    }
    const normalizedTarget = normalizeGroupKey(targetKey);
    setAssignments((prev) => ({ ...prev, [dragContext.childId]: normalizedTarget }));
    scrubChildFromManualOrders(dragContext.childId);
    setManualOrders((prev) => {
      const next = { ...prev };
      const base = next[targetKey] ? next[targetKey].filter((id) => id !== dragContext.childId) : [];
      next[targetKey] = insertChildInOrder(base, dragContext.childId, targetChildId);
      return next;
    });
    endDrag();
  };

  const handleDropOnChild = (event: React.DragEvent, childId: string, groupId: string | null) => {
    event.preventDefault();
    moveChildToGroup(childId, groupId);
    setHoverGroup(null);
    setHoverChild(null);
  };

  const handleDropOnGroup = (event: React.DragEvent, groupId: string | null) => {
    event.preventDefault();
    moveChildToGroup(null, groupId);
    setHoverGroup(null);
    setHoverChild(null);
  };

  const handleDragLeave = (event: React.DragEvent, groupId: string | null) => {
    const canonical = keyForGroup(groupId);
    const currentTarget = event.currentTarget as HTMLElement;
    if (event.relatedTarget && currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    if (hoverGroup === canonical) {
      setHoverGroup(null);
    }
  };

  const handleChildDragOver = (event: React.DragEvent, childId: string, groupId: string | null) => {
    handleDragOver(event, groupId);
    setHoverChild(childId);
  };

  const handleChildDragLeave = (event: React.DragEvent, childId: string, groupId: string | null) => {
    const currentTarget = event.currentTarget as HTMLElement;
    if (event.relatedTarget && currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    if (hoverChild === childId) setHoverChild(null);
    handleDragLeave(event, groupId);
  };

  useEffect(() => {
    if (hydratingRef.current) return;
    const debounce = setTimeout(() => {
      persistLayout();
    }, 500);
    return () => clearTimeout(debounce);
  }, [assignments, manualOrders, removedSpouseIds, removedChildIds, persistLayout]);

  const handleUnlinkChild = (childRelId: string) => {
    setRemovedChildIds((prev) => new Set(prev).add(childRelId));
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[childRelId];
      return next;
    });
    scrubChildFromManualOrders(childRelId);
  };

  const handleUnlinkSpouse = (spouseId: string) => {
    setRemovedSpouseIds((prev) => {
      const next = new Set(prev);
      next.add(spouseId);
      return next;
    });
    setAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((childRelId) => {
        if (next[childRelId] === spouseId) {
          next[childRelId] = null;
        }
      });
      return next;
    });
    setManualOrders((prev) => {
      const next = { ...prev };
      delete next[keyForGroup(spouseId)];
      return next;
    });
  };

  const availableSpouseOptions = activeSpouses.map((sp) => ({
    id: sp.rel.id,
    name: `${sp.person.firstName} ${sp.person.lastName}`,
  }));

  const renderChildRow = (child: { person: Person; rel: Relationship }) => {
    const assignment = assignments[child.rel.id] ?? null;
    const confidence = relConfidences[child.rel.id] || 'Unknown';
    return (
      <div
        key={child.rel.id}
        className={`p-4 bg-white rounded-2xl border flex flex-col gap-3 shadow-sm transition ${
          hoverGroup === keyForGroup(assignment) || hoverChild === child.rel.id ? 'border-blue-400 bg-blue-50/40' : 'border-slate-100'
        }`}
        onDragOver={(event) => handleChildDragOver(event, child.rel.id, assignment)}
        onDragLeave={(event) => handleChildDragLeave(event, child.rel.id, assignment)}
        onDrop={(event) => handleDropOnChild(event, child.rel.id, assignment)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              draggable
              onDragStart={(event) => beginDrag(event, child.rel.id, assignment)}
              onDragEnd={endDrag}
              className="p-1 text-slate-400 hover:text-slate-900 cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder child"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => onNavigate?.(child.person)}
                className="text-sm font-semibold text-slate-900 hover:text-blue-600 text-left"
              >
                {child.person.firstName} {child.person.lastName}
              </button>
              {child.person.birthDate && <p className="text-[10px] text-slate-400">Born {formatYear(child.person.birthDate)}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-2xl border bg-slate-50 text-slate-500">
            <span className="text-[10px] font-black uppercase tracking-widest">
              {assignment ? availableSpouseOptions.find((option) => option.id === assignment)?.name || 'Assigned' : 'Unassigned'}
            </span>
            <select
              value={confidence}
              onChange={(event) => onUpdateConfidence(child.rel.id, event.target.value as RelationshipConfidence)}
              className="bg-transparent border-none text-[9px] font-black uppercase tracking-widest outline-none cursor-pointer text-slate-500"
            >
              {CONFIDENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => handleUnlinkChild(child.rel.id)}
            className="p-2 rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 transition"
            aria-label="Unlink child from family"
          >
            <UnlinkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const unassignedChildren = getDisplayChildren(null);

  return (
    <div className="space-y-6">
      {activeSpouses.length === 0 && (
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Spousal Unions</p>
          <p className="text-xs text-slate-400 italic p-4">No partner records found.</p>
        </div>
      )}
      {activeSpouses.map((spouse) => {
        const metaBits: string[] = [];
        if (spouse.rel.date) metaBits.push(`Since ${formatYear(spouse.rel.date)}`);
        if (spouse.rel.status) metaBits.push(spouse.rel.status.replace(/_/g, ' '));
        const childrenForSpouse = getDisplayChildren(spouse.rel.id);
        const confidence = relConfidences[spouse.rel.id] || 'Unknown';
        return (
          <div key={spouse.rel.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <RelationCard
                item={spouse}
                label="Spousal Link"
                metadata={metaBits.join(' • ') || undefined}
                confidence={confidence}
                onConfidenceChange={onUpdateConfidence}
                onNavigate={onNavigate}
              />
              <button
                className="p-2 rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 transition"
                onClick={() => handleUnlinkSpouse(spouse.rel.id)}
                aria-label="Unlink spouse"
              >
                <UnlinkIcon className="w-4 h-4" />
              </button>
            </div>
            <div
              className={`ml-4 pl-4 space-y-3 transition border-l ${
                hoverGroup === spouse.rel.id ? 'border-blue-300 bg-blue-50/30 rounded-2xl' : 'border-slate-200'
              }`}
              onDragOver={(event) => handleDragOver(event, spouse.rel.id)}
              onDragLeave={(event) => handleDragLeave(event, spouse.rel.id)}
              onDrop={(event) => handleDropOnGroup(event, spouse.rel.id)}
            >
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Children of this union</p>
              {childrenForSpouse.length > 0 ? (
                <>
                  {childrenForSpouse.map((child) => renderChildRow(child))}
                  {dragContext && (
                    <div className="border border-dashed border-slate-200 rounded-xl text-[10px] text-slate-400 uppercase tracking-widest text-center py-2">
                      Drag here to place last
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">No children linked to this spouse.</p>
              )}
            </div>
          </div>
        );
      })}

      {unassignedChildren.length > 0 && (
        <div
          className={`space-y-3 transition border rounded-2xl ${
            hoverGroup === 'unassigned' ? 'border-blue-300 bg-blue-50/30' : 'border-transparent'
          }`}
          onDragOver={(event) => handleDragOver(event, null)}
          onDragLeave={(event) => handleDragLeave(event, null)}
          onDrop={(event) => handleDropOnGroup(event, null)}
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Unassigned Descendants</p>
          {unassignedChildren.map((child) => renderChildRow(child))}
          {dragContext && (
            <div className="border border-dashed border-slate-200 rounded-xl text-[10px] text-slate-400 uppercase tracking-widest text-center py-2 mx-3 mb-3">
              Drag here to place last
            </div>
          )}
        </div>
      )}
    </div>
  );
};
