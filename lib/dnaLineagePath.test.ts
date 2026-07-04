import { describe, expect, it } from 'vitest';
import {
  buildChildToParentsMap,
  findDnaBloodRelationshipPath,
  pathHasCoparentBridge,
  type BloodRelationshipEdge,
} from './dnaLineagePath';

const rel = (
  id: string,
  person_id: string,
  related_id: string,
  type: BloodRelationshipEdge['type']
): BloodRelationshipEdge => ({ id, person_id, related_id, type });

describe('findDnaBloodRelationshipPath', () => {
  it('rejects a coparent bridge through a shared child', () => {
    const rows = [
      rel('m', 'eva', 'pernille', 'bio_mother'),
      rel('f', 'steinar', 'pernille', 'bio_father'),
      rel('g', 'gudrun', 'steinar', 'bio_mother'),
    ];

    const path = findDnaBloodRelationshipPath('eva', 'steinar', rows);
    expect(path).toBeNull();
    expect(pathHasCoparentBridge(['eva', 'pernille', 'steinar'], buildChildToParentsMap(rows))).toBe(true);
  });

  it('returns null when the only route crosses a coparent bridge', () => {
    const rows = [
      rel('m', 'eva', 'pernille', 'bio_mother'),
      rel('f', 'steinar', 'pernille', 'bio_father'),
      rel('g', 'gudrun', 'steinar', 'bio_mother'),
      rel('s', 'gudrun', 'sissel', 'bio_mother'),
    ];

    const path = findDnaBloodRelationshipPath('eva', 'sissel', rows);
    expect(path).toBeNull();
  });

  it('finds a valid path through a shared biological ancestor', () => {
    const rows = [
      rel('m', 'eva', 'pernille', 'bio_mother'),
      rel('f', 'steinar', 'pernille', 'bio_father'),
      rel('g', 'gudrun', 'steinar', 'bio_mother'),
      rel('s', 'gudrun', 'sissel', 'bio_mother'),
      rel('a', 'shared-ancestor', 'eva', 'bio_mother'),
      rel('b', 'shared-ancestor', 'gudrun', 'bio_mother'),
    ];

    const path = findDnaBloodRelationshipPath('eva', 'sissel', rows);
    expect(path).not.toBeNull();
    expect(path?.pathPersonIds[0]).toBe('eva');
    expect(path?.pathPersonIds[path!.pathPersonIds.length - 1]).toBe('sissel');
    expect(pathHasCoparentBridge(path!.pathPersonIds, buildChildToParentsMap(rows))).toBe(false);
    expect(path!.pathPersonIds).not.toContain('pernille');
  });

  it('allows sibling traversal through a shared parent', () => {
    const rows = [
      rel('p', 'parent', 'child-a', 'bio_mother'),
      rel('q', 'parent', 'child-b', 'bio_mother'),
    ];

    const path = findDnaBloodRelationshipPath('child-a', 'child-b', rows);
    expect(path?.pathPersonIds).toEqual(['child-a', 'parent', 'child-b']);
  });
});
