function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [nav, setNav] = useState(() => { const n = localStorage.getItem("wx-nav") || "now"; return ["now", "sites", "sys", "hourly"].includes(n) ? n : "now"; });
  const [navDir, setNavDir] = useState(null); // "fwd" | "back" | null
  const [lang, setLang] = useState(() => localStorage.getItem("wx-lang") || "en");
  // appearance: Dark · Auto · Light (replaces the old 2-way theme toggle); persisted to fieldwx_appearance, default auto
  const [appearance, setAppearance] = useState(() => { const a = localStorage.getItem("fieldwx_appearance"); return (a === "dark" || a === "light" || a === "auto") ? a : "auto"; });
  // Light/Dark force a flat palette; Auto shows the live per-condition sky. resolvedTheme drives the
  // Atmosphere particle/grid colours + html data-theme (Auto = dark-content: light particles on the sky).
  const resolvedTheme = appearance === "light" ? "light" : "dark";
  const [view, setView] = useState(() => localStorage.getItem("wx-view") || "normal");
  const [unitsPref, setUnitsPref] = useState(() => localStorage.getItem("wx-units") || "");

  const NAV_ORDER = ["sites", "now", "sys"];   // Calm 3-tab nav (week is now inline on the Now screen)
  const goNav = (target) => {
    const i = NAV_ORDER.indexOf(nav), j = NAV_ORDER.indexOf(target);
    let dir;
    if (target === "hourly") dir = "fwd";        // drill into the full hourly view
    else if (nav === "hourly") dir = "back";     // return from the full view
    else if (i < 0 || j < 0 || j === i) dir = null;
    else dir = j > i ? "fwd" : "back";
    setNavDir(dir);
    setNav(target);
  };
  const navBy = (d) => {
    if (nav === "hourly") { goNav("now"); return; }   // any swipe leaves the full view → NOW
    const i = NAV_ORDER.indexOf(nav);
    const j = Math.max(0, Math.min(NAV_ORDER.length - 1, i + d));
    if (j !== i) goNav(NAV_ORDER[j]);
  };

  // swipe between tabs — Touch Events. touchend fires reliably on mobile with the
  // final position in changedTouches (even after the browser scrolls a child), which
  // pointer events did not. A clear, horizontally-dominant drag navigates.
  const swipe = React.useRef(null);
  const onTouchStart = (e) => {
    const t0 = e.touches && e.touches[0];
    swipe.current = t0 ? { x: t0.clientX, y: t0.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const s = swipe.current; swipe.current = null;
    const t0 = e.changedTouches && e.changedTouches[0];
    if (!s || !t0) return;
    const dx = t0.clientX - s.x, dy = t0.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) navBy(dx < 0 ? 1 : -1);
  };

  // resolve active language strings before children render
  window.L = I18N[lang] || I18N.en;

  useEffect(() => { document.documentElement.style.setProperty("--accent", t.accent); }, [t.accent]);
  useEffect(() => { localStorage.setItem("wx-nav", nav); }, [nav]);
  useEffect(() => { localStorage.setItem("wx-lang", lang); }, [lang]);
  useEffect(() => { try { localStorage.setItem("fieldwx_appearance", appearance); } catch (e) {} }, [appearance]);
  // feed the resolved (dark|light) mode to the existing theme machinery: vendored light CSS, body backdrop, Atmosphere
  useEffect(() => { document.documentElement.setAttribute("data-theme", resolvedTheme); }, [resolvedTheme]);
  useEffect(() => { localStorage.setItem("wx-view", view); }, [view]);
  useEffect(() => { if (unitsPref) localStorage.setItem("wx-units", unitsPref); else localStorage.removeItem("wx-units"); }, [unitsPref]);

  const moodKey = MOODS[t.mood] ? t.mood : "RAIN";
    /* [WX_SITES_V2] live, persisted multi-site state */
  const [sites, setSites] = useState(wxLoadSites);
  const [activeId, setActiveId] = useState(() => { try { return localStorage.getItem("wx-active-site") || null; } catch (e) { return null; } });
  const activeSite = (sites.find(s => s.id === activeId)) || sites[0];
  useEffect(() => { try { localStorage.setItem("wx-sites", JSON.stringify(sites)); } catch (e) {} }, [sites]);
  useEffect(() => { try { if (activeSite) localStorage.setItem("wx-active-site", activeSite.id); } catch (e) {} }, [activeSite ? activeSite.id : null]);
  const selectSite = (id) => { setActiveId(id); goNav("now"); };
  const addSite = (site) => { setSites(prev => prev.some(s => s.id === site.id) ? prev : prev.concat([site])); };
  const deleteSite = (id) => { setSites(prev => prev.length <= 1 ? prev : prev.filter(s => s.id !== id)); setActiveId(prev => prev === id ? null : prev); };
  const reorderSites = (next) => { setSites(next); };
  const live = useWeatherData(activeSite.lat, activeSite.lon, unitsPref);
  const mountMood = React.useRef(t.mood).current;
  const liveView = useMemo(() => live.data ? _buildLiveView(live.data) : null, [live.data]);
  // WX SIM override: pick a mood different from the one at mount to preview that mock preset
  const simMode = (t.mood !== mountMood) || !liveView;
  // keep the 7-day screen (reads the global WEEK) in sync with live data
  if (liveView && liveView.week) { window.WEEK = liveView.week; window.U = _U(liveView.units && liveView.units.system); } // 7-day screen reads global WEEK; assign in render so it never lags a frame
  const m = simMode ? MOODS[moodKey] : liveView.m;
  const hourly = simMode ? genHourly(moodKey, 24) : liveView.hourly;
  const flight = simMode ? genFlight(moodKey) : liveView.flight;
  const isNight = !!(liveView && liveView.isNight);
  // Auto = live day/night sky (sun by day, stars at night). Light/Dark keep the WEATHER atmosphere
  // (rain/snow/cloud/storm) but drop the day/night cue (no sun/stars), per the Calm model.
  let atmos = t.atmosphere ? m.atmos : "grid";
  if (appearance === "auto") {
    if (isNight && atmos === "clear-day") atmos = "clear-night";
  } else if (atmos === "clear-day" || atmos === "clear-night") {
    atmos = "grid";
  }
  const atmNight = appearance === "auto" ? (isNight && atmos !== "grid") : false;
  // live sky key for AUTO's per-condition gradient (NIGHT for a clear night; BLIZZARD shares SNOW)
  const condKey = simMode ? moodKey : ((liveView && liveView.m && liveView.m.key) || "CLEAR");
  let skyKey = (condKey === "BLIZZARD") ? "SNOW" : condKey;
  if (isNight && skyKey === "CLEAR") skyKey = "NIGHT";
  const unitsSystem = (liveView && liveView.units && liveView.units.system) || (unitsPref || "metric");

  // [WX_SITES_V2] stamp the active site's name + region/elevation onto the current-conditions
  // object so the NOW / hourly header reflects the selected location (not the IVREA default)
  const _elevStr = [activeSite.elevation != null ? Math.round(activeSite.elevation) + " m" : "", activeSite.region ? String(activeSite.region).toUpperCase() : ""].filter(Boolean).join(" · ");
  const mView = Object.assign({}, m, { trailhead: activeSite.name, elev: _elevStr || wxFmtCoord(activeSite.lat, activeSite.lon) });

  let screen;
  if (nav === "now") screen = <HomeNow m={mView} hourly={hourly} onNav={goNav} view={view} flight={flight} onView={setView} />;
  else if (nav === "hourly") screen = <ScreenHourly m={mView} hourly={hourly} />;
  else if (nav === "week") screen = <ScreenWeek />;
  else if (nav === "sites") screen = <ScreenSites sites={sites} activeId={activeSite.id} onSelect={selectSite} onAdd={addSite} onDelete={deleteSite} onReorder={reorderSites} />;
  else screen = <ScreenSys lang={lang} onLang={setLang} appearance={appearance} onAppearance={setAppearance} view={view} onView={setView} units={unitsSystem} onUnits={setUnitsPref} />;

  const scrClass = navDir === "fwd" ? "scr-r" : navDir === "back" ? "scr-l" : "scr-fade";

  return (
    <React.Fragment>
      <div className="wx-shell" data-appearance={appearance} data-sky={skyKey} style={{ position: "fixed", inset: 0, background: "var(--app-sky)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {appearance !== "auto" && <WxTopoBg appearance={appearance} />}
        <Atmosphere atmos={atmos} accent={t.accent} theme={resolvedTheme} night={atmNight} />
        <TopBar name={activeSite.name} coord={(live.loading && !live.data) ? (wxFmtCoord(activeSite.lat, activeSite.lon) + " · SYNC…") : wxFmtCoord(activeSite.lat, activeSite.lon)} code={m.metar} night={isNight} />
        <div key={nav} className={scrClass} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative", zIndex: 1 }}>
          {screen}
        </div>
        <WxTabBar active={nav} onNav={goNav} />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Conditions" />
        <TweakSelect
          label="Live weather"
          value={t.mood}
          options={MOOD_ORDER}
          onChange={(v) => setTweak("mood", v)}
        />
        <TweakToggle
          label="Atmosphere field"
          value={t.atmosphere}
          onChange={(v) => setTweak("atmosphere", v)}
        />
        <p style={{ font: "10px/1.5 'Hanken Grotesk', system-ui, sans-serif", color: "var(--fg-faint)", letterSpacing: "0.04em", margin: "2px 4px 0", textTransform: "uppercase" }}>
          Drives every readout + the live conditions field behind the UI.
        </p>

        <TweakSection label="Accent" />
        <TweakColor
          label="Signal color"
          value={t.accent}
          options={["#4f93e0", "#d99a4e", "#5fb0bf", "#8a7fd6", "#cf5b52"]}
          onChange={(v) => setTweak("accent", v)}
        />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
