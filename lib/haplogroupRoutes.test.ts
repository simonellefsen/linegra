import { describe, expect, it } from 'vitest';
import { lookupHaplogroupRoute, collectHaplogroupRoutes } from './haplogroupRoutes';

describe('lookupHaplogroupRoute', () => {
  it('resolves Y-DNA I-M6155 with migration steps', () => {
    const route = lookupHaplogroupRoute('I-M6155', 'Y-DNA');
    expect(route?.region).toContain('Scandinavia');
    expect(route?.migrationSteps.length).toBeGreaterThan(2);
    expect(route?.eraGuide).toContain('Iron');
  });

  it('resolves Y-DNA R-BY67151 (Nordic R1b)', () => {
    const route = lookupHaplogroupRoute('R-BY67151', 'Y-DNA');
    expect(route).not.toBeNull();
    expect(route?.path).toContain('R-BY67151');
    expect(route?.migrationSteps[0]?.region).toMatch(/Africa/i);
  });

  it('resolves mtDNA U5b1b1a with richer context', () => {
    const route = lookupHaplogroupRoute('U5b1b1a', 'mtDNA');
    expect(route?.path).toContain('U5b1b1a');
    expect(route?.description).toContain('U5b');
    expect(route?.migrationSteps.length).toBeGreaterThan(2);
  });

  it('resolves mitotree terminals with + suffix', () => {
    const route = lookupHaplogroupRoute('U5b1b1a+7385+16519', 'Mitotree');
    expect(route?.haplogroup).toBe('U5b1b1a+7385+16519');
    expect(route?.migrationSteps.length).toBeGreaterThan(0);
  });
});

describe('collectHaplogroupRoutes', () => {
  it('merges mtDNA and Mitotree on the same maternal line (Simon-style profile)', () => {
    const routes = collectHaplogroupRoutes({
      yHaplogroup: 'R-BY67151',
      mtDnaHaplogroup: 'U5b1b1a',
      mitotree: 'U5b1b1a+7385+16519',
    });
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.line)).toEqual(['Y-DNA', 'mtDNA']);
    const maternal = routes[1];
    expect(maternal?.haplogroup).toBe('U5b1b1a');
    expect(maternal?.mitotreeTerminal).toBe('U5b1b1a+7385+16519');
    expect(maternal?.path.at(-1)).toBe('U5b1b1a+7385+16519');
  });

  it('returns separate cards when mtDNA and Mitotree disagree', () => {
    const routes = collectHaplogroupRoutes({
      mtDnaHaplogroup: 'U5b1b1a',
      mitotree: 'H1a+123',
    });
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });
});
