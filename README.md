# ARTEMIS: Global Fire Intelligence System

> NASA Space Apps Challenge 2026 · Arek Artemis (ITS Surabaya)

Artemis is a global platform for putting NASA fire detections from MODIS (2000 - present) and VIIRS (2012 - present) on one comparable scale. The current processed archive and demonstration focus on Indonesia, while the same harmonization workflow is designed to extend to any region worldwide. From that record Artemis builds a month-by-month burning calendar, flags anomalous months and suspicious burn patterns, and turns any hotspot into an action.

## Project summary

Growing up in Indonesia, our team has witnessed firsthand the devastating annual toll of Karhutla (forest and land fires). During these seasons, peatland fires blanket cities and schools in toxic transboundary haze, disrupt daily life, and leave local responders struggling to tell natural drought fires apart from systematic land-clearing burns. We built ARTEMIS to turn over two decades of satellite history into a practical shield for our communities and emergency managers worldwide.

ARTEMIS is an open-source decision-support platform built around a Harmonized Burning Activity Calendar. It merges NASA Earthdata FIRMS fire detections from MODIS (2000 onward, 1 km pixels) and VIIRS (2012 onward, 375 m pixels) into one timeline you can compare across both sensors. Because VIIRS picks up smaller fires, raw detection counts jump about 4.9× after 2012 even when fire activity on the ground stays the same. Artemis removes that artificial jump.

The pipeline runs in four steps:

1. Grid every detection into Uber H3 resolution-8 cells (about 0.74 km²) and count fire cell-days: one cell on one day with at least one detection.
2. Scale VIIRS to match MODIS with a calibration factor (α) for each calendar month, taken from the years both sensors overlap.
3. Mask 18,251 persistent heat sources, such as volcanoes and industrial gas flares.
4. Compare each month with a 25-year baseline using a robust anomaly score: (month − median) ÷ IQR.

Driven by our focus on Karhutla, the harmonized archive holds 7.79 million detections for Indonesia as our primary demonstration region, while live FIRMS detections cover the whole world.

From any hotspot, the Impact Hub gives you four ways to act:

1. **Satellite escrow and relief routing.** Donate to fire groups through Every.org and Kitabisa, or try a simulated proof-of-extinguish escrow and pre-season prevention pool. Artemis predicts the next NOAA-20 and NOAA-21 overpass with SGP4 orbit models, so donors know when a satellite can next check whether the fire reads 0 MW.
2. **Citizen ground-truth.** A simulated SMS and WhatsApp gateway lets village fire patrols (Masyarakat Peduli Api) with no mobile data confirm or reject a hotspot with one digit. Their replies become labels for checking the signature score.
3. **Downwind haze shield.** Artemis combines live OpenWeatherMap wind with OpenStreetMap to draw 6, 12, and 24-hour smoke zones, list the schools and clinics inside them, and draft a haze alert for their staff.
4. **Civic watchdog and P2P logistics.** Generate a printable evidence dossier for environmental law enforcement, and post equipment needs on a peer-to-peer board where nearby groups pledge supplies.

Artemis also scores every Indonesian fire cell from 0 to 100 on four patterns linked to human-set fires: burning that recurs over the years, burning outside the fire season, line-shaped clusters, and afternoon timing. Treat a high score as a reason to check the site on the ground; the score never names who started a fire. An EUDR zero-burn audit checks any plot for burning as part of supply-chain due diligence.

The app runs on TypeScript, React, Vite, and Tailwind CSS, with a Python data pipeline, and deploys on Vercel. Because the archive is pre-processed into static files, the map loads in the browser with no database behind it. Data colors use colorblind-safe ramps, and you can export data as CSV and reports as PDF.

## The problem

Forest, peat, grassland, and agricultural fires worldwide are monitored mostly through 24–48 h live hotspot feeds. Those feeds answer "where is it burning now", but not "is this month unusual?", "does this place burn every few years?" or "what can I do about this hotspot?". Indonesia is the current demonstration region because it provides a strong test case for seasonal and recurring fire activity.

The long record exists, but it can't be compared over time. When VIIRS arrived in 2012, its 375 m pixels began recording about four times as many fire pixels as 1 km MODIS for the same fires. A naive count therefore shows a fire explosion in 2012 that never happened.

## What Artemis does, by challenge objective

The objectives below are paraphrased from our reading of the challenge brief.

| Objective | How Artemis meets it | Where |
|---|---|---|
| Combine MODIS and VIIRS into one consistent long-term record | Per-month VIIRS→MODIS calibration on fire cell-days; S-NPP and NOAA-20 harmonized, NOAA-21 live | `pipeline/harmonize.py`, calendar "Artemis harmonized" |
| Show the 2012 sensor jump and its correction | Raw vs harmonized toggle on the calendar; validation chart below | Calendar toggle, landing preview |
| Burning-activity calendar by region and month | Year × month matrix 2000–2026 for the current Indonesia archive, or any lat/long radius or drawn polygon | `/dashboard` |
| Anomalies against a long baseline | Z = (month − median) / IQR, 2001–2025 baseline, partial current month projected | Calendar anomaly panel |
| Remove non-fire heat | Static mask: FIRMS volcano / static / offshore types plus persistent cells (18,251 sources, 428,579 detections) | Mask toggle, map overlay |
| Spatial detail | H3 cells of ~5 km² (archive), pixel-footprint ellipses at zoom ≥ 9 | Map |
| Data access | CSV export of monthly analytics and detection-level hotspots for any area and period | Calendar "CSV" |
| Accessible design | Colorblind-safe ramps (Viridis, Cividis, YlOrRd); keyboard calendar; table view; AA contrast | Control bar |

### Does Artemis cover the NASA requirements?

**Yes, for the challenge workflow and as a foundation for worldwide coverage.** Artemis combines the processed MODIS and VIIRS archive into a comparable time series, lets users select an area and date range, provides a year-by-month burning-activity calendar with anomaly comparisons, and exports both analytics summaries and detection-level CSV data. The current demo is Indonesia-focused, but the platform's purpose is global: to give responders, land managers, and scientists a consistent way to understand fire activity wherever harmonized data is available.

The result is a statistical harmonization, not a new satellite product or a calibrated fire-probability model. Sensor differences are reduced at the fire-cell-day and monthly-count level, while cloud cover, pixel-footprint uncertainty, satellite overpass timing, and the current archive's Indonesia focus remain limitations. Artemis is intended to support investigation and prioritization; it does not replace field verification, incident command, or evacuation decisions.

**Beyond the brief:**
- A forensic signature score per cell.
- A 4-branch Impact Hub, opened from any hotspot.
- An EUDR zero-burn audit for any plot.

## Harmonization method

1. **Clip.** Detections are clipped to Indonesia using geoBoundaries province polygons (7.79 M detections, Nov 2000 – Nov 2026).
2. **Grid.** Each detection is gridded to H3 resolution 8 (~0.74 km²). The unit is the **fire cell-day**: one cell × one day with ≥ 1 detection, per sensor. This removes most of the extra pixels VIIRS records for a single fire.
3. **Calibrate.** For each VIIRS platform and calendar month, α = median of monthly MODIS / VIIRS cell-day ratios over the overlap years. Provinces get their own α only when they have enough overlap data (≥ 30 cell-days per sensor) and the value stays within 0.5–2× the national α.
4. **Harmonize.** Before 2012 the series is MODIS alone; after that it is the mean of MODIS, α·S-NPP and α·NOAA-20, for every sensor covering ≥ 50% of the month.

| Platform | National pooled α | Monthly α range | Fit (log R²) | Median abs. error |
|---|---|---|---|---|
| VIIRS Suomi-NPP | 0.274 | ≈ 0.21–0.31 | 0.976 (167 months) | 9.6% |
| VIIRS NOAA-20 | 0.253 | ≈ 0.21–0.31 | 0.968 (93 months) | 12.0% |

![Raw vs harmonized annual totals for Indonesia](pipeline/validation_annual.png)

Across 2001–2025, raw detection counts jump about 4.9× after 2012. The harmonized series has no step at 2012.

The full method is in [`pipeline/README.md`](pipeline/README.md).

## Anthropogenic thermal signature (forensic score)

A transparent, **rule-based score** (0–100) for every ~5 km² cell with at least 3 active days since 2001 (168,595 cells), plus its national percentile.

| Feature | Weight | What it measures |
|---|---|---|
| Multi-year recurrence | 0.35 | Years with burning, and the share of gaps between burn years lasting 3–5 years |
| Off-season burning | 0.30 | Detections in the province's low-fire months (drought-anomaly months count half) |
| Geometric regularity | 0.20 | How line-like same-day VIIRS clusters are |
| Afternoon timing | 0.15 | Afternoon-overpass share, ranked within the province |

Score quantiles: median 38, p90 53, p99 62. The Impact Hub evidence dossier unlocks for the top 10% (percentile ≥ 90).

**Limitations:**
- This is **not a trained model and not a probability**. The weights are hand-set.
- The planned validation compares post-fire NDVI and forest-loss trajectories; it is shown as "Planned" in the inspector and is not in this build.
- VIIRS scan geometry can make small clusters look linear.
- Peat fires are mostly human-ignited but burn in the dry season, so a low score does not mean "natural".
- The score flags patterns for field checks. It never identifies who started a fire.

## What is real and what is simulated

| Real data | Simulated, and tagged SIMULATED or DEMO in the UI |
|---|---|
| 2000–2026 archive, calendar, anomalies, mask, hexes, forensic scores | Escrow pledges and the QRIS/CSR payment flow: no payment is made |
| Live NASA FIRMS hotspots (MODIS, NOAA-20, NOAA-21) | SMS / WhatsApp patrol bot and photo labels (stored in the browser only) |
| Next VIIRS overpass: CelesTrak orbit data propagated with SGP4 | WhatsApp haze-alert broadcast: preview only, nothing is sent |
| Downwind cone from live OpenWeatherMap wind | P2P logistics board (stored in the browser only) |
| Schools and clinics in the cone from OpenStreetMap | Demo plot **names** in `/audit`; their coordinates and verdicts are real |
| EUDR verdicts, burn-rate statistics and dossiers computed from the archive | |

The demo audit plots, chosen from the processed data:
- **Plot A:** square centred at 4.630°N, 96.860°E (±0.006°), Central Aceh. Its archive cell burned only in 2018, so it **passes**.
- **Plot B:** −3.222…−3.205°N, 112.664…112.690°E, Central Kalimantan. 60 detections since 2021 and a 3.0-year mean burn interval, so it is **flagged**.

## Data sources and attribution

| Source | Used for | Access |
|---|---|---|
| NASA FIRMS: MODIS C6.1, VIIRS S-NPP / NOAA-20 / NOAA-21 | Archive and live hotspots | Server proxy `/api/firms` (MAP_KEY on the server) |
| CelesTrak | NOAA-20 / NOAA-21 orbit data (TLEs) | Server proxy `/api/tle`, cached 6 h |
| OpenWeatherMap | Current wind, humidity, temperature | Server proxy `/api/weather` |
| NewsData.io | English wildfire news (top-priority domains, duplicates and aggregators removed) on the landing page | Server proxy `/api/news` |
| OpenStreetMap via Overpass API | Schools and health facilities in the haze cone | Browser, public endpoint |
| OpenStreetMap Nominatim | Place names for hotspots | Browser, public endpoint |
| CARTO basemaps | Dark map tiles | Browser |
| Esri World Dark Gray Canvas | Fallback dark tiles when no CARTO key is set | Browser, keyless |
| NASA Black Marble 2016 | Land dots on the landing-page globe | Bundled image |
| Every.org | Global wildfire nonprofits | Browser (public partner key) |
| Bing Web Search | Optional donation-discovery service (`services/donation-discovery`) | Server-side, optional |
| geoBoundaries (CC BY 4.0) | Province polygons in the pipeline | Pipeline only |

Map data © OpenStreetMap contributors, © CARTO. Fire data courtesy of NASA FIRMS (LANCE / EOSDIS).

## Running locally

```bash
npm install
cp .env.example .env    # fill in your own keys
npm run dev             # http://localhost:5173
```

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

The processed archive ships in `public/data/` (about 126 MB), so the pipeline is only needed to rebuild it.

**Keys are per machine.** `.env` is never committed, so a fresh clone or Codespace starts without keys: the live map then shows "FIRMS_API_KEY is not configured on the server" and has no live detections (the archive calendar still works). Add the keys from the table below to that machine's `.env`.

**GitHub Codespaces.** `.devcontainer/devcontainer.json` installs dependencies and asks for the keys when the Codespace is created. To set them once for every Codespace: GitHub → **Settings → Codespaces → Secrets → New secret**, add `FIRMS_API_KEY`, `OPENWEATHER_API_KEY` (and the optional ones), give the secret access to this repository, then rebuild or recreate the Codespace. Run `npm run dev` and open the forwarded port 5173.

### Rebuilding the archive

```bash
python -m pip install -r pipeline/requirements.txt
python -I pipeline/fetch_archive.py   # ~1 GB raw FIRMS download, resumable
python -I pipeline/harmonize.py       # clip, grid, mask, calibrate, anomalies
python -I pipeline/export.py          # write public/data/
python -I pipeline/forensics.py       # forensic signature tiles
```

Raw and intermediate files go to `%LOCALAPPDATA%/artemis-pipeline/`. Override with `ARTEMIS_RAW_DIR` / `ARTEMIS_WORK_DIR`.

## Environment variables

Server-side variables are read only by the `/api/*` functions (and the Vite dev server). They never reach the browser.

| Variable | Side | Required | Purpose |
|---|---|---|---|
| `FIRMS_API_KEY` | Server | Yes | NASA FIRMS MAP_KEY |
| `OPENWEATHER_API_KEY` | Server | Yes | OpenWeatherMap current weather |
| `NEWSDATA_API_KEY` | Server | No | NewsData.io (the legacy name `VITE_NEWSDATA_API_KEY` is still read server-side) |
| `VITE_CARTO_API_KEY` | Browser | No | CARTO dark basemap; without it the maps fall back to Esri's keyless dark canvas |
| `VITE_EVERY_ORG_API_KEY` | Browser | No | Every.org public partner key |
| `VITE_DONATION_DISCOVERY_URL` | Browser | No | Optional Python discovery service (`services/donation-discovery`) |

## Deploying to Vercel

`vercel.json` serves the SPA (every app route falls back to `index.html`), the static `/data` archive with cache headers, and four functions: `api/firms`, `api/weather`, `api/tle` and `api/news`.

**Recommended: GitHub + Vercel Git integration.** The static archive is about 126 MB, over the 100 MB limit for CLI uploads on the Hobby plan; deploying from a Git repository has no such limit.

1. Push this repository to GitHub (every file in the repo is under GitHub's 100 MB per-file limit).
2. In Vercel: **Add New → Project → Import** the repository. Framework preset: **Vite** (detected). Build command `npm run build`, output `dist` (both also set in `vercel.json`).
3. **Settings → Environment Variables** (Production and Preview): add the variables from the table above. `FIRMS_API_KEY` and `OPENWEATHER_API_KEY` are required for the live map and weather; the others are optional.
4. Deploy. Every push to `main` redeploys; pull requests get preview URLs.
5. After the first deploy, set the absolute share-card URL in `index.html` (`og:image`, `twitter:image`) to `https://<your-domain>/og-image.png`.

Alternatives to the Git route: the Pro plan, or shrinking the archive under 100 MB (for example by gzipping the `hex/` and `forensics/` JSON as the point files already are) and deploying with `vercel --prod`.

**The GitHub Actions workflow** (`.github/workflows/main.yml`) is a second deploy path: on every push to `main` it builds with the Vercel CLI and uploads the result with `vercel deploy --prebuilt --prod`, using the `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` repository secrets. That upload goes through the CLI, so it is subject to the same Hobby upload limit as `vercel --prod`. If the Vercel Git integration is connected, the workflow is redundant and can be removed.

### Live data on the deployed site

Nothing needs redeploying for the data to stay current. The live layers are fetched at request time by the `/api/*` functions, and Vercel's edge caches each response for a short window:

| Route | Source | Edge cache |
|---|---|---|
| `/api/firms` | NASA FIRMS NRT detections, worldwide | 15 min |
| `/api/weather` | OpenWeatherMap current weather | 10 min |
| `/api/news` | NewsData.io wildfire headlines | 30 min |
| `/api/tle` | CelesTrak orbital elements for NOAA-20 / NOAA-21 | 6 h |

The browser also keeps the FIRMS and news responses for 30 minutes, so an open tab shows new detections after a reload once that window passes. FIRMS itself publishes NRT detections roughly three hours after each satellite pass. Only the 26-year harmonized archive in `public/data/` (Indonesia) is static; it changes when the pipeline is re-run and the result is committed.

Changing a key in **Settings → Environment Variables** takes effect on the next deployment (Vercel → Deployments → ⋯ → Redeploy), not on the running one.

### Deploy checklist

- [ ] Vercel project imported from `evandakara/artemis`, preset Vite.
- [ ] `FIRMS_API_KEY` and `OPENWEATHER_API_KEY` set for Production and Preview; `NEWSDATA_API_KEY` too if the news strip should show headlines.
- [ ] `VITE_CARTO_API_KEY` set if you want the CARTO basemap (otherwise Esri's keyless one is used). `VITE_*` values are baked in at build time, so redeploy after changing them.
- [ ] After deploying, open `https://<your-domain>/api/firms?product=VIIRS_NOAA21_NRT&area=world&days=1` and `/api/weather?lat=-0.5&lon=101.4`: both should return 200 with data, not a "not configured" message.
- [ ] Open `/dashboard` and confirm live hotspots appear on the map.
- [ ] Set the absolute `og:image` / `twitter:image` URL in `index.html` to the production domain.

## Project structure

```
api/                  Vercel functions (thin wrappers)
server/handlers.ts    Proxy logic shared by the functions and the Vite dev server
pipeline/             Python archive pipeline and method notes
public/data/          Processed archive (calendar, hex, points, forensics, static)
src/pages/            Landing, Dashboard, Impact, Audit
src/components/       Map, calendar, inspector, impact hub, landing sections
src/lib/              AOI geometry, calendar data, audit, dossier, haze cone, exports
src/data/             Typed loaders for the archive and APIs
```

## Limitations

- Harmonization is a statistical calibration of counts, not a re-detection. α captures the average sensitivity difference per calendar month, not per fire.
- MODIS Terra's orbit has drifted since 2020. S-NPP and NOAA-20 data after July 2026 are near-real-time products that FIRMS later reprocesses.
- Satellites miss fires under persistent cloud. The inspector warns when nearby fires seen yesterday are missing today.
- Detection positions carry pixel-size uncertainty: 375 m (VIIRS) or 1 km (MODIS) at nadir, and more toward the swath edge.
- The haze cone is straight-line advection from the current surface wind, not a dispersion model.
- An EUDR PASS screens for burning only. Clearing without fire is not detected.

Artemis is a decision-support tool. Satellite detections are observations, not incident-command instructions or evacuation orders, and they need field confirmation.

## Team and Event

**Team:** ITS Surabaya, Institut Teknologi Sepuluh Nopember, Indonesia

### Contributors

| Name | Handle | Role |
|---|---|---|
| Fadhil Mauludi | `@fadhilm` | Team owner |
| Ellvis Cornelius Setiawan | `@ellviscs` | Contributor |
| Desanda Verdely Yulisar | `@mrpupperfish` | Contributor |
| Evan Dakara Sukatrilaksana | `@evandakara` | Contributor |
| Jonathan Itung | `@jonathanitung` | Contributor |
| Muhammad Syamfiraas Akbar | `@firz` | Contributor |

**Event:** [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/)

## License and external services

The project is released under the [MIT License](LICENSE). It also incorporates
third-party data and services whose terms and attribution requirements apply:

| Provider | Data or service | Terms / attribution |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | MODIS C6.1 and VIIRS 375 m fire detections | Courtesy of NASA Earthdata / LANCE / EOSDIS |
| [geoBoundaries](https://www.geoboundaries.org/) | IDN ADM1 administrative boundaries | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [OpenStreetMap](https://www.openstreetmap.org/) | Nominatim geocoding and Overpass facilities | [ODbL](https://www.openstreetmap.org/copyright); follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) |
| [CARTO](https://carto.com/) | Dark Matter basemap tiles | © CARTO |
| [Esri](https://www.esri.com/) | World Dark Gray basemap | © Esri |
| [OpenWeatherMap](https://openweathermap.org/) | Weather and wind data | Provider terms apply |
| [CelesTrak](https://celestrak.org/) | Satellite TLE data | Provider terms apply |
| [NewsData.io](https://newsdata.io/) | Wildfire news headlines | Provider terms apply |
| [Every.org](https://www.every.org/) | Nonprofit discovery and donation integration | Provider terms apply |

See [`LICENSE`](LICENSE) for the complete MIT license and third-party
attributions. Review each provider's current terms before public deployment.
