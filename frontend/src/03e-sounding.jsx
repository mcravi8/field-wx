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
   Keeps the original temp (solid) + dewpoint (dashed) curves, BL shading and styling.
   Overrides the vendored global SoundingChart at runtime (inline script runs last),
   same pattern as the TopBar / HomeNow / ScreenSites / Atmosphere overrides.
   Reference frame is AGL (alts[] are metres above ground, matching cbH/blTop).
   ============================================================================ */
function SoundingChart({ sounding, blTop, cbH, thermalTop, flight }) {
  if (!sounding || !Array.isArray(sounding.alts)) return null;
  const alts = sounding.alts, temps = sounding.temps, dews = sounding.dews;
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
  const lcl = (cbH != null && isFinite(+cbH) && +cbH > 0) ? +cbH : null;
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

  return (
    <Panel pad={0} style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px 6px" }}>
        <Micro>{titleTxt}</Micro>
        <span className="mono" style={{ fontSize: 8, letterSpacing: "0.08em", color: "var(--fg-faint)" }}>{isIt ? "AMBIENTE · PARTICELLA" : "AMBIENT · PARCEL"}</span>
      </div>
      <svg width="100%" viewBox={"0 0 " + W + " " + H} style={{ display: "block" }}>
        {/* convective (boundary) layer shading */}
        {blTop > 0 ? <rect x={padL} y={yA(Math.min(blTop, maxAlt))} width={W - padL - padR} height={yA(0) - yA(Math.min(blTop, maxAlt))} fill="var(--accent)" opacity="0.07" /> : null}
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
        {/* legend */}
        <text x={W - padR} y={H - 6} textAnchor="end" fontFamily="'Geist Mono', monospace" fontSize="7.5" fill="var(--fg-faint)">{(F.temp || "TEMP") + " ─  " + (F.dew || "DEW") + " ┄  " + (isIt ? "PART." : "PARCEL") + " ─ " + unitT}</text>
      </svg>
    </Panel>
  );
}
window.SoundingChart = SoundingChart;
