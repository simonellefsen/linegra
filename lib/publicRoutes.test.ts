import { describe, expect, it } from 'vitest';
import {
  buildPersonUrl,
  buildTreeUrl,
  buildTreesDirectoryUrl,
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

  it('parses v2 slug routes and tree directory', () => {
    expect(parsePublicRouteFromLocation({ pathname: '/trees', search: '' })).toEqual({
      kind: 'trees-directory',
    });
    expect(
      parsePublicRouteFromLocation({
        pathname: '/tree/gether-gamby/person/anna-hansdatter-1832-4a1b9c2e',
        search: '',
      })
    ).toEqual({
      kind: 'person',
      treeSlug: 'gether-gamby',
      personSlug: 'anna-hansdatter-1832-4a1b9c2e',
      personIdPrefix: '4a1b9c2e',
    });
    expect(buildTreeUrl({ id: TREE, slug: 'gether-gamby' }, 'https://linegra.app')).toBe(
      'https://linegra.app/tree/gether-gamby'
    );
    expect(buildTreesDirectoryUrl('https://linegra.app')).toBe('https://linegra.app/trees');
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
