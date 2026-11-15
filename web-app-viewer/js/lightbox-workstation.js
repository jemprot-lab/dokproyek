/**
 * lightbox-workstation.js
 * Deep Zoom 500%, Pan Drag, Rotate 90°, Split-Screen Compare, dan Keyboard Shortcuts.
 */

const LightboxWorkstation = {
  photos: [],
  currentIndex: 0,
  scale: 1,
  rotation: 0,
  translateX: 0,
  translateY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  blobCache: {},

  async fetchPhotoDataUrl(photo) {
    if (!photo) return '';
    if (this.blobCache[photo.id]) return this.blobCache[photo.id];
    const res = await callGasApi('GET_PHOTO_BLOB', { fileId: photo.id });
    if (res.status === 'success' && res.base64Data) {
      const dataUrl = `data:${res.mimeType || 'image/jpeg'};base64,${res.base64Data}`;
      this.blobCache[photo.id] = dataUrl;
      return dataUrl;
    }
    return photo.previewUrl || photo.thumbnailUrl || '';
  },

  init() {
    const stage = document.getElementById('lightbox-stage');
    const img = document.getElementById('lightbox-img');
    if (!stage || !img) return;

    // Deep Zoom 100% - 500% dengan roda mouse
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      this.setZoom(this.scale + delta);
    }, { passive: false });

    // Pan Drag
    img.addEventListener('mousedown', (e) => {
      if (this.scale <= 1) return;
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.applyTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const modal = document.getElementById('lightbox-modal');
      if (!modal || modal.classList.contains('hidden')) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'r' || e.key === 'R') this.rotate90();
      if (e.key === '+' || e.key === '=') this.setZoom(this.scale + 0.5);
      if (e.key === '-') this.setZoom(this.scale - 0.5);
    });
  },

  open(photosList, index) {
    this.photos = photosList;
    this.currentIndex = index;
    document.getElementById('lightbox-modal').classList.remove('hidden');
    this.renderCurrent();
  },

  close() {
    document.getElementById('lightbox-modal').classList.add('hidden');
  },

  next() {
    if (this.photos.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.photos.length;
    this.renderCurrent();
  },

  prev() {
    if (this.photos.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.photos.length) % this.photos.length;
    this.renderCurrent();
  },

  setZoom(newScale) {
    this.scale = Math.min(5, Math.max(1, newScale));
    if (this.scale === 1) {
      this.translateX = 0;
      this.translateY = 0;
    }
    document.getElementById('lightbox-zoom-label').textContent = `${Math.round(this.scale * 100)}%`;
    this.applyTransform();
  },

  rotate90() {
    this.rotation = (this.rotation + 90) % 360;
    this.applyTransform();
  },

  resetTransform() {
    this.scale = 1;
    this.rotation = 0;
    this.translateX = 0;
    this.translateY = 0;
    document.getElementById('lightbox-zoom-label').textContent = '100%';
    this.applyTransform();
  },

  applyTransform() {
    const img = document.getElementById('lightbox-img');
    img.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale}) rotate(${this.rotation}deg)`;
  },

  async renderCurrent() {
    const photo = this.photos[this.currentIndex];
    if (!photo) return;
    this.resetTransform();

    const img = document.getElementById('lightbox-img');
    img.src = '';
    img.alt = '⏳ Memuat foto...';

    document.getElementById('lightbox-filename').textContent = `${photo.name} (⏳ Memuat...)`;
    document.getElementById('lightbox-time').textContent = photo.takenTime || '-';
    document.getElementById('lightbox-caption').textContent = photo.caption || 'Belum ada catatan.';

    const gpsEl = document.getElementById('lightbox-gps');
    if (photo.gps) {
      gpsEl.innerHTML = `<a href="https://maps.google.com/?q=${photo.gps.lat},${photo.gps.lng}" target="_blank" class="text-emerald-400 underline font-mono-code">📍 ${photo.gps.lat.toFixed(6)}, ${photo.gps.lng.toFixed(6)}</a>`;
    } else {
      gpsEl.innerHTML = `<span class="text-orange-400">⚠️ Tanpa Koordinat GPS</span>`;
    }

    const dataUrl = await this.fetchPhotoDataUrl(photo);
    if (this.photos[this.currentIndex]?.id === photo.id) {
      img.src = dataUrl;
      img.alt = photo.name;
      document.getElementById('lightbox-filename').textContent = photo.name;
    }
  },

  async openSplitCompare(twoPhotos) {
    if (!twoPhotos || twoPhotos.length !== 2) {
      alert('Pilih tepat 2 foto untuk membandingkan Before / After.');
      return;
    }
    const modal = document.getElementById('split-compare-modal');
    const leftImg = document.getElementById('compare-left-img');
    const rightImg = document.getElementById('compare-right-img');
    leftImg.src = '';
    rightImg.src = '';
    document.getElementById('compare-left-label').textContent = `⏳ Memuat ${twoPhotos[0].name}...`;
    document.getElementById('compare-right-label').textContent = `⏳ Memuat ${twoPhotos[1].name}...`;
    modal.classList.remove('hidden');

    const [leftUrl, rightUrl] = await Promise.all([
      this.fetchPhotoDataUrl(twoPhotos[0]),
      this.fetchPhotoDataUrl(twoPhotos[1])
    ]);

    leftImg.src = leftUrl;
    rightImg.src = rightUrl;
    document.getElementById('compare-left-label').textContent = `${twoPhotos[0].name} (${twoPhotos[0].takenTime || '-'})`;
    document.getElementById('compare-right-label').textContent = `${twoPhotos[1].name} (${twoPhotos[1].takenTime || '-'})`;
  },

  closeSplitCompare() {
    document.getElementById('split-compare-modal').classList.add('hidden');
  }
};
