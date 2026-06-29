import { describe, it, expect } from 'vitest';
import { parseQuay, quayLabel, QUAY_LABELS, QUAY_VALUES } from './sourceQuality';

describe('parseQuay', () => {
  it('accepts integer strings 0–3', () => {
    expect(parseQuay('0')).toBe(0);
    expect(parseQuay('1')).toBe(1);
    expect(parseQuay('2')).toBe(2);
    expect(parseQuay('3')).toBe(3);
  });
  it('accepts a bare number', () => {
    expect(parseQuay(3)).toBe(3);
  });
  it('tolerates free-text / "QUAY n" forms found in the quality column', () => {
    expect(parseQuay('QUAY 2')).toBe(2);
    expect(parseQuay('primary')).toBeNull();
  });
  it('rejects out-of-range and junk', () => {
    expect(parseQuay('4')).toBeNull();
    expect(parseQuay('-1')).toBeNull();
    expect(parseQuay('')).toBeNull();
    expect(parseQuay(undefined)).toBeNull();
    expect(parseQuay(null)).toBeNull();
  });
});

describe('quayLabel / QUAY_LABELS', () => {
  it('labels every value 0–3', () => {
    for (const q of QUAY_VALUES) {
      expect(quayLabel(q)).toBe(QUAY_LABELS[q]);
      expect(typeof quayLabel(q)).toBe('string');
    }
    expect(quayLabel(3)).toBe('Primary evidence');
    expect(quayLabel(0)).toBe('Unreliable / estimated');
  });
});
