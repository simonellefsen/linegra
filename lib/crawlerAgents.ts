// Roadmap U10 — crawler / LLM agent User-Agent buckets.

const CRAWLER_PATTERN =
  /googlebot|bingbot|duckduckbot|slurp|yandex|baiduspider|facebookexternalhit|twitterbot|linkedinbot|gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|perplexitybot|bytespider|applebot|semrushbot|ahrefsbot|mj12bot|petalbot|amazonbot|cohere-ai|youbot/i;

export const isCrawlerUserAgent = (userAgent: string | null | undefined): boolean =>
  !!userAgent && CRAWLER_PATTERN.test(userAgent);

export const classifyCrawlerUserAgent = (userAgent: string | null | undefined): string => {
  if (!userAgent) return 'unknown';
  if (/googlebot/i.test(userAgent)) return 'googlebot';
  if (/bingbot/i.test(userAgent)) return 'bingbot';
  if (/duckduckbot/i.test(userAgent)) return 'duckduckbot';
  if (/applebot/i.test(userAgent)) return 'applebot';
  if (/facebookexternalhit|meta-externalagent/i.test(userAgent)) return 'facebookbot';
  if (/gptbot|chatgpt-user|oai-searchbot/i.test(userAgent)) return 'gptbot';
  if (/claudebot|anthropic-ai/i.test(userAgent)) return 'claudebot';
  if (/perplexitybot/i.test(userAgent)) return 'perplexitybot';
  if (/yandex/i.test(userAgent)) return 'yandexbot';
  if (/baiduspider/i.test(userAgent)) return 'baiduspider';
  if (isCrawlerUserAgent(userAgent)) return 'other-bot';
  return 'browser';
};
