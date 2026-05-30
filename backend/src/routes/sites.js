'use strict';

const express = require('express');
const router = express.Router();

// In-memory sites store seeded with 4 default paragliding sites
let sites = [
  {
    name: 'IVREA',
    region: 'CANAVESE · IT',
    coord: '45.4677°N 7.8772°E',
    lat: 45.4677,
    lon: 7.8772,
    elev: '830 ft',
    code: '-RA',
    primary: true,
  },
  {
    name: 'BOULDER',
    region: 'FLATIRONS · CO',
    coord: '39.9994°N 105.2909°W',
    lat: 39.9994,
    lon: -105.2909,
    elev: '5430 ft',
    code: 'CLR',
  },
  {
    name: 'MT HOOD',
    region: 'TIMBERLINE · OR',
    coord: '45.3735°N 121.6960°W',
    lat: 45.3735,
    lon: -121.696,
    elev: '5960 ft',
    code: '-SN',
  },
  {
    name: 'MOAB',
    region: 'DESERT · UT',
    coord: '38.5733°N 109.5498°W',
    lat: 38.5733,
    lon: -109.5498,
    elev: '4026 ft',
    code: 'CLR',
  },
];

// GET /api/sites — return all saved sites
router.get('/', (req, res) => {
  res.json({ sites });
});

// POST /api/sites — add a new site
router.post('/', (req, res) => {
  const { name, lat, lon, region, coord, elev } = req.body || {};

  if (!name || name.toString().trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (lat === undefined || lat === null || !isFinite(Number(lat))) {
    return res.status(400).json({ error: 'lat must be a finite number' });
  }
  if (lon === undefined || lon === null || !isFinite(Number(lon))) {
    return res.status(400).json({ error: 'lon must be a finite number' });
  }

  const site = {
    name: name.toString().trim().toUpperCase(),
    lat: Number(lat),
    lon: Number(lon),
  };

  if (region !== undefined) site.region = region;
  if (coord !== undefined) site.coord = coord;
  if (elev !== undefined) site.elev = elev;

  sites.push(site);
  res.status(201).json({ sites });
});

module.exports = router;
