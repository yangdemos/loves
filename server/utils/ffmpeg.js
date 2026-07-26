/**
 * ffmpeg utility — zoompan clip generation + xfade crossfade pipeline.
 *
 * All paths use Windows-compatible path.join.
 * Every ffmpeg call is wrapped in try/catch with descriptive error messages.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Paths ───────────────────────────────────────────────────────────────────

const FFMPEG_DIR = path.join(
  'C:\\Users\\lenovo\\Desktop\\love and peace',
  'ffmpeg-essentials',
  'ffmpeg-8.1.2-essentials_build',
  'bin'
);

const FFMPEG_PATH = path.join(FFMPEG_DIR, 'ffmpeg.exe');
const FFPROBE_PATH = path.join(FFMPEG_DIR, 'ffprobe.exe');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the full path to the ffmpeg binary.
 */
function getFfmpegPath() {
  return FFMPEG_PATH;
}

/**
 * Throws if ffmpeg or ffprobe are missing at the expected paths.
 */
function checkFfmpeg() {
  const errors = [];
  if (!fs.existsSync(FFMPEG_PATH)) {
    errors.push(`ffmpeg not found at ${FFMPEG_PATH}`);
  }
  if (!fs.existsSync(FFPROBE_PATH)) {
    errors.push(`ffprobe not found at ${FFPROBE_PATH}`);
  }
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

/**
 * Spawn ffmpeg as a child process and return a Promise.
 * Uses spawn (not execFile) so stderr streaming does not hit buffer limits.
 *
 * @param {string[]} args - CLI arguments passed to ffmpeg
 * @param {object} [opts] - Additional spawn options (cwd, timeout, etc.)
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runFfmpeg(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, {
      windowsHide: true,
      ...opts,
    });

    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Extract a meaningful snippet from the verbose ffmpeg output
        const snippet = stderr
          .split('\n')
          .filter((l) => l.includes('Error') || l.includes('error') || l.includes('Invalid'))
          .slice(-3)
          .join('\n')
          || stderr.slice(-400);
        reject(
          new Error(
            `ffmpeg exited with code ${code}.\n${snippet}\nFull args: ffmpeg ${args.join(' ')}`
          )
        );
      }
    });
  });
}

// ─── Pipeline stages ─────────────────────────────────────────────────────────

/**
 * Generate a single video clip from a still image using the zoompan filter.
 * The camera slowly zooms into the center of the image.
 *
 * @param {string}  inputImage  - Path to the source image
 * @param {string}  outputClip  - Path for the generated .mp4 clip
 * @param {number}  durationSec - Clip duration in seconds
 * @param {number}  [fps=25]    - Output frames per second
 */
async function generateClip(inputImage, outputClip, durationSec, fps = 25) {
  const numFrames = Math.round(durationSec * fps);

  // zoompan filter expression:
  //   z – current zoom factor (starts at 1.0), incremented each frame
  //   d – number of frames to output
  //   s – output frame size (1920×1080)
  //   fps – output frame rate
  // Single quotes are NOT needed when using spawn (no shell interpretation).
  const filter =
    `zoompan=z=min(zoom+0.0015,1.5):d=${numFrames}:s=1920x1080:fps=${fps}`;

  const args = [
    '-y',
    '-i', inputImage,
    '-filter:v', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-t', String(durationSec),
    '-an',
    outputClip,
  ];

  await runFfmpeg(args, { timeout: 120_000 });
}

/**
 * Combine multiple video clips into a single video with crossfade transitions.
 * Uses the xfade filter chained across all inputs.
 *
 * @param {string[]} clipPaths          - Ordered list of clip files to combine
 * @param {string}   outputPath         - Destination MP4 path
 * @param {number}   transitionDuration - Length of each crossfade (seconds)
 * @param {number}   clipDuration       - Duration of each individual clip (seconds)
 * @param {number}   [fps=25]
 */
async function combineClipsWithTransitions(
  clipPaths,
  outputPath,
  transitionDuration,
  clipDuration,
  fps = 25
) {
  if (clipPaths.length === 0) {
    throw new Error('No clips provided for combination');
  }

  // Single clip — just copy it
  if (clipPaths.length === 1) {
    await runFfmpeg([
      '-y',
      '-i', clipPaths[0],
      '-c', 'copy',
      '-an',
      outputPath,
    ], { timeout: 60_000 });
    return;
  }

  // ── Build the filter_complex graph ──────────────────────────────────────

  /**
   * For N clips of duration T with transition td, we build N-1 xfade stages.
   *
   * Stage k (0-indexed) mixes the accumulated output from previous stages
   * with clip[k+1]. The offset into the accumulated timeline is:
   *     offset = (k + 1) * (T - td)
   *
   * All inputs must use the same timebase — we apply settb=AVTB,setpts=PTS-STARTPTS.
   */

  const lines = [];

  // 1) Normalise each input
  for (let i = 0; i < clipPaths.length; i++) {
    lines.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[vid${i}]`);
  }

  // 2) Chain xfade stages
  for (let i = 0; i < clipPaths.length - 1; i++) {
    const offset = (i + 1) * (clipDuration - transitionDuration);
    const left = i === 0 ? `[vid0][vid1]` : `[stg${i - 1}][vid${i + 1}]`;
    const right = i === clipPaths.length - 2 ? '' : `[stg${i}]`;
    lines.push(
      `${left}xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(1)}${right}`
    );
  }

  const filterComplex = lines.join(';\n');

  // Build the argument list
  const args = [
    '-y',
    ...clipPaths.flatMap((p) => ['-i', p]),
    '-filter_complex', filterComplex,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-an',
    outputPath,
  ];

  // Allow up to 5 minutes for combination (50 clips × 5 s each with transitions)
  await runFfmpeg(args, { timeout: 300_000 });
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

/**
 * High-level pipeline: photos → zoompan clips → xfade → final MP4.
 *
 * @param {string[]} photoPaths      - Absolute paths to source images
 * @param {string}   outputPath      - Desired path for the output MP4
 * @param {object}   [options]
 * @param {number}   [options.transitionDuration=2]
 * @param {number}   [options.totalDurationPerPhoto=5]
 * @param {number}   [options.fps=25]
 * @param {function} [options.onProgress] - Callback receiving integer 0-100
 * @returns {Promise<void>}
 */
async function generateVideoFromPhotos(photoPaths, outputPath, options = {}) {
  const {
    transitionDuration = 2,
    totalDurationPerPhoto = 5,
    fps = 25,
    onProgress = null,
  } = options;

  // Validate
  if (!photoPaths || photoPaths.length === 0) {
    throw new Error('At least one photo is required');
  }
  if (transitionDuration >= totalDurationPerPhoto) {
    throw new Error(
      `transitionDuration (${transitionDuration}s) must be less than ` +
      `totalDurationPerPhoto (${totalDurationPerPhoto}s)`
    );
  }

  checkFfmpeg();

  // Create a temp directory for intermediate clips
  const tempDir = path.join(
    path.dirname(outputPath),
    `.temp-${path.basename(outputPath, '.mp4')}`
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const clipPaths = [];

  try {
    // ── Stage 1: Generate zoompan clips ──────────────────────────────────
    for (let i = 0; i < photoPaths.length; i++) {
      const clipName = `clip${String(i).padStart(3, '0')}.mp4`;
      const clipPath = path.join(tempDir, clipName);

      if (onProgress) {
        const pct = Math.round(((i) / photoPaths.length) * 50);
        onProgress(pct);
      }

      await generateClip(photoPaths[i], clipPath, totalDurationPerPhoto, fps);
      clipPaths.push(clipPath);
    }

    // ── Stage 2: Combine with crossfade transitions ──────────────────────
    if (onProgress) onProgress(55);

    // Ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    await combineClipsWithTransitions(
      clipPaths,
      outputPath,
      transitionDuration,
      totalDurationPerPhoto,
      fps
    );

    if (onProgress) onProgress(100);
  } finally {
    // ── Clean-up ─────────────────────────────────────────────────────────
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

module.exports = {
  getFfmpegPath,
  checkFfmpeg,
  generateClip,
  combineClipsWithTransitions,
  generateVideoFromPhotos,
};
