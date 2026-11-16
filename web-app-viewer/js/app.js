/**
 * app.js
 * Controller utama Web App & PWA Viewer: Auth/Magic Link bootstrap, PWA Install,
 * Search Proyek, Filter Bintang, Grid Foto, & Floating Action Bar.
 */

const App = {
  allProjects: [],
  projects: [],
  currentProject: null,
  currentSubFolder: null,
  photos: [],
  selectedIds: new Set(),
  onlyStarred: false,
  deferredPwaPrompt: null,
  projectPage: 1,
  projectsPerPage: 8,
  expandedProjectId: null,
  subPage: 1,
  subsPerPage: 5,

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

  isPwaInstalled() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  },

  registerPwa() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const btn = document.getElementById('btn-install-pwa');
    if (this.isPwaInstalled()) {
      if (btn) btn.classList.add('hidden');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      if (this.isPwaInstalled()) {
        if (btn) btn.classList.add('hidden');
        return;
      }
      e.preventDefault();
      this.deferredPwaPrompt = e;
      if (btn) btn.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPwaPrompt = null;
      if (btn) btn.classList.add('hidden');
    });
  },

  async installPwa() {
    if (!this.deferredPwaPrompt) return;
    this.deferredPwaPrompt.prompt();
    await this.deferredPwaPrompt.userChoice;
    this.deferredPwaPrompt = null;
    document.getElementById('btn-install-pwa')?.classList.add('hidden');
  },

  initIdleAutoLogout() {
    if (!SessionState.authToken || SessionState.magicToken) return;
    if (this._idleAutoLogoutInitialized) return;
    this._idleAutoLogoutInitialized = true;

    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
    this._lastActivityAt = Date.now();

    const performAutoLogout = async () => {
      if (!SessionState.authToken || SessionState.magicToken) return;
      clearTimeout(this._idleTimer);
      SessionState.clear();
      if (window.UiFeedback && typeof UiFeedback.alert === 'function') {
        await UiFeedback.alert(
          'Sesi Anda otomatis keluar karena tidak ada aktivitas selama 15 menit.',
          'Auto Logout'
        );
      }
      window.location.reload();
    };

    const resetTimer = () => {
      this._lastActivityAt = Date.now();
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(performAutoLogout, IDLE_TIMEOUT_MS);
    };

    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - this._lastActivityAt >= IDLE_TIMEOUT_MS) {
        performAutoLogout();
      }
    });

    resetTimer();
  },

  showLoginView() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('workspace-view').classList.add('hidden');
  },

  toggleLoginPassword() {
    const input = document.getElementById('login-pin');
    const eyeOpen = document.getElementById('eye-open-icon');
    const eyeClosed = document.getElementById('eye-closed-icon');
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (eyeOpen) eyeOpen.classList.toggle('hidden', isPassword);
    if (eyeClosed) eyeClosed.classList.toggle('hidden', !isPassword);
  },

  showMainWorkspace() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('workspace-view').classList.remove('hidden');
    this.initIdleAutoLogout();
    this.startAutoRefresh();
    this.initBackNavigation();

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

  initBackNavigation() {
    if (this._backNavInitialized) return;
    this._backNavInitialized = true;

    window.addEventListener('popstate', () => {
      const lightbox = document.getElementById('lightbox-modal');
      if (lightbox && !lightbox.classList.contains('hidden')) {
        LightboxWorkstation.close(true);
        return;
      }

      const magicModal = document.getElementById('magic-modal');
      if (magicModal && !magicModal.classList.contains('hidden')) {
        magicModal.classList.add('hidden');
        return;
      }

      const usersModal = document.getElementById('users-modal');
      if (usersModal && !usersModal.classList.contains('hidden')) {
        usersModal.classList.add('hidden');
        return;
      }

      const warnModal = document.getElementById('storage-warning-modal');
      if (warnModal && !warnModal.classList.contains('hidden')) {
        warnModal.classList.add('hidden');
        return;
      }

      if (this.currentSubFolder) {
        this.currentSubFolder = null;
        this.photos = [];
        this.selectedIds.clear();
        this.updateSelectionBar();
        this.renderSidebarProjects();
        this.renderSubFolderCards();
      }
    });
  },

  pushHistoryState(viewName) {
    try {
      if (window.history.state?.view !== viewName) {
        window.history.pushState({ view: viewName }, '');
      }
    } catch {
      // Abaikan jika browser membatasi history API
    }
  },

  startAutoRefresh() {
    if (this._autoRefreshStarted) return;
    this._autoRefreshStarted = true;
    this._lastChangeTs = null;
    this._isSilentSyncing = false;
    this._lastSyncActivityAt = Date.now();

    const markActive = () => {
      this._lastSyncActivityAt = Date.now();
    };
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
      window.addEventListener(evt, markActive, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this._lastSyncActivityAt = Date.now();
        this.checkForUpdatesSilent();
      }
    });

    this._autoRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - this._lastSyncActivityAt > 5 * 60 * 1000) return;
      this.checkForUpdatesSilent();
    }, 35000);
  },

  async checkForUpdatesSilent() {
    if (this._isSilentSyncing) return;
    this._isSilentSyncing = true;
    try {
      const res = await callGasApi('CHECK_UPDATES', { _silent: true });
      if (!res || res.status !== 'success' || !res.lastChangeTs) return;
      if (this._lastChangeTs === null) {
        this._lastChangeTs = res.lastChangeTs;
        return;
      }
      if (res.lastChangeTs !== this._lastChangeTs) {
        this._lastChangeTs = res.lastChangeTs;
        await this.silentRefreshProjectsAndPhotos();
      }
    } catch {
      // Abaikan gangguan jaringan sementara saat background sync
    } finally {
      this._isSilentSyncing = false;
    }
  },

  async silentRefreshProjectsAndPhotos() {
    const includeArchived = Boolean(document.getElementById('chk-show-archived')?.checked);
    const projRes = await callGasApi('SEARCH_PROJECTS', {
      query: '',
      includeArchived,
      _silent: true
    });
    if (projRes && projRes.status === 'success') {
      const nextAll = projRes.projects || [];
      const prevSig = JSON.stringify(this.allProjects);
      const nextSig = JSON.stringify(nextAll);
      if (prevSig !== nextSig) {
        this.allProjects = nextAll;
        const activeProjId = this.currentProject?.folderId || null;
        const activeSubId = this.currentSubFolder?.subId || null;
        this.filterProjectsLocally();
        if (activeProjId) {
          this.currentProject = this.allProjects.find((p) => p.folderId === activeProjId) || null;
          if (this.currentProject && activeSubId) {
            this.currentSubFolder =
              (this.currentProject.subFolders || []).find((s) => s.subId === activeSubId) || null;
          } else {
            this.currentSubFolder = null;
          }
          this.renderSidebarProjects();
          if (!this.currentSubFolder) {
            this.renderSubFolderCards();
          }
        }
      }
    }

    if (!this.currentSubFolder) return;
    const photoRes = await callGasApi('LIST_PHOTOS', {
      subFolderId: this.currentSubFolder.subId,
      onlyStarred: this.onlyStarred,
      _silent: true
    });
    if (!photoRes || photoRes.status !== 'success') return;

    const nextPhotos = photoRes.photos || [];
    const prevIds = this.photos.map((p) => p.id);
    const nextIds = nextPhotos.map((p) => p.id);
    const prevSet = new Set(prevIds);
    const addedPhotos = nextPhotos.filter((p) => !prevSet.has(p.id));

    const prevSig = JSON.stringify(this.photos.map((p) => [p.id, p.starred, p.caption]));
    const nextSig = JSON.stringify(nextPhotos.map((p) => [p.id, p.starred, p.caption]));
    if (prevSig === nextSig) return;

    const grid = document.getElementById('photo-grid');
    const isAppendOnly =
      addedPhotos.length > 0 &&
      prevIds.length > 0 &&
      prevIds.every((id) => nextIds.includes(id)) &&
      nextPhotos.length === prevIds.length + addedPhotos.length;

    this.photos = nextPhotos;
    if (isAppendOnly && grid) {
      const isAdmin = SessionState.isAdmin();
      const addedHtml = addedPhotos
        .map((p) => {
          const idx = nextPhotos.findIndex((np) => np.id === p.id);
          return this.buildPhotoCardHtml(p, idx, isAdmin);
        })
        .join('');
      grid.insertAdjacentHTML('beforeend', addedHtml);
    } else {
      this.renderPhotoGrid();
    }

    if (addedPhotos.length > 0 && typeof UiFeedback !== 'undefined') {
      UiFeedback.toast(`📸 ${addedPhotos.length} foto baru masuk`, 'info');
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
    const dueFormatted = this.formatIndonesianDate(s.billingDueDate);
    due.textContent = dueFormatted ? `Jatuh tempo: ${dueFormatted}` : '';

    const pct = Math.min(100, Math.max(0, s.percent || 0));
    bar.style.width = `${pct}%`;
    bar.className = 'h-full transition-all ' + (pct >= 90 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500');

    const waLink = `https://wa.me/${s.vendorContactWa || ''}?text=${encodeURIComponent('Halo, saya mau perpanjang masa aktif / upgrade kapasitas aplikasi proyek.')}`;
    if (!s.allowed && s.code === 'SUBSCRIPTION_SUSPENDED') {
      if (s.webSuspended) {
        this.showWebSuspendedLock(s.message, s.vendorContactWa);
        return;
      }
      const remDays = typeof s.graceDaysRemaining === 'number' ? s.graceDaysRemaining : 7;
      const graceMsg = `⚠️ STATUS SUSPENDED (Jatuh tempo ${dueFormatted || s.billingDueDate}). Upload APK sudah dihentikan. Jika tidak diperpanjang dalam ${remDays} hari, Web App & PWA juga tidak bisa diakses!`;
      banner.className = 'bg-red-600 text-white px-4 py-2.5 text-xs font-bold text-center flex flex-wrap items-center justify-center gap-3 no-print';
      banner.innerHTML = `<span>${graceMsg}</span><a href="${waLink}" target="_blank" class="px-3 py-1 bg-white text-red-700 rounded-lg">📲 Perpanjang Sekarang</a>`;
      banner.classList.remove('hidden');
      if (!sessionStorage.getItem('dokproyek_warn_dismissed')) {
        this.showStorageWarningModal(graceMsg, waLink);
      }
      return;
    }

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

    const nearExpiry = typeof s.daysLeft === 'number' && s.daysLeft <= 7;
    const nearFull = !s.allowed || pct >= 85;
    if ((nearFull || nearExpiry) && !sessionStorage.getItem('dokproyek_warn_dismissed')) {
      const reasons = [];
      if (!s.allowed || pct >= 100) {
        reasons.push(s.message || `Kapasitas penyimpanan penuh (${Number(s.usedGb).toFixed(2)} GB / ${s.limitGb} GB).`);
      } else if (pct >= 85) {
        reasons.push(`Kapasitas penyimpanan hampir habis: ${Number(s.usedGb).toFixed(2)} GB / ${s.limitGb} GB (${pct}%).`);
      }
      if (nearExpiry) {
        if (s.daysLeft < 0) {
          reasons.push(`Masa aktif Cloud Server sudah melewati jatuh tempo (${dueFormatted || s.billingDueDate}).`);
        } else if (s.daysLeft === 0) {
          reasons.push(`Masa aktif Cloud Server jatuh tempo hari ini (${dueFormatted || s.billingDueDate}).`);
        } else {
          reasons.push(`Masa aktif Cloud Server tinggal ${s.daysLeft} hari lagi (jatuh tempo ${dueFormatted || s.billingDueDate}).`);
        }
      }
      this.showStorageWarningModal(reasons.join('\n\n'), waLink);
    }
  },

  showStorageWarningModal(message, waLink) {
    const modal = document.getElementById('storage-warning-modal');
    const msgEl = document.getElementById('storage-warning-message');
    const waEl = document.getElementById('storage-warning-wa');
    if (!modal || !msgEl) return;
    msgEl.textContent = message;
    msgEl.style.whiteSpace = 'pre-line';
    if (waEl) waEl.href = waLink;
    modal.classList.remove('hidden');
  },

  closeStorageWarningModal() {
    sessionStorage.setItem('dokproyek_warn_dismissed', '1');
    const modal = document.getElementById('storage-warning-modal');
    if (modal) modal.classList.add('hidden');
  },

  showWebSuspendedLock(message, vendorWa) {
    this.allProjects = [];
    this.projects = [];
    this.photos = [];
    let overlay = document.getElementById('web-suspended-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'web-suspended-overlay';
      overlay.className =
        'fixed inset-0 z-[70] bg-slate-950/95 flex items-center justify-center p-4 no-print';
      document.body.appendChild(overlay);
    }
    const waLink = `https://wa.me/${vendorWa || ''}?text=${encodeURIComponent('Halo, saya mau perpanjang masa aktif aplikasi DokProyek.')}`;
    const safeMsg = String(message || 'Masa aktif aplikasi & Web Viewer telah berakhir. Hubungi penyedia aplikasi.')
      .replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-red-300">
        <div class="px-5 py-4 bg-red-600 text-white font-bold text-base flex items-center gap-2">
          <span>🔒 Akses Web App & PWA Ditangguhkan</span>
        </div>
        <div class="p-5 space-y-3 text-sm text-slate-700">
          <p class="leading-relaxed font-semibold text-red-700">${safeMsg}</p>
          <p class="text-xs text-slate-500">Data foto proyek Anda tetap tersimpan aman. Silakan hubungi penyedia aplikasi untuk mengaktifkan kembali akses.</p>
        </div>
        <div class="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onclick="App.logout()" class="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold">Keluar</button>
          <a href="${waLink}" target="_blank" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">📲 Hubungi Penyedia</a>
        </div>
      </div>
    `;
    overlay.classList.remove('hidden');
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

  async configureGasUrl() {
    const current = localStorage.getItem('gas_api_url') || '';
    const next = await UiFeedback.prompt('Masukkan URL Web App Google Apps Script (/exec):', current, 'Pengaturan URL Server');
    if (next && next.trim()) {
      localStorage.setItem('gas_api_url', next.trim());
      window.location.reload();
    }
  },

  formatIndonesianDate(rawDate) {
    if (!rawDate) return '';
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const str = String(rawDate).trim();
    const dmy = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dmy) {
      const mIdx = parseInt(dmy[2], 10) - 1;
      if (months[mIdx]) return `${parseInt(dmy[1], 10)} ${months[mIdx]} ${dmy[3]}`;
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
    }
    return str;
  },

  async loadProjects(incrementMagicView = false) {
    const includeArchived = document.getElementById('toggle-archived')?.checked || false;

    const res = await callGasApi('SEARCH_PROJECTS', {
      query: '',
      includeArchived,
      limit: SessionState.isAdmin() ? 200 : 50,
      incrementView: incrementMagicView
    });

    if (res.status !== 'success') {
      UiFeedback.toast(res.message || 'Gagal memuat proyek.', 'error');
      return;
    }

    if (res.magicLinkInfo) {
      const banner = document.getElementById('magic-banner');
      banner.classList.remove('hidden');
      const expLabel = this.formatIndonesianDate(res.magicLinkInfo.expiryDate) || res.magicLinkInfo.expiryDate;
      banner.textContent = `🔗 Akses Tamu: ${res.magicLinkInfo.labelPenerima} (Aktif s/d ${expLabel})`;
    }

    this.allProjects = res.projects || [];
    this.filterProjectsLocally();

    if (this.projects.length > 0 && !this.currentProject) {
      this.selectProject(this.projects[0].folderId);
    }
  },

  filterProjectsLocally() {
    const q = (document.getElementById('project-search-input')?.value || '').trim().toLowerCase();
    this.projectPage = 1;
    if (!q) {
      this.projects = [...this.allProjects];
    } else {
      this.projects = this.allProjects.filter((p) => {
        if ((p.projectName || '').toLowerCase().includes(q)) return true;
        return (p.subFolders || []).some(
          (s) =>
            (s.subName || '').toLowerCase().includes(q) ||
            (s.uploaders || []).some((u) => u.toLowerCase().includes(q))
        );
      });
    }
    this.renderSidebarProjects();
    this.renderMobileProjectSwitcher();
  },

  renderSidebarProjects() {
    const list = document.getElementById('sidebar-projects');
    const pagEl = document.getElementById('sidebar-pagination');
    if (!list) return;

    const totalProjPages = Math.max(1, Math.ceil(this.projects.length / this.projectsPerPage));
    if (this.projectPage > totalProjPages) this.projectPage = totalProjPages;
    const startIdx = (this.projectPage - 1) * this.projectsPerPage;
    const pageProjects = this.projects.slice(startIdx, startIdx + this.projectsPerPage);

    list.innerHTML = pageProjects.map((p) => {
      const isExpanded = this.expandedProjectId === p.folderId;
      const statusBadge = p.projectStatus === 'ARCHIVED'
        ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0">📦 ARSIP</span>'
        : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">🟢 AKTIF</span>';

      let subsHtml = '';
      if (isExpanded) {
        const allSubs = p.subFolders || [];
        const totalSubPages = Math.max(1, Math.ceil(allSubs.length / this.subsPerPage));
        if (this.subPage > totalSubPages) this.subPage = totalSubPages;
        const subStart = (this.subPage - 1) * this.subsPerPage;
        const pageSubs = allSubs.slice(subStart, subStart + this.subsPerPage);

        const subPaginationHtml = totalSubPages > 1
          ? `<div class="flex items-center justify-between pt-1.5 text-[11px] text-slate-500">
              <button onclick="event.stopPropagation(); App.changeSubPage(-1)" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200" ${this.subPage <= 1 ? 'disabled' : ''}>‹</button>
              <span>Hal ${this.subPage}/${totalSubPages}</span>
              <button onclick="event.stopPropagation(); App.changeSubPage(1)" class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200" ${this.subPage >= totalSubPages ? 'disabled' : ''}>›</button>
            </div>`
          : '';

        subsHtml = `<div class="mt-2 pl-3 border-l-2 border-amber-400 space-y-1">
            ${pageSubs.map((s) => `
              <button onclick="App.selectSubFolder('${s.subId}')" class="w-full text-left px-2.5 py-2 rounded-lg text-xs flex justify-between items-center ${this.currentSubFolder?.subId === s.subId ? 'bg-amber-500 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-100'}">
                <span class="truncate">${s.subName}</span>
                <span class="ml-2 text-[11px] opacity-75">${s.count}</span>
              </button>
            `).join('') || '<div class="text-xs text-slate-400 py-1">Belum ada folder tanggal.</div>'}
            ${subPaginationHtml}
          </div>`;
      }

      return `
        <div class="p-2.5 rounded-xl border ${isExpanded ? 'border-amber-500 bg-amber-50/40' : 'border-slate-200 bg-white'}">
          <div class="flex items-center justify-between gap-2 cursor-pointer" onclick="App.selectProject('${p.folderId}')">
            <span class="font-semibold text-sm text-slate-900 truncate">${isExpanded ? '📂' : '📁'} ${p.projectName}</span>
            ${statusBadge}
          </div>
          ${subsHtml}
        </div>
      `;
    }).join('') || '<div class="text-sm text-slate-400 text-center py-6">Tidak ada proyek ditemukan.</div>';

    if (pagEl) {
      if (totalProjPages > 1) {
        pagEl.classList.remove('hidden');
        pagEl.innerHTML = `
          <button onclick="App.changeProjectPage(-1)" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold" ${this.projectPage <= 1 ? 'disabled' : ''}>‹ Sebelumnya</button>
          <span class="text-slate-600 font-semibold">Hal ${this.projectPage} / ${totalProjPages}</span>
          <button onclick="App.changeProjectPage(1)" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold" ${this.projectPage >= totalProjPages ? 'disabled' : ''}>Berikutnya ›</button>
        `;
      } else {
        pagEl.classList.add('hidden');
      }
    }
  },

  changeProjectPage(delta) {
    this.projectPage += delta;
    this.renderSidebarProjects();
    this.renderMobileProjectSwitcher();
  },

  changeSubPage(delta) {
    this.subPage += delta;
    this.renderSidebarProjects();
    this.renderMobileProjectSwitcher();
  },

  renderMobileProjectSwitcher() {
    const el = document.getElementById('mobile-project-switcher');
    if (!el) return;
    if (this.projects.length <= 1) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="text-[11px] font-bold text-slate-500 mb-1.5">📁 ${this.projects.length} Proyek Tersedia (Ketuk untuk pindah):</div>
      <div class="flex gap-2 overflow-x-auto pb-1">
        ${this.projects.map((p) => {
          const active = this.currentProject?.folderId === p.folderId;
          return `<button onclick="App.selectProject('${p.folderId}', true)" class="px-3.5 py-2 rounded-xl text-xs shrink-0 border transition ${active ? 'bg-amber-500 border-amber-600 text-slate-900 font-bold shadow-sm' : 'bg-white border-slate-300 text-slate-700 font-medium hover:bg-slate-50'}">📁 ${p.projectName}</button>`;
        }).join('')}
      </div>
    `;
  },

  selectProject(folderId, forceSelect = false) {
    if (!forceSelect && this.expandedProjectId === folderId) {
      this.expandedProjectId = null;
      this.renderSidebarProjects();
      return;
    }
    this.expandedProjectId = folderId;
    this.subPage = 1;
    this.currentProject = this.projects.find((p) => p.folderId === folderId) || null;
    this.currentSubFolder = null;
    this.photos = [];
    this.selectedIds.clear();
    this.updateSelectionBar();
    this.renderSidebarProjects();
    this.renderMobileProjectSwitcher();
    this.renderSubFolderCards();
  },

  renderSubFolderCards() {
    const grid = document.getElementById('photo-grid');
    const titleEl = document.getElementById('gallery-header-title');
    if (!this.currentProject) {
      if (titleEl) titleEl.textContent = 'Pilih Proyek';
      grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400">Pilih proyek di sidebar kiri.</div>';
      return;
    }
    if (titleEl) {
      titleEl.textContent = `📁 ${this.currentProject.projectName} — Pilih Folder Keterangan`;
    }
    const subs = this.currentProject.subFolders || [];
    if (!subs.length) {
      grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400">Belum ada folder keterangan di proyek ini.</div>';
      return;
    }
    const isAdmin = SessionState.isAdmin();
    const esc = (str) =>
      String(str || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[ch]));

    grid.innerHTML = subs.map((s) => {
      const m = String(s.subName || '').trim().match(/^(\d{2}-\d{2}-\d{4})(?:\s+(.+))?$/);
      const datePart = m ? m[1] : '';
      const notePart = m ? (m[2] || '').trim() : String(s.subName || '').trim();
      const titleText = notePart || datePart || s.subName;
      const metaLeft = datePart
        ? `📅 ${esc(datePart)} • 📷 ${s.count} foto`
        : `📷 ${s.count} foto`;
      const uploaderBadge =
        isAdmin && s.uploaders && s.uploaders.length
          ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">👤 ${esc(s.uploaders.join(', '))}</span>`
          : '';
      return `
      <div onclick="App.hideFolderTooltip(); App.selectSubFolder('${s.subId}')"
           onmouseenter="App.scheduleFolderTooltip(this)"
           onmouseleave="App.hideFolderTooltip()"
           data-tooltip-note="${esc(titleText)}"
           data-tooltip-date="${esc(datePart)}"
           class="bg-white rounded-xl border border-slate-200 hover:border-amber-500 hover:shadow-md p-4 cursor-pointer transition flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold text-slate-900 leading-snug break-words line-clamp-2">📂 ${esc(titleText)}</div>
          <div class="flex flex-wrap items-center gap-2 mt-1.5">
            <span class="text-[11px] text-slate-500 font-medium">${metaLeft}</span>
            ${uploaderBadge}
          </div>
        </div>
        ${isAdmin ? `<button onclick="event.stopPropagation(); App.hideFolderTooltip(); App.onDeleteSubFolder('${s.subId}', '${s.subName.replace(/'/g, "\\'")}')" title="Hapus folder keterangan" class="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold shrink-0">🗑️</button>` : ''}
      </div>
    `;
    }).join('');
  },

  scheduleFolderTooltip(el) {
    this.hideFolderTooltip();
    const note = el?.dataset?.tooltipNote || '';
    const date = el?.dataset?.tooltipDate || '';
    if (!note && !date) return;

    this._folderTipTimer = setTimeout(() => {
      let tip = document.getElementById('smart-folder-tooltip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'smart-folder-tooltip';
        tip.className =
          'fixed z-50 pointer-events-none bg-slate-900/95 text-white border border-slate-700 shadow-2xl rounded-xl px-3.5 py-2.5 max-w-xs text-xs transition-opacity duration-150 opacity-0';
        document.body.appendChild(tip);
      }

      const escTip = (str) =>
        String(str || '').replace(/[&<>"']/g, (ch) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[ch]));

      tip.innerHTML = `
        <div class="font-bold text-white leading-snug break-words">📂 ${escTip(note)}</div>
        ${date ? `<div class="text-[11px] text-amber-400 font-semibold mt-1">📅 ${escTip(date)}</div>` : ''}
      `;
      tip.classList.remove('hidden');
      tip.style.opacity = '0';
      tip.style.left = '0px';
      tip.style.top = '0px';

      const rect = el.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const margin = 12;

      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

      let top = rect.top - tipRect.height - 8;
      if (top < margin) {
        top = Math.min(rect.bottom + 8, window.innerHeight - tipRect.height - margin);
      }

      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.opacity = '1';
    }, 500);
  },

  hideFolderTooltip() {
    clearTimeout(this._folderTipTimer);
    const tip = document.getElementById('smart-folder-tooltip');
    if (tip) {
      tip.style.opacity = '0';
      tip.classList.add('hidden');
    }
  },

  toggleMobileSidebar() {
    const aside = document.getElementById('project-sidebar');
    if (aside) aside.classList.toggle('hidden');
  },

  async selectSubFolder(subId) {
    if (!this.currentProject) return;
    this.currentSubFolder = this.currentProject.subFolders.find((s) => s.subId === subId) || null;
    if (this.currentSubFolder) {
      this.pushHistoryState('photos');
    }
    this.selectedIds.clear();
    this.updateSelectionBar();
    this.renderSidebarProjects();
    if (window.innerWidth < 768) {
      const aside = document.getElementById('project-sidebar');
      if (aside) aside.classList.add('hidden');
    }
    await this.loadPhotos();
  },

  async loadPhotos() {
    if (!this.currentSubFolder) return;
    const uploaderSuffix =
      SessionState.isAdmin() && this.currentSubFolder.uploaders && this.currentSubFolder.uploaders.length
        ? ` • 👤 ${this.currentSubFolder.uploaders.join(', ')}`
        : '';
    document.getElementById('gallery-header-title').textContent =
      `${this.currentProject.projectName} › ${this.currentSubFolder.subName}${uploaderSuffix}`;
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

  buildPhotoCardHtml(p, idx, isAdmin) {
    const checked = this.selectedIds.has(p.id);
    const gpsBadge = p.gps
      ? '<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-500 text-white">📍 GPS</span>'
      : '<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-orange-500 text-white">⚠️ No GPS</span>';

    return `
      <div data-photo-id="${p.id}" class="bg-white rounded-xl border ${checked ? 'border-amber-500 ring-2 ring-amber-400' : 'border-slate-200'} overflow-hidden shadow-sm flex flex-col">
        <div class="relative aspect-[4/3] bg-slate-900 cursor-pointer" onclick="LightboxWorkstation.open(App.photos, ${idx})">
          <img src="${p.thumbnailUrl || p.previewUrl}" onerror="App.fallbackThumbnail(this, '${p.id}')" loading="lazy" alt="${p.name}" class="w-full h-full object-cover">
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
  },

  renderPhotoGrid() {
    const grid = document.getElementById('photo-grid');
    if (!this.photos.length) {
      grid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400">Belum ada foto di folder ini.</div>';
      return;
    }

    const isAdmin = SessionState.isAdmin();
    grid.innerHTML = this.photos.map((p, idx) => this.buildPhotoCardHtml(p, idx, isAdmin)).join('');
  },

  async fallbackThumbnail(imgEl, fileId) {
    if (imgEl.dataset.fallbackTried) return;
    imgEl.dataset.fallbackTried = '1';
    const dataUrl = await LightboxWorkstation.fetchPhotoDataUrl({ id: fileId });
    if (dataUrl) imgEl.src = dataUrl;
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

  toggleSelectAll() {
    if (!this.photos.length) return;
    if (this.selectedIds.size === this.photos.length) {
      this.selectedIds.clear();
    } else {
      this.photos.forEach((p) => this.selectedIds.add(p.id));
    }
    this.updateSelectionBar();
    this.renderPhotoGrid();
  },

  updateSelectionBar() {
    const bar = document.getElementById('floating-action-bar');
    const count = this.selectedIds.size;
    const btnAll = document.getElementById('btn-select-all');
    if (btnAll) {
      btnAll.textContent = (this.photos.length > 0 && count === this.photos.length)
        ? '☐ Batal Pilih'
        : '☑️ Pilih Semua';
    }
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

  async onDeleteCurrentProject() {
    if (!this.currentProject) {
      UiFeedback.toast('Pilih proyek terlebih dahulu.', 'warning');
      return;
    }
    if (await AdminManager.deleteFolder(this.currentProject.folderId, this.currentProject.projectName, true)) {
      this.currentProject = null;
      this.currentSubFolder = null;
      this.expandedProjectId = null;
      this.photos = [];
      await this.loadProjects(false);
      this.renderSubFolderCards();
    }
  },

  async onDeleteCurrentSubFolder() {
    if (!this.currentSubFolder) {
      UiFeedback.toast('Pilih folder keterangan terlebih dahulu.', 'warning');
      return;
    }
    await this.onDeleteSubFolder(this.currentSubFolder.subId, this.currentSubFolder.subName);
  },

  async onDeleteSubFolder(subId, subName) {
    if (await AdminManager.deleteFolder(subId, subName, false)) {
      const activeProjId = this.currentProject?.folderId;
      this.currentSubFolder = null;
      this.photos = [];
      await this.loadProjects(false);
      if (activeProjId) {
        this.currentProject = this.allProjects.find((p) => p.folderId === activeProjId) || null;
        this.expandedProjectId = this.currentProject ? activeProjId : null;
      }
      this.renderSidebarProjects();
      this.renderSubFolderCards();
    }
  },

  async onBatchJpg() {
    const statusEl = document.getElementById('export-status');
    await ExportEngine.downloadBatchJpg(
      this.getSelectedPhotos(),
      (msg) => { statusEl.textContent = msg; }
    );
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
