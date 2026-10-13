// Builds site/data.json: this week's trending movies and shows on TMDB,
// with US content ratings and where each one can be streamed.
// Streaming availability comes from TMDB, which sources it from JustWatch.

import { writeFile } from "node:fs/promises";

try {
  process.loadEnvFile();
} catch {
  // No .env file; expect TMDB_TOKEN in the environment (GitHub Actions).
}

const TOKEN = process.env.TMDB_TOKEN;
if (!TOKEN) {
  console.error("Missing TMDB_TOKEN. Put it in .env (see README).");
  process.exit(1);
}

const REGION = "US";
// 20 titles per page. About half of trending is still in theaters, so fetch
// extra to leave a full list once the page filters to streaming titles.
const TRENDING_PAGES = 6;
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const OUT_PATH = new URL("../site/data.json", import.meta.url);

const UNDER_18_RATINGS = new Set([
  "G", "PG", "PG-13",
  "TV-Y", "TV-Y7", "TV-Y7-FV", "TV-G", "TV-PG", "TV-14",
]);
const FAMILY_GENRES = new Set([10751, 10762]); // Family, Kids

async function tmdb(path) {
  const res = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

function usRating(type, details) {
  if (type === "tv") {
    const us = details.content_ratings?.results.find((r) => r.iso_3166_1 === REGION);
    return us?.rating || null;
  }
  const us = details.release_dates?.results.find((r) => r.iso_3166_1 === REGION);
  const rated = (us?.release_dates ?? []).filter((d) => d.certification);
  // Prefer the theatrical release (type 3) rating when there are several.
  const pick = rated.find((d) => d.type === 3) ?? rated[0];
  return pick?.certification || null;
}

// TMDB lists every way to get a service separately ("Netflix Standard with Ads",
// "Paramount+ Amazon Channel", ...). Collapse those into the service itself.
function serviceName(raw) {
  return raw
    .replace(/ (Amazon|Apple TV|Roku Premium) Channel$/i, "")
    .replace(/ (Standard |Free )?with Ads$/i, "")
    .replace(/ Plus\b/g, "+")
    .replace(/ (Premium\+?|Essential)$/i, "")
    .replace(/^Plex Channel$/, "Plex");
}

function providers(details) {
  const us = details["watch/providers"]?.results?.[REGION] ?? {};
  const toList = (entries = []) =>
    entries
      .sort((a, b) => a.display_priority - b.display_priority)
      .map((p) => {
        const name = serviceName(p.provider_name);
        return { id: name.toLowerCase(), name, logo: `${IMAGE_BASE}/w92${p.logo_path}` };
      });
  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((p) => !seen.has(p.id) && seen.add(p.id));
  };
  return {
    stream: dedupe([...toList(us.flatrate), ...toList(us.free), ...toList(us.ads)]),
    rentOrBuy: dedupe([...toList(us.rent), ...toList(us.buy)]),
    link: us.link ?? null,
  };
}

async function buildTitle(item, rank) {
  const type = item.media_type;
  const extra = type === "tv" ? "content_ratings" : "release_dates";
  const details = await tmdb(`/${type}/${item.id}?append_to_response=watch/providers,${extra}`);
  const rating = usRating(type, details);
  const genreIds = details.genres.map((g) => g.id);
  const date = type === "tv" ? details.first_air_date : details.release_date;

  return {
    rank,
    id: item.id,
    type,
    title: type === "tv" ? details.name : details.title,
    year: date ? date.slice(0, 4) : null,
    overview: details.overview,
    poster: details.poster_path ? `${IMAGE_BASE}/w342${details.poster_path}` : null,
    rating,
    score: details.vote_average ? Math.round(details.vote_average * 10) / 10 : null,
    genres: details.genres.map((g) => g.name),
    under18: rating
      ? UNDER_18_RATINGS.has(rating)
      : genreIds.some((id) => FAMILY_GENRES.has(id)),
    providers: providers(details),
    tmdbUrl: `https://www.themoviedb.org/${type}/${item.id}`,
  };
}

// Rankings can shift between page requests, so the same title may come back twice.
const trending = new Map();
for (let page = 1; page <= TRENDING_PAGES; page++) {
  const { results } = await tmdb(`/trending/all/week?page=${page}`);
  for (const r of results) {
    const key = `${r.media_type}/${r.id}`;
    if ((r.media_type === "movie" || r.media_type === "tv") && !trending.has(key)) trending.set(key, r);
  }
}

// Small batches stay well under TMDB's rate limit.
const items = [...trending.values()];
const titles = [];
for (let i = 0; i < items.length; i += 10) {
  const batch = items.slice(i, i + 10);
  titles.push(...(await Promise.all(batch.map((item, j) => buildTitle(item, i + j + 1)))));
}

await writeFile(
  OUT_PATH,
  JSON.stringify({ generatedAt: new Date().toISOString(), region: REGION, titles }, null, 2),
);
console.log(`Wrote ${titles.length} titles to site/data.json`);
