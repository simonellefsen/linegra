import { describe, expect, it } from 'vitest';
import { centeredPedigreeScrollPosition } from './pedigreeViewport';

describe('centeredPedigreeScrollPosition', () => {
  it('centers a focus card in a wide pedigree canvas', () => {
    expect(
      centeredPedigreeScrollPosition(
        { left: 2_200, top: 388, width: 180, height: 152 },
        { width: 5_020, height: 1_260 },
        { width: 1_200, height: 700 }
      )
    ).toEqual({ left: 1_690, top: 114 });
  });

  it('does not scroll beyond the canvas boundary', () => {
    expect(
      centeredPedigreeScrollPosition(
        { left: 4_900, top: 1_200, width: 180, height: 152 },
        { width: 5_020, height: 1_260 },
        { width: 1_200, height: 700 }
      )
    ).toEqual({ left: 3_820, top: 560 });
  });
});
