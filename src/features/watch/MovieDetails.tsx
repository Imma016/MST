import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { WhereToWatch } from './WhereToWatch';

type Movie = {
  title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  runtime?: number;
  vote_average?: number;
  genres?: Array<{ id: number; name: string }>;
};
type Props = { title: string; overview: string; posterPath: string | null; tmdbId: number; onClose: () => void };
const imageUrl = (path: string) => `https://image.tmdb.org/t/p/w500${path}`;

export function MovieDetails({ title, overview, posterPath, tmdbId, onClose }: Props) {
  const [movie, setMovie] = useState<Movie | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    void supabase.functions.invoke('tmdb-search', { body: { action: 'movie-details', tmdbId } })
      .then(({ data, error }) => { if (!cancelled && !error && !data?.error) setMovie(data as Movie); });
    return () => { cancelled = true; };
  }, [tmdbId]);

  return <div className="episode-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="episode-dialog movie-dialog" role="dialog" aria-modal="true" aria-labelledby="movie-dialog-title">
      <header className="episode-dialog-header"><div><p className="eyebrow">MOVIE DETAILS</p><h2 id="movie-dialog-title">{movie?.title || title}</h2></div><button type="button" className="episode-close" onClick={onClose} aria-label="Close movie details">×</button></header>
      <div className="episode-show-hero" style={movie?.backdrop_path ? { backgroundImage: `linear-gradient(90deg, var(--page) 0%, color-mix(in srgb, var(--page) 82%, transparent) 58%, color-mix(in srgb, var(--page) 45%, transparent)), url(${imageUrl(movie.backdrop_path)})` } : undefined}>
        {(movie?.poster_path || posterPath) && <img src={imageUrl(movie?.poster_path || posterPath!)} alt={`${title} poster`} />}
        <div><p className="eyebrow">{(movie?.release_date || '').slice(0, 4) || 'RELEASE DATE UNKNOWN'}{movie?.runtime ? ` · ${movie.runtime} MIN` : ''}{movie?.vote_average ? ` · ★ ${movie.vote_average.toFixed(1)}` : ''}</p><p className="episode-show-overview">{movie?.overview || overview || 'No synopsis is available yet.'}</p></div>
      </div>
      {!!movie?.genres?.length && <div className="episode-genres">{movie.genres.map((genre) => <span key={genre.id}>{genre.name}</span>)}</div>}
      <WhereToWatch tmdbId={tmdbId} mediaType="movie" />
    </section>
  </div>;
}
