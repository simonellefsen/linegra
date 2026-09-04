import type { Relationship } from '../types';
import type { PedigreeLayout, PedigreeNode } from './pedigreeLayout';

export const PEDIGREE_CARD_WIDTH = 180;
export const PEDIGREE_CARD_HEIGHT = 168;
export const PEDIGREE_GENERATION_HEIGHT = 304;
const PARTNER_GAP = 32;
const FAMILY_GAP = 88;
const PADDING = 48;

export interface FamilyCard extends PedigreeNode {
  sourceId: string;
  left: number;
  top: number;
  repeated: boolean;
}

export interface PedigreeFamily {
  id: string;
  parentCardIds: string[];
  childCardIds: string[];
  label: string;
  reference: boolean;
}

export interface FamilyPedigreeLayout {
  cards: FamilyCard[];
  families: PedigreeFamily[];
  width: number;
  height: number;
  focusCardId?: string;
}

interface FamilyTemplate {
  id: string;
  parents: string[];
  children: string[];
  label: string;
}

interface Branch {
  parents: string[];
  family?: FamilyTemplate;
  children: Array<{ personId: string; branches: Branch[] }>;
  width: number;
  reference: boolean;
}

const rowWidth = (count: number) => count * PEDIGREE_CARD_WIDTH + Math.max(0, count - 1) * PARTNER_GAP;
const branchesWidth = (branches: Branch[]) =>
  branches.reduce((total, branch) => total + branch.width, 0) + Math.max(0, branches.length - 1) * FAMILY_GAP;
const pairKey = (ids: string[]) => [...ids].sort().join('|');

/** Presentation occurrences are separate from person UUIDs. Repeating a multi-union parent is
 * intentional: each family owns a disjoint descendant interval instead of drawing through another
 * couple. A previously expanded family is a terminal reference, keeping pedigree collapse bounded.
 */
export function layoutPedigreeFamilies(layout: PedigreeLayout, relationships: Relationship[]): FamilyPedigreeLayout {
  const source = new Map(layout.nodes.map((node) => [node.id, node]));
  const focus = layout.focusNode;
  if (!focus) return { cards: [], families: [], width: 0, height: 0 };

  const parentsByChild = new Map<string, Set<string>>();
  for (const edge of layout.edges) {
    if (edge.type !== 'parent' || !source.has(edge.fromId) || !source.has(edge.toId)) continue;
    const parents = parentsByChild.get(edge.toId) ?? new Set<string>();
    parents.add(edge.fromId);
    parentsByChild.set(edge.toId, parents);
  }
  const marriages = new Set<string>();
  const partnerships = new Set<string>();
  for (const rel of relationships) {
    if (rel.type === 'marriage') marriages.add(pairKey([rel.personId, rel.relatedId]));
    if (rel.type === 'partner') partnerships.add(pairKey([rel.personId, rel.relatedId]));
  }
  const familyLabel = (parents: string[]) => {
    if (parents.some((id) => source.get(id)?.placeholder)) return 'Parents';
    if (parents.length === 1) return 'One recorded parent';
    if (marriages.has(pairKey(parents))) return 'Married';
    if (partnerships.has(pairKey(parents))) return 'Partners';
    return 'Co-parents';
  };
  const orderParents = (ids: string[]) => [...ids].sort((a, b) => {
    const rank = (id: string) => {
      const node = source.get(id)!;
      return node.placeholder === 'father' || node.person?.gender === 'M' ? 0
        : node.placeholder === 'mother' || node.person?.gender === 'F' ? 2 : 1;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const orderChildren = (ids: string[]) => [...ids].sort((a, b) => {
    const year = (id: string) => Number(source.get(id)?.person?.birthDate?.match(/\d{4}/)?.[0] ?? Infinity);
    return year(a) - year(b) || a.localeCompare(b);
  });

  const templates = new Map<string, FamilyTemplate>();
  const ensureFamily = (parentIds: string[]) => {
    const id = pairKey(parentIds);
    let family = templates.get(id);
    if (!family) {
      const parents = orderParents(parentIds);
      family = { id, parents, children: [], label: familyLabel(parents) };
      templates.set(id, family);
    }
    return family;
  };
  for (const [childId, parentIds] of parentsByChild) {
    const child = source.get(childId)!;
    const parents = [...parentIds].filter((id) => source.get(id)!.column >= 0);
    if (child.column > 0 && parents.length) ensureFamily(parents).children.push(childId);
  }
  for (const edge of layout.edges) {
    if (edge.type !== 'spouse') continue;
    const a = source.get(edge.fromId);
    const b = source.get(edge.toId);
    if (!a || !b || a.column < 0 || b.column < 0) continue;
    // The graph also includes inferred co-parent edges. Never present those as marriages.
    if (![...templates.values()].some((f) => f.parents.includes(a.id) && f.parents.includes(b.id))) {
      ensureFamily([a.id, b.id]);
    }
  }
  const familiesByParent = new Map<string, FamilyTemplate[]>();
  for (const family of templates.values()) {
    family.children = orderChildren(family.children);
    for (const id of family.parents) {
      const list = familiesByParent.get(id) ?? [];
      list.push(family);
      familiesByParent.set(id, list);
    }
  }
  for (const list of familiesByParent.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const expanded = new Set<string>();
  const plannedPeople = new Set<string>();
  const planPerson = (personId: string): Branch[] => {
    plannedPeople.add(personId);
    const units = familiesByParent.get(personId) ?? [];
    if (!units.length) return [{ parents: [personId], children: [], width: PEDIGREE_CARD_WIDTH, reference: false }];
    return units.map((family): Branch => {
      family.parents.forEach((id) => plannedPeople.add(id));
      const reference = expanded.has(family.id);
      expanded.add(family.id);
      const children = reference ? [] : family.children.map((id) => ({ personId: id, branches: planPerson(id) }));
      const childWidth = children.reduce((sum, child) => sum + branchesWidth(child.branches), 0)
        + Math.max(0, children.length - 1) * FAMILY_GAP;
      return { parents: family.parents, family, children, width: Math.max(rowWidth(family.parents.length), childWidth), reference };
    });
  };
  const roots = planPerson(focus.id);
  // Preserve scoped relatives even when malformed or collapsed graph edges make them unreachable.
  for (const node of [...layout.nodes].sort((a, b) => a.column - b.column || a.id.localeCompare(b.id))) {
    if (node.column >= 0 && !plannedPeople.has(node.id)) roots.push(...planPerson(node.id));
  }

  const cards: FamilyCard[] = [];
  const families: PedigreeFamily[] = [];
  let serial = 0;
  const addCard = (sourceId: string, center: number): FamilyCard => {
    const node = source.get(sourceId)!;
    const card = { ...node, id: `card-${serial++}`, sourceId, left: center - PEDIGREE_CARD_WIDTH / 2,
      top: (node.column - layout.minColumn) * PEDIGREE_GENERATION_HEIGHT + PADDING, repeated: false };
    cards.push(card);
    return card;
  };
  const placeBranches = (branches: Branch[], left: number, targetId: string): string[] => {
    const targets: string[] = [];
    for (const branch of branches) {
      const center = left + branch.width / 2;
      const parentLeft = center - rowWidth(branch.parents.length) / 2;
      const parentCards = branch.parents.map((id, index) => addCard(id,
        parentLeft + index * (PEDIGREE_CARD_WIDTH + PARTNER_GAP) + PEDIGREE_CARD_WIDTH / 2));
      targets.push(...parentCards.filter((card) => card.sourceId === targetId).map((card) => card.id));
      const childWidth = branch.children.reduce((sum, child) => sum + branchesWidth(child.branches), 0)
        + Math.max(0, branch.children.length - 1) * FAMILY_GAP;
      let childLeft = center - childWidth / 2;
      const childCardIds: string[] = [];
      for (const child of branch.children) {
        childCardIds.push(...placeBranches(child.branches, childLeft, child.personId));
        childLeft += branchesWidth(child.branches) + FAMILY_GAP;
      }
      if (branch.family) families.push({ id: `family-${serial++}`, parentCardIds: parentCards.map((card) => card.id),
        childCardIds, label: branch.family.label, reference: branch.reference });
      left += branch.width + FAMILY_GAP;
    }
    return targets;
  };
  const [focusCardId] = placeBranches(roots, 0, focus.id);
  const focusCard = cards.find((card) => card.id === focusCardId)!;

  interface AncestorBranch { id: string; parents: AncestorBranch[]; width: number }
  const expandedAncestors = new Set<string>();
  const planAncestors = (id: string): AncestorBranch => {
    const node = source.get(id)!;
    const seen = expandedAncestors.has(id);
    expandedAncestors.add(id);
    const parents = seen ? [] : orderParents([...(parentsByChild.get(id) ?? [])]
      .filter((parentId) => source.get(parentId)!.column < node.column)).map(planAncestors);
    const width = Math.max(PEDIGREE_CARD_WIDTH, parents.reduce((sum, p) => sum + p.width, 0)
      + Math.max(0, parents.length - 1) * FAMILY_GAP);
    return { id, parents, width };
  };
  const placeAncestors = (branch: AncestorBranch, childCard: FamilyCard) => {
    if (!branch.parents.length) return;
    let cursor = childCard.left + PEDIGREE_CARD_WIDTH / 2 - branch.width / 2;
    const parentCards = branch.parents.map((parent) => {
      const card = addCard(parent.id, cursor + parent.width / 2);
      cursor += parent.width + FAMILY_GAP;
      placeAncestors(parent, card);
      return card;
    });
    families.push({ id: `family-${serial++}`, parentCardIds: parentCards.map((card) => card.id),
      childCardIds: [childCard.id], label: familyLabel(branch.parents.map((p) => p.id)), reference: false });
  };
  placeAncestors(planAncestors(focus.id), focusCard);

  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.sourceId, (counts.get(card.sourceId) ?? 0) + 1);
  const offset = PADDING - Math.min(...cards.map((card) => card.left));
  for (const card of cards) {
    card.left += offset;
    card.repeated = !card.placeholder && counts.get(card.sourceId)! > 1;
  }
  return { cards, families, focusCardId,
    width: Math.max(...cards.map((card) => card.left)) + PEDIGREE_CARD_WIDTH + PADDING,
    height: Math.max(...cards.map((card) => card.top)) + PEDIGREE_CARD_HEIGHT + 100 };
}
