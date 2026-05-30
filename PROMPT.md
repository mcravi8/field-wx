# Master Prompt — paste this into Claude Code

```
# Project: FIELD WX · Weather Ops

FIELD WX is a paragliding-focused weather app. The full project brief is in CLAUDE.md — read it before doing anything else.

## What exists
- `frontend/index.html` — a complete, polished React app (dark ops aesthetic, Geist fonts, mobile-first). It currently runs on mock/generated data. DO NOT modify its visual design or component structure.
- `backend/` — empty. This is what needs to be built.
- `.claude/agents/` — three subagent definitions for parallel work.

## Goal
Replace the frontend's mock data with real live weather from the Open-Meteo API (free, no key needed) by building a Node.js/Express backend that the frontend fetches from. The default location is Aosta Valley, Italy (45.4677°N, 7.8772°E) — a real paragliding site. The app must show real current conditions, 24h hourly forecast, 7-day weekly forecast, and paragliding-specific data (thermals, altitude winds, flyability rating).

## Final success criteria
- `node backend/src/server.js` starts without errors on port 3001
- `curl http://localhost:3001/api/weather?lat=45.4677&lon=7.8772` returns valid JSON matching the schema in CLAUDE.md
- Opening `frontend/index.html` in a browser shows real live weather data, not mock data

---

Build the full backend for FIELD WX and wire up the frontend to use live data.

Run these three workstreams in parallel using subagents:

1. Use the @api-builder agent to build the Express server, Open-Meteo fetcher, routes, and cache. It should install deps, build all files in backend/src/, and verify the server starts and responds to curl requests.

2. Use the @paragliding-data agent to build the data transformation layer and flight condition engine in backend/src/services/transform.js and backend/src/services/paragliding.js. It should implement all schemas from CLAUDE.md including thermals, wind shear detection, and flyability rating.

3. Use the @frontend-integrator agent to add the WeatherAPI fetch layer to frontend/index.html and wire the App component to use real data with a mock fallback.

Once all three complete, verify the full stack works end-to-end: start the backend with `node backend/src/server.js`, then open frontend/index.html in a browser and confirm real weather data loads for 45.4677°N 7.8772°E.
```
