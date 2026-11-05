# MST

MST is a personal tracker for the shows, movies, and books people care about. The project is being rebuilt in small steps as a React + TypeScript progressive web app. It will keep the MST name and install from the browser on iPhone, Android, and desktop.

## Current build step

This branch introduces the React app shell and mobile navigation. The previous tracker is preserved at `public/classic.html` and can still be opened at `/MST/classic.html` after deployment. Its data remains in browser storage under `tracker_v1`; keep that storage intact until the account migration step is complete.

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm run dev
```

If you already installed the foundation dependencies before the account step, run `npm install @supabase/supabase-js` once to add Supabase Auth.

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

Open `public/classic.html` for the working legacy tracker. It stores data in the current browser. The React shell reads the existing `tracker_v1` record to show a small library summary, but account sign-in and cloud migration have not been added yet.
