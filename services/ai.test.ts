import { describe, it, expect } from 'vitest';
import { buildAiProxyUrl, buildAiProxyRequestBody, AI_PROXY_PATH } from './ai';

// Roadmap N: the security-critical invariant is that the OpenRouter API key NEVER leaves the
// browser. These tests pin the request shape sent to the ai-proxy Edge Function: the URL is the
// function (not openrouter.ai), the body carries attribution + params, and no key material is
// serialized (only an optional one-off testKey for the admin "Test Connection" path).

describe('buildAiProxyUrl', () => {
  it('appends the ai-proxy Edge Function path', () => {
    expect(buildAiProxyUrl('https://x.supabase.co')).toBe(`https://x.supabase.co${AI_PROXY_PATH}`);
  });

  it('targets the function, never openrouter.ai', () => {
    expect(buildAiProxyUrl('https://x.supabase.co')).not.toContain('openrouter.ai');
    expect(buildAiProxyUrl('https://x.supabase.co')).toMatch(/\/functions\/v1\/ai-proxy$/);
  });

  it('trims a trailing slash on the base url', () => {
    expect(buildAiProxyUrl('https://x.supabase.co/')).toBe(`https://x.supabase.co${AI_PROXY_PATH}`);
  });
});

describe('buildAiProxyRequestBody', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }];

  it('carries model, messages, attribution, timeout and baseUrl', () => {
    const body = buildAiProxyRequestBody(
      'm1',
      'https://openrouter.ai/api/v1',
      messages,
      { temperature: 0.7, max_tokens: 100 },
      { purpose: 'biography', treeId: 't1', actorId: 'a1' },
      30000,
    );
    expect(body.model).toBe('m1');
    expect(body.messages).toBe(messages);
    expect(body.purpose).toBe('biography');
    expect(body.treeId).toBe('t1');
    expect(body.actorId).toBe('a1');
    expect(body.timeoutMs).toBe(30000);
    expect(body.baseUrl).toBe('https://openrouter.ai/api/v1');
    // OpenRouter params pass through unchanged
    const extra = body as Record<string, unknown>;
    expect(extra.temperature).toBe(0.7);
    expect(extra.max_tokens).toBe(100);
  });

  it('never serializes OpenRouter key material', () => {
    const body = buildAiProxyRequestBody('m1', 'b', messages, {}, undefined, 30000);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('apiKey');
    expect(serialized).not.toContain('testKey');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('sk-or');
    // The field exists as `undefined` (dropped by JSON.stringify) but is never a key value.
    expect(body.testKey).toBeUndefined();
    expect(body).not.toHaveProperty('apiKey');
  });

  it('includes testKey only when explicitly provided (admin Test Connection path)', () => {
    const withKey = buildAiProxyRequestBody(
      'm1', 'b', messages, {}, { purpose: 'test', testKey: 'sk-or-x' }, 30000,
    );
    expect(withKey.testKey).toBe('sk-or-x');
    expect(JSON.stringify(withKey)).toContain('sk-or-x');
  });

  it('forwards JSON-mode / vision params verbatim', () => {
    const schema = { type: 'json_schema', json_schema: { name: 'S' } };
    const body = buildAiProxyRequestBody(
      'm1', 'b', messages, { response_format: schema, temperature: 0.1, max_tokens: 180 },
      { purpose: 'death_cause' }, 30000,
    );
    expect((body as Record<string, unknown>).response_format).toEqual(schema);
  });
});
