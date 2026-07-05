import { describe, expect, it } from 'vitest';
import { hashClientErrorStack } from './clientErrorHash';

describe('hashClientErrorStack', () => {
  it('returns stable hashes for the same stack', () => {
    const stack = 'Error: boom\n    at App.tsx:12:3';
    expect(hashClientErrorStack(stack)).toBe(hashClientErrorStack(stack));
  });

  it('returns no-stack for empty input', () => {
    expect(hashClientErrorStack('')).toBe('no-stack');
    expect(hashClientErrorStack(null)).toBe('no-stack');
  });
});
