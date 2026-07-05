#!/usr/bin/env node
/**
 * Bootstrap Playwright storageState via POST /api/e2e/redeem (used by CI and local runs).
 *
 * Env: E2E_BASE_URL, E2E_ACCESS_TOKEN, SUPABASE_URL (or VITE_SUPABASE_URL)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_TOKEN_PREFIX = 'lg_e2e_';

const supabaseAuthStorageKey = (supabaseUrl) => {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token`;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, '..', 'e2e', '.auth');
const storageStatePath = path.join(authDir, 'storageState.json');

const baseUrl = process.env.E2E_BASE_URL?.replace(/\/$/, '');
const token = process.env.E2E_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;

if (!token || !baseUrl) {
  console.log('[e2e-bootstrap] Skipping (E2E_ACCESS_TOKEN or E2E_BASE_URL not set).');
  process.exit(0);
}

if (!token.startsWith(E2E_TOKEN_PREFIX)) {
  console.error('[e2e-bootstrap] E2E_ACCESS_TOKEN must start with lg_e2e_.');
  process.exit(1);
}

if (!supabaseUrl) {
  console.error('[e2e-bootstrap] SUPABASE_URL (or VITE_SUPABASE_URL) is required.');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/e2e/redeem`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

if (!response.ok) {
  const body = await response.text();
  console.error(`[e2e-bootstrap] Redeem failed (${response.status}): ${body}`);
  process.exit(1);
}

const payload = await response.json();
if (!payload.session) {
  console.error('[e2e-bootstrap] Redeem response missing session.');
  process.exit(1);
}

fs.mkdirSync(authDir, { recursive: true });
fs.writeFileSync(
  storageStatePath,
  JSON.stringify(
    {
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
    },
    null,
    2
  )
);

console.log(`[e2e-bootstrap] Wrote ${storageStatePath}`);
