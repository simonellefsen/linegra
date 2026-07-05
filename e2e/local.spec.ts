import { expect, test } from '@playwright/test';

test.describe('Local SPA smoke', () => {
  test('boots the app shell', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Linegra/i);
    const hasConfigGate = page.getByRole('heading', { name: /Supabase Configuration Required/i });
    const hasLogin = page.getByRole('button', { name: /login/i });
    await expect(hasConfigGate.or(hasLogin)).toBeVisible({ timeout: 15_000 });
  });

  test('opens the sign-in modal from the login button', async ({ page }) => {
    await page.goto('/');
    const loginButton = page.getByRole('button', { name: /login/i });
    const visible = await loginButton.isVisible().catch(() => false);
    test.skip(!visible, 'Supabase is not configured in this build — login chrome is hidden.');

    await loginButton.click();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('renders the public book viewer unavailable state', async ({ page }) => {
    await page.goto('/book/00000000-0000-4000-8000-000000000001');
    await expect(page.getByRole('heading', { name: /book unavailable/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
