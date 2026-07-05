import { describe, expect, it } from 'vitest';
import {
  buildDnaLineagePathBreadcrumb,
  buildDnaLineagePathLabel,
  formatDnaLineagePathSummary,
  pickLineageMrcaPersonId,
  type LineageRelationshipEdge,
} from './dnaLineagePathLabel';

const rel = (
  id: string,
  person_id: string,
  related_id: string,
  type: string
): LineageRelationshipEdge => ({ id, person_id, related_id, type });

const names = {
  ada: 'Ada Lovelace',
  byron: 'Lord Byron',
  anne: 'Anne King',
};

describe('dnaLineagePathLabel', () => {
  const siblingRows = [
    rel('p', 'byron', 'ada', 'bio_father'),
    rel('q', 'byron', 'anne', 'bio_father'),
  ];
  const siblingPath = {
    pathPersonIds: ['ada', 'byron', 'anne'],
    pathRelationshipIds: ['p', 'q'],
  };

  it('picks the shared parent as MRCA on a sibling path', () => {
    expect(
      pickLineageMrcaPersonId(siblingPath.pathPersonIds, siblingPath.pathRelationshipIds, siblingRows)
    ).toBe('byron');
  });

  it('formats a generation breadcrumb with MRCA flagged', () => {
    const crumbs = buildDnaLineagePathBreadcrumb(
      siblingPath.pathPersonIds,
      siblingPath.pathRelationshipIds,
      siblingRows,
      names
    );
    expect(crumbs).toHaveLength(3);
    expect(crumbs[1]).toMatchObject({ personId: 'byron', name: 'Lord Byron', isMrca: true });
    expect(crumbs[0]?.edgeLabel).toBe('child of');
    expect(crumbs[1]?.edgeLabel).toBe('parent of');
  });

  it('builds arrow-chain prose for storage', () => {
    expect(
      buildDnaLineagePathLabel(siblingPath.pathPersonIds, siblingPath.pathRelationshipIds, siblingRows, names)
    ).toBe('Ada Lovelace → child of Lord Byron → parent of Anne King');
  });

  it('summarizes hops and MRCA without repeating the full chain', () => {
    expect(
      formatDnaLineagePathSummary(siblingPath.pathPersonIds, siblingPath.pathRelationshipIds, siblingRows, names)
    ).toBe('2 hops · MRCA Lord Byron');
  });
});
