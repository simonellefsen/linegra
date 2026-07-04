// Roadmap U10 — persist public crawl / bot traffic from Edge API routes.

import { classifyCrawlerUserAgent } from './crawlerAgents';
import { createServerSupabase } from './supabaseServer';

export type PublicCrawlRoute = 'person' | 'tree' | 'sitemap' | 'unknown';

export interface RecordPublicCrawlEventInput {
  route: PublicCrawlRoute;
  userAgent: string | null | undefined;
  resourceId?: string | null;
  format?: string | null;
}

const isUuid = (value: string | null | undefined): value is string =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Fire-and-forget: records non-browser agents only (see SQL guard). */
export const recordPublicCrawlEvent = (input: RecordPublicCrawlEventInput): void => {
  const agentBucket = classifyCrawlerUserAgent(input.userAgent);
  if (agentBucket === 'browser') return;

  void (async () => {
    try {
      const supabase = createServerSupabase();
      const { error } = await supabase.rpc('record_public_crawl_event', {
        payload_route: input.route,
        payload_agent_bucket: agentBucket,
        payload_resource_id: isUuid(input.resourceId) ? input.resourceId : null,
        payload_format: input.format ?? null,
      });
      if (error) {
        console.warn('record_public_crawl_event failed', error.message);
      }
    } catch (err) {
      console.warn('record_public_crawl_event failed', err);
    }
  })();
};
