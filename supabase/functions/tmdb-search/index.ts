const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type MediaType = 'movie' | 'tv';
type Category = 'tv' | 'movie' | 'anime';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Use POST to search.' }, 405);

  const token = Deno.env.get('TMDB_API_READ_ACCESS_TOKEN');
  if (!token) return json({ error: 'TMDB search is not configured yet.' }, 503);

  try {
    const body = await request.json() as {
      action?: unknown;
      query?: unknown;
      category?: unknown;
      tmdbId?: unknown;
      seasonNumber?: unknown;
    };
    if (body.action === 'tv-details' || body.action === 'tv-season') {
      const tmdbId = Number(body.tmdbId);
      if (!Number.isSafeInteger(tmdbId) || tmdbId < 1) return json({ error: 'That show could not be found.' }, 400);
      let endpoint = `/tv/${tmdbId}`;
      if (body.action === 'tv-season') {
        const seasonNumber = Number(body.seasonNumber);
        if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || seasonNumber > 100) {
          return json({ error: 'Choose a valid season.' }, 400);
        }
        endpoint += `/season/${seasonNumber}`;
      }
      const response = await fetch(`https://api.themoviedb.org/3${endpoint}?language=en-US`, {
        headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`TMDB details request failed (${response.status}).`);
      return json(await response.json());
    }
    if (body.action && body.action !== 'search') return json({ error: 'That request is not supported.' }, 400);
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 100) : '';
    const category = body.category as Category;
    if (query.length < 2) return json({ results: [] });
    if (!['tv', 'movie', 'anime'].includes(category)) return json({ error: 'Choose TV, Movies, or Anime.' }, 400);

    const mediaTypes: MediaType[] = category === 'anime' ? ['tv', 'movie'] : [category];
    const responses = await Promise.all(mediaTypes.map(async (type) => {
      const url = new URL(`https://api.themoviedb.org/3/search/${type}`);
      url.searchParams.set('query', query);
      url.searchParams.set('include_adult', 'false');
      url.searchParams.set('language', 'en-US');
      url.searchParams.set('page', '1');
      const response = await fetch(url, {
        headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`TMDB search failed (${response.status}).`);
      const data = await response.json() as { results?: Array<Record<string, unknown>> };
      return (data.results ?? []).map((item) => ({ ...item, media_type: type }));
    }));

    const results = responses.flat().filter((item) => {
      if (category !== 'anime') return true;
      const genres = item.genre_ids as number[] | undefined;
      const countries = item.origin_country as string[] | undefined;
      return genres?.includes(16) && (item.original_language === 'ja' || countries?.includes('JP'));
    }).slice(0, 30);
    return json({ results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Search could not be completed.' }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
