/**
 * app.js
 * Controller utama Web App & PWA Viewer: Auth/Magic Link bootstrap, PWA Install,
 * Search Proyek, Filter Bintang, Grid Foto, & Floating Action Bar.
 */

const App = {
  projects: [],
  currentProject: null,
  currentSubFolder: null,
  photos: [],
  selectedIds: new Set(),
  onlyStarred: false,
  deferredPwaPrompt: null,

  async init() {
    this.registerPwa();
    LightboxWorkstation.init();

    if (SessionState.magicToken) {
      this.showMainWorkspace();
      await this.loadProjects(true);
    } else if (SessionState.authToken) {
      this.showMainWorkspace();
      await this.loadProjects(false);
    } else {
      this.showLoginView();
    }
  },

  registerPwa() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPwaPrompt = e;
      const btn = document.getElementById('btn-install-pwa');
      if (btn) btn.classList.remove('hidden');
    });
  },

  async installPwa() {
    if (!this.deferredPwaPrompt) return;
    this.deferredPwaPrompt.prompt();
    await this.deferredPwaPrompt.userChoice;
    this.deferredPwaPrompt = null;
    document.getElementById('btn-install-pwa')?.classList.add('hidden');
  },

  showLoginView() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('workspace-view').classList.add('hidden');
  },

  showMainWorkspace() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('workspace-view').classList.remove('hidden');

    const isAdmin = SessionState.isAdmin();
    document.querySelectorAll('.admin-only').forEach((el) => {
      el.classList.toggle('hidden', !isAdmin);
    });

    const userLabel = document.getElementById('header-user-label');
    if (SessionState.magicToken) {
      userLabel.textContent = 'Mode Tautan Klien';
      document.getElementById('btn-logout').classList.add('hidden');
    } else if (SessionState.user) {
      userLabel.textContent = `${SessionState.user.username} (${SessionState.user.role})`;
      this.loadStorageStatus();
    }
  },

  async loadStorageStatus() {
    if (SessionState.magicToken) return;
    const res = await callGasApi('GET_STORAGE_STATUS', {});
    if (res.status !== 'success' || !res.storage) return;

    const s = res.storage;
    const card = document.getElementById('storage-quota-card');
    const bar = document.getElementById('storage-quota-bar');
    const text = document.getElementById('storage-quota-text');
    const due = document.getElementById('storage-due-text');
    const banner = document.getElementById('storage-alert-banner');

    card.classList.remove('hidden');
    text.textContent = `${Number(s.usedGb || 0).toFixed(2)} / ${s.limitGb} GB (${s.percent}%)`;
    due.textContent = s.billingDueDate ? `Jatuh tempo: ${s.billingDueDate}` : '';

    const pct = Math.min(100, Math.max(0, s.percent || 0));
    bar.style.width = `${pct}%`;
    bar.className = 'h-full transition-all ' + (pct >= 90 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500');

    const waLink = `https://wa.me/${s.vendorContactWa || ''}?text=${encodeURIComponent('Halo, saya mau upgrade kapasitas penyimpanan aplikasi proyek.')}`;
    if (!s.allowed || pct >= 100) {
      banner.className = 'bg-red-600 text-white px-4 py-2.5 text-xs font-bold text-center flex flex-wrap items-center justify-center gap-3 no-print';
      banner.innerHTML = `<span>${s.message || '🚫 Kapasitas penyimpanan penuh!'}</span><a href="${waLink}" target="_blank" class="px-3 py-1 bg-white text-red-700 rounded-lg">📲 Hubungi Penyedia / Upgrade</a>`;
      banner.classList.remove('hidden');
    } else if (pct >= 85) {
      banner.className = 'bg-amber-400 text-slate-900 px-4 py-2 text-xs font-bold text-center flex flex-wrap items-center justify-center gap-3 no-print';
      banner.innerHTML = `<span>⚠️ Penyimpanan hampir penuh (${Number(s.usedGb).toFixed(2)} GB / ${s.limitGb} GB). Segera hubungi penyedia sebelum upload terhenti.</span><a href="${waLink}" target="_blank" class="px-3 py-1 bg-slate-900 text-white rounded-lg">📲 Upgrade</a>`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  },

  async handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-pin').value.trim();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    const res = await callGasApi('LOGIN', { username, password });
    if (res.status === 'success') {
      SessionState.saveUser(res.user);
      this.showMainWorkspace();
      await this.loadProjects(false);
    } else {
      errEl.textContent = res.message || 'Login gagal.';
      errEl.classList.remove('hidden');
    }
  },

  logout() {
    SessionState.clear();
    window.location.reload();
  },

  configureGasUrl() {
    const current = localStorage.getItem('gas_api_url') || '';
    const next = prompt('Masukkan URL Web App Google Apps Script (/exec):', current);
    if (next && next.trim()) {
      localStorage.setItem('gas_api_url', next.trim());
      window.location.reload();
    }
  },

  async loadProjects(incrementMagicView = false) {
    const query = document.getElementById('project-search-input')?.value.trim() || '';
    const includeArchived = document.getElementById('toggle-archived')?.checked || false;

    const res = await callGasApi('SEARCH_PROJECTS', {
      query,
      includeArchived,
      limit: SessionState.isAdmin() ? 50 : 5,
      incrementView: incrementMagicView
    });

    if (res.status !== 'success') {
      alert(res.message || 'Gagal memuat proyek.');
      return;
    }

    if (res.magicLinkInfo) {
      const banner = document.getElementById('magic-banner');
      banner.classList.remove('hidden');
      banner.textContent = `🔗 Akses Tamu: ${res.magicLinkInfo.labelPenerima} (Aktif s/d ${res.magicLinkInfo.expiryDate} WIB)`;
    }

    this.projects = res.projects || [];
    this.renderSidebarProjects();

    if (this.projects.length > 0 && !this.currentProject) {
      this.selectProject(this.projects[0].folderId);
    }
  },

  renderSidebarProjects() {
    const list = document.getElementById('sidebar-projects');
    if (!list) return;

    list.innerHTML = this.projects.map((p) => {
      const isSelected = this.currentProject && this.currentProject.folderId === p.folderId;
      const statusBadge = p.projectStatus === 'ARCHIVED'
        ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">📦 ARSIP</span>'
        : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">🟢 AKTIF</span>';

      const subsHtml = isSelected
        ? `<div class="mt-2 pl-3 border-l-2 border-amber-400 space-y-1">
            ${p.subFolders.map((s) => `
              <button onclick="App.selectSubFolder('${s.subId}')" class="w-full text-left px-2.5 py-2 rounded-lg text-xs flex justify-between items-center ${this.currentSubFolder?.subId === s.subId ? 'bg-amber-500 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-100'}">
                <span class="truncate">${s.subName}</span>
                <span class="ml-2 text-[11px] opacity-75">${s.count}</span>
              </button>
            `).join('') || '<div class="text-xs text-slate-400 py-1">Belum ada folder tanggal.</div>'}
          </div>`
        : '';

      return `
        <div class="p-2.5 rounded-xl border ${isSelected ? 'border-amber-500 bg-amber-50/40' : 'border-slate-200 bg-white'}">
          <div class="flex items-center justify-between gap-2 cursor-pointer" onclick="App.selectProject('${p.folderId}')">
            <span class="font-semibold text-sm text-slate-900 truncate">📂 ${p.projectName}</span>
            ${statusBadge}
          </div>
          ${subsHtml}
        </div>
      `;
    }).join('') || '<div class="text-sm text-slate-400 text-center py-6">Tidak ada proyek ditemukan.</div>';
  },

  selectProject(folderId) {
    this.currentProject = this.projects.find((p) => p.folderId === folderId) || null;
    this.currentSubFolder = null;
    this.photos = [];
    this.selectedIds.clear();
    this.updateSelectionBar();
    this.renderSidebarProjects();

    if (this.currentProject && this.currentProject.subFolders.length > 0) {
      this.selectSubFolder(this.currentProject.subFolders[0].subId);
    } else {
      this.renderPhotoGrid();
    }
  },

  async selectSubFolder(subId) {
    if (!this.currentProject) return;
    this.currentSubFolder = this.currentProject.subFolders.find((s) => s.subId === subId) || null;
    this.selectedIds.clear();
    this.updateSelectionBar();
    this.renderSidebarProjects();
    await this.loadPhotos();
  },

  async loadPhotos() {
    if (!this.currentSubFolder) return;
    document.getElementById('gallery-header-title').textContent =
      `${this.currentProject.projectName} › ${this.currentSubFolder.subName}`;
    document.getElementById('photo-grid').innerHTML =
      '<div class="col-span-full text-center py-12 text-slate-500">⏳ Memuat foto...</div>';

    const res = await callGasApi('LIST_PHOTOS', {
      subFolderId: this.currentSubFolder.subId,
      onlyStarred: this.onlyStarred
    });

    if (res.status === 'success') {
      this.photos = res.photos || [];
      this.renderPhotoGrid();
    }
  },

  toggleStarFilter() {
    this.onlyStarred = !this.onlyStarred;
    const btn = document.getElementById('btn-filter-star');
    btn.classList.toggle('bg-amber-500', this.onlyStarred);
    btn.classList.toggle('text-slate-900', this.onlyStarred);
    this.loadPhotos();
  },

  renderPhotoGrid() {
    const grid = document.getElementById('photo-grid');
    if (!this.photos.length) {
      grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400">Belum ada foto di folder ini.</div>';
      return;
    }

    const isAdmin = SessionState.isAdmin();
    grid.innerHTML = this.photos.map((p, idx) => {
      const checked = this.selectedIds.has(p.id);
      const gpsBadge = p.gps
        ? '<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-500 text-white">📍 GPS</span>'
        : '<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-orange-500 text-white">⚠️ No GPS</span>';

      return `
        <div class="bg-white rounded-xl border ${checked ? 'border-amber-500 ring-2 ring-amber-400' : 'border-slate-200'} overflow-hidden shadow-sm flex flex-col">
          <div class="relative aspect-[4/3] bg-slate-900 cursor-pointer" onclick="LightboxWorkstation.open(App.photos, ${idx})">
            <img src="${p.thumbnailUrl || p.previewUrl}" loading="lazy" alt="${p.name}" class="w-full h-full object-cover">
            <div class="absolute top-2 left-2 flex gap-1" onclick="event.stopPropagation()">
              <input type="checkbox" ${checked ? 'checked' : ''} onchange="App.toggleSelect('${p.id}')" class="w-5 h-5 accent-amber-500 rounded cursor-pointer">
            </div>
            <div class="absolute top-2 right-2">${gpsBadge}</div>
            ${p.starred ? '<div class="absolute bottom-2 right-2 text-lg drop-shadow">⭐</div>' : ''}
          </div>
          <div class="p-2.5 flex-1 flex flex-col justify-between gap-1.5">
            <div>
              <div class="text-xs font-bold text-slate-800 truncate">${p.name}</div>
              <div class="text-[11px] font-mono-code text-slate-500">${p.takenTime || '-'}</div>
              ${p.caption ? `<div class="text-xs text-slate-600 mt-1 line-clamp-2">📝 ${p.caption}</div>` : ''}
            </div>
            ${isAdmin ? `
              <div class="flex gap-1 pt-1 border-t border-slate-100">
                <button onclick="App.onToggleStar('${p.id}', ${p.starred})" class="flex-1 py-1 text-xs rounded bg-slate-100 hover:bg-amber-100">${p.starred ? '★ Bintang' : '☆ Bintang'}</button>
                <button onclick="App.onEditCaption('${p.id}', '${(p.caption || '').replace(/'/g, "\\'")}')" class="flex-1 py-1 text-xs rounded bg-slate-100 hover:bg-slate-200">📝 Catatan</button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  toggleSelect(fileId) {
    if (this.selectedIds.has(fileId)) {
      this.selectedIds.delete(fileId);
    } else {
      this.selectedIds.add(fileId);
    }
    this.updateSelectionBar();
    this.renderPhotoGrid();
  },

  updateSelectionBar() {
    const bar = document.getElementById('floating-action-bar');
    const count = this.selectedIds.size;
    if (count > 0) {
      bar.classList.remove('hidden');
      document.getElementById('selected-count-label').textContent = `${count} foto dipilih`;
    } else {
      bar.classList.add('hidden');
    }
  },

  getSelectedPhotos() {
    return this.photos.filter((p) => this.selectedIds.has(p.id));
  },

  async onToggleStar(fileId, currentStar) {
    if (await AdminManager.toggleStar(fileId, currentStar)) {
      await this.loadPhotos();
    }
  },

  async onEditCaption(fileId, currentCaption) {
    if (await AdminManager.editCaption(fileId, currentCaption)) {
      await this.loadPhotos();
    }
  },

  async onRenameCurrentProject() {
    if (!this.currentProject) return;
    if (await AdminManager.renameFolder(this.currentProject.folderId, this.currentProject.projectName)) {
      await this.loadProjects(false);
    }
  },

  async onToggleArchiveCurrentProject() {
    if (!this.currentProject) return;
    if (await AdminManager.toggleArchiveProject(this.currentProject.folderId, this.currentProject.projectStatus)) {
      this.currentProject = null;
      await this.loadProjects(false);
    }
  },

  async onBatchZip() {
    const statusEl = document.getElementById('export-status');
    await ExportEngine.downloadBatchZip(
      this.getSelectedPhotos(),
      this.currentProject?.projectName,
      this.currentSubFolder?.subName,
      (msg) => { statusEl.textContent = msg; }
    );
  },

  async onBatchPdf() {
    const statusEl = document.getElementById('export-status');
    await ExportEngine.generatePdfReport(
      this.getSelectedPhotos(),
      this.currentProject?.projectName,
      this.currentSubFolder?.subName,
      (msg) => { statusEl.textContent = msg; }
    );
  },

  onSplitCompare() {
    LightboxWorkstation.openSplitCompare(this.getSelectedPhotos());
  },

  async onMoveSelected() {
    const ids = Array.from(this.selectedIds);
    if (await AdminManager.moveFilesPrompt(ids, this.projects)) {
      this.selectedIds.clear();
      this.updateSelectionBar();
      await this.loadProjects(false);
      await this.loadPhotos();
    }
  },

  async onSoftDeleteSelected() {
    const ids = Array.from(this.selectedIds);
    if (await AdminManager.softDeleteFiles(ids)) {
      this.selectedIds.clear();
      this.updateSelectionBar();
      await this.loadPhotos();
    }
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
