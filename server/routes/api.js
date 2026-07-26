/**
 * API routes for the face-driven video generation app.
 *
 * POST   /api/upload        — Multipart file upload (field: "photos")
 * POST   /api/generate      — Start video generation job
 * GET    /api/status/:jobId — Poll job progress
 * GET    /api/download/:jobId — Stream completed MP4
 * GET    /api/videos        — List all completed videos
 */

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const { uploadedFiles, jobs } = require('../state');
const { generateVideoFromPhotos, checkFfmpeg } = require('../utils/ffmpeg');

const router = express.Router();

// ─── Multer config ───────────────────────────────────────────────────────────

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'output');

// Ensure directories exist
[UPLOADS_DIR, OUTPUT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|bmp|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${path.extname(file.originalname)}`));
    }
  },
});

// ─── POST /api/upload ────────────────────────────────────────────────────────

router.post('/upload', (req, res) => {
  upload.array('photos', 50)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const files = req.files.map((f) => {
      const id = path.basename(f.filename, path.extname(f.filename));
      const entry = { id, filename: f.filename, originalName: f.originalname, path: f.path };
      uploadedFiles[id] = entry;
      return entry;
    });

    res.json({ success: true, files });
  });
});

// ─── POST /api/generate ──────────────────────────────────────────────────────

router.post('/generate', async (req, res) => {
  try {
    const { files: fileIds, transitionDuration = 2, totalDurationPerPhoto = 5 } = req.body;

    // Validate input
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ success: false, error: 'files must be a non-empty array of file IDs' });
    }

    if (typeof transitionDuration !== 'number' || transitionDuration < 0.5 || transitionDuration > 10) {
      return res.status(400).json({ success: false, error: 'transitionDuration must be a number between 0.5 and 10' });
    }

    if (typeof totalDurationPerPhoto !== 'number' || totalDurationPerPhoto < 1 || totalDurationPerPhoto > 30) {
      return res.status(400).json({ success: false, error: 'totalDurationPerPhoto must be a number between 1 and 30' });
    }

    if (transitionDuration >= totalDurationPerPhoto) {
      return res.status(400).json({
        success: false,
        error: 'transitionDuration must be less than totalDurationPerPhoto',
      });
    }

    // Resolve file paths
    const photoPaths = [];
    for (const id of fileIds) {
      const file = uploadedFiles[id];
      if (!file) {
        return res.status(400).json({ success: false, error: `File ID not found: ${id}` });
      }
      if (!fs.existsSync(file.path)) {
        return res.status(400).json({ success: false, error: `File no longer exists on disk: ${id}` });
      }
      photoPaths.push(file.path);
    }

    // Check ffmpeg is available
    try {
      checkFfmpeg();
    } catch (ffErr) {
      console.error('ffmpeg check failed:', ffErr.message);
      return res.status(500).json({ success: false, error: `Server ffmpeg configuration error: ${ffErr.message}` });
    }

    // Create job
    const jobId = uuidv4();
    const outputFilename = `${jobId}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    jobs[jobId] = {
      jobId,
      status: 'processing',
      progress: 0,
      outputFile: null,
      error: null,
    };

    // Process asynchronously — respond immediately with the jobId
    processJob(jobId, photoPaths, outputPath, outputFilename, { transitionDuration, totalDurationPerPhoto });

    res.json({ success: true, jobId });
  } catch (err) {
    console.error('POST /api/generate error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Run the ffmpeg pipeline in the background.
 * Updates the shared jobs object as progress is made.
 */
async function processJob(jobId, photoPaths, outputPath, outputFilename, opts) {
  const { transitionDuration, totalDurationPerPhoto } = opts;

  try {
    await generateVideoFromPhotos(photoPaths, outputPath, {
      transitionDuration,
      totalDurationPerPhoto,
      fps: 25,
      onProgress: (pct) => {
        if (jobs[jobId]) {
          jobs[jobId].progress = pct;
        }
      },
    });

    // Verify output file exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Output file was not created by ffmpeg');
    }

    if (jobs[jobId]) {
      jobs[jobId].status = 'completed';
      jobs[jobId].progress = 100;
      jobs[jobId].outputFile = outputFilename;
    }
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err.message);
    if (jobs[jobId]) {
      jobs[jobId].status = 'failed';
      jobs[jobId].error = err.message;
    }

    // Clean up partial output
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch { /* ignore */ }
  }
}

// ─── GET /api/status/:jobId ──────────────────────────────────────────────────

router.get('/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  res.json({ success: true, ...job });
});

// ─── GET /api/download/:jobId ────────────────────────────────────────────────

router.get('/download/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  if (job.status !== 'completed') {
    return res.status(400).json({ success: false, error: `Job status is "${job.status}", not "completed"` });
  }

  const filePath = path.join(OUTPUT_DIR, job.outputFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Output file not found on disk' });
  }

  res.download(filePath, job.outputFile, (err) => {
    if (err) {
      console.error('Download error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to send file' });
      }
    }
  });
});

// ─── GET /api/videos ─────────────────────────────────────────────────────────

router.get('/videos', (_req, res) => {
  const videos = Object.values(jobs)
    .filter((j) => j.status === 'completed' && j.outputFile)
    .map((j) => ({
      jobId: j.jobId,
      outputFile: j.outputFile,
      createdAt: j.createdAt,
    }));

  res.json({ success: true, videos });
});

module.exports = router;
