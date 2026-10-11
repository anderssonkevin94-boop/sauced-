-- Sauced: drafts, lists sent between cooks, and the feed (posts, comments, Edwards).
-- Run in the Supabase SQL editor after schema.sql. Safe to run again.

-- ── Drafts: a recipe only its author sees until they publish it ───────────
alter table public.recipes add column if not exists draft boolean not null default false;

drop policy if exists "members read recipes" on public.recipes;
create policy "members read recipes" on public.recipes
  for select to authenticated using (public.is_member() and (not draft or author_id = auth.uid()));

drop policy if exists "members edit recipes" on public.recipes;
create policy "members edit recipes" on public.recipes
  for update to authenticated
  using (public.is_member() and (not draft or author_id = auth.uid()))
  with check (public.is_member());

-- A new recipe tells the kitchen when it's published: added as one, or a draft made public.
create or replace function public.notify_new_recipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.draft or (tg_op = 'UPDATE' and not old.draft) then
    return new;
  end if;
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
drop trigger if exists recipes_notify_publish on public.recipes;
create trigger recipes_notify_publish after update of draft on public.recipes
  for each row execute function public.notify_new_recipe();

-- ── Notifications for the new things below ────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('cooked_with', 'reply', 'new_recipe', 'cooked_yours', 'list', 'post', 'post_comment', 'post_edward'));

-- ── Shopping lists sent to another cook (a copy; lists live on each phone) ─
create table if not exists public.shared_lists (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  recipes jsonb not null default '[]' check (jsonb_typeof(recipes) = 'array' and jsonb_array_length(recipes) <= 100),
  items text[] not null default '{}' check (cardinality(items) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists shared_lists_to_idx on public.shared_lists (to_id, created_at desc);
alter table public.shared_lists enable row level security;

drop policy if exists "send lists" on public.shared_lists;
create policy "send lists" on public.shared_lists
  for insert to authenticated with check (from_id = auth.uid() and to_id <> auth.uid() and public.is_member());
drop policy if exists "read own lists" on public.shared_lists;
create policy "read own lists" on public.shared_lists
  for select to authenticated using (to_id = auth.uid() or from_id = auth.uid());
drop policy if exists "dismiss own lists" on public.shared_lists;
create policy "dismiss own lists" on public.shared_lists
  for delete to authenticated using (to_id = auth.uid() or from_id = auth.uid());

create or replace function public.notify_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, actor_id, kind, body)
  values (new.to_id, new.from_id, 'list',
    concat_ws(', ',
      nullif(jsonb_array_length(new.recipes), 0) || case when jsonb_array_length(new.recipes) = 1 then ' recipe' else ' recipes' end,
      nullif(cardinality(new.items), 0) || case when cardinality(new.items) = 1 then ' item' else ' items' end));
  return new;
end;
$$;
drop trigger if exists shared_lists_notify on public.shared_lists;
create trigger shared_lists_notify after insert on public.shared_lists
  for each row execute function public.notify_list();

-- ── Feed: a cook or a recipe posted to the kitchen, with a photo, comment and rating ─
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  cooked_id uuid references public.cooked (id) on delete set null,
  body text not null default '' check (char_length(body) <= 500),
  photo_path text,
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_recipe_idx on public.posts (recipe_id);
alter table public.posts enable row level security;

-- A post about a draft stays hidden with it (the recipes policy applies inside).
drop policy if exists "members read posts" on public.posts;
create policy "members read posts" on public.posts
  for select to authenticated using (public.is_member() and exists (select 1 from public.recipes r where r.id = recipe_id));
drop policy if exists "members post" on public.posts;
create policy "members post" on public.posts
  for insert to authenticated with check (author_id = auth.uid() and public.is_member());
drop policy if exists "authors edit posts" on public.posts;
create policy "authors edit posts" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "authors delete posts" on public.posts;
create policy "authors delete posts" on public.posts
  for delete to authenticated using (author_id = auth.uid());

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;

drop policy if exists "members read post comments" on public.post_comments;
create policy "members read post comments" on public.post_comments
  for select to authenticated using (public.is_member());
drop policy if exists "members comment" on public.post_comments;
create policy "members comment" on public.post_comments
  for insert to authenticated with check (author_id = auth.uid() and public.is_member());
drop policy if exists "authors remove comments" on public.post_comments;
create policy "authors remove comments" on public.post_comments
  for delete to authenticated using (author_id = auth.uid());

-- An Edward: a thumbs up on a post, one per person.
create table if not exists public.post_edwards (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_edwards enable row level security;

drop policy if exists "members read edwards" on public.post_edwards;
create policy "members read edwards" on public.post_edwards
  for select to authenticated using (public.is_member());
drop policy if exists "members give edwards" on public.post_edwards;
create policy "members give edwards" on public.post_edwards
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
drop policy if exists "members take back edwards" on public.post_edwards;
create policy "members take back edwards" on public.post_edwards
  for delete to authenticated using (user_id = auth.uid());

alter table public.notifications add column if not exists post_id uuid references public.posts (id) on delete cascade;

-- A post tells the kitchen; a comment tells the poster and earlier commenters; an Edward tells the poster.
create or replace function public.notify_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, actor_id, kind, recipe_id, post_id, body)
  select p.id, new.author_id, 'post', new.recipe_id, new.id, left(new.body, 140)
  from public.profiles p
  where p.id <> new.author_id;
  return new;
end;
$$;
drop trigger if exists posts_notify on public.posts;
create trigger posts_notify after insert on public.posts
  for each row execute function public.notify_post();

create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, actor_id, kind, recipe_id, post_id, body)
  select who, new.author_id, 'post_comment', (select recipe_id from public.posts where id = new.post_id), new.post_id, left(new.body, 140)
  from (
    select author_id as who from public.posts where id = new.post_id
    union
    select author_id from public.post_comments where post_id = new.post_id and id <> new.id
  ) people
  where who <> new.author_id;
  return new;
end;
$$;
drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify after insert on public.post_comments
  for each row execute function public.notify_post_comment();

create or replace function public.notify_post_edward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, actor_id, kind, recipe_id, post_id, body)
  select p.author_id, new.user_id, 'post_edward', p.recipe_id, p.id, ''
  from public.posts p
  where p.id = new.post_id and p.author_id <> new.user_id;
  return new;
end;
$$;
drop trigger if exists post_edwards_notify on public.post_edwards;
create trigger post_edwards_notify after insert on public.post_edwards
  for each row execute function public.notify_post_edward();
