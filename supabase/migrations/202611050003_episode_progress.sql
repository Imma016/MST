create table public.user_episode_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items (id) on delete cascade,
  episode_id bigint not null,
  season_number integer not null check (season_number >= 0),
  episode_number integer not null check (episode_number >= 0),
  watched_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, catalog_item_id, episode_id)
);

create index user_episode_progress_user_item_idx
  on public.user_episode_progress (user_id, catalog_item_id, season_number, episode_number);

alter table public.user_episode_progress enable row level security;
revoke all on table public.user_episode_progress from anon, authenticated;
grant select, insert, update, delete on table public.user_episode_progress to authenticated;

create policy "Users can read their own episode progress"
  on public.user_episode_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can track their own episodes"
  on public.user_episode_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own episode dates"
  on public.user_episode_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can untrack their own episodes"
  on public.user_episode_progress for delete to authenticated
  using ((select auth.uid()) = user_id);

create function public.set_episode_progress_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger episode_progress_set_updated_at
  before update on public.user_episode_progress
  for each row execute function public.set_episode_progress_updated_at();
