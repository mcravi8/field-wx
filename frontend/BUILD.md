# FIELD WX frontend — build

`index.html` is a **self-contained, self-extracting bundle** (no server, no CDN). It
carries everything inline: a gzipped+base64 asset manifest (React, ReactDOM,
Babel-standalone, fonts, and the vendored component modules) plus the page chrome,
all inside custom `<script type="__bundler/...">` blocks.

The part you actually edit — the application entry script (data layer, shared
components, Sites screen, the `App` component) — used to live buried inside a
JSON-encoded, escaped string in that bundle. It now lives as plain JSX in `src/`.

## Edit → build

```bash
# edit the source
$EDITOR src/03-sites.jsx

# recompile into index.html
npm run build        # or: node build.mjs
```

Then open `index.html` (or serve it: `python3 -m http.server` and visit it).

## Source layout (`src/`)

Files are concatenated in **lexical order** into one `<script type="text/babel">`,
so ordering matters — keep the numeric prefixes. They share one scope (the React
hooks are destructured at the top of `01`, and globals like `MOODS`, `I18N`,
`genHourly` come from the vendored modules).

| File | Contents |
|------|----------|
| `01-runtime-data.jsx` | `React` hook destructure, `WeatherAPI` Open-Meteo client, WMO maps, raw→view adapters, `useWeatherData` hook |
| `02-components.jsx` | Tweak system, `ScenarioBar`, `Atmosphere`, `WxTabBar`, shared UI |
| `03-sites.jsx` | `TopBar` override + interactive `ScreenSites` (localStorage sites, geocode add, swipe/long-press delete, drag reorder) |
| `04-app.jsx` | `App` component (state, screen routing, live-data wiring) + `ReactDOM.createRoot(...).render(<App/>)` |

## What the build does

`build.mjs` (zero dependencies):

1. Concatenates `src/*.jsx` (sorted) into the inline entry script.
2. Locates the `__bundler/template` line in `index.html`, JSON-decodes it, and
   replaces the single inline `<script type="text/babel">` with the new source.
3. Re-encodes (JSON), protecting `</script` → `<\/script` so the outer bundler
   `<script>` tag is not closed early.
4. **Verifies before writing**: JSON round-trips, the block is present, and — using
   the Babel-standalone already inside the bundle — the source transpiles with no
   syntax error. A syntax error fails the build.
5. Writes `index.html` and asserts that **only** the template line changed.

## What is NOT rebuilt

The gzipped asset manifest (React/ReactDOM/Babel/fonts and the vendored component
modules such as `HomeNow`, `ScreenWeek`, `ScreenHourly`, `MOODS`, `I18N`, …) is
preserved as-is. The inline entry script runs last, so it overrides any of those at
runtime when needed (that is how `TopBar` and `ScreenSites` are replaced). To change
a vendored module, override it from `src/` instead of editing the manifest.
