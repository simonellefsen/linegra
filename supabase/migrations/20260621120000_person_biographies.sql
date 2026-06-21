-- Per-person biographies: the evolving, AI-(or human-)authored life story for one person, in one
-- language. Stored on the person so it surfaces on the profile Story tab and so a family book can
-- be **compiled from these** rather than re-generating every chapter each time. A content
-- `signature` (computed in lib/bookComposer.ts `personBiographySignature`) lets the composer skip
-- people whose facts haven't changed since their biography was written — only changed chapters are
-- re-run by the AI. One current biography per (person, language).
--
-- RLS mirrors the rest of the schema (can_read_tree / can_write_tree); `tree_id` is denormalized
-- onto the row so the policies don't need a join.

create table if not exists public.person_biographies (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  language text not null default 'da',          -- da | sv | no | en
  narrative text not null default '',
  signature text not null default '',           -- content hash of the facts the bio derives from
  style text,                                   -- generation options snapshot (affect the prose)
  length text,
  model text,                                   -- which model produced it (informational)
  is_manual boolean not null default false,     -- human-edited → don't auto-regenerate
  created_by_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_biographies_person_language_unique unique (person_id, language)
);

create index if not exists person_biographies_tree_idx on public.person_biographies(tree_id);
create index if not exists person_biographies_person_idx on public.person_biographies(person_id);

alter table public.person_biographies enable row level security;

-- Readable by anyone who can read the tree (so public profiles can show the story); writable by
-- tree writers (admin/editor).
drop policy if exists "person_bios_select" on public.person_biographies;
create policy "person_bios_select" on public.person_biographies
  for select using (public.can_read_tree(tree_id));

drop policy if exists "person_bios_write" on public.person_biographies;
create policy "person_bios_write" on public.person_biographies
  for all using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

-- Upsert one person's biography for a language (keyed by person + language). Validates write
-- access via the person's tree, writes an audit row, returns the row id.
create or replace function public.admin_upsert_person_biography(
  target_person_id uuid,
  payload_language text default 'da',
  payload_narrative text default '',
  payload_signature text default '',
  payload_style text default null,
  payload_length text default null,
  payload_model text default null,
  payload_is_manual boolean default false,
  payload_actor_id uuid default null,
  payload_actor_name text default 'System'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  person_tree_id uuid;
  clean_language text := coalesce(nullif(trim(payload_language), ''), 'da');
  out_id uuid;
begin
  select tree_id into person_tree_id from public.persons where id = target_person_id;
  if not found then
    raise exception 'Person % not found', target_person_id;
  end if;
  if not public.can_write_tree(person_tree_id) then
    raise exception 'Not allowed to write tree %', person_tree_id;
  end if;

  insert into public.person_biographies (
    tree_id, person_id, language, narrative, signature, style, length, model, is_manual,
    created_by_id, created_by_name, updated_at
  )
  values (
    person_tree_id, target_person_id, clean_language, payload_narrative, payload_signature,
    payload_style, payload_length, payload_model, payload_is_manual,
    payload_actor_id, coalesce(payload_actor_name, 'System'), now()
  )
  on conflict (person_id, language) do update
    set narrative = excluded.narrative,
        signature = excluded.signature,
        style = excluded.style,
        length = excluded.length,
        model = excluded.model,
        is_manual = excluded.is_manual,
        updated_at = now()
  returning id into out_id;

  insert into public.audit_logs (tree_id, actor_id, actor_name, action, entity_type, entity_id, details)
  values (
    person_tree_id,
    coalesce(payload_actor_id::text, null),
    coalesce(payload_actor_name, 'System'),
    'person_biography_upsert',
    'person_biography',
    out_id,
    jsonb_build_object('person_id', target_person_id, 'language', clean_language, 'manual', payload_is_manual)
  );

  return out_id;
end;
$$;
