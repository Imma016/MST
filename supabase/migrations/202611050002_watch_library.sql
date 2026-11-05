create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'tmdb' check (provider = 'tmdb'),
  provider_id bigint not null,
  media_type text not null check (media_type in ('tv', 'movie')),
  title text not null check (char_length(title) between 1 and 300),
  overview text not null default '',
  poster_path text,
  backdrop_path text,
  original_language text,
  release_date date,
  genre_ids integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_id, media_type)
);

alter table public.catalog_items enable row level security;
revoke all on table public.catalog_items from anon, authenticated;
grant select, insert, update on table public.catalog_items to authenticated;

create policy "Signed-in users can read catalog items"
  on public.catalog_items for select to authenticated using (true);
create policy "Signed-in users can add catalog items"
  on public.catalog_items for insert to authenticated with check (true);
create policy "Signed-in users can update catalog items"
  on public.catalog_items for update to authenticated using (true) with check (true);

create table public.user_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items (id) on delete cascade,
  category text not null check (category in ('tv', 'movie', 'anime')),
  status text not null default 'plan_to_watch'
    check (status in ('watching', 'completed', 'plan_to_watch', 'on_hold', 'dropped')),
  is_favorite boolean not null default false,
  added_at timestamptz not null default now(),
  watched_at date,
  unique (user_id, catalog_item_id)
);

create index user_library_user_category_added_idx
  on public.user_library (user_id, category, added_at desc);

alter table public.user_library enable row level security;
revoke all on table public.user_library from anon, authenticated;
grant select, insert, update, delete on table public.user_library to authenticated;

create policy "Users can read their own library"
  on public.user_library for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can add to their own library"
  on public.user_library for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own library"
  on public.user_library for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can remove from their own library"
  on public.user_library for delete to authenticated
  using ((select auth.uid()) = user_id);

create function public.set_catalog_item_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger catalog_items_set_updated_at
  before update on public.catalog_items
  for each row execute function public.set_catalog_item_updated_at();
