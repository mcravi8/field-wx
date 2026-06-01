/* ============================================================================
   FIELD WX · Calm restyle — ScreenSys override  [appearance + segmented controls]
   Replaces the vendored 2-way Dark/Light toggle with a 3-way Dark · Auto · Light
   segmented control bound to the appearance state (persisted to localStorage
   "fieldwx_appearance" in App). All segmented controls (language, appearance,
   units) use the restyled glass segmented style (section 6). Reuses the vendored
   Micro / Switch / L globals; shadows the vendored window.ScreenSys at runtime
   (same override mechanism as TopBar / HomeNow / ScreenSites).
   ============================================================================ */
/* Segmented control with a smoothly-sliding active pill + swipe/drag selection.
   Tap an option to pick it; or drag horizontally across the track — the pill follows the
   finger and snaps to the nearest option on release. The pill is one absolutely-positioned
   element that animates between slots (CSS transform transition) so switching glides. */
function Seg({ opts, val, set }) {
  const trackRef = React.useRef(null);
  const idx = Math.max(0, opts.findIndex(function (o) { return o[1] === val; }));
  const n = opts.length;
  const PAD = 4;                                  // track padding (matches the original)
  const dragState = React.useRef(null);
  const dS = useState(null); const drag = dS[0], setDrag = dS[1];   // {frac} while dragging, else null

  // slot width fraction (0..1) within the inner track; pill sits at slot i
  const slotFrac = function (i) { return n > 1 ? i / n : 0; };

  // pixel → which option slot a clientX lands on
  const slotAt = function (clientX) {
    const el = trackRef.current; if (!el) return idx;
    const r = el.getBoundingClientRect();
    const inner = r.width - PAD * 2;
    const x = Math.max(0, Math.min(inner, clientX - r.left - PAD));
    return Math.max(0, Math.min(n - 1, Math.floor(x / (inner / n))));
  };
  // pixel → continuous fraction (0..1) of the pill's LEFT, for finger-following
  const fracAt = function (clientX) {
    const el = trackRef.current; if (!el) return slotFrac(idx);
    const r = el.getBoundingClientRect();
    const inner = r.width - PAD * 2;
    const x = clientX - r.left - PAD - (inner / n) / 2;   // center the pill under the finger
    return Math.max(0, Math.min(1 - 1 / n, x / inner));
  };

  const onDown = function (e) {
    const t = (e.touches && e.touches[0]) || e;
    dragState.current = { startX: t.clientX, moved: false, id: e.pointerId };
    try { if (e.pointerId != null && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const onMove = function (e) {
    const ds = dragState.current; if (!ds) return;
    const t = (e.touches && e.touches[0]) || e;
    if (Math.abs(t.clientX - ds.startX) > 4) ds.moved = true;
    if (ds.moved) {
      if (e.cancelable) e.preventDefault();        // we own this horizontal gesture
      setDrag({ frac: fracAt(t.clientX) });
      const s = slotAt(t.clientX);
      if (opts[s] && opts[s][1] !== val) set(opts[s][1]);   // live update as you drag past a slot
    }
  };
  const onUp = function (e) {
    const ds = dragState.current; dragState.current = null;
    setDrag(null);
    if (!ds) return;
    const t = (e.changedTouches && e.changedTouches[0]) || e;
    if (ds.moved) { const s = slotAt(t.clientX); if (opts[s]) set(opts[s][1]); }
  };

  const pillFrac = drag ? drag.frac : slotFrac(idx);
  return (
    <div ref={trackRef}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{ position: "relative", display: "flex", gap: 0, padding: PAD, borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1px solid var(--hair)", touchAction: "pan-y", userSelect: "none", cursor: "pointer" }}>
      {/* sliding active pill */}
      <div className="wx-seg-pill" aria-hidden="true"
        style={{ position: "absolute", top: PAD, bottom: PAD, left: PAD, width: "calc((100% - " + (PAD * 2) + "px) / " + n + ")",
          transform: "translateX(" + (pillFrac * (n) * 100) + "%)",
          borderRadius: 10, transition: drag ? "none" : "transform 0.26s cubic-bezier(0.22,1,0.36,1)", pointerEvents: "none", zIndex: 0 }} />
      {opts.map(function (o, i) {
        const lbl = o[0], v = o[1], on = i === idx;
        return (
          <button key={String(v)} type="button" onClick={function () { if (!drag) set(v); }} className="mono"
            style={{ flex: 1, padding: "11px 0", border: "none", background: "none", cursor: "pointer", fontSize: 10, letterSpacing: "0.12em",
              position: "relative", zIndex: 1, fontWeight: on ? 600 : 400, color: on ? "var(--seg-on-fg)" : "var(--dim)", transition: "color 0.2s" }}>
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

function ScreenSys({ lang, onLang, appearance, onAppearance, view, onView, units, onUnits }) {
  const [toggles, setToggles] = useState({ severe: true, precip: true, daily: false, theme: true });
  const flip = (k) => setToggles((t) => Object.assign({}, t, { [k]: !t[k] }));
  const rows = [["severe", L.notif.severe], ["precip", L.notif.precip], ["daily", L.notif.daily], ["theme", L.notif.theme]];

  const seg = (opts, val, set) => <Seg opts={opts} val={val} set={set} />;

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
