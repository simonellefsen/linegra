alter table public.persons
  add column if not exists burial_date date,
  add column if not exists burial_date_text text,
  add column if not exists burial_place_id uuid references public.places (id),
  add column if not exists burial_place_text text;
