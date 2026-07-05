// Crawl policy meta tags — opt out of AI training on public genealogy media (roadmap U10).

/** Robots directive for pages that may include family photos or restricted media. */
export const PUBLIC_CRAWL_ROBOTS_DIRECTIVE = 'noai, noimageai';

export const renderPublicCrawlRobotsMeta = (): string =>
  `<meta name="robots" content="${PUBLIC_CRAWL_ROBOTS_DIRECTIVE}">`;
