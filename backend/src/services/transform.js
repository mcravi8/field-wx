'use strict';

/**
 * transform.js — Raw Open-Meteo API response → FIELD WX frontend schema
 *
 * All temperatures in °C, wind speeds in km/h, pressures in hPa.
 * Open-Meteo is called with wind_speed_unit=kmh so no unit conversion needed.
 */

// ---------------------------------------------------------------------------
// WMO weather code mappings
// ---------------------------------------------------------------------------

/** WMO code → frontend condition string */
const WMO_MAP = {
  0:  'CLEAR',    1:  'CLEAR',    2:  'OVERCAST', 3:  'OVERCAST',
  45: 'OVERCAST', 48: 'OVERCAST',
  51: 'RAIN',     53: 'RAIN',     55: 'RAIN',
  61: 'RAIN',     63: 'RAIN',     65: 'RAIN',
  71: 'SNOW',     73: 'SNOW',     75: 'SNOW',     77: 'SNOW',
  80: 'RAIN',     81: 'RAIN',     82: 'RAIN',
  85: 'SNOW',     86: 'SNOW',
  95: 'STORM',    96: 'STORM',    99: 'STORM',
};

/** WMO code → short METAR-style code rendered literally by the frontend */
const WMO_CODE_MAP = {
  0:  'CLR',
  1:  'FEW',
  2:  'SCT',
  3:  'OVC',
  45: 'OVC',  48: 'OVC',
  51: '-RA',  53: '-RA',
  55: 'RA',   61: 'RA',
  63: 'RA',   65: '+RA',
  71: '-SN',  73: '-SN',
  75: '+SN',  77: 'SN',
  80: 'RA',   81: 'RA',
  82: '+RA',
  85: '-SN',  86: '+SN',
  95: 'TSRA', 96: 'TSRA', 99: 'TSRA',
};

/** WMO code → human-readable label */
const WMO_LABEL_MAP = {
  0:  'Clear',
  1:  'Mainly clear',
  2:  'Partly cloudy',
  3:  'Overcast',
  45: 'Fog',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ hail',
  99: 'Thunderstorm w/ hail',
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Convert a WMO weather code to a frontend condition string.
 * Returns 'CLEAR' as a safe default for unknown codes.
 */
function wmoToCondition(code) {
  if (code == null) return 'CLEAR';
  return WMO_MAP[code] || 'CLEAR';
}

/**
 * Convert a WMO weather code to the short METAR-style display code.
 * The frontend renders these strings literally — do not deviate from the vocabulary.
 */
function wmoToCode(code) {
  if (code == null) return 'CLR';
  return WMO_CODE_MAP[code] || 'CLR';
}

/**
 * Convert a WMO weather code to a human-readable label.
 */
function wmoToLabel(code) {
  if (code == null) return 'Clear';
  return WMO_LABEL_MAP[code] || 'Clear';
}

// ---------------------------------------------------------------------------
// Compass conversion
// ---------------------------------------------------------------------------

const CARDINALS_16 = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
];

/**
 * Convert a wind direction in degrees (0–360) to a 16-point compass cardinal.
 * Each sector spans 22.5°. 0°/360° = N.
 */
function degreesToCardinal(deg) {
  if (deg == null || isNaN(deg)) return 'N';
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return CARDINALS_16[index];
}

// ---------------------------------------------------------------------------
// atmos string derivation
// ---------------------------------------------------------------------------

/**
 * Derive the atmosphere animation key from condition + isDay.
 * Possible values: clear-day, clear-night, overcast, rain, snow, blizzard, storm
 */
function conditionToAtmos(condition, wmoCode, isDay) {
  const shortCode = wmoToCode(wmoCode);
  if (condition === 'STORM') return 'storm';
  if (condition === 'SNOW') {
    // Heavy snow / blowing snow → blizzard
    if (shortCode === '+SN' || shortCode === 'BLSN') return 'blizzard';
    return 'snow';
  }
  if (condition === 'RAIN') return 'rain';
  if (condition === 'OVERCAST') return 'overcast';
  // CLEAR
  return isDay ? 'clear-day' : 'clear-night';
}

// ---------------------------------------------------------------------------
// Safe accessor helpers
// ---------------------------------------------------------------------------

function safeNum(val, fallback = 0) {
  const n = Number(val);
  return isFinite(n) ? n : fallback;
}

function safeInt(val, fallback = 0) {
  return Math.round(safeNum(val, fallback));
}

function safeArr(obj, key) {
  return (obj && Array.isArray(obj[key])) ? obj[key] : [];
}

// ---------------------------------------------------------------------------
// Current conditions transform
// ---------------------------------------------------------------------------

/**
 * Transform a raw Open-Meteo forecast response into the FIELD WX current
 * conditions object.  Returns all CLAUDE.md `m` fields plus extras:
 *   windDirDeg, isDay, dewpoint, weatherCode.
 *
 * Visibility: Open-Meteo returns metres → we divide by 1000 for km (1 dp).
 * Ceiling: estimated from boundary_layer_height in hourly[0] when available;
 *          falls back to null.
 */
function transformCurrent(raw, system = 'metric') {
  const c = (raw && raw.current) || {};
  const h = (raw && raw.hourly)  || {};

  const wmoCode   = safeInt(c.weather_code,  0);
  const condition = wmoToCondition(wmoCode);
  const isDay     = c.is_day != null ? (c.is_day ? 1 : 0) : 1;

  // Dew point: prefer direct field, fall back to approximation from humidity
  let dewpoint;
  if (c.dew_point_2m != null && isFinite(Number(c.dew_point_2m))) {
    dewpoint = Math.round(Number(c.dew_point_2m) * 10) / 10;
  } else {
    const t  = safeNum(c.temperature_2m, 15);
    const rh = safeNum(c.relative_humidity_2m, 50);
    dewpoint = Math.round((t - ((100 - rh) / 5)) * 10) / 10;
  }

  // Ceiling: boundary_layer_height at the CURRENT hour. timezone=auto starts the
  // hourly arrays at local midnight, so index 0 would pin the ceiling to midnight.
  let ceiling = null;
  const blhArr = safeArr(h, 'boundary_layer_height');
  const ci = findCurrentHourIndex(raw);
  if (blhArr.length > ci && blhArr[ci] != null) {
    ceiling = Math.round(safeNum(blhArr[ci], 0));
  }

  // Visibility: Open-Meteo always reports metres (no visibility_unit param),
  // so this single derived field is converted to the display unit:
  //   metric → km, imperial → miles. One decimal place.
  const visMeters = c.visibility != null ? safeNum(c.visibility, 0) : null;
  const visibility = visMeters == null
    ? null
    : (system === 'imperial'
        ? Math.round((visMeters / 1609.34) * 10) / 10
        : Math.round((visMeters / 1000) * 10) / 10);

  const windDirDeg = safeInt(c.wind_direction_10m, 0);

  return {
    temp:        safeInt(c.temperature_2m,        15),
    feels:       safeInt(c.apparent_temperature,  15),
    wind:        safeInt(c.wind_speed_10m,         0),
    windDir:     degreesToCardinal(windDirDeg),
    windDirDeg,
    gust:        safeInt(c.wind_gusts_10m,         0),
    humidity:    safeInt(c.relative_humidity_2m,  50),
    pressure:    safeInt(c.surface_pressure,    1013),
    visibility,
    uv:          safeInt(c.uv_index,               0),
    cloudcover:  safeInt(c.cloud_cover,            0),
    precip:      safeNum(c.precipitation,         0.0),
    ceiling,
    condition,
    code:        wmoToCode(wmoCode),
    label:       wmoToLabel(wmoCode),
    atmos:       conditionToAtmos(condition, wmoCode, isDay),
    isDay,
    dewpoint,
    weatherCode: wmoCode,
  };
}

// ---------------------------------------------------------------------------
// Hourly transform
// ---------------------------------------------------------------------------

/**
 * Parse an ISO-8601 datetime string from Open-Meteo ("2025-01-15T14:00") and
 * return the hour component as an integer (0–23).
 */
function parseHour(timeStr) {
  if (!timeStr) return 0;
  // Format is "YYYY-MM-DDTHH:00"
  const parts = String(timeStr).split('T');
  if (parts.length < 2) return 0;
  return parseInt(parts[1].slice(0, 2), 10) || 0;
}

/**
 * Find the index in raw.hourly.time that corresponds to the current hour.
 * Open-Meteo provides a "current.time" string in the same format; we match
 * on the same hour value.  Falls back to index 0 if not found.
 */
function findCurrentHourIndex(raw) {
  const times = safeArr((raw && raw.hourly), 'time');
  const currentTime = raw && raw.current && raw.current.time;
  if (!currentTime || times.length === 0) return 0;

  // Match on exact time string first (most reliable)
  const exactIdx = times.indexOf(currentTime);
  if (exactIdx !== -1) return exactIdx;

  // Fall back: match on YYYY-MM-DDTHH prefix (ignore minutes)
  const prefix = String(currentTime).slice(0, 13); // "2025-01-15T14"
  const prefixIdx = times.findIndex(t => String(t).startsWith(prefix));
  return prefixIdx !== -1 ? prefixIdx : 0;
}

/**
 * Transform raw Open-Meteo hourly data into an array of hourly forecast items.
 * Starts at the current local hour and returns `count` consecutive items.
 *
 * Each item includes the original weatherCode so the frontend can use it for
 * additional logic, and isDay to allow proper icon selection.
 */
function transformHourly(raw, count = 24) {
  const h = (raw && raw.hourly) || {};

  const times      = safeArr(h, 'time');
  const temps      = safeArr(h, 'temperature_2m');
  const winds      = safeArr(h, 'wind_speed_10m');
  const windDirs   = safeArr(h, 'wind_direction_10m');
  const gusts      = safeArr(h, 'wind_gusts_10m');
  const precips    = safeArr(h, 'precipitation');
  const precipProbs= safeArr(h, 'precipitation_probability');
  const clouds     = safeArr(h, 'cloud_cover');
  const codes      = safeArr(h, 'weather_code');
  const isDayArr   = safeArr(h, 'is_day');

  const startIdx = findCurrentHourIndex(raw);
  const result = [];

  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    if (idx >= times.length) break;

    const wmoCode   = safeInt(codes[idx],    0);
    const condition = wmoToCondition(wmoCode);
    const isDay     = isDayArr[idx] != null ? (isDayArr[idx] ? 1 : 0) : 1;
    const windDirDeg = safeInt(windDirs[idx], 0);

    result.push({
      h:           parseHour(times[idx]),
      temp:        safeInt(temps[idx],       15),
      wind:        safeInt(winds[idx],        0),
      windDir:     degreesToCardinal(windDirDeg),
      windDirDeg,
      gust:        safeInt(gusts[idx],        0),
      precip:      safeNum(precips[idx],     0.0),
      precipProb:  safeInt(precipProbs[idx],  0),
      cloudcover:  safeInt(clouds[idx],       0),
      condition,
      code:        wmoToCode(wmoCode),
      weatherCode: wmoCode,
      isDay,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Daily transform
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Transform raw Open-Meteo daily data into 7 daily forecast items.
 *
 * flyable heuristic: wind < 40 km/h AND total precip < 10 mm AND no thunderstorm.
 * This is a coarse overview flag — detailed flyability uses assessFlight().
 */
function transformDaily(raw) {
  const d = (raw && raw.daily) || {};

  const dates     = safeArr(d, 'time');
  const tempMaxes = safeArr(d, 'temperature_2m_max');
  const tempMins  = safeArr(d, 'temperature_2m_min');
  const winds     = safeArr(d, 'wind_speed_10m_max');
  const precips   = safeArr(d, 'precipitation_sum');
  const precipProbs = safeArr(d, 'precipitation_probability_max');
  const codes     = safeArr(d, 'weather_code');

  const len = Math.min(dates.length, 7);
  const result = [];

  for (let i = 0; i < len; i++) {
    const dateStr  = dates[i] || '';
    const wmoCode  = safeInt(codes[i], 0);
    const windKmh  = safeInt(winds[i], 0);
    const precipMm = safeNum(precips[i], 0);
    const condition = wmoToCondition(wmoCode);

    // Parse YYYY-MM-DD to get day-of-week
    let dayShort = '---';
    if (dateStr) {
      const dt = new Date(dateStr + 'T12:00:00Z'); // noon UTC avoids DST edge cases
      dayShort = DAY_NAMES[dt.getUTCDay()] || '---';
    }

    const flyable = windKmh < 40 && precipMm < 10 && wmoCode < 95;

    result.push({
      date:       dateStr,
      dayShort,
      tempMax:    safeInt(tempMaxes[i],  15),
      tempMin:    safeInt(tempMins[i],    5),
      wind:       windKmh,
      precip:     Math.round(precipMm * 10) / 10,
      precipProb: safeInt(precipProbs[i], 0),
      condition,
      code:       wmoToCode(wmoCode),
      flyable,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Altitude winds transform
// ---------------------------------------------------------------------------

/**
 * Linear interpolation between two values.
 * t=0 → a, t=1 → b.
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Circular linear interpolation for wind direction (handles 350°↔10° wrap).
 */
function lerpDirection(a, b, t) {
  let diff = ((b - a + 540) % 360) - 180; // shortest angular path
  return ((a + diff * t) + 360) % 360;
}

/**
 * Transform altitude wind data from the Open-Meteo pressure-level endpoint
 * into the six altitude layers expected by the frontend flight object.
 *
 * Altitude layers output: [500, 1000, 1500, 2000, 2500, 3000] metres.
 *
 * Pressure level anchors (approximate ISA):
 *   850 hPa ≈ 1500 m
 *   700 hPa ≈ 3000 m
 *
 * Intermediate layers are linearly interpolated.  Layers below 850 hPa
 * (500 m, 1000 m) use the 850 hPa values scaled slightly downward:
 *   - 500 m  ≈ 85% of 850hPa speed (boundary layer shielding)
 *   - 1000 m ≈ 92% of 850hPa speed
 * Direction is held constant from the nearest available measurement.
 *
 * @param {object} alt     - Raw altitude API response
 * @param {number} hourIndex - Which hourly slot to read (default 0 = current hour)
 * @returns {Array<{alt, speed, dir, dirDeg}>}
 */
function transformAltitudeWinds(alt, hourIndex = 0) {
  const h = (alt && alt.hourly) || {};
  const idx = Math.max(0, hourIndex);

  // Safe readers for a specific pressure level
  function spd(level) {
    const arr = safeArr(h, `wind_speed_${level}hPa`);
    return safeNum(arr[idx], 0);
  }
  function dir(level) {
    const arr = safeArr(h, `wind_direction_${level}hPa`);
    return safeNum(arr[idx], 0);
  }

  const spd850 = spd(850); const dir850 = dir(850);
  const spd700 = spd(700); const dir700 = dir(700);

  // Layers below 850 hPa: approximate from 850 hPa with a reduction factor.
  // Real sub-850 values often unavailable; this gives a plausible gradient.
  const spd500m  = spd850 * 0.85;
  const spd1000m = spd850 * 0.92;
  const dir500m  = dir850;   // direction assumed same as 850 hPa in lower boundary layer
  const dir1000m = dir850;

  // Intermediate layers between 850 hPa (1500 m) and 700 hPa (3000 m):
  // 2000 m is 1/3 of the way from 1500 m to 3000 m
  // 2500 m is 2/3 of the way
  const spd2000m = lerp(spd850, spd700, 1 / 3);
  const dir2000m = lerpDirection(dir850, dir700, 1 / 3);
  const spd2500m = lerp(spd850, spd700, 2 / 3);
  const dir2500m = lerpDirection(dir850, dir700, 2 / 3);

  const layers = [
    { alt: 500,  speedRaw: spd500m,  dirRaw: dir500m  },
    { alt: 1000, speedRaw: spd1000m, dirRaw: dir1000m },
    { alt: 1500, speedRaw: spd850,   dirRaw: dir850   },
    { alt: 2000, speedRaw: spd2000m, dirRaw: dir2000m },
    { alt: 2500, speedRaw: spd2500m, dirRaw: dir2500m },
    { alt: 3000, speedRaw: spd700,   dirRaw: dir700   },
  ];

  return layers.map(l => ({
    alt:    l.alt,
    speed:  Math.round(l.speedRaw),
    dir:    degreesToCardinal(l.dirRaw),
    dirDeg: Math.round(((l.dirRaw % 360) + 360) % 360),
  }));
}

// ---------------------------------------------------------------------------
// Windgram grid (altitude × hour)
// ---------------------------------------------------------------------------

/**
 * Build a full windgram grid: wind speed + direction at fixed altitude bands
 * across every hour of the (local) forecast day.
 *
 * Y axis (levels, metres ASL): 0 (surface), 500, 1000, 1500, 2000, 2500,
 *                              3000, 3500, 4000
 * X axis (hours): the first `hours` slots of the forecast, i.e. today 00:00→23:00
 *                 when timezone=auto (Open-Meteo starts the hourly series at
 *                 local midnight).
 *
 * Data sources:
 *   - Surface (0 m): wind_speed_10m / wind_direction_10m from the FORECAST
 *     response (`raw`), which carries true 10 m winds.
 *   - Aloft: pressure-level winds from the ALTITUDE response (`alt`):
 *       850 hPa ≈ 1500 m, 700 hPa ≈ 3000 m, 600 hPa ≈ 4200 m
 *     Intermediate bands are linearly interpolated (direction via shortest-arc).
 *     Sub-850 hPa bands (500 m, 1000 m) scale the 850 hPa speed down to model
 *     boundary-layer shielding, holding direction constant.
 *
 * Both responses are requested with timezone=auto and the same default
 * forecast window, so hourly index `i` refers to the same wall-clock hour in
 * each — the arrays are aligned by index.
 *
 * Every cell is guarded; missing pressure levels fall back to the nearest
 * available level (and ultimately to the surface wind).
 *
 * @param {object} alt   - Raw altitude (pressure-level) API response
 * @param {object} raw   - Raw forecast API response (for surface winds + clock)
 * @param {number} hours - Number of hourly columns to emit (default 24)
 * @returns {{
 *   levels: number[],
 *   hours: number[],
 *   current: number,
 *   grid: Array<Array<{speed:number, dir:string, dirDeg:number}>>
 * }}  grid is indexed [levelIndex][hourIndex]; levels are surface→top.
 */
function transformWindgram(alt, raw, hours = 24) {
  const ah = (alt && alt.hourly) || {};
  const rh = (raw && raw.hourly) || {};

  const times  = safeArr(rh, 'time');
  const count  = Math.min(hours, times.length || hours);

  const sfcSpd = safeArr(rh, 'wind_speed_10m');
  const sfcDir = safeArr(rh, 'wind_direction_10m');

  // Pressure-level reader: NaN when the series is absent at this hour.
  function lv(level, kind, idx) {
    const arr = safeArr(ah, `wind_${kind}_${level}hPa`);
    const n = Number(arr[idx]);
    return isFinite(n) ? n : NaN;
  }

  const LEVELS = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];

  const grid = LEVELS.map(() => []);
  const hourLabels = [];
  const currentHour = findCurrentHourIndex(raw);

  for (let i = 0; i < count; i++) {
    hourLabels.push(parseHour(times[i]));

    const sfcS = safeNum(sfcSpd[i], 0);
    const sfcD = safeNum(sfcDir[i], 0);

    // Pressure-level anchors with graceful fallback chains.
    let s850 = lv(850, 'speed', i), d850 = lv(850, 'direction', i);
    let s700 = lv(700, 'speed', i), d700 = lv(700, 'direction', i);
    let s600 = lv(600, 'speed', i), d600 = lv(600, 'direction', i);

    if (!isFinite(s850)) s850 = sfcS;
    if (!isFinite(d850)) d850 = sfcD;
    if (!isFinite(s700)) s700 = s850;
    if (!isFinite(d700)) d700 = d850;
    if (!isFinite(s600)) s600 = s700;
    if (!isFinite(d600)) d600 = d700;

    // 3500 m / 4000 m sit between 700 hPa (≈3000 m) and 600 hPa (≈4200 m):
    //   (3500-3000)/(4200-3000) = 0.4167 ; (4000-3000)/1200 = 0.8333
    const cells = {
      0:    { spd: sfcS,                      drw: sfcD },
      500:  { spd: s850 * 0.85,               drw: d850 },
      1000: { spd: s850 * 0.92,               drw: d850 },
      1500: { spd: s850,                      drw: d850 },
      2000: { spd: lerp(s850, s700, 1 / 3),   drw: lerpDirection(d850, d700, 1 / 3) },
      2500: { spd: lerp(s850, s700, 2 / 3),   drw: lerpDirection(d850, d700, 2 / 3) },
      3000: { spd: s700,                      drw: d700 },
      3500: { spd: lerp(s700, s600, 0.4167),  drw: lerpDirection(d700, d600, 0.4167) },
      4000: { spd: lerp(s700, s600, 0.8333),  drw: lerpDirection(d700, d600, 0.8333) },
    };

    LEVELS.forEach((lvl, li) => {
      const c = cells[lvl];
      const dirDeg = Math.round(((c.drw % 360) + 360) % 360);
      grid[li].push({
        speed:  Math.max(0, Math.round(c.spd)),
        dir:    degreesToCardinal(dirDeg),
        dirDeg,
      });
    });
  }

  return {
    levels:  LEVELS,
    hours:   hourLabels,
    current: Math.max(0, Math.min(currentHour, count - 1)),
    grid,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  wmoToCondition,
  wmoToCode,
  wmoToLabel,
  degreesToCardinal,
  conditionToAtmos,
  transformCurrent,
  transformHourly,
  transformDaily,
  transformAltitudeWinds,
  transformWindgram,
  findCurrentHourIndex,
};
