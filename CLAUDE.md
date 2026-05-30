# FIELD WX · Weather Ops — Project Brief

## What this is

A paragliding-focused weather web app called **FIELD WX**. The frontend is a polished React app (Palantir/Arc'teryx dark ops aesthetic) already designed and sitting in `frontend/index.html`. It currently runs entirely on mock/generated data. The job is to build a real backend that feeds it live weather data and wire up the frontend to consume it.

## Stack

- **Frontend**: React (bundled single-file), Geist + Geist Mono fonts, dark/light theme, mobile-first
- **Backend**: Node.js + Express
- **Weather data**: Open-Meteo API (free, no API key, no cost)
- **No database needed** — cache responses in-memory or with a simple file cache

## Frontend screens & data they need

Nav order: `now → week → hourly → sites → sys`

| Screen | Data needed |
|--------|-------------|
| `HomeNow` | Current conditions, hourly strip (next 12h), flight conditions |
| `ScreenHourly` | Full 24h hourly breakdown |
| `ScreenWeek` | 7-day daily forecast |
| `ScreenSites` | Multiple saved locations |
| `ScreenSys` | Settings only, no weather data |

## Current mock data schema (must match)

The frontend uses these data shapes — the backend must return compatible JSON.

### Mood/conditions object `m`
```js
{
  temp: 14,           // °C integer
  feels: 12,          // feels-like °C
  wind: 18,           // km/h
  windDir: "NW",      // cardinal direction
  gust: 28,           // km/h
  humidity: 62,       // %
  pressure: 1018,     // hPa
  visibility: 45,     // km
  uv: 3,              // UV index 0-11
  cloudcover: 40,     // %
  precip: 0.0,        // mm/h
  ceiling: 2800,      // cloud base meters
  condition: "CLEAR", // CLEAR | OVERCAST | RAIN | SNOW | BLIZZARD | STORM | NIGHT
  code: "CLR",        // short METAR-style code
  label: "Clear",     // human label
  atmos: "clear",     // atmosphere animation type
}
```

### Hourly array (24 items)
```js
[{
  h: 0,           // hour 0-23
  temp: 12,
  wind: 15,
  windDir: "NW",
  gust: 22,
  precip: 0.0,
  precipProb: 5,  // % chance
  cloudcover: 30,
  condition: "CLEAR",
  code: "CLR",
}, ...]
```

### Flight conditions object (paragliding-specific)
```js
{
  flyable: true,          // overall go/no-go
  rating: "GOOD",         // EXCELLENT | GOOD | FAIR | POOR | DANGER
  thermalBase: 1800,      // thermal base altitude meters
  thermalTop: 3200,       // thermal ceiling meters
  thermalStrength: 2.5,   // m/s average climb rate
  boundaryLayer: 2400,    // convective boundary layer height meters
  windShear: false,       // dangerous wind shear present
  rotor: false,           // rotor turbulence risk
  cape: 320,              // CAPE J/kg
  liftedIndex: 2,         // lifted index (positive = stable)
  altitudeWinds: [        // wind at altitude layers
    { alt: 500,  speed: 12, dir: "NW" },
    { alt: 1000, speed: 15, dir: "NNW" },
    { alt: 1500, speed: 18, dir: "N" },
    { alt: 2000, speed: 22, dir: "N" },
    { alt: 2500, speed: 25, dir: "NNE" },
    { alt: 3000, speed: 28, dir: "NE" },
  ],
  window: {               // recommended flying window
    start: "10:00",
    end: "16:00",
    quality: "GOOD",
  }
}
```

### Weekly forecast (7 items)
```js
[{
  date: "2025-01-15",
  dayShort: "Wed",
  tempMax: 16,
  tempMin: 8,
  wind: 20,
  precip: 2.1,
  precipProb: 35,
  condition: "OVERCAST",
  code: "OVC",
  flyable: true,
}, ...]
```

## Open-Meteo API endpoints to use

### Current + hourly weather
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lon}
  &current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,surface_pressure,visibility,uv_index,cloud_cover,precipitation,weather_code
  &hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,cloud_cover,weather_code,cape,lifted_index,boundary_layer_height
  &daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum,precipitation_probability_max,weather_code,uv_index_max
  &wind_speed_unit=kmh
  &timezone=auto
  &forecast_days=7
```

### Altitude wind data (paragliding)
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lon}
  &hourly=wind_speed_850hPa,wind_direction_850hPa,wind_speed_700hPa,wind_direction_700hPa,wind_speed_600hPa,wind_direction_600hPa,wind_speed_500hPa,wind_direction_500hPa,wind_speed_250hPa,wind_direction_250hPa,geopotential_height_850hPa,geopotential_height_700hPa,cape,lifted_index,boundary_layer_height
  &wind_speed_unit=kmh
  &timezone=auto
```

Pressure levels → approx altitudes:
- 850hPa ≈ 1500m
- 700hPa ≈ 3000m
- 600hPa ≈ 4200m
- 500hPa ≈ 5500m

## WMO weather code → condition mapping
```js
const WMO_MAP = {
  0: "CLEAR", 1: "CLEAR", 2: "OVERCAST", 3: "OVERCAST",
  45: "OVERCAST", 48: "OVERCAST",
  51: "RAIN", 53: "RAIN", 55: "RAIN",
  61: "RAIN", 63: "RAIN", 65: "RAIN",
  71: "SNOW", 73: "SNOW", 75: "SNOW", 77: "SNOW",
  80: "RAIN", 81: "RAIN", 82: "RAIN",
  85: "SNOW", 86: "SNOW",
  95: "STORM", 96: "STORM", 99: "STORM",
}
```

## Flyability logic

Classify flight conditions:
- **EXCELLENT**: wind < 20 km/h, no precip, CAPE 100-800, LI > 0, no shear
- **GOOD**: wind < 30 km/h, precip < 0.5mm, CAPE < 1500, LI > -2
- **FAIR**: wind < 40 km/h, light precip ok, LI > -4
- **POOR**: wind 40-55 km/h OR heavy rain OR LI < -4
- **DANGER**: wind > 55 km/h OR thunderstorm (code 95+) OR CAPE > 2000

Wind shear: flag true if wind direction changes >45° between adjacent altitude layers.
Rotor: flag true if surface wind > 25 km/h AND terrain (flag for the user to set per site).

Thermal base estimate: `(surface_temp - dew_point) * 122 + elevation` meters.
Thermal strength (m/s): `sqrt(CAPE) * 0.08` capped at 5 m/s.

## Backend API routes to build

```
GET /api/weather?lat=&lon=&tz=          → { current, hourly, daily, flight }
GET /api/weather/now?lat=&lon=          → { current, flight } (fast refresh)
GET /api/weather/week?lat=&lon=         → { daily[] }
GET /api/weather/altitude?lat=&lon=     → { altitudeWinds[], thermals }
GET /api/sites                          → saved sites list
POST /api/sites                         → add a site
```

Default location: 45.4677°N, 7.8772°E (Aosta Valley, Italy — paragliding area)

## File structure

```
weatherapp/
├── frontend/
│   └── index.html          ← existing design, DO NOT MODIFY
├── backend/
│   ├── src/
│   │   ├── server.js       ← Express entry point, CORS, routes
│   │   ├── routes/
│   │   │   ├── weather.js  ← /api/weather endpoints
│   │   │   └── sites.js    ← /api/sites endpoints
│   │   └── services/
│   │       ├── openMeteo.js   ← Open-Meteo API fetcher
│   │       ├── transform.js   ← raw API → frontend schema
│   │       ├── paragliding.js ← flight condition calculations
│   │       └── cache.js       ← simple in-memory cache (5min TTL)
│   └── package.json
├── .claude/
│   └── agents/
│       ├── api-builder.md
│       ├── paragliding-data.md
│       └── frontend-integrator.md
└── CLAUDE.md               ← this file
```

## Key constraints

- All Open-Meteo data is free, no API key
- Cache responses for 5 minutes minimum to avoid hammering the API
- Wind speeds always in km/h
- Temperatures always in °C
- Keep CORS open (`*`) for local dev
- The frontend fetches from `http://localhost:3001/api/...`
