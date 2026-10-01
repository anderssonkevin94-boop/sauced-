-- Sauced: run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Then set your kitchen code with the last statement at the bottom.

-- ── Kitchen code (private; nobody can read it through the API) ─────────────
create table if not exists public.kitchen_settings (
  id int primary key default 1 check (id = 1),
  invite_code text not null
);
alter table public.kitchen_settings enable row level security;
-- No policies: only the join_kitchen() function below can see it.

-- ── People ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Joining requires the kitchen code. Re-running it just renames you.
create or replace function public.join_kitchen(code text, name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not exists (
    select 1 from public.kitchen_settings
    where lower(trim(invite_code)) = lower(trim(code))
  ) then
    raise exception 'That kitchen code is not right';
  end if;
  insert into public.profiles (id, display_name)
  values (auth.uid(), trim(name))
  on conflict (id) do update set display_name = excluded.display_name;
end;
$$;

revoke all on function public.join_kitchen(text, text) from public, anon;
grant execute on function public.join_kitchen(text, text) to authenticated;

-- ── Recipes ────────────────────────────────────────────────────────────────
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind text not null default 'experiment' check (kind in ('experiment', 'classic')),
  ingredients text[] not null default '{}',
  steps text[] not null default '{}',
  notes text not null default '',
  serves text,
  time text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_updated_at_idx on public.recipes (updated_at desc);
alter table public.recipes enable row level security;

drop policy if exists "members read recipes" on public.recipes;
create policy "members read recipes" on public.recipes
  for select to authenticated using (public.is_member());

drop policy if exists "members add recipes" on public.recipes;
create policy "members add recipes" on public.recipes
  for insert to authenticated with check (author_id = auth.uid() and public.is_member());

drop policy if exists "authors edit recipes" on public.recipes;
create policy "authors edit recipes" on public.recipes
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "authors delete recipes" on public.recipes;
create policy "authors delete recipes" on public.recipes
  for delete to authenticated using (author_id = auth.uid());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

-- ── Photos ─────────────────────────────────────────────────────────────────
-- Public bucket: files have unguessable names; only members can upload.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "members upload own photos" on storage.objects;
create policy "members upload own photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_member()
  );

drop policy if exists "members read own photos" on storage.objects;
create policy "members read own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members delete own photos" on storage.objects;
create policy "members delete own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Kitchen code: friends type this once when they first sign in ───────────
-- Change it to something only your group knows:
--   update public.kitchen_settings set invite_code = 'your-secret-word';
insert into public.kitchen_settings (id, invite_code)
values (1, 'change-me')
on conflict (id) do nothing;
