import { describe, expect, it } from 'vitest';
import { buildPedigreeLayout } from './pedigreeLayout';
import type { Person, Relationship } from '../types';

const person = (
  id: string,
  firstName: string,
  gender: Person['gender'] = 'O',
  lastName = 'Test'
): Person => ({
  id,
  treeId: 't1',
  firstName,
  lastName,
  gender,
  updatedAt: '2026-07-05T00:00:00Z',
});

describe('buildPedigreeLayout', () => {
  it('shows coparent beside focus and union parent edges to shared children', () => {
    const margaretha = person('mom', 'Margaretha', 'F', 'Hagenzieker');
    const wilhelm = person('dad', 'Wilhelm', 'M', 'Huster');
    const child = person('kid', 'Ewaldine', 'F', 'Hagenzieker');
    const people = [margaretha, wilhelm, child];
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'dad', relatedId: 'mom', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'dad', relatedId: 'kid', type: 'bio_father', treeId: 't1' },
      { id: 'r3', personId: 'mom', relatedId: 'kid', type: 'bio_mother', treeId: 't1' },
    ];

    const layout = buildPedigreeLayout(people, relationships, {
      focusId: 'mom',
      maxAncestorDepth: 1,
      maxDescendantDepth: 1,
      allowPlaceholders: false,
    });

    expect(layout.nodes.some((node) => node.id === 'dad')).toBe(true);
    expect(layout.edges.filter((edge) => edge.type === 'parent' && edge.toId === 'kid')).toHaveLength(2);
    expect(layout.edges.some((edge) => edge.type === 'spouse')).toBe(true);
  });

  it('renders spouses beside focus instead of as children', () => {
    const wilhelmina = person('wife', 'Wilhelmina', 'F', 'Wouters');
    const george = person('husband', 'George', 'M', 'Kazanis');
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'wife', relatedId: 'husband', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'wife', relatedId: 'husband', type: 'child', treeId: 't1' },
    ];
    const layout = buildPedigreeLayout([wilhelmina, george], relationships, {
      focusId: 'wife',
      maxAncestorDepth: 0,
      maxDescendantDepth: 1,
      allowPlaceholders: false,
    });
    expect(layout.edges.some((edge) => edge.type === 'spouse')).toBe(true);
    expect(layout.edges.some((edge) => edge.type === 'parent' && edge.toId === 'husband')).toBe(false);
  });

  it('centers a child under the midpoint of both parents', () => {
    const wilhelmina = person('wife', 'Wilhelmina', 'F', 'Wouters');
    const george = person('husband', 'George', 'M', 'Kazanis');
    const child = person('kid', 'E.G.', 'M', 'Kazanis');
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'wife', relatedId: 'husband', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'wife', relatedId: 'kid', type: 'bio_mother', treeId: 't1' },
      { id: 'r3', personId: 'husband', relatedId: 'kid', type: 'bio_father', treeId: 't1' },
    ];
    const layout = buildPedigreeLayout([wilhelmina, george, child], relationships, {
      focusId: 'wife',
      maxAncestorDepth: 0,
      maxDescendantDepth: 1,
      allowPlaceholders: false,
    });
    const wifeNode = layout.nodes.find((node) => node.id === 'wife');
    const husbandNode = layout.nodes.find((node) => node.id === 'husband');
    const childNode = layout.nodes.find((node) => node.id === 'kid');
    expect(wifeNode).toBeTruthy();
    expect(husbandNode).toBeTruthy();
    expect(childNode).toBeTruthy();
    const expectedRow = ((wifeNode!.row + husbandNode!.row) / 2);
    expect(childNode!.row).toBeCloseTo(expectedRow, 5);
  });

  it('groups children under each coparent union center', () => {
    const wilhelm = person('dad', 'Wilhelm', 'M', 'Huster');
    const margaretha = person('mom1', 'Margaretha', 'F', 'Hagenzieker');
    const maria = person('mom2', 'Maria', 'F', 'Maarseveen');
    const ewaldine = person('kid1', 'Ewaldine', 'F', 'Hagenzieker');
    const edmund = person('kid2', 'Edmund', 'M', 'Huster');
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'dad', relatedId: 'mom1', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'dad', relatedId: 'mom2', type: 'marriage', treeId: 't1' },
      { id: 'r3', personId: 'dad', relatedId: 'kid1', type: 'bio_father', treeId: 't1' },
      { id: 'r4', personId: 'mom1', relatedId: 'kid1', type: 'bio_mother', treeId: 't1' },
      { id: 'r5', personId: 'dad', relatedId: 'kid2', type: 'bio_father', treeId: 't1' },
      { id: 'r6', personId: 'mom2', relatedId: 'kid2', type: 'bio_mother', treeId: 't1' },
    ];
    const layout = buildPedigreeLayout(
      [wilhelm, margaretha, maria, ewaldine, edmund],
      relationships,
      {
        focusId: 'dad',
        maxAncestorDepth: 0,
        maxDescendantDepth: 1,
        allowPlaceholders: false,
      }
    );
    const dadNode = layout.nodes.find((node) => node.id === 'dad')!;
    const mom1Node = layout.nodes.find((node) => node.id === 'mom1')!;
    const mom2Node = layout.nodes.find((node) => node.id === 'mom2')!;
    const kid1Node = layout.nodes.find((node) => node.id === 'kid1')!;
    const kid2Node = layout.nodes.find((node) => node.id === 'kid2')!;
    const union1Center = (dadNode.row + mom1Node.row) / 2;
    const union2Center = (dadNode.row + mom2Node.row) / 2;
    expect(kid1Node.row).toBeCloseTo(union1Center, 5);
    expect(kid2Node.row).toBeCloseTo(union2Center, 5);
    expect(Math.abs(kid2Node.row - kid1Node.row)).toBeGreaterThan(0);
  });

  it('orders siblings by birth year within each union group', () => {
    const wilhelm = person('dad', 'Wilhelm', 'M', 'Huster');
    const margaretha = person('mom', 'Margaretha', 'F', 'Hagenzieker');
    const ewaldine = person('kid1', 'Ewaldine', 'F', 'Hagenzieker');
    const wilhelmina = person('kid2', 'Wilhelmina', 'F', 'Wouters');
    const eduard = person('kid3', 'Eduard', 'M', 'Huster');
    ewaldine.birthDate = '1919';
    wilhelmina.birthDate = '1923';
    eduard.birthDate = '1925';
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'dad', relatedId: 'mom', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'dad', relatedId: 'kid1', type: 'bio_father', treeId: 't1' },
      { id: 'r3', personId: 'mom', relatedId: 'kid1', type: 'bio_mother', treeId: 't1' },
      { id: 'r4', personId: 'dad', relatedId: 'kid2', type: 'bio_father', treeId: 't1' },
      { id: 'r5', personId: 'mom', relatedId: 'kid2', type: 'bio_mother', treeId: 't1' },
      { id: 'r6', personId: 'dad', relatedId: 'kid3', type: 'bio_father', treeId: 't1' },
      { id: 'r7', personId: 'mom', relatedId: 'kid3', type: 'bio_mother', treeId: 't1' },
    ];
    const layout = buildPedigreeLayout(
      [wilhelm, margaretha, ewaldine, wilhelmina, eduard],
      relationships,
      {
        focusId: 'dad',
        maxAncestorDepth: 0,
        maxDescendantDepth: 1,
        allowPlaceholders: false,
      }
    );
    const childRows = ['kid1', 'kid2', 'kid3'].map((id) => layout.nodes.find((node) => node.id === id)!.row);
    expect(childRows[0]).toBeLessThan(childRows[1]);
    expect(childRows[1]).toBeLessThan(childRows[2]);
  });

  it('places a spouse beside the parent when expanding nested descendants', () => {
    const margaretha = person('mom', 'Margaretha', 'F', 'Hagenzieker');
    const wilhelm = person('dad', 'Wilhelm', 'M', 'Huster');
    const wilhelmina = person('wife', 'Wilhelmina', 'F', 'Wouters');
    const george = person('husband', 'George', 'M', 'Kazanis');
    const child = person('kid', 'E.G.', 'M', 'Kazanis');
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'dad', relatedId: 'mom', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'dad', relatedId: 'wife', type: 'bio_father', treeId: 't1' },
      { id: 'r3', personId: 'mom', relatedId: 'wife', type: 'bio_mother', treeId: 't1' },
      { id: 'r4', personId: 'wife', relatedId: 'husband', type: 'marriage', treeId: 't1' },
      { id: 'r5', personId: 'wife', relatedId: 'kid', type: 'bio_mother', treeId: 't1' },
      { id: 'r6', personId: 'husband', relatedId: 'kid', type: 'bio_father', treeId: 't1' },
    ];
    const layout = buildPedigreeLayout(
      [margaretha, wilhelm, wilhelmina, george, child],
      relationships,
      {
        focusId: 'mom',
        maxAncestorDepth: 1,
        maxDescendantDepth: 2,
        allowPlaceholders: false,
      }
    );
    const wifeNode = layout.nodes.find((node) => node.id === 'wife')!;
    const husbandNode = layout.nodes.find((node) => node.id === 'husband')!;
    const childNode = layout.nodes.find((node) => node.id === 'kid')!;
    expect(husbandNode.column).toBe(wifeNode.column);
    expect(childNode.column).toBeGreaterThan(wifeNode.column);
    expect(layout.edges.some((edge) => edge.type === 'spouse' && edge.fromId === 'wife')).toBe(true);
  });

  it('flags sibling hints when siblings are not placed in the layout', () => {
    const wilhelmina = person('wife', 'Wilhelmina', 'F', 'Wouters');
    const wilhelm = person('dad', 'Wilhelm', 'M', 'Huster');
    const margaretha = person('mom', 'Margaretha', 'F', 'Hagenzieker');
    const ewaldine = person('sib', 'Ewaldine', 'F', 'Hagenzieker');
    const relationships: Relationship[] = [
      { id: 'r1', personId: 'dad', relatedId: 'mom', type: 'marriage', treeId: 't1' },
      { id: 'r2', personId: 'dad', relatedId: 'wife', type: 'bio_father', treeId: 't1' },
      { id: 'r3', personId: 'mom', relatedId: 'wife', type: 'bio_mother', treeId: 't1' },
      { id: 'r4', personId: 'dad', relatedId: 'sib', type: 'bio_father', treeId: 't1' },
      { id: 'r5', personId: 'mom', relatedId: 'sib', type: 'bio_mother', treeId: 't1' },
    ];
    const layout = buildPedigreeLayout([wilhelmina, wilhelm, margaretha, ewaldine], relationships, {
      focusId: 'wife',
      maxAncestorDepth: 2,
      maxDescendantDepth: 0,
      allowPlaceholders: false,
    });
    expect(layout.siblingHints['wife']).toBe(true);
  });
});
