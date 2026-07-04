// L3 — Collect dated life events from scoped persons for the timeline view.

import type { Person, StructuredPlace } from '../types';
import { extractBirthYear } from './lifespan';

export type TimelineEntryKind = 'birth' | 'death' | 'burial' | 'event' | 'marriage';

export interface TimelineEntry {
  id: string;
  personId: string;
  personName: string;
  label: string;
  kind: TimelineEntryKind;
  year: number | null;
  /** Sort key — undated entries sink to the bottom. */
  sortYear: number;
  dateRaw?: string;
  placeLabel?: string;
}

const placeLabel = (place?: string | StructuredPlace): string | undefined => {
  if (!place) return undefined;
  if (typeof place === 'string') return place.trim() || undefined;
  return place.fullText?.trim() || place.city || place.country || undefined;
};

const yearFromDate = (raw?: string): number | null => extractBirthYear(raw ?? null);

const pushEntry = (
  entries: TimelineEntry[],
  entry: Omit<TimelineEntry, 'sortYear'> & { sortYear?: number }
) => {
  entries.push({
    ...entry,
    sortYear: entry.sortYear ?? entry.year ?? Number.MAX_SAFE_INTEGER,
  });
};

/** Gather birth/death/burial vitals and custom person events into a sortable timeline. */
export const collectTimelineEntries = (people: Person[]): TimelineEntry[] => {
  const entries: TimelineEntry[] = [];

  people.forEach((person) => {
    const personName = `${person.firstName} ${person.lastName}`.trim();

    if (person.birthDate) {
      const year = yearFromDate(person.birthDate);
      pushEntry(entries, {
        id: `${person.id}-birth`,
        personId: person.id,
        personName,
        label: 'Birth',
        kind: 'birth',
        year,
        dateRaw: person.birthDate,
        placeLabel: placeLabel(person.birthPlace),
      });
    }

    if (person.deathDate) {
      const year = yearFromDate(person.deathDate);
      pushEntry(entries, {
        id: `${person.id}-death`,
        personId: person.id,
        personName,
        label: 'Death',
        kind: 'death',
        year,
        dateRaw: person.deathDate,
        placeLabel: placeLabel(person.deathPlace),
      });
    }

    if (person.burialDate) {
      const year = yearFromDate(person.burialDate);
      pushEntry(entries, {
        id: `${person.id}-burial`,
        personId: person.id,
        personName,
        label: 'Burial',
        kind: 'burial',
        year,
        dateRaw: person.burialDate,
        placeLabel: placeLabel(person.burialPlace),
      });
    }

    person.events?.forEach((event) => {
      const year = yearFromDate(event.date);
      pushEntry(entries, {
        id: event.id || `${person.id}-event-${event.type}`,
        personId: person.id,
        personName,
        label: event.type || 'Event',
        kind: 'event',
        year,
        dateRaw: event.date,
        placeLabel: placeLabel(event.place),
      });
    });
  });

  return entries.sort((a, b) => {
    if (a.sortYear !== b.sortYear) return a.sortYear - b.sortYear;
    return a.personName.localeCompare(b.personName);
  });
};

export const timelineYearRange = (
  entries: TimelineEntry[]
): { min: number; max: number } | null => {
  const dated = entries.filter((e) => e.year != null) as Array<TimelineEntry & { year: number }>;
  if (!dated.length) return null;
  return {
    min: Math.min(...dated.map((e) => e.year)),
    max: Math.max(...dated.map((e) => e.year)),
  };
};
