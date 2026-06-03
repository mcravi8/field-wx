/* ============================================================================
   FIELD WX · Atmosphere override  [WX_NO_GRID]
   Byte-identical to the vendored wx-atmosphere.jsx Atmosphere EXCEPT the faint
   background coordinate grid is neutralized (grid() is now a no-op). All particle
   states (rain/snow/clear/night/stars/etc.) are unchanged. Defined in the inline
   script so it shadows the global Atmosphere at runtime (same override pattern as
   TopBar/HomeNow/ScreenSites/FlightSection).
   ============================================================================ */
function Atmosphere({ atmos, accent, theme, night }) {
  const ref = React.useRef(null);
  const accentRef = React.useRef(accent);
  accentRef.current = accent;
  const atmosRef = React.useRef(atmos);
  atmosRef.current = atmos;
  const themeRef = React.useRef(theme);
  themeRef.current = theme;
  const nightRef = React.useRef(night);
  nightRef.current = night;

  React.useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf, W, H, dpr;
    let parts = [];
    let stars = [];
    let t = 0;
    let flash = 0;

    const hexToRgb = (h) => {
      const m = h.replace("#", "");
      const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const seed = () => {
      const a = atmosRef.current;
      parts = [];
      stars = [];
      let n = 0;
      if (a === "rain") n = 150;
      else if (a === "storm") n = 240;
      else if (a === "snow") n = 90;
      else if (a === "blizzard") n = 230;
      else if (a === "overcast") n = 11;
      else if (a === "windy") n = 46;
      for (let i = 0; i < n; i++) {
        if (a === "snow" || a === "blizzard") {
          const heavy = a === "blizzard";
          parts.push({ x: Math.random() * W * 1.4 - W * 0.2, y: Math.random() * H, r: Math.random() * (heavy ? 2.0 : 1.6) + (heavy ? 0.8 : 0.6), sp: Math.random() * (heavy ? 1.1 : 0.4) + (heavy ? 0.7 : 0.18), dr: Math.random() * 0.5 - 0.25 });
        } else if (a === "overcast") {
          parts.push({ x: Math.random() * W, y: Math.random() * H * 0.85, w: Math.random() * 170 + 150, h: Math.random() * 60 + 48, sp: Math.random() * 0.22 + 0.07, o: Math.random() * 0.5 + 0.5 });
        } else if (a === "windy") {
          // mostly thin blown streaks; the first few are wider, slower 'wisps'
          const wisp = i < 5, spanX = W * 1.5;
          parts.push({ x: Math.random() * spanX - W * 0.25, y: Math.random() * H, len: wisp ? Math.random() * 70 + 80 : Math.random() * 26 + 16, sp: (wisp ? 1.1 : 3.0) + Math.random() * (wisp ? 0.8 : 3.5), o: (wisp ? 0.5 : 0.7) * (Math.random() * 0.5 + 0.5), wisp: wisp, ph: Math.random() * Math.PI * 2, amp: Math.random() * 6 + 2 });
        } else { // rain / storm — spawn across a wider span so the diagonal
          // fills the left edge too, with per-drop opacity for depth
          const spanX = W * 1.5;
          parts.push({ x: Math.random() * spanX - W * 0.45, y: Math.random() * H, len: Math.random() * 14 + (a === "storm" ? 14 : 8), sp: (a === "storm" ? 13 : 8) + Math.random() * 5, o: Math.random() * 0.55 + 0.45 });
        }
      }
      if (a === "clear-night") {
        for (let i = 0; i < 70; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.8, r: Math.random() * 1.2 + 0.3, ph: Math.random() * Math.PI * 2 });
      }
      if (nightRef.current && a !== "clear-night") {
        for (let i = 0; i < 55; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.7, r: Math.random() * 1.1 + 0.3, ph: Math.random() * Math.PI * 2 });
      }
      if (a === "clear-day") {
        for (let i = 0; i < 3; i++) parts.push({ x: Math.random() * W, y: 130 + Math.random() * (H * 0.45), w: 80 + Math.random() * 130, sp: 0.12 + Math.random() * 0.18, o: 0.4 + Math.random() * 0.5 });
      }
    };

    const grid = () => { /* [WX] background coordinate grid removed per request */ };

    const draw = () => {
      const a = atmosRef.current;
      const [ar, ag, ab] = hexToRgb(accentRef.current || "#5b9dd9");
      const light = themeRef.current === "light";
      const pInk = light ? "30,33,38" : "255,255,255";
      ctx.clearRect(0, 0, W, H);
      grid();
      if (nightRef.current) {
        const ng = ctx.createLinearGradient(0, 0, 0, H);
        ng.addColorStop(0, "rgba(6,9,20,0.55)");
        ng.addColorStop(1, "rgba(3,5,12,0.28)");
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, W, H);
      }
      t += 1;

      // slow horizontal scan line — common ops backdrop tell
      const scanY = (t * 0.35) % (H + 60) - 30;
      ctx.fillStyle = `rgba(${ar},${ag},${ab},0.03)`;
      ctx.fillRect(0, scanY, W, 28);

      if (a === "rain" || a === "storm") {
        ctx.lineWidth = 1;
        const angle = a === "storm" ? 0.42 : 0.28;
        const base = a === "storm" ? 0.32 : 0.24;
        const spanX = W * 1.5;
        parts.forEach((p) => {
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(base * (p.o || 1)).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.len * angle, p.y + p.len);
          ctx.stroke();
          p.y += p.sp; p.x += p.sp * angle;
          if (p.y > H) { p.y = -p.len; p.x = Math.random() * spanX - W * 0.45; }
        });
        if (a === "storm") {
          if (Math.random() < 0.004) flash = 1;
          if (flash > 0) {
            ctx.fillStyle = `rgba(${ar},${ag},${ab},${flash * 0.07})`;
            ctx.fillRect(0, 0, W, H);
            flash -= 0.04;
          }
        }
      } else if (a === "snow" || a === "blizzard") {
        const heavy = a === "blizzard";
        const wind = heavy ? 2.4 : 0;
        ctx.fillStyle = `rgba(${pInk},${heavy ? 0.6 : 0.42})`;
        parts.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          p.y += p.sp;
          p.x += Math.sin(t * 0.01 + p.y * 0.05) * (heavy ? 0.6 : 0.3) + p.dr * 0.2 + wind;
          if (p.y > H) { p.y = -5; p.x = Math.random() * W * 1.4 - W * 0.2; }
          if (p.x > W + 12) p.x = -12;
        });
        if (heavy) { // whiteout haze knocks back visibility
          ctx.fillStyle = light ? "rgba(150,152,156,0.07)" : "rgba(255,255,255,0.055)";
          ctx.fillRect(0, 0, W, H);
        }
      } else if (a === "overcast") {
        // slow-drifting soft cloud layers (stacked ellipses fake the blur)
        const cloud = light ? "120,124,132" : "202,204,210";
        const ca = light ? 0.055 : 0.04;
        parts.forEach((p) => {
          for (let s = 0; s < 3; s++) {
            const k = 1 - s * 0.3;
            ctx.fillStyle = `rgba(${cloud},${(ca * p.o).toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, (p.w / 2) * k, (p.h / 2) * k, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          p.x += p.sp;
          if (p.x - p.w / 2 > W) { p.x = -p.w / 2; p.y = Math.random() * H * 0.85; }
        });
      } else if (a === "windy") {
        // wind streaming across — thin accent streaks + a few soft cloud wisps, gently undulating
        ctx.lineCap = "round";
        parts.forEach((p) => {
          const yy = p.y + Math.sin(t * 0.02 + p.ph) * p.amp;
          if (p.wisp) {
            const cloud = light ? "120,124,132" : "200,203,210";
            ctx.strokeStyle = `rgba(${cloud},${(0.05 * p.o).toFixed(3)})`;
            ctx.lineWidth = 7;
          } else {
            ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(0.30 * p.o).toFixed(3)})`;
            ctx.lineWidth = 1.2;
          }
          ctx.beginPath();
          ctx.moveTo(p.x, yy);
          ctx.lineTo(p.x + p.len, yy + p.len * 0.05);
          ctx.stroke();
          p.x += p.sp;
          if (p.x - p.len > W) { p.x = -p.len - Math.random() * W * 0.3; p.y = Math.random() * H; }
        });
        ctx.lineWidth = 1; ctx.lineCap = "butt";
      } else if (a === "clear-night") {
        stars.forEach((s) => {
          const tw = 0.4 + Math.sin(t * 0.02 + s.ph) * 0.3;
          ctx.fillStyle = `rgba(${pInk},${tw})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (a === "clear-day") {
        const sx = W - 54, sy = 72;
        const rot = t * 0.004;
        // soft sun glow (large faint → small bright)
        for (let s = 3; s >= 0; s--) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${(0.02 + (3 - s) * 0.013).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 18 + s * 11, 0, Math.PI * 2);
          ctx.fill();
        }
        // volumetric god-rays sweeping down-left
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 9; i++) {
          const ang = Math.PI * (0.5 + i * 0.082);
          const sh = 0.08 + Math.sin(t * 0.013 + i * 1.1) * 0.045;
          ctx.strokeStyle = `rgba(${ar},${ag},${ab},${Math.max(0, sh).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(ang) * H * 1.6, sy + Math.sin(ang) * H * 1.6);
          ctx.stroke();
        }
        // drifting high cirrus wisps
        const wisp = light ? "120,124,132" : "228,230,234";
        ctx.lineWidth = 2;
        parts.forEach((p) => {
          ctx.strokeStyle = `rgba(${wisp},${(0.05 * p.o).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.w, p.y);
          ctx.stroke();
          p.x += p.sp;
          if (p.x > W) { p.x = -p.w; p.y = 130 + Math.random() * (H * 0.45); }
        });
        // sun ring + rotating ticks
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.5)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sx, sy, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.6)`;
        for (let i = 0; i < 12; i++) {
          const a2 = rot + i * Math.PI / 6;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a2) * 19, sy + Math.sin(a2) * 19);
          ctx.lineTo(sx + Math.cos(a2) * 26, sy + Math.sin(a2) * 26);
          ctx.stroke();
        }
      }
      if (nightRef.current && a !== "clear-night") {
        stars.forEach((s) => {
          const tw = 0.3 + Math.sin(t * 0.02 + s.ph) * 0.25;
          ctx.fillStyle = "rgba(225,230,242," + Math.max(0, tw).toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        });
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [atmos, night]); // restart + reseed when the condition or day/night changes

  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />;
}

window.Atmosphere = Atmosphere;
