// Roadmap U16 — slug helpers for semantic public URLs (id8 is authoritative).

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DANISH_REPLACEMENTS: Array<[RegExp, string]> = [
  [/æ/g, 'ae'],
  [/ø/g, 'oe'],
  [/å/g, 'aa'],
  [/Æ/g, 'Ae'],
  [/Ø/g, 'Oe'],
  [/Å/g, 'Aa'],
];

export const isPublicUuid = (value: string | null | undefined): value is string =>
  !!value && UUID_REGEX.test(value);

export const transliterateDanish = (value: string): string =>
  DANISH_REPLACEMENTS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value);

export const slugifySegment = (value: string): string =>
  transliterateDanish(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const slugifyTreeName = (name: string): string => slugifySegment(name);

export const extractId8 = (uuid: string): string => uuid.replace(/-/g, '').slice(0, 8).toLowerCase();

export const extractBirthYear = (value?: string | null): string | null => {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? match[1] : null;
};

export interface PersonSlugInput {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
}

export const buildPersonSlugSegment = (person: PersonSlugInput): string => {
  const given = slugifySegment(person.firstName?.trim() || 'unknown');
  const surname = slugifySegment(person.lastName?.trim() || 'unknown');
  const year = extractBirthYear(person.birthDate);
  const id8 = extractId8(person.id);
  return [given, surname, year, id8].filter(Boolean).join('-');
};

/** Parse the trailing id8 (or id12) hex prefix from a person slug segment. */
export const parsePersonIdPrefix = (segment: string): string | null => {
  const match = segment.match(/([0-9a-f]{8,12})$/i);
  return match ? match[1]!.toLowerCase() : null;
};

export const formatLifespanSuffix = (input: {
  birthDate?: string | null;
  deathDate?: string | null;
}): string => {
  const birth = extractBirthYear(input.birthDate);
  const death = extractBirthYear(input.deathDate);
  if (birth && death) return ` (${birth}–${death})`;
  if (birth) return ` (b. ${birth})`;
  if (death) return ` (d. ${death})`;
  return '';
};

export const buildBookSlugSegment = (title: string, bookId: string): string => {
  const titleSlug = slugifySegment(title || 'book');
  return `${titleSlug}-${extractId8(bookId)}`;
};

export const parseBookIdPrefix = (segment: string): string | null => parsePersonIdPrefix(segment);
