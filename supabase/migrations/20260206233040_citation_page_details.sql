-- Capture per-citation metadata for GEDCOM imports

alter table public.citations
  add column if not exists page_text text,
  add column if not exists extra jsonb not null default '{}'::jsonb;
