'use strict';

const express = require('express');
const cors = require('cors');

const weatherRouter = require('./routes/weather');
const sitesRouter = require('./routes/sites');

const PORT = 3001;

const app = express();

// Middleware
// Let file:// pages and other private-network contexts reach this dev server —
// Chrome's Private Network Access preflight expects this header on the response.
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(cors()); // Wide open for local dev
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Mount routes
app.use('/api/weather', weatherRouter);
app.use('/api/sites', sitesRouter);

// 404 handler for unknown /api routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown route: ${req.method} ${req.path}` });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`FIELD WX backend running at http://localhost:${PORT}`);
});

module.exports = app;
