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

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static files (frontend) ─────────────────────────────────────────────────

// Serve the project root so index.html, css/, js/ etc. are accessible.
const projectRoot = path.resolve(__dirname, '..');
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

app.listen(PORT, () => {
  console.log(`Face-driven video server listening on http://localhost:${PORT}`);
  console.log(`Static files served from: ${projectRoot}`);

  // Verify uploads/ and output/ directories
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

  // Verify ffmpeg
  try {
    const { checkFfmpeg } = require('./utils/ffmpeg');
    checkFfmpeg();
    console.log('ffmpeg binaries found and ready.');
  } catch (err) {
    console.error('WARNING: ffmpeg check failed — video generation will not work.');
    console.error(err.message);
  }
});
