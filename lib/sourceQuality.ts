// GEDCOM QUAY (source-citation certainty) helpers — roadmap H/P1. QUAY is an integer 0–3 on a
// citation: 0 unreliable/estimated, 1 questionable, 2 secondary evidence, 3 primary/direct evidence.
// The data already round-trips through the `citations.quality` text column + the exporter's `1 QUAY`
// line; this module gives it a typed, validated, labeled form shared by the import parser and the UI.
// Pure (no I/O) so it is fully unit-testable.

import { Quay } from '../types';

export const QUAY_VALUES: readonly Quay[] = [0, 1, 2, 3] as const;

export const QUAY_LABELS: Record<Quay, string> = {
  0: 'Unreliable / estimated',
  1: 'Questionable',
  2: 'Secondary evidence',
  3: 'Primary evidence',
};

/** Parse a GEDCOM QUAY value into a typed 0–3, or null when it is missing/invalid. Tolerant of the
 *  free-text forms that sneak into the `quality` column ("3", "QUAY 3", "primary"). */
export const parseQuay = (value: string | number | null | undefined): Quay | null => {
  if (value == null) return null;
  const match = String(value).match(/-?\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return n >= 0 && n <= 3 ? (n as Quay) : null;
};

/** Short human label for a QUAY value (e.g. "Primary evidence"). */
export const quayLabel = (quay: Quay): string => QUAY_LABELS[quay];
