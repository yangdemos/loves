/**
 * Main Express server — face-driven video generation app.
 *
 * - Serves static frontend files from the project root.
 * - Mounts API routes under /api.
 * - Listens on port 3000.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const LANDING_PAGE = normalizeLandingPage(process.env.LANDING_PAGE || '');
const ENABLE_LOCAL_HTTPS = process.env.ENABLE_LOCAL_HTTPS !== 'false';
const projectRoot = path.resolve(__dirname, '..');

function normalizeLandingPage(value) {
  if (!value) return '';

  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  let normalized = trimmed.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalized)) {
    normalized = normalized.slice(normalized.lastIndexOf('/'));
  }

  normalized = normalized.replace(/^\.\//, '/');
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  return normalized;
}

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static files (frontend) ─────────────────────────────────────────────────

if (LANDING_PAGE) {
  app.get('/', (_req, res) => {
    res.redirect(302, LANDING_PAGE);
  });
}

// Serve the project root so index.html, css/, js/ etc. are accessible.
app.use(express.static(projectRoot));

// ─── API routes ──────────────────────────────────────────────────────────────

app.use('/api', apiRoutes);

// ─── Health-check ────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString() });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

// HTTP
app.listen(PORT, () => {
  console.log(`Face-driven video server listening on http://localhost:${PORT}`);
});

// HTTPS (self-signed cert in project root)
const certPath = path.join(projectRoot, 'cert.pem');
const keyPath = path.join(projectRoot, 'key.pem');
if (ENABLE_LOCAL_HTTPS && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
    console.log(`Face-driven video server (HTTPS) listening on https://localhost:${HTTPS_PORT}`);
  });
} else if (!ENABLE_LOCAL_HTTPS) {
  console.warn('WARNING: local HTTPS disabled by environment variable.');
} else {
  console.warn(`WARNING: cert.pem/key.pem not found — HTTPS on port ${HTTPS_PORT} skipped.`);
}

// Startup checks (uploads/output dirs + ffmpeg)
const dirs = [
  path.join(projectRoot, 'uploads'),
  path.join(projectRoot, 'output'),
];
dirs.forEach((d) => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
    console.log(`Created directory: ${d}`);
  }
});

try {
  const { checkFfmpeg } = require('./utils/ffmpeg');
  checkFfmpeg();
  console.log('ffmpeg binaries found and ready.');
} catch (err) {
  console.error('WARNING: ffmpeg check failed — video generation will not work.');
  console.error(err.message);
}
