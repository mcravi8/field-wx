'use strict';

const express = require('express');
const router = express.Router();
const { fetchForecast, fetchAltitude, resolveUnits } = require('../services/openMeteo');
const { getCached } = require('../services/cache');

const DEFAULT_LAT = 45.4677;
const DEFAULT_LON = 7.8772;

/**
 * Lazy-load transform and paragliding services.
 * Returns null if they haven't been written yet (parallel agent).
 */
function services() {
  try {
    return {
      t: require('../services/transform'),
      p: require('../services/paragliding'),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Parse and validate lat/lon from query params; falls back to defaults.
 * Throws { status, message } on invalid input.
 */
function parseLatLon(query) {
  let lat = query.lat !== undefined ? Number(query.lat) : DEFAULT_LAT;
  let lon = query.lon !== undefined ? Number(query.lon) : DEFAULT_LON;

  if (!isFinite(lat) || !isFinite(lon)) {
    throw { status: 400, message: 'lat and lon must be finite numbers' };
  }
  if (lat < -90 || lat > 90) throw { status: 400, message: 'lat must be between -90 and 90' };
  if (lon < -180 || lon > 180) throw { status: 400, message: 'lon must be between -180 and 180' };
  return { lat, lon };
}

// ---------------------------------------------------------------------------
// Physics normalization
//
// Display values arrive from Open-Meteo already in the region's units (°F/mph/in
// for the US, °C/km/h/mm elsewhere) — we never convert them for display. But the
// flight engine's formulas are metric (thermal base in °C, rating thresholds in
// km/h), so we normalize ONLY the few scalars it consumes, internally.
// ---------------------------------------------------------------------------
const F2C = (f) => (f - 32) * 5 / 9;
const MPH2KMH = (m) => m * 1.60934;
const IN2MM = (i) => i * 25.4;

function metricCurrent(current, system) {
  if (system !== 'imperial') return current;
  return Object.assign({}, current, {
    temp: F2C(current.temp),
    dewpoint: current.dewpoint != null ? F2C(current.dewpoint) : current.dewpoint,
    wind: MPH2KMH(current.wind),
    precip: IN2MM(current.precip),
  });
}

function metricHourly(hourly, system) {
  if (system !== 'imperial') return hourly;
  return hourly.map((h) => Object.assign({}, h, { wind: MPH2KMH(h.wind), precip: IN2MM(h.precip) }));
}

/**
 * The windgram is always presented in km/h (per the FIELD WX windgram spec),
 * regardless of the region's display system. Open-Meteo returns mph for US
 * coordinates, so convert every cell's speed back to km/h there.
 */
function metricWindgram(wg, system) {
  if (system !== 'imperial' || !wg || !Array.isArray(wg.grid)) return wg;
  return Object.assign({}, wg, {
    grid: wg.grid.map((row) => row.map((c) => Object.assign({}, c, { speed: Math.max(0, Math.round(MPH2KMH(c.speed))) }))),
  });
}

const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : undefined);

// Optional ?units=metric|imperial settings override (anything else → region auto-detect).
const unitsParam = (q) => (q === 'metric' || q === 'imperial') ? q : undefined;

/**
 * Fetch + resolve units + transform. Units are decided from the coordinate
 * (US box) first; the timezone returned by Open-Meteo is a secondary check, and
 * on disagreement we re-fetch once in the corrected units (rare).
 *
 * @returns {{ current, hourly, daily, flight, altitudeWinds, units, system }}
 */
async function loadWeather(lat, lon, tz, svc, needAltitude, unitsOverride) {
  const { t, p } = svc;

  const u0 = resolveUnits(lat, lon, undefined, unitsOverride);
  let forecast, alt;
  if (needAltitude) {
    [forecast, alt] = await Promise.all([fetchForecast(lat, lon, tz, u0), fetchAltitude(lat, lon, tz, u0)]);
  } else {
    forecast = await fetchForecast(lat, lon, tz, u0);
  }

  // An explicit settings override is authoritative; otherwise use the returned
  // timezone as a secondary check and re-fetch only if it flips the system.
  let u = unitsOverride ? u0 : resolveUnits(lat, lon, forecast && forecast.timezone);
  if (u.system !== u0.system) {
    if (needAltitude) {
      [forecast, alt] = await Promise.all([fetchForecast(lat, lon, tz, u), fetchAltitude(lat, lon, tz, u)]);
    } else {
      forecast = await fetchForecast(lat, lon, tz, u);
    }
  }
  const system = u.system;

  const current = t.transformCurrent(forecast, system);
  const hourly = t.transformHourly(forecast, 24);
  const daily = t.transformDaily(forecast);
  const altitudeWinds = needAltitude ? t.transformAltitudeWinds(alt, 0) : [];
  const windgram = needAltitude ? t.transformWindgram(alt, forecast, 24) : null;

  // Flight physics in metric (display values left untouched).
  const mCur = metricCurrent(current, system);
  const mHourly = metricHourly(hourly, system);
  const fh = (forecast && forecast.hourly) || {};
  const ah = (alt && alt.hourly) || {};
  const ctx = {
    altitudeWinds,
    cape: first(fh.cape) ?? first(ah.cape) ?? 0,
    liftedIndex: first(fh.lifted_index) ?? first(ah.lifted_index) ?? 0,
    boundaryLayer: first(fh.boundary_layer_height) ?? first(ah.boundary_layer_height) ?? 0,
    elevation: (forecast && forecast.elevation) ?? 0,
    hourly: mHourly,
  };
  const flight = p.assessFlight(mCur, mHourly, ctx);

  return { current, hourly, daily, flight, altitudeWinds, windgram: metricWindgram(windgram, system), units: u.units, system };
}

function fail(res, e) {
  if (e && e.status) return res.status(e.status).json({ error: e.message });
  return res.status(502).json({ error: e.message });
}

// GET /api/weather — current + hourly(24) + daily(7) + flight + units
router.get('/', async (req, res) => {
  let lat, lon;
  try { ({ lat, lon } = parseLatLon(req.query)); } catch (e) { return fail(res, e); }
  const svc = services();
  if (!svc) return res.status(503).json({ error: 'weather services initializing' });

  const tz = req.query.tz || 'auto';
  try {
    const out = await getCached(`weather:${lat}:${lon}:${tz}:${unitsParam(req.query.units) || 'auto'}`, async () => {
      const w = await loadWeather(lat, lon, tz, svc, true, unitsParam(req.query.units));
      return { current: w.current, hourly: w.hourly, daily: w.daily, flight: w.flight, units: w.units };
    });
    res.json(out);
  } catch (e) { fail(res, e); }
});

// GET /api/weather/now — current + flight + units (fast)
router.get('/now', async (req, res) => {
  let lat, lon;
  try { ({ lat, lon } = parseLatLon(req.query)); } catch (e) { return fail(res, e); }
  const svc = services();
  if (!svc) return res.status(503).json({ error: 'weather services initializing' });

  const tz = req.query.tz || 'auto';
  try {
    const out = await getCached(`weather:now:${lat}:${lon}:${tz}:${unitsParam(req.query.units) || 'auto'}`, async () => {
      const w = await loadWeather(lat, lon, tz, svc, true, unitsParam(req.query.units));
      return { current: w.current, flight: w.flight, units: w.units };
    });
    res.json(out);
  } catch (e) { fail(res, e); }
});

// GET /api/weather/week — daily(7) + units
router.get('/week', async (req, res) => {
  let lat, lon;
  try { ({ lat, lon } = parseLatLon(req.query)); } catch (e) { return fail(res, e); }
  const svc = services();
  if (!svc) return res.status(503).json({ error: 'weather services initializing' });

  const tz = req.query.tz || 'auto';
  try {
    const out = await getCached(`weather:week:${lat}:${lon}:${tz}:${unitsParam(req.query.units) || 'auto'}`, async () => {
      const w = await loadWeather(lat, lon, tz, svc, false, unitsParam(req.query.units));
      return { daily: w.daily, units: w.units };
    });
    res.json(out);
  } catch (e) { fail(res, e); }
});

// GET /api/weather/altitude — altitude winds + thermals + units
router.get('/altitude', async (req, res) => {
  let lat, lon;
  try { ({ lat, lon } = parseLatLon(req.query)); } catch (e) { return fail(res, e); }
  const svc = services();
  if (!svc) return res.status(503).json({ error: 'weather services initializing' });

  const tz = req.query.tz || 'auto';
  try {
    const out = await getCached(`weather:altitude:${lat}:${lon}:${tz}:${unitsParam(req.query.units) || 'auto'}`, async () => {
      const w = await loadWeather(lat, lon, tz, svc, true, unitsParam(req.query.units));
      const f = w.flight;
      return {
        altitudeWinds: w.altitudeWinds,
        windgram: w.windgram,
        thermals: {
          thermalBase: f.thermalBase,
          thermalTop: f.thermalTop,
          thermalStrength: f.thermalStrength,
          boundaryLayer: f.boundaryLayer,
        },
        units: w.units,
      };
    });
    res.json(out);
  } catch (e) { fail(res, e); }
});

module.exports = router;
