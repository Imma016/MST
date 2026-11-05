import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../../lib/supabase';

type SeasonSummary = { id: number; name: string; season_number: number; episode_count: number; air_date?: string | null };
type Episode = {
  id: number;
  name: string;
  season_number: number;
  episode_number: number;
  overview?: string;
  air_date?: string | null;
  still_path?: string | null;
  runtime?: number | null;
};
type TvDetails = {
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string | null;
  vote_average?: number;
  genres?: Array<{ id: number; name: string }>;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: SeasonSummary[];
  next_episode_to_air?: Episode | null;
};
type SeasonDetails = { episodes?: Episode[] };
type WatchedRow = { episode_id: number; season_number: number; episode_number: number; watched_at: string };
type Props = {
  title: string;
  catalogItemId: string;
  tmdbId: number;
  onClose: () => void;
};

const imageUrl = (path: string) => `https://image.tmdb.org/t/p/w300${path}`;
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const formatDate = (date?: string | null) => {
  if (!date) return 'Air date to be announced';
  const value = new Date(`${date}T12:00:00`);
  return Number.isNaN(value.getTime()) ? date : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value);
};

export function EpisodeDetails({ title, catalogItemId, tmdbId, onClose }: Props) {
  const { session } = useAuth();
  const [details, setDetails] = useState<TvDetails | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [progress, setProgress] = useState<Record<number, string>>({});
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<'episodes' | 'info'>('episodes');
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [busyEpisode, setBusyEpisode] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const client = supabase;
    if (!client || !session) return;
    setLoadingDetails(true);
    setError('');
    void Promise.all([
      client.functions.invoke('tmdb-search', { body: { action: 'tv-details', tmdbId } }),
      client.from('user_episode_progress')
        .select('episode_id, season_number, episode_number, watched_at')
        .eq('user_id', session.user.id)
        .eq('catalog_item_id', catalogItemId),
    ]).then(([detailsResult, progressResult]) => {
      if (cancelled) return;
      setLoadingDetails(false);
      if (detailsResult.error || detailsResult.data?.error) {
        setError('Show details could not be loaded. Refresh and try again.');
        return;
      }
      if (progressResult.error) {
        setError('Your episode progress could not be loaded.');
        return;
      }
      const tv = detailsResult.data as TvDetails;
      setDetails(tv);
      const firstSeason = (tv.seasons ?? []).find((season) => season.season_number > 0) ?? tv.seasons?.[0];
      setSeasonNumber(firstSeason?.season_number ?? null);
      const nextProgress: Record<number, string> = {};
      ((progressResult.data ?? []) as WatchedRow[]).forEach((row) => { nextProgress[row.episode_id] = row.watched_at; });
      setProgress(nextProgress);
    });
    return () => { cancelled = true; };
  }, [session, catalogItemId, tmdbId]);

  useEffect(() => {
    let cancelled = false;
    const client = supabase;
    if (!client || seasonNumber === null) {
      setEpisodes([]);
      return;
    }
    setLoadingSeason(true);
    setError('');
    void client.functions.invoke('tmdb-search', {
      body: { action: 'tv-season', tmdbId, seasonNumber },
    }).then(({ data, error: invokeError }) => {
      if (cancelled) return;
      setLoadingSeason(false);
      if (invokeError || data?.error) {
        setError('Episodes for this season could not be loaded. Try selecting the season again.');
        setEpisodes([]);
        return;
      }
      setEpisodes(((data as SeasonDetails).episodes ?? []).slice().sort((a, b) => a.episode_number - b.episode_number));
    });
    return () => { cancelled = true; };
  }, [tmdbId, seasonNumber]);

  const nextInSeason = useMemo(() => episodes.find((episode) =>
    !progress[episode.id] && (!episode.air_date || episode.air_date <= today())), [episodes, progress]);
  const watchedCount = episodes.filter((episode) => Boolean(progress[episode.id])).length;
  const progressPercent = episodes.length ? Math.round(watchedCount / episodes.length * 100) : 0;
  const nextEpisode = details?.next_episode_to_air;

  async function toggleWatched(episode: Episode) {
    const client = supabase;
    if (!client || !session) return;
    setBusyEpisode(episode.id);
    setError('');
    if (progress[episode.id]) {
      const { error: deleteError } = await client.from('user_episode_progress').delete()
        .eq('user_id', session.user.id).eq('catalog_item_id', catalogItemId).eq('episode_id', episode.id);
      if (deleteError) setError('Could not update this episode. Please try again.');
      else setProgress((current) => { const next = { ...current }; delete next[episode.id]; return next; });
    } else {
      const watchedAt = today();
      const { error: saveError } = await client.from('user_episode_progress').upsert({
        user_id: session.user.id,
        catalog_item_id: catalogItemId,
        episode_id: episode.id,
        season_number: episode.season_number,
        episode_number: episode.episode_number,
        watched_at: watchedAt,
      }, { onConflict: 'user_id,catalog_item_id,episode_id' });
      if (saveError) setError('Could not save this episode. Please try again.');
      else setProgress((current) => ({ ...current, [episode.id]: watchedAt }));
    }
    setBusyEpisode(null);
  }

  async function changeWatchedDate(episode: Episode, watchedAt: string) {
    const client = supabase;
    if (!client || !session || !watchedAt) return;
    setBusyEpisode(episode.id);
    const { error: updateError } = await client.from('user_episode_progress').update({ watched_at: watchedAt })
      .eq('user_id', session.user.id).eq('catalog_item_id', catalogItemId).eq('episode_id', episode.id);
    if (updateError) setError('Could not update the watch date. Please try again.');
    else setProgress((current) => ({ ...current, [episode.id]: watchedAt }));
    setBusyEpisode(null);
  }

  return (
    <div className="episode-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="episode-dialog" role="dialog" aria-modal="true" aria-labelledby="episode-dialog-title">
        <header className="episode-dialog-header">
          <div><p className="eyebrow">SHOW PROGRESS</p><h2 id="episode-dialog-title">{details?.name || title}</h2></div>
          <button type="button" className="episode-close" onClick={onClose} aria-label="Close episode details">×</button>
        </header>

        {loadingDetails ? <div className="episode-loading"><span className="loading-dot" /> Loading show details…</div> : <>
          {details && <div className="episode-show-hero" style={details.backdrop_path ? { backgroundImage: `linear-gradient(90deg, var(--page) 0%, color-mix(in srgb, var(--page) 82%, transparent) 58%, color-mix(in srgb, var(--page) 45%, transparent)), url(${imageUrl(details.backdrop_path)})` } : undefined}>
            {details.poster_path && <img src={imageUrl(details.poster_path)} alt={`${details.name || title} poster`} />}
            <div><p className="eyebrow">TV SERIES · {details.first_air_date?.slice(0, 4) || 'YEAR UNKNOWN'}{details.vote_average ? ` · ★ ${details.vote_average.toFixed(1)}` : ''}</p><p className="episode-show-overview">{details.overview || 'No synopsis is available yet.'}</p></div>
          </div>}
          {nextEpisode && <div className="next-airing-card">
            <span className="airing-icon" aria-hidden="true">◷</span>
            <div><span className="poster-type">UPCOMING</span><strong>Next: S{nextEpisode.season_number} · E{nextEpisode.episode_number} — {nextEpisode.name}</strong><p>{formatDate(nextEpisode.air_date)}</p></div>
          </div>}
          <div className="episode-detail-tabs" role="tablist" aria-label="Show details">
            <button type="button" role="tab" aria-selected={detailTab === 'episodes'} className={detailTab === 'episodes' ? 'is-active' : ''} onClick={() => setDetailTab('episodes')}>Episodes</button>
            <button type="button" role="tab" aria-selected={detailTab === 'info'} className={detailTab === 'info' ? 'is-active' : ''} onClick={() => setDetailTab('info')}>Info</button>
          </div>
          {detailTab === 'info' ? <div className="episode-info-panel">
            <h3>About this show</h3><p>{details?.overview || 'No synopsis is available yet.'}</p>
            <div className="episode-info-facts"><span><strong>{details?.number_of_seasons ?? details?.seasons?.length ?? '—'}</strong> seasons</span><span><strong>{details?.number_of_episodes ?? '—'}</strong> episodes</span><span><strong>{details?.vote_average ? details.vote_average.toFixed(1) : '—'}</strong> TMDB rating</span></div>
            {!!details?.genres?.length && <div className="episode-genres">{details.genres.map((genre) => <span key={genre.id}>{genre.name}</span>)}</div>}
          </div> : <>
          <div className="episode-season-tools">
            <div className="season-picker" role="tablist" aria-label="Choose season">{(details?.seasons ?? []).map((season) => <button type="button" role="tab" aria-selected={seasonNumber === season.season_number} className={seasonNumber === season.season_number ? 'is-active' : ''} key={season.id} onClick={() => setSeasonNumber(season.season_number)}>{season.name || `Season ${season.season_number}`}</button>)}</div>
            <span className="season-progress">{watchedCount} / {episodes.length} watched <span aria-hidden="true">·</span> {progressPercent}%</span>
          </div>
          {episodes.length > 0 && <div className="season-progress-track" role="progressbar" aria-label="Season progress" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progressPercent}%` }} /></div>}
          {error && <p className="watch-alert" role="alert">{error}</p>}
          {!loadingSeason && nextInSeason && !nextEpisode && <div className="next-in-season"><span>UP NEXT IN THIS SEASON</span><strong>E{nextInSeason.episode_number} · {nextInSeason.name}</strong><small>{formatDate(nextInSeason.air_date)}</small></div>}
          {loadingSeason ? <div className="episode-loading"><span className="loading-dot" /> Loading episodes…</div> : episodes.length === 0 ? <div className="episode-empty">No episode list is available for this season yet.</div> : <div className="episode-list">{episodes.map((episode) => {
            const watchedAt = progress[episode.id];
            const isUpcoming = Boolean(episode.air_date && episode.air_date > today());
            return <article className={`episode-row${watchedAt ? ' is-watched' : ''}${isUpcoming ? ' is-upcoming' : ''}`} key={episode.id}>
              {episode.still_path ? <img className="episode-still" src={imageUrl(episode.still_path)} alt="" loading="lazy" /> : <div className="episode-still episode-still-empty" aria-hidden="true">E{episode.episode_number}</div>}
              <div className="episode-copy"><div className="episode-title-line"><span>E{episode.episode_number}</span><h3>{episode.name || `Episode ${episode.episode_number}`}</h3></div><p className="episode-air-date">{episode.air_date ? `${isUpcoming ? 'Airs' : 'Aired'} ${formatDate(episode.air_date)}` : 'Air date to be announced'}{episode.runtime ? ` · ${episode.runtime} min` : ''}</p>{episode.overview && <p className="episode-overview">{episode.overview}</p>}
                {watchedAt && <label className="watched-date">Watched on <input type="date" value={watchedAt} min={episode.air_date || undefined} max={today()} disabled={busyEpisode === episode.id} onChange={(event) => void changeWatchedDate(episode, event.target.value)} /></label>}
              </div>
              <button type="button" className={`episode-watch-toggle${watchedAt ? ' is-watched' : ''}`} disabled={isUpcoming || busyEpisode === episode.id} onClick={() => void toggleWatched(episode)}>{busyEpisode === episode.id ? 'Saving…' : watchedAt ? '✓ Watched' : isUpcoming ? 'Not released' : 'Mark watched'}</button>
            </article>;
          })}</div>}
          </>}
        </>}
      </section>
    </div>
  );
}
