/* ============================================================================
   FIELD WX · Sites screen v2 — fully interactive  [WX_SITES_V2]
   localStorage-persisted list, geocode-add, swipe/long-press delete,
   pointer drag-to-reorder, tap-to-view (fresh fetch), active-site indicator.
   ============================================================================ */
function wxFmtCoord(lat, lon) {
  var a = Math.abs(Number(lat)).toFixed(4), b = Math.abs(Number(lon)).toFixed(4);
  return a + "°" + (Number(lat) >= 0 ? "N" : "S") + " " + b + "°" + (Number(lon) >= 0 ? "E" : "W");
}
// Site names are stored UPPER-CASE; render them Title Case for the Calm UI ("IVREA"→"Ivrea",
// "MT HOOD"→"Mt Hood"). Hyphens/apostrophes handled so "CHAMONIX-MONT-BLANC" reads naturally.
function wxTitleCase(s) {
  return String(s || "").toLowerCase().replace(/(^|[\s\-'·/])([a-z])/g, function (m, sep, ch) { return sep + ch.toUpperCase(); });
}
var WX_DEFAULT_SITE = { id: "ivrea", name: "IVREA", lat: 45.4677, lon: 7.8772, elevation: 253, region: "Canavese · IT" };
function wxLoadSites() {
  try {
    var rawv = localStorage.getItem("wx-sites");
    if (rawv) {
      var arr = JSON.parse(rawv);
      if (Array.isArray(arr)) {
        var clean = arr.filter(function (s) { return s && s.id && isFinite(s.lat) && isFinite(s.lon); });
        if (clean.length) return clean;
      }
    }
  } catch (e) {}
  return [WX_DEFAULT_SITE];
}

function TopBar(props) {
  var name = props.name, coord = props.coord, code = props.code, night = props.night;
  var label = name || props.site || "";
  return (
    <div style={{ flexShrink: 0, padding: "13px 16px 9px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)", position: "relative", zIndex: 3 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        {label ? <span style={{ fontSize: 12.5, letterSpacing: "0.06em", color: "var(--fg)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span> : null}
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "var(--fg-dim)" }}>{coord}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {night ? <span className="mono" style={{ fontSize: 8.5, letterSpacing: "0.14em", color: "var(--fg-dim)" }}>{code} {"·"} {(window.L && window.L.nightTag) || "NIGHT"}</span> : null}
        <span className="mono" style={{ fontSize: 8.5, letterSpacing: "0.12em", color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 5, background: "var(--accent)", display: "inline-block" }} />GPS
        </span>
      </div>
    </div>
  );
}

function ScreenSites(props) {
  var sites = props.sites || [];
  var activeId = props.activeId;
  var onSelect = props.onSelect, onAdd = props.onAdd, onDelete = props.onDelete, onReorder = props.onReorder;
  var LS = (window.L) || {};
  var T = function (k, d) { return (typeof LS[k] === "string") ? LS[k] : d; };
  // Calm-mockup labels bypass the all-caps i18n (which has tracked:"TRACKED" etc.) and pick EN/IT directly.
  var _it = (window.__wxLang === "it") || (LS && LS.tabs && LS.tabs.now === "ORA");
  var C = function (en, it) { return _it ? it : en; };

  var qS = useState(""); var q = qS[0], setQ = qS[1];
  var rS = useState(null); var results = rS[0], setResults = rS[1];     // null=idle, []=none, [..]=hits
  var bS = useState(false); var busy = bS[0], setBusy = bS[1];
  var eS = useState(null); var serr = eS[0], setSerr = eS[1];
  var seqRef = React.useRef(0);

  var rvS = useState(null); var reveal = rvS[0], setReveal = rvS[1];     // id with delete revealed
  var swS = useState({}); var swipe = swS[0], setSwipe = swS[1];         // id -> px (negative)
  var dgS = useState(null); var dragId = dgS[0], setDragId = dgS[1];
  var orS = useState(null); var order = orS[0], setOrder = orS[1];       // preview order (ids) while dragging

  var touchRef = React.useRef(null);
  var lpRef = React.useRef(null);
  var listRef = React.useRef(null);
  var movedRef = React.useRef(false);

  // preview each saved site's current temperature — ONE bulk Open-Meteo call; refetch when the
  // site list or unit system changes; a request id drops superseded responses
  var tpS = useState({}); var temps = tpS[0], setTemps = tpS[1];
  var tempSeqRef = React.useRef(0);
  var siteKey = sites.map(function (s) { return s.id; }).sort().join(",");   // order-independent: reordering ≠ refetch
  var sysPref = (props.units === "imperial") ? "imperial" : "metric";        // React-tracked unit (not global window.U)
  React.useEffect(function () {
    if (typeof WeatherAPI === "undefined" || !WeatherAPI || !WeatherAPI.currentForSites || !sites.length) return;
    var seq = ++tempSeqRef.current;
    WeatherAPI.currentForSites(sites, sysPref).then(function (mp) {
      if (seq !== tempSeqRef.current) return;
      setTemps(mp || {});
    }).catch(function (e) { try { console.warn("[FIELD WX] site temps unavailable:", e && e.message); } catch (_) {} });
  }, [siteKey, sysPref]);

  var clearLP = function () { if (lpRef.current) { clearTimeout(lpRef.current); lpRef.current = null; } };

  var runSearch = function (ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var query = (q || "").trim();
    if (!query) { setResults(null); setSerr(null); return; }
    var seq = ++seqRef.current;
    setBusy(true); setSerr(null);
    var url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(query) + "&count=5&language=en&format=json";
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      if (seq !== seqRef.current) return;
      setResults(Array.isArray(data.results) ? data.results : []); setBusy(false);
    }).catch(function () {
      if (seq !== seqRef.current) return;
      setSerr(T("searchFail", "Search failed — check connection")); setResults([]); setBusy(false);
    });
  };

  var addResult = function (r) {
    var id = (r.id != null ? "g" + r.id : "s" + Math.round((+r.latitude || 0) * 1e4) + "_" + Math.round((+r.longitude || 0) * 1e4));
    var region = [r.admin1, (r.country_code || r.country)].filter(Boolean).join(" · ");
    var site = {
      id: id, name: String(r.name || "SITE").toUpperCase(),
      lat: +r.latitude, lon: +r.longitude,
      elevation: (r.elevation != null && isFinite(+r.elevation)) ? Math.round(+r.elevation) : null,
      region: region
    };
    if (onAdd) onAdd(site);
    setQ(""); setResults(null); setSerr(null);
  };

  var doDelete = function (id) {
    if (sites.length <= 1) return;
    setReveal(null); setSwipe({});
    if (onDelete) onDelete(id);
  };

  var tapCard = function (id) {
    if (dragId) return;
    if (movedRef.current) { movedRef.current = false; return; }
    if (reveal) { setReveal(null); setSwipe({}); return; }
    if (onSelect) onSelect(id);
  };

  // long-press (pointer => mouse + touch)
  var onPointerDownCard = function (ev, id) {
    movedRef.current = false;
    touchRef.current = { x: ev.clientX, y: ev.clientY };
    clearLP();
    lpRef.current = setTimeout(function () { setReveal(id); setSwipe({}); }, 550);
  };
  var onPointerMoveCard = function (ev) {
    var t = touchRef.current; if (!t) return;
    if (Math.abs(ev.clientX - t.x) > 8 || Math.abs(ev.clientY - t.y) > 8) { movedRef.current = true; clearLP(); }
  };
  var onPointerUpCard = function () { clearLP(); };

  // swipe-left to delete (touch)
  var onTouchStartCard = function (ev, id) {
    if (dragId) return;
    var t = ev.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, id: id };
  };
  var onTouchMoveCard = function (ev, id) {
    var t = touchRef.current; if (!t || t.id !== id) return;
    var dx = ev.touches[0].clientX - t.x, dy = ev.touches[0].clientY - t.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { movedRef.current = true; clearLP(); }
    if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
      var nx = {}; for (var k in swipe) nx[k] = swipe[k];
      nx[id] = Math.max(dx, -88); setSwipe(nx);
    }
  };
  var onTouchEndCard = function (id) {
    clearLP();
    var dx = swipe[id] || 0;
    if (dx < -44) { setReveal(id); var a = {}; for (var k in swipe) a[k] = swipe[k]; a[id] = -76; setSwipe(a); }
    else { setReveal(function (r) { return r === id ? null : r; }); var b = {}; for (var k2 in swipe) b[k2] = swipe[k2]; b[id] = 0; setSwipe(b); }
  };

  // pointer drag-to-reorder (handle)
  var orderIds = function () { return (order && order.length) ? order : sites.map(function (s) { return s.id; }); };
  var byId = function (id) { for (var i = 0; i < sites.length; i++) if (sites[i].id === id) return sites[i]; return null; };
  var computeOrder = function (clientY) {
    var cur = orderIds();
    var el = listRef.current; if (!el) return cur;
    var kids = Array.prototype.slice.call(el.children);
    var target = cur.length - 1;
    for (var i = 0; i < kids.length; i++) {
      var rc = kids[i].getBoundingClientRect();
      if (clientY < rc.top + rc.height / 2) { target = i; break; }
    }
    var without = cur.filter(function (x) { return x !== dragId; });
    without.splice(target, 0, dragId);
    return without;
  };
  var onHandleDown = function (ev, id) {
    if (ev.stopPropagation) ev.stopPropagation();
    if (ev.preventDefault) ev.preventDefault();
    setReveal(null); setSwipe({});
    setDragId(id); setOrder(sites.map(function (s) { return s.id; }));
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (e) {}
  };
  var onHandleMove = function (ev) {
    if (!dragId) return;
    if (ev.preventDefault) ev.preventDefault();
    setOrder(computeOrder(ev.clientY));
  };
  var onHandleUp = function () {
    if (!dragId) return;
    var next = orderIds().map(byId).filter(Boolean);
    setDragId(null); setOrder(null);
    var changed = next.length === sites.length && next.some(function (s, i) { return s.id !== sites[i].id; });
    if (changed && onReorder) onReorder(next);
  };

  var display = (dragId && order) ? order.map(byId).filter(Boolean) : sites;

  var Handle = function (id) {
    return (
      <span onPointerDown={function (e) { onHandleDown(e, id); }} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
        title={T("dragReorder", "Drag to reorder")}
        style={{ touchAction: "none", cursor: "grab", padding: "8px 8px 8px 2px", marginLeft: -2, display: "flex", flexDirection: "column", gap: 3, alignSelf: "center", flexShrink: 0 }}>
        <span style={{ width: 13, height: 1.5, background: "var(--fg-faint)" }} />
        <span style={{ width: 13, height: 1.5, background: "var(--fg-faint)" }} />
        <span style={{ width: 13, height: 1.5, background: "var(--fg-faint)" }} />
      </span>
    );
  };
  var Tag = function (txt, kind) {
    var col = kind === "active" ? "var(--accent)" : "var(--fg-dim)";
    return <span className="mono" style={{ fontSize: 7.5, letterSpacing: "0.14em", color: col, border: "1px solid " + col, padding: "1px 4px", lineHeight: 1.4 }}>{txt}</span>;
  };

  return (
    <div className="screen-scroll" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 2 }}>
      <div style={{ padding: "16px 16px 28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 22, letterSpacing: "0.01em", color: "var(--fg)", fontWeight: 600 }}>{C("Sites", "Siti")}</span>
          <span style={{ fontSize: 12, letterSpacing: "0.01em", color: "var(--fg-faint)" }}>{sites.length} {C("tracked", "monitorati")}</span>
        </div>

        <form onSubmit={runSearch} style={{ display: "flex", alignItems: "center", gap: 9, borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1px solid var(--hair)", padding: "11px 13px", marginBottom: 10 }}>
          {/* magnifying-glass icon */}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--fg-faint)" strokeWidth="1.6" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="4.5" /><line x1="10.5" y1="10.5" x2="14" y2="14" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={function (e) { setQ(e.target.value); }}
            placeholder={C("Search for a place…", "Cerca un luogo…")}
            /* 16px so iOS Safari doesn't auto-zoom the page when the field is focused (it zooms any input < 16px). */
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--fg)", fontSize: 16, letterSpacing: "0.01em" }} />
          {busy
            ? <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>{"…"}</span>
            : (q ? <button type="submit" style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>{T("go", "Go")}</button> : null)}
        </form>

        {results != null ? (
          <div className="wx-box" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, border: "1px solid var(--line)", padding: 8 }}>
            {serr ? <span style={{ fontSize: 12, color: "var(--fg-dim)", padding: 4 }}>{serr}</span> : null}
            {(!serr && results.length === 0) ? <span style={{ fontSize: 12, color: "var(--fg-dim)", padding: 4 }}>{C("No matches", "Nessun risultato")}</span> : null}
            {results.map(function (r, ri) {
              var sub = [r.admin1, r.country].filter(Boolean).join(" · ");
              return (
                <button key={ri} onClick={function () { addResult(r); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--row-fill)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: "var(--fg)", fontWeight: 600, letterSpacing: "0.01em" }}>{r.name}</span>
                    <span style={{ fontSize: 11, color: "var(--fg-faint)", letterSpacing: "0.01em" }}>{sub}{r.elevation != null ? " · " + Math.round(r.elevation) + " m" : ""}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-dim)", flexShrink: 0 }}>{wxFmtCoord(r.latitude, r.longitude)}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {display.map(function (s, idx) {
            var isDefault = idx === 0;
            var isActive = s.id === activeId;
            var dx = swipe[s.id] || 0;
            var dragging = dragId === s.id;
            var canDelete = sites.length > 1;
            var open = reveal === s.id;
            // effective translate: follow an active swipe, else slide open on long-press reveal
            var tx = dx !== 0 ? dx : (open ? -76 : 0);
            return (
              <div key={s.id} style={{ position: "relative", overflow: "hidden", borderRadius: 18, background: "transparent", opacity: (dragId && !dragging) ? 0.55 : 1 }}>
                {(open || dx < 0) ? (
                <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end", alignItems: "stretch", borderRadius: 18, overflow: "hidden" }}>
                  <button onClick={function () { doDelete(s.id); }} disabled={!canDelete}
                    style={{ width: 84, border: "none", background: canDelete ? "#c2453f" : "var(--line)", color: canDelete ? "#fff" : "var(--fg-faint)", fontSize: 12, letterSpacing: "0.01em", cursor: canDelete ? "pointer" : "default" }}>
                    {canDelete ? C("Delete", "Elimina") : C("Last", "Ultimo")}
                  </button>
                </div>
                ) : null}
                <div
                  className="wx-glass"
                  onClick={function () { tapCard(s.id); }}
                  onPointerDown={function (e) { onPointerDownCard(e, s.id); }}
                  onPointerMove={onPointerMoveCard} onPointerUp={onPointerUpCard} onPointerLeave={onPointerUpCard}
                  onTouchStart={function (e) { onTouchStartCard(e, s.id); }}
                  onTouchMove={function (e) { onTouchMoveCard(e, s.id); }}
                  onTouchEnd={function () { onTouchEndCard(s.id); }}
                  style={{
                    position: "relative", transform: "translateX(" + tx + "px)",
                    transition: dragging ? "none" : "transform 0.18s ease",
                    border: "1px solid " + (isActive ? "var(--accent)" : "var(--card-line)"),
                    boxShadow: isActive ? "inset 3px 0 0 var(--accent)" : (dragging ? "0 6px 18px rgba(0,0,0,0.35)" : undefined),
                    padding: "15px 16px", display: "flex", alignItems: "center", gap: 12,
                    cursor: "pointer", userSelect: "none", touchAction: "pan-y"
                  }}>
                  {Handle(s.id)}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {isActive ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ec77f", boxShadow: "0 0 6px rgba(78,199,127,0.6)", flexShrink: 0 }} /> : null}
                      <span style={{ fontSize: 17, letterSpacing: "0.01em", color: "var(--fg)", fontWeight: 600 }}>{wxTitleCase(s.name)}</span>
                    </div>
                    {(s.region || s.elevation != null) ? (
                      <span style={{ fontSize: 12, letterSpacing: "0.01em", color: "var(--fg-dim)" }}>
                        {s.region || ""}{(s.region && s.elevation != null) ? " · " : ""}{s.elevation != null ? Math.round(s.elevation) + " m" : ""}
                      </span>
                    ) : null}
                    <span className="mono" style={{ fontSize: 11, letterSpacing: "0.04em", color: "var(--fg-faint)" }}>{wxFmtCoord(s.lat, s.lon)}</span>
                  </div>
                  {temps[s.id] ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--fg-faint)" }}>{temps[s.id].code}</span>
                      <div style={{ display: "flex", alignItems: "flex-start" }}>
                        <span className="mono" style={{ fontSize: 26, fontWeight: 300, lineHeight: 1, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{temps[s.id].temp}</span>
                        <span className="mono" style={{ fontSize: 13, color: "var(--fg-dim)", marginTop: 1 }}>°</span>
                      </div>
                    </div>
                  ) : (
                    <span className="mono" style={{ fontSize: 15, color: "var(--fg-dim)", flexShrink: 0, opacity: 0.5 }}>{"›"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* + Add a site — focuses the search field at the top */}
        <button type="button" onClick={function () { try { var el = document.querySelector('input[placeholder]'); if (el) el.focus(); window.scrollTo && window.scrollTo(0, 0); } catch (e) {} }}
          style={{ width: "100%", marginTop: 12, padding: "15px 0", borderRadius: 14, border: "1px dashed var(--line-strong)", background: "none", color: "var(--fg-dim)", fontSize: 14, letterSpacing: "0.01em", cursor: "pointer" }}>
          {C("+ Add a site", "+ Aggiungi sito")}
        </button>
        <div style={{ marginTop: 12, fontSize: 11, letterSpacing: "0.01em", color: "var(--fg-faint)", lineHeight: 1.7, textAlign: "center" }}>
          {C("Swipe or long-press to delete · drag to reorder · tap to view", "Scorri o tieni premuto per eliminare · trascina per riordinare · tocca per vedere")}
        </div>
      </div>
    </div>
  );
}


