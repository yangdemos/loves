/**
 * Video Maker — Local backend edition.
 *
 * Uploads photos to the local Express server, requests ffmpeg-based
 * video generation (zoompan + xfade), polls for progress, then
 * offers the final MP4 for download / preview.
 *
 * Endpoints (all relative):
 *   POST /api/upload          — multipart upload, field "photos"
 *   POST /api/generate        — start job { files: string[], transitionDuration, totalDurationPerPhoto }
 *   GET  /api/status/:jobId   — { status, progress, outputFile, error }
 *   GET  /api/download/:jobId — stream the MP4
 */

// ─── Config ──────────────────────────────────────────────────
const VM_CONFIG = {
  MAX_PHOTOS: 20,
  POLL_INTERVAL: 1500,    // ms
  POLL_MAX_RETRIES: 300,  // ~7.5 min before timeout
};

// ─── DOM refs ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  uploadCard:      $('#vm-upload-card'),
  uploadZone:      $('#vm-upload-zone'),
  fileInput:       $('#vm-file-input'),
  browseBtn:       $('#vm-browse-btn'),
  uploadLoading:   $('#vm-upload-loading'),
  thumbsContainer: $('#vm-thumbs-container'),
  thumbsGrid:      $('#vm-thumbs-grid'),
  thumbsCount:     $('#vm-thumbs-count'),
  clearBtn:        $('#vm-clear-btn'),

  transitionSlider: $('#vm-transition-slider'),
  transitionValue:  $('#vm-transition-value'),
  durationSlider:   $('#vm-duration-slider'),
  durationValue:    $('#vm-duration-value'),

  generateBtn:  $('#vm-generate-btn'),
  progressCard: $('#vm-progress-card'),
  progressFill: $('#vm-progress-fill'),
  progressStatus: $('#vm-progress-status'),

  resultCard:   $('#vm-result-card'),
  videoPlayer:  $('#vm-video-player'),
  downloadBtn:  $('#vm-download-btn'),
  startOverBtn: $('#vm-start-over-btn'),

  errorToast: $('#vm-error-toast'),
  errorMsg:   $('#vm-error-msg'),
  errorClose: $('#vm-error-close'),
};

// ─── State ───────────────────────────────────────────────────
let selectedFiles = [];   // File[] – kept for thumbnail previews
let uploadedIds   = [];   // string[] – server-side file IDs after upload
let isGenerating  = false;

// ─── Helpers ─────────────────────────────────────────────────
function showError(msg) {
  dom.errorMsg.textContent = msg;
  dom.errorToast.classList.add('active');
}

function hideError() {
  dom.errorToast.classList.remove('active');
}

function setGenerateEnabled(enabled) {
  dom.generateBtn.disabled = !enabled;
}

function updateThumbsCount() {
  const count = selectedFiles.length;
  dom.thumbsCount.textContent = `已选择 ${count} 张照片`;
  dom.thumbsContainer.classList.toggle('active', count > 0);
  setGenerateEnabled(count >= 2);
}

function renderThumbnails() {
  dom.thumbsGrid.innerHTML = '';
  selectedFiles.forEach((file, idx) => {
    const div = document.createElement('div');
    div.className = 'vm-thumb-item';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;

    const rm = document.createElement('button');
    rm.className = 'vm-thumb-remove';
    rm.innerHTML = '&times;';
    rm.setAttribute('aria-label', '删除照片');
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFiles.splice(idx, 1);
      uploadedIds.splice(idx, 1);   // also drop corresponding server id
      renderThumbnails();
      updateThumbsCount();
    });

    div.appendChild(img);
    div.appendChild(rm);
    dom.thumbsGrid.appendChild(div);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── File selection ──────────────────────────────────────────
function handleFiles(files) {
  hideError();
  const images = Array.from(files).filter((f) => f.type.startsWith('image/'));

  if (images.length === 0) {
    showError('请选择图片文件（JPG、PNG、WEBP）。');
    return;
  }

  if (selectedFiles.length + images.length > VM_CONFIG.MAX_PHOTOS) {
    showError(`最多允许 ${VM_CONFIG.MAX_PHOTOS} 张照片。`);
    return;
  }

  selectedFiles = selectedFiles.concat(images);
  renderThumbnails();
  updateThumbsCount();
}

dom.browseBtn.addEventListener('click', () => dom.fileInput.click());
dom.fileInput.addEventListener('change', () => {
  if (dom.fileInput.files.length) {
    handleFiles(dom.fileInput.files);
    dom.fileInput.value = '';
  }
});

dom.uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.uploadZone.classList.add('dragover');
});
dom.uploadZone.addEventListener('dragleave', () => {
  dom.uploadZone.classList.remove('dragover');
});
dom.uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    handleFiles(e.dataTransfer.files);
  }
});
dom.uploadZone.addEventListener('click', () => dom.fileInput.click());

dom.clearBtn.addEventListener('click', () => {
  selectedFiles = [];
  uploadedIds = [];
  renderThumbnails();
  updateThumbsCount();
  hideError();
});

// ─── Settings ────────────────────────────────────────────────
dom.transitionSlider.addEventListener('input', () => {
  dom.transitionValue.textContent = `${dom.transitionSlider.value}s`;
});
dom.durationSlider.addEventListener('input', () => {
  dom.durationValue.textContent = `${dom.durationSlider.value}s`;
});

// ─── Upload to local server ──────────────────────────────────
async function uploadFiles(files) {
  const formData = new FormData();
  files.forEach((f) => formData.append('photos', f));

  const resp = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!resp.ok) {
    let msg = `上传失败（${resp.status}）`;
    try { const j = await resp.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const json = await resp.json();
  if (!json.success || !json.files) {
    throw new Error('上传响应缺少文件数据');
  }

  return json.files.map((f) => f.id);  // server file IDs
}

// ─── Generate via local server ───────────────────────────────
async function startGeneration(fileIds, transitionDuration, totalDurationPerPhoto) {
  const resp = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: fileIds, transitionDuration, totalDurationPerPhoto }),
  });

  if (!resp.ok) {
    let msg = `生成请求失败（${resp.status}）`;
    try { const j = await resp.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const json = await resp.json();
  if (!json.success || !json.jobId) {
    throw new Error('生成响应缺少 jobId');
  }

  return json.jobId;
}

async function pollJobStatus(jobId) {
  let retries = 0;

  while (retries < VM_CONFIG.POLL_MAX_RETRIES) {
    await sleep(VM_CONFIG.POLL_INTERVAL);
    retries++;

    const resp = await fetch(`/api/status/${jobId}`);
    if (!resp.ok) {
      throw new Error(`状态检查失败（${resp.status}）`);
    }

    const json = await resp.json();
    if (!json.success) {
      throw new Error(json.error || '状态检查失败');
    }

    // Update progress bar
    const pct = Math.min(99, Math.round(json.progress || 0));
    dom.progressFill.style.width = `${pct}%`;

    if (json.status === 'completed') {
      dom.progressFill.style.width = '100%';
      return json.outputFile;  // filename, not full path
    }

    if (json.status === 'failed') {
      throw new Error(json.error || '服务器端视频生成失败');
    }

    // Still processing – update status text
    dom.progressStatus.textContent = `正在制作视频... ${pct}%`;
  }

  throw new Error('视频生成超时。请减少照片数量或缩短时长后重试。');
}

// ─── Progress / Result UI ────────────────────────────────────
function showProgress(text) {
  dom.progressCard.style.display = 'block';
  dom.progressCard.classList.add('active');
  dom.progressStatus.textContent = text || '正在启动...';
  dom.progressFill.style.width = '0%';
}

function hideProgress() {
  dom.progressCard.style.display = 'none';
  dom.progressCard.classList.remove('active');
}

function showResult(jobId) {
  dom.resultCard.style.display = 'block';
  dom.resultCard.classList.add('active');
  dom.videoPlayer.src = `/api/download/${jobId}`;
  dom.downloadBtn.href = `/api/download/${jobId}`;
}

function hideResult() {
  dom.resultCard.style.display = 'none';
  dom.resultCard.classList.remove('active');
  dom.videoPlayer.pause();
  dom.videoPlayer.src = '';
  dom.downloadBtn.href = '#';
}

// ─── Main generate flow ──────────────────────────────────────
async function onGenerate() {
  if (isGenerating) return;
  if (selectedFiles.length < 2) {
    showError('请至少选择 2 张照片。');
    return;
  }

  isGenerating = true;
  hideError();
  hideResult();
  dom.generateBtn.disabled = true;
  dom.generateBtn.querySelector('.vm-btn-text').textContent = '正在上传...';

  try {
    // Phase 1: Upload files to server
    uploadedIds = [];
    showProgress('正在上传照片到服务器...');
    dom.progressFill.style.width = '5%';

    uploadedIds = await uploadFiles(selectedFiles);

    dom.progressFill.style.width = '25%';
    dom.progressStatus.textContent = '照片已上传。开始生成视频...';

    // Phase 2: Request generation
    const transitionVal = parseFloat(dom.transitionSlider.value);
    const durationVal = parseFloat(dom.durationSlider.value);

    dom.generateBtn.querySelector('.vm-btn-text').textContent = '正在生成...';
    dom.progressFill.style.width = '30%';
    dom.progressStatus.textContent = '服务器正在处理你的照片...';

    const jobId = await startGeneration(uploadedIds, transitionVal, durationVal);

    // Phase 3: Poll for completion
    dom.progressStatus.textContent = '正在制作视频...';
    const outputFile = await pollJobStatus(jobId);

    // Phase 4: Show result
    dom.progressFill.style.width = '100%';
    dom.progressStatus.textContent = '完成！';

    await sleep(400);
    hideProgress();
    showResult(jobId);
    dom.generateBtn.querySelector('.vm-btn-text').textContent = '生成视频';
  } catch (err) {
    console.error('视频生成错误：', err);
    hideProgress();
    showError(err.message || '出了点问题。服务器是否在运行？');
    dom.generateBtn.querySelector('.vm-btn-text').textContent = '生成视频';
  } finally {
    isGenerating = false;
    dom.generateBtn.disabled = selectedFiles.length < 2;
  }
}

dom.generateBtn.addEventListener('click', onGenerate);

// ─── Start over ──────────────────────────────────────────────
dom.startOverBtn.addEventListener('click', () => {
  selectedFiles = [];
  uploadedIds = [];
  renderThumbnails();
  updateThumbsCount();
  hideResult();
  hideProgress();
  hideError();
  dom.generateBtn.querySelector('.vm-btn-text').textContent = '生成视频';
  dom.generateBtn.disabled = true;
});

// ─── Error close ─────────────────────────────────────────────
dom.errorClose.addEventListener('click', hideError);

// ─── Initial state ───────────────────────────────────────────
setGenerateEnabled(false);
console.log('🎬 视频制作器（本地后端）已就绪');
