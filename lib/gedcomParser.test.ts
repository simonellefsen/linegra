import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseGedcom, serializeGedcom } from './gedcomParser';
import { Person, Relationship, StructuredPlace, Source, Citation } from '../types';

const placeText = (place: unknown): string | undefined =>
  typeof place === 'string' ? place : (place as StructuredPlace | undefined)?.fullText;

describe('parseGedcom — synthetic records', () => {
  it('parses a single individual with vitals and places', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME John /Smith/',
      '1 SEX M',
      '1 BIRT',
      '2 DATE 12 MAR 1850',
      '2 PLAC London, England',
      '1 DEAT',
      '2 DATE 1910',
      '2 PLAC Boston, USA',
      '0 TRLR',
    ].join('\n');

    const { people, relationships, warnings } = parseGedcom(ged);

    expect(people).toHaveLength(1);
    const p = people[0];
    expect(p.firstName).toBe('John');
    expect(p.lastName).toBe('Smith');
    expect(p.gender).toBe('M');
    expect(p.birthDate).toBe('12 MAR 1850');
    expect(placeText(p.birthPlace)).toBe('London, England');
    expect(p.deathDate).toBe('1910');
    expect(placeText(p.deathPlace)).toBe('Boston, USA');
    expect(relationships).toHaveLength(0);
    expect(warnings).toEqual([]);
  });

  it('defaults an unknown SEX to "O"', () => {
    const ged = ['0 @I1@ INDI', '1 NAME A /B/', '1 SEX X'].join('\n');
    expect(parseGedcom(ged).people[0].gender).toBe('O');
  });

  it('derives marriage and parent relationships from a family', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME John /Smith/',
      '1 SEX M',
      '1 FAMS @F1@',
      '0 @I2@ INDI',
      '1 NAME Jane /Doe/',
      '1 SEX F',
      '1 FAMS @F1@',
      '0 @I3@ INDI',
      '1 NAME Kid /Smith/',
      '1 SEX M',
      '1 FAMC @F1@',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 CHIL @I3@',
      '1 MARR',
      '2 DATE 1872',
      '2 PLAC Chicago',
    ].join('\n');

    const { people, relationships } = parseGedcom(ged);
    expect(people).toHaveLength(3);

    const marriage = relationships.find((r) => r.type === 'marriage');
    expect(marriage).toBeDefined();
    expect(marriage?.personId).toBe('I1');
    expect(marriage?.relatedId).toBe('I2');
    expect(marriage?.date).toBe('1872');
    expect(marriage?.place).toBe('Chicago');

    const father = relationships.find((r) => r.type === 'bio_father');
    const mother = relationships.find((r) => r.type === 'bio_mother');
    expect(father).toMatchObject({ personId: 'I1', relatedId: 'I3' });
    expect(mother).toMatchObject({ personId: 'I2', relatedId: 'I3' });
  });

  it('captures an alternate name from _AKA', () => {
    const ged = ['0 @I1@ INDI', '1 NAME Robert /Jones/', '1 _AKA Bob /Jones/'].join('\n');
    const p = parseGedcom(ged).people[0];
    expect(p.alternateNames?.some((alt) => alt.firstName === 'Bob' && alt.lastName === 'Jones')).toBe(true);
  });

  it('warns about unsupported individual tags', () => {
    const ged = ['0 @I1@ INDI', '1 NAME A /B/', '1 ZZZZ mystery value'].join('\n');
    const { warnings } = parseGedcom(ged);
    expect(warnings.some((w) => w.includes('ZZZZ'))).toBe(true);
  });

  it('honors TNG _LIVING / _PRIVATE: tagged person is living+private', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME Anette Hass /Jensen/',
      '1 SEX F',
      '1 _LIVING Y',
      '1 _PRIVATE Y',
    ].join('\n');
    const p = parseGedcom(ged).people[0];
    expect(p.isLiving).toBe(true);
    expect(p.isPrivate).toBe(true);
  });

  it('treats absence of _LIVING as deceased when the export uses the tag (TNG-style)', () => {
    const ged = [
      '0 @I1@ INDI', '1 NAME Anette Hass /Jensen/', '1 SEX F', '1 _LIVING Y',
      '0 @I2@ INDI', '1 NAME Gammel /Forfader/', '1 SEX M', // no _LIVING => deceased
    ].join('\n');
    const { people } = parseGedcom(ged);
    expect(people.find((p) => p.lastName === 'Jensen')?.isLiving).toBe(true);
    expect(people.find((p) => p.lastName === 'Forfader')?.isLiving).toBe(false);
  });

  it('leaves isLiving unset for a GEDCOM that never uses _LIVING', () => {
    const ged = ['0 @I1@ INDI', '1 NAME Plain /Person/', '1 SEX M'].join('\n');
    expect(parseGedcom(ged).people[0].isLiving).toBeUndefined();
  });

  it('handles an empty document without throwing', () => {
    const { people, relationships, warnings } = parseGedcom('0 HEAD\n0 TRLR');
    expect(people).toEqual([]);
    expect(relationships).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('reports the GEDCOM version and reads multi-line CONC/CONT notes', () => {
    const ged = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Knud /Bloch/',
      '1 BIRT',
      '2 DATE 1591',
      '2 NOTE A long historical',
      '3 CONC  note about Knud',
      '3 CONT spanning lines.',
      '0 TRLR',
    ].join('\n');
    const { people, version } = parseGedcom(ged);
    expect(version).toBe('5.5.1');
    const note = people[0].notes?.[0]?.text || '';
    expect(note).toContain('A long historical note about Knud');
    expect(note).toContain('spanning lines.');
  });

  it('marks a person private from standard RESN (7.0) and TNG _PRIVATE', () => {
    const resn = parseGedcom('0 @I1@ INDI\n1 NAME A /B/\n1 RESN PRIVACY').people[0];
    expect(resn.isPrivate).toBe(true);
    const tng = parseGedcom('0 @I1@ INDI\n1 NAME A /B/\n1 _PRIVATE Y').people[0];
    expect(tng.isPrivate).toBe(true);
  });

  it('round-trips an exported 7.0 file (private + living preserved)', () => {
    const ged = serializeGedcom(
      [{ id: '1', firstName: 'A', lastName: 'B', gender: 'F', isPrivate: true, isLiving: true }] as unknown as Person[],
      [],
    );
    const p = parseGedcom(ged).people[0];
    expect(p.isPrivate).toBe(true);
    expect(p.isLiving).toBe(true);
    expect(parseGedcom(ged).version).toBe('7.0');
  });

  it('maps a cohabiting MARR.TYPE (COMMON LAW) to a partner union', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME A /X/',
      '1 FAMS @F1@',
      '0 @I2@ INDI',
      '1 NAME B /Y/',
      '1 FAMS @F1@',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 MARR',
      '2 TYPE COMMON LAW',
    ].join('\n');

    const partner = parseGedcom(ged).relationships.find((r) => r.type === 'partner');
    expect(partner).toMatchObject({ personId: 'I1', relatedId: 'I2' });
    // "COMMON LAW" is captured structurally, not echoed into the prose notes.
    expect(partner?.notes || '').not.toMatch(/common law/i);
  });

  it('keeps a formal marriage for other MARR.TYPE values (e.g. CIVIL)', () => {
    const ged = [
      '0 @I1@ INDI',
      '1 NAME A /X/',
      '1 FAMS @F1@',
      '0 @I2@ INDI',
      '1 NAME B /Y/',
      '1 FAMS @F1@',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 MARR',
      '2 TYPE CIVIL',
    ].join('\n');

    const rels = parseGedcom(ged).relationships;
    expect(rels.find((r) => r.type === 'partner')).toBeUndefined();
    const marriage = rels.find((r) => r.type === 'marriage');
    expect(marriage).toBeDefined();
    expect((marriage?.notes || '').toLowerCase()).toContain('civil');
  });
});

describe('serializeGedcom + round-trip', () => {
  const people = [
    {
      id: '1', firstName: 'John', lastName: 'Smith', gender: 'M',
      birthDate: '1850', birthPlace: { fullText: 'London' },
      deathDate: '1910', deathPlace: { fullText: 'Boston' },
    },
    { id: '2', firstName: 'Jane', lastName: 'Doe', gender: 'F' },
    { id: '3', firstName: 'Kid', lastName: 'Smith', gender: 'M' },
  ] as unknown as Person[];

  const relationships = [
    { id: 'm', type: 'marriage', personId: '1', relatedId: '2', date: '1872', place: 'Chicago' },
    { id: 'f', type: 'bio_father', personId: '1', relatedId: '3' },
    { id: 'mo', type: 'bio_mother', personId: '2', relatedId: '3' },
  ] as unknown as Relationship[];

  // Name-keyed fingerprint that ignores ids, so it survives the export's sequential xref ids.
  const fingerprint = (result: ReturnType<typeof parseGedcom>) => {
    const nameOf = new Map(result.people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    const persons = result.people
      .map((p) => [p.firstName, p.lastName, p.gender, p.birthDate || '', placeText(p.birthPlace) || '', p.deathDate || '', placeText(p.deathPlace) || ''].join('|'))
      .sort();
    const rels = result.relationships
      .map((r) => `${r.type}:${nameOf.get(r.personId)}->${nameOf.get(r.relatedId)}`)
      .sort();
    return { persons, rels };
  };

  it('emits a valid GEDCOM 7.0 HEAD with INDI and FAM records', () => {
    const ged = serializeGedcom(people, relationships);
    expect(ged.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
    expect(ged).toContain('0 HEAD');
    expect(ged).toContain('2 VERS 7.0');
    expect(ged).toContain('1 SCHMA');
    expect(ged).toContain('2 TAG _LIVING https://linegra.app/terms/v1/LIVING');
    expect(ged).toContain('0 @I1@ INDI');
    expect(ged).toContain('1 UID 1'); // internal id preserved
    expect(ged).toContain('1 NAME John /Smith/');
    expect(ged).toContain('2 GIVN John');
    expect(ged).toContain('2 SURN Smith');
    expect(ged).toContain('1 HUSB @I1@');
    expect(ged).toContain('1 WIFE @I2@');
    expect(ged).toContain('1 CHIL @I3@');
    expect(ged).toContain('0 TRLR');
    expect(ged).not.toContain(' CONC '); // 7.0 forbids CONC
  });

  it('upper-cases dates for GEDCOM 7 compliance', () => {
    const ged = serializeGedcom(
      [{ id: '1', firstName: 'A', lastName: 'B', gender: 'M', birthDate: '9 Jul 1903' }] as unknown as Person[],
      [],
    );
    expect(ged).toContain('2 DATE 9 JUL 1903');
    expect(ged).not.toContain('2 DATE 9 Jul 1903');
  });

  it('round-trips person vitals (export -> parse)', () => {
    const { people: out } = parseGedcom(serializeGedcom(people, relationships));
    expect(out).toHaveLength(3);
    const john = out.find((p) => p.firstName === 'John');
    expect(john).toMatchObject({ lastName: 'Smith', gender: 'M', birthDate: '1850', deathDate: '1910' });
    expect(placeText(john?.birthPlace)).toBe('London');
    expect(placeText(john?.deathPlace)).toBe('Boston');
  });

  it('round-trips marriage and parent relationships', () => {
    const { relationships: rels } = parseGedcom(serializeGedcom(people, relationships));
    // Export assigns sequential xref ids @I1@/@I2@/@I3@ → re-import ids I1/I2/I3.
    expect(rels.find((r) => r.type === 'marriage' && r.personId === 'I1' && r.relatedId === 'I2')).toMatchObject({ date: '1872', place: 'Chicago' });
    expect(rels.find((r) => r.type === 'bio_father' && r.personId === 'I1' && r.relatedId === 'I3')).toBeDefined();
    expect(rels.find((r) => r.type === 'bio_mother' && r.personId === 'I2' && r.relatedId === 'I3')).toBeDefined();
  });

  it('preserves structure across a second round-trip (no data loss)', () => {
    const once = parseGedcom(serializeGedcom(people, relationships));
    const twice = parseGedcom(serializeGedcom(once.people, once.relationships));
    expect(fingerprint(twice)).toEqual(fingerprint(once));
  });

  it('exports a partner union as a FAM with MARR.TYPE COMMON LAW', () => {
    const partnerPeople = [
      { id: '1', firstName: 'A', lastName: 'X', gender: 'M' },
      { id: '2', firstName: 'B', lastName: 'Y', gender: 'F' },
    ] as unknown as Person[];
    const partnerRels = [{ id: 'p', type: 'partner', personId: '1', relatedId: '2' }] as unknown as Relationship[];

    const ged = serializeGedcom(partnerPeople, partnerRels);
    expect(ged).toContain('0 @F1@ FAM');
    expect(ged).toContain('1 MARR');
    expect(ged).toContain('2 TYPE COMMON LAW');
  });

  it('round-trips a partner union (export -> parse -> export) without loss', () => {
    const partnerPeople = [
      { id: '1', firstName: 'A', lastName: 'X', gender: 'M' },
      { id: '2', firstName: 'B', lastName: 'Y', gender: 'F' },
    ] as unknown as Person[];
    const partnerRels = [{ id: 'p', type: 'partner', personId: '1', relatedId: '2' }] as unknown as Relationship[];

    const once = parseGedcom(serializeGedcom(partnerPeople, partnerRels));
    expect(once.relationships.find((r) => r.type === 'partner')).toMatchObject({ personId: 'I1', relatedId: 'I2' });
    const twice = parseGedcom(serializeGedcom(once.people, once.relationships));
    expect(twice.relationships.find((r) => r.type === 'partner')).toMatchObject({ personId: 'I1', relatedId: 'I2' });
  });

  it('exports a shared source as one SOUR record cited under multiple events', () => {
    const sharedSource = { id: 's1', externalId: 's1', title: 'Dødsannonce', type: 'Newspaper' } as Source;
    const srcPeople = [
      {
        id: '1', firstName: 'Gunner', lastName: 'Jakobsen', gender: 'M',
        deathDate: '1950', burialDate: '1950',
        sources: [sharedSource],
        citations: [
          { id: 'c1', sourceId: 's1', eventLabel: 'Death' } as Citation,
          { id: 'c2', sourceId: 's1', eventLabel: 'Burial', page: 'p. 2' } as Citation,
        ],
      } as unknown as Person,
    ];
    const ged = serializeGedcom(srcPeople, []);
    // exactly one shared source record, carrying the title
    expect((ged.match(/0 @S\d@ SOUR/g) || []).length).toBe(1);
    expect(ged).toContain('1 TITL Dødsannonce');
    // cited under both death and burial (not duplicated at the person level)
    const deatBlock = ged.slice(ged.indexOf('1 DEAT'), ged.indexOf('1 BURI'));
    const buriBlock = ged.slice(ged.indexOf('1 BURI'), ged.indexOf('0 TRLR'));
    expect(deatBlock).toContain('2 SOUR @S1@');
    expect(buriBlock).toContain('2 SOUR @S1@');
    expect(buriBlock).toContain('3 PAGE p. 2');
    expect(ged.match(/\n1 SOUR @S1@/)).toBeNull();
  });

  it('attaches sources at the person level when no event citations are present', () => {
    const ged = serializeGedcom(
      [
        {
          id: '1', firstName: 'A', lastName: 'B', gender: 'M',
          sources: [{ id: 's1', externalId: 's1', title: 'Census 1880', type: 'Census' } as Source],
        } as unknown as Person,
      ],
      []
    );
    expect(ged).toContain('0 @S1@ SOUR');
    expect(ged).toContain('1 TITL Census 1880');
    expect(ged.match(/\n1 SOUR @S1@/)).not.toBeNull();
  });

  it('round-trips a shared source + its event citations (export -> import)', () => {
    const sharedSource = { id: 's1', externalId: 's1', title: 'Dødsannonce', type: 'Newspaper' } as Source;
    const srcPeople = [
      {
        id: '1', firstName: 'Gunner', lastName: 'Jakobsen', gender: 'M',
        deathDate: '1950', burialDate: '1950',
        sources: [sharedSource],
        citations: [
          { id: 'c1', sourceId: 's1', eventLabel: 'Death' } as Citation,
          { id: 'c2', sourceId: 's1', eventLabel: 'Burial' } as Citation,
        ],
      } as unknown as Person,
    ];
    const parsed = parseGedcom(serializeGedcom(srcPeople, []));
    const person = parsed.people[0];
    // the source survives (title preserved)
    expect(person.sources?.some((s) => /Dødsannonce/.test(s.title || ''))).toBe(true);
    // both event citations come back
    const labels = (person.citations || []).map((c) => c.eventLabel).sort();
    expect(labels).toEqual(['Burial', 'Death']);
  });
});

// Real-world fixtures are gitignored (*.ged), so they exist only on a developer's
// machine. Parse whatever is present in the repo root as a smoke test; skip cleanly
// in CI / Vercel where the files are absent so the build gate stays green.
const repoRoot = process.cwd();
const gedFixtures = fs
  .readdirSync(repoRoot)
  .filter((name) => name.toLowerCase().endsWith('.ged'))
  .map((name) => path.join(repoRoot, name));

describe.skipIf(gedFixtures.length === 0)('parseGedcom — real .ged fixtures (local only)', () => {
  it.each(gedFixtures)('parses %s without throwing and yields people', (file) => {
    const text = fs.readFileSync(file, 'utf8');
    const result = parseGedcom(text);
    expect(Array.isArray(result.people)).toBe(true);
    expect(Array.isArray(result.relationships)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.people.length).toBeGreaterThan(0);
    // Every relationship must reference real person ids that were parsed.
    const ids = new Set(result.people.map((p) => p.id));
    for (const rel of result.relationships) {
      expect(ids.has(rel.personId)).toBe(true);
      expect(ids.has(rel.relatedId)).toBe(true);
    }
  });

  // Export is lossy and normalizing (only names/sex/birth/death/marriage/children survive, and
  // a child of a 2-parent family always gets both parent links back). So relationship *count*
  // is not a round-trip invariant — but every INDI is re-emitted, so **person count is
  // preserved**, and every relationship still references a real person. Capped to smaller
  // fixtures to keep the local run snappy (big files are covered by the parse smoke test above).
  const roundTripFixtures = gedFixtures.filter((f) => fs.statSync(f).size < 1_500_000);
  it.each(roundTripFixtures)('round-trips %s preserving person count and referential integrity', (file) => {
    const r1 = parseGedcom(fs.readFileSync(file, 'utf8'));
    const r2 = parseGedcom(serializeGedcom(r1.people, r1.relationships));
    expect(r2.people.length).toBe(r1.people.length);
    const ids = new Set(r2.people.map((p) => p.id));
    for (const rel of r2.relationships) {
      expect(ids.has(rel.personId)).toBe(true);
      expect(ids.has(rel.relatedId)).toBe(true);
    }
  });
});

describe('UID / EXID / REFN round-trip (H/P1)', () => {
  it('captures UID, EXID (+TYPE), and REFN (+TYPE) into person metadata on import', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME Anne /Bee/',
      '1 UID 7f3c2e1a-1234-4abc-9def-000000000001',
      '1 EXID ABC-123',
      '2 TYPE familysearch',
      '1 EXID SECOND',
      '1 REFN 42',
      '2 TYPE church',
      '0 TRLR',
    ].join('\n');
    const p = parseGedcom(ged).people[0];
    expect(p.metadata?.gedcomUid).toBe('7f3c2e1a-1234-4abc-9def-000000000001');
    expect(p.metadata?.exids).toEqual([
      { value: 'ABC-123', type: 'familysearch' },
      { value: 'SECOND' },
    ]);
    expect(p.metadata?.refns).toEqual([{ value: '42', type: 'church' }]);
  });

  it('emits the captured UID on export (not the internal id)', () => {
    const ged = serializeGedcom(
      [{ id: 'internal-1', firstName: 'A', lastName: 'B', gender: 'F', metadata: { gedcomUid: 'ORIGINAL-UID' } } as unknown as Person],
      [],
    );
    expect(ged).toContain('1 UID ORIGINAL-UID');
    expect(ged).not.toContain('1 UID internal-1');
  });

  it('falls back to the internal id as UID when no captured UID exists', () => {
    const ged = serializeGedcom(
      [{ id: 'internal-9', firstName: 'A', lastName: 'B', gender: 'M' } as unknown as Person],
      [],
    );
    expect(ged).toContain('1 UID internal-9');
  });

  it('emits EXID (+TYPE) and REFN (+TYPE)', () => {
    const ged = serializeGedcom(
      [{
        id: '1', firstName: 'A', lastName: 'B', gender: 'F',
        metadata: {
          exids: [{ value: 'X1', type: 'myheritage' }, { value: 'X2' }],
          refns: [{ value: '99', type: 'census' }],
        },
      } as unknown as Person],
      [],
    );
    expect(ged).toContain('1 EXID X1');
    expect(ged).toContain('2 TYPE myheritage');
    expect(ged).toContain('1 EXID X2');
    expect(ged).toContain('1 REFN 99');
    expect(ged).toContain('2 TYPE census');
  });

  it('round-trips identifiers through export -> parse', () => {
    const original = [{
      id: '1', firstName: 'A', lastName: 'B', gender: 'F',
      metadata: {
        gedcomUid: 'UID-KEEP',
        exids: [{ value: 'EXT', type: 'ancestry' }],
        refns: [{ value: '7' }],
      },
    } as unknown as Person];
    const reparsed = parseGedcom(serializeGedcom(original, [])).people[0];
    expect(reparsed.metadata?.gedcomUid).toBe('UID-KEEP');
    expect(reparsed.metadata?.exids).toEqual([{ value: 'EXT', type: 'ancestry' }]);
    expect(reparsed.metadata?.refns).toEqual([{ value: '7' }]);
  });
});

describe('NAME TYPE / NICK / alternate-name round-trip (H/P1)', () => {
  it('captures NAME.TYPE and NICK on import (instead of hard-coding "Also Known As")', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME First /Last/',
      '2 NICK Bud',
      '1 NAME First /Married/',
      '2 TYPE married',
      '1 NAME First /Other/',
      '2 TYPE aka',
      '0 TRLR',
    ].join('\n');
    const p = parseGedcom(ged).people[0];
    expect(p.firstName).toBe('First');
    expect(p.lastName).toBe('Last');
    expect(p.alternateNames).toEqual([
      { type: 'Nickname', firstName: 'Bud', lastName: '' },
      { type: 'Married Name', firstName: 'First', lastName: 'Married' },
      { type: 'Also Known As', firstName: 'First', lastName: 'Other' },
    ]);
  });

  it('emits alternate names as NAME + TYPE on export', () => {
    const ged = serializeGedcom(
      [{
        id: '1', firstName: 'A', lastName: 'B', gender: 'F',
        alternateNames: [
          { type: 'Married Name', firstName: 'A', lastName: 'C' },
          { type: 'Nickname', firstName: 'Bob', lastName: '' },
        ],
      } as unknown as Person],
      [],
    );
    expect(ged).toContain('1 NAME A /C/');
    expect(ged).toContain('2 TYPE married');
    expect(ged).toContain('2 TYPE nickname');
  });

  it('round-trips alternate names with their type (export -> parse)', () => {
    const original = [{
      id: '1', firstName: 'A', lastName: 'B', gender: 'F',
      alternateNames: [{ type: 'Married Name', firstName: 'A', lastName: 'C' }],
    } as unknown as Person];
    const reparsed = parseGedcom(serializeGedcom(original, [])).people[0];
    expect(reparsed.alternateNames).toEqual([{ type: 'Married Name', firstName: 'A', lastName: 'C' }]);
  });

  it('captures NAME.TRAN (transliteration) as an Anglicized Name alternate', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME Иван /Смирнов/',
      '2 TRAN Ivan /Smirnov/',
      '0 TRLR',
    ].join('\n');
    const p = parseGedcom(ged).people[0];
    expect(p.alternateNames).toEqual([{ type: 'Anglicized Name', firstName: 'Ivan', lastName: 'Smirnov' }]);
  });

  it('round-trips a transliterated name (export emits TYPE immigrant)', () => {
    const original = [{
      id: '1', firstName: 'A', lastName: 'B', gender: 'F',
      alternateNames: [{ type: 'Anglicized Name', firstName: 'Aw', lastName: 'Bw' }],
    } as unknown as Person];
    const ged = serializeGedcom(original, []);
    expect(ged).toContain('2 TYPE immigrant');
    const reparsed = parseGedcom(ged).people[0];
    expect(reparsed.alternateNames).toContainEqual({ type: 'Anglicized Name', firstName: 'Aw', lastName: 'Bw' });
  });
});

describe('event detail AGE / CAUS / AGNC (H/P1)', () => {
  it('routes DEAT.CAUS to person.deathCause', () => {
    const p = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 NAME A /B/\n1 DEAT\n2 DATE 1900\n2 CAUS Heart failure\n0 TRLR').people[0];
    expect(p.deathDate).toBe('1900');
    expect(p.deathCause).toBe('Heart failure');
  });

  it('captures AGE/CAUS/AGNC on a custom event into its metadata', () => {
    const p = parseGedcom(
      '0 HEAD\n0 @I1@ INDI\n1 NAME A /B/\n1 OCCU Blacksmith\n2 AGE 43y\n2 CAUS apprenticeship ended\n2 AGNC Guild of Smiths\n0 TRLR',
    ).people[0];
    const occu = p.events.find((e) => e.type === 'Occupation');
    expect(occu?.metadata).toMatchObject({ age: '43y', cause: 'apprenticeship ended', agency: 'Guild of Smiths' });
  });

  it('stores vital AGE on person.metadata (vitals have no event row)', () => {
    const p = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 NAME A /B/\n1 DEAT\n2 AGE 75y\n0 TRLR').people[0];
    expect(p.metadata?.deatAge).toBe('75y');
  });

  it('emits 2 CAUS for deathCause on export', () => {
    const ged = serializeGedcom(
      [{ id: '1', firstName: 'A', lastName: 'B', gender: 'M', deathDate: '1900', deathCause: 'Old age' } as unknown as Person],
      [],
    );
    expect(ged).toContain('1 DEAT');
    expect(ged).toContain('2 CAUS Old age');
  });

  it('round-trips deathCause through export -> parse', () => {
    const original = [{ id: '1', firstName: 'A', lastName: 'B', gender: 'M', deathDate: '1900', deathCause: 'Pneumonia' } as unknown as Person];
    const reparsed = parseGedcom(serializeGedcom(original, [])).people[0];
    expect(reparsed.deathCause).toBe('Pneumonia');
  });
});

describe('structured-date persistence (H/P1)', () => {
  it('persists the parsed StructuredDate for vitals into person.metadata on import', () => {
    const p = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 DATE ABT 1880\n1 DEAT\n2 DATE 1920\n0 TRLR').people[0];
    expect(p.metadata?.birthDateStructured).toMatchObject({ qualifier: 'about', year: 1880, calendar: 'GREGORIAN' });
    expect(p.metadata?.deathDateStructured).toMatchObject({ year: 1920 });
  });

  it('emits the GEDCOM 7 calendar keyword for non-Gregorian dates on export', () => {
    const ged = serializeGedcom(
      [{ id: '1', firstName: 'A', lastName: 'B', gender: 'M', deathDate: 'JULIAN 3 MAR 1712' } as unknown as Person],
      [],
    );
    expect(ged).toContain('2 DATE JULIAN 3 MAR 1712');
  });

  it('does not prefix Gregorian dates with a calendar keyword', () => {
    const ged = serializeGedcom(
      [{ id: '1', firstName: 'A', lastName: 'B', gender: 'M', birthDate: '12 MAR 1850' } as unknown as Person],
      [],
    );
    expect(ged).toMatch(/2 DATE 12 MAR 1850\b/);
  });

  it('round-trips a Julian date with its calendar (export -> parse)', () => {
    const original = [{ id: '1', firstName: 'A', lastName: 'B', gender: 'M', deathDate: 'JULIAN 3 MAR 1712' } as unknown as Person];
    const reparsed = parseGedcom(serializeGedcom(original, [])).people[0];
    expect(reparsed.metadata?.deathDateStructured).toMatchObject({ calendar: 'JULIAN', year: 1712 });
  });
});

describe('round-trip — events + full P1 person (H/P3)', () => {
  it('round-trips a non-vital event with DATE/PLAC/AGE/CAUS/AGNC (events were previously dropped on export)', () => {
    const original = [{
      id: '1', firstName: 'A', lastName: 'B', gender: 'M',
      events: [{
        id: 'e1', type: 'Occupation', date: '1900', place: { fullText: 'London' },
        description: 'Blacksmith', metadata: { age: '43y', cause: 'retirement', agency: 'Guild of Smiths' },
      }],
    } as unknown as Person];
    const reparsed = parseGedcom(serializeGedcom(original, [])).people[0];
    const occu = reparsed.events.find((e) => e.type === 'Occupation');
    expect(occu).toMatchObject({ date: '1900', description: 'Blacksmith' });
    expect(placeText(occu?.place)).toBe('London');
    expect(occu?.metadata).toMatchObject({ age: '43y', cause: 'retirement', agency: 'Guild of Smiths' });
  });

  it('round-trips a richly-populated person (all P1 fields) losslessly', () => {
    const original = [{
      id: '1', firstName: 'John', lastName: 'Smith', gender: 'M',
      birthDate: 'ABT 1850',
      deathDate: 'JULIAN 3 MAR 1910',
      deathCause: 'Old age',
      metadata: {
        gedcomUid: 'ORIG-UID',
        exids: [{ value: 'EXT', type: 'fs' }],
        refns: [{ value: '7' }],
      },
      alternateNames: [{ type: 'Also Known As', firstName: 'Jack', lastName: 'Smith' }],
    } as unknown as Person];
    const reparsed = parseGedcom(serializeGedcom(original, [])).people[0];
    expect(reparsed.firstName).toBe('John');
    expect(reparsed.birthDate).toBe('ABT 1850');
    expect(reparsed.deathDate).toBe('JULIAN 3 MAR 1910');
    expect(reparsed.deathCause).toBe('Old age');
    expect(reparsed.metadata?.gedcomUid).toBe('ORIG-UID');
    expect(reparsed.metadata?.exids).toEqual([{ value: 'EXT', type: 'fs' }]);
    expect(reparsed.metadata?.refns).toEqual([{ value: '7' }]);
    expect(reparsed.metadata?.birthDateStructured).toMatchObject({ qualifier: 'about', year: 1850 });
    expect(reparsed.metadata?.deathDateStructured).toMatchObject({ calendar: 'JULIAN', year: 1910 });
    expect(reparsed.alternateNames).toContainEqual({ type: 'Also Known As', firstName: 'Jack', lastName: 'Smith' });
  });
});

describe('SNOTE shared-note resolution (H/P2)', () => {
  it('resolves a 1 NOTE @N1@ pointer to the SNOTE text (forward reference)', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME John /Smith/',
      '1 NOTE @N1@',
      '0 @N1@ SNOTE This is a shared note',
      '0 TRLR',
    ].join('\n');
    const p = parseGedcom(ged).people[0];
    expect(p.notes).toHaveLength(1);
    expect(p.notes[0].text).toBe('This is a shared note');
  });

  it('shares one SNOTE across multiple people', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME A /X/',
      '1 NOTE @N1@',
      '0 @I2@ INDI',
      '1 NAME B /Y/',
      '1 NOTE @N1@',
      '0 @N1@ SNOTE Shared text',
      '0 TRLR',
    ].join('\n');
    const people = parseGedcom(ged).people;
    expect(people).toHaveLength(2);
    expect(people[0].notes[0].text).toBe('Shared text');
    expect(people[1].notes[0].text).toBe('Shared text');
  });

  it('preserves multi-line SNOTE text (CONT merged by the tokenizer)', () => {
    const ged = [
      '0 HEAD',
      '0 @N1@ SNOTE Line one',
      '1 CONT Line two',
      '0 @I1@ INDI',
      '1 NAME A /X/',
      '1 NOTE @N1@',
      '0 TRLR',
    ].join('\n');
    const p = parseGedcom(ged).people[0];
    expect(p.notes[0].text).toBe('Line one\nLine two');
  });

  it('leaves inline NOTE text untouched (no pointer)', () => {
    const p = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 NAME A /X/\n1 NOTE An inline note\n0 TRLR').people[0];
    expect(p.notes[0].text).toBe('An inline note');
  });

  it('drops an unresolved pointer silently (no crash)', () => {
    const p = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 NAME A /X/\n1 NOTE @MISSING@\n0 TRLR').people[0];
    expect(p.notes || []).toEqual([]);
  });
});

describe('ASSO associations (H/P2)', () => {
  it('captures 1 ASSO @x@ + 2 RELA into person.metadata.associations', () => {
    const ged = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME A /B/',
      '1 ASSO @I2@',
      '2 RELA God Father',
      '0 @I2@ INDI',
      '1 NAME C /D/',
      '0 TRLR',
    ].join('\n');
    const p = parseGedcom(ged).people[0];
    expect(p.metadata?.associations).toEqual([{ personId: 'I2', rela: 'God Father' }]);
  });

  it('emits 1 ASSO + 2 RELA on export (target in set)', () => {
    const ged = serializeGedcom(
      [
        { id: 'a', firstName: 'A', lastName: 'X', gender: 'M', metadata: { associations: [{ personId: 'b', rela: 'Witness' }] } },
        { id: 'b', firstName: 'B', lastName: 'Y', gender: 'F' },
      ] as unknown as Person[],
      [],
    );
    expect(ged).toContain('1 ASSO @I2@');
    expect(ged).toContain('2 RELA Witness');
  });

  it('round-trips associations (export -> parse)', () => {
    const original = [
      { id: 'a', firstName: 'A', lastName: 'X', gender: 'M', metadata: { associations: [{ personId: 'b', rela: 'God Father' }] } },
      { id: 'b', firstName: 'B', lastName: 'Y', gender: 'F' },
    ] as unknown as Person[];
    const reparsed = parseGedcom(serializeGedcom(original, [])).people;
    const a = reparsed.find((p) => p.firstName === 'A');
    // 'a'→@I1@, 'b'→@I2@; the ASSO target 'b' re-imports as xref id 'I2'.
    expect(a?.metadata?.associations).toEqual([{ personId: 'I2', rela: 'God Father' }]);
  });

  it('drops an ASSO whose target is not in the export set (no dangling ref)', () => {
    const ged = serializeGedcom(
      [{ id: 'a', firstName: 'A', lastName: 'X', gender: 'M', metadata: { associations: [{ personId: 'ghost', rela: 'Friend' }] } }] as unknown as Person[],
      [],
    );
    expect(ged).not.toContain('1 ASSO');
  });
});
