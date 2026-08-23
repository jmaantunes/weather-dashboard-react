# Weather Dashboard

A React + TypeScript + Vite weather dashboard: an interactive annual temperature
chart (observed history vs. a 1991–2020 seasonal baseline vs. a short-range
forecast) and a 7-day forecast you can click into for hour-by-hour detail.
Built with [ECharts](https://echarts.apache.org/) and
[lucide-react](https://lucide.dev/), pulling live data from the free
[Open-Meteo](https://open-meteo.com) API — no API key required anywhere.

## Develop locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Build

```bash
npm run build
```

Type-checks with `tsc` and outputs a production build to `dist/`. Preview it with:

```bash
npm run preview
```

## Deploy to GitHub Pages

There are two ways to do this — pick one.

### Option A — automatic (recommended)

This repo includes `.github/workflows/deploy.yml`, which builds and deploys on
every push to `main`.

1. Push this project to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` (or re-run the workflow from the **Actions** tab). The site
   will be live at `https://<your-username>.github.io/<your-repo>/` a minute
   or two later.

No further configuration needed — `vite.config.ts` uses a relative `base`, so
it works regardless of the repo name or path it's served from.

### Option B — manual, via the `gh-pages` branch

```bash
npm run deploy
```

This builds the project and pushes `dist/` to a `gh-pages` branch (via the
`gh-pages` package). Then in **Settings → Pages**, set **Source** to
**Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.

## What's inside

```
index.html            — Vite entry HTML
vite.config.ts         — build config (relative base for GH Pages)
src/
  main.tsx              — React root
  App.tsx               — all UI components + app state
  api.ts                 — Open-Meteo fetch calls (forecast, archive, baseline, geocoding)
  types.ts               — shared TypeScript types
  weather.ts              — formatting helpers (labels, icons, dates)
  styles.css              — all styling
```

## How the annual chart works

- **Typical** — the 1991–2020 average temperature for each calendar day (a
  climate normal), computed client-side from one archive API call.
- **Observed** — what actually happened for the selected year, from the
  archive API.
- **Forecast** — real forecast data, but only for the *current* year and only
  for roughly the next two weeks (as far as Open-Meteo's forecast model
  extends), starting from today. Other years show no forecast line — daily
  weather that far out genuinely can't be predicted, so the chart doesn't
  pretend otherwise.
- **Avg / Min-Max toggle** — switches every visible line between a single
  mean-temperature curve and a shaded band showing each day's actual
  min–max range.

## Notes

- Location and unit preference are saved to `localStorage`.
- The production JS bundle is ~400KB gzipped, mostly ECharts. If you want to
  trim that, the biggest win would be code-splitting ECharts with a dynamic
  `import()` — not done here to keep the app a single straightforward bundle.
