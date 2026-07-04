import { describe, expect, it } from 'vitest';
import { Person, Relationship } from '../types';
import {
  diffGedcomArchiveSummaries,
  inferDefaultProbandId,
  summarizeGedcomArchive,
} from './gedcomFidelity';
import { parseGedcom, serializeGedcom } from './gedcomParser';

const person = (partial: Partial<Person> & Pick<Person, 'id'>): Person =>
  ({
    firstName: 'A',
    lastName: 'B',
    gender: 'O',
    ...partial,
  }) as Person;

const parental = (id: string, parentId: string, childId: string): Relationship =>
  ({
    id,
    personId: parentId,
    relatedId: childId,
    type: 'bio_father',
  }) as Relationship;

describe('gedcomFidelity', () => {
  it('prefers a parentless person with descendants as proband', () => {
    const people = [
      person({ id: 'leaf', firstName: 'Leaf' }),
      person({ id: 'root', firstName: 'Root' }),
    ];
    const relationships = [parental('r1', 'root', 'leaf')];
    expect(inferDefaultProbandId(people, relationships)).toBe('root');
  });

  it('summarizes and diffs archive counts', () => {
    const before = summarizeGedcomArchive([], []);
    const after = summarizeGedcomArchive([person({ id: '1' })], []);
    const diff = diffGedcomArchiveSummaries(before, after);
    expect(diff.changed).toBe(true);
    expect(diff.fields[0]?.field).toBe('people');
  });

  it('round-trips citation PAGE/QUAY/DATA context through export and import', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME Ada /Lovelace/',
      '1 DEAT',
      '2 DATE 1852',
      '2 SOUR @S1@',
      '3 PAGE 42',
      '3 QUAY 2',
      '3 DATA',
      '4 TEXT Burial notice excerpt',
      '0 @S1@ SOUR',
      '1 TITL Parish register',
      '0 TRLR',
    ].join('\n');

    const first = parseGedcom(ged);
    const second = parseGedcom(serializeGedcom(first.people, first.relationships));
    const deathCitation = second.people[0].citations?.find((c) => c.eventLabel === 'Death');
    expect(deathCitation?.page).toBe('42');
    expect(deathCitation?.quay).toBe(2);
    expect(deathCitation?.dataText).toContain('Burial notice excerpt');
    expect(second.people[0].sources?.length).toBeGreaterThan(0);
  });

  it('warns on unsupported repository tags', () => {
    const ged = ['0 @R1@ REPO', '1 NAME City Archive', '1 ZZZZ mystery'].join('\n');
    const { warnings } = parseGedcom(ged);
    expect(warnings.some((w) => w.includes('ZZZZ'))).toBe(true);
  });
});
