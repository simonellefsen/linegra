// Roadmap U10 — persist public crawl / bot traffic from Edge API routes.

import { classifyCrawlerUserAgent } from './crawlerAgents';
import type { RequestGeo } from './requestGeo';
import { createServerSupabase } from './supabaseServer';

export type PublicCrawlRoute =
  | 'person'
  | 'tree'
  | 'family'
  | 'book'
  | 'sitemap'
  | 'trees-directory'
  | 'unknown';

export interface RecordPublicCrawlEventInput {
  route: PublicCrawlRoute;
  userAgent: string | null | undefined;
  resourceId?: string | null;
  format?: string | null;
  geo?: RequestGeo;
}

const isUuid = (value: string | null | undefined): value is string =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const truncateUserAgent = (userAgent: string | null | undefined): string | null => {
  const trimmed = userAgent?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
};

/** Await on Edge/API handlers so Vercel does not drop the write after the response. */
export const recordPublicCrawlEvent = async (
  input: RecordPublicCrawlEventInput
): Promise<void> => {
  const agentBucket = classifyCrawlerUserAgent(input.userAgent);
  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.rpc('record_public_crawl_event', {
      payload_route: input.route,
      payload_agent_bucket: agentBucket,
      payload_resource_id: isUuid(input.resourceId) ? input.resourceId : null,
      payload_format: input.format ?? null,
      payload_country_code: input.geo?.countryCode ?? null,
      payload_region: input.geo?.region ?? null,
      payload_city: input.geo?.city ?? null,
      payload_user_agent: truncateUserAgent(input.userAgent),
    });
    if (error) {
      console.warn('record_public_crawl_event failed', error.message);
    }
  } catch (err) {
    console.warn('record_public_crawl_event failed', err);
  }
};
