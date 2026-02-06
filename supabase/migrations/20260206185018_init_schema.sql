-- Linegra Supabase schema initialization
-- Generated on 2026-02-06

-- Extensions -----------------------------------------------------------------
create extension if not exists "pgcrypto";

-- Enums ----------------------------------------------------------------------
create type gender_type as enum ('M', 'F', 'O');

create type relationship_type as enum (
  'marriage',
  'partner',
  'bio_father',
  'bio_mother',
  'adoptive_father',
  'adoptive_mother',
  'child',
  'step_parent',
  'guardian'
);

create type relationship_status as enum ('current', 'divorced', 'separated', 'widowed');

create type relationship_confidence as enum ('Confirmed', 'Probable', 'Assumed', 'Speculative', 'Unknown');

create type source_type as enum (
  'Book',
  'Church Record',
  'Probate Register',
  'Website',
  'Census',
  'Vital Record',
  'Military Record',
  'Unknown'
);

create type media_type as enum ('image', 'audio', 'video', 'document');
create type media_source as enum ('local', 'remote');
create type media_category as enum ('Portrait', 'Family', 'Location', 'Document', 'Event', 'Other');

create type dna_test_type as enum ('Autosomal', 'Y-DNA', 'mtDNA', 'X-DNA', 'Other');
create type dna_vendor as enum ('FamilyTreeDNA', 'AncestryDNA', '23andMe', 'MyHeritage', 'LivingDNA', 'Other');
create type dna_match_confidence as enum ('High', 'Medium', 'Low');

create type note_type as enum ('Generic', 'To-do', 'Research Note', 'Discrepancy');
create type death_cause_category as enum ('Natural', 'Disease', 'Accident', 'Suicide', 'Homicide', 'Military', 'Legal Execution', 'Other', 'Unknown');
create type alternate_name_type as enum (
  'Birth Name',
  'Nickname',
  'Alias',
  'Married Name',
  'Anglicized Name',
  'Legal Name Change',
  'Also Known As',
  'Religious Name'
);

create type collaboration_role as enum ('owner', 'editor', 'viewer');
create type collaboration_status as enum ('invited', 'active', 'revoked', 'left');

create type import_status as enum ('pending', 'processing', 'completed', 'failed');

-- Helper functions -----------------------------------------------------------
-- Tables ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  display_name text,
  avatar_url text,
  role text default 'researcher',
  timezone text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_trees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  theme_color text,
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index family_trees_owner_name_idx on public.family_trees (owner_id, lower(name));

create table public.tree_collaborators (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  invitation_email text,
  role collaboration_role not null default 'editor',
  status collaboration_status not null default 'invited',
  added_by uuid references public.profiles (id),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  notes text,
  constraint tree_collaborators_identity check (profile_id is not null or invitation_email is not null)
);

create unique index tree_collaborators_profile_idx
  on public.tree_collaborators (tree_id, profile_id)
  where profile_id is not null;

create unique index tree_collaborators_email_idx
  on public.tree_collaborators (tree_id, lower(invitation_email))
  where invitation_email is not null;

-- Helper functions that depend on tables -------------------------------------
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
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set
      full_name   = excluded.full_name,
      display_name = excluded.display_name,
      avatar_url  = excluded.avatar_url,
      updated_at  = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

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
              select 1
              from public.tree_collaborators tc
              where tc.tree_id = ft.id
                and tc.profile_id = auth.uid()
                and tc.status = 'active'
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
          select 1
          from public.tree_collaborators tc
          where tc.tree_id = ft.id
            and tc.profile_id = auth.uid()
            and tc.status = 'active'
            and tc.role in ('owner', 'editor')
        )
      )
  );
$$;

create table public.places (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  created_by uuid references public.profiles (id),
  full_text text not null,
  place_name text,
  street text,
  house_number text,
  floor text,
  apartment text,
  city text,
  parish text,
  county text,
  state text,
  country text,
  postal_code text,
  historical_name text,
  lat double precision,
  lng double precision,
  notes text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index places_dedup_idx on public.places (tree_id, lower(full_text), lower(coalesce(city, '')), lower(coalesce(state, '')), lower(coalesce(country, '')));

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  created_by uuid references public.profiles (id),
  first_name text not null,
  middle_name text,
  last_name text not null,
  maiden_name text,
  gender gender_type not null default 'O',
  birth_date date,
  birth_date_text text,
  birth_place_id uuid references public.places (id),
  birth_place_text text,
  death_date date,
  death_date_text text,
  death_place_id uuid references public.places (id),
  death_place_text text,
  death_cause text,
  death_cause_category death_cause_category,
  residence_at_death_id uuid references public.places (id),
  residence_at_death_text text,
  photo_url text,
  bio text,
  occupations text[] not null default '{}'::text[],
  generation int,
  user_role text,
  is_dna_match boolean not null default false,
  dna_match_info jsonb,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index persons_tree_idx on public.persons (tree_id);
create index persons_name_idx on public.persons (tree_id, lower(last_name), lower(first_name));

create table public.person_alternate_names (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id) on delete cascade,
  type alternate_name_type not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.person_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id) on delete cascade,
  event_type text not null,
  date_text text,
  date_start date,
  date_end date,
  place_id uuid references public.places (id),
  place_text text,
  description text,
  employer text,
  citations_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index person_events_person_idx on public.person_events (person_id, event_type);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  related_id uuid not null references public.persons (id) on delete cascade,
  type relationship_type not null,
  status relationship_status,
  date_text text,
  start_date date,
  end_date date,
  place_id uuid references public.places (id),
  place_text text,
  confidence relationship_confidence,
  notes text,
  sort_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index relationships_tree_idx on public.relationships (tree_id, person_id);
create index relationships_related_idx on public.relationships (related_id);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  created_by uuid references public.profiles (id),
  title text not null,
  type source_type not null,
  repository text,
  url text,
  citation_date_text text,
  page text,
  reliability smallint check (reliability between 1 and 3),
  actual_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sources_tree_idx on public.sources (tree_id, type);

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  person_id uuid references public.persons (id) on delete cascade,
  person_event_id uuid references public.person_events (id) on delete cascade,
  relationship_id uuid references public.relationships (id) on delete cascade,
  note_id uuid,
  label text,
  created_at timestamptz not null default now(),
  constraint citations_target check (
    person_id is not null
    or person_event_id is not null
    or relationship_id is not null
  )
);

create index citations_source_idx on public.citations (source_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  person_id uuid references public.persons (id) on delete cascade,
  person_event_id uuid references public.person_events (id) on delete cascade,
  relationship_id uuid references public.relationships (id) on delete cascade,
  created_by uuid references public.profiles (id),
  type note_type not null default 'Generic',
  body text not null,
  event_label text,
  note_date date,
  note_date_text text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_tree_idx on public.notes (tree_id);

alter table public.citations
  add constraint citations_note_fk
  foreign key (note_id) references public.notes (id) on delete set null;

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  uploaded_by uuid references public.profiles (id),
  storage_path text,
  url text,
  caption text not null,
  description text,
  type media_type not null,
  source media_source not null,
  category media_category,
  taken_at date,
  taken_at_text text,
  metadata jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_items_tree_idx on public.media_items (tree_id, category);

create table public.media_person_links (
  media_id uuid not null references public.media_items (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  role text,
  primary key (media_id, person_id)
);

create table public.media_event_links (
  media_id uuid not null references public.media_items (id) on delete cascade,
  person_event_id uuid not null references public.person_events (id) on delete cascade,
  primary key (media_id, person_event_id)
);

create table public.media_relationship_links (
  media_id uuid not null references public.media_items (id) on delete cascade,
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  primary key (media_id, relationship_id)
);

create table public.dna_tests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id) on delete cascade,
  type dna_test_type not null,
  vendor dna_vendor not null,
  test_number text,
  test_date date,
  test_date_text text,
  match_date date,
  match_date_text text,
  is_private boolean not null default true,
  haplogroup text,
  is_confirmed boolean not null default false,
  hvr1 text,
  hvr2 text,
  extra_mutations text,
  coding_region text,
  most_distant_ancestor_id uuid references public.persons (id),
  notes text,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dna_tests_person_idx on public.dna_tests (person_id, type);

create table public.dna_matches (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons (id) on delete cascade,
  matched_person_id uuid references public.persons (id),
  external_match_name text,
  external_match_contact text,
  shared_cm numeric,
  segments int,
  longest_segment numeric,
  confidence dna_match_confidence,
  match_url text,
  common_ancestor_id uuid references public.persons (id),
  notes text,
  created_at timestamptz not null default now()
);

create index dna_matches_person_idx on public.dna_matches (person_id);

create table public.gedcom_imports (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  uploaded_by uuid references public.profiles (id),
  file_name text not null,
  file_size bigint,
  status import_status not null default 'pending',
  started_at timestamptz default now(),
  completed_at timestamptz,
  error_message text,
  stats jsonb not null default '{}'::jsonb
);

-- Row Level Security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.family_trees enable row level security;
alter table public.tree_collaborators enable row level security;
alter table public.places enable row level security;
alter table public.persons enable row level security;
alter table public.person_alternate_names enable row level security;
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
alter table public.gedcom_imports enable row level security;

-- Profile policies
create policy "Public profiles are readable" on public.profiles
  for select using (true);

create policy "Users manage their profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Family tree policies
create policy "Tree read access" on public.family_trees
  for select using (public.can_read_tree(id));

create policy "Tree insert requires ownership" on public.family_trees
  for insert with check (auth.uid() = owner_id);

create policy "Tree update/delete requires ownership" on public.family_trees
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Collaborator policies
create policy "Collaborators readable to members" on public.tree_collaborators
  for select using (public.can_read_tree(tree_id));

create policy "Manage collaborators with write access" on public.tree_collaborators
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

-- Places policies
create policy "Places readable to members" on public.places
  for select using (public.can_read_tree(tree_id));

create policy "Places manageable by writers" on public.places
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

-- Person level policies
create policy "Persons readable to members" on public.persons
  for select using (public.can_read_tree(tree_id));

create policy "Persons manageable by writers" on public.persons
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "Alternate names readable to members" on public.person_alternate_names
  for select using (public.can_read_tree((select tree_id from public.persons p where p.id = person_id)));

create policy "Alternate names manageable by writers" on public.person_alternate_names
  using (public.can_write_tree((select tree_id from public.persons p where p.id = person_id)))
  with check (public.can_write_tree((select tree_id from public.persons p where p.id = person_id)));

create policy "Events readable to members" on public.person_events
  for select using (public.can_read_tree((select tree_id from public.persons p where p.id = person_id)));

create policy "Events manageable by writers" on public.person_events
  using (public.can_write_tree((select tree_id from public.persons p where p.id = person_id)))
  with check (public.can_write_tree((select tree_id from public.persons p where p.id = person_id)));

create policy "Relationships readable to members" on public.relationships
  for select using (public.can_read_tree(tree_id));

create policy "Relationships manageable by writers" on public.relationships
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "Sources readable to members" on public.sources
  for select using (public.can_read_tree(tree_id));

create policy "Sources manageable by writers" on public.sources
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "Citations readable to members" on public.citations
  for select using (public.can_read_tree(tree_id));

create policy "Citations manageable by writers" on public.citations
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "Notes readable to members" on public.notes
  for select using (public.can_read_tree(tree_id));

create policy "Notes manageable by writers" on public.notes
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "Media readable to members" on public.media_items
  for select using (public.can_read_tree(tree_id));

create policy "Media manageable by writers" on public.media_items
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));

create policy "Media-person links readable to members" on public.media_person_links
  for select using (public.can_read_tree((select tree_id from public.media_items mi where mi.id = media_id)));

create policy "Media-person links manageable by writers" on public.media_person_links
  using (public.can_write_tree((select tree_id from public.media_items mi where mi.id = media_id)))
  with check (public.can_write_tree((select tree_id from public.media_items mi where mi.id = media_id)));

create policy "Media-event links readable to members" on public.media_event_links
  for select using (public.can_read_tree((select tree_id from public.media_items mi where mi.id = media_id)));

create policy "Media-event links manageable by writers" on public.media_event_links
  using (public.can_write_tree((select tree_id from public.media_items mi where mi.id = media_id)))
  with check (public.can_write_tree((select tree_id from public.media_items mi where mi.id = media_id)));

create policy "Media-relationship links readable to members" on public.media_relationship_links
  for select using (public.can_read_tree((select tree_id from public.media_items mi where mi.id = media_id)));

create policy "Media-relationship links manageable by writers" on public.media_relationship_links
  using (public.can_write_tree((select tree_id from public.media_items mi where mi.id = media_id)))
  with check (public.can_write_tree((select tree_id from public.media_items mi where mi.id = media_id)));

create policy "DNA tests readable to members" on public.dna_tests
  for select using (public.can_read_tree((select tree_id from public.persons p where p.id = person_id)));

create policy "DNA tests manageable by writers" on public.dna_tests
  using (public.can_write_tree((select tree_id from public.persons p where p.id = person_id)))
  with check (public.can_write_tree((select tree_id from public.persons p where p.id = person_id)));

create policy "DNA matches readable to members" on public.dna_matches
  for select using (public.can_read_tree((select tree_id from public.persons p where p.id = person_id)));

create policy "DNA matches manageable by writers" on public.dna_matches
  using (public.can_write_tree((select tree_id from public.persons p where p.id = person_id)))
  with check (public.can_write_tree((select tree_id from public.persons p where p.id = person_id)));

create policy "GEDCOM imports readable to writers" on public.gedcom_imports
  for select using (public.can_write_tree(tree_id));

create policy "GEDCOM imports manageable to writers" on public.gedcom_imports
  using (public.can_write_tree(tree_id)) with check (public.can_write_tree(tree_id));
