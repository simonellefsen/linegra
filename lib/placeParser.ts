// Deterministic, dependency-free place parsing.
//
// Used as a graceful fallback for `parsePlaceString` (services/ai.ts) when the
// OpenRouter AI utility is unavailable or fails, and to backfill any fields the
// AI leaves empty. It is intentionally pure so it can be unit-tested.
//
// Assumption: comma-separated parts are ordered **most-specific first**
// (street/place → city → parish → hundred → county → state → country), which matches the GEDCOM
// PLAC convention and the most common genealogical free-text ordering. For the Scandinavian
// administrative hierarchy we recognize keywords (Sogn, Herred/Kommune, Amt, Region) so a Danish
// place like "Rosengade, Brædstrup, Ring Sogn, Tyrsting Herred, Skanderborg Amt, Danmark" lands
// each segment in the right field instead of collapsing them into city/county.

import { StructuredPlace } from '../types';

// Matches a trailing house number on a street line, e.g. "Hovedgaden 12B" => ["Hovedgaden", "12B"].
const STREET_HOUSE_NUMBER = /^(.*?\D)\s+(\d+[a-zA-Z]?)$/;

const splitStreet = (lead: string, result: Partial<StructuredPlace>): void => {
  const match = lead.match(STREET_HOUSE_NUMBER);
  if (match) {
    result.street = match[1].trim();
    result.houseNumber = match[2];
  } else {
    result.street = lead;
  }
};

// Keyword → field, matched as whole words (case-insensitive) against a comma segment.
const PARISH_RE = /\b(sogn|parish|församling|forsamling|sokn|sokn)\b/i;
const HUNDRED_RE = /\b(herred|härad|harad|hundred|kommune|kommun|municipality|borough)\b/i;
const COUNTY_RE = /\b(amt|county|fylke|l[aä]n|stift|diocese)\b/i;
const STATE_RE = /\b(region|state|province|provins|landsdel)\b/i;

const classifySegment = (
  segment: string,
  result: Partial<StructuredPlace>
): boolean => {
  if (PARISH_RE.test(segment)) {
    result.parish = segment;
    return true;
  }
  if (HUNDRED_RE.test(segment)) {
    result.hundred = segment;
    return true;
  }
  if (COUNTY_RE.test(segment)) {
    result.county = segment;
    return true;
  }
  if (STATE_RE.test(segment)) {
    result.state = segment;
    return true;
  }
  return false;
};

/**
 * Heuristically split a free-text place string into structured components.
 * Always returns a `fullText`; other fields are best-effort by position and keyword.
 */
export const deterministicParsePlace = (input: string): Partial<StructuredPlace> => {
  const fullText = (input ?? '').trim();
  const result: Partial<StructuredPlace> = { fullText };
  if (!fullText) return result;

  const parts = fullText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  switch (parts.length) {
    case 0:
      break;
    case 1:
      result.placeName = parts[0];
      break;
    case 2:
      [result.city, result.country] = parts;
      break;
    case 3:
      [result.city, result.state, result.country] = parts;
      break;
    case 4:
      [result.city, result.county, result.state, result.country] = parts;
      break;
    default: {
      // 5+ parts: the first segment is a street/place line. Classify the remaining segments by
      // Scandinavian keyword where possible; the leftover (unclassified) segments fill
      // city → county → state positionally, with the last one as the country.
      splitStreet(parts[0], result);
      const rest = parts.slice(1);
      const generals: string[] = [];
      rest.forEach((segment) => {
        if (!classifySegment(segment, result)) generals.push(segment);
      });
      if (generals.length) {
        result.country = generals[generals.length - 1];
        const middle = generals.slice(0, -1);
        if (middle.length >= 1 && !result.city) result.city = middle[0];
        if (middle.length >= 2 && !result.county) result.county = middle[1];
        if (middle.length >= 3 && !result.state) result.state = middle[2];
        if (middle.length >= 4 && !result.placeName) result.placeName = middle.slice(3).join(', ');
      }
      break;
    }
  }

  return result;
};

const PLACE_FIELDS: (keyof StructuredPlace)[] = [
  'placeName', 'street', 'houseNumber', 'floor', 'apartment',
  'city', 'parish', 'hundred', 'county', 'state', 'country', 'zip', 'historicalName', 'notes',
];

const isMeaningful = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : value != null;

/**
 * Merge a primary (e.g. AI) result over a fallback (e.g. deterministic) one:
 * the primary wins where it has a meaningful value, the fallback backfills gaps.
 * `fullText` is always forced to the canonical original input.
 */
export const mergeStructuredPlace = (
  fallback: Partial<StructuredPlace>,
  primary: Partial<StructuredPlace>,
  fullText: string,
): Partial<StructuredPlace> => {
  const merged: Partial<StructuredPlace> = { fullText: fullText.trim() };
  for (const field of PLACE_FIELDS) {
    const primaryValue = primary[field];
    const fallbackValue = fallback[field];
    const chosen = isMeaningful(primaryValue) ? primaryValue : fallbackValue;
    if (isMeaningful(chosen)) {
      (merged as Record<string, unknown>)[field] = chosen;
    }
  }
  // Preserve numeric coordinates if either side supplied them.
  for (const coord of ['lat', 'lng'] as const) {
    const value = isMeaningful(primary[coord]) ? primary[coord] : fallback[coord];
    if (typeof value === 'number' && Number.isFinite(value)) {
      merged[coord] = value;
    }
  }
  return merged;
};
