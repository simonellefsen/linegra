// U18l — bucket visitor Referer headers without storing full URLs.

export type ReferrerBucket = 'google' | 'bing' | 'ai_assistant' | 'direct' | 'other';

export const REFERRER_BUCKET_LABELS: Record<ReferrerBucket, string> = {
  google: 'Google',
  bing: 'Bing / DuckDuckGo',
  ai_assistant: 'AI assistants',
  direct: 'Direct / none',
  other: 'Other sites',
};

const AI_ASSISTANT_HOST_SNIPPETS = [
  'chatgpt.com',
  'chat.openai.com',
  'openai.com',
  'perplexity.ai',
  'claude.ai',
  'anthropic.com',
  'copilot.microsoft.com',
  'gemini.google.com',
];

export const classifyReferrer = (referer: string | null | undefined): ReferrerBucket => {
  const trimmed = referer?.trim();
  if (!trimmed) return 'direct';
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (host.includes('google.')) return 'google';
    if (host.includes('bing.') || host.includes('duckduckgo.')) return 'bing';
    if (AI_ASSISTANT_HOST_SNIPPETS.some((snippet) => host.includes(snippet))) return 'ai_assistant';
    return 'other';
  } catch {
    return 'other';
  }
};
