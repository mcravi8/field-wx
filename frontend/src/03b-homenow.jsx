/* ============================================================================
   FIELD WX · HomeNow override  [WX_SITES_V2]
   Byte-identical to the vendored wx-home.jsx HomeNow EXCEPT the site-header label
   above the temperature, which was hardcoded to "IVREA" / "253 M · CANAVESE".
   It now reads m.trailhead / m.elev (stamped with the active site in App), so the
   NOW screen reflects the selected location. Helper components it uses (AlertBanner,
   StatusStrip, WindWidget, PressWidget, SunMoon, ParagliderToggle, Big, Code, Micro,
   Panel, Field, Compass, FlightSection, globals L/U/ALERTS) remain the vendored ones.
   Defined after the module in the concatenated inline script, so it shadows the
   global HomeNow at runtime (same override mechanism as TopBar/ScreenSites).
   ============================================================================ */
function HomeNow({ m, hourly, onNav, view, flight, onView }) {
  const grid12 = hourly.slice(0, 12);
  return (
    <div className="screen-scroll" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 2 }}>
      <div style={{ padding: "16px 16px 22px", display: "flex", flexDirection: "column" }}>
        <AlertBanner />
        {/* site header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 15, letterSpacing: "0.04em", color: "var(--fg)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.trailhead || "IVREA"}</span>
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--fg-faint)" }}>{m.elev || "253 M · CANAVESE"}</span>
        </div>

        {/* NOW block */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <Big size={88} style={{ letterSpacing: "-0.03em" }}>{m.temp}</Big>
            <span className="mono" style={{ fontSize: 30, color: "var(--fg-dim)", marginTop: 6 }}>°</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ParagliderToggle view={view} onView={onView} />
              <Code accent style={{ fontSize: 13, padding: "3px 8px" }}>{m.metar}</Code>
            </div>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--fg)" }}>{L.cond[m.key]}</span>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--fg-dim)" }}>{L.feels} {m.feels}°</span>
            <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-dim)" }}>H {m.hi}°</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>L {m.lo}°</span>
            </div>
          </div>
        </div>

        {view === "sport" && <FlightSection flight={flight} />}

        {/* hourly strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 9px" }}>
          <Micro>{L.next12}</Micro>
          <button onClick={() => onNav("hourly")} className="mono" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9.5, letterSpacing: "0.14em", color: "var(--accent)" }}>{L.full} ▸</button>
        </div>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--line)", overflowX: "auto" }} className="screen-scroll wx-box">
          {grid12.map((h, i) => (
            <div key={i} style={{ flex: "0 0 auto", width: 54, padding: "11px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, borderRight: i < grid12.length - 1 ? "1px solid var(--line)" : "none", background: i === 0 ? "var(--row-fill)" : "none" }}>
              <span className="mono" style={{ fontSize: 9, letterSpacing: "0.06em", color: i === 0 ? "var(--accent)" : "var(--fg-faint)" }}>{i === 0 ? L.now : h.label}</span>
              <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.04em", color: "var(--fg-dim)" }}>{h.code}</span>
              <span className="mono" style={{ fontSize: 15, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{h.temp}°</span>
              <div style={{ width: 18, height: 2, background: "var(--line)", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, width: `${h.precip}%`, background: "var(--accent)" }} />
              </div>
              <span className="mono" style={{ fontSize: 8.5, color: h.precip >= 50 ? "var(--accent)" : "var(--fg-faint)" }}>{h.precip}%</span>
            </div>
          ))}
        </div>

        {/* this week — inlined on the NOW screen (Calm layout); normal view only */}
        {view !== "sport" && Array.isArray(window.WEEK) && window.WEEK.length ? (
          <React.Fragment>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 9px" }}>
              <Micro>{L.sevenDay}</Micro>
              <span className="mono" style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--fg-faint)" }}>{(window.U && window.U.temp) || "°C"}</span>
            </div>
            <div className="wx-box" style={{ border: "1px solid var(--line)" }}>
              {window.WEEK.map((d, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "42px 44px 40px 26px 1fr 28px", gap: 9, alignItems: "center", padding: "12px 12px", borderBottom: i < window.WEEK.length - 1 ? "1px solid var(--line)" : "none", background: i === 0 ? "var(--row-fill)" : "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="mono" style={{ fontSize: 12, color: i === 0 ? "var(--accent)" : "var(--fg)", letterSpacing: "0.06em" }}>{(L.day && L.day[d.d]) || d.d}</span>
                    <span className="mono" style={{ fontSize: 8.5, color: "var(--fg-faint)" }}>{d.date}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-dim)" }}>{d.code}</span>
                  <span className="mono" style={{ fontSize: 10, color: d.precip >= 50 ? "var(--accent)" : "var(--fg-faint)" }}>{d.precip > 0 ? d.precip + "%" : ""}</span>
                  <span className="mono" style={{ fontSize: 12, color: "var(--fg-faint)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.lo}°</span>
                  <RangeBar span={d.span} accent={i === 0} />
                  <span className="mono" style={{ fontSize: 13, color: "var(--fg)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.hi}°</span>
                </div>
              ))}
            </div>
          </React.Fragment>
        ) : null}

        {/* widget grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
          <WindWidget m={m} />
          <Panel><Field label={L.precip2} value={m.precip} unit="%" sub={`${m.precipAmt.toFixed(1)} ${U.precip} ${L.expected}`} accent={m.precip >= 50} /></Panel>
          <Panel><Field label={L.uvIndex} value={m.uv} sub={L.uv[uvCat(m.uv)]} /></Panel>
          <Panel><Field label={L.airQuality} value={m.aqi} sub={`${L.aqiPrefix} · ${L.aqi[m.aqiCat]}`} /></Panel>
          <Panel><Field label={L.humidity} value={m.hum} unit="%" sub={`${L.dewPoint} ${m.dew}°`} /></Panel>
          <PressWidget m={m} />
          <Panel><Field label={L.visibility} value={m.vis} unit={U.vis} sub={m.vis >= 10 ? L.unlimited : L.reduced} /></Panel>
          <Panel><Field label={L.dewPoint} value={m.dew} unit={U.temp} sub={L.dew[dewKey(m.dew)]} /></Panel>
        </div>

        <div style={{ margin: "20px 0 9px" }}><Micro>{L.solarLunar}</Micro></div>
        <SunMoon />
      </div>
    </div>
  );
}

window.HomeNow = HomeNow;
