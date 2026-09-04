import type { Person } from '../types';
import { inferLivingStatus } from './lifespan';

/**
 * A blank parent record starts with the same visibility posture as the person it
 * belongs to. This prevents an ancestor added to a historical/public profile
 * from being presented as a living, private person before it is even edited.
 */
export const parentPlaceholderDefaults = (
  child: Pick<Person, 'birthDate' | 'deathDate' | 'burialDate' | 'isLiving' | 'isPrivate'>
) => ({
  isLiving: inferLivingStatus({
    birthDate: child.birthDate,
    deathDate: child.deathDate,
    burialDate: child.burialDate,
    isLiving: child.isLiving,
  }),
  isPrivate: Boolean(child.isPrivate),
});
