-- Align event-linked references for sources, notes, and media

alter table public.citations
  add column if not exists event_label text;

create index if not exists citations_event_label_idx on public.citations (event_label);

alter table public.media_person_links
  add column if not exists event_label text;

create index if not exists media_person_links_event_label_idx on public.media_person_links (event_label);
