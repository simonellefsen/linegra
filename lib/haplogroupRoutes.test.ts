import { describe, expect, it } from 'vitest';
import { lookupHaplogroupRoute, collectHaplogroupRoutes, collectUnresolvedHaplogroups } from './haplogroupRoutes';

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

  it('resolves mtDNA J1c2a (European J branch)', () => {
    const route = lookupHaplogroupRoute('J1c2a', 'mtDNA');
    expect(route?.path).toContain('J1c2a');
    expect(route?.region).toMatch(/Europe|Scandinavia/i);
  });

  it('maps Mitotree J1c2a8a terminal to J1c2a reference', () => {
    const route = lookupHaplogroupRoute('J1c2a8a', 'Mitotree');
    expect(route).not.toBeNull();
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

  it('reports unresolved haplogroups not in the reference', () => {
    const unresolved = collectUnresolvedHaplogroups({
      yHaplogroup: 'Q-L53',
      mtDnaHaplogroup: 'X2b',
    });
    expect(unresolved.map((item) => item.haplogroup)).toEqual(['Q-L53', 'X2b']);
  });

  it('resolves Sissel-style J1c2a + J1c2a8a maternal profile', () => {
    const routes = collectHaplogroupRoutes({
      mtDnaHaplogroup: 'J1c2a',
      mitotree: 'J1c2a8a',
    });
    expect(routes).toHaveLength(1);
    expect(routes[0]?.haplogroup).toBe('J1c2a');
    expect(routes[0]?.mitotreeTerminal).toBe('J1c2a8a');
    expect(collectUnresolvedHaplogroups({ mtDnaHaplogroup: 'J1c2a', mitotree: 'J1c2a8a' })).toHaveLength(0);
  });
});
