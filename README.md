# Larkhall Avondale ASC — Results Portal

A static, client-side results portal for Larkhall Avondale ASC, hosted on GitHub Pages. Coaches and parents can browse swimmer personal bests, view competition meet results, and explore club-wide statistics — no login required.

**Live site:** https://larkhallavondaleasc.github.io/laasc-portal/

---

## Features

### Swimmers
- Browse all club members, filterable by squad (Senior, Transition, Junior, Development, Entry)
- Search by name
- Personal best times grouped by course (SCM / LCM) with horizontal scroll on mobile
- **Improvement columns** — each PB row shows:
  - *Overall ↓* — time delta and percentage from first recorded time to current PB
  - *Latest ↓* — time delta and percentage from previous PB to current PB
- Time progression chart per event, split into SCM and LCM datasets with toggle buttons
- ★ markers on the chart for each point that was a PB at the time of the swim
- Competition date range and meet/stroke summary stats per swimmer (split into Competitions and Strokes groups)

### Meets
- Upcoming meets listed separately from past results
- Past meets filterable by course (SCM / LCM)
- **Disability Meet badge** — purple badge shown on any meet manually flagged in `data/meet_flags.json`
- Full results per meet, sorted fastest to slowest per event

### Stats
- Club-wide fastest and average times per event, grouped by stroke
- "Held by" link navigates directly to the swimmer's profile
- Date range shown for the current course/gender filter
- Only events with 5 or more recorded personal bests are shown
- Filters for course (SCM / LCM) and gender (All / Male / Female)
- **Squad vs Club Average** — proportion of each squad with a PB faster than the club average, colour-coded green / amber / red
- **Squad Averages by Event** — average PB per squad per event, colour-coded against the club average
- **Age Group vs Club Average** — same comparison split by club championship age bands (10 & Under / 11–12 / 13–14 / 15 & Over)
- **Age Group Averages by Event** — average PB per age group per event, colour-coded against the club average

---

## Data

Data is sourced from [Hy-Tek TM Online](https://sports-tek.active.com/TMOnline/index.asp?STRIPPED=LarkhallAvondaleASC) (Sports-Tek) and stored as static JSON files in `data/`:

| File | Contents |
|------|----------|
| `data/athletes.json` | All athletes with personal bests |
| `data/meets.json` | Meet list with dates and course |
| `data/meet_results/<id>.json` | Full results for each meet |
| `data/athlete_results/<id>.json` | Full race history per athlete |
| `data/last_updated.json` | Timestamp of the last data refresh |
| `data/meet_flags.json` | Manual per-meet flags (e.g. disability meets) |

### meet_flags.json

This file is not touched by the automated refresh and is maintained manually. Each key is a meet ID (visible in the URL as `#meet-<id>` when viewing a meet):

```json
{
  "273": { "disability": true },
  "274": { "disability": true }
}
```

Setting `"disability": true` adds a purple **Disability** badge to the meet in the list and detail views.

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
data/meet_flags.json — manual meet flags (committed by hand)
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
