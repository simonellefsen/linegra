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

  it('uses UUID-keyed path data to render every name and relationship label', () => {
    const path = {
      pathPersonIds: ['tester', 'parent', 'mrca', 'cousin-parent', 'match'],
      pathRelationshipIds: ['r1', 'r2', 'r3', 'r4'],
    };
    const pathRows = [
      rel('r1', 'parent', 'tester', 'bio_mother'),
      rel('r2', 'mrca', 'parent', 'bio_father'),
      rel('r3', 'mrca', 'cousin-parent', 'bio_mother'),
      rel('r4', 'cousin-parent', 'match', 'bio_father'),
    ];
    const pathNames = {
      tester: 'Simon Ellefsen',
      parent: 'Known Parent',
      mrca: 'Shared Ancestor',
      'cousin-parent': 'Cousin Parent',
      match: 'Stefan Timmermann Byström',
    };

    expect(
      buildDnaLineagePathLabel(
        path.pathPersonIds,
        path.pathRelationshipIds,
        pathRows,
        pathNames
      )
    ).toBe(
      'Simon Ellefsen → child of Known Parent → child of Shared Ancestor → parent of Cousin Parent → parent of Stefan Timmermann Byström'
    );
    expect(
      formatDnaLineagePathSummary(
        path.pathPersonIds,
        path.pathRelationshipIds,
        pathRows,
        pathNames
      )
    ).toBe('4 hops · MRCA Shared Ancestor');
  });

  it('does not label the DNA match as MRCA when edge labels are all child-of', () => {
    const ids = {
      tester: 't',
      p1: 'p1',
      p2: 'p2',
      p3: 'p3',
      p4: 'p4',
      p5: 'p5',
      mrca: 'mrca',
      c1: 'c1',
      c2: 'c2',
      c3: 'c3',
      c4: 'c4',
      kenneth: 'kenneth',
    };
    const cousinRows: LineageRelationshipEdge[] = [
      rel('r0', ids.p1, ids.tester, 'bio_mother'),
      rel('r1', ids.p2, ids.p1, 'bio_mother'),
      rel('r2', ids.p3, ids.p2, 'bio_mother'),
      rel('r3', ids.p4, ids.p3, 'bio_mother'),
      rel('r4', ids.p5, ids.p4, 'bio_mother'),
      rel('r5', ids.mrca, ids.p5, 'bio_mother'),
      rel('r6', ids.mrca, ids.c1, 'bio_mother'),
      rel('r7', ids.c1, ids.c2, 'bio_mother'),
      rel('r8', ids.c2, ids.c3, 'bio_mother'),
      rel('r9', ids.c3, ids.c4, 'bio_mother'),
      rel('r10', ids.c4, ids.kenneth, 'bio_mother'),
    ];
    const cousinPath = {
      pathPersonIds: [
        ids.tester,
        ids.p1,
        ids.p2,
        ids.p3,
        ids.p4,
        ids.p5,
        ids.mrca,
        ids.c1,
        ids.c2,
        ids.c3,
        ids.c4,
        ids.kenneth,
      ],
      pathRelationshipIds: [] as string[],
    };
    const cousinNames = {
      [ids.tester]: 'Tester',
      [ids.mrca]: 'Shared Ancestor',
      [ids.kenneth]: 'Kenneth Russell Hansen',
    };

    expect(
      pickLineageMrcaPersonId(
        cousinPath.pathPersonIds,
        cousinPath.pathRelationshipIds,
        cousinRows,
        { focusPersonId: ids.tester, counterpartPersonId: ids.kenneth }
      )
    ).toBe(ids.mrca);

    expect(
      formatDnaLineagePathSummary(
        cousinPath.pathPersonIds,
        cousinPath.pathRelationshipIds,
        cousinRows,
        cousinNames,
        { focusPersonId: ids.tester, counterpartPersonId: ids.kenneth }
      )
    ).toBe('11 hops · MRCA Shared Ancestor');
  });
});
