import { expect, test } from '@playwright/test';

const hasAuthCredentials = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
const profilePath = process.env.E2E_PROFILE_PATH;

test.describe('Deployed public crawl surfaces', () => {
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

test.describe('Deployed authenticated smoke', () => {
  test.skip(!hasAuthCredentials, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD for sign-in smoke.');

  test('signs in and opens the interactive tree tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /login/i }).click();
    await page.getByPlaceholder('you@example.com').fill(process.env.E2E_TEST_EMAIL!);
    await page.getByPlaceholder('••••••••').fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /interactive tree/i }).click();
    await expect(page.getByText(/interactive tree/i).first()).toBeVisible();
  });

  test('opens a person profile from a public URL', async ({ page }) => {
    test.skip(!hasAuthCredentials || !profilePath, 'Requires E2E_TEST_EMAIL/PASSWORD and E2E_PROFILE_PATH.');

    await page.goto('/');
    await page.getByRole('button', { name: /login/i }).click();
    await page.getByPlaceholder('you@example.com').fill(process.env.E2E_TEST_EMAIL!);
    await page.getByPlaceholder('••••••••').fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible({ timeout: 20_000 });

    await page.goto(profilePath!);
    await expect(page.getByRole('button', { name: /open in interactive tree/i })).toBeVisible({
      timeout: 25_000,
    });
  });
});
