# MST

MST is a small installable tracker for TV series, movies, and books. It is a static web app with no server or paid service required. Your list is saved in the browser on your device, and the app shell works offline after it has loaded once.

## Run locally

Open `index.html` in a browser. Browser install and offline features require serving the files over HTTPS (GitHub Pages provides this) or from localhost.

## Install on a phone

- **iPhone:** open the deployed site in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the deployed site in Chrome and tap **Install MST** (or use the browser menu).

## Free GitHub Pages deployment

Push the `main` branch to GitHub and enable Pages with **GitHub Actions** as the build and deployment source. The workflow in `.github/workflows/pages.yml` publishes the static files automatically on each push.

## Ideas for a next update

- Add JSON export/import so your list is easy to back up or move to another phone.
- Add optional account based sync across devices; this needs a backend and may have free-tier limits.
- Add ratings, notes, genres, and filters for a richer personal library.
- Add release reminders for ongoing series.
