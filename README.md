# What's Streaming

A small site showing this week's trending movies and shows, which US streaming services carry them, and a filter for titles suitable for under-18s.

- **Trending list:** TMDB's weekly trending titles. This ranks by activity on TMDB, not by hours watched.
- **Where to stream:** TMDB's watch provider data, sourced from JustWatch.
- **Under 18:** rated G, PG or PG-13 (TV-Y through TV-14), or unrated and tagged Family or Kids.

A GitHub Action rebuilds the data once a day and publishes the site to GitHub Pages. Refreshing the page shows the latest daily snapshot. There are no API calls from the browser and no running costs.

## Run locally

1. Get a TMDB API Read Access Token: sign up at themoviedb.org, then Settings, API.
2. `cp .env.example .env` and paste the token after `TMDB_TOKEN=`.
3. `npm run dev`, then open http://localhost:8000.

Node 22 or later. No dependencies to install.

## Deploy

1. Push this repo to GitHub.
2. Settings, Secrets and variables, Actions: add a secret named `TMDB_TOKEN`.
3. Settings, Pages: set Source to "GitHub Actions".
4. Actions tab: run "Refresh and deploy" once. After that it runs daily.

Personal, non-commercial use only, per TMDB's API terms.
