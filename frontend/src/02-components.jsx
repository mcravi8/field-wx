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

/* ===== FIELD WX · TopoMap — interactive Leaflet map + live temperature heat overlay + wind flow =====
   Pan/zoomable OpenTopoMap base. On top: a canvas overlay painting an IDW temperature field from the REAL
   Open-Meteo grid (map.grid = [{lat,lon,t,wind,dirDeg,elev}]), re-projected on every move/zoom so it stays
   geographically aligned; animated wind streaks advected by the local grid wind; and a few spaced major-town
   labels (map.pts). Leaflet is loaded from the CDN and captured as window.Leaflet (app owns window.L for i18n). */
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
function _grabLeaflet() {
  if (window.Leaflet) return window.Leaflet;
  if (window.L && window.L.tileLayer && window.L.noConflict) { window.Leaflet = window.L.noConflict(); return window.Leaflet; }
  return null;
}
// IDW temperature at geographic (la,lo) from the grid; weight by inverse-square distance in km.
function _idwTemp(grid, la, lo, cosLat) {
  let num = 0, den = 0;
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i];
    const dN = (g.lat - la) * 111.32, dE = (g.lon - lo) * 111.32 * cosLat;
    const d2 = dN * dN + dE * dE + 0.5;
    const w = 1 / (d2 * d2);
    num += g.t * w; den += w;
  }
  return den ? num / den : 0;
}
function TopoMap({ map, height = 280 }) {
  const wrapRef = React.useRef(null);
  const mapRef = React.useRef(null);     // Leaflet map instance
  const heatRef = React.useRef(null);    // canvas for the temperature field
  const flowRef = React.useRef(null);    // canvas for wind streaks
  const markerRef = React.useRef(null);  // marker LayerGroup
  const rafRef = React.useRef(0);
  const dataRef = React.useRef(map);
  const [ready, setReady] = React.useState(!!_grabLeaflet());
  // Only the live data layer emits the grid/bounds shape this map needs. SIM/mock mode and the
  // initial pre-fetch render pass the old genTempMap shape (pts with x/y, no grid) — guard against it
  // so a missing grid/center degrades to a placeholder instead of throwing inside Leaflet.
  const usable = !!(map && Array.isArray(map.grid) && map.grid.length &&
    isFinite(+map.lat0) && isFinite(+map.lon0) && map.bounds);
  dataRef.current = usable ? map : null;

  // ensure Leaflet present (head/CDN; dynamic fallback keeps the component self-sufficient)
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

  // init the map once
  React.useEffect(function () {
    const LF = _grabLeaflet();
    if (!ready || !usable || !LF || !wrapRef.current || mapRef.current) return;
    const m = LF.map(wrapRef.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
    LF.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 15, attribution: "© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)",
    }).addTo(m);

    // a Leaflet "overlay pane" canvas pair (heat under markers, flow above heat)
    const pane = m.getPanes().overlayPane;
    const mkCanvas = function (z) { const c = document.createElement("canvas"); c.style.position = "absolute"; c.style.pointerEvents = "none"; c.style.zIndex = z; pane.appendChild(c); return c; };
    heatRef.current = mkCanvas(1);
    flowRef.current = mkCanvas(2);
    markerRef.current = LF.layerGroup().addTo(m);
    mapRef.current = m;

    const redraw = function () { _paintHeat(); };
    m.on("move zoom resize viewreset", redraw);
    setTimeout(function () { try { m.invalidateSize(); } catch (e) {} _fit(); _paintHeat(); }, 60);
    [220, 480].forEach(function (d) { setTimeout(function () { try { m.invalidateSize(); } catch (e) {} _paintHeat(); }, d); });

    // size+position both canvases to the current map viewport, in layer (pane) coordinates
    function syncCanvas(cv) {
      const sz = m.getSize();
      const tl = m.containerPointToLayerPoint([0, 0]);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = sz.x * dpr; cv.height = sz.y * dpr;
      cv.style.width = sz.x + "px"; cv.style.height = sz.y + "px";
      LF.DomUtil.setPosition(cv, tl);
      const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: ctx, w: sz.x, h: sz.y };
    }
    // paint the IDW temperature field over the visible map, sampled on a coarse grid then smoothed
    function _paintHeat() {
      const d = dataRef.current; if (!d || !d.grid || !d.grid.length) return;
      const cv = heatRef.current; if (!cv) return;
      const { ctx, w, h } = syncCanvas(cv);
      const cols = 64, rows = Math.max(8, Math.round(64 * h / Math.max(1, w)));
      const off = document.createElement("canvas"); off.width = cols; off.height = rows;
      const octx = off.getContext("2d"); const img = octx.createImageData(cols, rows);
      const cosLat = Math.cos((d.lat0 || 45) * Math.PI / 180);
      const tc = window.tempColor || function () { return [120, 120, 120]; };
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const pt = m.containerPointToLatLng([x / (cols - 1) * w, y / (rows - 1) * h]);
          const rgb = tc(_idwTemp(d.grid, pt.lat, pt.lng, cosLat));
          const o = (y * cols + x) * 4;
          img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 150; // ~0.59 alpha so tiles read through
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(off, 0, 0, cols, rows, 0, 0, w, h);
    }
    mapRef.current._paintHeat = _paintHeat;
    mapRef.current._syncCanvas = syncCanvas;

    // animated wind streaks: advected by the grid wind nearest each particle (real direction/speed)
    const parts = [];
    function _animate() {
      const d = dataRef.current, cv = flowRef.current, mm = mapRef.current;
      if (!d || !cv || !mm) { rafRef.current = requestAnimationFrame(_animate); return; }
      const sz = mm.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== sz.x * dpr || cv.height !== sz.y * dpr) { mm._syncCanvas(cv); }
      else { LF.DomUtil.setPosition(cv, mm.containerPointToLayerPoint([0, 0])); }
      const ctx = cv.getContext("2d"); const w = sz.x, h = sz.y;
      const want = Math.round(Math.min(170, Math.max(50, w * h / 5200)));
      const cosLat = Math.cos((d.lat0 || 45) * Math.PI / 180);
      const windAt = function (cx, cy) {
        const ll = mm.containerPointToLatLng([cx, cy]);
        let best = d.grid[0], bd = 1e9;
        for (let i = 0; i < d.grid.length; i++) { const g = d.grid[i]; const dd = (g.lat - ll.lat) * (g.lat - ll.lat) + (g.lon - ll.lng) * (g.lon - ll.lng); if (dd < bd) { bd = dd; best = g; } }
        return best;
      };
      const spawn = function (p) { p.x = Math.random() * w; p.y = Math.random() * h; p.life = 40 + Math.random() * 60; p.age = Math.random() * p.life; };
      while (parts.length < want) { const p = {}; spawn(p); parts.push(p); }
      if (parts.length > want) parts.length = want;
      ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over"; ctx.lineWidth = 1.1; ctx.lineCap = "round";
      for (const p of parts) {
        const g = windAt(p.x, p.y);
        const toward = (g.dirDeg + 180) * Math.PI / 180;     // dirDeg = where wind comes FROM
        const spd = 0.3 + Math.min(g.wind, 60) * 0.05;
        const px = p.x, py = p.y;
        p.x += Math.sin(toward) * spd * 4; p.y += -Math.cos(toward) * spd * 4; p.age++;
        if (p.age > p.life || p.x < -4 || p.x > w + 4 || p.y < -4 || p.y > h + 4) { spawn(p); continue; }
        const a = Math.sin((p.age / p.life) * Math.PI) * 0.55;
        ctx.strokeStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(_animate);
    }
    rafRef.current = requestAnimationFrame(_animate);

    function _fit() {
      const d = dataRef.current; if (!d) return;
      if (d.bounds) { m.fitBounds([[d.bounds.south, d.bounds.west], [d.bounds.north, d.bounds.east]], { padding: [6, 6] }); }
      else if (isFinite(+d.lat0) && isFinite(+d.lon0)) { m.setView([+d.lat0, +d.lon0], 11); }
    }
    mapRef.current._fit = _fit;
  }, [ready, usable]);

  // re-fit + redraw + refresh town markers whenever the location (map) changes
  React.useEffect(function () {
    const m = mapRef.current; if (!m || !usable) return;
    if (m._fit) m._fit();
    if (m._paintHeat) m._paintHeat();
    const LF = _grabLeaflet(), lg = markerRef.current;
    if (LF && lg) {
      lg.clearLayers();
      const accent = ((getComputedStyle(document.documentElement).getPropertyValue("--accent") || "").trim()) || "#4f93e0";
      const windU = (window.U && window.U.wind) || "KM/H";
      const tempU = (window.U && window.U.temp) || "°C";
      (map.pts || []).forEach(function (p) {
        if (!isFinite(+p.lat) || !isFinite(+p.lon)) return;
        const html = '<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font:600 10px/1 Geist,system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 2px rgba(0,0,0,.9)">' +
          '<span style="width:' + (p.primary ? 8 : 6) + 'px;height:' + (p.primary ? 8 : 6) + 'px;background:' + (p.primary ? accent : "rgba(255,255,255,.92)") + ';border:' + (p.primary ? "1.5px solid #fff" : "1px solid rgba(0,0,0,.5)") + ';box-shadow:0 0 0 1px rgba(0,0,0,.4)"></span>' +
          (p.primary ? "" : '<span>' + p.name + '</span>') + '<b style="font-variant-numeric:tabular-nums">' + p.t + "°</b></span>";
        const icon = LF.divIcon({ className: "wx-town", html: html, iconSize: null, iconAnchor: [4, 4] });
        LF.marker([+p.lat, +p.lon], { icon: icon, interactive: false, keyboard: false }).addTo(lg);
      });
      const cur = (map.pts || []).find(function (p) { return p.primary; });
      if (cur) LF.marker([+cur.lat, +cur.lon], { icon: LF.divIcon({ className: "wx-town", iconSize: null, iconAnchor: [4, 4], html: '<b style="font:700 11px/1 Geist,system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9)">' + cur.t + "°</b>" }), interactive: false }).addTo(lg);
    }
  }, [map]);

  // teardown
  React.useEffect(function () {
    return function () {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (mapRef.current) { try { mapRef.current.remove(); } catch (e) {} mapRef.current = null; }
    };
  }, []);

  const legend = [10, 13, 17, 20, 23, 27, 30];
  const tc = window.tempColor || function () { return [120, 120, 120]; };
  return (
    <Panel pad={0} style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px 8px", borderBottom: "1px solid var(--line)" }}>
        <Micro>{L.flight.tempMap}</Micro>
        <span className="mono" style={{ fontSize: 8.5, letterSpacing: "0.1em", color: "var(--fg-faint)" }}>{L.flight.mapNote}</span>
      </div>
      {usable
        ? <div ref={wrapRef} style={{ width: "100%", height: height, background: "var(--row-fill)" }} />
        : <div style={{ width: "100%", height: height, background: "var(--row-fill)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--fg-faint)" }}>SYNC…</span>
          </div>}
      <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "8px 12px", borderTop: "1px solid var(--line)" }}>
        <span className="mono" style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--fg-faint)", marginRight: 7 }}>10°</span>
        <div style={{ display: "flex", flex: 1, height: 6 }}>
          {legend.map(function (t) { const c = tc(t); return <div key={t} style={{ flex: 1, background: "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")" }} />; })}
        </div>
        <span className="mono" style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--fg-faint)", marginLeft: 7 }}>30°C</span>
      </div>
    </Panel>
  );
}

/* Override the vendored FlightSection (Volo Libero view): identical layout, but the
   temp/wind map panel is the interactive TopoMap. Sibling panels are the vendored globals. */
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


