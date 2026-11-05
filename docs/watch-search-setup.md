# MST TV, movie, and anime search

This step adds poster search and a private watch library. Apply the database SQL and configure the TMDB search function before testing it in the app.

## 1. Add the library tables

In Supabase **SQL Editor**, create a new query, paste all of `supabase/migrations/202611050002_watch_library.sql`, then run it. The catalog contains shared TMDB metadata; `user_library` rows are protected so each signed-in user can only read and change their own titles.

## 2. Get a TMDB API token

Create/sign in to a TMDB account, open the account settings and request API access. In the app, TMDB search and poster images are used for non-commercial purposes with attribution. See [TMDB's API FAQ](https://developer.themoviedb.org/docs/faq) and [getting started guide](https://developer.themoviedb.org/docs/getting-started).

## 3. Save the token in Supabase

In your Supabase project, open **Edge Functions → Secrets**, add a secret named `TMDB_API_READ_ACCESS_TOKEN`, paste the TMDB API Read Access Token as its value, and save. Keep this token in Supabase; do not put it in `.env.local`, GitHub, or app code.

## 4. Deploy the search function

For initial setup, in Supabase **Edge Functions**, choose **Deploy a new function → Via Editor**, name it `tmdb-search`, and deploy `supabase/functions/tmdb-search/index.ts` with JWT verification enabled (the default). The signed-in MST client calls this function; it forwards validated searches and details requests to TMDB without exposing the token in the app.

The repository now deploys later changes to this function automatically through `.github/workflows/deploy-supabase-functions.yml`. It uses the existing `SUPABASE_ACCESS_TOKEN` GitHub Actions secret. [Supabase's dashboard guide](https://supabase.com/docs/guides/functions/quickstart-dashboard) and [secrets guide](https://supabase.com/docs/guides/functions/secrets) show the initial setup screens.

## 5. Refresh MST and try a search

Sign in, open **Watch**, choose **TV Shows**, **Movies**, or **Anime**, and enter at least two characters. Tap **+ Add to library** to save the title and poster. **My library** shows your saved poster, lets you change its status, and lets you remove it.

Anime results include TMDB titles tagged as animation that are Japanese or have Japan in their origin countries. Anime tagging in metadata is not perfectly consistent, so a few results can be missed.

TMDB requires its approved logo and this notice: “This product uses the TMDB API but is not endorsed or certified by TMDB.” MST keeps the logo and notice in Profile → About & Credits, as TMDB's [attribution guidance](https://developer.themoviedb.org/docs/faq) specifies. API access is free for non-commercial use with attribution; commercial use requires a separate license.

## Add episode tracking

In Supabase **SQL Editor**, run `supabase/migrations/202611050003_episode_progress.sql` as a new query. Then update the existing `tmdb-search` Edge Function from the Dashboard editor with the current `supabase/functions/tmdb-search/index.ts` file, and deploy the update. Episode progress belongs to the signed-in user; each row stores the episode, season/episode number, and watched date. TMDB provides season episodes and air dates through its [TV season details endpoint](https://developer.themoviedb.org/reference/tv-season-details).

Open **My library** and choose **Episodes & details** on a TV show or anime series. The detail view has an Info tab with region-specific streaming availability and an Episodes tab for progress. Choose a season, mark an aired episode watched, and adjust its watch date. Future-dated episodes show their release date and cannot be marked watched early. Movies have a Details & where to watch view. Streaming data is supplied by JustWatch through TMDB, and MST links to TMDB's availability page rather than guessing direct service links.
