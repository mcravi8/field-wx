/* ============================================================================
   FIELD WX · Calm restyle — ScreenSys override  [appearance + segmented controls]
   Replaces the vendored 2-way Dark/Light toggle with a 3-way Dark · Auto · Light
   segmented control bound to the appearance state (persisted to localStorage
   "fieldwx_appearance" in App). All segmented controls (language, appearance,
   units) use the restyled glass segmented style (section 6). Reuses the vendored
   Micro / Switch / L globals; shadows the vendored window.ScreenSys at runtime
   (same override mechanism as TopBar / HomeNow / ScreenSites).
   ============================================================================ */
function ScreenSys({ lang, onLang, appearance, onAppearance, view, onView, units, onUnits }) {
  const [toggles, setToggles] = useState({ severe: true, precip: true, daily: false, theme: true });
  const flip = (k) => setToggles((t) => Object.assign({}, t, { [k]: !t[k] }));
  const rows = [["severe", L.notif.severe], ["precip", L.notif.precip], ["daily", L.notif.daily], ["theme", L.notif.theme]];

  // restyled segmented control (section 6): rounded glass track, white active pill
  const seg = (opts, val, set) => (
    <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1px solid var(--hair)" }}>
      {opts.map(([lbl, v]) => {
        const on = val === v;
        return (
          <button key={String(v)} onClick={() => set(v)} className="mono"
            style={{ flex: 1, padding: "11px 0", border: "none", cursor: "pointer", fontSize: 10, letterSpacing: "0.12em", borderRadius: 10,
              fontWeight: on ? 600 : 400, background: on ? "rgba(255,255,255,0.92)" : "none", color: on ? "#16181d" : "var(--dim)", transition: "background 0.14s, color 0.14s" }}>
            {lbl}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="screen-scroll" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 2 }}>
      <div style={{ padding: "16px 16px 22px" }}>
        <span style={{ fontSize: 15, letterSpacing: "0.04em", color: "var(--fg)", fontWeight: 600, display: "block", marginBottom: 16 }}>{L.system}</span>

        <Micro style={{ display: "block", marginBottom: 9 }}>{L.language}</Micro>
        <div style={{ marginBottom: 18 }}>{seg([["ENGLISH", "en"], ["ITALIANO", "it"]], lang, onLang)}</div>

        <Micro style={{ display: "block", marginBottom: 9 }}>{L.display} · {L.theme}</Micro>
        <div style={{ marginBottom: 18 }}>{seg([[L.dark, "dark"], [(L.auto || "AUTO"), "auto"], [L.light, "light"]], appearance, onAppearance)}</div>

        <Micro style={{ display: "block", marginBottom: 9 }}>{L.units}</Micro>
        <div style={{ marginBottom: 18 }}>{seg([["°F · MPH", "imperial"], ["°C · KM/H", "metric"]], units, onUnits)}</div>

        <Micro style={{ display: "block", marginBottom: 11 }}>{L.notifications}</Micro>
        <div className="wx-box" style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--line)", marginBottom: 18 }}>
          {rows.map(([k, lbl], i) => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 13px", borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--fg)" }}>{lbl}</span>
              <Switch on={toggles[k]} onClick={() => flip(k)} />
            </div>
          ))}
        </div>

        <Micro style={{ display: "block", marginBottom: 11 }}>{L.config}</Micro>
        <div className="wx-box" style={{ border: "1px solid var(--line)" }}>
          {[[L.cfg.dataSource, "NWS · GFS · HRRR"], [L.cfg.refresh, L.cfg.refreshVal], [L.cfg.mapLayers, L.cfg.mapVal], [L.cfg.about, "v2.4.0 · BUILD 1182"]].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px", borderBottom: i < 3 ? "1px solid var(--line)" : "none" }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--fg)" }}>{k}</span>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--fg-dim)" }}>{v} ▸</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.ScreenSys = ScreenSys;
