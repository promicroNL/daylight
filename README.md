# Daylight

**A local dashboard for exploring your Fitbit and Google Health history.**

Daylight turns an extracted Takeout export into interactive charts for sleep scores, heart rate variability, resting heart rate, and average heart rate. Its goal is to make long-term patterns easier to see while keeping your health data on your own computer.

No accounts, API keys, cloud uploads, analytics, or external chart services. Once the project and Node.js are installed, importing and viewing your data works offline.

![Daylight dashboard showing synthetic example readings](dashboard/preview.png)

To explore the demo without an export, run `node dashboard/demo.mjs` and open [http://127.0.0.1:4174](http://127.0.0.1:4174). The demo never reads your imported dataset.

## Features

- Sleep scores, HRV (RMSSD), resting heart rate, and daily average heart rate.
- Ranges of 1 week, 2 weeks, 1 month, 3 months, 1 year, and all history.
- Custom dates for multi-year comparisons and previous/next period navigation.
- Daily readings with optional 7-day or 30-day smoothing.
- Coverage counts and visible gaps for missing observations.
- Interactive charts, keyboard inspection, and expandable daily-value tables.
- A reusable importer that preserves the original export files.

## Requirements

- Node.js 20 or newer, available as `node` in your terminal.
- A modern web browser.
- An extracted Google Health or Fitbit Takeout export with supported records.
- Git to clone the repository, or download and extract the repository ZIP instead.

No package installation or build step is required. Daylight uses built-in Node.js modules and plain HTML, CSS, and JavaScript.

## Quick start

### 1. Download the project

```sh
git clone https://github.com/promicroNL/daylight.git
cd daylight
```

If you downloaded the repository ZIP, extract it and open a terminal in the extracted project folder.

### 2. Prepare your export

Download your Google Health / Fitbit data through Google Takeout and extract the archive. Prefer keeping the export outside this repository. You can point the importer at the extracted Takeout root or its Google Health / Fitbit subfolder.

The importer reads folders, not ZIP files. If the export contains several archives, extract their contents into one folder while preserving the directory structure.

### 3. Import your data

From the project root, run the appropriate example with your own export path.

**Windows (PowerShell or Command Prompt):**

```powershell
node dashboard/import.mjs "C:\Users\YourName\Downloads\Takeout"
```

**macOS or Linux:**

```sh
node dashboard/import.mjs "/path/to/extracted/Takeout"
```

Quote paths, especially when they contain spaces. The importer prints file and sample counts, available date ranges, and parsing warnings. Large heart-rate exports can take a little while to process.

The result is saved to `dashboard/data.json`. This file contains your private health summaries and is ignored by Git.

### 4. Start the dashboard

From the project root:

```sh
node dashboard/server.mjs
```

Open **[http://127.0.0.1:4173](http://127.0.0.1:4173)** in your browser. Keep the terminal running while using the dashboard; press `Ctrl+C` to stop it. Use this URL rather than opening `index.html` directly.

On Windows, after importing, you can also double-click **Start Dashboard.cmd**. If no generated data exists, the launcher first tries to import an export located under the project root. For exports stored elsewhere, run the explicit import command above first.

## Exploring your history

The dashboard initially shows the 90 days ending at the latest imported observation, which may be earlier than today.

| Control | Behavior |
| --- | --- |
| Range presets | Select 7, 14, 30, 90, or 365 days, or all history. Months and years use fixed day counts. |
| From / To | Choose a custom interval within your imported history. |
| Previous / next arrows | Move backward or forward by the selected interval. |
| Latest | Return to the latest observation using the active preset, or 90 days after a custom/all-history selection. |
| Trend | Select daily values, a 7-day mean, or a 30-day mean. |
| Chart inspection | Hover, or focus a chart with Tab and use arrow keys. Home and End jump to the endpoints. |
| Daily values | Expand the table below a chart for exact readings. |

Summary cards average the available daily values in the selected period and show the number of days with observations. Faint lines show daily measurements; the stronger line shows the selected trend. Missing days remain gaps, including long gaps in all-history views.

## Importing new exports

Run the import command again with the new extracted export path, then refresh your browser. The server does not need to restart.

Each import **replaces** the generated dataset; it does not append to the previous import or modify the source export. To combine exports, put them beneath one input folder and import that folder. Avoid overlapping heart-rate files: duplicate samples are counted again and can affect averages.

An import with no supported observations preserves the previous dataset. If some recognized files cannot be parsed, the importer reports warnings and can still write the successfully parsed records. Review warnings for incomplete imports. Source files are not watched automatically.

## Supported export formats

| Metric | Recognized filenames | Value used |
| --- | --- | --- |
| Sleep score | `sleep_score*.csv`, `UserSleepScores*.csv` | `overall_score`, dated by `timestamp` or `score_time` |
| Heart rate variability | `Daily Heart Rate Variability Summary*.csv` | `rmssd`, in milliseconds |
| Resting heart rate | `resting_heart_rate*.json` | Daily `value.value`, in bpm |
| Average heart rate | `heart_rate-*.json` | Daily arithmetic mean of recorded `value.bpm` samples |

Formats vary between exports. Unsupported filenames or schemas are not automatically converted. Missing metrics are shown as unavailable rather than estimated.

### How values are interpreted

- **Missing readings:** missing and non-positive values are excluded, including legacy zero placeholders for resting heart rate. Gaps are not interpolated.
- **Heart rate:** daily averages weight recorded samples equally, not time equally. Sampling density affects the result. Period summaries then weight available daily averages equally.
- **Resting heart rate:** only the dedicated daily source is charted. The resting-rate field attached to sleep scores is retained separately as `sleepRest` in generated data, but is not substituted into the chart.
- **Sleep scores:** newer Google `UserSleepScores` records take precedence over legacy records on the same date. Multiple newer records use the last encountered row; legacy-only duplicates keep the first accepted value. The dashboard shows one score per date, not individual sleep sessions.
- **Dates:** the source timestamp's written calendar date is used. UTC timestamps remain UTC dates, and unzoned legacy timestamps are not converted. Day boundaries can differ from the Fitbit app.
- **Smoothing:** trailing averages use available observations within the selected calendar-day window, including days before the visible range. There is no minimum coverage threshold. A day without an observation remains a gap.

Daylight is a personal history viewer, not a diagnostic tool. It does not interpret changes as medical findings.

## Privacy

The server listens only on `127.0.0.1`, for access from the same computer. It serves the dashboard page, JavaScript, stylesheet, and generated dataset, not arbitrary export files. It has no authentication and is intended for local use, not public hosting.

Original export files are read only. There is no telemetry, CDN dependency, external font, or remote data service.

**Keep exports, generated datasets, and screenshots containing real readings out of public repositories.** The generated `dashboard/data.json` and temporary import file are ignored by Git. The root ignore rule covers `Google Health/`, but not every possible export folder name or archive. Prefer storing exports outside the checkout and review staged files before publishing. Ignore rules do not remove previously committed files from Git history.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `node` is not recognized | Install Node.js 20 or newer, reopen the terminal, and check `node --version`. |
| No supported health records found | Extract the archive and point the importer at a folder containing supported files. |
| Dashboard asks you to import | Complete an import before starting or refreshing the dashboard. |
| A chart has no observations | Try all history and check the dates under “About the data.” Your export may not contain that metric. |
| New data does not appear | Run the import command again, then refresh the browser. |
| Port 4173 is already in use | Stop the previous server or select another port. |

To use another port in PowerShell:

```powershell
$env:PORT = "4174"
node dashboard/server.mjs
```

Or in macOS/Linux shells:

```sh
PORT=4174 node dashboard/server.mjs
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

## Development and validation

```text
dashboard/
  import.mjs    CSV/JSON discovery and daily aggregation
  server.mjs    Local HTTP server with an explicit asset allowlist
  index.html    Dashboard structure
  app.js        Date controls, charts, and interaction
  style.css     Responsive styling
  test.mjs      Parser and import checks
  data.json     Generated private dataset (ignored by Git)
```

From the project root, after importing your data:

```sh
node --test dashboard/test.mjs
node --check dashboard/app.js
node --check dashboard/server.mjs
```

The tests cover CSV parsing, source precedence, missing values, sample means, malformed files, and imported-data integrity. The real-data check requires a local `dashboard/data.json` and expects no parsing warnings; it will fail on a fresh clone before importing.

When reporting bugs or proposing another export format, provide the filename pattern and a small synthetic example with the same fields. Do not attach personal Takeout exports or real health records.
