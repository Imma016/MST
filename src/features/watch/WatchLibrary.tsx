import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { EpisodeDetails } from './EpisodeDetails';

type Category = 'tv' | 'movie' | 'anime';
type Status = 'watching' | 'completed' | 'plan_to_watch' | 'on_hold' | 'dropped';
type Result = {
  id: number;
  media_type: 'tv' | 'movie';
  name?: string;
  title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  original_language?: string;
  genre_ids?: number[];
  first_air_date?: string;
  release_date?: string;
  vote_average?: number;
};
type Saved = {
  id: string;
  catalog_item_id: string;
  category: Category;
  status: Status;
  catalog_item: {
    provider_id: number;
    media_type: 'tv' | 'movie';
    title: string;
    overview: string;
    poster_path: string | null;
    release_date: string | null;
    original_language: string | null;
  } | null;
};

const categories: Array<{ id: Category; label: string; icon: string }> = [
  { id: 'tv', label: 'TV Shows', icon: '▣' },
  { id: 'movie', label: 'Movies', icon: '▶' },
  { id: 'anime', label: 'Anime', icon: '✦' },
];
const statuses: Array<{ id: Status; label: string }> = [
  { id: 'plan_to_watch', label: 'Plan to watch' },
  { id: 'watching', label: 'Watching' },
  { id: 'completed', label: 'Completed' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'dropped', label: 'Dropped' },
];
const titleOf = (item: Result) => item.title || item.name || 'Untitled';
const posterUrl = (path?: string | null) => path ? `https://image.tmdb.org/t/p/w342${path}` : null;

export function WatchLibrary() {
  const { session, loading: authLoading } = useAuth();
  const [category, setCategory] = useState<Category>('tv');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'search' | 'library'>('search');
  const [selectedShow, setSelectedShow] = useState<Saved | null>(null);

  useEffect(() => {
    let cancelled = false;
    const term = query.trim();
    setError('');
    if (!session || term.length < 2 || !supabase) {
      setResults([]);
      setSearching(false);
      return;
    }
    const client = supabase;
    setResults([]);
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const { data, error: invokeError } = await client.functions.invoke('tmdb-search', {
        body: { query: term, category },
      });
      if (cancelled) return;
      setSearching(false);
      if (invokeError) {
        setError('Search is not connected yet. Finish the TMDB setup steps in the guide, then try again.');
        setResults([]);
        return;
      }
      if (data?.error) {
        setError(data.error);
        setResults([]);
        return;
      }
      setResults((data?.results ?? []) as Result[]);
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, category, session]);

  useEffect(() => {
    let cancelled = false;
    if (!session || !supabase) {
      setSaved([]);
      return;
    }
    setSaved([]);
    setLoadingLibrary(true);
    void supabase.from('user_library')
      .select('id, catalog_item_id, category, status, catalog_item:catalog_items(provider_id, media_type, title, overview, poster_path, release_date, original_language)')
      .eq('user_id', session.user.id)
      .eq('category', category)
      .order('added_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        setLoadingLibrary(false);
        if (queryError) setError('Your library could not be loaded. Please refresh and try again.');
        else setSaved((data ?? []) as unknown as Saved[]);
      });
    return () => { cancelled = true; };
  }, [session, category]);

  const savedIds = useMemo(() => new Set(saved.map((entry) => entry.catalog_item && `${entry.catalog_item.media_type}:${entry.catalog_item.provider_id}`)), [saved]);

  async function addTitle(item: Result) {
    if (!supabase || !session) return;
    setSavingId(item.id);
    setError('');
    setNotice('');
    const releaseDate = item.release_date || item.first_air_date || null;
    const { data: catalog, error: catalogError } = await supabase.from('catalog_items').upsert({
      provider: 'tmdb',
      provider_id: item.id,
      media_type: item.media_type,
      title: titleOf(item),
      overview: item.overview || '',
      poster_path: item.poster_path || null,
      backdrop_path: item.backdrop_path || null,
      original_language: item.original_language || null,
      release_date: releaseDate,
      genre_ids: item.genre_ids || [],
    }, { onConflict: 'provider,provider_id,media_type' }).select('id').single();
    if (catalogError || !catalog) {
      setError('Could not save this title. Please try again.');
      setSavingId(null);
      return;
    }
    const { data: libraryEntry, error: addError } = await supabase.from('user_library').insert({
      user_id: session.user.id,
      catalog_item_id: catalog.id,
      category,
      status: 'plan_to_watch',
    }).select('id').single();
    setSavingId(null);
    if (addError?.code === '23505') {
      setNotice('This title is already in your library.');
    } else if (addError || !libraryEntry) {
      setError('The title was found, but could not be added to your library. Please try again.');
    } else {
      setNotice(`${titleOf(item)} added to your library.`);
      setSaved((current) => [{
        id: libraryEntry.id,
        catalog_item_id: catalog.id,
        category,
        status: 'plan_to_watch',
        catalog_item: {
          provider_id: item.id,
          media_type: item.media_type,
          title: titleOf(item),
          overview: item.overview || '',
          poster_path: item.poster_path || null,
          release_date: releaseDate,
          original_language: item.original_language || null,
        },
      }, ...current]);
    }
  }

  async function changeStatus(entryId: string, status: Status) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from('user_library').update({ status }).eq('id', entryId);
    if (updateError) setError('Could not update the title status. Please try again.');
    else setSaved((current) => current.map((entry) => entry.id === entryId ? { ...entry, status } : entry));
  }

  async function removeTitle(entryId: string) {
    if (!supabase) return;
    const { error: deleteError } = await supabase.from('user_library').delete().eq('id', entryId);
    if (deleteError) setError('Could not remove this title. Please try again.');
    else setSaved((current) => current.filter((entry) => entry.id !== entryId));
  }

  return (
    <section className="watch-page" aria-labelledby="watch-title">
      <div className="watch-heading">
        <div>
          <p className="eyebrow">MST · YOUR PERSONAL LIBRARY</p>
          <h1 id="watch-title">Watch</h1>
          <p className="page-description">Find a title, add it with its poster, and keep your watchlist close.</p>
        </div>
      </div>

      <div className="media-categories" role="tablist" aria-label="Choose a type of watchlist">
        {categories.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={category === item.id}
            className={`media-category${category === item.id ? ' is-active' : ''}${item.id === 'anime' ? ' anime-category' : ''}`}
            onClick={() => { setCategory(item.id); setNotice(''); }}>
            <span className="media-category-icon" aria-hidden="true">{item.id === 'anime' ? <svg viewBox="0 0 24 24"><path d="M4.5 5.5 12 3l7.5 2.5v8c0 3.4-3.4 5.6-7.5 7-4.1-1.4-7.5-3.6-7.5-7z"/><path d="M8.5 10.5h.01M15.5 10.5h.01M9 14.5c1.8 1.4 4.2 1.4 6 0M5.5 7.5l2-2m11 2-2-2"/></svg> : item.icon}</span>{item.label}
          </button>
        ))}
      </div>

      <div className="library-tools">
        <div className="library-views" role="tablist" aria-label="Search or view your library">
          <button type="button" role="tab" aria-selected={view === 'search'} className={view === 'search' ? 'is-active' : ''} onClick={() => setView('search')}>Search</button>
          <button type="button" role="tab" aria-selected={view === 'library'} className={view === 'library' ? 'is-active' : ''} onClick={() => setView('library')}>My library <span className="count-pill">{saved.length}</span></button>
        </div>
        {view === 'search' && <label className="media-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search {category === 'anime' ? 'anime' : category === 'tv' ? 'TV shows' : 'movies'}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${category === 'anime' ? 'anime' : category === 'tv' ? 'TV shows' : 'movies'}…`} disabled={authLoading || !session} /></label>}
      </div>

      {!authLoading && !session && <div className="library-empty"><span className="empty-symbol">◎</span><h2>Sign in to start your library</h2><p>Your saved shows, movies, and anime are private to your account.</p><button className="watch-primary" type="button" onClick={() => document.querySelector<HTMLButtonElement>('.tab-button:last-child')?.click()}>Go to Profile to sign in</button></div>}
      {error && <p className="watch-alert" role="alert">{error}</p>}
      {notice && <p className="watch-notice" role="status">{notice}</p>}

      {session && view === 'search' && <>
        {!query.trim() && <div className="watch-tip"><span aria-hidden="true">✦</span><p>Type at least two letters to search. Pick <strong>Anime</strong> to find Japanese animated series and films.</p></div>}
        {searching && <div className="poster-grid" aria-label="Searching">{Array.from({ length: 6 }, (_, index) => <div className="poster-skeleton" key={index}><span /><i /><b /></div>)}</div>}
        {!searching && query.trim().length >= 2 && results.length === 0 && !error && <div className="library-empty compact-empty"><h2>No matches yet</h2><p>Try another title or spelling.</p></div>}
        {!searching && results.length > 0 && <div className="poster-grid">{results.map((item) => <article className="poster-card" key={`${item.media_type}-${item.id}`}>
          <Poster path={item.poster_path} title={titleOf(item)} />
          <div className="poster-card-body"><span className="poster-type">{category === 'anime' ? 'ANIME' : item.media_type === 'tv' ? 'TV SERIES' : 'MOVIE'}</span><h2 title={titleOf(item)}>{titleOf(item)}</h2><p>{(item.release_date || item.first_air_date || '').slice(0, 4) || 'Release date unknown'}{item.vote_average ? ` · ★ ${item.vote_average.toFixed(1)}` : ''}</p>
            <button type="button" className={`watch-primary add-title${savedIds.has(`${item.media_type}:${item.id}`) ? ' is-added' : ''}`} disabled={savedIds.has(`${item.media_type}:${item.id}`) || savingId === item.id} onClick={() => void addTitle(item)}>{savingId === item.id ? 'Adding…' : savedIds.has(`${item.media_type}:${item.id}`) ? '✓ Added' : '+ Add to library'}</button>
          </div>
        </article>)}</div>}
      </>}

      {session && view === 'library' && <>
        {loadingLibrary ? <div className="poster-grid" aria-label="Loading library">{Array.from({ length: 3 }, (_, index) => <div className="poster-skeleton" key={index}><span /><i /><b /></div>)}</div> : saved.length === 0 ? <div className="library-empty"><span className="empty-symbol">✧</span><h2>Your {category === 'anime' ? 'anime' : category === 'tv' ? 'TV' : 'movie'} list is ready</h2><p>Search for a title and add it here. Posters and your progress stay saved to your account.</p><button className="watch-primary" type="button" onClick={() => setView('search')}>Find something to watch</button></div> : <div className="saved-list">{saved.map((entry) => <article className="saved-card" key={entry.id}>
          <Poster path={entry.catalog_item?.poster_path} title={entry.catalog_item?.title ?? 'Saved title'} />
          <div className="saved-card-info"><span className="poster-type">{entry.category === 'anime' ? 'ANIME' : entry.category === 'tv' ? 'TV SERIES' : 'MOVIE'}</span><h2>{entry.catalog_item?.title ?? 'Saved title'}</h2><p>{(entry.catalog_item?.release_date ?? '').slice(0, 4) || 'Release date unknown'}{entry.catalog_item?.original_language ? ` · ${entry.catalog_item.original_language.toUpperCase()}` : ''}</p><p className="saved-overview">{entry.catalog_item?.overview || 'No description available.'}</p>
          <div className="saved-actions"><label><span className="sr-only">Status for {entry.catalog_item?.title}</span><select value={entry.status} onChange={(event) => void changeStatus(entry.id, event.target.value as Status)}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>{entry.catalog_item?.media_type === 'tv' && <button type="button" className="episodes-link" onClick={() => setSelectedShow(entry)}>Episodes &amp; progress</button>}<button type="button" className="remove-title" onClick={() => void removeTitle(entry.id)}>Remove</button></div></div>
        </article>)}</div>}
      </>}

      {selectedShow?.catalog_item && <EpisodeDetails key={selectedShow.id} title={selectedShow.catalog_item.title} catalogItemId={selectedShow.catalog_item_id} tmdbId={selectedShow.catalog_item.provider_id} onClose={() => setSelectedShow(null)} />}
    </section>
  );
}

function Poster({ path, title }: { path?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  const url = posterUrl(path);
  return <div className="poster-art">{url && !failed ? <img src={url} alt={`${title} poster`} loading="lazy" onError={() => setFailed(true)} /> : <div className="poster-fallback" aria-label={`No poster available for ${title}`}><span aria-hidden="true">MST</span><small>NO POSTER</small></div>}</div>;
}
