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

  async fetchPhotoDataUrl(photo, silent = false) {
    if (!photo) return '';
    if (this.blobCache[photo.id]) return this.blobCache[photo.id];
    const res = await callGasApi('GET_PHOTO_BLOB', {
      fileId: photo.id,
      preview: true,
      _silent: silent
    });
    if (res.status === 'success' && res.base64Data) {
      const dataUrl = `data:${res.mimeType || 'image/jpeg'};base64,${res.base64Data}`;
      this.blobCache[photo.id] = dataUrl;
      return dataUrl;
    }
    return photo.previewUrl || photo.thumbnailUrl || '';
  },

  prefetchAdjacent() {
    if (this.photos.length <= 1) return;
    const nextPhoto = this.photos[(this.currentIndex + 1) % this.photos.length];
    const prevPhoto = this.photos[(this.currentIndex - 1 + this.photos.length) % this.photos.length];
    if (nextPhoto && !this.blobCache[nextPhoto.id]) this.fetchPhotoDataUrl(nextPhoto, true);
    if (prevPhoto && !this.blobCache[prevPhoto.id]) this.fetchPhotoDataUrl(prevPhoto, true);
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

    // Touch Pinch-to-Zoom (2 jari), Pan (1 jari saat zoom), Double-Tap Zoom, & Swipe (saat 100%)
    stage.style.touchAction = 'none';
    img.style.touchAction = 'none';
    const getTouchDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    stage.addEventListener('touchstart', (e) => {
      if (e.target && e.target.closest('button')) return;
      if (e.touches.length === 2) {
        this._pinchStartDist = getTouchDist(e.touches);
        this._pinchStartScale = this.scale;
        this.isDragging = false;
        this._swipeStartX = null;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const now = Date.now();
        if (now - (this._lastTapAt || 0) < 300) {
          this._lastTapAt = 0;
          this.setZoom(this.scale > 1 ? 1 : 2.5);
          this.isDragging = false;
          this._swipeStartX = null;
          return;
        }
        this._lastTapAt = now;
        if (this.scale > 1) {
          this.isDragging = true;
          this.startX = t.clientX - this.translateX;
          this.startY = t.clientY - this.translateY;
          this._swipeStartX = null;
        } else {
          this.isDragging = false;
          this._swipeStartX = t.clientX;
          this._swipeStartY = t.clientY;
        }
      }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this._pinchStartDist > 0) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        this.setZoom(this._pinchStartScale * (dist / this._pinchStartDist));
      } else if (e.touches.length === 1 && this.isDragging) {
        e.preventDefault();
        const t = e.touches[0];
        this.translateX = t.clientX - this.startX;
        this.translateY = t.clientY - this.startY;
        this.applyTransform();
      }
    }, { passive: false });

    stage.addEventListener('touchend', (e) => {
      if (e.touches.length === 1 && this.scale > 1) {
        this._pinchStartDist = 0;
        this.isDragging = true;
        this.startX = e.touches[0].clientX - this.translateX;
        this.startY = e.touches[0].clientY - this.translateY;
        return;
      }
      if (e.touches.length === 0) {
        if (this.scale === 1 && this._swipeStartX !== null && e.changedTouches.length === 1) {
          const dx = e.changedTouches[0].clientX - this._swipeStartX;
          const dy = e.changedTouches[0].clientY - (this._swipeStartY || 0);
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) this.next();
            else this.prev();
          }
        }
        this.isDragging = false;
        this._pinchStartDist = 0;
        this._swipeStartX = null;
      }
    }, { passive: true });

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
    if (window.App && typeof window.App.pushHistoryState === 'function') {
      window.App.pushHistoryState('lightbox');
    }
    document.getElementById('lightbox-modal').classList.remove('hidden');
    this.renderCurrent();
  },

  close(fromPopState = false) {
    const modal = document.getElementById('lightbox-modal');
    if (modal) modal.classList.add('hidden');
    if (!fromPopState && window.history.state?.view === 'lightbox') {
      window.history.back();
    }
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
    const spinner = document.getElementById('lightbox-spinner');
    const isCached = Boolean(this.blobCache[photo.id]);
    img.src = isCached ? this.blobCache[photo.id] : (photo.thumbnailUrl || '');
    img.alt = photo.name;
    if (spinner) spinner.classList.toggle('hidden', isCached);

    document.getElementById('lightbox-filename').textContent = isCached ? photo.name : `${photo.name} (Memuat...)`;
    document.getElementById('lightbox-time').textContent = photo.takenTime || '-';
    document.getElementById('lightbox-caption').textContent = photo.caption || 'Belum ada catatan.';

    const gpsEl = document.getElementById('lightbox-gps');
    if (photo.gps) {
      gpsEl.innerHTML = `<a href="https://maps.google.com/?q=${photo.gps.lat},${photo.gps.lng}" target="_blank" class="text-emerald-400 underline font-mono-code">📍 ${photo.gps.lat.toFixed(6)}, ${photo.gps.lng.toFixed(6)}</a>`;
    } else {
      gpsEl.innerHTML = `<span class="text-orange-400">⚠️ Tanpa Koordinat GPS</span>`;
    }

    this.renderExifPanel(photo);

    const dataUrl = await this.fetchPhotoDataUrl(photo, true);
    if (this.photos[this.currentIndex]?.id === photo.id) {
      img.src = dataUrl;
      img.alt = photo.name;
      if (spinner) spinner.classList.add('hidden');
      document.getElementById('lightbox-filename').textContent = photo.name;
      this.prefetchAdjacent();
    }
  },

  toggleExifPanel() {
    const panel = document.getElementById('lightbox-exif-panel');
    if (!panel) return;
    if (window.innerWidth >= 768) {
      const isHidden = panel.classList.contains('md:hidden');
      panel.classList.toggle('md:hidden', !isHidden);
      panel.classList.toggle('md:flex', isHidden);
    } else {
      const isHidden = panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !isHidden);
      panel.classList.toggle('flex', isHidden);
    }
  },

  renderExifPanel(photo) {
    const body = document.getElementById('lightbox-exif-body');
    if (!body || !photo) return;

    const esc = (str) =>
      String(str || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[ch]));

    const exif = photo.exif || {};
    const sizeMb = photo.size ? `${(photo.size / (1024 * 1024)).toFixed(2)} MB` : '-';
    const dims = exif.width && exif.height ? `${exif.width} × ${exif.height} px` : '-';
    const camera = [exif.cameraMake, exif.cameraModel].filter(Boolean).join(' ').trim() || '-';
    const expStr = exif.exposureTime
      ? (exif.exposureTime < 1 ? `1/${Math.round(1 / exif.exposureTime)}s` : `${exif.exposureTime}s`)
      : '';
    const camSpecs = [
      exif.aperture ? `f/${exif.aperture}` : '',
      expStr,
      exif.isoSpeed ? `ISO ${exif.isoSpeed}` : '',
      exif.focalLength ? `${exif.focalLength}mm` : '',
      exif.flashUsed === true ? '⚡ Flash' : (exif.flashUsed === false ? 'Tanpa Flash' : ''),
    ].filter(Boolean).join(' • ') || '-';

    const row = (label, valHtml) => `
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">${label}</div>
        <div class="text-slate-100 font-medium mt-0.5 break-words">${valHtml}</div>
      </div>
    `;

    const gpsHtml = photo.gps
      ? `<a href="https://maps.google.com/?q=${photo.gps.lat},${photo.gps.lng}" target="_blank" class="text-emerald-400 underline font-mono-code">📍 ${photo.gps.lat.toFixed(6)}, ${photo.gps.lng.toFixed(6)}</a>` +
        (photo.gps.alt !== null && photo.gps.alt !== undefined ? `<div class="text-[11px] text-slate-400 mt-0.5">Ketinggian: ${Math.round(photo.gps.alt)} m</div>` : '')
      : '<span class="text-orange-400">⚠️ Tidak ada koordinat GPS</span>';

    body.innerHTML = [
      row('Nama File', esc(photo.name || '-')),
      row('Waktu Potret Asli', `<span class="font-mono-code">${esc(photo.takenTime || '-')}</span>`),
      row('Lokasi GPS', gpsHtml),
      row('Perangkat / Kamera', esc(camera)),
      row('Resolusi & Ukuran', `${esc(dims)} • ${esc(sizeMb)}`),
      row('Setelan Kamera', esc(camSpecs)),
      row('Catatan Proyek', esc(photo.caption || 'Belum ada catatan.')),
    ].join('');
  },

  async openSplitCompare(twoPhotos) {
    if (!twoPhotos || twoPhotos.length !== 2) {
      if (typeof UiFeedback !== 'undefined') {
        UiFeedback.toast('Pilih tepat 2 foto untuk membandingkan Before / After.', 'warning');
      } else {
        alert('Pilih tepat 2 foto untuk membandingkan Before / After.');
      }
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
