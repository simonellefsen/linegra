import { describe, it, expect } from 'vitest';
import { parseGedcomDate, representativeYear, dateYear, formatStructuredDate } from './gedcomDate';

describe('parseGedcomDate — exact dates', () => {
  it('parses day-month-year', () => {
    const d = parseGedcomDate('12 MAR 1850');
    expect(d.qualifier).toBe('exact');
    expect(d.year).toBe(1850);
    expect(d.month).toBe(3);
    expect(d.day).toBe(12);
    expect(d.calendar).toBe('GREGORIAN');
  });
  it('parses a bare year', () => {
    expect(parseGedcomDate('1923').year).toBe(1923);
  });
  it('preserves the raw text verbatim', () => {
    expect(parseGedcomDate('ABT 1807').raw).toBe('ABT 1807');
    expect(parseGedcomDate('  weird  ').raw).toBe('  weird  ');
  });
  it('preserves odd but real dates like 30 FEB 1712 (Swedish calendar) without rejecting them', () => {
    const d = parseGedcomDate('30 FEB 1712');
    expect(d.year).toBe(1712);
    expect(d.day).toBe(30);
    expect(d.month).toBe(2);
  });
});

describe('parseGedcomDate — qualifiers', () => {
  it('about / calculated / estimated', () => {
    expect(parseGedcomDate('ABT 1807')).toMatchObject({ qualifier: 'about', year: 1807 });
    expect(parseGedcomDate('CAL 1850')).toMatchObject({ qualifier: 'calculated', year: 1850 });
    expect(parseGedcomDate('EST 1850')).toMatchObject({ qualifier: 'estimated', year: 1850 });
  });
  it('before / after', () => {
    expect(parseGedcomDate('BEF 1900')).toMatchObject({ qualifier: 'before', year: 1900 });
    expect(parseGedcomDate('AFT 1850')).toMatchObject({ qualifier: 'after', year: 1850 });
  });
});

describe('parseGedcomDate — ranges', () => {
  it('BET ... AND ...', () => {
    const d = parseGedcomDate('BET 1800 AND 1805');
    expect(d.qualifier).toBe('between');
    expect(d.yearFrom).toBe(1800);
    expect(d.yearTo).toBe(1805);
    expect(d.year).toBe(1800); // start
  });
  it('FROM ... TO ...', () => {
    const d = parseGedcomDate('FROM 1880 TO 1890');
    expect(d.qualifier).toBe('from-to');
    expect(d.yearFrom).toBe(1880);
    expect(d.yearTo).toBe(1890);
  });
  it('one-sided FROM / TO', () => {
    expect(parseGedcomDate('FROM 1880')).toMatchObject({ qualifier: 'from', year: 1880 });
    expect(parseGedcomDate('TO 1890')).toMatchObject({ qualifier: 'to', year: 1890 });
  });
});

describe('parseGedcomDate — calendar + era', () => {
  it('detects an explicit JULIAN calendar keyword', () => {
    const d = parseGedcomDate('JULIAN 3 MAR 1712');
    expect(d.calendar).toBe('JULIAN');
    expect(d.year).toBe(1712);
  });
  it('infers FRENCH_R from a French month', () => {
    expect(parseGedcomDate('1 VEND 9')).toMatchObject({ calendar: 'FRENCH_R', month: 1 });
  });
  it('infers HEBREW from a Hebrew month', () => {
    expect(parseGedcomDate('TSH 5400')).toMatchObject({ calendar: 'HEBREW' });
  });
  it('flags BCE and negates the year', () => {
    const d = parseGedcomDate('1700 B.C.');
    expect(d.bce).toBe(true);
    expect(d.year).toBe(-1700);
  });
});

describe('parseGedcomDate — phrase + fallback', () => {
  it('extracts a parenthesized phrase while keeping the date', () => {
    const d = parseGedcomDate('12 MAR 1850 (christening)');
    expect(d.phrase).toBe('christening');
    expect(d.year).toBe(1850);
  });
  it('falls back to a year found anywhere (legacy parity)', () => {
    expect(parseGedcomDate('(about 1880)').year).toBe(1880);
  });
  it('returns null year and no throw for empty / junk', () => {
    expect(parseGedcomDate('').year).toBeNull();
    expect(parseGedcomDate(undefined).year).toBeNull();
    expect(parseGedcomDate('unknown').year).toBeNull();
  });
});

describe('representativeYear / dateYear', () => {
  it('uses the range start for ranges (legacy extractBirthYear parity)', () => {
    expect(representativeYear(parseGedcomDate('BET 1800 AND 1805'))).toBe(1800);
    expect(representativeYear(parseGedcomDate('FROM 1880 TO 1890'))).toBe(1880);
  });
  it('matches the old regex helper for the cases lifespan tests cover', () => {
    expect(dateYear('ABT 1807')).toBe(1807);
    expect(dateYear('12 MAR 1850')).toBe(1850);
    expect(dateYear('1923')).toBe(1923);
    expect(dateYear('BET 1800 AND 1805')).toBe(1800);
    expect(dateYear('')).toBeNull();
    expect(dateYear('unknown')).toBeNull();
  });
});

describe('formatStructuredDate', () => {
  it('renders qualifiers and ranges readably', () => {
    expect(formatStructuredDate(parseGedcomDate('ABT 1807'))).toBe('about 1807');
    expect(formatStructuredDate(parseGedcomDate('BET 1800 AND 1805'))).toBe('between 1800 and 1805');
    expect(formatStructuredDate(parseGedcomDate('FROM 1880 TO 1890'))).toBe('1880–1890');
    expect(formatStructuredDate(parseGedcomDate('1850'))).toBe('1850');
  });
});
