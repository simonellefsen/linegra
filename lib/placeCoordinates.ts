// L4 — Resolve map coordinates from structured places (explicit lat/lng or country centroid).

import type { Person, StructuredPlace } from '../types';
import { deterministicParsePlace } from './placeParser';

export interface MapPoint {
  id: string;
  personId: string;
  personName: string;
  label: string;
  lat: number;
  lng: number;
  kind: 'birth' | 'death' | 'burial' | 'event' | 'residence';
  placeLabel: string;
}

const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  danmark: { lat: 56.26, lng: 9.5 },
  denmark: { lat: 56.26, lng: 9.5 },
  norge: { lat: 60.47, lng: 8.47 },
  norway: { lat: 60.47, lng: 8.47 },
  sverige: { lat: 62.0, lng: 15.0 },
  sweden: { lat: 62.0, lng: 15.0 },
  finland: { lat: 61.92, lng: 25.75 },
  suomi: { lat: 61.92, lng: 25.75 },
  iceland: { lat: 64.96, lng: -19.02 },
  island: { lat: 64.96, lng: -19.02 },
  deutschland: { lat: 51.16, lng: 10.45 },
  germany: { lat: 51.16, lng: 10.45 },
  'united kingdom': { lat: 54.0, lng: -2.0 },
  'great britain': { lat: 54.0, lng: -2.0 },
  england: { lat: 52.35, lng: -1.17 },
  scotland: { lat: 56.49, lng: -4.2 },
  ireland: { lat: 53.14, lng: -7.69 },
  usa: { lat: 39.83, lng: -98.58 },
  'united states': { lat: 39.83, lng: -98.58 },
  canada: { lat: 56.13, lng: -106.35 },
  france: { lat: 46.6, lng: 1.89 },
  poland: { lat: 51.92, lng: 19.15 },
};

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const structuredFrom = (place?: string | StructuredPlace): StructuredPlace | null => {
  if (!place) return null;
  if (typeof place === 'object') return place;
  const parsed = deterministicParsePlace(place);
  return { fullText: place, ...parsed };
};

/** Resolve coordinates from explicit lat/lng or a country-name centroid fallback. */
export const resolvePlaceCoordinates = (
  place?: string | StructuredPlace
): { lat: number; lng: number; placeLabel: string } | null => {
  const structured = structuredFrom(place);
  if (!structured) return null;

  const placeLabel =
    structured.fullText?.trim() ||
    [structured.city, structured.country].filter(Boolean).join(', ') ||
    'Unknown place';

  if (
    typeof structured.lat === 'number' &&
    Number.isFinite(structured.lat) &&
    typeof structured.lng === 'number' &&
    Number.isFinite(structured.lng)
  ) {
    return { lat: structured.lat, lng: structured.lng, placeLabel };
  }

  const countryKey = normalizeKey(structured.country || '');
  if (countryKey && COUNTRY_CENTROIDS[countryKey]) {
    const c = COUNTRY_CENTROIDS[countryKey];
    return { lat: c.lat, lng: c.lng, placeLabel };
  }

  for (const segment of [structured.country, structured.state, structured.county, structured.city]) {
    if (!segment) continue;
    const key = normalizeKey(segment);
    if (COUNTRY_CENTROIDS[key]) {
      const c = COUNTRY_CENTROIDS[key];
      return { lat: c.lat, lng: c.lng, placeLabel };
    }
  }

  return null;
};

/** Equirectangular projection for SVG map canvas. */
export const projectEquirectangular = (
  lat: number,
  lng: number,
  width: number,
  height: number,
  padding = 24
): { x: number; y: number } => {
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const x = padding + ((lng + 180) / 360) * innerW;
  const y = padding + ((90 - lat) / 180) * innerH;
  return { x, y };
};

const pushPoint = (
  points: MapPoint[],
  seen: Set<string>,
  input: Omit<MapPoint, 'id'> & { id?: string }
) => {
  const key = `${input.personId}:${input.kind}:${input.lat.toFixed(2)}:${input.lng.toFixed(2)}`;
  if (seen.has(key)) return;
  seen.add(key);
  points.push({ ...input, id: input.id || key });
};

/** Collect geocodable birth/death/burial/residence/event places from scoped persons. */
export const collectMapPoints = (people: Person[]): MapPoint[] => {
  const points: MapPoint[] = [];
  const seen = new Set<string>();

  people.forEach((person) => {
    const personName = `${person.firstName} ${person.lastName}`.trim();

    const add = (
      place: string | StructuredPlace | undefined,
      kind: MapPoint['kind'],
      label: string
    ) => {
      const coords = resolvePlaceCoordinates(place);
      if (!coords) return;
      pushPoint(points, seen, {
        personId: person.id,
        personName,
        label,
        kind,
        lat: coords.lat,
        lng: coords.lng,
        placeLabel: coords.placeLabel,
      });
    };

    add(person.birthPlace, 'birth', 'Birth');
    add(person.deathPlace, 'death', 'Death');
    add(person.burialPlace, 'burial', 'Burial');
    add(person.residenceAtDeath, 'residence', 'Residence');

    person.events?.forEach((event, index) => {
      add(event.place, 'event', event.type || `Event ${index + 1}`);
    });
  });

  return points;
};

export interface MigrationSegment {
  id: string;
  personId: string;
  personName: string;
  from: MapPoint;
  to: MapPoint;
}

/** Birth → death (or burial) segments for migration animation when both resolve. */
export const collectMigrationSegments = (people: Person[]): MigrationSegment[] => {
  const segments: MigrationSegment[] = [];
  const pointsByPerson = new Map<string, MapPoint[]>();

  collectMapPoints(people).forEach((point) => {
    const list = pointsByPerson.get(point.personId) || [];
    list.push(point);
    pointsByPerson.set(point.personId, list);
  });

  people.forEach((person) => {
    const personName = `${person.firstName} ${person.lastName}`.trim();
    const points = pointsByPerson.get(person.id) || [];
    const birth = points.find((p) => p.kind === 'birth');
    const end = points.find((p) => p.kind === 'death') || points.find((p) => p.kind === 'burial');
    if (!birth || !end || (birth.lat === end.lat && birth.lng === end.lng)) return;
    segments.push({
      id: `${person.id}-migration`,
      personId: person.id,
      personName,
      from: birth,
      to: end,
    });
  });

  return segments;
};
