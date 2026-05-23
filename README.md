# Larkhall Avondale ASC — Results Portal

A static, client-side results portal for Larkhall Avondale ASC, hosted on GitHub Pages. Coaches and parents can browse swimmer personal bests, view competition meet results, and explore club-wide statistics — no login required.

**Live site:** https://larkhallavondaleasc.github.io/laasc-portal/

---

## Features

### Swimmers
- Browse all club members, filterable by squad (Senior, Transition, Junior, Development, Entry)
- Search by name
- Personal best times grouped by course (SCM / LCM)
- Time progression chart per event with PB markers
- Competition date range and meet/stroke summary stats per swimmer

### Meets
- Upcoming meets listed separately from past results
- Past meets filterable by course (SCM / LCM)
- Full results per meet, sorted fastest to slowest per event

### Stats
- Club-wide fastest and average times per event, grouped by stroke
- "Held by" link navigates directly to the swimmer's profile
- Squad vs Club Average grid — shows what proportion of each squad swims faster than the club average
- Squad Averages by Event — average PB per squad per event, colour-coded against the club average
- Filters for course (SCM / LCM) and gender
- Only events with 5 or more recorded personal bests are shown

---

## Data

Data is sourced from [Hy-Tek TM Online](https://www.hy-tekltd.com/) (Sports-Tek) and stored as static JSON files in `data/`:

| File | Contents |
|------|----------|
| `data/athletes.json` | All athletes with personal bests |
| `data/meets.json` | Meet list with dates and course |
| `data/meet_results/<id>.json` | Full results for each meet |
| `data/athlete_results/<id>.json` | Full race history per athlete |
| `data/last_updated.json` | Timestamp of the last data refresh |

### Refreshing data

A GitHub Actions workflow (`fetch_data.yml`) runs every Monday at 07:00 UTC and can also be triggered manually from the Actions tab:

1. Go to **Actions → Refresh Sports-Tek Data → Run workflow**
2. The workflow scrapes Sports-Tek, commits updated JSON to `data/`, and the deploy workflow automatically publishes the changes

The scraper lives in `scripts/fetch_data.py` and requires `requests` and `beautifulsoup4`.

---

## Development

The portal is a single-page application — no build step, no framework, no dependencies beyond Chart.js (loaded from CDN).

```
index.html        — page structure and tab panels
css/style.css     — all styles
js/app.js         — data loading, rendering, routing
scripts/          — Python data scraper
data/             — JSON data files (committed by CI)
images/           — club logo
```

To run locally, serve the repo root over HTTP (browsers block `fetch()` on `file://`):

```bash
python -m http.server 8080
# then open http://localhost:8080
```

---

## Deployment

Every push to `main` triggers the deploy workflow (`deploy.yml`), which publishes the site to GitHub Pages automatically.
