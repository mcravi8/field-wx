function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [nav, setNav] = useState(() => { const n = localStorage.getItem("wx-nav") || "now"; return ["now", "week", "sites", "sys", "hourly"].includes(n) ? n : "now"; });
  const [navDir, setNavDir] = useState(null); // "fwd" | "back" | null
  const [lang, setLang] = useState(() => localStorage.getItem("wx-lang") || "en");
  const [theme, setTheme] = useState(() => localStorage.getItem("wx-theme") || "dark");
  const [view, setView] = useState(() => localStorage.getItem("wx-view") || "normal");
  const [unitsPref, setUnitsPref] = useState(() => localStorage.getItem("wx-units") || "");

  const NAV_ORDER = ["now", "week", "sites", "sys"];
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
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("wx-theme", theme);
  }, [theme]);
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
  let atmos = t.atmosphere ? m.atmos : "grid";
  if (isNight && atmos === "clear-day") atmos = "clear-night";
  const unitsSystem = (liveView && liveView.units && liveView.units.system) || (unitsPref || "metric");

  let screen;
  if (nav === "now") screen = <HomeNow m={m} hourly={hourly} onNav={goNav} view={view} flight={flight} onView={setView} />;
  else if (nav === "hourly") screen = <ScreenHourly m={m} hourly={hourly} />;
  else if (nav === "week") screen = <ScreenWeek />;
  else if (nav === "sites") screen = <ScreenSites sites={sites} activeId={activeSite.id} onSelect={selectSite} onAdd={addSite} onDelete={deleteSite} onReorder={reorderSites} />;
  else screen = <ScreenSys lang={lang} onLang={setLang} theme={theme} onTheme={setTheme} view={view} onView={setView} units={unitsSystem} onUnits={setUnitsPref} />;

  const scrClass = navDir === "fwd" ? "scr-r" : navDir === "back" ? "scr-l" : "scr-fade";

  return (
    <React.Fragment>
      <div style={{ position: "fixed", inset: 0, background: "var(--bg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Atmosphere atmos={atmos} accent={t.accent} theme={theme} night={isNight && atmos !== "grid"} />
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
        <p style={{ font: "10px/1.5 'Geist Mono', monospace", color: "var(--fg-faint)", letterSpacing: "0.04em", margin: "2px 4px 0", textTransform: "uppercase" }}>
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
