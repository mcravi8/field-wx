'use strict';

/**
 * paragliding.js — Flight condition analysis for FIELD WX
 *
 * All formulas are derived from standard paragliding meteorology:
 *   - Thermal base: lifted condensation level via surface temperature / dew point spread
 *   - Thermal strength: proportional to the square root of CAPE (convective available
 *     potential energy), which itself is proportional to buoyancy energy
 *   - Wind shear: circular angular difference between adjacent altitude layers
 *   - Flyability rating: empirical thresholds used in paragliding safety assessment
 *
 * Pure functions — no network calls, no global state, no side effects.
 * Every array access is guarded; missing data returns safe defaults.
 */

const { degreesToCardinal } = require('./transform');

// ---------------------------------------------------------------------------
// Thermal calculations
// ---------------------------------------------------------------------------

/**
 * Estimate the thermal base (lifted condensation level) in metres.
 *
 * Formula: (T_surface - T_dew) * 122 + elevation
 *
 * Meteorological basis: the temperature lapse rate in a rising parcel is
 * ~1°C per 100m (dry adiabatic lapse rate, DALR).  The dew point rises at
 * ~0.2°C per 100m as the parcel expands.  The parcel reaches its dew point
 * (cloud base) after ascending approximately 122 m per °C of
 * temperature–dew-point spread.
 *
 * @param {number} surfaceTempC - Surface temperature in °C
 * @param {number} dewPointC    - Dew point temperature in °C
 * @param {number} elevationM   - Site elevation in metres ASL
 * @returns {number} Thermal base altitude in metres (floored at elevation)
 */
function calcThermalBase(surfaceTempC, dewPointC, elevationM) {
  const t  = isFinite(Number(surfaceTempC)) ? Number(surfaceTempC) : 15;
  const dp = isFinite(Number(dewPointC))    ? Number(dewPointC)    : 10;
  const el = isFinite(Number(elevationM))   ? Number(elevationM)   :  0;

  const spread = Math.max(0, t - dp); // spread cannot be negative
  const base   = Math.round(spread * 122 + el);
  return Math.max(base, Math.round(el)); // cannot be below site elevation
}

/**
 * Estimate thermal strength (average climb rate) in m/s from CAPE.
 *
 * Formula: min(sqrt(CAPE) * 0.08, 5.0)
 *
 * Meteorological basis: CAPE (Convective Available Potential Energy, J/kg) is
 * the work done by buoyancy as a parcel rises through an unstable layer.
 * Theoretical maximum vertical velocity is sqrt(2 * CAPE), but real thermals
 * are ~8% of that due to entrainment of surrounding air and friction losses.
 * The 5 m/s cap represents XC-competitive conditions; above that, convection
 * is typically dangerously strong.
 *
 * CAPE = 0 means the atmosphere is statically stable — no thermal development.
 *
 * @param {number} cape - CAPE in J/kg (>= 0)
 * @returns {number} Thermal strength in m/s (0–5), rounded to 2 dp
 */
function calcThermalStrength(cape) {
  const c = isFinite(Number(cape)) ? Math.max(0, Number(cape)) : 0;
  if (c === 0) return 0; // explicitly stable; sqrt(0)*0.08 = 0 but make intent clear
  return Math.round(Math.min(Math.sqrt(c) * 0.08, 5.0) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Wind shear detection
// ---------------------------------------------------------------------------

/**
 * Detect dangerous wind shear across altitude layers.
 *
 * Returns true if the wind DIRECTION changes by more than 45° between any
 * two adjacent layers in the provided array.
 *
 * Meteorological basis: direction shear (veering/backing) indicates rotating
 * wind structure between layers.  Changes > 45° over the height increments
 * typical of the sub-3000 m flight envelope create turbulent transitions that
 * can collapse paraglider wings.  Speed shear is handled separately via the
 * overall rating.
 *
 * Circular difference is used to correctly handle the 360°→0° wrap
 * (e.g. 350° and 10° differ by 20°, not 340°).
 *
 * @param {Array<{dirDeg: number}>} altitudeWinds - Altitude wind layers
 *   (must include dirDeg in degrees 0–360)
 * @returns {boolean} True if shear > 45° exists between any adjacent layers
 */
function detectWindShear(altitudeWinds) {
  if (!Array.isArray(altitudeWinds) || altitudeWinds.length < 2) return false;

  for (let i = 0; i < altitudeWinds.length - 1; i++) {
    const a = altitudeWinds[i];
    const b = altitudeWinds[i + 1];
    if (!a || !b) continue;

    const degA = isFinite(Number(a.dirDeg)) ? Number(a.dirDeg) : 0;
    const degB = isFinite(Number(b.dirDeg)) ? Number(b.dirDeg) : 0;

    // Circular (shortest-arc) difference
    const diff = Math.abs(((degB - degA + 540) % 360) - 180);
    if (diff > 45) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Flyability rating
// ---------------------------------------------------------------------------

/**
 * Rate overall flight conditions using the CLAUDE.md flyability thresholds.
 *
 * Evaluation order (highest danger first):
 *   DANGER   → wind > 55 km/h  OR  thunderstorm (code ≥ 95)  OR  CAPE > 2000
 *   POOR     → wind 40–55 km/h  OR  heavy rain (precip ≥ 5 mm)  OR  LI ≤ -4
 *   FAIR     → wind < 40 km/h  (light precip OK)  OR  LI > -4
 *   GOOD     → wind < 30 km/h  AND  precip < 0.5 mm  AND  CAPE < 1500  AND  LI > -2
 *   EXCELLENT→ wind < 20 km/h  AND  no precip  AND  CAPE 100–800  AND  LI > 0
 *
 * Meteorological notes:
 *   - Lifted Index (LI): positive = stable atmosphere.  LI < 0 = unstable,
 *     LI < -4 = severe instability (convective outbreaks).
 *   - CAPE > 2000 J/kg → violent convection likely (thunderstorm territory).
 *   - Wind > 55 km/h at launch is a hard no-fly; rotor and turbulence make
 *     inflation impossible or extremely hazardous.
 *
 * @param {number} windKmh      - Surface wind speed in km/h
 * @param {number} precipMm     - Current precipitation in mm
 * @param {number} cape         - CAPE in J/kg
 * @param {number} liftedIndex  - Lifted index (positive = stable)
 * @param {number} weatherCode  - WMO weather code
 * @returns {"EXCELLENT"|"GOOD"|"FAIR"|"POOR"|"DANGER"}
 */
function rateConditions(windKmh, precipMm, cape, liftedIndex, weatherCode) {
  const w  = isFinite(Number(windKmh))     ? Number(windKmh)     : 0;
  const p  = isFinite(Number(precipMm))    ? Number(precipMm)    : 0;
  const c  = isFinite(Number(cape))        ? Number(cape)        : 0;
  const li = isFinite(Number(liftedIndex)) ? Number(liftedIndex) : 0;
  const wc = isFinite(Number(weatherCode)) ? Number(weatherCode) : 0;

  // DANGER — evaluate first; any one condition triggers it
  if (w > 55 || wc >= 95 || c > 2000) return 'DANGER';

  // POOR
  if (w >= 40 || p >= 5 || li < -4) return 'POOR';

  // FAIR — catch-all before the stricter ratings
  // (CLAUDE.md: "wind < 40 km/h, light precip ok, LI > -4")
  // We already know: w < 40, p < 5, li >= -4
  // FAIR is anything that doesn't meet GOOD criteria
  const isGood = w < 30 && p < 0.5 && c < 1500 && li > -2;
  if (!isGood) return 'FAIR';

  // EXCELLENT — subset of GOOD
  const isExcellent = w < 20 && p === 0 && c >= 100 && c <= 800 && li > 0;
  if (isExcellent) return 'EXCELLENT';

  return 'GOOD';
}

// ---------------------------------------------------------------------------
// Flying window calculation
// ---------------------------------------------------------------------------

/**
 * Find the best flying window in a transformed hourly forecast.
 *
 * Algorithm:
 *   1. Filter to daytime hours only (isDay === 1) within 09:00–18:00 preference.
 *   2. Rate each hour with rateConditions.
 *   3. Find the longest consecutive run of hours rated GOOD or better.
 *   4. Return the start/end hours and the best (highest) rating within that run.
 *
 * "Consecutive" means adjacent hours in the array — Open-Meteo provides
 * one row per hour, so consecutive rows are consecutive hours.
 *
 * @param {Array} hourly          - Transformed hourly array (from transformHourly)
 * @param {Array|null} altHourly  - (reserved for future multi-level shear check; unused)
 * @returns {{ start: string, end: string, quality: string }}
 */
function calcFlyingWindow(hourly, altHourly) {
  if (!Array.isArray(hourly) || hourly.length === 0) {
    return { start: '—', end: '—', quality: 'POOR' };
  }

  const RATING_RANK = { EXCELLENT: 4, GOOD: 3, FAIR: 2, POOR: 1, DANGER: 0 };
  const FLYABLE_MIN = RATING_RANK['GOOD']; // GOOD or EXCELLENT

  // Build rated, daytime-filtered list
  const rated = hourly.map(slot => {
    const isDay   = slot.isDay != null ? slot.isDay : 1;
    const hour    = typeof slot.h === 'number' ? slot.h : 0;
    // Prefer daytime flying: treat hours outside 09–18 and night hours as non-flyable
    const inWindow = isDay && hour >= 9 && hour <= 18;
    if (!inWindow) return { slot, rating: 'POOR', rank: 1, flyable: false };

    const rating = rateConditions(
      slot.wind,
      slot.precip,
      slot.cape != null ? slot.cape : 0,
      slot.liftedIndex != null ? slot.liftedIndex : 0,
      slot.weatherCode != null ? slot.weatherCode : 0,
    );
    const rank    = RATING_RANK[rating] || 0;
    const flyable = rank >= FLYABLE_MIN;
    return { slot, rating, rank, flyable };
  });

  // Find longest consecutive flyable run
  let bestStart   = -1;
  let bestEnd     = -1;
  let bestLen     = 0;
  let bestRank    = 0;
  let runStart    = -1;
  let runRank     = 0;

  for (let i = 0; i <= rated.length; i++) {
    const r = rated[i];
    if (r && r.flyable) {
      if (runStart === -1) {
        runStart = i;
        runRank  = r.rank;
      } else {
        runRank = Math.max(runRank, r.rank);
      }
    } else {
      // End of a run (or end of array)
      if (runStart !== -1) {
        const runLen = i - runStart;
        if (runLen > bestLen || (runLen === bestLen && runRank > bestRank)) {
          bestLen   = runLen;
          bestStart = runStart;
          bestEnd   = i - 1;
          bestRank  = runRank;
        }
      }
      runStart = -1;
      runRank  = 0;
    }
  }

  if (bestStart === -1) {
    return { start: '—', end: '—', quality: 'POOR' };
  }

  const startHour = rated[bestStart].slot.h;
  const endHour   = rated[bestEnd].slot.h;

  // Format as "HH:00"
  const fmt = h => String(h).padStart(2, '0') + ':00';

  // Determine quality label from best rank in window
  const qualityLabel = Object.entries(RATING_RANK)
    .find(([, v]) => v === bestRank)?.[0] || 'GOOD';

  return {
    start:   fmt(startHour),
    end:     fmt(endHour),
    quality: qualityLabel,
  };
}

// ---------------------------------------------------------------------------
// Master flight assessment
// ---------------------------------------------------------------------------

/**
 * Build the full CLAUDE.md `flight` object from transformed current conditions
 * and supporting context data.
 *
 * @param {object} current - Output of transformCurrent()
 * @param {Array}  hourly  - Output of transformHourly() (used for window calc)
 * @param {object} ctx     - Additional context:
 *   @param {Array}  ctx.altitudeWinds  - Output of transformAltitudeWinds()
 *   @param {number} ctx.cape           - CAPE J/kg (from hourly or altitude API)
 *   @param {number} ctx.liftedIndex    - Lifted index
 *   @param {number} ctx.boundaryLayer  - Boundary layer height in metres
 *   @param {number} ctx.elevation      - Site elevation in metres
 *   @param {Array}  ctx.hourly         - Same as `hourly` param (for window calc)
 * @returns {object} Full flight conditions object
 */
function assessFlight(current, hourly, ctx) {
  const c   = current || {};
  const ctxSafe = ctx || {};

  const altWinds      = Array.isArray(ctxSafe.altitudeWinds) ? ctxSafe.altitudeWinds : [];
  const cape          = isFinite(Number(ctxSafe.cape))         ? Number(ctxSafe.cape)         : 0;
  const liftedIndex   = isFinite(Number(ctxSafe.liftedIndex))  ? Number(ctxSafe.liftedIndex)  : 0;
  const boundaryLayer = isFinite(Number(ctxSafe.boundaryLayer))? Number(ctxSafe.boundaryLayer): 0;
  const elevation     = isFinite(Number(ctxSafe.elevation))    ? Number(ctxSafe.elevation)    : 0;
  const hourlyArr     = Array.isArray(ctxSafe.hourly) ? ctxSafe.hourly
                      : Array.isArray(hourly)          ? hourly
                      : [];

  // Dew point: prefer field on current object, fall back to approximation
  const dewpoint = isFinite(Number(c.dewpoint))
    ? Number(c.dewpoint)
    : (c.temp != null ? c.temp - ((100 - (c.humidity || 50)) / 5) : 10);

  const windKmh   = isFinite(Number(c.wind))        ? Number(c.wind)        : 0;
  const precipMm  = isFinite(Number(c.precip))       ? Number(c.precip)      : 0;
  const wmoCode   = isFinite(Number(c.weatherCode))  ? Number(c.weatherCode) : 0;

  const rating = rateConditions(windKmh, precipMm, cape, liftedIndex, wmoCode);

  const thermalBase     = calcThermalBase(c.temp, dewpoint, elevation);
  const thermalStrength = calcThermalStrength(cape);
  const thermalTop      = Math.round(Math.max(thermalBase, boundaryLayer));
  const windShear       = detectWindShear(altWinds);

  // Rotor risk: surface wind > 25 km/h AND terrain (per-site flag, default false)
  // The terrain flag is not available without per-site config; callers may override.
  const rotor = false;

  const flyable = ['EXCELLENT', 'GOOD', 'FAIR'].includes(rating);

  const window = calcFlyingWindow(hourlyArr, null);

  return {
    flyable,
    rating,
    thermalBase,
    thermalTop,
    thermalStrength,
    boundaryLayer:  Math.round(boundaryLayer),
    windShear,
    rotor,
    cape,
    liftedIndex,
    altitudeWinds:  altWinds,
    window,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  calcThermalBase,
  calcThermalStrength,
  detectWindShear,
  rateConditions,
  calcFlyingWindow,
  assessFlight,
};
