/* ─── Gallery ─────────────────────────────────────────────────── */

let allItems      = [];
let filteredItems = [];
let currentFilter = 'all';
let currentPage   = 1;
const PAGE_LIMIT  = 30;
let lbIndex       = 0;
let ssInterval    = null;
let ssIndex       = 0;
let ssImages      = [];

// Read the gallery code stored in the page (set by server into a meta tag)
const GALLERY_CODE = document.querySelector('meta[name="gallery-code"]')?.content || '';

// ── Load ──────────────────────────────────────────────────────────
async function loadGallery(reset = true) {
  if (reset) {
    currentPage = 1;
    filteredItems = [];
    document.getElementById('galleryGrid').innerHTML =
      '<div class="gallery-loading" id="galleryLoading"><div class="loading-ring"></div><p>Loading memories…</p></div>';
    document.getElementById('galleryEmpty').style.display = 'none';
    document.getElementById('loadMoreWrap').style.display = 'none';
  }

  try {
    // Pass code as param so session cookie issues don't block the fetch
    const urlParams = new URLSearchParams(window.location.search);
  const t = urlParams.get('t') || '';
  const url = `/api/gallery?page=${currentPage}&limit=${PAGE_LIMIT}${t ? '&t=' + encodeURIComponent(t) : ''}`;
    const res  = await fetch(url, { credentials: 'same-origin' });

    if (res.status === 403) {
      // Session lost — redirect back to lock screen
      window.location.href = '/gallery';
      return;
    }

    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }

    const data = await res.json();

    if (data.error) {
      showGridError(data.error);
      return;
    }

    if (reset) allItems = data.items;
    else       allItems = [...allItems, ...data.items];

    applyFilter(currentFilter, false);

    const total = data.total;
    document.getElementById('mediaCount').textContent =
      `${total} memor${total !== 1 ? 'ies' : 'y'}`;

    document.getElementById('loadMoreWrap').style.display =
      (allItems.length < total) ? 'block' : 'none';

  } catch (e) {
    showGridError('Could not load photos. Please refresh the page.');
    console.error('Gallery load error:', e);
  }
}

function showGridError(msg) {
  document.getElementById('galleryGrid').innerHTML = `
    <div class="gallery-loading" style="grid-column:1/-1">
      <p style="color:#c0392b;margin-bottom:16px">⚠ ${msg}</p>
      <button class="btn-gold" onclick="loadGallery()">Try Again</button>
    </div>`;
}

function applyFilter(filter, doRender = true) {
  currentFilter = filter;
  filteredItems = filter === 'all' ? allItems : allItems.filter(i => i.media_type === filter);
  if (doRender) renderGrid();
}

function setFilter(filter, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilter(filter);
}

function renderGrid() {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';

  if (!filteredItems.length) {
    document.getElementById('galleryEmpty').style.display = 'block';
    return;
  }
  document.getElementById('galleryEmpty').style.display = 'none';

  filteredItems.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.onclick = () => openLightbox(idx);

    if (item.media_type === 'image') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = item.url;
      img.alt = 'Wedding memory';
      img.onerror = () => { div.style.background = '#e8e4dc'; };
      div.appendChild(img);
    } else {
      const vid = document.createElement('video');
      vid.src = item.url;
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'metadata';
      div.appendChild(vid);
      const badge = document.createElement('div');
      badge.className = 'video-badge';
      badge.textContent = '▶ VIDEO';
      div.appendChild(badge);
    }

    const overlay = document.createElement('div');
    overlay.className = 'gallery-item-overlay';
    div.appendChild(overlay);

    grid.appendChild(div);
  });
}

function loadMore() {
  currentPage++;
  loadGallery(false);
}

// ── Lightbox ──────────────────────────────────────────────────────
function openLightbox(idx) {
  lbIndex = idx;
  renderLightbox();
  document.getElementById('lightbox').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightbox') &&
      !e.target.classList.contains('lb-close')) return;
  if (e && (e.target.classList.contains('lb-prev') ||
      e.target.classList.contains('lb-next'))) return;
  document.getElementById('lightbox').style.display = 'none';
  const v = document.getElementById('lbVideo');
  v.pause();
  v.src = '';
  document.body.style.overflow = '';
}

function lbNav(dir) {
  lbIndex = (lbIndex + dir + filteredItems.length) % filteredItems.length;
  renderLightbox();
}

function renderLightbox() {
  const item = filteredItems[lbIndex];
  const img  = document.getElementById('lbImg');
  const vid  = document.getElementById('lbVideo');
  const dl   = document.getElementById('lbDownload');
  const date = document.getElementById('lbDate');
  const size = document.getElementById('lbSize');

  vid.pause();
  if (item.media_type === 'image') {
    img.src = item.url;
    img.style.display = 'block';
    vid.style.display = 'none';
    vid.src = '';
  } else {
    vid.src = item.url;
    vid.style.display = 'block';
    img.style.display = 'none';
  }
  dl.href = item.url;
  dl.download = item.filename;
  date.textContent = WeddingUtils.formatTime(item.upload_time);
  size.textContent = item.file_size;
}

// Keyboard navigation
document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (lb.style.display !== 'none') {
    if (e.key === 'ArrowLeft')  lbNav(-1);
    if (e.key === 'ArrowRight') lbNav(1);
    if (e.key === 'Escape') { lb.style.display = 'none'; document.body.style.overflow = ''; }
  }
  if (document.getElementById('slideshow').style.display !== 'none') {
    if (e.key === 'Escape') stopSlideshow();
  }
});

// Swipe
let touchStartX = 0;
document.getElementById('lightbox').addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });
document.getElementById('lightbox').addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 50) lbNav(dx < 0 ? 1 : -1);
});

// ── Slideshow ─────────────────────────────────────────────────────
function startSlideshow() {
  ssImages = filteredItems.filter(i => i.media_type === 'image');
  if (!ssImages.length) { alert('No photos available for slideshow.'); return; }
  ssIndex = 0;
  document.getElementById('slideshow').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  showSlide();
  ssInterval = setInterval(nextSlide, 4000);
}

function stopSlideshow() {
  clearInterval(ssInterval);
  document.getElementById('slideshow').style.display = 'none';
  document.getElementById('ssImg').src = '';
  document.getElementById('ssProgress').style.width = '0';
  document.body.style.overflow = '';
}

function showSlide() {
  const img  = document.getElementById('ssImg');
  const prog = document.getElementById('ssProgress');
  img.src = ssImages[ssIndex].url;
  prog.style.transition = 'none';
  prog.style.width = '0';
  requestAnimationFrame(() => {
    prog.style.transition = 'width 4s linear';
    prog.style.width = '100%';
  });
}

function nextSlide() {
  ssIndex = (ssIndex + 1) % ssImages.length;
  const img = document.getElementById('ssImg');
  img.style.animation = 'none';
  requestAnimationFrame(() => {
    img.style.animation = 'ssIn .8s ease both';
    showSlide();
  });
}

// ── Init ──────────────────────────────────────────────────────────
loadGallery();
