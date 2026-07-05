import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';
import { supabaseAuthStorageKey } from '../lib/e2eToken';
import { vercelProtectionBypassHeaders } from '../lib/e2eVercelHeaders';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, '.auth');
const storageStatePath = path.join(authDir, 'storageState.json');

const resolveSupabaseUrl = (): string | null =>
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? null;

async function globalSetup(_config: FullConfig): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL?.replace(/\/$/, '');
  const token = process.env.E2E_ACCESS_TOKEN;
  const supabaseUrl = resolveSupabaseUrl();

  if (!baseUrl) {
    console.log('[e2e] Skipping session bootstrap (E2E_BASE_URL not set).');
    return;
  }
  if (!token) {
    console.log(
      '[e2e] Skipping session bootstrap (E2E_ACCESS_TOKEN not set — add as a GitHub repository secret for CI, not Vercel env).'
    );
    return;
  }
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL (or VITE_SUPABASE_URL) is required to bootstrap Playwright auth.');
  }

  const response = await fetch(`${baseUrl}/api/e2e/redeem`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...vercelProtectionBypassHeaders(),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`E2E redeem failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as { session?: Record<string, unknown> };
  if (!payload.session) {
    throw new Error('E2E redeem response missing session payload.');
  }

  fs.mkdirSync(authDir, { recursive: true });
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: baseUrl,
        localStorage: [
          {
            name: supabaseAuthStorageKey(supabaseUrl),
            value: JSON.stringify(payload.session),
          },
        ],
      },
    ],
  };
  fs.writeFileSync(storageStatePath, JSON.stringify(storageState, null, 2));
  console.log(`[e2e] Wrote Playwright storage state to ${storageStatePath}`);
}

export default globalSetup;
