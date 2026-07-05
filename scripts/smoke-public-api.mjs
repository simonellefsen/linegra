#!/usr/bin/env node
/**
 * W3 — Post-deploy smoke checks for public crawl surfaces.
 * Usage: node scripts/smoke-public-api.mjs [baseUrl]
 * Example: node scripts/smoke-public-api.mjs https://linegra.vercel.app
 */

const baseUrl = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'https://linegra.vercel.app').replace(
  /\/$/,
  ''
);

const checks = [];

const assert = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
};

const fetchText = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'user-agent': 'linegra-smoke/1.0' },
  });
  const text = await response.text();
  return { status: response.status, text, contentType: response.headers.get('content-type') ?? '' };
};

const main = async () => {
  console.log(`Smoke testing ${baseUrl}\n`);

  const sitemap = await fetchText('/sitemap.xml');
  assert(
    'sitemap.xml',
    sitemap.status === 200 && (sitemap.text.includes('<urlset') || sitemap.text.includes('urlset')),
    `status ${sitemap.status}`
  );

  const llms = await fetchText('/llms.txt');
  assert('llms.txt', llms.status === 200 && llms.text.includes('Linegra'), `status ${llms.status}`);

  const trees = await fetchText('/api/public/trees?format=json');
  let treeId = null;
  let treeSlug = null;
  try {
    const payload = JSON.parse(trees.text);
    const first = payload?.trees?.[0];
    treeId = first?.treeId ?? first?.id ?? null;
    treeSlug = first?.slug ?? null;
    assert(
      'api/public/trees json',
      trees.status === 200 && Array.isArray(payload?.trees),
      `${payload?.trees?.length ?? 0} tree(s)`
    );
  } catch {
    assert('api/public/trees json', false, `status ${trees.status}, invalid JSON`);
  }

  const treeKey = treeSlug || treeId;
  if (treeKey) {
    const treeHtml = await fetchText(`/api/public/tree/${treeKey}?format=html`);
    assert(
      'api/public/tree html',
      treeHtml.status === 200 && treeHtml.text.includes('<html'),
      `status ${treeHtml.status}`
    );

    const treeMd = await fetchText(`/api/public/tree/${treeKey}?format=md`);
    assert(
      'api/public/tree md',
      treeMd.status === 200 && treeMd.contentType.includes('markdown') && treeMd.text.startsWith('#'),
      `status ${treeMd.status}`
    );

    const treePage2 = await fetchText(`/api/public/tree/${treeKey}?format=html&page=2`);
    const hasPagination =
      treePage2.status === 200 &&
      (treePage2.text.includes('rel="next"') ||
        treePage2.text.includes('rel="prev"') ||
        treePage2.text.includes('page 2') ||
        treePage2.status === 404);
    assert('api/public/tree pagination shell', hasPagination, `status ${treePage2.status}`);
  } else {
    assert('api/public/tree html', false, 'skipped — no public trees in directory');
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
