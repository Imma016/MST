import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { EpisodeDetails } from '../watch/EpisodeDetails';
import { supabase } from '../../lib/supabase';

type Category = 'tv' | 'movie' | 'anime';
type WatchEntry = {
  id: string;
  catalog_item_id: string;
  category: Category;
  status: 'watching' | 'completed' | 'plan_to_watch' | 'on_hold' | 'dropped';
  catalog_item: {
    provider_id: number;
    media_type: 'tv' | 'movie';
    title: string;
    poster_path: string | null;
    release_date: string | null;
  } | null;
};
type BookEntry = {
  id: string;
  shelf: 'currently_reading' | 'finished' | 'want_to_read' | 'did_not_finish';
  current_page: number;
  book: { title: string; authors: string[]; cover_url: string | null; page_count: number | null } | null;
};
type EpisodeProgress = { catalog_item_id: string; season_number: number; episode_number: number; watched_at: string };
type Props = { onBrowseWatch: () => void; onBrowseBooks: () => void; onOpenProfile: () => void };

const tmdbPoster = (path?: string | null) => path ? `https://image.tmdb.org/t/p/w342${path}` : null;

function formatLastEpisode(entry: EpisodeProgress | undefined) {
  if (!entry) return 'Ready when you are';
  return `S${String(entry.season_number).padStart(2, '0')} · E${String(entry.episode_number).padStart(2, '0')} last logged`;
}

export function HomePage({ onBrowseWatch, onBrowseBooks, onOpenProfile }: Props) {
  const { session, loading: authLoading, configured } = useAuth();
  const [watchEntries, setWatchEntries] = useState<WatchEntry[]>([]);
  const [bookEntries, setBookEntries] = useState<BookEntry[]>([]);
  const [episodeProgress, setEpisodeProgress] = useState<EpisodeProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedShow, setSelectedShow] = useState<WatchEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!session || !supabase) {
      setWatchEntries([]);
      setBookEntries([]);
      setEpisodeProgress([]);
      return;
    }

    setLoading(true);
    setError('');
    void Promise.all([
      supabase.from('user_library')
        .select('id, catalog_item_id, category, status, catalog_item:catalog_items(provider_id, media_type, title, poster_path, release_date)')
        .eq('user_id', session.user.id)
        .order('added_at', { ascending: false }),
      supabase.from('user_books')
        .select('id, shelf, current_page, book:book_catalog(title, authors, cover_url, page_count)')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false }),
      supabase.from('user_episode_progress')
        .select('catalog_item_id, season_number, episode_number, watched_at')
        .eq('user_id', session.user.id)
        .order('watched_at', { ascending: false }),
    ]).then(([watchResult, bookResult, episodeResult]) => {
      if (cancelled) return;
      setLoading(false);
      if (watchResult.error || bookResult.error || episodeResult.error) {
        setError('Your home screen could not load all of your library. Please refresh and try again.');
        return;
      }
      setWatchEntries((watchResult.data ?? []) as unknown as WatchEntry[]);
      setBookEntries((bookResult.data ?? []) as unknown as BookEntry[]);
      setEpisodeProgress((episodeResult.data ?? []) as EpisodeProgress[]);
    });
    return () => { cancelled = true; };
  }, [session]);

  const progressByTitle = useMemo(() => {
    const grouped = new Map<string, { count: number; latest?: EpisodeProgress }>();
    for (const episode of episodeProgress) {
      const current = grouped.get(episode.catalog_item_id) ?? { count: 0 };
      current.count += 1;
      if (!current.latest || episode.watched_at > current.latest.watched_at) current.latest = episode;
      grouped.set(episode.catalog_item_id, current);
    }
    return grouped;
  }, [episodeProgress]);

  const currentlyWatching = watchEntries.filter((entry) => entry.status === 'watching' && entry.catalog_item?.media_type === 'tv');
  const watchlist = watchEntries.filter((entry) => entry.status === 'plan_to_watch');
  const readingNow = bookEntries.filter((entry) => entry.shelf === 'currently_reading' && entry.book);
  const pagesRead = bookEntries.reduce((total, entry) => total + Math.max(0, entry.current_page), 0);
  const name = session?.user.user_metadata.display_name || session?.user.email?.split('@')[0] || 'there';

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="welcome-title">
        <div className="home-hero-copy">
          <p className="eyebrow">YOUR STORIES, RIGHT WHERE YOU LEFT THEM</p>
          <h1 id="welcome-title">{session ? `Welcome back, ${name}.` : 'Make room for your next favorite.'}</h1>
          <p>{session ? 'Pick up a show, keep a book moving, or save something for later.' : 'Track the shows, films, anime, and books you love in one personal library.'}</p>
          <div className="home-hero-actions">
            <button className="primary-link" type="button" onClick={session ? onBrowseWatch : onOpenProfile}>{session ? 'Find something to watch' : 'Sign in or create an account'} <span aria-hidden="true">→</span></button>
            {session && <button className="home-secondary-link" type="button" onClick={onBrowseBooks}>Find a book</button>}
          </div>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          {currentlyWatching.slice(0, 3).map((entry, index) => {
            const path = entry.catalog_item?.poster_path;
            const poster = tmdbPoster(path);
            return <div className={`home-hero-poster hero-poster-${index + 1}`} key={entry.id}>
              {poster ? <img src={poster} alt="" /> : <span>{entry.catalog_item?.title.slice(0, 1) || 'M'}</span>}
            </div>;
          })}
          {currentlyWatching.length === 0 && <div className="home-hero-stamp"><span>MST</span><small>YOUR STORY, SAVED</small></div>}
        </div>
      </section>

      {session ? <>
        <section className="home-stats" aria-label="Your library at a glance">
          <article><span>Shows &amp; movies</span><strong>{loading ? '—' : watchEntries.length}</strong><small>saved to your library</small></article>
          <article><span>Episodes tracked</span><strong>{loading ? '—' : episodeProgress.length}</strong><small>watch history entries</small></article>
          <article><span>Pages read</span><strong>{loading ? '—' : pagesRead.toLocaleString()}</strong><small>across your books</small></article>
        </section>

        {error && <p className="home-error" role="alert">{error}</p>}

        <section className="home-section" aria-labelledby="continue-title">
          <div className="home-section-heading">
            <div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2 id="continue-title">Continue watching</h2></div>
            <button className="home-more" type="button" onClick={onBrowseWatch}>All shows <span aria-hidden="true">→</span></button>
          </div>
          {loading ? <div className="home-card-rail" aria-label="Loading shows">{[0, 1, 2].map((item) => <div className="home-skeleton" key={item} />)}</div> : currentlyWatching.length === 0 ? (
            <div className="home-empty-card"><span className="home-empty-mark" aria-hidden="true">▶</span><div><h3>Your next episode starts here</h3><p>Add a show and set its status to Watching to see it here.</p></div><button className="home-more" type="button" onClick={onBrowseWatch}>Browse shows <span aria-hidden="true">→</span></button></div>
          ) : <div className="home-card-rail">{currentlyWatching.slice(0, 8).map((entry) => {
            const item = entry.catalog_item;
            if (!item) return null;
            const progress = progressByTitle.get(entry.catalog_item_id);
            const poster = tmdbPoster(item.poster_path);
            return <button className="home-watch-card" type="button" key={entry.id} onClick={() => setSelectedShow(entry)}>
              <span className="home-poster-frame">{poster ? <img src={poster} alt={`${item.title} poster`} loading="lazy" /> : <span className="home-poster-fallback">MST</span>}<span className="home-poster-play" aria-hidden="true">▶</span></span>
              <span className="home-watch-title">{item.title}</span>
              <span className="home-watch-meta">{formatLastEpisode(progress?.latest)}</span>
              <span className="home-watch-count">{progress?.count ?? 0} episodes logged</span>
            </button>;
          })}</div>}
        </section>

        <section className="home-section" aria-labelledby="reading-title">
          <div className="home-section-heading">
            <div><p className="eyebrow">A FEW PAGES AT A TIME</p><h2 id="reading-title">Reading now</h2></div>
            <button className="home-more" type="button" onClick={onBrowseBooks}>My books <span aria-hidden="true">→</span></button>
          </div>
          {loading ? <div className="home-book-rail" aria-label="Loading books">{[0, 1].map((item) => <div className="home-book-skeleton" key={item} />)}</div> : readingNow.length === 0 ? (
            <div className="home-empty-card"><span className="home-empty-mark" aria-hidden="true">▤</span><div><h3>Your reading shelf is ready</h3><p>Move a book to Reading to keep its progress close.</p></div><button className="home-more" type="button" onClick={onBrowseBooks}>Find a book <span aria-hidden="true">→</span></button></div>
          ) : <div className="home-book-rail">{readingNow.slice(0, 6).map((entry) => {
            const book = entry.book;
            if (!book) return null;
            const percent = book.page_count ? Math.min(100, Math.round(entry.current_page / book.page_count * 100)) : null;
            return <button className="home-book-card" type="button" key={entry.id} onClick={onBrowseBooks}>
              <span className="home-book-cover">{book.cover_url ? <img src={book.cover_url} alt={`${book.title} cover`} loading="lazy" /> : <span>BOOK</span>}</span>
              <span className="home-book-copy"><strong>{book.title}</strong><small>{book.authors?.[0] || 'Unknown author'}</small><span className="home-book-progress"><i style={{ width: `${percent ?? 0}%` }} /></span><small>{book.page_count ? `Page ${entry.current_page} of ${book.page_count}${percent !== null ? ` · ${percent}%` : ''}` : `${entry.current_page} pages logged`}</small></span>
            </button>;
          })}</div>}
        </section>

        {watchlist.length > 0 && <section className="home-section" aria-labelledby="watchlist-title">
          <div className="home-section-heading"><div><p className="eyebrow">SAVED FOR A GOOD NIGHT IN</p><h2 id="watchlist-title">On your watchlist</h2></div><button className="home-more" type="button" onClick={onBrowseWatch}>See library <span aria-hidden="true">→</span></button></div>
          <div className="home-card-rail">{watchlist.slice(0, 8).map((entry) => {
            const item = entry.catalog_item;
            if (!item) return null;
            const poster = tmdbPoster(item.poster_path);
            return <button className="home-watch-card watchlist-card" type="button" key={entry.id} onClick={onBrowseWatch}>
              <span className="home-poster-frame">{poster ? <img src={poster} alt={`${item.title} poster`} loading="lazy" /> : <span className="home-poster-fallback">MST</span>}<span className="home-poster-plus" aria-hidden="true">＋</span></span>
              <span className="home-watch-title">{item.title}</span><span className="home-watch-meta">{(item.release_date ?? '').slice(0, 4) || 'Release date unknown'}</span>
            </button>;
          })}</div>
        </section>}

        {!loading && watchEntries.length === 0 && bookEntries.length === 0 && <div className="home-first-steps"><p className="eyebrow">MAKE IT YOURS</p><h2>Your MST library is ready.</h2><p>Search by title, add a poster, and start tracking from any device.</p><div><button className="primary-link" type="button" onClick={onBrowseWatch}>Add a show or movie</button><button className="home-secondary-link" type="button" onClick={onBrowseBooks}>Add a book</button></div></div>}
      </> : !authLoading && !configured ? <p className="home-signin-note">Accounts are being connected. Visit Profile for setup details.</p> : null}

      {selectedShow?.catalog_item && <EpisodeDetails key={selectedShow.id} title={selectedShow.catalog_item.title} catalogItemId={selectedShow.catalog_item_id} tmdbId={selectedShow.catalog_item.provider_id} onClose={() => setSelectedShow(null)} />}
    </div>
  );
}
