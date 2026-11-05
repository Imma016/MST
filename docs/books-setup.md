# MST Books

MST searches Google Books and Open Library in parallel. These are public search APIs, so there is no new secret to add and no paid package to install. The [Google Books volumes list](https://developers.google.com/books/docs/v1/reference/volumes/list) returns covers, authors, publication date, and page count when available. [Open Library Search](https://openlibrary.org/dev/docs/api/search) provides alternate editions, authors, publication year, ISBNs, and cover IDs.

## Add the Books tables

In Supabase **SQL Editor**, create a new query, paste all of `supabase/migrations/202611050004_books_library.sql`, then run it. `book_catalog` stores shared metadata; `user_books` stores each signed-in user's shelves and progress with Row Level Security.

## Try it in MST

Refresh the local app, open **Books**, sign in, and search by title or author. Results identify their source and combine likely duplicates. Add a book to **Want to read**, open **My shelves**, and change its shelf to **Reading** to enter page progress. When the page count is known, MST shows a percentage and marks the book finished when progress reaches the total. Shelf state and page/date progress belong to the signed-in account.

Book descriptions, page counts, ISBNs, covers, and dates are not available for every result. MST displays a cover placeholder or “unknown” value when a source does not provide that information. Open Library and Google Books remain independent catalogs, so a few duplicate editions may still appear.
