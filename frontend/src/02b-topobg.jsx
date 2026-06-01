/* ============================================================================
   FIELD WX · Calm port — faint topographic-contour backdrop  [WxTopoBg]
   Ported from the Calm standalone's TopoMap: a static synthetic elevation field
   (sum of gaussian peaks + gentle ripple) run through marching-squares into faint
   iso-contours, painted on a z-0 canvas behind the sky + atmosphere. Themed for
   light/dark. Rendered by App ONLY in explicit Light/Dark appearance (not Auto),
   matching the Calm behaviour. Viewport-responsive (the field is normalised 0..1).
   ============================================================================ */
function WxTopoBg({ appearance }) {
  const ref = React.useRef(null);
  React.useEffect(function () {
    const cvs = ref.current; if (!cvs) return;
    const ctx = cvs.getContext("2d");
    let pending = 0;
    const peaks = [
      { x: 0.24, y: 0.16, a: 1.5, s: 0.22 }, { x: 0.74, y: 0.28, a: 1.1, s: 0.17 },
      { x: 0.46, y: 0.52, a: 1.7, s: 0.27 }, { x: 0.83, y: 0.70, a: 1.0, s: 0.16 },
      { x: 0.16, y: 0.80, a: 1.25, s: 0.20 }, { x: 0.58, y: 0.93, a: 0.9, s: 0.17 },
    ];
    const field = function (x, y) {
      let v = 0;
      for (const p of peaks) { const dx = x - p.x, dy = y - p.y; v += p.a * Math.exp(-(dx * dx + dy * dy) / (2 * p.s * p.s)); }
      return v + 0.14 * Math.sin(x * 8.5 + y * 3.7);
    };
    function draw() {
      const w = cvs.clientWidth || window.innerWidth, h = cvs.clientHeight || window.innerHeight;
      if (w <= 0 || h <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cvs.width = w * dpr; cvs.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const light = appearance === "light";
      const gw = 56, gh = Math.max(8, Math.round(gw * h / Math.max(1, w)));
      const vals = [];
      for (let j = 0; j <= gh; j++) { const row = []; for (let i = 0; i <= gw; i++) row.push(field(i / gw, j / gh)); vals.push(row); }
      const cw = w / gw, ch = h / gh;
      let min = Infinity, max = -Infinity;
      for (const r of vals) for (const v of r) { if (v < min) min = v; if (v > max) max = v; }
      const nLevels = 15, itp = function (va, vb, lvl) { return (lvl - va) / (vb - va); };
      const baseCol = light ? "27,36,48" : "236,242,247";
      for (let l = 1; l < nLevels; l++) {
        const lvl = min + (max - min) * l / nLevels, major = l % 3 === 0;
        ctx.beginPath();
        for (let j = 0; j < gh; j++) {
          for (let i = 0; i < gw; i++) {
            const tl = vals[j][i], tr = vals[j][i + 1], br = vals[j + 1][i + 1], bl = vals[j + 1][i];
            let idx = 0;
            if (tl > lvl) idx |= 8;
            if (tr > lvl) idx |= 4;
            if (br > lvl) idx |= 2;
            if (bl > lvl) idx |= 1;
            if (idx === 0 || idx === 15) continue;
            const x0 = i * cw, y0 = j * ch;
            const top = function () { return { x: x0 + cw * itp(tl, tr, lvl), y: y0 }; };
            const right = function () { return { x: x0 + cw, y: y0 + ch * itp(tr, br, lvl) }; };
            const bottom = function () { return { x: x0 + cw * itp(bl, br, lvl), y: y0 + ch }; };
            const left = function () { return { x: x0, y: y0 + ch * itp(tl, bl, lvl) }; };
            const seg = function (a, b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); };
            switch (idx) {
              case 1: seg(left(), bottom()); break;
              case 2: seg(bottom(), right()); break;
              case 3: seg(left(), right()); break;
              case 4: seg(top(), right()); break;
              case 5: seg(left(), top()); seg(bottom(), right()); break;
              case 6: seg(top(), bottom()); break;
              case 7: seg(left(), top()); break;
              case 8: seg(left(), top()); break;
              case 9: seg(top(), bottom()); break;
              case 10: seg(left(), bottom()); seg(top(), right()); break;
              case 11: seg(top(), right()); break;
              case 12: seg(left(), right()); break;
              case 13: seg(bottom(), right()); break;
              case 14: seg(left(), bottom()); break;
            }
          }
        }
        ctx.strokeStyle = "rgba(" + baseCol + "," + (major ? (light ? 0.14 : 0.10) : (light ? 0.07 : 0.05)) + ")";
        ctx.lineWidth = major ? 1.1 : 0.8;
        ctx.stroke();
      }
    }
    draw();
    const onResize = function () { if (pending) cancelAnimationFrame(pending); pending = requestAnimationFrame(draw); };
    window.addEventListener("resize", onResize);
    return function () { window.removeEventListener("resize", onResize); if (pending) cancelAnimationFrame(pending); };
  }, [appearance]);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />;
}
window.WxTopoBg = WxTopoBg;
