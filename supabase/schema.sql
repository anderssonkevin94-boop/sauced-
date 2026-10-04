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
-- Variations remember the recipe they were made from.
alter table public.recipes add column if not exists based_on uuid references public.recipes (id) on delete set null;
create index if not exists recipes_based_on_idx on public.recipes (based_on);
-- What the importer last produced ({ingredients, steps, kept}), so a re-import keeps the cook's own edits.
alter table public.recipes add column if not exists imported jsonb;
alter table public.recipes enable row level security;

drop policy if exists "members read recipes" on public.recipes;
create policy "members read recipes" on public.recipes
  for select to authenticated using (public.is_member());

drop policy if exists "members add recipes" on public.recipes;
create policy "members add recipes" on public.recipes
  for insert to authenticated with check (author_id = auth.uid() and public.is_member());

-- Everyone in the kitchen can edit every recipe; only its author can delete it.
drop policy if exists "authors edit recipes" on public.recipes;
drop policy if exists "members edit recipes" on public.recipes;
create policy "members edit recipes" on public.recipes
  for update to authenticated using (public.is_member()) with check (public.is_member());

-- Editing never changes whose recipe it is.
create or replace function public.keep_author()
returns trigger
language plpgsql
as $$
begin
  new.author_id = old.author_id;
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists recipes_keep_author on public.recipes;
create trigger recipes_keep_author before update on public.recipes
  for each row execute function public.keep_author();

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

-- Replacing a photo at the same address: old photos compressed in place (lib/photo-sweep.ts).
drop policy if exists "members update own photos" on storage.objects;
create policy "members update own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());

drop policy if exists "members delete own photos" on storage.objects;
create policy "members delete own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Cook log: every time someone makes a recipe ────────────────────────────
create table if not exists public.cooked (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  cook_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  cooked_on date not null default current_date,
  note text not null default '' check (char_length(note) <= 280),
  photo_path text,
  created_at timestamptz not null default now()
);
alter table public.cooked add column if not exists photo_path text;
-- A rating, 0.0 to 5.0 Edwards.
alter table public.cooked add column if not exists rating numeric(2,1);
alter table public.cooked drop constraint if exists cooked_rating_check;
alter table public.cooked add constraint cooked_rating_check check (rating is null or (rating >= 0 and rating <= 5));
-- Logging for the people you cooked with: who logged it, and one group per cook.
alter table public.cooked add column if not exists logged_by uuid references public.profiles (id) on delete set null;
alter table public.cooked alter column logged_by set default auth.uid();
update public.cooked set logged_by = cook_id where logged_by is null;
alter table public.cooked add column if not exists group_id uuid;
create index if not exists cooked_group_idx on public.cooked (group_id);
create index if not exists cooked_recipe_idx on public.cooked (recipe_id, cooked_on desc);
create index if not exists cooked_cook_idx on public.cooked (cook_id, cooked_on desc);
alter table public.cooked enable row level security;

drop policy if exists "members read cooked" on public.cooked;
create policy "members read cooked" on public.cooked
  for select to authenticated using (public.is_member());

drop policy if exists "members log own cooking" on public.cooked;
drop policy if exists "members log cooking" on public.cooked;
create policy "members log cooking" on public.cooked
  for insert to authenticated with check (
    logged_by = auth.uid()
    and public.is_member()
    and exists (select 1 from public.profiles p where p.id = cook_id)
  );

-- You can take yourself off a cook, and undo one you logged.
drop policy if exists "cooks remove own log" on public.cooked;
create policy "cooks remove own log" on public.cooked
  for delete to authenticated using (cook_id = auth.uid() or logged_by = auth.uid());

-- ── Replies to a cook's comment ────────────────────────────────────────────
create table if not exists public.cook_replies (
  id uuid primary key default gen_random_uuid(),
  cooked_id uuid not null references public.cooked (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists cook_replies_recipe_idx on public.cook_replies (recipe_id, created_at);
alter table public.cook_replies enable row level security;

drop policy if exists "members read replies" on public.cook_replies;
create policy "members read replies" on public.cook_replies
  for select to authenticated using (public.is_member());

drop policy if exists "members reply" on public.cook_replies;
create policy "members reply" on public.cook_replies
  for insert to authenticated with check (author_id = auth.uid() and public.is_member());

drop policy if exists "authors remove replies" on public.cook_replies;
create policy "authors remove replies" on public.cook_replies
  for delete to authenticated using (author_id = auth.uid());

-- The person who logged a cook can edit it (fix the comment, the photo, the day, who cooked).
drop policy if exists "loggers edit cooks" on public.cooked;
create policy "loggers edit cooks" on public.cooked
  for update to authenticated using (logged_by = auth.uid()) with check (logged_by = auth.uid());

-- Everyone on a cook gives their own Edwards score, and only their own.
create or replace function public.rate_cook(cook_row uuid, value numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if value is not null and (value < 0 or value > 5) then
    raise exception 'A rating is 0.0 to 5.0 Edwards';
  end if;
  update public.cooked set rating = round(value, 1) where id = cook_row and cook_id = auth.uid();
  if not found then
    raise exception 'That cook is not yours to rate';
  end if;
end;
$$;
revoke all on function public.rate_cook(uuid, numeric) from public, anon;
grant execute on function public.rate_cook(uuid, numeric) to authenticated;

-- ── Notifications (written only by the triggers below) ─────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  kind text not null,
  recipe_id uuid references public.recipes (id) on delete cascade,
  cooked_id uuid references public.cooked (id) on delete cascade,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('cooked_with', 'reply', 'new_recipe', 'cooked_yours'));
alter table public.notifications enable row level security;

drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "mark own notifications" on public.notifications;
create policy "mark own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "clear own notifications" on public.notifications;
create policy "clear own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- A cook: tell the people logged with you, and the recipe's author (once per cook).
create or replace function public.notify_cooked_with()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  if new.logged_by is not null and new.cook_id <> new.logged_by then
    insert into public.notifications (user_id, actor_id, kind, recipe_id, cooked_id, body)
    values (new.cook_id, new.logged_by, 'cooked_with', new.recipe_id, new.id, left(new.note, 140));
  end if;
  -- The logger's own row stands for the whole cook.
  if new.logged_by is null or new.cook_id = new.logged_by then
    select author_id into author from public.recipes where id = new.recipe_id;
    if author is not null and author <> new.cook_id
       and not exists (select 1 from public.cooked c where c.group_id = new.group_id and c.cook_id = author and new.group_id is not null) then
      insert into public.notifications (user_id, actor_id, kind, recipe_id, cooked_id, body)
      values (author, new.cook_id, 'cooked_yours', new.recipe_id, new.id, left(new.note, 140));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists cooked_notify on public.cooked;
create trigger cooked_notify after insert on public.cooked
  for each row execute function public.notify_cooked_with();

-- A reply: tell everyone on that cook and everyone who replied before, except the replier.
create or replace function public.notify_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g uuid;
begin
  select group_id into g from public.cooked where id = new.cooked_id;
  insert into public.notifications (user_id, actor_id, kind, recipe_id, cooked_id, body)
  select who, new.author_id, 'reply', new.recipe_id, new.cooked_id, left(new.body, 140)
  from (
    select c.cook_id as who from public.cooked c
      where c.id = new.cooked_id or (g is not null and c.group_id = g)
    union
    select r.author_id from public.cook_replies r
      where r.cooked_id = new.cooked_id and r.id <> new.id
  ) people
  where who <> new.author_id;
  return new;
end;
$$;
-- A new recipe: tell everyone else in the kitchen.
create or replace function public.notify_new_recipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, actor_id, kind, recipe_id, body)
  select p.id, new.author_id, 'new_recipe', new.id, ''
  from public.profiles p
  where p.id <> new.author_id;
  return new;
end;
$$;
drop trigger if exists recipes_notify on public.recipes;
create trigger recipes_notify after insert on public.recipes
  for each row execute function public.notify_new_recipe();

drop trigger if exists replies_notify on public.cook_replies;
create trigger replies_notify after insert on public.cook_replies
  for each row execute function public.notify_reply();

-- ── Pairings: recipes that go well together (one row per pair, a < b) ──────
create table if not exists public.pairings (
  a uuid not null references public.recipes (id) on delete cascade,
  b uuid not null references public.recipes (id) on delete cascade,
  added_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists pairings_b_idx on public.pairings (b);
alter table public.pairings enable row level security;

drop policy if exists "members read pairings" on public.pairings;
create policy "members read pairings" on public.pairings
  for select to authenticated using (public.is_member());

drop policy if exists "members add pairings" on public.pairings;
create policy "members add pairings" on public.pairings
  for insert to authenticated with check (added_by = auth.uid() and public.is_member());

drop policy if exists "members remove pairings" on public.pairings;
create policy "members remove pairings" on public.pairings
  for delete to authenticated using (public.is_member());

-- ── Kitchen code: friends type this once when they first sign in ───────────
-- Change it to something only your group knows:
--   update public.kitchen_settings set invite_code = 'your-secret-word';
insert into public.kitchen_settings (id, invite_code)
values (1, 'change-me')
on conflict (id) do nothing;

-- ── Claude spending: counted by the app, seen only by the kitchen's owner ─────
alter table public.kitchen_settings add column if not exists owner_id uuid references public.profiles (id) on delete set null;
alter table public.kitchen_settings add column if not exists ai_credits_usd numeric(10,2);
-- Set once: update public.kitchen_settings set owner_id = '<your profile id>' where id = 1;

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles (id) on delete set null,
  purpose text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  web_searches integer not null default 0,
  cost_usd numeric(12,6) not null default 0
);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
alter table public.ai_usage enable row level security;
-- No policies: written by log_ai_usage(), read through ai_spend().

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.kitchen_settings where id = 1 and owner_id = auth.uid());
$$;

-- A member's session, or a valid import key (the share sheet), may log a Claude call.
create or replace function public.log_ai_usage(
  key text, purpose text, model text,
  input_tokens integer, output_tokens integer, cache_read_tokens integer, cache_write_tokens integer,
  web_searches integer, cost_usd numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_member() then
    select k.user_id into uid from public.import_keys k
    where length(coalesce(key, '')) between 20 and 100 and k.key_hash = public.import_key_hash(key);
  end if;
  if uid is null then
    raise exception 'Not allowed';
  end if;
  if cost_usd < 0 or cost_usd > 20 then
    raise exception 'Implausible cost';
  end if;
  insert into public.ai_usage (user_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, cost_usd)
  values (uid, left(purpose, 40), left(model, 80), greatest(input_tokens, 0), greatest(output_tokens, 0),
          greatest(cache_read_tokens, 0), greatest(cache_write_tokens, 0), greatest(web_searches, 0), cost_usd);
end;
$$;
revoke all on function public.log_ai_usage(text, text, text, integer, integer, integer, integer, integer, numeric) from public;
grant execute on function public.log_ai_usage(text, text, text, integer, integer, integer, integer, integer, numeric) to anon, authenticated;

-- The owner's spending summary; nobody else gets a row at all.
create or replace function public.ai_spend()
returns table (month_usd numeric, total_usd numeric, month_calls bigint, total_calls bigint, credits_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select t.* from (
    select
      coalesce(sum(u.cost_usd) filter (where u.created_at >= date_trunc('month', now())), 0),
      coalesce(sum(u.cost_usd), 0),
      count(*) filter (where u.created_at >= date_trunc('month', now())),
      count(*),
      (select s.ai_credits_usd from public.kitchen_settings s where s.id = 1)
    from public.ai_usage u
  ) t
  where public.is_owner();
$$;
revoke all on function public.ai_spend() from public, anon;
grant execute on function public.ai_spend() to authenticated;

create or replace function public.set_ai_credits(amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the kitchen owner';
  end if;
  if amount is not null and (amount < 0 or amount > 100000) then
    raise exception 'Implausible amount';
  end if;
  update public.kitchen_settings set ai_credits_usd = amount where id = 1;
end;
$$;
revoke all on function public.set_ai_credits(numeric) from public, anon;
grant execute on function public.set_ai_credits(numeric) to authenticated;
