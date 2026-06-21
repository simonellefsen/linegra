-- Family Books: AI-authored narrative family-history books, persisted per tree.
--
-- A book is a structured artifact (cover meta + an overview chapter + per-person chapters),
-- generated client-side by the AI composer and saved here so it can be reopened, re-exported
-- to PDF, and (later) edited in the UI. v1 visibility is admin/editor-only: a book can weave
-- in living-person data, so it stays private until an `is_public` flag is explicitly set and a
-- public viewer exists. RLS mirrors the rest of the schema (can_read_tree / can_write_tree).

create table if not exists public.family_books (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  title text not null,
  subtitle text,
  status text not null default 'draft',          -- 'draft' | 'complete'
  is_public boolean not null default false,
  options jsonb not null default '{}'::jsonb,    -- generation options snapshot (scope/style/length/proband/model)
  chapters jsonb not null default '[]'::jsonb,   -- [{ kind, title, personId?, narrative, facts? }]
  statistics jsonb not null default '{}'::jsonb, -- family-stats snapshot (span, places, surnames, occupations)
  created_by_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_books_tree_id_idx on public.family_books(tree_id);
create index if not exists family_books_updated_at_idx on public.family_books(updated_at desc);

alter table public.family_books enable row level security;

-- v1: readable only by tree writers (admin/editor) — books may contain living-person context.
-- `is_public` is the forward path to public sharing once a viewer exists.
drop policy if exists "books_select" on public.family_books;
create policy "books_select" on public.family_books
  for select using (
    public.can_read_tree(tree_id) and (is_public or public.can_write_tree(tree_id))
  );

drop policy if exists "books_write" on public.family_books;
create policy "books_write" on public.family_books
  for all using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

-- Insert or update a family book. Validates tree write access, writes an audit row, returns the id.
create or replace function public.admin_upsert_family_book(
  target_tree_id uuid,
  payload_book_id uuid default null,
  payload_title text default '',
  payload_subtitle text default null,
  payload_status text default 'draft',
  payload_is_public boolean default false,
  payload_options jsonb default '{}'::jsonb,
  payload_chapters jsonb default '[]'::jsonb,
  payload_statistics jsonb default '{}'::jsonb,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  out_id uuid;
  clean_status text := coalesce(nullif(trim(payload_status), ''), 'draft');
begin
  if not public.can_write_tree(target_tree_id) then
    raise exception 'Not allowed to write tree %', target_tree_id;
  end if;

  existing_id := payload_book_id;
  if existing_id is not null then
    select id into out_id from public.family_books where id = existing_id and tree_id = target_tree_id;
    if not found then
      existing_id := null;  -- stale id for another tree → create instead
    end if;
  end if;

  if existing_id is not null then
    update public.family_books
      set
        title = payload_title,
        subtitle = payload_subtitle,
        status = clean_status,
        is_public = payload_is_public,
        options = payload_options,
        chapters = payload_chapters,
        statistics = payload_statistics,
        updated_at = now()
      where id = existing_id
      returning id into out_id;

    insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
    values (
      target_tree_id,
      coalesce(payload_actor_id::text, null),
      coalesce(payload_actor_name, 'System'),
      'family_book_update',
      'family_book',
      out_id,
      jsonb_build_object('title', payload_title, 'status', clean_status, 'chapters', jsonb_array_length(payload_chapters))
    );
  else
    insert into public.family_books (
      tree_id, title, subtitle, status, is_public, options, chapters, statistics,
      created_by_id, created_by_name, updated_at
    )
    values (
      target_tree_id, payload_title, payload_subtitle, clean_status, payload_is_public,
      payload_options, payload_chapters, payload_statistics,
      payload_actor_id, coalesce(payload_actor_name, 'System'), now()
    )
    returning id into out_id;

    insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
    values (
      target_tree_id,
      coalesce(payload_actor_id::text, null),
      coalesce(payload_actor_name, 'System'),
      'family_book_create',
      'family_book',
      out_id,
      jsonb_build_object('title', payload_title, 'status', clean_status, 'chapters', jsonb_array_length(payload_chapters))
    );
  end if;

  return out_id;
end;
$$;

-- Delete a family book after verifying write access via its tree.
create or replace function public.admin_delete_family_book(
  target_book_id uuid,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  book_tree_id uuid;
begin
  select tree_id into book_tree_id from public.family_books where id = target_book_id;
  if not found then
    raise exception 'Family book % not found', target_book_id;
  end if;

  if not public.can_write_tree(book_tree_id) then
    raise exception 'Not allowed to delete book %', target_book_id;
  end if;

  delete from public.family_books where id = target_book_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    book_tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'family_book_delete',
    'family_book',
    target_book_id,
    jsonb_build_object('deleted', true)
  );
end;
$$;
