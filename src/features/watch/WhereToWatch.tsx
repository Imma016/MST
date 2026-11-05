import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Provider = { provider_id: number; provider_name: string; logo_path: string };
type Availability = {
  link?: string;
  flatrate?: Provider[];
  free?: Provider[];
  ads?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
};
type Region = { code: string; name: string };
const regions: Region[] = [
  { code: 'CA', name: 'Canada' }, { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' }, { code: 'IE', name: 'Ireland' },
];
const groups: Array<{ key: keyof Availability; label: string }> = [
  { key: 'flatrate', label: 'Stream' }, { key: 'free', label: 'Free' },
  { key: 'ads', label: 'With ads' }, { key: 'rent', label: 'Rent' }, { key: 'buy', label: 'Buy' },
];

export function WhereToWatch({ tmdbId, mediaType }: { tmdbId: number; mediaType: 'tv' | 'movie' }) {
  const [region, setRegion] = useState('CA');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const client = supabase;
    if (!client) { setLoading(false); setError('Provider search is not configured.'); return; }
    setLoading(true);
    setError('');
    void client.functions.invoke('tmdb-search', { body: { action: 'watch-providers', tmdbId, mediaType, region } })
      .then(({ data, error: invokeError }) => {
        if (cancelled) return;
        setLoading(false);
        if (invokeError || data?.error) { setAvailability(null); setError('Where-to-watch information could not be loaded.'); return; }
        setAvailability(data?.availability ?? null);
      });
    return () => { cancelled = true; };
  }, [tmdbId, mediaType, region]);

  const hasProviders = groups.some(({ key }) => (availability?.[key] as Provider[] | undefined)?.length);
  return <section className="where-to-watch" aria-labelledby="where-to-watch-title">
    <div className="provider-heading"><div><p className="eyebrow">STREAMING AVAILABILITY</p><h3 id="where-to-watch-title">Where to watch</h3></div>
      <label><span className="sr-only">Country for provider availability</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
    </div>
    {loading ? <p className="provider-message">Checking services in {regions.find((item) => item.code === region)?.name}…</p>
      : error ? <p className="provider-message" role="status">{error}</p>
        : !hasProviders ? <p className="provider-message">No streaming services are listed for this title in {regions.find((item) => item.code === region)?.name}.</p>
          : <div className="provider-groups">{groups.map(({ key, label }) => {
            const providers = availability?.[key] as Provider[] | undefined;
            if (!providers?.length) return null;
            return <div className="provider-group" key={key}><h4>{label}</h4><div className="provider-list">{providers.map((provider) => <span className="provider-chip" key={provider.provider_id}>
              <img src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt="" loading="lazy" /><span>{provider.provider_name}</span>
            </span>)}</div></div>;
          })}{availability?.link && <a className="provider-link" href={availability.link} target="_blank" rel="noreferrer">View availability on TMDB ↗</a>}</div>}
    <p className="provider-credit">Streaming availability provided by JustWatch via TMDB.</p>
  </section>;
}
