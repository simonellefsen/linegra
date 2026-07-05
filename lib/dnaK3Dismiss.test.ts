import { describe, expect, it } from 'vitest';
import { isK3DismissedForFocus, withK3DismissedForFocus } from './dnaK3Dismiss';

describe('dnaK3Dismiss', () => {
  it('tracks dismissals per focus person', () => {
    const focusA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const focusB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const next = withK3DismissedForFocus({}, focusA);
    expect(isK3DismissedForFocus(next, focusA)).toBe(true);
    expect(isK3DismissedForFocus(next, focusB)).toBe(false);
    const both = withK3DismissedForFocus(next, focusB);
    expect(isK3DismissedForFocus(both, focusB)).toBe(true);
  });
});
