#!/usr/bin/env node
/**
 * Resolve the Vercel preview/production URL from GitHub Deployments API.
 * Avoids unauthenticated HTTP probes that return 401 under Vercel Deployment Protection.
 *
 * Env: GITHUB_REPOSITORY, GITHUB_TOKEN, VERCEL_DEPLOY_SHA (PR head — not GITHUB_SHA)
 * Optional: GITHUB_DEPLOY_REF, VERCEL_DEPLOY_ENV, VERCEL_AUTOMATION_BYPASS_SECRET
 * Writes: url=… to GITHUB_OUTPUT when set
 */
const repository = process.env.GITHUB_REPOSITORY;
// checkout@v4 overwrites GITHUB_SHA with the PR merge commit; Vercel deploys the head SHA.
const sha = process.env.VERCEL_DEPLOY_SHA ?? process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const deployRef = process.env.GITHUB_DEPLOY_REF;
const deployEnv = process.env.VERCEL_DEPLOY_ENV ?? 'Preview';
const maxTimeoutMs = Number(process.env.VERCEL_RESOLVE_TIMEOUT_MS ?? 300_000);
const pollMs = Number(process.env.VERCEL_RESOLVE_POLL_MS ?? 10_000);

if (!repository || !sha || !token) {
  const missing = [
    !repository && 'GITHUB_REPOSITORY',
    !sha && 'VERCEL_DEPLOY_SHA',
    !token && 'GITHUB_TOKEN',
  ].filter(Boolean);
  console.error(`[vercel-preview] Missing required env: ${missing.join(', ')}`);
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

const matchesDeployEnv = (environment) =>
  environment?.toLowerCase() === deployEnv.toLowerCase();

const pickSuccessUrl = (statuses) => {
  const success = statuses.find((status) => status.state === 'success');
  const rawUrl = success?.environment_url || success?.target_url;
  return rawUrl ? rawUrl.replace(/\/$/, '') : null;
};

const listDeployments = async () => {
  const bySha = await ghApi(`repos/${repository}/deployments?sha=${sha}&per_page=20`);
  if (bySha.length > 0) return bySha;
  if (!deployRef) return [];
  return ghApi(`repos/${repository}/deployments?ref=${encodeURIComponent(deployRef)}&per_page=20`);
};

const resolvePreviewUrl = async () => {
  const deployments = await listDeployments();
  const candidates = deployments.filter((dep) => matchesDeployEnv(dep.environment));

  for (const deployment of candidates) {
    const statuses = await ghApi(
      `repos/${repository}/deployments/${deployment.id}/statuses?per_page=20`
    );
    const url = pickSuccessUrl(statuses);
    if (url) return url;
  }

  return null;
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
  const url = await resolvePreviewUrl();

  if (url) {
    // Trust GitHub's successful Vercel deployment status. HTTP probing with
    // x-vercel-set-bypass-cookie causes redirect loops in Node fetch.
    await writeOutput(url);
    process.exit(0);
  } else {
    console.log(
      `[vercel-preview] No successful ${deployEnv} deployment for ${sha.slice(0, 7)} yet${
        deployRef ? ` (ref ${deployRef})` : ''
      }…`
    );
  }

  await sleep(pollMs);
}

console.error(`[vercel-preview] Timed out after ${maxTimeoutMs}ms waiting for ${deployEnv} deployment.`);
process.exit(1);
