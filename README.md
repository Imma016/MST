# MST

MST is a personal tracker for the shows, movies, and books people care about. The project is being rebuilt in small steps as a React + TypeScript progressive web app. It will keep the MST name and install from the browser on iPhone, Android, and desktop.

## Current build step

This branch includes the mobile React app shell, Supabase accounts, separate TV/Movies/Anime search with posters, and TV episode progress with upcoming air dates when TMDB has them. The Books tab searches Google Books and Open Library and saves personal reading shelves and page progress. The previous tracker is preserved at `public/classic.html` and can still be opened at `/MST/classic.html` after deployment. Its data remains in browser storage under `tracker_v1`; keep that storage intact until the account migration step is complete.

To connect TV/movie/Anime search, follow [docs/watch-search-setup.md](docs/watch-search-setup.md). The setup needs a free TMDB API token saved as a Supabase Edge Function secret; the token is never included in the browser app. Books search setup is in [docs/books-setup.md](docs/books-setup.md).

Database migrations are applied by GitHub Actions from `main`; see [docs/supabase-migrations-automation.md](docs/supabase-migrations-automation.md) for the one-time secrets and migration-history setup.

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm run dev
```

If you already installed the foundation dependencies before the account step, run `npm install @supabase/supabase-js` once to add Supabase Auth. No extra npm packages are needed for watch search.

For a production preview:

```sh
npm run build
npm run preview
```

The GitHub Pages workflow builds the app and publishes the `dist` directory. Local development uses `/`; the Pages build uses `/MST/`.

## Planned stack

- React and TypeScript for reusable, typed UI.
- Supabase Auth and PostgreSQL with Row Level Security for accounts and private data.
- Supabase Edge Functions to protect API credentials and cache metadata lookups.
- TMDB for show and movie metadata; Open Library and Google Books for book discovery.
- Browser storage and a service worker for offline access and pending changes.
- GitHub Pages and Supabase free tiers, with no paid services in the plan.

Public profiles, lists, and social content will be opt-in. The owner overview will show account counts and aggregate activity only; it will not expose users' private libraries.

## Current app

The React app uses Supabase for authentication and private library entries. Open `public/classic.html` for the working legacy tracker; it stores its data in the browser. The migration from that local data into the signed-in account has not been added yet.
