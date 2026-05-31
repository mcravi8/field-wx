const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#4f93e0",
  "mood": "OVERCAST",
  "atmosphere": true
}/*EDITMODE-END*/;

function ScenarioBar({ mood, onPick }) {
  const items = [["CLEAR", "CLR"], ["OVERCAST", "OVC"], ["RAIN", "RA"], ["SNOW", "SN"], ["BLIZZARD", "+SN"], ["NIGHT", "NGT"], ["STORM", "TS"]];
  return (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--line)", position: "relative", zIndex: 3, background: "var(--chrome2)" }}>
      <span className="mono" style={{ display: "flex", alignItems: "center", padding: "0 9px 0 14px", fontSize: 8, letterSpacing: "0.16em", color: "var(--fg-faint)", whiteSpace: "nowrap" }}>WX&nbsp;SIM</span>
      {items.map(([k, code]) => {
        const on = mood === k;
        return (
          <button key={k} title={k} onClick={() => onPick(k)} className="mono" style={{ flex: 1, padding: "7px 0", background: on ? "var(--accent)" : "none", border: "none", borderLeft: "1px solid var(--line)", color: on ? "#0a0a0a" : "var(--fg-dim)", fontSize: 9, letterSpacing: "0.08em", cursor: "pointer", fontWeight: on ? 700 : 400 }}>{code}</button>
        );
      })}
    </div>
  );
}

/* ===== FIELD WX · Windgram screen (altitude × hour wind field) ===== */
function wgColor(s) {
  if (s <= 20) return "#57c27d";
  if (s <= 35) return "#d8c43a";
  if (s <= 50) return "#e0913c";
  return "#d8503f";
}
function WgArrow({ deg, color, size }) {
  // points downwind — Open-Meteo direction is the FROM bearing, wind blows toward deg+180
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ display: "block", transform: `rotate(${deg + 180}deg)` }}>
      <line x1="7" y1="12.5" x2="7" y2="4.2" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 1.6 L3.7 6.4 L10.3 6.4 Z" fill={color} />
    </svg>
  );
}
function _mockWindgram(m) {
  const baseWind = (m && m.wind) || 12;
  const baseDir = (m && m.dirDeg != null) ? m.dirDeg : 315;
  const cur = new Date().getHours();
  const levels = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
  const hours = []; for (let h = 0; h < 24; h++) hours.push(h);
  const altFac = (a) => 1 + (a / 4000) * 2.0;
  const veerOf = (a) => (a / 4000) * 55;
  const grid = levels.map((a) => hours.map((h) => {
    const dn = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
    const morn = a >= 2000 ? (1 - dn) * 5 : 0;
    let spd = Math.round(baseWind * altFac(a) + Math.sin(h * 0.5 + a / 700) * 3 + morn);
    spd = Math.max(0, spd);
    const deg = (((baseDir + veerOf(a) + Math.sin(h * 0.4) * 10) % 360) + 360) % 360;
    return { speed: spd, dirDeg: Math.round(deg), dir: _degC8(deg) };
  }));
  return { levels, hours, current: cur, grid };
}
function WindgramScreen({ lat, lon, m }) {
  const [wg, setWg] = useState(null);
  const [mode, setMode] = useState("loading"); // loading | live | sim
  useEffect(() => {
    let alive = true;
    setMode("loading");
    WeatherAPI.getAltitude(lat, lon).then((r) => {
      if (!alive) return;
      if (r && r.windgram && Array.isArray(r.windgram.grid) && r.windgram.grid.length) { setWg(r.windgram); setMode("live"); }
      else { setWg(_mockWindgram(m)); setMode("sim"); }
    }).catch((e) => {
      if (!alive) return;
      console.warn("[FIELD WX] windgram live unavailable, sim fallback:", e.message);
      setWg(_mockWindgram(m)); setMode("sim");
    });
    return () => { alive = false; };
  }, [lat, lon]);

  if (!wg) {
    return (
      <div className="screen-scroll" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 2 }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "var(--fg-faint)" }}>SYNC…</span>
      </div>
    );
  }

  const display = wg.levels.slice().reverse(); // top -> surface
  const nH = wg.hours.length;
  const colW = 44, gutter = 50, rowH = 46, axisH = 26;
  const cur = wg.current;
  const altLabel = (a) => a === 0 ? "SFC" : (a >= 1000 ? (a / 1000).toFixed(1).replace(".0", "") + "k" : String(a));
  const cols = `repeat(${nH}, ${colW}px)`;

  return (
    <div className="screen-scroll" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 2 }}>
      <div style={{ padding: "16px 16px 22px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 15, letterSpacing: "0.04em", color: "var(--fg)", fontWeight: 600 }}>WINDGRAM</span>
          <span className="mono" style={{ fontSize: 9, letterSpacing: "0.12em", color: mode === "live" ? "var(--accent)" : "var(--fg-faint)" }}>{mode === "live" ? "● LIVE" : "○ SIM"} · KM/H</span>
        </div>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "var(--fg-faint)", marginBottom: 14 }}>WIND VECTOR · ALTITUDE × HOUR · IVREA</span>

        <div style={{ border: "1px solid var(--line)", background: "var(--panel-fill)" }}>
          <div style={{ display: "flex" }}>
            {/* altitude gutter */}
            <div style={{ flexShrink: 0, width: gutter, borderRight: "1px solid var(--line)" }}>
              <div style={{ height: axisH, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 7 }}>
                <span className="mono" style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--fg-faint)" }}>ALT</span>
              </div>
              {display.map((a) => (
                <div key={a} style={{ height: rowH, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 7, borderBottom: "1px solid var(--line)" }}>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: "0.02em", color: a === 0 ? "var(--fg-dim)" : "var(--fg-faint)" }}>{altLabel(a)}</span>
                </div>
              ))}
            </div>
            {/* scrollable wind field */}
            <div className="screen-scroll" style={{ overflowX: "auto", flex: 1 }}>
              <div style={{ width: colW * nH }}>
                {/* hour axis */}
                <div style={{ display: "grid", gridTemplateColumns: cols, height: axisH, borderBottom: "1px solid var(--line)" }}>
                  {wg.hours.map((h, hi) => (
                    <div key={hi} style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRight: hi < nH - 1 ? "1px solid var(--line)" : "none", background: hi === cur ? "var(--accent)" : "transparent" }}>
                      <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.02em", color: hi === cur ? "#0a0a0a" : "var(--fg-faint)", fontWeight: hi === cur ? 700 : 400 }}>{String(h).padStart(2, "0")}</span>
                    </div>
                  ))}
                </div>
                {/* grid rows (top -> surface) */}
                {display.map((a, ri) => {
                  const li = wg.levels.indexOf(a);
                  return (
                    <div key={a} style={{ display: "grid", gridTemplateColumns: cols, height: rowH, borderBottom: ri < display.length - 1 ? "1px solid var(--line)" : "none" }}>
                      {wg.grid[li].map((c, hi) => {
                        const col = wgColor(c.speed);
                        const isCur = hi === cur;
                        return (
                          <div key={hi} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, borderRight: hi < nH - 1 ? "1px solid var(--line)" : "none", background: isCur ? "var(--row-fill)" : "transparent", boxShadow: isCur ? "inset 1px 0 0 var(--accent), inset -1px 0 0 var(--accent)" : "none" }}>
                            <WgArrow deg={c.dirDeg} color={col} size={14} />
                            <span className="mono" style={{ fontSize: 10.5, lineHeight: 1, color: col, fontVariantNumeric: "tabular-nums", fontWeight: c.speed > 50 ? 700 : 500 }}>{c.speed}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* speed legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
            {[["≤20", "#57c27d"], ["20–35", "#d8c43a"], ["35–50", "#e0913c"], [">50", "#d8503f"]].map((e) => (
              <span key={e[0]} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, background: e[1], display: "inline-block" }} />
                <span className="mono" style={{ fontSize: 8.5, letterSpacing: "0.06em", color: "var(--fg-faint)" }}>{e[0]}</span>
              </span>
            ))}
          </div>
        </div>

        <p className="mono" style={{ fontSize: 9, lineHeight: 1.65, letterSpacing: "0.06em", color: "var(--fg-faint)", margin: "12px 4px 0", textTransform: "uppercase" }}>
          Arrows point downwind · accent column = current hour · scroll → for the full day · speed in km/h
        </p>
      </div>
    </div>
  );
}
function WxTabBar({ active, onNav }) {
  const tabs = [
    { id: "now", label: L.tabs.now },
    { id: "week", label: L.tabs.week },
    { id: "sites", label: L.tabs.sites },
    { id: "sys", label: L.tabs.sys },
  ];
  return (
    <div style={{ flexShrink: 0, height: 58, display: "flex", borderTop: "1px solid var(--line-strong)", position: "relative", zIndex: 3, background: "var(--chrome)", backdropFilter: "blur(8px)" }}>
      {tabs.map((tb) => {
        const on = tb.id === active;
        return (
          <button key={tb.id} onClick={() => onNav(tb.id)} style={{ flex: 1, background: "none", border: "none", borderTop: on ? "2px solid var(--accent)" : "2px solid transparent", marginTop: -1, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: 0 }}>
            <span style={{ width: 5, height: 5, background: on ? "var(--accent)" : "var(--fg-faint)", display: "block" }} />
            <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.14em", color: on ? "var(--fg)" : "var(--fg-faint)" }}>{tb.label}</span>
          </button>
        );
      })}
    </div>
  );
}
/* ===== end Windgram screen ===== */

/* ===== FIELD WX · TopoMap — Leaflet + OpenTopoMap base, weather points as circle markers =====
   Replaces the old canvas/SVG TempWindMap inside the Volo Libero (FlightSection) view.
   Leaflet is loaded from the CDN in <head> and captured as window.Leaflet (L.noConflict()),
   because the app already owns window.L for i18n. Data (map = flight.tempmap) is unchanged:
   { pts:[{name,lat,lon,t,primary}], lat0, lon0, wind, gust, dirDeg }. */
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
function _grabLeaflet() {
  if (window.Leaflet) return window.Leaflet;
  // head injection should have done this; restore if leaflet.js loaded but noConflict hasn't run
  if (window.L && window.L.tileLayer && window.L.noConflict) { window.Leaflet = window.L.noConflict(); return window.Leaflet; }
  return null;
}
function TopoMap({ map, height = 260 }) {
  const wrapRef = React.useRef(null);
  const mapRef = React.useRef(null);   // Leaflet map instance
  const layerRef = React.useRef(null); // marker LayerGroup
  const [ready, setReady] = React.useState(!!_grabLeaflet());

  // ensure Leaflet is present (head-injected; dynamic fallback keeps the component self-sufficient)
  React.useEffect(function () {
    if (_grabLeaflet()) { setReady(true); return; }
    let dead = false;
    const finish = function () { if (!dead) setReady(!!_grabLeaflet()); };
    if (!document.querySelector('link[data-leaflet]')) {
      const lk = document.createElement("link");
      lk.rel = "stylesheet"; lk.href = LEAFLET_CSS; lk.setAttribute("data-leaflet", "1");
      document.head.appendChild(lk);
    }
    let sc = document.querySelector('script[data-leaflet]');
    if (!sc) {
      sc = document.createElement("script");
      sc.src = LEAFLET_JS; sc.setAttribute("data-leaflet", "1");
      sc.onload = function () { _grabLeaflet(); finish(); };
      sc.onerror = finish;
      document.head.appendChild(sc);
    } else { sc.addEventListener("load", finish); if (_grabLeaflet()) finish(); }
    return function () { dead = true; };
  }, []);

  // init once + re-draw whenever the location (map) changes
  React.useEffect(function () {
    const LF = _grabLeaflet();
    if (!ready || !LF || !wrapRef.current || !map) return;
    const lat0 = +map.lat0, lon0 = +map.lon0;
    const haveCenter = isFinite(lat0) && isFinite(lon0);

    if (!mapRef.current) {
      const m = LF.map(wrapRef.current, { zoomControl: true, attributionControl: true });
      LF.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: 13,
        attribution: "Map data: © OpenStreetMap contributors, SRTM | Style: © OpenTopoMap (CC-BY-SA)",
      }).addTo(m);
      layerRef.current = LF.layerGroup().addTo(m);
      mapRef.current = m;
      m.setView(haveCenter ? [lat0, lon0] : [45.4677, 7.8772], 10);
    }
    const m = mapRef.current, lg = layerRef.current;
    if (haveCenter) m.setView([lat0, lon0], 10);     // re-center on location change

    lg.clearLayers();
    const accent = ((getComputedStyle(document.documentElement).getPropertyValue("--accent") || "").trim()) || "#4f93e0";
    const windU = (window.U && window.U.wind) || "KM/H";
    const windStr = (map.wind != null ? Math.round(map.wind) : "—") + " " + windU + " " + _degC8(map.dirDeg);
    (map.pts || []).forEach(function (p) {
      const la = +p.lat, lo = +p.lon;
      if (!isFinite(la) || !isFinite(lo)) return;
      const rgb = (window.tempColor ? window.tempColor(p.t) : [120, 120, 120]);
      const fill = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
      const opts = p.primary
        ? { radius: 9, color: "#ffffff", weight: 2, fillColor: accent, fillOpacity: 1 }
        : { radius: 6, color: "rgba(0,0,0,0.55)", weight: 1.5, fillColor: fill, fillOpacity: 0.95 };
      LF.circleMarker([la, lo], opts)
        .bindPopup("<b>" + p.name + (p.primary ? " · CURRENT" : "") + "</b><br>" + p.t + "° · " + windStr, { className: "wx-topo-popup" })
        .addTo(lg);
    });
    // panel mounts inside an animated screen — settle Leaflet's size after layout
    [0, 220, 460].forEach(function (d) { setTimeout(function () { try { m.invalidateSize(); } catch (e) {} }, d); });
  }, [ready, map]);

  // tear down the Leaflet instance on unmount (frees the container's _leaflet_id)
  React.useEffect(function () {
    return function () {
      if (mapRef.current) { try { mapRef.current.remove(); } catch (e) {} mapRef.current = null; layerRef.current = null; }
    };
  }, []);

  return (
    <Panel pad={0} style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px 8px", borderBottom: "1px solid var(--line)" }}>
        <Micro>{L.flight.tempMap}</Micro>
        <span className="mono" style={{ fontSize: 8.5, letterSpacing: "0.1em", color: "var(--fg-faint)" }}>{L.flight.mapNote}</span>
      </div>
      <div id="topo-map" ref={wrapRef} style={{ width: "100%", height: height, background: "var(--row-fill)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "8px 12px", borderTop: "1px solid var(--line)" }}>
        <span className="mono" style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--fg-faint)", marginRight: 7 }}>10°</span>
        <div style={{ display: "flex", flex: 1, height: 6 }}>
          {[10, 13, 17, 20, 23, 27, 30].map(function (t) { const c = window.tempColor ? window.tempColor(t) : [120, 120, 120]; return <div key={t} style={{ flex: 1, background: "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")" }} />; })}
        </div>
        <span className="mono" style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--fg-faint)", marginLeft: 7 }}>30°C</span>
      </div>
    </Panel>
  );
}

/* Override the vendored FlightSection (Volo Libero view): identical layout, but the
   temp/wind map panel is now the Leaflet TopoMap. All sibling panels are the global
   vendored components (resolved by bare name, same as the original). */
function FlightSection({ flight }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: "9px solid var(--accent)" }} />
        <Micro style={{ color: "var(--fg)", letterSpacing: "0.2em" }}>{L.flight.title}</Micro>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <FlyStrip flight={flight} />
      <WindAloft flight={flight} />
      <Windgram wg={flight.windgram} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <ThermalsPanel flight={flight} />
        <CeilingPanel flight={flight} />
      </div>
      <ShearPanel flight={flight} />
      <TopoMap map={flight.tempmap} />
      <SoundingChart sounding={flight.sounding} blTop={flight.blTop} cbH={flight.cbH} />
      <LocalFlow flight={flight} />
    </div>
  );
}


