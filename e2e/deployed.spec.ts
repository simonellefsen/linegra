import { expect, test } from '@playwright/test';
import { withVercelBypassQuery } from '../lib/e2eAppUrl';

const profilePath = process.env.E2E_PROFILE_PATH;
const hasE2eToken = Boolean(process.env.E2E_ACCESS_TOKEN);
const hasDeployedTarget = Boolean(process.env.E2E_BASE_URL);

const describeDeployed = hasDeployedTarget ? test.describe : test.describe.skip;
const describeAuthenticated = hasE2eToken ? test.describe : test.describe.skip;

describeDeployed('Deployed public crawl surfaces', () => {
  test('sitemap responds with urlset or sitemap index', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toMatch(/urlset|sitemapindex/i);
  });

  test('public tree directory JSON and Markdown APIs respond', async ({ request }) => {
    const jsonResponse = await request.get('/api/public/trees?format=json');
    expect(jsonResponse.ok()).toBeTruthy();
    const json = (await jsonResponse.json()) as { trees?: unknown[] };
    expect(Array.isArray(json.trees)).toBe(true);

    const mdResponse = await request.get('/api/public/trees?format=md');
    expect(mdResponse.ok()).toBeTruthy();
    const markdown = await mdResponse.text();
    expect(markdown).toMatch(/^# Public family trees/m);
  });

  test('public tree directory HTML shell is crawlable', async ({ request }) => {
    const response = await request.get('/api/public/trees?format=html');
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).toContain('<html');
    expect(html).toContain('Public family trees');
    expect(html).toContain('noai, noimageai');
  });

  test('first public tree serves HTML and Markdown shells', async ({ request }) => {
    const directory = await request.get('/api/public/trees?format=json');
    expect(directory.ok()).toBeTruthy();
    const payload = (await directory.json()) as {
      trees?: Array<{ treeId?: string; id?: string; slug?: string | null }>;
    };
    const first = payload.trees?.[0];
    const treeKey = first?.slug || first?.treeId || first?.id;
    test.skip(!treeKey, 'No public trees in directory — skip tree shell check.');

    const html = await request.get(`/api/public/tree/${treeKey}?format=html`);
    expect(html.ok()).toBeTruthy();
    expect(await html.text()).toContain('<html');

    const md = await request.get(`/api/public/tree/${treeKey}?format=md`);
    expect(md.ok()).toBeTruthy();
    expect(await md.text()).toMatch(/^#/);
  });
});

describeAuthenticated('Deployed authenticated smoke', () => {
  test('opens the interactive tree tab with a bootstrapped session', async ({ page }) => {
    await page.goto(withVercelBypassQuery('/'));
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /interactive tree/i }).click();
    await expect(page.getByText(/interactive tree/i).first()).toBeVisible();
  });

  test('opens a person profile from a public URL', async ({ page }) => {
    test.skip(!profilePath, 'Set E2E_PROFILE_PATH to a public person route.');

    await page.goto(withVercelBypassQuery('/'));
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible({ timeout: 20_000 });
    await page.goto(withVercelBypassQuery(profilePath!));
    await expect(page.getByRole('button', { name: /open in interactive tree/i })).toBeVisible({
      timeout: 25_000,
    });
  });
});
