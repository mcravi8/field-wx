/* ============================================================================
   FIELD WX · SoundingChart override — full émagramme / "curva di stato"  [WX_EMAGRAMME]
   The vendored chart drew only the environmental temperature + dewpoint curves.
   This adds the meteo-parapente reading aids:
     • the PARCEL-ASCENT curve — a thermal leaving the ground rises dry-adiabatically
       (−9.8 °C/km) up to the condensation level, then moist-adiabatically (≈−6 °C/km);
     • the THERMAL TOP — where the parcel curve crosses the ambient temp (parcel no
       longer warmer than its surroundings → top of usable lift);
     • the CONDENSATION / CLOUD BASE level (LCL);
     • a couple of faint dry-adiabat reference slopes for context.
   Plus, when a per-hour `series` is supplied: an HOUR SCRUBBER (slide / step through
   the day and watch the whole sounding evolve) and a full LEGEND of every line.
   Keeps the original temp (solid) + dewpoint (dashed) curves, BL shading and styling.
   Overrides the vendored global SoundingChart at runtime (inline script runs last),
   same pattern as the TopBar / HomeNow / ScreenSites / Atmosphere overrides.
   Reference frame is AGL (alts[] are metres above ground, matching cbH/blTop).
   ============================================================================ */
function SoundingChart({ sounding, series, blTop, cbH, thermalTop, flight }) {
  // hooks first (before any early return) — the scrubber's selected hour
  const hasSeries = !!(series && Array.isArray(series.frames) && series.frames.length);
  const [hr, setHr] = React.useState((series && series.current) || 0);
  const idx = hasSeries ? Math.max(0, Math.min(hr, series.frames.length - 1)) : 0;
  const frame = hasSeries ? series.frames[idx] : null;

  // resolved values for the displayed hour (series frame overrides the single-shot props)
  const alts = hasSeries ? series.alts : (sounding && sounding.alts);
  const temps = hasSeries ? frame.temps : (sounding && sounding.temps);
  const dews = hasSeries ? frame.dews : (sounding && sounding.dews);
  const _cbH = hasSeries ? frame.cbH : cbH;
  const _blTop = hasSeries ? frame.blTop : blTop;
  if (!alts || !Array.isArray(alts) || !temps || !dews) return null;

  const W = 300, H = 188, padL = 36, padR = 14, padT = 10, padB = 22;
  const maxAlt = 3500;
  const DRY = 9.8 / 1000;     // dry adiabatic lapse  °C per metre
  const MOIST = 6.0 / 1000;   // moist adiabatic lapse °C per metre (above the LCL)

  // ---- ambient temperature at any AGL height (linear interp over the sounding samples) ----
  const ambT = function (a) {
    if (a <= alts[0]) return temps[0];
    if (a >= alts[alts.length - 1]) return temps[temps.length - 1];
    for (let i = 0; i < alts.length - 1; i++) {
      if (a >= alts[i] && a <= alts[i + 1]) {
        const f = (a - alts[i]) / Math.max(1, alts[i + 1] - alts[i]);
        return temps[i] + (temps[i + 1] - temps[i]) * f;
      }
    }
    return temps[temps.length - 1];
  };
  // ---- parcel temperature: dry adiabat from the surface up to the LCL, moist above it ----
  const lcl = (_cbH != null && isFinite(+_cbH) && +_cbH > 0) ? +_cbH : null;
  const tSfc = temps[0];
  const parcelT = function (a) {
    if (lcl == null || a <= lcl) return tSfc - DRY * a;          // below cloud base → dry
    return tSfc - DRY * lcl - MOIST * (a - lcl);                  // above → moist
  };
  // ---- thermal top: first height where the rising parcel is no longer warmer than ambient ----
  let topA = null;
  for (let a = 50; a <= maxAlt; a += 25) {
    if (parcelT(a) <= ambT(a)) { topA = a; break; }
  }
  if (topA == null && thermalTop != null && isFinite(+thermalTop)) topA = Math.min(maxAlt, +thermalTop);

  // ---- scales (x = temperature, y = altitude) ----
  const parcelSamples = [];
  for (let a = 0; a <= maxAlt; a += 250) parcelSamples.push(parcelT(a));
  const all = temps.concat(dews).concat(parcelSamples);
  const tmin = Math.min.apply(null, all) - 2, tmax = Math.max.apply(null, all) + 2;
  const xT = function (v) { return padL + (v - tmin) / (tmax - tmin) * (W - padL - padR); };
  const yA = function (a) { return padT + (1 - a / maxAlt) * (H - padT - padB); };
  const polyEnv = function (arr) { return arr.map(function (v, i) { return xT(v).toFixed(1) + "," + yA(alts[i]).toFixed(1); }).join(" "); };
  // parcel polyline (denser, with a kink at the LCL)
  const parcelPts = [];
  for (let a = 0; a <= maxAlt; a += 100) parcelPts.push(xT(parcelT(a)).toFixed(1) + "," + yA(a).toFixed(1));

  const F = (window.L && window.L.flight) || {};
  const isIt = !!(window.L && window.L.tabs && window.L.tabs.now === "ORA");
  const unitT = (window.U && window.U.temp) || "°C";
  const titleTxt = isIt ? "CURVA DI STATO" : (F.sounding || "SOUNDING");

  // ---- hour scrubber label ----
  const pad2 = function (n) { return String(n).padStart(2, "0"); };
  const hourTxt = hasSeries ? (pad2(series.hours[idx]) + ":00") : "";
  const relTxt = hasSeries ? (idx === 0 ? (isIt ? "ORA" : "NOW") : "+" + idx + "h") : "";
  const step = function (d) { setHr(Math.max(0, Math.min(series.frames.length - 1, idx + d))); };
  const stepBtn = { background: "none", border: "1px solid var(--line)", borderRadius: 7, color: "var(--fg-dim)", width: 24, height: 22, lineHeight: 1, fontSize: 13, cursor: "pointer", flexShrink: 0, padding: 0 };

  // ---- legend rows: [label, color, dashed]  (color "shade" = filled BL swatch) ----
  const LEG = isIt
    ? [["AMBIENTE", "var(--fg)", false], ["RUGIADA", "var(--accent)", true], ["PARTICELLA", "#e6a23c", false], ["BASE NUBI", "var(--accent)", true], ["CIMA TERM.", "#e6a23c", true], ["STRATO CONV.", "shade", false]]
    : [["AMBIENT", "var(--fg)", false], ["DEWPOINT", "var(--accent)", true], ["PARCEL", "#e6a23c", false], ["CLOUD BASE", "var(--accent)", true], ["THERMAL TOP", "#e6a23c", true], ["CONV. LAYER", "shade", false]];

  return (
    <Panel pad={0} style={{ marginTop: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px 6px" }}>
        <Micro>{titleTxt}</Micro>
        <span className="mono" style={{ fontSize: 8, letterSpacing: "0.08em", color: "var(--fg-faint)" }}>{isIt ? "AMBIENTE · PARTICELLA" : "AMBIENT · PARCEL"}</span>
      </div>

      {/* hour scrubber — slide or step to watch the sounding evolve through the day */}
      {hasSeries && series.frames.length > 1 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 8px" }}>
          <button onClick={function () { step(-1); }} className="mono" style={stepBtn} aria-label="previous hour">‹</button>
          <input type="range" min={0} max={series.frames.length - 1} value={idx} step={1}
            onChange={function (e) { setHr(+e.target.value); }}
            style={{ flex: 1, accentColor: "var(--accent)", height: 18, cursor: "pointer" }} />
          <button onClick={function () { step(1); }} className="mono" style={stepBtn} aria-label="next hour">›</button>
          <span className="mono" style={{ flexShrink: 0, minWidth: 64, textAlign: "right", fontSize: 11, letterSpacing: "0.04em", color: "var(--fg)" }}>
            {hourTxt}<span style={{ color: "var(--accent)", marginLeft: 4 }}>{relTxt}</span>
          </span>
        </div>
      ) : null}

      <svg width="100%" viewBox={"0 0 " + W + " " + H} style={{ display: "block" }}>
        {/* convective (boundary) layer shading */}
        {_blTop > 0 ? <rect x={padL} y={yA(Math.min(_blTop, maxAlt))} width={W - padL - padR} height={yA(0) - yA(Math.min(_blTop, maxAlt))} fill="var(--accent)" opacity="0.07" /> : null}
        {/* altitude gridlines + labels */}
        {[0, 1000, 2000, 3000].map(function (a) {
          return (
            <g key={a}>
              <line x1={padL} y1={yA(a)} x2={W - padR} y2={yA(a)} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" />
              <text x={padL - 6} y={yA(a) + 3} textAnchor="end" fontFamily="'Geist Mono', monospace" fontSize="8" fill="var(--fg-faint)">{a === 0 ? "GND" : a / 1000 + "k"}</text>
            </g>
          );
        })}
        {/* faint dry-adiabat reference slopes (context for the parcel line) */}
        {[-6, 6, 12].map(function (off, i) {
          const x0 = xT(tSfc + off), y0 = yA(0);
          const x1 = xT(tSfc + off - DRY * maxAlt), y1 = yA(maxAlt);
          return <line key={"da" + i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--fg-faint)" strokeWidth="0.6" strokeDasharray="1 5" opacity="0.5" />;
        })}
        {/* cloud base / condensation level */}
        {lcl != null && lcl > 0 && lcl < maxAlt ? (
          <g>
            <line x1={padL} y1={yA(lcl)} x2={W - padR} y2={yA(lcl)} stroke="var(--accent)" strokeWidth="1.1" strokeDasharray="5 3" />
            <text x={W - padR} y={yA(lcl) - 3} textAnchor="end" fontFamily="'Geist Mono', monospace" fontSize="8" fill="var(--accent)">{(isIt ? "BASE" : "BASE") + " " + Math.round(lcl) + "m"}</text>
          </g>
        ) : null}
        {/* thermal top marker (parcel = ambient) */}
        {topA != null && topA > 0 && topA < maxAlt ? (
          <g>
            <line x1={padL} y1={yA(topA)} x2={W - padR} y2={yA(topA)} stroke="#e6a23c" strokeWidth="1" strokeDasharray="3 3" opacity="0.9" />
            <text x={padL + 2} y={yA(topA) - 3} textAnchor="start" fontFamily="'Geist Mono', monospace" fontSize="8" fill="#e6a23c">{(isIt ? "CIMA " : "TOP ") + Math.round(topA) + "m"}</text>
          </g>
        ) : null}
        {/* dewpoint (dashed) + environmental temp (solid) */}
        <polyline points={polyEnv(dews)} fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.8" />
        <polyline points={polyEnv(temps)} fill="none" stroke="var(--fg)" strokeWidth="1.6" />
        {temps.map(function (v, i) { return <rect key={i} x={xT(v) - 1.5} y={yA(alts[i]) - 1.5} width="3" height="3" fill="var(--fg)" />; })}
        {/* PARCEL ASCENT curve (the curva di stato reading line) */}
        <polyline points={parcelPts.join(" ")} fill="none" stroke="#e6a23c" strokeWidth="1.7" opacity="0.95" />
      </svg>

      {/* legend — what each line/level means */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 12px", padding: "4px 12px 11px" }}>
        {LEG.map(function (it, i) {
          const label = it[0], color = it[1], dash = it[2];
          return (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {color === "shade"
                ? <span style={{ width: 12, height: 8, background: "var(--accent)", opacity: 0.18, flexShrink: 0 }} />
                : <span style={{ width: 13, height: 0, flexShrink: 0, borderTop: "2px " + (dash ? "dashed" : "solid") + " " + color }} />}
              <span className="mono" style={{ fontSize: 7.5, letterSpacing: "0.06em", color: "var(--fg-dim)" }}>{label}</span>
            </span>
          );
        })}
        <span className="mono" style={{ marginLeft: "auto", fontSize: 7.5, letterSpacing: "0.06em", color: "var(--fg-faint)" }}>{unitT}</span>
      </div>
    </Panel>
  );
}
window.SoundingChart = SoundingChart;
