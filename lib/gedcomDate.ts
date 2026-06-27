// Lossless GEDCOM date parsing — the structured-date spine (roadmap H/P1, foundation for roadmap I).
//
// Genealogy dates are fuzzy: "ABT 1807", "BET 1800 AND 1805", "FROM 1880 TO 1890", "30 FEB 1712"
// (a real Swedish-calendar date), "1700 B.C.", or a free-text phrase. Until now the app treated them
// as opaque strings and extracted a year with a \d{4} regex — losing the qualifier, range bounds,
// and the calendar. This module interprets GEDCOM 5.5.1 / 7 date syntax into a structured form while
// ALWAYS preserving the verbatim raw text, so nothing is silently coerced and round-trip is exact.
//
// Pure (no I/O) so it is fully unit-testable. `representativeYear` is intentionally the range *start*
// (yearFrom) so adopting it in extractBirthYear preserves that helper's long-standing behavior while
// exposing the richer structure (qualifier / range / calendar / BCE / phrase) to new callers.

export type DateCalendar = 'GREGORIAN' | 'JULIAN' | 'FRENCH_R' | 'HEBREW';

export type DateQualifier =
  | 'about' // ABT
  | 'calculated' // CAL
  | 'estimated' // EST
  | 'before' // BEF
  | 'after' // AFT
  | 'between' // BET ... AND ...
  | 'from' // FROM ...
  | 'to' // TO ...
  | 'from-to' // FROM ... TO ...
  | 'exact'; // no modifier

export interface StructuredDate {
  raw: string; // verbatim input — never coerced; round-trip exact
  calendar: DateCalendar; // detected (GREGORIAN is the default when nothing else is signaled)
  qualifier: DateQualifier;
  /** Primary year, negative for BCE. For ranges this is the START (yearFrom) to match legacy
   *  extractBirthYear; use yearFrom/yearTo for the bounds. */
  year: number | null;
  yearFrom?: number | null; // range start (BET/FROM)
  yearTo?: number | null; // range end (AND/TO)
  month?: number | null; // 1-based, when a month token is present
  day?: number | null;
  bce?: boolean;
  phrase?: string; // parenthesized interpretation / INT text
}

const GREGORIAN_MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
// French Republican calendar months (GEDCOM 5.5.1/7 VEND..COMP).
const FRENCH_MONTHS: Record<string, number> = {
  VEND: 1, BRUM: 2, FRIM: 3, NIVO: 4, PLUV: 5, VENT: 6,
  GERM: 7, FLOR: 8, PRAI: 9, MESS: 10, THER: 11, FRUC: 12, COMP: 13,
};
// Hebrew calendar months (GEDCOM TSH..AAV).
const HEBREW_MONTHS: Record<string, number> = {
  TSH: 1, CSH: 2, KSL: 3, TVT: 4, SHV: 5, ADR: 6, ADS: 7,
  NSN: 8, IYR: 9, SVN: 10, TMZ: 11, AAV: 12, ELL: 13,
};

const CALENDAR_KEYWORDS = new Set(['GREGORIAN', 'JULIAN', 'FRENCH_R', 'HEBREW']);

/** Parse a single GEDCOM date token like "12 MAR 1850", "1850", "1700 B.C.", "30 FEB 1712".
 *  Month names imply a calendar (French/Hebrew months → that calendar; else Gregorian, which Julian
 *  shares month names with — Julian must come from an explicit keyword). Returns null year only when
 *  no year can be found anywhere. */
const parseSingleDate = (token: string): {
  year: number | null;
  month?: number | null;
  day?: number | null;
  bce?: boolean;
  calendar?: DateCalendar;
} => {
  const cleaned = token.trim();
  if (!cleaned) return { year: null };

  // BCE / BC trailing marker (e.g. "1700 B.C.", "500 BC").
  const bceMatch = cleaned.match(/b\.?\s*c\.?\s*e?\.?|bce|b\.?\s*c\.?$/i);
  const withoutBce = bceMatch ? cleaned.slice(0, bceMatch.index).trim() : cleaned;
  const bce = !!bceMatch;

  let calendar: DateCalendar | undefined;
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  for (const part of withoutBce.split(/\s+/)) {
    const upper = part.toUpperCase().replace(/\.$/, '');
    if (upper in GREGORIAN_MONTHS) {
      month = GREGORIAN_MONTHS[upper];
      // Gregorian month names are shared with Julian — don't infer a calendar from them; the default
      // (GREGORIAN) or an explicit keyword wins. Only French/Hebrew month names are calendar-authoritative.
    } else if (upper in FRENCH_MONTHS) {
      month = FRENCH_MONTHS[upper];
      calendar = 'FRENCH_R';
    } else if (upper in HEBREW_MONTHS) {
      month = HEBREW_MONTHS[upper];
      calendar = 'HEBREW';
    } else {
      // A numeric token: day (1-31) or year. Dual-dating like "1880/81" → take 1880.
      const num = parseInt(part.split('/')[0], 10);
      if (!Number.isNaN(num)) {
        if (year === null && part.length >= 4) {
          year = num; // 4-digit (or longer) → year
        } else if (day === null && num >= 1 && num <= 31 && part.length < 3) {
          day = num; // 1-2 digit → day
        } else if (year === null) {
          year = num; // fallback: any remaining number is the year
        }
      }
    }
  }

  if (year === null) return { year: null };
  return { year: bce ? -Math.abs(year) : year, month, day, bce, calendar };
};

/** Last-resort year extraction from anywhere in the string (including a phrase), mirroring the legacy
 *  \d{4} regex so parseGedcomDate never returns less year info than the old helper. */
const fallbackYear = (s: string): number | null => {
  const m = s.match(/\d{3,4}/);
  return m ? parseInt(m[0], 10) : null;
};

/**
 * Interpret a GEDCOM date string into a lossless structured form. Always preserves `raw`. Handles
 * ABT/CAL/EST/BEF/AFT qualifiers, BET..AND and FROM..TO ranges, BCE, French/Hebrew month calendars
 * (and an explicit GREGORIAN/JULIAN keyword), and a parenthesized phrase. A `year` is always
 * populated when any plausible year exists in the input.
 */
export const parseGedcomDate = (raw: string | null | undefined): StructuredDate => {
  const text = (raw ?? '').trim();
  const base: StructuredDate = { raw: raw ?? '', calendar: 'GREGORIAN', qualifier: 'exact', year: null };

  if (!text) return base;

  // Pull a parenthesized phrase out of the working string but keep scanning the whole text for a year.
  const phraseMatch = text.match(/\(([^)]*)\)/);
  const phrase = phraseMatch ? phraseMatch[1].trim() : undefined;
  let working = phraseMatch ? text.slice(0, phraseMatch.index) + text.slice(phraseMatch.index! + phraseMatch[0].length) : text;
  working = working.trim();

  // Leading calendar keyword (GEDCOM 7): "JULIAN 3 MAR 1712".
  let calendar: DateCalendar = 'GREGORIAN';
  const calMatch = working.match(new RegExp(`^(${Array.from(CALENDAR_KEYWORDS).join('|')})\\b`, 'i'));
  if (calMatch) {
    calendar = calMatch[1].toUpperCase() as DateCalendar;
    working = working.slice(calMatch[0].length).trim();
  }

  const upper = working.toUpperCase();

  // FROM x TO y  (and the one-sided FROM / TO forms)
  const fromTo = upper.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/);
  if (fromTo) {
    const a = parseSingleDate(fromTo[1]);
    const b = parseSingleDate(fromTo[2]);
    if (a.calendar && a.calendar !== calendar) calendar = a.calendar;
    return {
      ...base,
      raw: raw ?? '',
      calendar,
      qualifier: 'from-to',
      year: a.year,
      yearFrom: a.year,
      yearTo: b.year,
      month: a.month,
      day: a.day,
      phrase,
    };
  }
  if (/^FROM\s+/.test(upper)) {
    const a = parseSingleDate(working.slice(4));
    if (a.calendar && a.calendar !== calendar) calendar = a.calendar;
    return { ...base, calendar, qualifier: 'from', year: a.year, yearFrom: a.year, phrase };
  }
  if (/^TO\s+/.test(upper)) {
    const a = parseSingleDate(working.slice(2));
    if (a.calendar && a.calendar !== calendar) calendar = a.calendar;
    return { ...base, calendar, qualifier: 'to', year: a.year, yearTo: a.year, phrase };
  }

  // BET x AND y
  const between = upper.match(/^BET\s+(.+?)\s+AND\s+(.+)$/);
  if (between) {
    const a = parseSingleDate(between[1]);
    const b = parseSingleDate(between[2]);
    if (a.calendar && a.calendar !== calendar) calendar = a.calendar;
    return {
      ...base,
      calendar,
      qualifier: 'between',
      year: a.year,
      yearFrom: a.year,
      yearTo: b.year,
      month: a.month,
      day: a.day,
      phrase,
    };
  }

  // Single-date qualifiers.
  const singleQualifier: Record<string, DateQualifier> = {
    ABT: 'about', CAL: 'calculated', EST: 'estimated', BEF: 'before', AFT: 'after',
  };
  const qMatch = upper.match(new RegExp(`^(${Object.keys(singleQualifier).join('|')})\\b`));
  if (qMatch) {
    const qualifier = singleQualifier[qMatch[1]];
    const parsed = parseSingleDate(working.slice(qMatch[0].length));
    if (parsed.calendar && parsed.calendar !== calendar) calendar = parsed.calendar;
    return {
      ...base, calendar, qualifier, year: parsed.year, month: parsed.month, day: parsed.day, bce: parsed.bce, phrase,
    };
  }

  // Plain date (or INT — interpreted, treated as exact + phrase).
  const parsed = parseSingleDate(working.replace(/^INT\s+/i, ''));
  if (parsed.calendar && parsed.calendar !== calendar) calendar = parsed.calendar;
  const year = parsed.year ?? fallbackYear(text);
  return {
    ...base, calendar, qualifier: 'exact', year, month: parsed.month, day: parsed.day, bce: parsed.bce, phrase,
  };
};

/** A single sortable year for a structured date. For ranges this is the START (yearFrom) to match the
 *  long-standing extractBirthYear behavior; use yearFrom/yearTo when you need the bounds. */
export const representativeYear = (d: StructuredDate): number | null =>
  d.yearFrom ?? d.yearTo ?? d.year;

/** Convenience: parse + representative year in one call. */
export const dateYear = (raw: string | null | undefined): number | null =>
  representativeYear(parseGedcomDate(raw));

const QUALIFIER_LABEL: Record<DateQualifier, string> = {
  about: 'about',
  calculated: 'calculated',
  estimated: 'estimated',
  before: 'before',
  after: 'after',
  between: 'between',
  from: 'from',
  to: 'to',
  'from-to': 'from–to',
  exact: '',
};

/** Human-readable rendering of the structured date (e.g. "about 1807", "between 1800 and 1805").
 *  Never throws; falls back to the raw text when structure is thin. */
export const formatStructuredDate = (d: StructuredDate): string => {
  if (d.qualifier === 'between' && d.yearFrom != null && d.yearTo != null) {
    return `between ${d.yearFrom} and ${d.yearTo}`;
  }
  if (d.qualifier === 'from-to' && d.yearFrom != null && d.yearTo != null) {
    return `${d.yearFrom}–${d.yearTo}`;
  }
  const prefix = QUALIFIER_LABEL[d.qualifier];
  if (d.year == null) return d.phrase || d.raw;
  return prefix ? `${prefix} ${d.year}` : `${d.year}`;
};
