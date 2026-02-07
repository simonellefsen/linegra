-- Extend source and citation metadata for structured GEDCOM imports

alter table public.sources
  add column if not exists abbreviation text,
  add column if not exists call_number text;

alter table public.citations
  add column if not exists data_date text,
  add column if not exists data_text text,
  add column if not exists quality text;
