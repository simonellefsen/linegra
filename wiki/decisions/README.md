# Decisions

Architectural / technical / process decisions with rationale. Each page: the decision, why,
alternatives rejected, and consequences. **Append new pages; don't rewrite history** — if a
decision is reversed, add a new page that supersedes the old and link both.

| Decision | Summary |
| --- | --- |
| [supabase-rls-can-read-write.md](supabase-rls-can-read-write.md) | RLS via `can_read_tree`/`can_write_tree` is the single authorization boundary. |
| [pedigree-over-force-graph.md](pedigree-over-force-graph.md) | Pedigree incremental view is primary; force graph retained as legacy. |
| [uuid-first-dna-linking.md](uuid-first-dna-linking.md) | DNA matches link by UUID first; name matching is legacy fallback only. |
| [openrouter-for-ai-utilities.md](openrouter-for-ai-utilities.md) | OpenRouter for opt-in AI text utilities, centrally configured, with fallbacks. |
| [local-superadmin-auth.md](local-superadmin-auth.md) | Single local super-admin in localStorage; multi-user deferred. |
| [raw-dna-consent-and-encryption.md](raw-dna-consent-and-encryption.md) | Raw autosomal DNA is sensitive biometric data: consent-gated, encrypted/not-persisted, never public. |
| [ai-narrative-editing-and-grounding.md](ai-narrative-editing-and-grounding.md) | AI narrative is a human-owned, editable first draft; claims are grounded, inference is marked. |

See also: [../concepts/](../concepts/llm-maintained-project-wiki.md), [../roadmap.md](../roadmap.md).
