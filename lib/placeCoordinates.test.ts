import { describe, expect, it } from 'vitest';
import {
  collectMapPoints,
  collectMigrationSegments,
  projectEquirectangular,
  resolvePlaceCoordinates,
} from './placeCoordinates';
import type { Person } from '../types';

const person = (id: string, extra: Partial<Person> = {}): Person => ({
  id,
  treeId: 't1',
  firstName: 'Test',
  lastName: id,
  gender: 'O',
  updatedAt: '2026-07-04T00:00:00Z',
  ...extra,
});

describe('resolvePlaceCoordinates', () => {
  it('uses explicit lat/lng', () => {
    const coords = resolvePlaceCoordinates({ fullText: 'Odense', lat: 55.4, lng: 10.4 });
    expect(coords?.lat).toBe(55.4);
    expect(coords?.lng).toBe(10.4);
  });

  it('falls back to country centroid', () => {
    const coords = resolvePlaceCoordinates({ fullText: 'Somewhere', country: 'Danmark' });
    expect(coords?.lat).toBeCloseTo(56.26, 1);
  });
});

describe('projectEquirectangular', () => {
  it('maps 0,0 near canvas center', () => {
    const { x, y } = projectEquirectangular(0, 0, 360, 180, 0);
    expect(x).toBeCloseTo(180, 0);
    expect(y).toBeCloseTo(90, 0);
  });
});

describe('collectMapPoints', () => {
  it('collects birth and death points', () => {
    const points = collectMapPoints([
      person('p1', {
        birthPlace: { fullText: 'Oslo', country: 'Norge' },
        deathPlace: { fullText: 'Bergen', lat: 60.39, lng: 5.32 },
      }),
    ]);
    expect(points.length).toBeGreaterThanOrEqual(2);
  });

  it('builds migration segments when birth and death differ', () => {
    const people = [
      person('p1', {
        birthPlace: { fullText: 'A', lat: 55, lng: 10 },
        deathPlace: { fullText: 'B', lat: 60, lng: 12 },
      }),
    ];
    const segments = collectMigrationSegments(people);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.from.lat).toBe(55);
    expect(segments[0]?.to.lat).toBe(60);
  });
});
