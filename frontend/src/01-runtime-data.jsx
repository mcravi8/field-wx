
const { useState, useEffect, useMemo } = React;
/* ===== FIELD WX · live data layer (Open-Meteo via local backend) — region-aware units ===== */
const LIVE_LAT = 45.4677, LIVE_LON = 7.8772;
/* ===== FIELD WX · client-side Open-Meteo data layer (no backend required) =====
   Fetches Open-Meteo directly (free, no key, CORS + HTTPS) and produces the SAME
   { current, hourly, daily, flight, units } schema the adapters already consume,
   so the app works fully on a static host. Region-aware units + ?units override,
   current-hour-correct thermals/ceiling/altitude winds. */
const WeatherAPI = (function () {
  const OM = "https://api.open-meteo.com/v1/forecast";

  const METRIC = { system: "metric", temperature_unit: "celsius", wind_speed_unit: "kmh", precipitation_unit: "mm",
    units: { temp: "°C", wind: "km/h", precip: "mm", pressure: "hPa", visibility: "km", system: "metric" } };
  const IMPERIAL = { system: "imperial", temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch",
    units: { temp: "°F", wind: "mph", precip: "in", pressure: "hPa", visibility: "mi", system: "imperial" } };
  const US_TZ = { "America/New_York": 1, "America/Detroit": 1, "America/Kentucky/Louisville": 1, "America/Indiana/Indianapolis": 1,
    "America/Chicago": 1, "America/Denver": 1, "America/Boise": 1, "America/Phoenix": 1, "America/Los_Angeles": 1,
    "America/Anchorage": 1, "America/Adak": 1, "Pacific/Honolulu": 1 };
  function inUsBox(lat, lon) { return lon >= -125 && lon <= -66 && lat >= 24 && lat <= 50; }
  function resolveUnits(lat, lon, tz, override) {
    if (override === "metric") return METRIC;
    if (override === "imperial") return IMPERIAL;
    return (inUsBox(+lat, +lon) || (tz && US_TZ[tz])) ? IMPERIAL : METRIC;
  }

  const WMO_COND = { 0: "CLEAR", 1: "CLEAR", 2: "OVERCAST", 3: "OVERCAST", 45: "OVERCAST", 48: "OVERCAST", 51: "RAIN", 53: "RAIN", 55: "RAIN", 61: "RAIN", 63: "RAIN", 65: "RAIN", 71: "SNOW", 73: "SNOW", 75: "SNOW", 77: "SNOW", 80: "RAIN", 81: "RAIN", 82: "RAIN", 85: "SNOW", 86: "SNOW", 95: "STORM", 96: "STORM", 99: "STORM" };
  const WMO_CODE = { 0: "CLR", 1: "FEW", 2: "SCT", 3: "OVC", 45: "OVC", 48: "OVC", 51: "-RA", 53: "-RA", 55: "RA", 61: "RA", 63: "RA", 65: "+RA", 71: "-SN", 73: "-SN", 75: "+SN", 77: "SN", 80: "RA", 81: "RA", 82: "+RA", 85: "-SN", 86: "+SN", 95: "TSRA", 96: "TSRA", 99: "TSRA" };
  const WMO_LABEL = { 0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers", 82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Thunderstorm w/ hail" };
  const condOf = (c) => WMO_COND[c] || "CLEAR";
  const codeOf = (c) => WMO_CODE[c] || "CLR";
  const labelOf = (c) => WMO_LABEL[c] || "Clear";
  const CARD16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  function cardinal(deg) { if (deg == null || isNaN(deg)) return "N"; return CARD16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]; }
  function atmosOf(condition, c, isDay) {
    const sc = codeOf(c);
    if (condition === "STORM") return "storm";
    if (condition === "SNOW") return (sc === "+SN" || sc === "BLSN") ? "blizzard" : "snow";
    if (condition === "RAIN") return "rain";
    if (condition === "OVERCAST") return "overcast";
    return isDay ? "clear-day" : "clear-night";
  }
  const num = (v, d) => { const n = Number(v); return isFinite(n) ? n : (d || 0); };
  const intg = (v, d) => Math.round(num(v, d));
  const arrf = (o, k) => (o && Array.isArray(o[k]) ? o[k] : []);
  const parseHour = (s) => { if (!s) return 0; const p = String(s).split("T"); return p.length < 2 ? 0 : (parseInt(p[1].slice(0, 2), 10) || 0); };
  const at = (a, i) => (Array.isArray(a) && a.length ? a[Math.min(i, a.length - 1)] : undefined);
  const pick = (a, b, i) => { const v = at(a, i); if (v != null) return v; const w = at(b, i); return w != null ? w : 0; };

  function findCurrentHourIndex(raw) {
    const times = arrf(raw && raw.hourly, "time");
    const cur = raw && raw.current && raw.current.time;
    if (!cur || !times.length) return 0;
    const ex = times.indexOf(cur); if (ex !== -1) return ex;
    const pre = String(cur).slice(0, 13);
    const pi = times.findIndex((t) => String(t).indexOf(pre) === 0);
    return pi !== -1 ? pi : 0;
  }

  function transformCurrent(raw, system) {
    const c = (raw && raw.current) || {}, h = (raw && raw.hourly) || {};
    const wc = intg(c.weather_code, 0), condition = condOf(wc);
    const isDay = c.is_day != null ? (c.is_day ? 1 : 0) : 1;
    const ci = findCurrentHourIndex(raw);
    let dew;
    if (c.dew_point_2m != null && isFinite(+c.dew_point_2m)) dew = Math.round(+c.dew_point_2m * 10) / 10;
    else dew = Math.round((num(c.temperature_2m, 15) - (100 - num(c.relative_humidity_2m, 50)) / 5) * 10) / 10;
    const blh = arrf(h, "boundary_layer_height");
    const ceiling = (blh.length > ci && blh[ci] != null) ? Math.round(num(blh[ci], 0)) : null;
    const visM = c.visibility != null ? num(c.visibility, 0) : null;
    const visibility = visM == null ? null : (system === "imperial" ? Math.round(visM / 1609.34 * 10) / 10 : Math.round(visM / 1000 * 10) / 10);
    const ddeg = intg(c.wind_direction_10m, 0);
    const pprob = arrf(h, "precipitation_probability");
    return {
      temp: intg(c.temperature_2m, 15), feels: intg(c.apparent_temperature, 15),
      wind: intg(c.wind_speed_10m, 0), windDir: cardinal(ddeg), windDirDeg: ddeg, gust: intg(c.wind_gusts_10m, 0),
      humidity: intg(c.relative_humidity_2m, 50), pressure: intg(c.surface_pressure, 1013), visibility: visibility,
      uv: intg(c.uv_index, 0), cloudcover: intg(c.cloud_cover, 0), precip: num(c.precipitation, 0),
      precipProb: intg(pprob[ci], 0), ceiling: ceiling, condition: condition, code: codeOf(wc), label: labelOf(wc),
      atmos: atmosOf(condition, wc, isDay), isDay: isDay, dewpoint: dew, weatherCode: wc,
    };
  }
  function transformHourly(raw, count) {
    count = count || 24;
    const h = (raw && raw.hourly) || {};
    const times = arrf(h, "time"), temps = arrf(h, "temperature_2m"), winds = arrf(h, "wind_speed_10m"),
      wdir = arrf(h, "wind_direction_10m"), gust = arrf(h, "wind_gusts_10m"), pr = arrf(h, "precipitation"),
      pp = arrf(h, "precipitation_probability"), cc = arrf(h, "cloud_cover"), wcs = arrf(h, "weather_code"), idy = arrf(h, "is_day"), cp = arrf(h, "cape"), lix = arrf(h, "lifted_index");
    const start = findCurrentHourIndex(raw), out = [];
    for (let i = 0; i < count; i++) {
      const k = start + i; if (k >= times.length) break;
      const wc = intg(wcs[k], 0), dd = intg(wdir[k], 0);
      out.push({ h: parseHour(times[k]), temp: intg(temps[k], 15), wind: intg(winds[k], 0), windDir: cardinal(dd), windDirDeg: dd,
        gust: intg(gust[k], 0), precip: num(pr[k], 0), precipProb: intg(pp[k], 0), cloudcover: intg(cc[k], 0),
        condition: condOf(wc), code: codeOf(wc), weatherCode: wc, cape: num(cp[k], 0), liftedIndex: num(lix[k], 0), isDay: idy[k] != null ? (idy[k] ? 1 : 0) : 1 });
    }
    return out;
  }
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function transformDaily(raw) {
    const d = (raw && raw.daily) || {};
    const dates = arrf(d, "time"), mx = arrf(d, "temperature_2m_max"), mn = arrf(d, "temperature_2m_min"),
      wmax = arrf(d, "wind_speed_10m_max"), psum = arrf(d, "precipitation_sum"), pmax = arrf(d, "precipitation_probability_max"), wcs = arrf(d, "weather_code");
    const n = Math.min(dates.length, 7), out = [];
    for (let i = 0; i < n; i++) {
      const ds = dates[i] || "", wc = intg(wcs[i], 0), w = intg(wmax[i], 0), pmm = num(psum[i], 0);
      let dayShort = "---"; if (ds) { const dt = new Date(ds + "T12:00:00Z"); dayShort = DAY[dt.getUTCDay()] || "---"; }
      out.push({ date: ds, dayShort: dayShort, tempMax: intg(mx[i], 15), tempMin: intg(mn[i], 5), wind: w,
        precip: Math.round(pmm * 10) / 10, precipProb: intg(pmax[i], 0), condition: condOf(wc), code: codeOf(wc),
        flyable: w < 40 && pmm < 10 && wc < 95 });
    }
    return out;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpDir = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return ((a + d * t) + 360) % 360; };
  function transformAltitudeWinds(alt, idx) {
    const h = (alt && alt.hourly) || {}; const i = Math.max(0, idx || 0);
    const spd = (lv) => num(arrf(h, "wind_speed_" + lv + "hPa")[i], 0);
    const dir = (lv) => num(arrf(h, "wind_direction_" + lv + "hPa")[i], 0);
    const s850 = spd(850), d850 = dir(850), s700 = spd(700), d700 = dir(700);
    const layers = [
      { alt: 500, s: s850 * 0.85, d: d850 }, { alt: 1000, s: s850 * 0.92, d: d850 }, { alt: 1500, s: s850, d: d850 },
      { alt: 2000, s: lerp(s850, s700, 1 / 3), d: lerpDir(d850, d700, 1 / 3) }, { alt: 2500, s: lerp(s850, s700, 2 / 3), d: lerpDir(d850, d700, 2 / 3) },
      { alt: 3000, s: s700, d: d700 }];
    return layers.map((l) => ({ alt: l.alt, speed: Math.round(l.s), dir: cardinal(l.d), dirDeg: Math.round(((l.d % 360) + 360) % 360) }));
  }

  function thermalBaseM(t, dp, el) { const T = isFinite(+t) ? +t : 15, D = isFinite(+dp) ? +dp : 10; return Math.max(0, Math.round(Math.max(0, T - D) * 122)); } // LCL height AGL (above ground) to stay coherent with the ground-relative sounding axis + windgram bands
  function thermalStrengthM(cape) { const c = isFinite(+cape) ? Math.max(0, +cape) : 0; return c === 0 ? 0 : Math.round(Math.min(Math.sqrt(c) * 0.08, 5) * 100) / 100; }
  function shearM(aw) { if (!Array.isArray(aw) || aw.length < 2) return false; for (let i = 0; i < aw.length - 1; i++) { const a = +aw[i].dirDeg || 0, b = +aw[i + 1].dirDeg || 0; if (Math.abs(((b - a + 540) % 360) - 180) > 45) return true; } return false; }
  function rateM(w, p, c, li, wc) {
    w = +w || 0; p = +p || 0; c = +c || 0; li = +li || 0; wc = +wc || 0;
    if (w > 55 || wc >= 95 || c > 2000) return "DANGER";
    if (w >= 40 || p >= 5 || li < -4) return "POOR";
    if (!(w < 30 && p < 0.5 && c < 1500 && li > -2)) return "FAIR";
    if (w < 20 && p === 0 && c >= 100 && c <= 800 && li > 0) return "EXCELLENT";
    return "GOOD";
  }
  const RANK = { EXCELLENT: 4, GOOD: 3, FAIR: 2, POOR: 1, DANGER: 0 };
  function flyingWindowM(hourly) {
    if (!Array.isArray(hourly) || !hourly.length) return { start: "—", end: "—", quality: "POOR" };
    const rated = hourly.map((s) => {
      const isDay = s.isDay != null ? s.isDay : 1, hr = typeof s.h === "number" ? s.h : 0;
      if (!(isDay && hr >= 9 && hr <= 18)) return { s: s, fly: false, rank: 1 };
      const r = rateM(s.wind, s.precip, s.cape || 0, s.liftedIndex || 0, s.weatherCode || 0);
      const rk = RANK[r] || 0; return { s: s, fly: rk >= RANK.GOOD, rank: rk };
    });
    let bS = -1, bE = -1, bL = 0, bR = 0, rS = -1, rR = 0;
    for (let i = 0; i <= rated.length; i++) {
      const r = rated[i];
      if (r && r.fly) { if (rS === -1) { rS = i; rR = r.rank; } else rR = Math.max(rR, r.rank); }
      else { if (rS !== -1) { const len = i - rS; if (len > bL || (len === bL && rR > bR)) { bL = len; bS = rS; bE = i - 1; bR = rR; } } rS = -1; rR = 0; }
    }
    if (bS === -1) return { start: "—", end: "—", quality: "POOR" };
    const fmt = (x) => String(x).padStart(2, "0") + ":00";
    const q = Object.keys(RANK).find((k) => RANK[k] === bR) || "GOOD";
    return { start: fmt(rated[bS].s.h), end: fmt(rated[bE].s.h), quality: q };
  }
  // ---- real vertical sounding (Curva di stato) from pressure-level temp/dew + geopotential heights ----
  function buildSounding(alt, forecast, elevation, idx) {
    const ah = (alt && alt.hourly) || {}, fh = (forecast && forecast.hourly) || {};
    const rd = function (lv, kind) { const v = at(arrf(ah, kind + "_" + lv + "hPa"), idx); return v == null ? null : +v; };
    const gh = function (lv) { const v = at(arrf(ah, "geopotential_height_" + lv + "hPa"), idx); return v == null ? null : +v; };
    const t2 = num(at(arrf(fh, "temperature_2m"), idx), 15), d2 = num(at(arrf(fh, "dew_point_2m"), idx), 8);
    const pts = [{ a: elevation, t: t2, d: d2 }];
    [850, 700, 600, 500].forEach(function (lv) {
      const h = gh(lv), t = rd(lv, "temperature"), d = rd(lv, "dew_point");
      if (h != null && t != null) pts.push({ a: h, t: t, d: d != null ? d : t - 3 });
    });
    pts.sort(function (p, q) { return p.a - q.a; });
    const interp = function (msl, key) {
      if (msl <= pts[0].a) return pts[0][key];
      if (msl >= pts[pts.length - 1].a) return pts[pts.length - 1][key];
      for (let i = 0; i < pts.length - 1; i++) {
        if (msl >= pts[i].a && msl <= pts[i + 1].a) {
          const f = (msl - pts[i].a) / Math.max(1, pts[i + 1].a - pts[i].a);
          return pts[i][key] + (pts[i + 1][key] - pts[i][key]) * f;
        }
      }
      return pts[pts.length - 1][key];
    };
    const galts = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500];
    return { alts: galts, temps: galts.map(function (g) { return Math.round(interp(elevation + g, "t")); }), dews: galts.map(function (g) { return Math.round(interp(elevation + g, "d")); }) };
  }
  // ---- real per-hour windgram grid: 9 altitude bands (surface..4000m) x 24 hours ----
  function transformWindgram(alt, forecast, hours) {
    hours = hours || 24;
    const ah = (alt && alt.hourly) || {}, fh = (forecast && forecast.hourly) || {};
    const times = arrf(fh, "time"), start = findCurrentHourIndex(forecast), count = Math.min(hours, Math.max(1, times.length - start));
    const sfcS = arrf(fh, "wind_speed_10m"), sfcD = arrf(fh, "wind_direction_10m"), blhA = arrf(fh, "boundary_layer_height");
    const lv = function (l, kind, i) { const v = at(arrf(ah, "wind_" + kind + "_" + l + "hPa"), i); return v == null ? NaN : +v; };
    const LEVELS = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
    const grid = LEVELS.map(function () { return []; }), hourLabels = [], blByHour = [];
    for (let i = 0; i < count; i++) {
      const k = start + i;
      hourLabels.push(parseHour(times[k])); blByHour.push(Math.round(num(blhA[k], 0)));
      const ss = num(sfcS[k], 0), sd = num(sfcD[k], 0);
      let s850 = lv(850, "speed", k), d850 = lv(850, "direction", k), s700 = lv(700, "speed", k), d700 = lv(700, "direction", k), s600 = lv(600, "speed", k), d600 = lv(600, "direction", k);
      if (!isFinite(s850)) s850 = ss; if (!isFinite(d850)) d850 = sd;
      if (!isFinite(s700)) s700 = s850; if (!isFinite(d700)) d700 = d850;
      if (!isFinite(s600)) s600 = s700; if (!isFinite(d600)) d600 = d700;
      const cells = { 0: [ss, sd], 500: [s850 * 0.85, d850], 1000: [s850 * 0.92, d850], 1500: [s850, d850], 2000: [lerp(s850, s700, 1 / 3), lerpDir(d850, d700, 1 / 3)], 2500: [lerp(s850, s700, 2 / 3), lerpDir(d850, d700, 2 / 3)], 3000: [s700, d700], 3500: [lerp(s700, s600, 0.4167), lerpDir(d700, d600, 0.4167)], 4000: [lerp(s700, s600, 0.8333), lerpDir(d700, d600, 0.8333)] };
      LEVELS.forEach(function (L, li) { const cc = cells[L]; const dd = Math.round(((cc[1] % 360) + 360) % 360); grid[li].push({ speed: Math.max(0, Math.round(cc[0])), dir: cardinal(dd), dirDeg: dd }); });
    }
    return { levels: LEVELS, hours: hourLabels, current: 0, grid: grid, blByHour: blByHour };
  }
  // ---- real regional temperature map: ONE bulk Open-Meteo call for 12 fixed Canavese towns ----
  // ---- dynamic regional temp map: GeoNames nearby towns + Open-Meteo bulk temps (works for any site) ----
  const GEONAMES_USERNAME = "mcraviotto"; // free account; enable "free web services" at geonames.org/manageaccount
  // Up to 12 populated places within 40km of the active site. HTTPS (secure.geonames.org) avoids mixed-content blocking on an HTTPS host.
  async function fetchNearbyTowns(lat, lon) {
    const url = "https://secure.geonames.org/findNearbyPlaceNameJSON?lat=" + lat + "&lng=" + lon + "&radius=40&maxRows=12&username=" + encodeURIComponent(GEONAMES_USERNAME);
    const j = await getJson(url, "geonames");
    if (j && j.status) throw new Error("GeoNames: " + ((j.status && j.status.message) || "error"));
    const g = (j && j.geonames) || [];
    return g.map(function (p) { return { name: String(p.name || "").toUpperCase(), lat: +p.lat, lon: +p.lng, dist: +p.distance || 0 }; })
            .filter(function (p) { return isFinite(p.lat) && isFinite(p.lon); });
  }
  // Project geo coords onto the 0..1 map canvas with the active site centered; north = up.
  function projectTowns(towns, lat0, lon0) {
    const cosLat = Math.cos(lat0 * Math.PI / 180);
    const m = towns.map(function (t) { return { name: t.name, dist: t.dist, lat: t.lat, lon: t.lon, dN: (t.lat - lat0) * 111.32, dE: (t.lon - lon0) * 111.32 * cosLat }; });
    let span = 0; m.forEach(function (p) { span = Math.max(span, Math.abs(p.dN), Math.abs(p.dE)); });
    span = Math.max(span, 5) * 1.15;
    const clamp = function (v) { return Math.max(0.06, Math.min(0.94, v)); };
    return m.map(function (p) { return { name: p.name, lat: p.lat, lon: p.lon, dist: p.dist, x: clamp(0.5 + p.dE / (2 * span)), y: clamp(0.5 - p.dN / (2 * span)) }; });
  }
  function singlePointMap(current) {
    return { pts: [{ name: "LOCAL", x: 0.5, y: 0.5, primary: true, t: Math.round(current.temp) }], dirDeg: current.windDirDeg, wind: current.wind, gust: current.gust };
  }
  async function fetchTempmap(lat, lon, idx, current, u) {
    let towns; try { towns = await fetchNearbyTowns(lat, lon); } catch (e) { towns = []; }
    if (!towns.length) return singlePointMap(current); // e.g. open water, or GeoNames account not yet enabled
    const placed = projectTowns(towns, lat, lon);
    const lats = placed.map(function (t) { return t.lat; }).join(","), lons = placed.map(function (t) { return t.lon; }).join(",");
    const j = await getJson(OM + "?latitude=" + lats + "&longitude=" + lons + "&hourly=temperature_2m&temperature_unit=" + u.temperature_unit + "&timezone=auto&forecast_days=1", "tempmap");
    const arr = Array.isArray(j) ? j : [j];
    // towns share the active site's timezone (<=40km) so the primary's local-hour index applies to all (NOT raw UTC[0])
    let nearest = 0; placed.forEach(function (p, k) { if (p.dist < placed[nearest].dist) nearest = k; });
    const pts = placed.map(function (t, i) { const hh = arr[i] && arr[i].hourly, tp = hh && hh.temperature_2m; const v = (tp && tp[idx] != null) ? tp[idx] : ((tp && tp.length) ? tp[0] : current.temp); return { name: t.name, x: t.x, y: t.y, primary: i === nearest, t: Math.round(v) }; });
    return { pts: pts, dirDeg: current.windDirDeg, wind: current.wind, gust: current.gust };
  }
  // ---- derived cloud base (LCL): Open-Meteo cloud_base is null, so compute the lifting condensation level ----
  function cloudBaseM(current, elevation) {
    const lcl = thermalBaseM(current.temp, current.dewpoint, elevation);
    const cc = num(current.cloudcover, 0), prefix = cc < 25 ? "FEW" : cc > 75 ? "OVC" : "CU";
    return { cbH: lcl, cloudBase: prefix + " " + lcl + "m" };
  }
  // ---- derived valley wind: anabatic/katabatic from is_day + boundary-layer state ----
  function valleyFlowM(current, blh) {
    // up/down-valley DIRECTION is generic: the true valley-axis bearing needs terrain not in a point forecast
    if (current.isDay && blh > 800) return "ANABATIC \u00b7 UP-VALLEY";
    if (current.isDay) return "VALLEY BREEZE \u00b7 LIGHT";
    return "KATABATIC \u00b7 DOWN-VALLEY";
  }
  // ---- derived flyability note from the live rating + instability ----
  function flyNoteM(rating, cape, li, wc, precip) {
    if (wc >= 95) return "CB OVERHEAD \u2014 DANGER";
    if (precip > 0) return "PRECIP \u2014 DO NOT LAUNCH";
    if (rating === "DANGER") return "TOO STRONG \u2014 GROUNDED";
    if (rating === "POOR") return "MARGINAL \u2014 EXPERTS ONLY";
    if (rating === "EXCELLENT") return "STRONG THERMALS \u2014 GOOD XC";
    if (rating === "GOOD") return (cape > 400 && li < 0) ? "WORKABLE THERMALS \u2014 XC POSSIBLE" : "SOARABLE \u2014 STEADY LIFT";
    return "WEAK / SHADED \u2014 SOARING ONLY";
  }
  function assessFlight(current, hourly, ctx) {
    const c = current || {}, x = ctx || {};
    const aw = Array.isArray(x.altitudeWinds) ? x.altitudeWinds : [];
    const cape = isFinite(+x.cape) ? +x.cape : 0, li = isFinite(+x.liftedIndex) ? +x.liftedIndex : 0,
      blh = isFinite(+x.boundaryLayer) ? +x.boundaryLayer : 0, el = isFinite(+x.elevation) ? +x.elevation : 0;
    const dp = isFinite(+c.dewpoint) ? +c.dewpoint : (c.temp != null ? c.temp - (100 - (c.humidity || 50)) / 5 : 10);
    const w = isFinite(+c.wind) ? +c.wind : 0, p = isFinite(+c.precip) ? +c.precip : 0, wc = isFinite(+c.weatherCode) ? +c.weatherCode : 0;
    const rating = rateM(w, p, cape, li, wc);
    const tb = thermalBaseM(c.temp, dp, el);
    var fz = isFinite(+x.freezingLevel) ? +x.freezingLevel : 0;
    var fzAgl = fz > 0 ? Math.max(0, fz - el) : 0; // freezing_level_height is MSL; tb (LCL) and blh are AGL
    var top = Math.round(Math.max(tb, blh)); if (fzAgl > 0) top = Math.min(top, Math.round(fzAgl));
    var win = flyingWindowM(Array.isArray(x.hourly) ? x.hourly : hourly), cb = cloudBaseM(c, el);
    return { flyable: rating === "EXCELLENT" || rating === "GOOD" || rating === "FAIR", rating: rating, thermalBase: tb,
      thermalTop: top, thermalStrength: thermalStrengthM(cape), boundaryLayer: Math.round(blh),
      windShear: shearM(aw), rotor: false /* needs upwind terrain/ridge geometry - not in a point forecast */, cape: cape, liftedIndex: li, altitudeWinds: aw,
      window: win, onset: win.start, peak: win.start === "\u2014" ? "\u2014" : (win.start === win.end ? win.start : win.start + "\u2013" + win.end),
      cloudBase: cb.cloudBase, cbH: cb.cbH, flyNote: flyNoteM(rating, cape, li, wc, p), valley: valleyFlowM(c, blh) };
  }

  const F2C = (f) => (f - 32) * 5 / 9, MPH2KMH = (m) => m * 1.60934, IN2MM = (n) => n * 25.4;
  function metricCurrent(cur, sys) { return sys !== "imperial" ? cur : Object.assign({}, cur, { temp: F2C(cur.temp), dewpoint: cur.dewpoint != null ? F2C(cur.dewpoint) : cur.dewpoint, wind: MPH2KMH(cur.wind), precip: IN2MM(cur.precip) }); }
  function metricHourly(hh, sys) { return sys !== "imperial" ? hh : hh.map((x) => Object.assign({}, x, { wind: MPH2KMH(x.wind), precip: IN2MM(x.precip) })); }

  function unitQS(u) { return "&temperature_unit=" + u.temperature_unit + "&wind_speed_unit=" + u.wind_speed_unit + "&precipitation_unit=" + u.precipitation_unit; }
  async function getJson(url, label) { const r = await fetch(url); if (!r.ok) throw new Error("Open-Meteo " + label + " " + r.status); return r.json(); }
  function forecastUrl(lat, lon, u) {
    return OM + "?latitude=" + lat + "&longitude=" + lon +
      "&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,surface_pressure,visibility,uv_index,cloud_cover,precipitation,weather_code,is_day,dew_point_2m" +
      "&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,cloud_cover,weather_code,cape,lifted_index,boundary_layer_height,is_day,dew_point_2m" +
      "&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum,precipitation_probability_max,weather_code,uv_index_max,sunrise,sunset" +
      unitQS(u) + "&timezone=auto&forecast_days=7";
  }
  function altitudeUrl(lat, lon, u) {
    return OM + "?latitude=" + lat + "&longitude=" + lon +
      "&hourly=wind_speed_850hPa,wind_direction_850hPa,wind_speed_700hPa,wind_direction_700hPa,wind_speed_600hPa,wind_direction_600hPa,wind_speed_500hPa,wind_direction_500hPa,wind_speed_250hPa,wind_direction_250hPa,geopotential_height_850hPa,geopotential_height_700hPa,geopotential_height_600hPa,geopotential_height_500hPa,temperature_850hPa,temperature_800hPa,temperature_700hPa,temperature_600hPa,temperature_500hPa,dew_point_850hPa,dew_point_700hPa,dew_point_600hPa,dew_point_500hPa,freezing_level_height,cape,lifted_index,boundary_layer_height" +
      "&temperature_unit=" + u.temperature_unit + "&wind_speed_unit=" + u.wind_speed_unit + "&timezone=auto";
  }

  function computeIsNight(forecast) {
    try {
      const cur = forecast && forecast.current && forecast.current.time;
      const d = (forecast && forecast.daily) || {};
      if (!cur || !Array.isArray(d.time) || !Array.isArray(d.sunrise) || !Array.isArray(d.sunset)) return false;
      let i = d.time.indexOf(cur.slice(0, 10)); if (i < 0) i = 0;
      const sr = d.sunrise[i], ss = d.sunset[i];
      if (!sr || !ss) return false;
      return cur < sr || cur >= ss; // local ISO strings compare correctly (same tz)
    } catch (e) { return false; }
  }
  async function compose(lat, lon, override) {
    const u0 = resolveUnits(lat, lon, undefined, override);
    let res = await Promise.all([getJson(forecastUrl(lat, lon, u0), "forecast"), getJson(altitudeUrl(lat, lon, u0), "altitude")]);
    let forecast = res[0], alt = res[1];
    let u = override ? u0 : resolveUnits(lat, lon, forecast && forecast.timezone);
    if (u.system !== u0.system) { res = await Promise.all([getJson(forecastUrl(lat, lon, u), "forecast"), getJson(altitudeUrl(lat, lon, u), "altitude")]); forecast = res[0]; alt = res[1]; }
    const sys = u.system, idx = findCurrentHourIndex(forecast);
    const current = transformCurrent(forecast, sys), hourly = transformHourly(forecast, 24), daily = transformDaily(forecast);
    const altitudeWinds = transformAltitudeWinds(alt, idx);
    const mCur = metricCurrent(current, sys), mHourly = metricHourly(hourly, sys);
    const fh = (forecast && forecast.hourly) || {}, ah = (alt && alt.hourly) || {};
    const ctx = { altitudeWinds: altitudeWinds, cape: pick(fh.cape, ah.cape, idx), liftedIndex: pick(fh.lifted_index, ah.lifted_index, idx),
      boundaryLayer: pick(fh.boundary_layer_height, ah.boundary_layer_height, idx), elevation: (forecast && forecast.elevation) || 0,
      freezingLevel: num(at(arrf(ah, "freezing_level_height"), idx), 0), hourly: mHourly };
    const flight = assessFlight(mCur, mHourly, ctx);
    flight.windgram = transformWindgram(alt, forecast, 24);
    flight.sounding = buildSounding(alt, forecast, (forecast && forecast.elevation) || 0, idx);
    try { flight.tempmap = await fetchTempmap(lat, lon, idx, current, u); }
    catch (e) { flight.tempmap = singlePointMap(current); }
    return { current: current, hourly: hourly, daily: daily, flight: flight, units: u.units, isNight: computeIsNight(forecast) };
  }

  return {
    getFull: function (lat, lon, units) { return compose(lat, lon, units); },
    getNow: function (lat, lon, units) { return compose(lat, lon, units).then(function (r) { return { current: r.current, flight: r.flight, units: r.units }; }); },
    getWeek: function (lat, lon, units) { return compose(lat, lon, units).then(function (r) { return { daily: r.daily, units: r.units }; }); },
    getAltitude: function (lat, lon, units) { return compose(lat, lon, units).then(function (r) { return { altitudeWinds: r.flight.altitudeWinds, windgram: r.flight.windgram, thermals: { thermalBase: r.flight.thermalBase, thermalTop: r.flight.thermalTop, thermalStrength: r.flight.thermalStrength, boundaryLayer: r.flight.boundaryLayer }, units: r.units }; }); },
  };
})();
/* The API delivers values already in the region's units (metric, or imperial for the US)
   plus a `units` object — no client-side unit conversion. Values pass straight through;
   display labels come from `units.system`. Uppercased to match the mono UI. */
const _ULABELS = {
  metric:   { temp: "°C", wind: "KM/H", press: "hPa", vis: "KM", precip: "MM" },
  imperial: { temp: "°F", wind: "MPH", press: "hPa", vis: "MI", precip: "IN" },
};
function _U(system) { return _ULABELS[system] || _ULABELS.metric; }
window.U = window.U || _ULABELS.metric;
const _r = (n) => Math.round(n || 0);
const _r1 = (n) => Math.round((n || 0) * 10) / 10;
const _C8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const _degC8 = (d) => _C8[Math.round((((d || 0) % 360) / 45)) % 8];
function _liveMoodKey(condition, isDay) {
  switch (condition) {
    case "STORM": return "STORM";
    case "SNOW": return "SNOW";
    case "RAIN": return "RAIN";
    case "OVERCAST": return "OVERCAST";
    case "CLEAR": default: return "CLEAR";
  }
}
const _METAR = { CLEAR: "CLR", OVERCAST: "OVC", RAIN: "-RA", SNOW: "-SN", BLIZZARD: "+SN", NIGHT: "CLR", STORM: "TSRA" };
const _ATMOS = { CLEAR: "clear-day", OVERCAST: "overcast", RAIN: "rain", SNOW: "snow", BLIZZARD: "blizzard", NIGHT: "clear-night", STORM: "storm" };
function _liveStatus(key, windKmh, precipProb) {
  if (key === "STORM" || key === "BLIZZARD") return "ABORT";
  if (key === "RAIN" || key === "SNOW") return "HOLD";
  if (key === "OVERCAST" || windKmh >= 29 || precipProb >= 40) return "CAUTION";
  return "GO";
}
function _adaptCurrent(cur, key, today, system) {
  const tpl = (window.MOODS && (window.MOODS[key] || window.MOODS.OVERCAST)) || {};
  const wind = _r(cur.wind);
  const windKmh = system === "imperial" ? wind * 1.60934 : wind; // normalize for the GO/CAUTION status only
  const precipProb = _r(cur.precipProb != null ? cur.precipProb : 0);
  const dew = cur.dewpoint != null ? _r(cur.dewpoint) : _r(cur.temp - (100 - (cur.humidity || 50)) / 5);
  return Object.assign({}, tpl, {
    key: key, metar: _METAR[key], atmos: _ATMOS[key], cond: tpl.cond,
    temp: _r(cur.temp), feels: _r(cur.feels != null ? cur.feels : cur.temp),
    hi: today ? _r(today.tempMax) : tpl.hi, lo: today ? _r(today.tempMin) : tpl.lo,
    wind: wind, gust: _r(cur.gust),
    dir: _degC8(cur.windDirDeg), dirDeg: _r(cur.windDirDeg),
    uv: _r(cur.uv), hum: _r(cur.humidity), dew: dew,
    press: _r(cur.pressure), trend: tpl.trend, trendDeg: tpl.trendDeg,
    vis: _r1(cur.visibility), precip: precipProb, precipAmt: _r1(cur.precip),
    status: _liveStatus(key, windKmh, precipProb),
  });
}
function _adaptHourly(hours) {
  return (hours || []).map(function (h, i) {
    return {
      i: i, hour: h.h,
      label: i === 0 ? "NOW" : (String(h.h).padStart(2, "0") + ":00"),
      temp: _r(h.temp), code: h.code || "CLR",
      precip: _r(h.precipProb != null ? h.precipProb : 0),
      wind: _r(h.wind),
      day: h.isDay != null ? !!h.isDay : (h.h >= 6 && h.h < 19),
    };
  });
}
const _DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
function _adaptWeek(daily) {
  const d = daily || [];
  if (!d.length) return window.WEEK;
  const his = d.map(function (x) { return _r(x.tempMax); });
  const los = d.map(function (x) { return _r(x.tempMin); });
  const lo = Math.min.apply(null, los), hi = Math.max.apply(null, his), range = Math.max(1, hi - lo);
  return d.map(function (x) {
    const dt = new Date(x.date + "T00:00:00");
    const H = _r(x.tempMax), Lo = _r(x.tempMin);
    return {
      d: _DOW[dt.getDay()] || "MON", date: x.date.slice(5).replace("-", "/"),
      code: x.code || "CLR", hi: H, lo: Lo,
      precip: _r(x.precipProb != null ? x.precipProb : 0),
      span: [(Lo - lo) / range, (H - lo) / range],
    };
  });
}
function _adaptWindgram(cw) {
  if (!cw || !Array.isArray(cw.grid) || !Array.isArray(cw.levels) || !cw.grid.length) return null;
  var start = Math.max(0, cw.current || 0), end = Math.min(cw.hours.length, start + 13), idxs = [];
  for (var i = start; i < end; i++) idxs.push(i);
  var bands = cw.levels.slice().reverse();
  var rows = bands.map(function (b) { var li = cw.levels.indexOf(b); return idxs.map(function (hi) { var c = cw.grid[li][hi]; return { spd: c.speed, deg: c.dirDeg }; }); });
  var hours = idxs.map(function (hi) { return String(cw.hours[hi]).padStart(2, "0"); });
  var blByHour = idxs.map(function (hi) { return cw.blByHour ? cw.blByHour[hi] : 0; });
  return { hours: hours, bands: bands, rows: rows, blByHour: blByHour, top: 4000 };
}
function _adaptFlight(resp, key, system) {
  const cur = resp.current, fl = resp.flight || {};
  const saved = window.MOODS ? window.MOODS[key] : null;
  try {
    if (window.MOODS) window.MOODS[key] = _adaptCurrent(cur, key, (resp.daily || [])[0], system);
    const base = (typeof window.genFlight === "function") ? window.genFlight(key) : {};
    if (fl.thermalStrength != null) base.strength = fl.thermalStrength;
    if (fl.thermalTop != null) base.thermalTop = _r(fl.thermalTop);
    if (fl.boundaryLayer != null) base.blTop = _r(fl.boundaryLayer);
    const R = fl.rating;
    if (R) base.fly = (R === "EXCELLENT" || R === "GOOD") ? "GO" : (R === "FAIR" ? "MARGINAL" : "NO-GO");
    if (Array.isArray(fl.altitudeWinds) && fl.altitudeWinds.length && Array.isArray(base.profile)) {
      const pick = function (a) { return fl.altitudeWinds.reduce(function (p, q) { return Math.abs(q.alt - a) < Math.abs(p.alt - a) ? q : p; }); };
      const layers = [["SFC", 0], ["500m", 500], ["1000m", 1000], ["1500m", 1500], ["2000m", 2000], ["2500m", 2500], ["3000m", 3000]];
      base.profile = layers.map(function (L) {
        const lab = L[0], a = L[1];
        if (a === 0) return { alt: lab, spd: _r(cur.wind), deg: _r(cur.windDirDeg), dir: _degC8(cur.windDirDeg) };
        const w = pick(a);
        return { alt: lab, spd: _r(w.speed), deg: _r(w.dirDeg), dir: w.dir || _degC8(w.dirDeg) };
      });
      // shear recomputed from the LIVE profile (genFlight had built it from mock winds)
      base.shear = [];
      for (var si = 0; si < base.profile.length - 1; si++) {
        var p0 = base.profile[si], p1 = base.profile[si + 1];
        var dSpd = Math.abs(p1.spd - p0.spd), dd = Math.abs(p1.deg - p0.deg) % 360; if (dd > 180) dd = 360 - dd;
        var sv = dSpd + dd / 5;
        base.shear.push({ gap: p0.alt + "\u2192" + p1.alt, dSpd: dSpd, dDeg: dd, sev: sv < 7 ? "LOW" : sv < 15 ? "MOD" : sv < 24 ? "HIGH" : "SEVERE" });
      }
    }
    // remaining live flight fields (these were static mock genFlight values before)
    if (fl.flyNote) base.flyNote = fl.flyNote;
    if (fl.onset) base.onset = fl.onset;
    if (fl.peak) base.peak = fl.peak;
    if (fl.cloudBase) base.cloudBase = fl.cloudBase;
    if (fl.cbH != null) base.cbH = _r(fl.cbH);
    if (fl.valley) base.valley = fl.valley;
    base.conv = "\u2014"; // convergence needs a mesoscale/terrain wind-field gradient; not derivable from a point forecast
    if (fl.sounding) base.sounding = fl.sounding;
    if (fl.tempmap) base.tempmap = fl.tempmap;
    if (fl.windgram) { var awg = _adaptWindgram(fl.windgram); if (awg) base.windgram = awg; }
    return base;
  } finally {
    if (window.MOODS && saved) window.MOODS[key] = saved;
  }
}
function _buildLiveView(resp) {
  const cur = resp && resp.current; if (!cur) return null;
  const units = resp.units || { system: "metric" };
  const system = units.system || "metric";
  const key = _liveMoodKey(cur.condition, cur.isDay);
  const m = _adaptCurrent(cur, key, (resp.daily || [])[0], system);
  const hourly = (resp.hourly && resp.hourly.length) ? _adaptHourly(resp.hourly) : ((typeof window.genHourly === "function") ? window.genHourly(key, 24) : []);
  const week = _adaptWeek(resp.daily);
  let flight;
  try { flight = _adaptFlight(resp, key, system); }
  catch (e) { console.warn("[FIELD WX] flight adapt fallback:", e); flight = (typeof window.genFlight === "function") ? window.genFlight(key) : {}; }
  return { m: m, hourly: hourly, flight: flight, week: week, units: units, isNight: !!resp.isNight };
}
function useWeatherData(lat, lon, units) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(function () {
    let alive = true;
    const load = async function () {
      try {
        const resp = await WeatherAPI.getFull(lat, lon, units);
        if (!alive) return;
        setData(resp); setError(null); setLoading(false);
      } catch (e) {
        if (!alive) return;
        console.warn("[FIELD WX] live weather unavailable, using mock fallback:", e.message);
        setError(e); setLoading(false);
      }
    };
    setLoading(true); load();
    const id = setInterval(load, 5 * 60 * 1000);
    return function () { alive = false; clearInterval(id); };
  }, [lat, lon, units]);
  return { data: data, loading: loading, error: error };
}
/* ===== end live data layer ===== */


