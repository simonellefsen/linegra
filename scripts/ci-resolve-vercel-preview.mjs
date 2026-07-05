#!/usr/bin/env node
/**
 * Resolve the Vercel preview/production URL from GitHub Deployments API.
 * Avoids unauthenticated HTTP probes that return 401 under Vercel Deployment Protection.
 *
 * Env: GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_TOKEN
 * Optional: VERCEL_DEPLOY_ENV (default Preview), VERCEL_AUTOMATION_BYPASS_SECRET
 * Writes: url=… to GITHUB_OUTPUT when set
 */
const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const deployEnv = process.env.VERCEL_DEPLOY_ENV ?? 'Preview';
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const maxTimeoutMs = Number(process.env.VERCEL_RESOLVE_TIMEOUT_MS ?? 300_000);
const pollMs = Number(process.env.VERCEL_RESOLVE_POLL_MS ?? 10_000);

if (!repository || !sha || !token) {
  console.error('[vercel-preview] GITHUB_REPOSITORY, GITHUB_SHA, and GITHUB_TOKEN are required.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ghApi = async (path) => {
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${path} failed (${response.status}): ${body}`);
  }
  return response.json();
};

const probePreview = async (url) => {
  const headers = bypassSecret
    ? {
        'x-vercel-protection-bypass': bypassSecret,
        'x-vercel-set-bypass-cookie': 'true',
      }
    : {};
  const response = await fetch(url, { headers, redirect: 'follow' });
  return response.status;
};

const writeOutput = async (url) => {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(outputPath, `url=${url}\n`);
  }
  console.log(`[vercel-preview] Resolved deployment URL: ${url}`);
};

const deadline = Date.now() + maxTimeoutMs;

while (Date.now() < deadline) {
  const deployments = await ghApi(`repos/${repository}/deployments?sha=${sha}&per_page=20`);
  const candidates = deployments.filter((dep) => dep.environment === deployEnv);

  for (const deployment of candidates) {
    const statuses = await ghApi(`repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`);
    const latest = statuses[0];
    if (latest?.state !== 'success') continue;

    const rawUrl = latest.environment_url || latest.target_url;
    if (!rawUrl) continue;

    const url = rawUrl.replace(/\/$/, '');
    const status = await probePreview(url);

    if (status >= 200 && status < 400) {
      await writeOutput(url);
      process.exit(0);
    }

    console.log(
      `[vercel-preview] ${url} returned HTTP ${status}${
        bypassSecret ? '' : ' (set VERCEL_AUTOMATION_BYPASS_SECRET for protected previews)'
      }; retrying…`
    );
  }

  console.log(`[vercel-preview] Waiting for ${deployEnv} deployment on ${sha.slice(0, 7)}…`);
  await sleep(pollMs);
}

console.error(`[vercel-preview] Timed out after ${maxTimeoutMs}ms waiting for ${deployEnv} deployment.`);
process.exit(1);
