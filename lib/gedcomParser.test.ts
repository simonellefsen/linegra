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
