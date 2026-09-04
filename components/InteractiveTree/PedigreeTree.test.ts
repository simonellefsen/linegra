import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Person, Relationship } from '../../types';
import PedigreeTree from './PedigreeTree';

const people: Person[] = ['parent', 'partner', 'child', 'sibling'].map((id) => ({
  id, firstName: id, lastName: 'Test', treeId: 'tree', gender: 'O', updatedAt: '',
}));
const parents: Relationship[] = ['child', 'sibling'].flatMap((child) => ['parent', 'partner'].map((id) => ({
  id: `${id}-${child}`, personId: id, relatedId: child, type: 'child' as const, treeId: 'tree',
})));

describe('PedigreeTree family rendering', () => {
  it('uses full relationship metadata to label an in-scope couple and renders one family branch', () => {
    const markup = renderToStaticMarkup(React.createElement(PedigreeTree, { people, relationships: parents,
      allRelationships: [...parents, { id: 'union', personId: 'parent', relatedId: 'partner', type: 'marriage', treeId: 'tree' }],
      focusId: 'parent', maxAncestors: 0, maxDescendants: 1, onPersonSelect: () => {} }));
    expect(markup.match(/data-family-id=/g)).toHaveLength(1);
    expect(markup).toContain('Married \u00b7 2 children');
    expect(markup).toContain('child Test: child of parent Test + partner Test');
    expect(markup).toContain('sibling Test: child of parent Test + partner Test');
  });

  it('keeps selection, DNA and expansion controls as separate buttons', () => {
    const rels = parents.map((rel) => ({ ...rel, metadata: { dna_support_by_person: { tester: ['match'] } } }));
    const markup = renderToStaticMarkup(React.createElement(PedigreeTree, { people, relationships: rels,
      focusId: 'parent', maxAncestors: 0, maxDescendants: 1, onPersonSelect: () => {},
      onDnaBadgeClick: () => {}, onExpandSiblings: () => {}, siblingHints: { parent: true } }));
    expect(markup).toContain('Show siblings');
    expect(markup).toContain('Open DNA panel.');
    expect(markup).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
    expect(markup).toContain('data-person-id="parent"');
  });
});
