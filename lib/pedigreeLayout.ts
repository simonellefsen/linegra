import { Person, Relationship } from '../types';
import {
  indexParentChildLinks,
  parentLinkReadsAsFather,
  parentLinkReadsAsMother,
} from './parentChildLinks';

export type PedigreeDirection = 'focus' | 'ancestor' | 'descendant';

export type PedigreePlaceholder = 'father' | 'mother' | 'unknown';

export interface PedigreeNode {
  id: string;
  person?: Person;
  column: number;
  row: number;
  direction: PedigreeDirection;
  placeholder?: PedigreePlaceholder;
  relatedPersonId?: string;
}

export interface PedigreeEdge {
  id: string;
  fromId: string;
  toId: string;
  type: 'parent' | 'spouse';
}

export interface PedigreeLayout {
  nodes: PedigreeNode[];
  edges: PedigreeEdge[];
  minColumn: number;
  maxColumn: number;
  minRow: number;
  maxRow: number;
  focusNode?: PedigreeNode;
  childHints: Record<string, boolean>;
  descendantHints: Record<string, boolean>;
  siblingHints: Record<string, boolean>;
}

export interface BuildPedigreeOptions {
  focusId?: string;
  maxAncestorDepth?: number;
  maxDescendantDepth?: number;
  allowPlaceholders?: boolean;
}

const isFatherLink = (link: Relationship, parent?: Person | null) => parentLinkReadsAsFather(link, parent);
const isMotherLink = (link: Relationship, parent?: Person | null) => parentLinkReadsAsMother(link, parent);
const SPOUSE_TYPES = new Set<Relationship['type']>(['marriage', 'partner']);

const partnerRowOffset = (partner: Person, focus: Person, index: number): number => {
  if (partner.gender === 'M') return -1 - index;
  if (partner.gender === 'F') return 1 + index;
  if (focus.gender === 'M') return 1 + index;
  if (focus.gender === 'F') return -1 - index;
  return index % 2 === 0 ? -1 - index : 1 + index;
};

const areSpouses = (relationships: Relationship[], aId: string, bId: string): boolean =>
  relationships.some(
    (rel) =>
      SPOUSE_TYPES.has(rel.type) &&
      ((rel.personId === aId && rel.relatedId === bId) || (rel.personId === bId && rel.relatedId === aId))
  );

const birthYearForPerson = (person?: Person): number => {
  if (!person?.birthDate) return Number.POSITIVE_INFINITY;
  const match = person.birthDate.match(/(\d{4})/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
};

const sortChildIdsByAge = (childIds: string[], peopleById: Map<string, Person>): string[] =>
  [...childIds].sort((a, b) => {
    const personA = peopleById.get(a);
    const personB = peopleById.get(b);
    const yearA = birthYearForPerson(personA);
    const yearB = birthYearForPerson(personB);
    if (yearA !== yearB) return yearA - yearB;
    const nameA = `${personA?.lastName ?? ''}${personA?.firstName ?? ''}`;
    const nameB = `${personB?.lastName ?? ''}${personB?.firstName ?? ''}`;
    return nameA.localeCompare(nameB);
  });

export const buildPedigreeLayout = (
  people: Person[],
  relationships: Relationship[],
  options: BuildPedigreeOptions = {}
): PedigreeLayout => {
  const { focusId, maxAncestorDepth = 4, maxDescendantDepth = 3, allowPlaceholders = true } = options;
  if (!people.length) {
    return {
      nodes: [],
      edges: [],
      minColumn: 0,
      maxColumn: 0,
      minRow: 0,
      maxRow: 0,
      childHints: {},
      descendantHints: {},
      siblingHints: {},
    };
  }

  const peopleById = new Map<string, Person>(people.map((p) => [p.id, p]));
  const { parentLinksByChild, childLinksByParent } = indexParentChildLinks(relationships);

  const nodes: PedigreeNode[] = [];
  const edges: PedigreeEdge[] = [];
  const nodeMap = new Map<string, PedigreeNode>();
  const nextRowByColumn = new Map<number, number>();

  let minColumn = 0;
  let maxColumn = 0;
  let minRow = 0;
  let maxRow = 0;
  let placeholderCounter = 0;
  const ancestorVisited = new Set<string>();
  const descendantVisited = new Set<string>();
  const descendantSpanCache = new Map<string, number>();
  const ancestorSpanCache = new Map<string, number>();
  const edgeIds = new Set<string>();

  const assignRow = (column: number) => {
    const nextRow = nextRowByColumn.get(column) ?? 0;
    nextRowByColumn.set(column, nextRow + 1);
    minRow = Math.min(minRow, nextRow);
    maxRow = Math.max(maxRow, nextRow);
    return nextRow;
  };

  const createPersonNode = (
    person: Person,
    column: number,
    direction: PedigreeDirection,
    relatedPersonId?: string,
    desiredRow?: number
  ): PedigreeNode => {
    const existing = nodeMap.get(person.id);
    if (existing) return existing;
    const row = typeof desiredRow === 'number' ? desiredRow : assignRow(column);
    minColumn = Math.min(minColumn, column);
    maxColumn = Math.max(maxColumn, column);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    const node: PedigreeNode = {
      id: person.id,
      person,
      column,
      row,
      direction,
      relatedPersonId,
    };
    nodes.push(node);
    nodeMap.set(person.id, node);
    return node;
  };

  const createPlaceholder = (
    column: number,
    direction: PedigreeDirection,
    placeholder: PedigreePlaceholder,
    relatedPersonId?: string,
    desiredRow?: number
  ): PedigreeNode => {
    const row = typeof desiredRow === 'number' ? desiredRow : assignRow(column);
    minColumn = Math.min(minColumn, column);
    maxColumn = Math.max(maxColumn, column);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    const node: PedigreeNode = {
      id: `placeholder-${placeholder}-${placeholderCounter++}`,
      column,
      row,
      direction,
      placeholder,
      relatedPersonId,
    };
    nodes.push(node);
    return node;
  };

  const focusPerson = focusId ? peopleById.get(focusId) : people[0];
  if (!focusPerson) {
    return {
      nodes: [],
      edges: [],
      minColumn: 0,
      maxColumn: 0,
      minRow: 0,
      maxRow: 0,
      childHints: {},
      descendantHints: {},
      siblingHints: {},
    };
  }
  const layoutChildHints: Record<string, boolean> = {};
  const layoutDescendantHints: Record<string, boolean> = {};
  const focusNode = createPersonNode(focusPerson, 0, 'focus');

  const addParentEdge = (parentNode: PedigreeNode, childNode: PedigreeNode) => {
    const edgeId = `parent:${parentNode.id}->${childNode.id}`;
    if (edgeIds.has(edgeId)) return;
    edgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      fromId: parentNode.id,
      toId: childNode.id,
      type: 'parent',
    });
  };

  const addSpouseEdge = (leftId: string, rightId: string) => {
    const edgeId = `spouse:${leftId}<->${rightId}`;
    if (edgeIds.has(edgeId)) return;
    edgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      fromId: leftId,
      toId: rightId,
      type: 'spouse',
    });
  };

  const getSpouseIds = (personId: string): string[] => {
    const ids = new Set<string>();
    relationships.forEach((rel) => {
      if (!SPOUSE_TYPES.has(rel.type)) return;
      if (rel.personId === personId) ids.add(rel.relatedId);
      if (rel.relatedId === personId) ids.add(rel.personId);
    });
    return Array.from(ids);
  };

  const getCoparentIds = (personId: string): string[] => {
    const ids = new Set<string>();
    const childLinks = childLinksByParent.get(personId) || [];
    childLinks.forEach((link) => {
      (parentLinksByChild.get(link.relatedId) || []).forEach((parentLink) => {
        if (parentLink.personId !== personId) ids.add(parentLink.personId);
      });
    });
    return Array.from(ids);
  };

  const placePersonPartners = (personId: string) => {
    const personNode = nodeMap.get(personId);
    const person = peopleById.get(personId);
    if (!personNode || !person) return;

    const partnerIds = new Set<string>([...getSpouseIds(personId), ...getCoparentIds(personId)]);
    partnerIds.delete(personId);

    const partners = Array.from(partnerIds)
      .map((id) => peopleById.get(id))
      .filter((candidate): candidate is Person => !!candidate)
      .sort((a, b) => {
        if (a.gender === 'M' && b.gender !== 'M') return -1;
        if (a.gender === 'F' && b.gender !== 'F') return 1;
        return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
      });

    let partnerIndex = 0;
    nodeMap.forEach((node) => {
      if (node.id !== personId && node.column === personNode.column && partnerIds.has(node.id)) {
        partnerIndex++;
      }
    });

    partners.forEach((partner) => {
      if (nodeMap.has(partner.id)) {
        addSpouseEdge(personId, partner.id);
        return;
      }
      const row = personNode.row + partnerRowOffset(partner, person, partnerIndex);
      partnerIndex++;
      createPersonNode(partner, personNode.column, personNode.direction, personId, row);
      addSpouseEdge(personId, partner.id);
    });
  };

  const placeGenerationPartners = () => {
    placePersonPartners(focusPerson.id);
  };

  const ensureCoparentNodesForChild = (childId: string, primaryParentId: string): PedigreeNode[] => {
    const primaryParentNode = nodeMap.get(primaryParentId);
    const primaryParent = peopleById.get(primaryParentId);
    const partnerColumn = primaryParentNode?.column ?? 0;
    const partnerBaseRow = primaryParentNode?.row ?? focusNode.row;
    const placed: PedigreeNode[] = [];
    (parentLinksByChild.get(childId) || []).forEach((link) => {
      if (link.personId === primaryParentId) return;
      const coparent = peopleById.get(link.personId);
      if (!coparent) return;
      let coparentNode = nodeMap.get(coparent.id);
      if (!coparentNode) {
        if (primaryParent && areSpouses(relationships, primaryParentId, coparent.id)) {
          placePersonPartners(primaryParentId);
          coparentNode = nodeMap.get(coparent.id);
        } else {
          const isFather = isFatherLink(link, coparent);
          const isMother = isMotherLink(link, coparent);
          let row: number;
          if (isFather) row = partnerBaseRow - 1;
          else if (isMother) row = partnerBaseRow + 1;
          else row = partnerBaseRow + (coparent.id < primaryParentId ? -1 : 1);
          const direction = partnerColumn === 0 ? 'focus' : 'descendant';
          coparentNode = createPersonNode(coparent, partnerColumn, direction, childId, row);
        }
      }
      if (coparentNode) {
        if (primaryParent && areSpouses(relationships, primaryParentId, coparent.id)) {
          addSpouseEdge(primaryParentId, coparent.id);
        }
        placed.push(coparentNode);
      }
    });
    return placed;
  };

  const attachCoparentEdges = (childId: string, childNode: PedigreeNode, primaryParentId: string) => {
    ensureCoparentNodesForChild(childId, primaryParentId).forEach((coparentNode) => {
      addParentEdge(coparentNode, childNode);
    });
  };

  const getCoparentIdForChild = (childId: string, primaryParentId: string): string | null => {
    const coparentLink = (parentLinksByChild.get(childId) || []).find(
      (link) => link.personId !== primaryParentId
    );
    return coparentLink?.personId ?? null;
  };

  const groupChildrenByCoparent = (
    childIds: string[],
    primaryParentId: string
  ): Array<{ coparentId: string | null; childIds: string[] }> => {
    const byCoparent = new Map<string | null, string[]>();
    childIds.forEach((childId) => {
      const coparentId = getCoparentIdForChild(childId, primaryParentId);
      const list = byCoparent.get(coparentId) || [];
      list.push(childId);
      byCoparent.set(coparentId, list);
    });
    return Array.from(byCoparent.entries()).map(([coparentId, ids]) => ({
      coparentId,
      childIds: sortChildIdsByAge(ids, peopleById),
    }));
  };

  const computeAncestorSpan = (personId: string, depth: number, stack: Set<string> = new Set()): number => {
    const cacheKey = `${personId}:${depth}`;
    if (ancestorSpanCache.has(cacheKey)) return ancestorSpanCache.get(cacheKey)!;
    if (depth >= maxAncestorDepth) {
      ancestorSpanCache.set(cacheKey, 1);
      return 1;
    }
    if (stack.has(cacheKey)) {
      return 1;
    }
    stack.add(cacheKey);
    const parentLinks = parentLinksByChild.get(personId) || [];
    const seen = new Set<string>();
    let total = 0;
    parentLinks.forEach((link) => {
      if (seen.has(link.personId)) return;
      seen.add(link.personId);
      const parent = peopleById.get(link.personId);
      if (!parent) {
        total += 1;
        return;
      }
      total += computeAncestorSpan(parent.id, depth + 1, stack);
    });
    if (!total) total = parentLinks.length || 1;
    ancestorSpanCache.set(cacheKey, total);
    stack.delete(cacheKey);
    return total;
  };

  const buildAncestors = (childId: string, column: number, depth: number) => {
    if (depth >= maxAncestorDepth) return;
    const parentLinks = parentLinksByChild.get(childId) || [];
    const childNode = nodeMap.get(childId);
    const childRow = childNode?.row ?? 0;
    const parentEntries: Array<{
      person?: Person;
      placeholder?: PedigreePlaceholder;
      span: number;
      link?: Relationship;
      isFather?: boolean;
      isMother?: boolean;
    }> = [];
    const seenParents = new Set<string>();
    parentLinks.forEach((link) => {
      if (seenParents.has(link.personId)) return;
      seenParents.add(link.personId);
      const parent = peopleById.get(link.personId);
      if (!parent) return;
      parentEntries.push({
        person: parent,
        span: Math.max(1, computeAncestorSpan(parent.id, depth + 1)),
        link,
        isFather: isFatherLink(link, parent),
        isMother: isMotherLink(link, parent),
      });
    });

    const hasFather = parentEntries.some((entry) => entry.isFather);
    const hasMother = parentEntries.some((entry) => entry.isMother);

    if (allowPlaceholders) {
      if (!hasFather) {
        parentEntries.push({
          placeholder: 'father',
          span: 1,
          isFather: true,
        });
      }
      if (!hasMother) {
        parentEntries.push({
          placeholder: 'mother',
          span: 1,
          isMother: true,
        });
      }
    }

    parentEntries.sort((a, b) => {
      if (a.isFather && !b.isFather) return -1;
      if (!a.isFather && b.isFather) return 1;
      if (a.isMother && !b.isMother) return 1;
      if (!a.isMother && b.isMother) return -1;
      if (a.person && b.person) return a.person.firstName.localeCompare(b.person.firstName);
      return 0;
    });

    const totalSpan =
      parentEntries.reduce((sum, entry) => sum + (entry.span || 1), 0) || parentEntries.length;
    let cursor = childRow - totalSpan / 2;

    parentEntries.forEach((entry) => {
      const span = entry.span || 1;
      const targetRow = cursor + span / 2;
      cursor += span;
      if (entry.person) {
        const parentNode = createPersonNode(entry.person, column, 'ancestor', childId, targetRow);
        addParentEdge(parentNode, nodeMap.get(childId)!);
        if (!ancestorVisited.has(entry.person.id)) {
          ancestorVisited.add(entry.person.id);
          buildAncestors(entry.person.id, column - 1, depth + 1);
        }
      } else if (allowPlaceholders && entry.placeholder) {
        const placeholderNode = createPlaceholder(
          column,
          'ancestor',
          entry.placeholder,
          childId,
          targetRow
        );
        addParentEdge(placeholderNode, nodeMap.get(childId)!);
      }
    });
  };

  const computeDescendantSpan = (personId: string, depth: number, stack: Set<string> = new Set()): number => {
    const cacheKey = `${personId}:${depth}`;
    if (descendantSpanCache.has(cacheKey)) return descendantSpanCache.get(cacheKey)!;
    if (depth >= maxDescendantDepth) {
      descendantSpanCache.set(cacheKey, 1);
      return 1;
    }
    if (stack.has(cacheKey)) {
      return 1;
    }
    stack.add(cacheKey);
    const childLinks = childLinksByParent.get(personId) || [];
    const uniqueChildIds = Array.from(new Set(childLinks.map((link) => link.relatedId))).filter(
      (childId) => !areSpouses(relationships, personId, childId)
    );
    if (!uniqueChildIds.length) {
      descendantSpanCache.set(cacheKey, 1);
      stack.delete(cacheKey);
      return 1;
    }
    let total = 0;
    uniqueChildIds.forEach((childId) => {
      const child = peopleById.get(childId);
      if (!child) {
        total += 1;
        return;
      }
      if (areSpouses(relationships, personId, childId)) return;
      total += computeDescendantSpan(childId, depth + 1, stack);
    });
    if (total === 0) total = uniqueChildIds.length;
    descendantSpanCache.set(cacheKey, total);
    stack.delete(cacheKey);
    return total;
  };

  const buildDescendants = (parentId: string, column: number, depth: number) => {
    if (depth >= maxDescendantDepth) return;
    const childLinks = childLinksByParent.get(parentId) || [];
    const uniqueChildIds = Array.from(new Set(childLinks.map((link) => link.relatedId))).filter(
      (childId) => !areSpouses(relationships, parentId, childId)
    );
    if (!uniqueChildIds.length) return;
    const parentNode = nodeMap.get(parentId);
    if (!parentNode) return;

    const sortedChildIds = sortChildIdsByAge(uniqueChildIds, peopleById);
    sortedChildIds.forEach((childId) => {
      const childDescendantLinks = (childLinksByParent.get(childId) || []).filter(
        (link) => !areSpouses(relationships, childId, link.relatedId)
      );
      if (!childDescendantLinks.length) return;
      layoutChildHints[childId] = true;
      if (depth + 1 >= maxDescendantDepth) {
        layoutDescendantHints[childId] = true;
      }
    });

    placePersonPartners(parentId);

    const groups = groupChildrenByCoparent(sortedChildIds, parentId);
    groups.sort((a, b) => {
      const rowForCoparent = (coparentId: string | null) => {
        if (!coparentId) return parentNode.row;
        return nodeMap.get(coparentId)?.row ?? parentNode.row;
      };
      return rowForCoparent(a.coparentId) - rowForCoparent(b.coparentId);
    });

    groups.forEach((group) => {
      const coparentNode = group.coparentId ? nodeMap.get(group.coparentId) : null;
      const groupCenterRow = coparentNode
        ? (parentNode.row + coparentNode.row) / 2
        : parentNode.row;

      const spans = group.childIds.map((childId) => {
        const child = peopleById.get(childId);
        if (!child) return 1;
        return computeDescendantSpan(childId, depth + 1);
      });
      const totalSpan = spans.reduce((sum, span) => sum + span, 0) || group.childIds.length;
      let cursor = groupCenterRow - totalSpan / 2;

      group.childIds.forEach((childId, index) => {
        const span = spans[index] || 1;
        const child = peopleById.get(childId);
        const childRowCenter = cursor + span / 2;
        cursor += span;
        if (!child || areSpouses(relationships, parentId, childId)) return;
        const childNode = createPersonNode(child, column, 'descendant', parentId, childRowCenter);
        addParentEdge(parentNode, childNode);
        attachCoparentEdges(childId, childNode, parentId);
        if (!descendantVisited.has(child.id)) {
          descendantVisited.add(child.id);
          buildDescendants(child.id, column + 1, depth + 1);
        }
      });
    });
  };

  ancestorVisited.add(focusPerson.id);
  descendantVisited.add(focusPerson.id);

  placeGenerationPartners();
  buildAncestors(focusPerson.id, -1, 0);
  buildDescendants(focusPerson.id, 1, 0);

  const layoutSiblingHints: Record<string, boolean> = {};
  nodes.forEach((node) => {
    if (!node.person) return;
    (parentLinksByChild.get(node.person.id) || []).forEach((parentLink) => {
      const parentId = parentLink.personId;
      const siblings = (childLinksByParent.get(parentId) || []).filter(
        (link) => !areSpouses(relationships, parentId, link.relatedId)
      );
      if (siblings.length <= 1) return;
      if (
        siblings.some(
          (link) => link.relatedId !== node.person!.id && !nodeMap.has(link.relatedId)
        )
      ) {
        layoutSiblingHints[node.person!.id] = true;
      }
    });
  });

  return {
    nodes,
    edges,
    minColumn,
    maxColumn,
    minRow,
    maxRow,
    focusNode,
    childHints: layoutChildHints,
    descendantHints: layoutDescendantHints,
    siblingHints: layoutSiblingHints,
  };
};
