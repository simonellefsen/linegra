import { describe, expect, it } from 'vitest';
import {
  buildPersonUrl,
  buildTreeUrl,
  canonicalizeLegacyPublicUrl,
  parsePublicRouteFromLocation,
} from './publicRoutes';

const TREE = '11111111-1111-4111-8111-111111111111';
const PERSON = '22222222-2222-4222-8222-222222222222';

describe('publicRoutes', () => {
  it('parses canonical person and tree paths', () => {
    expect(
      parsePublicRouteFromLocation({
        pathname: `/tree/${TREE}/person/${PERSON}`,
        search: '',
      })
    ).toEqual({ kind: 'person', treeId: TREE, personId: PERSON });
    expect(parsePublicRouteFromLocation({ pathname: `/tree/${TREE}`, search: '' })).toEqual({
      kind: 'tree',
      treeId: TREE,
    });
  });

  it('parses legacy query URLs and canonicalizes them', () => {
    const legacy = parsePublicRouteFromLocation({
      pathname: '/',
      search: `?tree=${TREE}&person=${PERSON}`,
    });
    expect(legacy).toEqual({ kind: 'person', treeId: TREE, personId: PERSON, legacy: true });
    const canonical = canonicalizeLegacyPublicUrl(
      { pathname: '/', search: `?tree=${TREE}&person=${PERSON}`, hash: '' },
      'https://linegra.app'
    );
    expect(canonical).toBe(buildPersonUrl(TREE, PERSON, 'https://linegra.app'));
    expect(buildTreeUrl(TREE, 'https://linegra.app')).toBe(`https://linegra.app/tree/${TREE}`);
  });
});
