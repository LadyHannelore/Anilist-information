# Anilist information

A static page that shows everything publicly available on an [AniList](https://anilist.co) profile (default: `LadyHannelore`), using the [AniList GraphQL API](https://docs.anilist.co/guide/introduction). No backend, API key or build step.

## Features

- **Profile**: avatar, banner, bio, join date, followers, following, reviews, threads and options.
- **Reads**: weekly, monthly and yearly manga chapter counts with per-series breakdowns and cover thumbnails, plus charts by period, weekday, hour and series, and a daily heatmap for the last year.
- **Statistics**: anime and manga genres, tags, formats, statuses, countries, scores, release years, staff, studios and voice actors, shown as charts and tables.
- **Favourites**: anime and manga cards with covers, genres, average score and descriptions; characters, staff and studios.
- **Lists**: full anime and manga lists as cover cards with status, score, progress, repeats, dates, notes and expandable descriptions.
- **Theme**: pastel pink and lavender "moe" styling in `moe.css`, layered over the base `style.css`. Remove the `moe.css` link in `index.html` for the plain dark look.

Type any public AniList username into the box at the top to load it.

## Run locally

Open `index.html` in a browser. Chart.js and the fonts are loaded from CDNs, so you need internet access.

## Deploy to GitHub Pages

Push to `main`, then go to **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`. Pages can take a minute or two to rebuild.

If the site still shows an old design, your browser is caching the CSS and JS. Hard refresh (Ctrl+Shift+R), or bump the `?v=` number on the `style.css`, `moe.css` and `app.js` links in `index.html` when you change them.

## Notes

- Reads are computed from your manga activity feed. A range such as "read chapter 5 - 9" counts as 5 chapters and a single update counts as 1, so bulk progress jumps are undercounted and unlogged reads don't appear.
- The activity feed loads in pages, so long histories take a couple of minutes. AniList allows about 90 requests per minute; the page retries automatically if it is rate limited.
- Only public data is used. Private lists need OAuth, which this page does not use.

