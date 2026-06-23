import { describe, it, expect } from 'vitest';
import { runDataQualityChecks, DataQualityIssue } from './dataQuality';
import { Person, Relationship } from '../types';

const person = (overrides: Partial<Person> & { id: string }): Person => ({
  treeId: 'tree-1',
  firstName: '',
  lastName: '',
  gender: 'O',
  updatedAt: '2026-06-23T00:00:00Z',
  ...overrides,
});

const parental = (id: string, parentId: string, childId: string): Relationship => ({
  id,
  treeId: 'tree-1',
  type: 'bio_father',
  personId: parentId,
  relatedId: childId,
});

const types = (issues: DataQualityIssue[]) => issues.map((i) => i.type);

describe('runDataQualityChecks — per-person', () => {
  it('flags death recorded before birth', () => {
    const issues = runDataQualityChecks([person({ id: 'a', firstName: 'A', birthDate: '1900', deathDate: '1880' })], []);
    expect(types(issues)).toContain('death-before-birth');
  });

  it('flags burial before death', () => {
    const issues = runDataQualityChecks([person({ id: 'a', firstName: 'A', deathDate: '1900', burialDate: '1880' })], []);
    expect(types(issues)).toContain('burial-before-death');
  });

  it('flags an implausible lifespan (>130 years)', () => {
    const issues = runDataQualityChecks([person({ id: 'a', firstName: 'A', birthDate: '1800', deathDate: '2000' })], []);
    expect(types(issues)).toContain('implausible-lifespan');
  });

  it('does not flag a normal lifespan', () => {
    const issues = runDataQualityChecks([person({ id: 'a', firstName: 'A', birthDate: '1900', deathDate: '1970' })], []);
    expect(types(issues)).not.toContain('implausible-lifespan');
  });
});

describe('runDataQualityChecks — relationships', () => {
  it('flags a parent who is not older than the child', () => {
    const people = [
      person({ id: 'p', firstName: 'Parent', birthDate: '1990' }),
      person({ id: 'c', firstName: 'Child', birthDate: '1980' }),
    ];
    const issues = runDataQualityChecks(people, [parental('r1', 'p', 'c')]);
    expect(types(issues)).toContain('parent-younger-than-child');
  });

  it('flags an implausibly young parent (<12 at birth)', () => {
    const people = [
      person({ id: 'p', firstName: 'Parent', birthDate: '1990' }),
      person({ id: 'c', firstName: 'Child', birthDate: '1998' }), // parent age 8
    ];
    const issues = runDataQualityChecks(people, [parental('r1', 'p', 'c')]);
    expect(types(issues)).toContain('implausibly-young-parent');
  });

  it('flags a child born well after a parent died', () => {
    const people = [
      person({ id: 'p', firstName: 'Parent', birthDate: '1900', deathDate: '1950' }),
      person({ id: 'c', firstName: 'Child', birthDate: '1960' }),
    ];
    const issues = runDataQualityChecks(people, [parental('r1', 'p', 'c')]);
    expect(types(issues)).toContain('child-after-parent-death');
  });

  it('does not flag a child born within the post-death grace window', () => {
    const people = [
      person({ id: 'p', firstName: 'Parent', birthDate: '1900', deathDate: '1950' }),
      person({ id: 'c', firstName: 'Child', birthDate: '1950' }),
    ];
    const issues = runDataQualityChecks(people, [parental('r1', 'p', 'c')]);
    expect(types(issues)).not.toContain('child-after-parent-death');
  });

  it('ignores non-parental relationships', () => {
    const people = [
      person({ id: 'p', firstName: 'Parent', birthDate: '1990' }),
      person({ id: 'c', firstName: 'Child', birthDate: '1980' }),
    ];
    const rel: Relationship = { id: 'm1', treeId: 'tree-1', type: 'marriage', personId: 'p', relatedId: 'c' };
    const issues = runDataQualityChecks(people, [rel]);
    expect(types(issues)).not.toContain('parent-younger-than-child');
  });
});

describe('runDataQualityChecks — duplicates', () => {
  it('flags two people with the same name and close birth year', () => {
    const people = [
      person({ id: 'a', firstName: 'Jens', lastName: 'Jensen', birthDate: '1850' }),
      person({ id: 'b', firstName: 'Jens', lastName: 'Jensen', birthDate: '1851' }),
    ];
    const issues = runDataQualityChecks(people, []);
    expect(types(issues)).toContain('duplicate-person');
    expect(issues[0].personIds).toContain('a');
    expect(issues[0].personIds).toContain('b');
  });

  it('does not flag same-name people born far apart', () => {
    const people = [
      person({ id: 'a', firstName: 'Jens', lastName: 'Jensen', birthDate: '1800' }),
      person({ id: 'b', firstName: 'Jens', lastName: 'Jensen', birthDate: '1850' }),
    ];
    const issues = runDataQualityChecks(people, []);
    expect(types(issues)).not.toContain('duplicate-person');
  });
});

describe('runDataQualityChecks — clean data', () => {
  it('returns no issues for consistent data', () => {
    const people = [
      person({ id: 'p', firstName: 'Parent', birthDate: '1900', deathDate: '1970' }),
      person({ id: 'c', firstName: 'Child', birthDate: '1930' }),
    ];
    const issues = runDataQualityChecks(people, [parental('r1', 'p', 'c')]);
    expect(issues).toEqual([]);
  });
});
