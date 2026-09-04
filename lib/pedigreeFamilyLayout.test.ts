import { describe, expect, it } from 'vitest';
import type { Person, Relationship } from '../types';
import { buildPedigreeLayout } from './pedigreeLayout';
import { layoutPedigreeFamilies, PEDIGREE_CARD_WIDTH, type FamilyPedigreeLayout } from './pedigreeFamilyLayout';

const person = (id: string, gender: Person['gender'] = 'O', birthDate?: string): Person => ({
  id, firstName: id, lastName: '', gender, birthDate, treeId: 'tree', updatedAt: '',
});
const parent = (from: string, to: string): Relationship => ({
  id: `${from}-${to}`, personId: from, relatedId: to, type: 'child', treeId: 'tree',
});
const marriage = (from: string, to: string): Relationship => ({ ...parent(from, to), type: 'marriage' });
const family = (a: string, b: string, children: string[]) => [marriage(a, b), ...children.flatMap((id) => [parent(a, id), parent(b, id)])];
const render = (people: Person[], rels: Relationship[], focusId: string, maxAncestors = 0, placeholders = false) =>
  layoutPedigreeFamilies(buildPedigreeLayout(people, rels, {
    focusId, maxAncestorDepth: maxAncestors, maxDescendantDepth: 4, allowPlaceholders: placeholders,
  }), rels);
const sourceIds = (view: FamilyPedigreeLayout, ids: string[]) => ids.map((id) => view.cards.find((card) => card.id === id)!.sourceId);
const findFamily = (view: FamilyPedigreeLayout, ids: string[]) => view.families.find((unit) =>
  [...sourceIds(view, unit.parentCardIds)].sort().join('|') === [...ids].sort().join('|'))!;
const expectNoOverlaps = (view: FamilyPedigreeLayout) => {
  for (const a of view.cards) for (const b of view.cards) {
    if (a.id === b.id || a.column !== b.column) continue;
    expect(Math.abs(a.left - b.left)).toBeGreaterThanOrEqual(PEDIGREE_CARD_WIDTH);
  }
};

describe('family-aware pedigree geometry', () => {
  it('keeps Fredin, Brodden and Bystrom couples together and their descendants separate', () => {
    const ids = ['Helena', 'Ake', 'Agda', 'Peter Johan', 'Olga', 'Karl Hugo', 'Stig', 'Tilly',
      'Carl Brodden', 'Kerstin', 'Harry', 'Harriet', 'Anna', 'Eva', 'Ylva', 'Anette', 'Jan', 'Ann-Cristin', 'Peter', 'Stefan'];
    const rels = [
      ...family('Helena', 'Ake', ['Agda', 'Olga']),
      ...family('Agda', 'Peter Johan', ['Tilly']),
      ...family('Olga', 'Karl Hugo', ['Kerstin', 'Harriet']),
      ...family('Stig', 'Tilly', ['Anna', 'Eva', 'Ylva']),
      ...family('Carl Brodden', 'Kerstin', ['Anette', 'Jan']),
      ...family('Harry', 'Harriet', ['Ann-Cristin', 'Peter', 'Stefan']),
    ];
    const view = render(ids.map((id) => person(id)), rels, 'Helena');
    expectNoOverlaps(view);
    const extents: Array<[number, number]> = [];
    for (const [parents, children] of [
      [['Stig', 'Tilly'], ['Anna', 'Eva', 'Ylva']],
      [['Carl Brodden', 'Kerstin'], ['Anette', 'Jan']],
      [['Harry', 'Harriet'], ['Ann-Cristin', 'Peter', 'Stefan']],
    ]) {
      const unit = findFamily(view, parents);
      expect(unit).toBeDefined();
      expect(sourceIds(view, unit.childCardIds).sort()).toEqual(children.sort());
      const cards = unit.parentCardIds.map((id) => view.cards.find((c) => c.id === id)!);
      expect(Math.abs(cards[0].left - cards[1].left)).toBe(PEDIGREE_CARD_WIDTH + 32);
      const memberCards = [...unit.parentCardIds, ...unit.childCardIds].map((id) => view.cards.find((c) => c.id === id)!);
      extents.push([Math.min(...memberCards.map((c) => c.left)), Math.max(...memberCards.map((c) => c.left + PEDIGREE_CARD_WIDTH))]);
    }
    extents.sort((a, b) => a[0] - b[0]);
    expect(extents[0][1]).toBeLessThan(extents[1][0]);
    expect(extents[1][1]).toBeLessThan(extents[2][0]);
    expect(view.cards.every((c) => !c.repeated)).toBe(true);
  });

  it('uses explicit repeated UUID occurrences for multiple unions, not one overlapping child bus', () => {
    const people = ['focus', 'partner1', 'partner2', 'child1', 'child2'].map((id) => person(id));
    const rels = [...family('focus', 'partner1', ['child1']), ...family('focus', 'partner2', ['child2'])];
    const view = render(people, rels, 'focus');
    expectNoOverlaps(view);
    expect(view.cards.filter((c) => c.sourceId === 'focus')).toHaveLength(2);
    expect(view.cards.filter((c) => c.sourceId === 'focus').every((c) => c.repeated)).toBe(true);
    expect(sourceIds(view, findFamily(view, ['focus', 'partner1']).childCardIds)).toEqual(['child1']);
    expect(sourceIds(view, findFamily(view, ['focus', 'partner2']).childCardIds)).toEqual(['child2']);
    expect(view.cards.find((c) => c.id === view.focusCardId)?.person?.id).toBe('focus');
  });

  it('does not call co-parents married without an explicit relationship', () => {
    const view = render(['a', 'b', 'kid'].map((id) => person(id)), [parent('a', 'kid'), parent('b', 'kid')], 'a');
    expect(findFamily(view, ['a', 'b']).label).toBe('Co-parents');
  });

  it('keeps single-parent families separate and deduplicates generic/typed parent edges', () => {
    const rels = [parent('focus', 'kid'), { ...parent('focus', 'kid'), id: 'typed', type: 'bio_mother' as const }];
    const view = render([person('focus'), person('kid')], rels, 'focus');
    expect(view.families).toHaveLength(1);
    expect(view.families[0].label).toBe('One recorded parent');
    expect(sourceIds(view, view.families[0].childCardIds)).toEqual(['kid']);
  });

  it('keeps missing parents grouped with their own child, apart from known grandparents', () => {
    const people = [person('focus'), person('father', 'M'), person('mother', 'F'), person('grandfather', 'M'), person('grandmother', 'F')];
    const rels = [...family('father', 'mother', ['focus']), ...family('grandfather', 'grandmother', ['father'])];
    const view = render(people, rels, 'focus', 2, true);
    expectNoOverlaps(view);
    expect(sourceIds(view, findFamily(view, ['grandfather', 'grandmother']).childCardIds)).toEqual(['father']);
    const missing = view.families.find((f) => f.parentCardIds.every((id) => view.cards.find((c) => c.id === id)?.placeholder));
    expect(missing).toBeDefined();
    expect(sourceIds(view, missing!.childCardIds)).toEqual(['mother']);
  });

  it('bounds shared-branch expansion, keeps all people, and marks repeated family occurrences', () => {
    const people = ['focus', 'spouse', 'a', 'b', 'kid'].map((id) => person(id));
    const rels = [...family('focus', 'spouse', ['a', 'b']), ...family('a', 'b', ['kid'])];
    const view = render(people, rels, 'focus');
    expectNoOverlaps(view);
    expect(view.cards.length).toBeLessThanOrEqual(people.length * 2);
    expect(new Set(view.cards.map((c) => c.sourceId))).toEqual(new Set(people.map((p) => p.id)));
    expect(view.families.some((f) => f.reference)).toBe(true);
  });

  it('orders siblings by birth year and leaves identity independent of names', () => {
    const rels = family('focus', 'spouse', ['younger', 'older']);
    const people = [person('focus'), person('spouse'), person('younger', 'O', '2000'), person('older', 'O', '1990')];
    const before = render(people, rels, 'focus');
    const renamed = render(people.map((p) => ({ ...p, firstName: 'Changed', lastName: 'Same name' })), [...rels].reverse(), 'focus');
    expect(renamed.cards.map((c) => [c.sourceId, c.left, c.top])).toEqual(before.cards.map((c) => [c.sourceId, c.left, c.top]));
    expect(sourceIds(before, before.families[0].childCardIds)).toEqual(['older', 'younger']);
  });
});
