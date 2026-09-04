import { describe, expect, it } from 'vitest';
import { parentPlaceholderDefaults } from './placeholderProfileDefaults';

describe('parentPlaceholderDefaults', () => {
  it('starts a parent of a historical public profile as deceased and public', () => {
    expect(parentPlaceholderDefaults({
      birthDate: '1673',
      isLiving: false,
      isPrivate: false,
    })).toEqual({ isLiving: false, isPrivate: false });
  });

  it('keeps a current private profile protected by default', () => {
    expect(parentPlaceholderDefaults({
      birthDate: '1990',
      isLiving: true,
      isPrivate: true,
    })).toEqual({ isLiving: true, isPrivate: true });
  });

  it('treats a dated death as deceased even when an old record says living', () => {
    expect(parentPlaceholderDefaults({
      birthDate: '1900',
      deathDate: '1970',
      isLiving: true,
      isPrivate: false,
    })).toEqual({ isLiving: false, isPrivate: false });
  });
});
