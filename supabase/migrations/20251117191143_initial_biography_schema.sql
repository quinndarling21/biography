-- Initial domain schema for the Biography builder.
-- Includes user profile metadata, chapters, entries, and RLS policies.

begin;

-- Ensure UUID generation helpers are available.
create extension if not exists "pgcrypto" with schema public;

-- Domain enums --------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'chapter_entry_type'
  ) then
    create type public.chapter_entry_type as enum (
      'milestone',
      'memory',
      'story'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'chapter_entry_date_granularity'
  ) then
    create type public.chapter_entry_date_granularity as enum (
      'day',
      'month',
      'year'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'chapter_entry_status'
  ) then
    create type public.chapter_entry_status as enum (
      'draft',
      'published',
      'archived'
    );
  end if;
end;
$$;

-- Timestamp helper used by every table with an updated_at column.
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- Users

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.users is
  'Application-level profile metadata stored alongside auth.users.';

create trigger set_users_updated_at
before update on public.users
for each row
execute procedure public.handle_updated_at();

alter table public.users enable row level security;

create policy "Users can read their own profile"
  on public.users
  for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.users
  for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-------------------------------------------------------------------------------
-- Chapters

create table if not exists public.user_chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  position integer not null default 0,
  title text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.user_chapters is
  'High-level sections of a user''s story (chapters).';

create index if not exists user_chapters_user_idx
  on public.user_chapters (user_id);

create trigger set_user_chapters_updated_at
before update on public.user_chapters
for each row
execute procedure public.handle_updated_at();

alter table public.user_chapters enable row level security;

create policy "Users can read their chapters"
  on public.user_chapters
  for select
  using (user_id = auth.uid());

create policy "Users manage their chapters"
  on public.user_chapters
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-------------------------------------------------------------------------------
-- Chapter entries

create table if not exists public.chapter_entries (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.user_chapters (id) on delete cascade,
  entry_type public.chapter_entry_type not null,
  entry_date date,
  date_granularity public.chapter_entry_date_granularity not null default 'day',
  title text not null,
  summary text,
  body jsonb not null default '{}'::jsonb,
  status public.chapter_entry_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.chapter_entries is
  'Milestones, memories, or stories captured inside a chapter.';

create index if not exists chapter_entries_chapter_idx
  on public.chapter_entries (chapter_id);

create trigger set_chapter_entries_updated_at
before update on public.chapter_entries
for each row
execute procedure public.handle_updated_at();

alter table public.chapter_entries enable row level security;

create policy "Users can read their chapter entries"
  on public.chapter_entries
  for select
  using (
    exists (
      select 1
      from public.user_chapters uc
      where uc.id = chapter_entries.chapter_id
        and uc.user_id = auth.uid()
    )
  );

create policy "Users manage their chapter entries"
  on public.chapter_entries
  for all
  using (
    exists (
      select 1
      from public.user_chapters uc
      where uc.id = chapter_entries.chapter_id
        and uc.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.user_chapters uc
      where uc.id = chapter_entries.chapter_id
        and uc.user_id = auth.uid()
    )
  );

commit;
