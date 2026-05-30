'use strict';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

// ---------------------------------------------------------------------------
// Region → unit-system resolution
// ---------------------------------------------------------------------------

/** Continental-US bounding box (primary check). */
function inUsBox(lat, lon) {
  return lon >= -125 && lon <= -66 && lat >= 24 && lat <= 50;
}

/**
 * US IANA timezones (secondary check). We use an explicit US allowlist rather
 * than "any America/* except a few" — the latter would wrongly flag Canada,
 * Mexico, and South America (all metric) as imperial.
 */
const US_TIMEZONES = new Set([
  'America/New_York', 'America/Detroit', 'America/Kentucky/Louisville',
  'America/Kentucky/Monticello', 'America/Indiana/Indianapolis',
  'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Indiana/Marengo',
  'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Chicago',
  'America/Indiana/Tell_City', 'America/Indiana/Knox', 'America/Menominee',
  'America/North_Dakota/Center', 'America/North_Dakota/New_Salem',
  'America/North_Dakota/Beulah', 'America/Denver', 'America/Boise',
  'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'America/Juneau',
  'America/Sitka', 'America/Metlakatla', 'America/Yakutat', 'America/Nome',
  'America/Adak', 'Pacific/Honolulu',
]);

function isUsTimezone(tz) {
  return typeof tz === 'string' && US_TIMEZONES.has(tz);
}

const METRIC = {
  system: 'metric',
  temperature_unit: 'celsius',
  wind_speed_unit: 'kmh',
  precipitation_unit: 'mm',
  units: { temp: '°C', wind: 'km/h', precip: 'mm', pressure: 'hPa', visibility: 'km', system: 'metric' },
};
const IMPERIAL = {
  system: 'imperial',
  temperature_unit: 'fahrenheit',
  wind_speed_unit: 'mph',
  precipitation_unit: 'inch',
  units: { temp: '°F', wind: 'mph', precip: 'in', pressure: 'hPa', visibility: 'mi', system: 'imperial' },
};

/**
 * Decide the unit system for a location.
 * Imperial iff the coordinate is in the continental-US box OR the (optional)
 * timezone is a US zone. Everything else is metric.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} [tz] - IANA timezone from a prior Open-Meteo response (secondary check)
 * @returns {{system, temperature_unit, wind_speed_unit, precipitation_unit, units}}
 */
function resolveUnits(lat, lon, tz) {
  const imperial = inUsBox(Number(lat), Number(lon)) || isUsTimezone(tz);
  return imperial ? IMPERIAL : METRIC;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

function unitParams(u) {
  const r = u || METRIC;
  return {
    temperature_unit: r.temperature_unit,
    wind_speed_unit: r.wind_speed_unit,
    precipitation_unit: r.precipitation_unit,
  };
}

async function getJson(url, label) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Open-Meteo network error (${label}): ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Open-Meteo ${label} returned ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Fetch current + hourly + daily forecast from Open-Meteo, in the units of `u`.
 * Open-Meteo returns the data pre-converted (no post-fetch conversion needed).
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} tz
 * @param {object} u - unit descriptor from resolveUnits() (defaults to metric)
 */
async function fetchForecast(lat, lon, tz = 'auto', u = METRIC) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      'temperature_2m', 'apparent_temperature', 'wind_speed_10m', 'wind_direction_10m',
      'wind_gusts_10m', 'relative_humidity_2m', 'surface_pressure', 'visibility',
      'uv_index', 'cloud_cover', 'precipitation', 'weather_code', 'is_day', 'dew_point_2m',
    ].join(','),
    hourly: [
      'temperature_2m', 'apparent_temperature', 'wind_speed_10m', 'wind_direction_10m',
      'wind_gusts_10m', 'precipitation', 'precipitation_probability', 'cloud_cover',
      'weather_code', 'cape', 'lifted_index', 'boundary_layer_height', 'is_day', 'dew_point_2m',
    ].join(','),
    daily: [
      'temperature_2m_max', 'temperature_2m_min', 'wind_speed_10m_max', 'wind_gusts_10m_max',
      'precipitation_sum', 'precipitation_probability_max', 'weather_code', 'uv_index_max',
    ].join(','),
    ...unitParams(u),
    timezone: tz,
    forecast_days: '7',
  });
  return getJson(`${BASE_URL}?${params.toString()}`, 'forecast');
}

/**
 * Fetch pressure-level altitude wind data from Open-Meteo, in the units of `u`.
 * Wind speeds follow u.wind_speed_unit so altitude winds display natively.
 * CAPE (J/kg), lifted index, geopotential height and boundary layer (m) are
 * unit-system-independent.
 */
async function fetchAltitude(lat, lon, tz = 'auto', u = METRIC) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: [
      'wind_speed_850hPa', 'wind_direction_850hPa', 'wind_speed_700hPa', 'wind_direction_700hPa',
      'wind_speed_600hPa', 'wind_direction_600hPa', 'wind_speed_500hPa', 'wind_direction_500hPa',
      'wind_speed_250hPa', 'wind_direction_250hPa', 'geopotential_height_850hPa',
      'geopotential_height_700hPa', 'cape', 'lifted_index', 'boundary_layer_height',
    ].join(','),
    wind_speed_unit: (u || METRIC).wind_speed_unit,
    timezone: tz,
  });
  return getJson(`${BASE_URL}?${params.toString()}`, 'altitude');
}

module.exports = { fetchForecast, fetchAltitude, resolveUnits, METRIC, IMPERIAL };
