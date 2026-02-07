-- Audit log table captures user actions across the archive

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid references public.family_trees (id) on delete cascade,
  actor_id text,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_tree_idx on public.audit_logs (tree_id, created_at desc);

alter table public.audit_logs enable row level security;

create policy "Audit logs readable to tree members" on public.audit_logs
  for select using (public.can_read_tree(tree_id));

create policy "Audit logs writeable to tree writers" on public.audit_logs
  for insert with check (public.can_write_tree(tree_id));
