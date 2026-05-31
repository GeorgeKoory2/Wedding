// ── PWA Service Worker registration ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Shared utilities ──────────────────────────────────────────────────────────
window.WeddingUtils = {
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  getDeviceId() {
    let id = localStorage.getItem('wedding_device_id');
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem('wedding_device_id', id);
    }
    return id;
  },

  async uploadFile(file, onProgress) {
    const attempt = () => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd  = new FormData();
      fd.append('files', file);
      fd.append('device_id', this.getDeviceId());

      // Allow 3 minutes for large video uploads
      xhr.timeout = 180000;
      xhr.open('POST', '/api/upload');
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status === 200) resolve(data);
          else reject(new Error(data.error || 'Upload failed'));
        } catch { reject(new Error('Invalid response')); }
      };
      xhr.onerror   = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Timeout'));
      xhr.send(fd);
    });

    // Retry up to 3 times on failure
    let lastErr;
    for (let i = 0; i < 3; i++) {
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 1500 * i));
        return await attempt();
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
};

// ── Add-to-home-screen nudge ──────────────────────────────────────────────────
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
});
