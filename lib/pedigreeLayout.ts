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
    return { nodes: [], edges: [], minColumn: 0, maxColumn: 0, maxRow: 0 };
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
  const columnRows = new Map<number, number>();

  let minColumn = 0;
  let maxColumn = 0;
  let maxRow = 0;
  let placeholderCounter = 0;

  const assignRow = (column: number) => {
    const nextRow = columnRows.get(column) ?? 0;
    columnRows.set(column, nextRow + 1);
    if (nextRow > maxRow) maxRow = nextRow;
    return nextRow;
  };

  const createPersonNode = (
    person: Person,
    column: number,
    direction: PedigreeDirection,
    relatedPersonId?: string
  ): PedigreeNode => {
    const existing = nodeMap.get(person.id);
    if (existing) return existing;
    const row = assignRow(column);
    minColumn = Math.min(minColumn, column);
    maxColumn = Math.max(maxColumn, column);
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
    relatedPersonId?: string
  ): PedigreeNode => {
    const row = assignRow(column);
    minColumn = Math.min(minColumn, column);
    maxColumn = Math.max(maxColumn, column);
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
    return { nodes: [], edges: [], minColumn: 0, maxColumn: 0, maxRow: 0 };
  }
  const focusNode = createPersonNode(focusPerson, 0, 'focus');

  const addParentEdge = (parentNode: PedigreeNode, childNode: PedigreeNode) => {
    edges.push({
      id: `${parentNode.id}->${childNode.id}`,
      fromId: parentNode.id,
      toId: childNode.id,
      type: 'parent',
    });
  };

  const buildAncestors = (childId: string, column: number, depth: number) => {
    if (depth >= maxAncestorDepth) return;
    const parentLinks = parentLinksByChild.get(childId) || [];
    let hasFather = false;
    let hasMother = false;
    parentLinks.forEach((link) => {
      const parent = peopleById.get(link.personId);
      if (!parent) return;
      const parentNode = createPersonNode(parent, column, 'ancestor', childId);
      addParentEdge(parentNode, nodeMap.get(childId)!);
      if (isFatherLink(link.type)) hasFather = true;
      if (isMotherLink(link.type)) hasMother = true;
      buildAncestors(parent.id, column - 1, depth + 1);
    });

    const targetNode = nodeMap.get(childId)!;
    if (!hasFather && allowPlaceholders) {
      const placeholder = createPlaceholder(column, 'ancestor', 'father', childId);
      addParentEdge(placeholder, targetNode);
    }
    if (!hasMother && allowPlaceholders) {
      const placeholder = createPlaceholder(column, 'ancestor', 'mother', childId);
      addParentEdge(placeholder, targetNode);
    }
  };

  const buildDescendants = (parentId: string, column: number, depth: number) => {
    if (depth >= maxDescendantDepth) return;
    const childLinks = childLinksByParent.get(parentId) || [];
    childLinks.forEach((link) => {
      const child = peopleById.get(link.relatedId);
      if (!child) return;
      const childNode = createPersonNode(child, column, 'descendant', parentId);
      addParentEdge(nodeMap.get(parentId)!, childNode);
      buildDescendants(child.id, column + 1, depth + 1);
    });
  };

  buildAncestors(focusPerson.id, -1, 0);
  buildDescendants(focusPerson.id, 1, 0);

  return {
    nodes,
    edges,
    minColumn,
    maxColumn,
    maxRow,
    focusNode,
  };
};
