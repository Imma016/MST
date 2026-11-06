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
type InputMode = 'paste' | 'csv';
const titleOf = (match: Match) => match.title || match.name || 'Untitled';
const posterUrl = (path?: string | null) => path ? `https://image.tmdb.org/t/p/w92${path}` : '';

export function HistoryImport({ onClose, onImported }: Props) {
  const { session } = useAuth();
  const [inputMode, setInputMode] = useState<InputMode>('paste');
  const [pastedTitles, setPastedTitles] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [matchingBatch, setMatchingBatch] = useState(false);
  const [matchProgress, setMatchProgress] = useState({ done: 0, total: 0 });

  function prepareRows(sourceRows: HistoryRow[]) {
    setRows(sourceRows.map((row) => ({ ...row, include: true, matches: [], selectedMatch: null, searching: false, error: '' })));
    setError(''); setNotice('');
  }

  function reviewPastedTitles() {
    const unique = new Set<string>();
    const titles = pastedTitles.split(/\r?\n/).map((line) => line.trim().replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter((title) => {
        const key = title.toLocaleLowerCase();
        if (!title || unique.has(key)) return false;
        unique.add(key); return true;
      }).slice(0, 100);
    if (!titles.length) { setError('Paste one title per line first.'); return; }
    prepareRows(titles.map((title, id) => ({ id, title, watchedAt: null, favorite: false })));
  }

  async function openFile(file?: File) {
    if (!file) return;
    setInputMode('csv'); setError(''); setNotice(''); setRows([]); setFileName(file.name);
    if (file.size > 5_000_000) { setError('This CSV is over 5 MB. Please export a smaller file.'); return; }
    const parsed = parseHistoryCsv(await file.text());
    if (parsed.error) { setError(parsed.error); return; }
    prepareRows(parsed.rows);
  }

  async function searchTitle(title: string) {
    if (!supabase) return { results: [] as Match[], selected: null, error: 'Search is not configured.' };
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tmdb-search', { body: { query: title.trim(), category: 'all' } });
      if (invokeError || data?.error) return { results: [] as Match[], selected: null, error: 'Could not find matches. Check the connection and try again.' };
      const results = ((data?.results ?? []) as Match[]).slice().sort((a, b) => {
        const aExact = titleOf(a).toLowerCase() === title.trim().toLowerCase() ? 1 : 0;
        const bExact = titleOf(b).toLowerCase() === title.trim().toLowerCase() ? 1 : 0;
        return bExact - aExact;
      }).slice(0, 6);
      const exactMatches = results.filter((match) => titleOf(match).toLowerCase() === title.trim().toLowerCase());
      return { results, selected: exactMatches.length === 1 ? exactMatches[0] : results.length === 1 ? results[0] : null, error: results.length ? '' : 'No match found. Try editing the title.' };
    } catch {
      return { results: [] as Match[], selected: null, error: 'Could not find matches. Check the connection and try again.' };
    }
  }

  async function findMatches(id: number) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    setRows((current) => current.map((item) => item.id === id ? { ...item, searching: true, error: '' } : item));
    const result = await searchTitle(row.title);
    setRows((current) => current.map((item) => item.id === id ? { ...item, searching: false, matches: result.results, selectedMatch: result.selected ?? null, error: result.error || '' } : item));
  }

  async function findRemainingMatches() {
    const pending = rows.filter((row) => row.include && !row.matches.length && !row.searching && !row.error).slice(0, 30);
    if (!pending.length) return;
    setMatchingBatch(true); setMatchProgress({ done: 0, total: pending.length });
    for (const [index, row] of pending.entries()) {
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, searching: true, error: '' } : item));
      const result = await searchTitle(row.title);
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, searching: false, matches: result.results, selectedMatch: result.selected ?? null, error: result.error || '' } : item));
      setMatchProgress({ done: index + 1, total: pending.length });
    }
    setMatchingBatch(false);
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

  const remainingMatchCount = rows.filter((row) => row.include && !row.matches.length && !row.searching && !row.error).length;

  return <div className="episode-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !importing) onClose(); }}>
    <section className="episode-dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="history-import-title">
      <header className="episode-dialog-header"><div><p className="eyebrow">BRING YOUR HISTORY TO MST</p><h2 id="history-import-title">Import watch history</h2></div><button type="button" className="episode-close" onClick={onClose} aria-label="Close import" disabled={importing}>×</button></header>
      <p className="import-intro">Paste titles from any streaming service, one per line, or import a CSV export. No streaming-service password is needed. Files stay in this browser; titles you ask MST to match are sent to TMDB to find posters and details.</p>
      <div className="import-mode-tabs" role="tablist" aria-label="Choose how to add watch history">
        <button type="button" role="tab" aria-selected={inputMode === 'paste'} className={inputMode === 'paste' ? 'is-active' : ''} onClick={() => setInputMode('paste')} disabled={importing || matchingBatch}>Paste titles</button>
        <button type="button" role="tab" aria-selected={inputMode === 'csv'} className={inputMode === 'csv' ? 'is-active' : ''} onClick={() => setInputMode('csv')} disabled={importing || matchingBatch}>Upload CSV</button>
      </div>
      {inputMode === 'paste' ? <div className="import-paste-box"><label className="sr-only" htmlFor="paste-watch-titles">Paste titles, one per line</label><textarea id="paste-watch-titles" value={pastedTitles} onChange={(event) => setPastedTitles(event.target.value)} placeholder={'Paste or type titles, one per line\nExample:\nThe Bear\nDune: Part Two\nBlue Eye Samurai'} disabled={importing || matchingBatch} /><button type="button" className="watch-primary" onClick={reviewPastedTitles} disabled={importing || matchingBatch || !pastedTitles.trim()}>Review titles</button></div>
        : <label className="import-file-picker"><span>{fileName || 'Choose a CSV file'}</span><input type="file" accept=".csv,text/csv" onChange={(event) => void openFile(event.target.files?.[0])} disabled={importing || matchingBatch} /></label>}
      <p className="import-hint">MST adds movies as completed and shows as watching. Imported show entries do not mark individual episodes watched because the CSV may not identify them reliably.</p>
      {error && <p className="watch-alert" role="alert">{error}</p>}
      {notice && <p className="watch-notice" role="status">{notice}</p>}
      {rows.length > 0 && <>
        <div className="import-list-heading"><div><strong>{rows.length} titles found</strong><span>Select matches to import</span></div><button type="button" className="episodes-link" disabled={matchingBatch || !remainingMatchCount} onClick={() => void findRemainingMatches()}>{matchingBatch ? `Finding ${matchProgress.done} of ${matchProgress.total}…` : remainingMatchCount > 0 ? `Find matches (${Math.min(remainingMatchCount, 30)})` : 'Matches found'}</button></div>
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
        <button type="button" className="watch-primary import-submit" disabled={importing || matchingBatch || !rows.some((row) => row.include && row.selectedMatch)} onClick={() => void importSelected()}>{importing ? `Adding titles ${importProgress.done} of ${importProgress.total}…` : `Import ${rows.filter((row) => row.include && row.selectedMatch).length} matched title${rows.filter((row) => row.include && row.selectedMatch).length === 1 ? '' : 's'}`}</button>
      </>}
    </section>
  </div>;
}
