import { describe, it, expect } from 'vitest';
import { Person, Relationship } from '../types';
import {
  fullName,
  orderPeopleForBook,
  summarizeFamily,
  selectPeopleForBook,
  buildChapterFacts,
  collectDescendants,
  planBook,
  buildRelationshipMaps,
  personBiographySignature,
  shouldReuseBiography,
  moveChapter,
  removeChapter,
  createCustomChapter,
} from './bookComposer';
import { bookStrings } from './bookI18n';
import { BookChapterFacts, BookChapter, BookGenerationOptions, PersonBiography, PersonEvent, Source } from '../types';

const person = (overrides: Partial<Person> & { id: string }): Person => ({
  treeId: 'tree-1',
  firstName: '',
  lastName: '',
  gender: 'O',
  updatedAt: '2026-06-20T00:00:00Z',
  ...overrides,
});

const rel = (
  id: string,
  type: Relationship['type'],
  personId: string,
  relatedId: string
): Relationship => ({
  id,
  treeId: 'tree-1',
  type,
  personId,
  relatedId,
});

describe('fullName', () => {
  it('appends a differing maiden name', () => {
    expect(fullName({ firstName: 'Anna', lastName: 'Smith', maidenName: 'Jones' })).toBe(
      'Anna Smith (née Jones)'
    );
  });
  it('omits the maiden name when it matches the surname', () => {
    expect(fullName({ firstName: 'Anna', lastName: 'Smith', maidenName: 'Smith' })).toBe('Anna Smith');
  });
  it('falls back to Unknown for empty names', () => {
    expect(fullName({ firstName: '', lastName: '' })).toBe('Unknown');
  });
});

describe('orderPeopleForBook', () => {
  it('orders chronologically by birth year (earliest first)', () => {
    const people = [
      person({ id: 'a', birthDate: '1900' }),
      person({ id: 'b', birthDate: '1850' }),
      person({ id: 'c', birthDate: '1880' }),
    ];
    expect(orderPeopleForBook(people).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps undateable people last, preserving input order (stable)', () => {
    const people = [
      person({ id: 'x' }),
      person({ id: 'y', birthDate: '1800' }),
      person({ id: 'z' }),
    ];
    expect(orderPeopleForBook(people).map((p) => p.id)).toEqual(['y', 'x', 'z']);
  });

  it('uses generation as a primary tiebreak when present', () => {
    const people = [
      person({ id: 'a', birthDate: '1900', generation: 3 }),
      person({ id: 'b', birthDate: '1900', generation: 1 }),
    ];
    expect(orderPeopleForBook(people).map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('collectDescendants + selectPeopleForBook', () => {
  const relationships: Relationship[] = [
    rel('r1', 'bio_father', 'g1', 'p1'), // g1 is parent of p1
    rel('r2', 'bio_mother', 'g2', 'p1'),
    rel('r3', 'bio_father', 'p1', 'c1'), // p1 is parent of c1
    rel('r4', 'bio_mother', 'p1', 'c2'),
    rel('r5', 'bio_father', 'c1', 'gc1'), // c1 is parent of gc1
  ];
  const people: Person[] = [
    person({ id: 'g1', birthDate: '1820', lastName: 'Andersen' }),
    person({ id: 'g2', birthDate: '1825' }),
    person({ id: 'p1', birthDate: '1850' }),
    person({ id: 'c1', birthDate: '1880' }),
    person({ id: 'c2', birthDate: '1882' }),
    person({ id: 'gc1', birthDate: '1910' }),
    person({ id: 'unrelated', birthDate: '1860' }),
  ];

  it('collects the proband and all descendants (3 generations), excluding ancestors and unrelated', () => {
    const maps = buildRelationshipMaps(relationships);
    expect([...collectDescendants('p1', maps)].sort()).toEqual(['c1', 'c2', 'gc1', 'p1']);
  });

  it("descendants scope selects the proband's branch only", () => {
    const selected = selectPeopleForBook(people, relationships, {
      scope: 'descendants',
      probandId: 'p1',
      style: 'narrative',
      length: 'medium',
      language: 'en',
    }).map((p) => p.id);
    expect(selected).toEqual(['p1', 'c1', 'c2', 'gc1']); // ordered by birth year
  });

  it('all scope returns everyone, ordered', () => {
    const selected = selectPeopleForBook(people, relationships, {
      scope: 'all',
      style: 'narrative',
      length: 'medium',
      language: 'en',
    }).map((p) => p.id);
    expect(selected[0]).toBe('g1'); // earliest birth year
    expect(selected).toHaveLength(7);
  });

  it('selected scope returns only the chosen ids', () => {
    const selected = selectPeopleForBook(people, relationships, {
      scope: 'selected',
      selectedIds: ['c1', 'unrelated'],
      style: 'narrative',
      length: 'medium',
      language: 'en',
    }).map((p) => p.id);
    expect(selected).toEqual(['unrelated', 'c1']); // unrelated born 1860 < c1 1880
  });
});

describe('summarizeFamily', () => {
  it('computes span, top surnames/places/occupations, counts, and generation depth', () => {
    const people: Person[] = [
      person({ id: 'a', birthDate: '1820', deathDate: '1890', lastName: 'Andersen',
        birthPlace: 'Odense, Denmark', occupations: ['Farmer'] }),
      person({ id: 'b', birthDate: '1850', deathDate: '1920', lastName: 'Andersen',
        birthPlace: 'Odense, Denmark', occupations: ['Farmer', 'Blacksmith'] }),
      person({ id: 'c', birthDate: '1880', deathDate: '1950', lastName: 'Nielsen',
        birthPlace: 'Copenhagen, Denmark', occupations: ['Sailor'] }),
    ];
    const rels: Relationship[] = [rel('r1', 'bio_father', 'a', 'b'), rel('r2', 'bio_father', 'b', 'c')];
    const stats = summarizeFamily(people, rels);

    expect(stats.personCount).toBe(3);
    expect(stats.earliestBirthYear).toBe(1820);
    expect(stats.latestDeathYear).toBe(1950);
    expect(stats.topSurnames[0]).toBe('Andersen');
    expect(stats.topSurnames).toContain('Nielsen');
    expect(stats.topOccupations[0]).toBe('Farmer');
    expect(stats.topPlaces[0]).toBe('Odense, Denmark');
    expect(stats.generationDepth).toBe(2); // a → b → c
  });

  it('handles an empty population', () => {
    const stats = summarizeFamily([], []);
    expect(stats.personCount).toBe(0);
    expect(stats.earliestBirthYear).toBeNull();
    expect(stats.generationDepth).toBe(0);
  });
});

describe('buildChapterFacts', () => {
  it('assembles spouses, parents, children, and siblings', () => {
    const people: Person[] = [
      person({ id: 'me', firstName: 'Self', birthDate: '1850' }),
      person({ id: 'spouse', firstName: 'Partner' }),
      person({ id: 'dad', firstName: 'Dad' }),
      person({ id: 'mom', firstName: 'Mom' }),
      person({ id: 'kid1', firstName: 'Child1' }),
      person({ id: 'sib', firstName: 'Sibling' }),
    ];
    const rels: Relationship[] = [
      rel('m', 'marriage', 'me', 'spouse'),
      rel('fd', 'bio_father', 'dad', 'me'),
      rel('fm', 'bio_mother', 'mom', 'me'),
      rel('c1', 'bio_father', 'me', 'kid1'),
      rel('s1', 'bio_father', 'dad', 'sib'), // shared parent → sibling
    ];
    const maps = buildRelationshipMaps(rels);
    const facts = buildChapterFacts(people[0], people, maps);

    expect(facts.birthYear).toBe(1850);
    expect(facts.spouseNames).toEqual(['Partner']);
    expect(facts.parentNames.sort()).toEqual(['Dad', 'Mom']);
    expect(facts.childNames).toEqual(['Child1']);
    expect(facts.siblingNames).toEqual(['Sibling']);
  });

  it('separates formal spouses (marriage) from unmarried partners', () => {
    const people: Person[] = [
      person({ id: 'me', firstName: 'Self' }),
      person({ id: 'wife', firstName: 'Wife' }),
      person({ id: 'partner', firstName: 'Partner' }),
    ];
    const rels: Relationship[] = [
      rel('m', 'marriage', 'me', 'wife'),
      rel('p', 'partner', 'me', 'partner'),
    ];
    const maps = buildRelationshipMaps(rels);
    const facts = buildChapterFacts(people[0], people, maps);

    expect(facts.spouseNames).toEqual(['Wife']);
    expect(facts.partnerNames).toEqual(['Partner']);
  });

  it('includes compact life events and the source count (M7 richer inputs)', () => {
    const events: PersonEvent[] = [
      { id: 'e1', type: 'Residence', date: '1880', place: 'Copenhagen' },
      { id: 'e2', type: 'Military', description: 'Hussar, 1870–1872' },
      { id: 'e3', type: '   ', description: '  ' }, // no usable content — dropped
    ];
    const sources = [{ id: 's1' }, { id: 's2' }] as unknown as Source[];
    const me = person({ id: 'me', firstName: 'Self', events, sources });
    const facts = buildChapterFacts(me, [me], buildRelationshipMaps([]));

    expect(facts.events).toEqual([
      { type: 'Residence', label: 'Residence · Copenhagen · 1880' },
      { type: 'Military', label: 'Military · Hussar, 1870–1872' },
    ]);
    expect(facts.sourceCount).toBe(2);
  });

  it('has empty events and zero sources when none are recorded', () => {
    const me = person({ id: 'me', firstName: 'Self' });
    const facts = buildChapterFacts(me, [me], buildRelationshipMaps([]));
    expect(facts.events).toEqual([]);
    expect(facts.sourceCount).toBe(0);
  });
});

describe('planBook', () => {
  it('builds one overview + one person chapter per selected person, facts filled, narratives empty', () => {
    const people: Person[] = [
      person({ id: 'a', firstName: 'A', lastName: 'Andersen', birthDate: '1820', deathDate: '1890',
        birthPlace: 'Odense, Denmark', occupations: ['Farmer'] }),
      person({ id: 'b', firstName: 'B', lastName: 'Andersen', birthDate: '1850' }),
    ];
    const rels: Relationship[] = [rel('r1', 'bio_father', 'a', 'b')];

    const plan = planBook({ name: 'Andersen Tree' }, people, rels, {
      scope: 'all',
      style: 'narrative',
      length: 'medium',
      language: 'en',
    });

    expect(plan.title).toBe('Andersen Family History');
    expect(plan.subtitle).toContain('Andersen Tree');
    expect(plan.subtitle).toContain('1820–1890');
    expect(plan.statistics.personCount).toBe(2);

    expect(plan.chapters).toHaveLength(3);
    expect(plan.chapters[0].kind).toBe('overview');
    expect(plan.chapters[0].narrative).toBe('');

    const personChapters = plan.chapters.filter((c) => c.kind === 'person');
    expect(personChapters.map((c) => c.personId)).toEqual(['a', 'b']);
    expect(personChapters[0].facts?.birthYear).toBe(1820);
    expect(personChapters[0].facts?.occupations).toEqual(['Farmer']);
    expect(personChapters[0].facts?.childNames).toEqual(['B Andersen']); // 'a' is parent of 'b'
    // narratives are empty until the AI/fallback composer fills them
    expect(personChapters.every((c) => c.narrative === '')).toBe(true);
  });

  it('falls back to "Family" when no surnames are present', () => {
    const plan = planBook(null, [person({ id: 'a', firstName: 'Anon' })], [], {
      scope: 'all',
      style: 'narrative',
      length: 'medium',
      language: 'en',
    });
    expect(plan.title).toBe('Family History');
    expect(plan.chapters[0].title).toBe('Our Family');
  });
});

describe('book language', () => {
  it('localizes the title and overview heading (Danish by default for this product)', () => {
    const plan = planBook(
      { name: 'Andersen Tree' },
      [person({ id: 'a', firstName: 'A', lastName: 'Andersen', birthDate: '1820' })],
      [],
      { scope: 'all', style: 'narrative', length: 'medium', language: 'da' }
    );
    expect(plan.title).toBe('Andersen-slægtens historie');
    expect(plan.chapters[0].title).toBe('Andersen-slægten');
    expect(plan.subtitle).toContain('En slægtskrønike');
  });

  it('keeps English titles for language "en"', () => {
    const plan = planBook(
      { name: 'Andersen Tree' },
      [person({ id: 'a', firstName: 'A', lastName: 'Andersen', birthDate: '1820' })],
      [],
      { scope: 'all', style: 'narrative', length: 'medium', language: 'en' }
    );
    expect(plan.title).toBe('Andersen Family History');
    expect(plan.chapters[0].title).toBe('The Andersen Family');
  });

  it('uses Scandinavian hundreds-form era labels (1800-tallet) vs English ordinal centuries', () => {
    expect(bookStrings('da').eraLabel(1850)).toBe('midten af 1800-tallet');
    expect(bookStrings('sv').eraLabel(1728)).toBe('början av 1700-talet');
    expect(bookStrings('no').eraLabel(1900)).toBe('begynnelsen av 1900-tallet');
    expect(bookStrings('en').eraLabel(1850)).toBe('mid 19th century');
  });

  it('localizes deterministic chrome strings', () => {
    expect(bookStrings('da').contents).toBe('Indhold');
    expect(bookStrings('da').lives(3)).toBe('3 liv');
    expect(bookStrings('sv').contents).toBe('Innehåll');
    expect(bookStrings('no').contents).toBe('Innhold');
  });
});

describe('personBiographySignature', () => {
  const person = { id: 'p1', firstName: 'Karen', lastName: 'Nielsdatter', gender: 'F', birthDate: '1728', deathDate: '1761' } as unknown as Person;
  const facts: BookChapterFacts = { birthYear: 1728, deathYear: 1761, occupations: ['Farmer'], spouseNames: ['Niels Olsen'] };
  const opts: Pick<BookGenerationOptions, 'style' | 'length' | 'language'> = { style: 'narrative', length: 'medium', language: 'da' };

  it('is stable for identical inputs', () => {
    expect(personBiographySignature(person, facts, opts)).toBe(personBiographySignature(person, facts, opts));
  });

  it('changes when a vital, fact, media count, or option changes', () => {
    const base = personBiographySignature(person, facts, opts);
    expect(personBiographySignature({ ...person, deathDate: '1762' }, facts, opts)).not.toBe(base);
    expect(personBiographySignature(person, { ...facts, occupations: ['Smith'] }, opts)).not.toBe(base);
    expect(personBiographySignature(person, facts, { ...opts, language: 'en' })).not.toBe(base);
    expect(personBiographySignature(person, facts, { ...opts, style: 'scholarly' })).not.toBe(base);
    expect(personBiographySignature(person, facts, opts, { mediaCount: 2 })).not.toBe(base);
  });
});

describe('shouldReuseBiography', () => {
  const bio = (overrides: Partial<PersonBiography>): PersonBiography => ({
    personId: 'p1',
    language: 'da',
    narrative: 'A life remembered.',
    signature: 'sig-1',
    isManual: false,
    ...overrides,
  });

  it('reuses a matching AI biography that has not changed', () => {
    expect(shouldReuseBiography(bio({ signature: 'sig-1' }), 'sig-1', false)).toBe(true);
  });

  it('regenerates an AI biography when the signature no longer matches', () => {
    expect(shouldReuseBiography(bio({ signature: 'sig-1' }), 'sig-2', false)).toBe(false);
  });

  it('regenerates when forceRegenerate is set (even with a matching signature)', () => {
    expect(shouldReuseBiography(bio({ signature: 'sig-1' }), 'sig-1', true)).toBe(false);
  });

  it('does not reuse an empty narrative', () => {
    expect(shouldReuseBiography(bio({ narrative: '   ', signature: 'sig-1' }), 'sig-1', false)).toBe(false);
  });

  it('always reuses a manual (human-edited) biography, even when stale', () => {
    // signature mismatch + forceRegenerate must not destroy curated human work.
    expect(shouldReuseBiography(bio({ isManual: true, signature: 'old' }), 'new', false)).toBe(true);
    expect(shouldReuseBiography(bio({ isManual: true, signature: 'old' }), 'new', true)).toBe(true);
  });

  it('does not treat a manual biography with empty narrative as reusable', () => {
    expect(shouldReuseBiography(bio({ isManual: true, narrative: '', signature: 'sig-1' }), 'sig-1', false)).toBe(false);
  });
});

describe('chapter editing helpers', () => {
  const ch = (title: string): BookChapter => ({ kind: 'person', title, narrative: '' });
  const list = () => [ch('A'), ch('B'), ch('C')];

  it('moveChapter swaps a chapter with its neighbour', () => {
    expect(moveChapter(list(), 0, 1).map((c) => c.title)).toEqual(['B', 'A', 'C']);
    expect(moveChapter(list(), 2, -1).map((c) => c.title)).toEqual(['A', 'C', 'B']);
  });

  it('moveChapter is a no-op at the array edges (and returns the same reference)', () => {
    const original = list();
    expect(moveChapter(original, 0, -1)).toBe(original);
    expect(moveChapter(original, 2, 1)).toBe(original);
    expect(moveChapter(original, 5, -1)).toBe(original);
  });

  it('removeChapter drops the chapter at the index', () => {
    expect(removeChapter(list(), 1).map((c) => c.title)).toEqual(['A', 'C']);
  });

  it('removeChapter is a no-op for an out-of-range index', () => {
    const original = list();
    expect(removeChapter(original, 9)).toBe(original);
  });

  it('createCustomChapter makes an empty custom chapter', () => {
    expect(createCustomChapter('Intro')).toEqual({ kind: 'custom', title: 'Intro', narrative: '' });
    expect(createCustomChapter().kind).toBe('custom');
  });
});
