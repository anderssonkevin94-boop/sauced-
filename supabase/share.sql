-- Sauced: "Save to Sauced" from the iPhone share sheet (an Apple Shortcut).
-- Run once in the Supabase SQL editor, after schema.sql.
--
-- Each cook can create a personal import key in the app (You → Save from other apps).
-- Only a SHA-256 fingerprint of the key is stored. The Shortcut sends the key to
-- /api/share, which calls these functions with the public (anon) key: nobody can
-- read the keys table, and a recipe can only be saved with a valid key.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.import_keys (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.import_keys enable row level security;
-- No policies: only the functions below can touch it.

create or replace function public.import_key_hash(key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(coalesce(key, ''), 'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function public.import_key_hash(text) from public, anon, authenticated;

-- Create (or replace) the signed-in cook's key. Returns the key once; it can't be read back.
create or replace function public.new_import_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'Not a member of this kitchen';
  end if;
  k := 'sauced_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.import_keys (user_id, key_hash)
  values (auth.uid(), public.import_key_hash(k))
  on conflict (user_id) do update set key_hash = excluded.key_hash, created_at = now();
  return k;
end;
$$;
revoke all on function public.new_import_key() from public, anon;
grant execute on function public.new_import_key() to authenticated;

-- Whether the signed-in cook has a key (to show "set up" vs "connected").
create or replace function public.has_import_key()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.import_keys where user_id = auth.uid());
$$;
revoke all on function public.has_import_key() from public, anon;
grant execute on function public.has_import_key() to authenticated;

-- Turn off sharing for the signed-in cook (e.g. lost phone).
create or replace function public.revoke_import_key()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.import_keys where user_id = auth.uid();
$$;
revoke all on function public.revoke_import_key() from public, anon;
grant execute on function public.revoke_import_key() to authenticated;

-- Who a key belongs to (display name), or null. Lets /api/share refuse bad keys
-- before it fetches anything.
create or replace function public.import_key_owner(key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name
  from public.import_keys k
  join public.profiles p on p.id = k.user_id
  where length(coalesce(key, '')) between 20 and 100
    and k.key_hash = public.import_key_hash(key);
$$;
revoke all on function public.import_key_owner(text) from public;
grant execute on function public.import_key_owner(text) to anon, authenticated;

-- Save a recipe on behalf of the key's owner. Same limits as the app's own form. The site's
-- photo is kept by its https address (no session here to store it); the app copies it into the
-- photos bucket when the recipe is first opened. `imported` remembers what the importer made.
drop function if exists public.import_recipe(text, text, text[], text[], text, text, text);
create or replace function public.import_recipe(
  key text,
  title text,
  ingredients text[],
  steps text[],
  notes text,
  serves text,
  total_time text, -- "time" is reserved in Postgres
  photo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  rid uuid;
begin
  select k.user_id into uid
  from public.import_keys k
  where length(coalesce(key, '')) between 20 and 100
    and k.key_hash = public.import_key_hash(key);
  if uid is null then
    raise exception 'Unknown import key';
  end if;
  if coalesce(trim(title), '') = '' or char_length(title) > 120 then
    raise exception 'Bad title';
  end if;
  if coalesce(array_length(ingredients, 1), 0) > 150 or coalesce(array_length(steps, 1), 0) > 150
     or char_length(coalesce(notes, '')) > 5000
     or exists (select 1 from unnest(coalesce(ingredients, '{}') || coalesce(steps, '{}')) as l where char_length(l) > 1000) then
    raise exception 'Recipe too long';
  end if;

  insert into public.recipes (author_id, title, kind, ingredients, steps, notes, serves, time, photo_path, imported)
  values (
    uid,
    trim(title),
    'experiment',
    coalesce(ingredients, '{}'),
    coalesce(steps, '{}'),
    coalesce(notes, ''),
    nullif(trim(coalesce(serves, '')), ''),
    nullif(trim(coalesce(total_time, '')), ''),
    case when photo_url ~ '^https://[^\s]+$' and char_length(photo_url) <= 1000 then photo_url end,
    jsonb_build_object('ingredients', to_jsonb(coalesce(ingredients, '{}')), 'steps', to_jsonb(coalesce(steps, '{}')), 'kept', '[]'::jsonb)
  )
  returning id into rid;
  return rid;
end;
$$;
revoke all on function public.import_recipe(text, text, text[], text[], text, text, text, text) from public;
grant execute on function public.import_recipe(text, text, text[], text[], text, text, text, text) to anon, authenticated;
