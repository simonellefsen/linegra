-- Linegra unified schema bootstrap (2026-02-07)

create extension if not exists "pgcrypto";

-- Enumerations ---------------------------------------------------------------
create type gender_type as enum ('M','F','O');
create type relationship_type as enum (
  'marriage','partner','bio_father','bio_mother','adoptive_father','adoptive_mother','step_parent','guardian','child'
);
create type relationship_status as enum ('current','divorced','separated','widowed');
create type relationship_confidence as enum ('Confirmed','Probable','Assumed','Speculative','Unknown');
create type source_type as enum ('Book','Church Record','Probate Register','Website','Census','Vital Record','Military Record','Unknown');
create type note_type as enum ('Generic','To-do','Research Note','Discrepancy');
create type media_type as enum ('image','audio','video','document');
create type media_source as enum ('local','remote');
create type media_category as enum ('Portrait','Family','Location','Document','Event','Other');
create type dna_test_type as enum ('Autosomal','Y-DNA','mtDNA','X-DNA','Other');
create type dna_vendor as enum ('FamilyTreeDNA','AncestryDNA','23andMe','MyHeritage','LivingDNA','Other');
create type dna_match_confidence as enum ('High','Medium','Low');
create type import_status as enum ('pending','processing','completed','failed');

-- Profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  display_name text,
  avatar_url text,
  role text default 'researcher',
  timezone text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Trees ---------------------------------------------------------------------
create table public.family_trees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id),
  name text not null,
  description text,
  theme_color text,
  metadata jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index family_trees_name_unique on public.family_trees (lower(name));

create table public.tree_collaborators (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  invitation_email text,
  role text not null default 'editor',
  status text not null default 'invited',
  added_by uuid references public.profiles(id),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  notes text,
  constraint tree_collab_identity check (profile_id is not null or invitation_email is not null)
);
create unique index tree_collaborators_profile_idx on public.tree_collaborators(tree_id, profile_id) where profile_id is not null;
create unique index tree_collaborators_email_idx on public.tree_collaborators(tree_id, lower(invitation_email)) where invitation_email is not null;

create table public.places (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid references public.family_trees(id) on delete cascade,
  display_name text not null,
  place_name text,
  street text,
  city text,
  county text,
  state text,
  country text,
  postal_code text,
  lat numeric(10,6),
  lng numeric(10,6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Persons -------------------------------------------------------------------
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  created_by uuid references public.profiles(id),
  first_name text not null,
  middle_name text,
  last_name text not null,
  maiden_name text,
  title text,
  gender gender_type not null default 'O',
  birth_date date,
  birth_date_text text,
  birth_place_id uuid references public.places(id),
  birth_place_text text,
  death_date date,
  death_date_text text,
  death_place_id uuid references public.places(id),
  death_place_text text,
  burial_date date,
  burial_date_text text,
  burial_place_id uuid references public.places(id),
  burial_place_text text,
  residence_at_death_id uuid references public.places(id),
  residence_at_death_text text,
  death_cause text,
  death_cause_category text,
  bio text,
  photo_url text,
  occupations text[] not null default '{}'::text[],
  is_dna_match boolean not null default false,
  dna_match_info jsonb,
  tags text[] not null default '{}'::text[],
  user_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index persons_tree_idx on public.persons(tree_id);
create index persons_name_idx on public.persons(tree_id, lower(last_name), lower(first_name));

create table public.person_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  event_type text not null,
  date date,
  date_text text,
  place_id uuid references public.places(id),
  place_text text,
  description text,
  employer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index person_events_person_idx on public.person_events(person_id, event_type);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  related_id uuid not null references public.persons(id) on delete cascade,
  type relationship_type not null,
  status relationship_status,
  confidence relationship_confidence,
  sort_order int,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index relationships_tree_idx on public.relationships(tree_id, type);

-- Sources & Citations -------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  created_by uuid references public.profiles(id),
  title text not null,
  abbreviation text,
  call_number text,
  type source_type not null default 'Unknown',
  repository text,
  url text,
  citation_date_text text,
  page text,
  reliability smallint check (reliability between 1 and 3),
  actual_text text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sources_tree_idx on public.sources(tree_id, type);

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  person_id uuid references public.persons(id) on delete cascade,
  person_event_id uuid references public.person_events(id) on delete cascade,
  relationship_id uuid references public.relationships(id) on delete cascade,
  note_id uuid,
  label text,
  event_label text,
  page_text text,
  data_date text,
  data_text text,
  quality text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint citations_target check (
    person_id is not null or person_event_id is not null or relationship_id is not null
  )
);
create index citations_source_idx on public.citations(source_id);
create index citations_person_idx on public.citations(person_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  person_id uuid references public.persons(id) on delete cascade,
  person_event_id uuid references public.person_events(id) on delete cascade,
  relationship_id uuid references public.relationships(id) on delete cascade,
  created_by uuid references public.profiles(id),
  type note_type not null default 'Generic',
  body text not null,
  event_label text,
  note_date_text text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Media ---------------------------------------------------------------------
create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  created_by uuid references public.profiles(id),
  url text not null,
  type media_type not null,
  source media_source not null,
  category media_category not null default 'Other',
  caption text,
  description text,
  taken_at date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.media_person_links (
  media_id uuid references public.media_items(id) on delete cascade,
  person_id uuid references public.persons(id) on delete cascade,
  event_label text not null default '',
  created_at timestamptz not null default now(),
  primary key (media_id, person_id, event_label)
);

create table public.media_event_links (
  media_id uuid references public.media_items(id) on delete cascade,
  person_event_id uuid references public.person_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (media_id, person_event_id)
);

create table public.media_relationship_links (
  media_id uuid references public.media_items(id) on delete cascade,
  relationship_id uuid references public.relationships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (media_id, relationship_id)
);

-- DNA -----------------------------------------------------------------------
create table public.dna_tests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  test_type dna_test_type not null,
  vendor dna_vendor not null,
  test_date date,
  match_date date,
  haplogroup text,
  is_private boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table public.dna_matches (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  matched_person_id uuid references public.persons(id) on delete cascade,
  shared_cm numeric,
  segments int,
  longest_segment numeric,
  confidence dna_match_confidence,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Audit & Imports -----------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid references public.family_trees(id) on delete set null,
  actor_id text,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tree_idx on public.audit_logs(tree_id, created_at desc);

create table public.gedcom_imports (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid references public.family_trees(id) on delete cascade,
  uploaded_by uuid references public.profiles(id),
  file_name text,
  status import_status not null default 'pending',
  stats jsonb not null default '{}'::jsonb,
  log text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- RLS helper functions ------------------------------------------------------
create or replace function public.can_read_tree(target_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_trees ft
    where ft.id = target_tree_id
      and (
        ft.is_public
        or (
          auth.uid() is not null
          and (
            ft.owner_id = auth.uid()
            or exists (
              select 1 from public.tree_collaborators tc
              where tc.tree_id = ft.id and tc.profile_id = auth.uid() and tc.status = 'active'
            )
          )
        )
      )
  );
$$;

create or replace function public.can_write_tree(target_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_trees ft
    where ft.id = target_tree_id
      and auth.uid() is not null
      and (
        ft.owner_id = auth.uid()
        or exists (
          select 1 from public.tree_collaborators tc
          where tc.tree_id = ft.id
            and tc.profile_id = auth.uid()
            and tc.status = 'active'
            and tc.role in ('owner','editor')
        )
      )
  );
$$;

-- Enable row level security --------------------------------------------------
alter table public.family_trees enable row level security;
alter table public.tree_collaborators enable row level security;
alter table public.places enable row level security;
alter table public.persons enable row level security;
alter table public.person_events enable row level security;
alter table public.relationships enable row level security;
alter table public.sources enable row level security;
alter table public.citations enable row level security;
alter table public.notes enable row level security;
alter table public.media_items enable row level security;
alter table public.media_person_links enable row level security;
alter table public.media_event_links enable row level security;
alter table public.media_relationship_links enable row level security;
alter table public.dna_tests enable row level security;
alter table public.dna_matches enable row level security;
alter table public.audit_logs enable row level security;
alter table public.gedcom_imports enable row level security;

-- Policies ------------------------------------------------------------------
create policy "trees_select" on public.family_trees for select using (public.can_read_tree(id));
create policy "trees_write" on public.family_trees for all using (public.can_write_tree(id)) with check (public.can_write_tree(id));

create policy "collaborators_select" on public.tree_collaborators for select using (public.can_read_tree(tree_id));
create policy "collaborators_write" on public.tree_collaborators using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "places_select" on public.places for select using (public.can_read_tree(tree_id));
create policy "places_write" on public.places using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "persons_select" on public.persons for select using (public.can_read_tree(tree_id));
create policy "persons_write" on public.persons using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "person_events_select" on public.person_events for select using (exists (select 1 from public.persons p where p.id = person_id and public.can_read_tree(p.tree_id)));
create policy "person_events_write" on public.person_events using (exists (select 1 from public.persons p where p.id = person_id and public.can_write_tree(p.tree_id))) with check (exists (select 1 from public.persons p where p.id = person_id and public.can_write_tree(p.tree_id)));

create policy "relationships_select" on public.relationships for select using (public.can_read_tree(tree_id));
create policy "relationships_write" on public.relationships using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "sources_select" on public.sources for select using (public.can_read_tree(tree_id));
create policy "sources_write" on public.sources using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "citations_select" on public.citations for select using (public.can_read_tree(tree_id));
create policy "citations_write" on public.citations using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "notes_select" on public.notes for select using (public.can_read_tree(tree_id));
create policy "notes_write" on public.notes using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "media_select" on public.media_items for select using (public.can_read_tree(tree_id));
create policy "media_write" on public.media_items using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "media_person_link_select" on public.media_person_links for select using (exists (select 1 from public.persons p where p.id = person_id and public.can_read_tree(p.tree_id)));
create policy "media_person_link_write" on public.media_person_links using (exists (select 1 from public.persons p where p.id = person_id and public.can_write_tree(p.tree_id))) with check (exists (select 1 from public.persons p where p.id = person_id and public.can_write_tree(p.tree_id)));

create policy "media_event_link" on public.media_event_links for select using (true);
create policy "media_event_link_write" on public.media_event_links using (true) with check (true);

create policy "media_relationship_link" on public.media_relationship_links for select using (true);
create policy "media_relationship_link_write" on public.media_relationship_links using (true) with check (true);

create policy "dna_tests_select" on public.dna_tests for select using (exists (select 1 from public.persons p where p.id = person_id and public.can_read_tree(p.tree_id)));
create policy "dna_tests_write" on public.dna_tests using (exists (select 1 from public.persons p where p.id = person_id and public.can_write_tree(p.tree_id))) with check (exists (select 1 from public.persons p where p.id = person_id and public.can_write_tree(p.tree_id)));

create policy "dna_matches_select" on public.dna_matches for select using (exists (select 1 from public.persons p where p.id = person_id and public.can_read_tree(p.tree_id)));
create policy "dna_matches_write" on public.dna_matches using (exists (select 1 from public.persons p where p.id = person_id and public.can_write_tree(p.tree_id))) with check (exists (select 1 from public.persons p where p.id = person_id and public.can_write_tree(p.tree_id)));

create policy "audit_logs_select" on public.audit_logs for select using (public.can_read_tree(tree_id));
create policy "audit_logs_insert" on public.audit_logs for insert with check (public.can_write_tree(tree_id));

create policy "gedcom_imports_select" on public.gedcom_imports for select using (public.can_read_tree(tree_id));
create policy "gedcom_imports_write" on public.gedcom_imports using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));
