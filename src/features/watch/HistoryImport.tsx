import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { parseHistoryCsv } from './historyCsv';
import type { HistoryRow } from './historyCsv';

type Match = {
  id: number;
  media_type: 'tv' | 'movie';
  name?: string;
  title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  original_language?: string;
  origin_country?: string[];
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
};
type ImportRow = HistoryRow & { include: boolean; matches: Match[]; selectedMatch: Match | null; searching: boolean; error: string };
type Props = { onClose: () => void; onImported: () => void };
const titleOf = (match: Match) => match.title || match.name || 'Untitled';
const posterUrl = (path?: string | null) => path ? `https://image.tmdb.org/t/p/w92${path}` : '';

export function HistoryImport({ onClose, onImported }: Props) {
  const { session } = useAuth();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  async function openFile(file?: File) {
    if (!file) return;
    setError(''); setNotice(''); setRows([]); setFileName(file.name);
    if (file.size > 5_000_000) { setError('This CSV is over 5 MB. Please export a smaller file.'); return; }
    const parsed = parseHistoryCsv(await file.text());
    if (parsed.error) { setError(parsed.error); return; }
    setRows(parsed.rows.map((row) => ({ ...row, include: true, matches: [], selectedMatch: null, searching: false, error: '' })));
  }

  async function findMatches(id: number) {
    const row = rows.find((item) => item.id === id);
    if (!row || !supabase) return;
    setRows((current) => current.map((item) => item.id === id ? { ...item, searching: true, error: '' } : item));
    const { data, error: invokeError } = await supabase.functions.invoke('tmdb-search', { body: { query: row.title.trim(), category: 'all' } });
    if (invokeError || data?.error) {
      setRows((current) => current.map((item) => item.id === id ? { ...item, searching: false, error: 'Could not find matches. Check the connection and try again.' } : item));
      return;
    }
    const results = ((data?.results ?? []) as Match[]).slice().sort((a, b) => {
      const aExact = titleOf(a).toLowerCase() === row.title.trim().toLowerCase() ? 1 : 0;
      const bExact = titleOf(b).toLowerCase() === row.title.trim().toLowerCase() ? 1 : 0;
      return bExact - aExact;
    }).slice(0, 6);
    setRows((current) => current.map((item) => item.id === id ? { ...item, searching: false, matches: results, selectedMatch: results.length === 1 ? results[0] : null, error: results.length ? '' : 'No match found. Try editing the title.' } : item));
  }

  async function importSelected() {
    if (!session || !supabase) return;
    const selected = rows.filter((row) => row.include && row.selectedMatch);
    if (!selected.length) { setError('Find and choose a match for at least one title first.'); return; }
    setImporting(true); setError(''); setNotice('');
    setImportProgress({ done: 0, total: selected.length });
    let added = 0; let existing = 0; let failed = 0;
    for (const [index, row] of selected.entries()) {
      const item = row.selectedMatch!;
      const { data: catalog, error: catalogError } = await supabase.from('catalog_items').upsert({
        provider: 'tmdb', provider_id: item.id, media_type: item.media_type,
        title: titleOf(item), overview: item.overview || '', poster_path: item.poster_path || null,
        backdrop_path: item.backdrop_path || null, original_language: item.original_language || null,
        release_date: item.release_date || item.first_air_date || null, genre_ids: item.genre_ids || [],
      }, { onConflict: 'provider,provider_id,media_type' }).select('id').single();
      if (catalogError || !catalog) { failed += 1; setImportProgress({ done: index + 1, total: selected.length }); continue; }
      const isAnime = Boolean(item.genre_ids?.includes(16) && (item.original_language === 'ja' || item.origin_country?.includes('JP')));
      const { error: insertError } = await supabase.from('user_library').insert({
        user_id: session.user.id, catalog_item_id: catalog.id,
        category: isAnime ? 'anime' : item.media_type,
        status: item.media_type === 'movie' ? 'completed' : 'watching',
        watched_at: row.watchedAt,
        is_favorite: row.favorite,
      });
      if (insertError?.code === '23505') existing += 1;
      else if (insertError) failed += 1;
      else added += 1;
      setImportProgress({ done: index + 1, total: selected.length });
    }
    setImporting(false);
    if (added) onImported();
    setNotice(`${added} added${existing ? ` · ${existing} already in your library` : ''}${failed ? ` · ${failed} could not be added` : ''}.`);
    if (!failed && !existing) window.setTimeout(onClose, 900);
  }

  return <div className="episode-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !importing) onClose(); }}>
    <section className="episode-dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="history-import-title">
      <header className="episode-dialog-header"><div><p className="eyebrow">BRING YOUR HISTORY TO MST</p><h2 id="history-import-title">Import watch history</h2></div><button type="button" className="episode-close" onClick={onClose} aria-label="Close import" disabled={importing}>×</button></header>
      <p className="import-intro">Start with a Netflix viewing activity CSV or another CSV with a <strong>Title</strong>, <strong>Name</strong>, or <strong>Program</strong> column. The file stays in this browser; only titles you search for are sent to TMDB to find posters and details.</p>
      <label className="import-file-picker"><span>{fileName || 'Choose a CSV file'}</span><input type="file" accept=".csv,text/csv" onChange={(event) => void openFile(event.target.files?.[0])} disabled={importing} /></label>
      <p className="import-hint">MST adds movies as completed and shows as watching. Imported show entries do not mark individual episodes watched because the CSV may not identify them reliably.</p>
      {error && <p className="watch-alert" role="alert">{error}</p>}
      {notice && <p className="watch-notice" role="status">{notice}</p>}
      {rows.length > 0 && <>
        <div className="import-list-heading"><strong>{rows.length} titles found</strong><span>Select matches to import</span></div>
        <div className="import-row-list">{rows.map((row) => <article className="import-row" key={row.id}>
          <div className="import-row-main"><label className="import-include"><input type="checkbox" checked={row.include} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, include: event.target.checked } : item))} /><span className="sr-only">Include {row.title}</span></label>
            <div className="import-row-content"><input className="import-title-input" aria-label="Imported title to match" value={row.title} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, title: event.target.value, selectedMatch: null, matches: [], error: '' } : item))} />
              <span className="import-row-meta">{row.watchedAt ? `Watched ${row.watchedAt}` : 'Watch date not provided'}{row.favorite ? ' · marked favorite in file' : ''}</span>
            </div>
            <button type="button" className="episodes-link" disabled={row.searching || !row.title.trim()} onClick={() => void findMatches(row.id)}>{row.searching ? 'Searching…' : row.matches.length ? 'Search again' : 'Find match'}</button>
          </div>
          {row.matches.length > 0 && <div className="import-matches" aria-label={`Matches for ${row.title}`}>{row.matches.map((match) => <button type="button" key={`${match.media_type}-${match.id}`} className={`import-match${row.selectedMatch?.id === match.id && row.selectedMatch.media_type === match.media_type ? ' is-selected' : ''}`} onClick={() => setRows((current) => current.map((item) => item.id === row.id ? { ...item, selectedMatch: match } : item))}>
            {posterUrl(match.poster_path) ? <img src={posterUrl(match.poster_path)} alt="" /> : <span className="import-match-no-poster">MST</span>}<span><strong>{titleOf(match)}</strong><small>{match.media_type === 'tv' ? 'TV show' : 'Movie'} · {(match.release_date || match.first_air_date || '').slice(0, 4) || 'Year unknown'}</small></span>{row.selectedMatch?.id === match.id && row.selectedMatch.media_type === match.media_type && <b aria-label="Selected">✓</b>}
          </button>)}</div>}
          {row.error && <p className="import-row-error">{row.error}</p>}
          <label className="import-favorite"><input type="checkbox" checked={row.favorite} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, favorite: event.target.checked } : item))} /> Favorite in MST</label>
        </article>)}</div>
        <button type="button" className="watch-primary import-submit" disabled={importing || !rows.some((row) => row.include && row.selectedMatch)} onClick={() => void importSelected()}>{importing ? `Adding titles ${importProgress.done} of ${importProgress.total}…` : `Import ${rows.filter((row) => row.include && row.selectedMatch).length} matched title${rows.filter((row) => row.include && row.selectedMatch).length === 1 ? '' : 's'}`}</button>
      </>}
    </section>
  </div>;
}
