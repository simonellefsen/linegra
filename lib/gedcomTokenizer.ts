// GEDCOM line tokenizer (shared by the 5.x and 7.x import paths).
//
// Turns raw GEDCOM text into a flat list of structure lines, handling the grammar concerns that
// the higher-level mapper should not have to care about — per the FamilySearch GEDCOM 7.0 ABNF
// (`Line = Level D [Xref D] Tag [D LineVal] EOL`):
//   - strips a leading UTF-8 BOM (U+FEFF), required by 7.0;
//   - merges CONT (newline) and CONC (no separator) continuation lines into their parent's value,
//     so multi-line NOTE/TEXT payloads are no longer dropped (a real 5.5.1 bug);
//   - un-escapes doubled at-signs (`@@` → `@`) in text payloads (5.x doubled all, 7.0 only leading);
//   - keeps pointer payloads (`@X@`) intact and flags `@VOID@`;
//   - detects the document version from `HEAD.GEDC.VERS` (e.g. "5.5.1" vs "7.0").

export interface GedcomLine {
  level: number;
  /** This line's own cross-reference id in raw form, e.g. "@I1@" (the record id), if present. */
  xref?: string;
  /** Tag, upper-cased. Standard tags are letter-led; extension tags are underscore-led. */
  tag: string;
  /** Payload. Pointers kept as "@X@"; text payloads are `@@`-unescaped and may contain "\n". */
  value: string;
}

export interface TokenizedGedcom {
  /** Value of HEAD.GEDC.VERS, e.g. "5.5.1" or "7.0"; null if absent. */
  version: string | null;
  lines: GedcomLine[];
}

// Level, optional Xref, Tag (std letter-led or ext underscore-led), optional payload.
const LINE_RE = /^(\d+)(?:\s+(@[^@]*@))?\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s(.*))?$/;

const stripBom = (text: string): string =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

const isPointer = (value: string): boolean => value === '@VOID@' || /^@[^@]+@$/.test(value);

/** Un-escape `@@` → `@` in text payloads; leave pointers untouched. */
const unescapeAt = (value: string): string => (isPointer(value) ? value : value.replace(/@@/g, '@'));

export const VOID_POINTER = '@VOID@';

export const tokenizeGedcom = (text: string): TokenizedGedcom => {
  const rawLines = stripBom(text).split(/\r?\n/);
  const lines: GedcomLine[] = [];
  const lastIndexAtLevel: Record<number, number> = {};
  let version: string | null = null;

  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    const match = raw.match(LINE_RE);
    if (!match) continue;

    const level = parseInt(match[1], 10);
    const xref = match[2];
    const tag = match[3].toUpperCase();
    const rawValue = match[4] ?? '';
    const parentIndex = lastIndexAtLevel[level - 1];

    if (tag === 'CONT' || tag === 'CONC') {
      const parent = parentIndex != null ? lines[parentIndex] : undefined;
      if (parent) {
        parent.value += (tag === 'CONT' ? '\n' : '') + unescapeAt(rawValue);
        continue; // fold the continuation away
      }
      // No parent to continue (malformed) — fall through and keep as a normal line.
    }

    const line: GedcomLine = { level, xref, tag, value: unescapeAt(rawValue) };
    const index = lines.push(line) - 1;
    lastIndexAtLevel[level] = index;
    for (const key of Object.keys(lastIndexAtLevel)) {
      if (Number(key) > level) delete lastIndexAtLevel[Number(key)];
    }

    // HEAD.GEDC.VERS — the VERS whose parent structure is GEDC.
    if (tag === 'VERS' && version == null && parentIndex != null && lines[parentIndex]?.tag === 'GEDC') {
      version = line.value.trim();
    }
  }

  return { version, lines };
};

/** Major version number from a HEAD.GEDC.VERS string ("5.5.1" → 5, "7.0" → 7); null if unknown. */
export const gedcomMajorVersion = (version: string | null): number | null => {
  if (!version) return null;
  const match = version.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};
