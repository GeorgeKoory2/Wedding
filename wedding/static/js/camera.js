/* ─── Camera Page ─────────────────────────────────────────────── */

let stream       = null;
let mediaRecorder = null;
let recordedChunks = [];
let currentMode  = 'photo';   // 'photo' | 'video'
let isRecording  = false;
let capturedBlob = null;
let facingMode   = 'environment';
let recordTimer  = null;
let recordStart  = null;
let mirrorX      = false;   // horizontal flip toggle
let renderCanvas = null;
let renderCtx    = null;
let renderRAF    = null;
let recordStream = null;

const feed      = document.getElementById('cameraFeed');
const canvas    = document.getElementById('captureCanvas');
const status    = document.getElementById('cameraStatus');
const recBadge  = document.getElementById('recBadge');
const shutterBtn = document.getElementById('shutterBtn');
const shutterDot = document.getElementById('shutterDot');

// ── Init ──────────────────────────────────────────────────────────
async function startCamera() {
  stopStream();
  hidePermError();
  setStatus('Starting camera…');

  const constraints = {
    video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: currentMode === 'video'
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    feed.srcObject = stream;
    await feed.play();
    setStatus(currentMode === 'photo' ? 'Tap shutter to capture' : 'Tap to start recording');
    document.getElementById('flipBtn').style.display = '';
    applyMirrorPreview();
  } catch (err) {
    console.error('Camera error', err);
    showPermError();
  }
}

function stopStream() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    feed.srcObject = null;
  }
}

// ── Mode ──────────────────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  document.getElementById('photoBtn').classList.toggle('active', mode === 'photo');
  document.getElementById('videoBtn').classList.toggle('active', mode === 'video');
  hidePreview();
  startCamera();
}

// ── Shutter ───────────────────────────────────────────────────────
function handleShutter() {
  if (currentMode === 'photo') {
    takePhoto();
  } else {
    isRecording ? stopRecording() : startRecording();
  }
}

function takePhoto() {
  if (!stream) return;
  const w = feed.videoWidth  || 1280;
  const h = feed.videoHeight || 720;
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.save();
  if (mirrorX) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(feed, 0, 0, w, h);
  ctx.restore();
  canvas.toBlob(blob => {
    capturedBlob = blob;
    showPhotoPreview(URL.createObjectURL(blob));
  }, 'image/jpeg', 0.92);
  flashViewfinder();
}

function startRecording() {
  if (!stream) return;
  recordedChunks = [];
  recordStream = getRecordStream();
  const opts = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? { mimeType: 'video/webm;codecs=vp9' }
    : MediaRecorder.isTypeSupported('video/webm')
    ? { mimeType: 'video/webm' }
    : {};

  try {
    mediaRecorder = new MediaRecorder(recordStream, opts);
  } catch {
    mediaRecorder = new MediaRecorder(recordStream);
  }

  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = finishRecording;
  mediaRecorder.start(100);

  isRecording = true;
  recBadge.style.display = 'block';
  shutterBtn.classList.add('recording');
  recordStart = Date.now();
  recordTimer = setInterval(updateRecordTime, 500);
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    recBadge.style.display = 'none';
    shutterBtn.classList.remove('recording');
    clearInterval(recordTimer);
    setStatus('Processing…');
  }
}

function finishRecording() {
  stopRenderLoop();
  const mimeType = recordedChunks[0]?.type || 'video/webm';
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  capturedBlob = new Blob(recordedChunks, { type: mimeType });
  capturedBlob._ext = ext;
  showVideoPreview(URL.createObjectURL(capturedBlob));
}

// ── Mirrored recording stream ───────────────────────────────────────
function getRecordStream() {
  if (!mirrorX) return stream;

  const w = feed.videoWidth  || 1280;
  const h = feed.videoHeight || 720;
  renderCanvas = document.createElement('canvas');
  renderCanvas.width  = w;
  renderCanvas.height = h;
  renderCtx = renderCanvas.getContext('2d');

  const draw = () => {
    renderCtx.save();
    renderCtx.translate(w, 0);
    renderCtx.scale(-1, 1);
    renderCtx.drawImage(feed, 0, 0, w, h);
    renderCtx.restore();
    renderRAF = requestAnimationFrame(draw);
  };
  draw();

  const canvasStream = renderCanvas.captureStream(30);
  stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
  return canvasStream;
}

function stopRenderLoop() {
  if (renderRAF) {
    cancelAnimationFrame(renderRAF);
    renderRAF = null;
  }
  renderCanvas = null;
  renderCtx = null;
  recordStream = null;
}

function updateRecordTime() {
  const s = Math.floor((Date.now() - recordStart) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  setStatus(`Recording ${mm}:${ss} — tap to stop`);
}

// ── Preview ───────────────────────────────────────────────────────
function showPhotoPreview(url) {
  stopStream();
  document.getElementById('photoPreview').src = url;
  document.getElementById('photoPreview').style.display = 'block';
  document.getElementById('videoPreview').style.display = 'none';
  document.getElementById('viewfinderBox').style.display = 'none';
  document.getElementById('previewSection').style.display = 'block';
  document.querySelector('.camera-controls').style.display = 'none';
  document.querySelector('.mode-toggle').style.display = 'none';
  setStatus('');
}

function showVideoPreview(url) {
  stopStream();
  const vp = document.getElementById('videoPreview');
  vp.src = url;
  vp.style.display = 'block';
  document.getElementById('photoPreview').style.display = 'none';
  document.getElementById('viewfinderBox').style.display = 'none';
  document.getElementById('previewSection').style.display = 'block';
  document.querySelector('.camera-controls').style.display = 'none';
  document.querySelector('.mode-toggle').style.display = 'none';
  setStatus('');
}

function hidePreview() {
  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('successBanner').style.display = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('viewfinderBox').style.display = 'block';
  document.querySelector('.camera-controls').style.display = 'flex';
  document.querySelector('.mode-toggle').style.display = 'flex';
  capturedBlob = null;
}

function retake() {
  hidePreview();
  startCamera();
}

// ── Upload ────────────────────────────────────────────────────────
async function uploadCapture() {
  if (!capturedBlob) return;

  const btn = document.getElementById('uploadBtn');
  const prog = document.getElementById('uploadProgress');
  const fill = document.getElementById('progressFill');
  const label = document.getElementById('progressLabel');

  btn.style.display = 'none';
  document.querySelector('.btn-outline').style.display = 'none';
  prog.style.display = 'block';

  const ext  = capturedBlob._ext || (currentMode === 'photo' ? 'jpg' : 'webm');
  const name = `wedding_${currentMode}_${Date.now()}.${ext}`;
  const file = new File([capturedBlob], name, { type: capturedBlob.type });

  try {
    await WeddingUtils.uploadFile(file, pct => {
      fill.style.width = pct + '%';
      label.textContent = `Uploading… ${pct}%`;
    });
    fill.style.width = '100%';
    label.textContent = 'Done!';
    setTimeout(() => {
      prog.style.display = 'none';
      document.getElementById('successBanner').style.display = 'block';
    }, 400);
  } catch (err) {
    label.textContent = 'Upload failed — please try again';
    fill.style.background = '#c0392b';
    btn.style.display = 'inline-flex';
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function flipCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
}

function toggleMirror() {
  mirrorX = !mirrorX;
  document.getElementById('mirrorBtn').classList.toggle('active', mirrorX);
  applyMirrorPreview();
}

function applyMirrorPreview() {
  feed.style.transform = mirrorX ? 'scaleX(-1)' : 'scaleX(1)';
}

function flashViewfinder() {
  const vf = document.getElementById('viewfinderBox');
  vf.style.transition = 'opacity .08s';
  vf.style.opacity = '0.2';
  setTimeout(() => { vf.style.opacity = '1'; }, 80);
}

function setStatus(msg) { status.textContent = msg; }

function showPermError() {
  document.getElementById('viewfinderBox').style.display = 'none';
  document.querySelector('.camera-controls').style.display = 'none';
  document.getElementById('permError').style.display = 'block';
  setStatus('');
}
function hidePermError() { document.getElementById('permError').style.display = 'none'; }

// ── Boot ──────────────────────────────────────────────────────────
startCamera();
