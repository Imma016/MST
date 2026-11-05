create table public.book_catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openlibrary', 'googlebooks')),
  provider_id text not null,
  title text not null check (char_length(title) between 1 and 500),
  authors text[] not null default '{}',
  description text not null default '',
  cover_url text,
  page_count integer check (page_count is null or page_count > 0),
  isbn_10 text,
  isbn_13 text,
  published_year integer check (published_year is null or published_year between 0 and 9999),
  subjects text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_id)
);

alter table public.book_catalog enable row level security;
revoke all on table public.book_catalog from anon, authenticated;
grant select, insert, update on table public.book_catalog to authenticated;

create policy "Signed-in users can read book catalog"
  on public.book_catalog for select to authenticated using (true);
create policy "Signed-in users can add books to catalog"
  on public.book_catalog for insert to authenticated with check (true);
create policy "Signed-in users can update book catalog"
  on public.book_catalog for update to authenticated using (true) with check (true);

create table public.user_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.book_catalog (id) on delete cascade,
  shelf text not null default 'want_to_read'
    check (shelf in ('currently_reading', 'finished', 'want_to_read', 'did_not_finish')),
  current_page integer not null default 0 check (current_page >= 0),
  started_on date,
  finished_on date,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create index user_books_user_shelf_added_idx
  on public.user_books (user_id, shelf, added_at desc);

alter table public.user_books enable row level security;
revoke all on table public.user_books from anon, authenticated;
grant select, insert, update, delete on table public.user_books to authenticated;

create policy "Users can read their own books"
  on public.user_books for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can add their own books"
  on public.user_books for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own books"
  on public.user_books for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can remove their own books"
  on public.user_books for delete to authenticated
  using ((select auth.uid()) = user_id);

create function public.set_book_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger book_catalog_set_updated_at
  before update on public.book_catalog
  for each row execute function public.set_book_updated_at();
create trigger user_books_set_updated_at
  before update on public.user_books
  for each row execute function public.set_book_updated_at();
