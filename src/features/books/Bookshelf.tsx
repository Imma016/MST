import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../../lib/supabase';

type Provider = 'openlibrary' | 'googlebooks';
type Shelf = 'currently_reading' | 'finished' | 'want_to_read' | 'did_not_finish';
type BookResult = {
  provider: Provider;
  providerId: string;
  title: string;
  authors: string[];
  description: string;
  coverUrl: string | null;
  pageCount: number | null;
  isbn10: string | null;
  isbn13: string | null;
  publishedYear: number | null;
  subjects: string[];
  sources: Provider[];
};
type SavedBook = {
  id: string;
  book_id: string;
  shelf: Shelf;
  current_page: number;
  started_on: string | null;
  finished_on: string | null;
  book: {
    provider: Provider;
    provider_id: string;
    title: string;
    authors: string[];
    description: string;
    cover_url: string | null;
    page_count: number | null;
    isbn_10: string | null;
    isbn_13: string | null;
    published_year: number | null;
  } | null;
};
type OpenLibraryResponse = { docs?: Array<Record<string, unknown>> };
type GoogleBooksResponse = { items?: Array<{ id?: string; volumeInfo?: Record<string, unknown> }> };

const shelves: Array<{ id: Shelf; label: string }> = [
  { id: 'want_to_read', label: 'Want to read' },
  { id: 'currently_reading', label: 'Reading' },
  { id: 'finished', label: 'Finished' },
  { id: 'did_not_finish', label: 'Did not finish' },
];
const filterOptions: Array<{ id: Shelf | 'all'; label: string }> = [
  { id: 'all', label: 'All books' }, ...shelves,
];
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIsbn(value: string) {
  return value.replace(/[^0-9X]/gi, '').toUpperCase();
}

function normalizeOpenLibrary(doc: Record<string, unknown>): BookResult | null {
  const title = textValue(doc.title);
  const key = textValue(doc.key).split('/').pop() || '';
  if (!title || !key) return null;
  const isbns = Array.isArray(doc.isbn) ? doc.isbn.filter((item): item is string => typeof item === 'string') : [];
  const firstSentence = doc.first_sentence;
  const description = typeof firstSentence === 'string' ? firstSentence : Array.isArray(firstSentence) ? textValue(firstSentence[0]) : '';
  const authors = Array.isArray(doc.author_name) ? doc.author_name.filter((item): item is string => typeof item === 'string').slice(0, 5) : [];
  const subjects = Array.isArray(doc.subject) ? doc.subject.filter((item): item is string => typeof item === 'string').slice(0, 5) : [];
  const coverId = Number(doc.cover_i);
  return {
    provider: 'openlibrary', providerId: key, title, authors, description,
    coverUrl: Number.isInteger(coverId) && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false` : null,
    pageCount: Number.isFinite(Number(doc.number_of_pages_median)) && Number(doc.number_of_pages_median) > 0 ? Number(doc.number_of_pages_median) : null,
    isbn10: isbns.map(normalizeIsbn).find((isbn) => isbn.length === 10) ?? null,
    isbn13: isbns.map(normalizeIsbn).find((isbn) => isbn.length === 13) ?? null,
    publishedYear: Number.isFinite(Number(doc.first_publish_year)) ? Number(doc.first_publish_year) : null,
    subjects, sources: ['openlibrary'],
  };
}

function normalizeGoogleBooks(item: { id?: string; volumeInfo?: Record<string, unknown> }): BookResult | null {
  const info = item.volumeInfo ?? {};
  const title = textValue(info.title);
  if (!item.id || !title) return null;
  const authors = Array.isArray(info.authors) ? info.authors.filter((author): author is string => typeof author === 'string').slice(0, 5) : [];
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers as Array<{ type?: string; identifier?: string }> : [];
  const coverLinks = info.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined;
  const cover = coverLinks?.thumbnail || coverLinks?.smallThumbnail || '';
  const publishedDate = textValue(info.publishedDate);
  const year = Number(publishedDate.slice(0, 4));
  const subjects = Array.isArray(info.categories) ? info.categories.filter((item): item is string => typeof item === 'string').slice(0, 5) : [];
  return {
    provider: 'googlebooks', providerId: item.id, title, authors,
    description: textValue(info.description),
    coverUrl: cover ? cover.replace(/^http:/, 'https:') : null,
    pageCount: Number.isFinite(Number(info.pageCount)) && Number(info.pageCount) > 0 ? Number(info.pageCount) : null,
    isbn10: identifiers.find((identifier) => identifier.type === 'ISBN_10')?.identifier || null,
    isbn13: identifiers.find((identifier) => identifier.type === 'ISBN_13')?.identifier || null,
    publishedYear: Number.isFinite(year) ? year : null,
    subjects, sources: ['googlebooks'],
  };
}

function mergeResults(items: BookResult[]) {
  const merged = new Map<string, BookResult>();
  for (const item of items) {
    const isbn = normalizeIsbn(item.isbn13 || item.isbn10 || '');
    const author = item.authors[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
    const title = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = isbn ? `isbn:${isbn}` : `title:${title}:${author}`;
    const previous = merged.get(key);
    if (!previous) { merged.set(key, item); continue; }
    const richer = Number(Boolean(item.coverUrl)) + Number(Boolean(item.pageCount)) + Number(Boolean(item.description));
    const previousScore = Number(Boolean(previous.coverUrl)) + Number(Boolean(previous.pageCount)) + Number(Boolean(previous.description));
    const chosen = richer > previousScore ? item : previous;
    merged.set(key, { ...chosen, sources: Array.from(new Set([...previous.sources, ...item.sources])) });
  }
  return [...merged.values()];
}

function bookIdentityKeys(book: Pick<BookResult, 'provider' | 'providerId' | 'title' | 'authors' | 'isbn10' | 'isbn13'>) {
  const title = book.title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const author = book.authors[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  return [
    `provider:${book.provider}:${book.providerId}`,
    book.isbn13 ? `isbn:${normalizeIsbn(book.isbn13)}` : '',
    book.isbn10 ? `isbn:${normalizeIsbn(book.isbn10)}` : '',
    `title:${title}:${author}`,
  ].filter(Boolean);
}

export function Bookshelf() {
  const { session, loading: authLoading } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookResult[]>([]);
  const [saved, setSaved] = useState<SavedBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [addingId, setAddingId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [draftPages, setDraftPages] = useState<Record<string, string>>({});
  const [view, setView] = useState<'search' | 'library'>('search');
  const [filter, setFilter] = useState<Shelf | 'all'>('all');
  const [selectedBook, setSelectedBook] = useState<BookResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    setError('');
    if (!session || term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setResults([]);
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const openUrl = new URL('https://openlibrary.org/search.json');
      openUrl.searchParams.set('q', term);
      openUrl.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,isbn,number_of_pages_median,first_sentence,subject');
      openUrl.searchParams.set('limit', '12');
      const googleUrl = new URL('https://www.googleapis.com/books/v1/volumes');
      googleUrl.searchParams.set('q', term);
      googleUrl.searchParams.set('maxResults', '12');
      googleUrl.searchParams.set('printType', 'books');
      const [openResponse, googleResponse] = await Promise.allSettled([
        fetch(openUrl).then(async (response) => { if (!response.ok) throw new Error('Open Library search unavailable'); return response.json() as Promise<OpenLibraryResponse>; }),
        fetch(googleUrl).then(async (response) => { if (!response.ok) throw new Error('Google Books search unavailable'); return response.json() as Promise<GoogleBooksResponse>; }),
      ]);
      if (cancelled) return;
      const items: BookResult[] = [];
      if (openResponse.status === 'fulfilled') items.push(...(openResponse.value.docs ?? []).map(normalizeOpenLibrary).filter((item): item is BookResult => Boolean(item)));
      if (googleResponse.status === 'fulfilled') items.push(...(googleResponse.value.items ?? []).map(normalizeGoogleBooks).filter((item): item is BookResult => Boolean(item)));
      setResults(mergeResults(items).slice(0, 18));
      setSearching(false);
      if (openResponse.status === 'rejected' && googleResponse.status === 'rejected') setError('Book search is temporarily unavailable. Please try again shortly.');
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, session]);

  useEffect(() => {
    let cancelled = false;
    if (!session || !supabase) { setSaved([]); return; }
    setSaved([]);
    setLoadingLibrary(true);
    void supabase.from('user_books')
      .select('id, book_id, shelf, current_page, started_on, finished_on, book:book_catalog(provider, provider_id, title, authors, description, cover_url, page_count, isbn_10, isbn_13, published_year)')
      .eq('user_id', session.user.id).order('added_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        setLoadingLibrary(false);
        if (loadError) setError('Your books could not be loaded. Please refresh and try again.');
        else setSaved((data ?? []) as unknown as SavedBook[]);
      });
    return () => { cancelled = true; };
  }, [session]);

  const savedKeys = useMemo(() => new Set(saved.flatMap((entry) => entry.book ? bookIdentityKeys({
    provider: entry.book.provider, providerId: entry.book.provider_id, title: entry.book.title,
    authors: entry.book.authors, isbn10: entry.book.isbn_10, isbn13: entry.book.isbn_13,
  }) : [])), [saved]);
  const visibleSaved = useMemo(() => filter === 'all' ? saved : saved.filter((book) => book.shelf === filter), [filter, saved]);

  async function addBook(book: BookResult, shelf: Shelf = 'want_to_read') {
    if (!supabase || !session) return;
    const key = `${book.provider}:${book.providerId}`;
    setAddingId(key); setError(''); setNotice('');
    const { data: catalog, error: catalogError } = await supabase.from('book_catalog').upsert({
      provider: book.provider, provider_id: book.providerId, title: book.title, authors: book.authors,
      description: book.description, cover_url: book.coverUrl, page_count: book.pageCount,
      isbn_10: book.isbn10, isbn_13: book.isbn13, published_year: book.publishedYear, subjects: book.subjects,
    }, { onConflict: 'provider,provider_id' }).select('id').single();
    if (catalogError || !catalog) { setError('Could not save this book. Please try again.'); setAddingId(''); return; }
    const { data: libraryEntry, error: addError } = await supabase.from('user_books').insert({
      user_id: session.user.id, book_id: catalog.id, shelf,
      current_page: shelf === 'finished' ? book.pageCount ?? 0 : 0,
      started_on: shelf === 'currently_reading' ? today() : null,
      finished_on: shelf === 'finished' ? today() : null,
    }).select('id').single();
    setAddingId('');
    if (addError?.code === '23505') setNotice('This book is already on your shelves.');
    else if (addError || !libraryEntry) setError('The book was found, but could not be added to your shelves.');
    else {
      setNotice(`${book.title} added to ${shelves.find((item) => item.id === shelf)?.label ?? 'your shelves'}.`);
      setSaved((current) => [{
        id: libraryEntry.id, book_id: catalog.id, shelf,
        current_page: shelf === 'finished' ? book.pageCount ?? 0 : 0,
        started_on: shelf === 'currently_reading' ? today() : null,
        finished_on: shelf === 'finished' ? today() : null,
        book: { provider: book.provider, provider_id: book.providerId, title: book.title, authors: book.authors,
          description: book.description, cover_url: book.coverUrl, page_count: book.pageCount,
          isbn_10: book.isbn10, isbn_13: book.isbn13, published_year: book.publishedYear },
      }, ...current]);
    }
  }

  async function changeShelf(book: SavedBook, shelf: Shelf) {
    if (!supabase) return;
    setError('');
    const update: Record<string, string | number | null> = { shelf };
    if (shelf === 'currently_reading') { update.started_on = book.started_on || today(); update.finished_on = null; }
    else if (shelf === 'finished') {
      update.finished_on = today();
      if (book.book?.page_count) update.current_page = book.book.page_count;
    } else if (shelf === 'want_to_read' || shelf === 'did_not_finish') update.finished_on = null;
    const { error: updateError } = await supabase.from('user_books').update(update).eq('id', book.id);
    if (updateError) setError('Could not update this shelf. Please try again.');
    else {
      setSaved((current) => current.map((entry) => entry.id === book.id ? {
        ...entry, shelf, started_on: typeof update.started_on === 'string' ? update.started_on : entry.started_on,
        finished_on: typeof update.finished_on === 'string' ? update.finished_on : null,
        current_page: typeof update.current_page === 'number' ? update.current_page : entry.current_page,
      } : entry));
    }
  }

  async function savePageProgress(book: SavedBook) {
    if (!supabase) return;
    const raw = draftPages[book.id] ?? String(book.current_page);
    const page = Number(raw);
    if (!Number.isInteger(page) || page < 0 || (book.book?.page_count && page > book.book.page_count)) {
      setError(book.book?.page_count ? `Enter a page from 0 to ${book.book.page_count}.` : 'Enter a page number of 0 or more.');
      return;
    }
    const finished = Boolean(book.book?.page_count && page >= book.book.page_count);
    const update: Record<string, string | number | null> = {
      current_page: page,
      shelf: finished ? 'finished' : 'currently_reading',
      started_on: book.started_on || today(),
      finished_on: finished ? today() : null,
    };
    setEditingId(book.id); setError('');
    const { error: progressError } = await supabase.from('user_books').update(update).eq('id', book.id);
    setEditingId('');
    if (progressError) setError('Could not save reading progress. Please try again.');
    else setSaved((current) => current.map((entry) => entry.id === book.id ? {
      ...entry, current_page: page, shelf: finished ? 'finished' : 'currently_reading',
      started_on: book.started_on || today(), finished_on: finished ? today() : null,
    } : entry));
  }

  async function removeBook(id: string) {
    if (!supabase) return;
    const { error: removeError } = await supabase.from('user_books').delete().eq('id', id);
    if (removeError) setError('Could not remove this book. Please try again.');
    else setSaved((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <section className="books-page" aria-labelledby="books-title">
      <div className="books-heading"><div><p className="eyebrow">MST · YOUR PERSONAL LIBRARY</p><h1 id="books-title">Books</h1><p className="page-description">Search two book catalogs, keep your shelves, and pick up where you left off.</p></div><span className="books-heading-icon" aria-hidden="true">▤</span></div>
      <div className="library-tools books-tools">
        <div className="library-views" role="tablist" aria-label="Search books or view your shelves">
          <button type="button" role="tab" aria-selected={view === 'search'} className={view === 'search' ? 'is-active' : ''} onClick={() => setView('search')}>Search</button>
          <button type="button" role="tab" aria-selected={view === 'library'} className={view === 'library' ? 'is-active' : ''} onClick={() => setView('library')}>My shelves <span className="count-pill">{saved.length}</span></button>
        </div>
        {view === 'search' && <label className="media-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search books</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or author…" disabled={authLoading || !session} /></label>}
      </div>

      {view === 'library' && <div className="shelf-filters" role="tablist" aria-label="Filter books by shelf">{filterOptions.map((option) => <button type="button" key={option.id} role="tab" aria-selected={filter === option.id} className={filter === option.id ? 'is-active' : ''} onClick={() => setFilter(option.id)}>{option.label}{option.id !== 'all' && <span>{saved.filter((book) => book.shelf === option.id).length}</span>}</button>)}</div>}
      {!authLoading && !session && <div className="library-empty"><span className="empty-symbol">▤</span><h2>Sign in to start your shelves</h2><p>Your book list and reading progress stay private to your account.</p><button className="watch-primary" type="button" onClick={() => document.querySelector<HTMLButtonElement>('.tab-button:last-child')?.click()}>Go to Profile to sign in</button></div>}
      {error && <p className="watch-alert" role="alert">{error}</p>}
      {notice && <p className="watch-notice" role="status">{notice}</p>}

      {session && view === 'search' && <>
        {!query.trim() && <div className="watch-tip"><span aria-hidden="true">✦</span><p>Search books and covers from <strong>Google Books</strong> and <strong>Open Library</strong>. Results are combined when ISBN or title and author match.</p></div>}
        {searching && <div className="book-results-grid" aria-label="Searching">{Array.from({ length: 6 }, (_, index) => <div className="book-skeleton" key={index}><span /><i /><b /></div>)}</div>}
        {!searching && query.trim().length >= 2 && results.length === 0 && !error && <div className="library-empty compact-empty"><h2>No matches yet</h2><p>Try a different title or author name.</p></div>}
        {!searching && results.length > 0 && <div className="book-results-grid">{results.map((book) => {
          const key = `${book.provider}:${book.providerId}`;
          const alreadySaved = bookIdentityKeys(book).some((identity) => savedKeys.has(identity));
          return <article className="book-result-card" key={key}><BookCover path={book.coverUrl} title={book.title} /><div className="book-result-body"><span className="poster-type">{book.sources.map((source) => source === 'googlebooks' ? 'GOOGLE BOOKS' : 'OPEN LIBRARY').join(' + ')}</span><h2 title={book.title}>{book.title}</h2><p className="book-authors">{book.authors.join(', ') || 'Author unknown'}</p><p className="book-meta">{book.publishedYear || 'Publication year unknown'}{book.pageCount ? ` · ${book.pageCount} pages` : ''}</p><button type="button" className="book-detail-button" onClick={() => setSelectedBook(book)}>Book details</button><button type="button" className={`watch-primary add-title${alreadySaved ? ' is-added' : ''}`} disabled={alreadySaved || addingId === key} onClick={() => void addBook(book)}>{addingId === key ? 'Adding…' : alreadySaved ? '✓ On your shelves' : '+ Add to Want to read'}</button></div></article>;
        })}</div>}
      </>}

      {session && view === 'library' && <>
        {loadingLibrary ? <div className="book-results-grid" aria-label="Loading shelves">{Array.from({ length: 3 }, (_, index) => <div className="book-skeleton" key={index}><span /><i /><b /></div>)}</div> : visibleSaved.length === 0 ? <div className="library-empty"><span className="empty-symbol">▤</span><h2>{filter === 'all' ? 'Your shelves are ready' : `Nothing on ${shelves.find((shelf) => shelf.id === filter)?.label ?? 'this shelf'} yet`}</h2><p>Search for a book and add it to Want to read. You can move it to another shelf any time.</p><button className="watch-primary" type="button" onClick={() => setView('search')}>Find a book</button></div> : <div className="saved-book-list">{visibleSaved.map((entry) => {
          const book = entry.book;
          const pageCount = book?.page_count ?? null;
          const pageValue = draftPages[entry.id] ?? String(entry.current_page);
          const percent = pageCount ? Math.min(100, Math.round(entry.current_page / pageCount * 100)) : 0;
          return <article className="saved-book-card" key={entry.id}><BookCover path={book?.cover_url ?? null} title={book?.title ?? 'Saved book'} /><div className="saved-book-info"><span className="poster-type">{shelves.find((shelf) => shelf.id === entry.shelf)?.label.toUpperCase()}</span><h2>{book?.title ?? 'Saved book'}</h2><p className="book-authors">{book?.authors?.join(', ') || 'Author unknown'}</p><p className="book-meta">{book?.published_year ?? 'Publication year unknown'}{pageCount ? ` · ${pageCount} pages` : ''}{book?.isbn_13 ? ` · ISBN ${book.isbn_13}` : ''}</p>
            {entry.shelf === 'currently_reading' && <div className="reading-progress"><div className="reading-progress-label"><span>Reading progress</span><strong>{pageCount ? `${percent}%` : `${entry.current_page} pages`}</strong></div>{pageCount && <div className="season-progress-track"><span style={{ width: `${percent}%` }} /></div>}<div className="page-progress-controls"><label><span className="sr-only">Current page for {book?.title}</span><input type="number" min="0" max={pageCount ?? undefined} value={pageValue} onChange={(event) => setDraftPages((current) => ({ ...current, [entry.id]: event.target.value }))} aria-label={`Current page for ${book?.title}`} /><span>{pageCount ? `of ${pageCount}` : 'pages read'}</span></label><button type="button" className="episodes-link" disabled={editingId === entry.id} onClick={() => void savePageProgress(entry)}>{editingId === entry.id ? 'Saving…' : 'Save progress'}</button></div></div>}
            {entry.started_on && <p className="book-date-note">Started {entry.started_on}{entry.finished_on ? ` · Finished ${entry.finished_on}` : ''}</p>}
            <div className="saved-actions"><label><span className="sr-only">Shelf for {book?.title}</span><select value={entry.shelf} onChange={(event) => void changeShelf(entry, event.target.value as Shelf)}>{shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.label}</option>)}</select></label><button type="button" className="remove-title" onClick={() => void removeBook(entry.id)}>Remove</button></div>
          </div></article>;
        })}</div>}
      </>}
      {selectedBook && <BookDetailsDialog book={selectedBook} alreadySaved={bookIdentityKeys(selectedBook).some((key) => savedKeys.has(key))} adding={addingId === `${selectedBook.provider}:${selectedBook.providerId}`} onClose={() => setSelectedBook(null)} onAdd={(shelf) => void addBook(selectedBook, shelf)} onOpenShelves={() => { setSelectedBook(null); setView('library'); }} />}
    </section>
  );
}

function BookDetailsDialog({ book, alreadySaved, adding, onClose, onAdd, onOpenShelves }: {
  book: BookResult;
  alreadySaved: boolean;
  adding: boolean;
  onClose: () => void;
  onAdd: (shelf: Shelf) => void;
  onOpenShelves: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="episode-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="episode-dialog book-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="book-detail-title">
      <header className="episode-dialog-header"><div><p className="eyebrow">BOOK DETAILS</p><h2 id="book-detail-title">{book.title}</h2></div><button type="button" className="episode-close" onClick={onClose} aria-label="Close book details">×</button></header>
      <div className="book-detail-main"><BookCover path={book.coverUrl} title={book.title} /><div className="book-detail-copy"><p className="book-authors">{book.authors.join(', ') || 'Author unknown'}</p><p className="book-meta">{book.publishedYear || 'Publication year unknown'}{book.pageCount ? ` · ${book.pageCount} pages` : ''}</p>
        <div className="book-identifiers">{book.isbn13 && <span>ISBN-13 <strong>{book.isbn13}</strong></span>}{book.isbn10 && <span>ISBN-10 <strong>{book.isbn10}</strong></span>}</div>
        <h3>About this book</h3><p className="book-detail-description">{book.description || 'No description is available from these catalogs yet.'}</p>
        {!!book.subjects.length && <><h3>Subjects</h3><div className="book-subject-list">{book.subjects.map((subject) => <span key={subject}>{subject}</span>)}</div></>}
      </div></div>
      <div className="book-detail-shelf-actions"><h3>{alreadySaved ? 'Already on your shelves' : 'Add to shelf'}</h3>{alreadySaved ? <button type="button" className="watch-primary" onClick={onOpenShelves}>View my shelves</button> : <div>{shelves.map((shelf) => <button type="button" key={shelf.id} className={shelf.id === 'want_to_read' ? 'watch-primary' : 'episodes-link'} disabled={adding} onClick={() => onAdd(shelf.id)}>{adding ? 'Adding…' : shelf.label}</button>)}</div>}</div>
      <p className="book-detail-credit">Book metadata from {book.sources.map((source) => source === 'googlebooks' ? 'Google Books' : 'Open Library').join(' and ')}.</p>
    </section>
  </div>;
}

function BookCover({ path, title }: { path: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="book-cover">{path && !failed ? <img src={path} alt={`${title} cover`} loading="lazy" onError={() => setFailed(true)} /> : <div className="poster-fallback" aria-label={`No cover available for ${title}`}><span aria-hidden="true">MST</span><small>NO COVER</small></div>}</div>;
}
