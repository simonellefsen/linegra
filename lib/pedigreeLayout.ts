import { Person, Relationship, RelationshipType } from '../types';

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
  type: 'parent';
}

export interface PedigreeLayout {
  nodes: PedigreeNode[];
  edges: PedigreeEdge[];
  minColumn: number;
  maxColumn: number;
  minRow: number;
  maxRow: number;
  focusNode?: PedigreeNode;
}

export interface BuildPedigreeOptions {
  focusId?: string;
  maxAncestorDepth?: number;
  maxDescendantDepth?: number;
  allowPlaceholders?: boolean;
}

const FATHER_TYPES: RelationshipType[] = ['bio_father', 'adoptive_father'];
const MOTHER_TYPES: RelationshipType[] = ['bio_mother', 'adoptive_mother'];
const PARENT_TYPES = new Set<RelationshipType>([
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'step_parent',
  'guardian',
]);

const isFatherLink = (type: RelationshipType) => FATHER_TYPES.includes(type);
const isMotherLink = (type: RelationshipType) => MOTHER_TYPES.includes(type);

export const buildPedigreeLayout = (
  people: Person[],
  relationships: Relationship[],
  options: BuildPedigreeOptions = {}
): PedigreeLayout => {
  const { focusId, maxAncestorDepth = 4, maxDescendantDepth = 3, allowPlaceholders = true } = options;
  if (!people.length) {
    return { nodes: [], edges: [], minColumn: 0, maxColumn: 0, minRow: 0, maxRow: 0 };
  }

  const peopleById = new Map<string, Person>(people.map((p) => [p.id, p]));

  const parentLinksByChild = new Map<string, Relationship[]>();
  const childLinksByParent = new Map<string, Relationship[]>();

  relationships.forEach((rel) => {
    if (PARENT_TYPES.has(rel.type)) {
      parentLinksByChild.set(rel.relatedId, [...(parentLinksByChild.get(rel.relatedId) || []), rel]);
      childLinksByParent.set(rel.personId, [...(childLinksByParent.get(rel.personId) || []), rel]);
    }
  });

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
    return { nodes: [], edges: [], minColumn: 0, maxColumn: 0, minRow: 0, maxRow: 0 };
  }
  const focusNode = createPersonNode(focusPerson, 0, 'focus');

  const addParentEdge = (parentNode: PedigreeNode, childNode: PedigreeNode) => {
    const edgeId = `${parentNode.id}->${childNode.id}`;
    if (edgeIds.has(edgeId)) return;
    edgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      fromId: parentNode.id,
      toId: childNode.id,
      type: 'parent',
    });
  };

  const ancestorRowDelta = (depth: number) => Math.pow(2, depth + 1);

  const buildAncestors = (childId: string, column: number, depth: number) => {
    if (depth >= maxAncestorDepth) return;
    const parentLinks = parentLinksByChild.get(childId) || [];
    let hasFather = false;
    let hasMother = false;
    const childNode = nodeMap.get(childId);
    const childRow = childNode?.row ?? 0;
    const delta = ancestorRowDelta(depth);
    const fatherRow = childRow - delta;
    const motherRow = childRow + delta;
    parentLinks.forEach((link) => {
      const parent = peopleById.get(link.personId);
      if (!parent) return;
      const targetRow = isFatherLink(link.type) ? fatherRow : isMotherLink(link.type) ? motherRow : undefined;
      const parentNode = createPersonNode(parent, column, 'ancestor', childId, targetRow);
      addParentEdge(parentNode, nodeMap.get(childId)!);
      if (isFatherLink(link.type)) hasFather = true;
      if (isMotherLink(link.type)) hasMother = true;
      if (!ancestorVisited.has(parent.id)) {
        ancestorVisited.add(parent.id);
        buildAncestors(parent.id, column - 1, depth + 1);
      }
    });

    const targetNode = nodeMap.get(childId)!;
    if (!hasFather && allowPlaceholders) {
      const placeholder = createPlaceholder(column, 'ancestor', 'father', childId, fatherRow);
      addParentEdge(placeholder, targetNode);
    }
    if (!hasMother && allowPlaceholders) {
      const placeholder = createPlaceholder(column, 'ancestor', 'mother', childId, motherRow);
      addParentEdge(placeholder, targetNode);
    }
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
    const uniqueChildIds = Array.from(new Set(childLinks.map((link) => link.relatedId)));
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
    const uniqueChildIds = Array.from(new Set(childLinks.map((link) => link.relatedId)));
    if (!uniqueChildIds.length) return;
    const parentNode = nodeMap.get(parentId);
    if (!parentNode) return;
    const spans = uniqueChildIds.map((childId) => {
      const child = peopleById.get(childId);
      if (!child) return 1;
      return computeDescendantSpan(childId, depth + 1);
    });
    const totalSpan = spans.reduce((sum, span) => sum + span, 0) || uniqueChildIds.length;
    let cursor = parentNode.row - totalSpan / 2;
    uniqueChildIds.forEach((childId, index) => {
      const span = spans[index] || 1;
      const child = peopleById.get(childId);
      const childRowCenter = cursor + span / 2;
      cursor += span;
      if (!child) return;
      const childNode = createPersonNode(child, column, 'descendant', parentId, childRowCenter);
      addParentEdge(parentNode, childNode);
      if (!descendantVisited.has(child.id)) {
        descendantVisited.add(child.id);
        buildDescendants(child.id, column + 1, depth + 1);
      }
    });
  };

  ancestorVisited.add(focusPerson.id);
  descendantVisited.add(focusPerson.id);

  buildAncestors(focusPerson.id, -1, 0);
  buildDescendants(focusPerson.id, 1, 0);

  return {
    nodes,
    edges,
    minColumn,
    maxColumn,
    minRow,
    maxRow,
    focusNode,
  };
};
