-- MST account foundation.
-- Personal library tables will be added in later migrations and will use the
-- same user_id + Row Level Security pattern.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'MST member'
    check (char_length(display_name) between 1 and 60),
  avatar_url text,
  profile_visibility text not null default 'private'
    check (profile_visibility in ('private', 'friends', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, profile_visibility)
  on table public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 60), ''),
    nullif(left(split_part(coalesce(new.email, ''), '@', 1), 60), ''),
    'MST member'
  );

  insert into public.profiles (id, display_name)
  values (new.id, chosen_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Admin membership is managed only from the Supabase SQL editor. No app user
-- can inspect or modify this table.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create function public.record_my_activity()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set last_active_at = now()
  where id = (select auth.uid())
    and last_active_at < now() - interval '15 minutes';
$$;

revoke all on function public.record_my_activity() from public, anon;
grant execute on function public.record_my_activity() to authenticated;

create function public.owner_overview()
returns table (
  total_accounts bigint,
  active_last_30_days bigint,
  new_last_30_days bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    select
      count(*)::bigint,
      count(*) filter (where p.last_active_at >= now() - interval '30 days')::bigint,
      count(*) filter (where p.created_at >= now() - interval '30 days')::bigint
    from public.profiles as p;
end;
$$;

revoke all on function public.owner_overview() from public, anon;
grant execute on function public.owner_overview() to authenticated;
