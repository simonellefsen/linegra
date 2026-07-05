import { describe, expect, it } from 'vitest';
import {
  formatNameMatchRationale,
  normalizeNameMatchScore,
  scoreNameMatch,
} from './dnaNameMatch';

describe('dnaNameMatch', () => {
  it('maps exact and token matches to ranking scores', () => {
    expect(scoreNameMatch('Jon Arndal Reiersen', 'Jon Arndal Reiersen')).toBe(1000);
    expect(scoreNameMatch('Michael', 'Michaelsen')).toBe(0);
    expect(scoreNameMatch('Hans', 'Johansson')).toBe(0);
  });

  it('normalizes ranking scores to 0–100 for display', () => {
    expect(normalizeNameMatchScore(1000)).toBe(100);
    expect(normalizeNameMatchScore(700)).toBe(70);
    expect(formatNameMatchRationale(700)).toBe('Name match (Medium, 70/100)');
  });
});
