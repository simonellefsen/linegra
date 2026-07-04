// Roadmap U — privacy gates for crawlable public surfaces.

import { inferLivingStatus } from './lifespan';

export interface CrawlablePersonFields {
  isPrivate?: boolean;
  isLiving?: boolean;
  birthDate?: string | null;
  deathDate?: string | null;
  burialDate?: string | null;
}

/** Mirrors GEDCOM export / sitemap privacy: no living or private persons. */
export const isPersonPubliclyCrawlable = (person: CrawlablePersonFields): boolean => {
  if (person.isPrivate) return false;
  return !inferLivingStatus(person);
};

export const formatPersonDisplayName = (person: {
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
}): string => {
  const parts = [person.title, person.firstName, person.lastName].filter(Boolean);
  return parts.join(' ').trim() || 'Unknown person';
};
