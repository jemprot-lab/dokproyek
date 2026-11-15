/**
 * admin-manager.js
 * In-App Admin: Modal Magic Link (2 Tab), Modal Kelola Akun/Otentikasi APK,
 * Move, Rename, Star, Caption, Archive, & Soft Delete.
 */

const AdminManager = {
  allProjects: [],
  magicLinks: [],
  usersList: [],
  selectedExpiryDays: 7,

  // ========================
  // 1. MAGIC LINK MODAL
  // ========================
  async openMagicLinkModal(projects) {
    this.allProjects = projects || [];
    document.getElementById('magic-link-modal').classList.remove('hidden');
    this.switchMagicTab('create');
    this.renderMagicProjectCheckboxes();
    this.setQuickExpiryDays(7);
    await this.loadMagicLinks();
  },

  closeMagicLinkModal() {
    document.getElementById('magic-link-modal').classList.add('hidden');
  },

  switchMagicTab(tab) {
    const createPane = document.getElementById('magic-tab-create');
    const listPane = document.getElementById('magic-tab-list');
    const btnCreate = document.getElementById('btn-magic-tab-create');
    const btnList = document.getElementById('btn-magic-tab-list');

    if (tab === 'create') {
      createPane.classList.remove('hidden');
      listPane.classList.add('hidden');
      btnCreate.classList.add('bg-amber-500', 'text-slate-900', 'font-bold');
      btnList.classList.remove('bg-amber-500', 'text-slate-900', 'font-bold');
    } else {
      createPane.classList.add('hidden');
      listPane.classList.remove('hidden');
      btnList.classList.add('bg-amber-500', 'text-slate-900', 'font-bold');
      btnCreate.classList.remove('bg-amber-500', 'text-slate-900', 'font-bold');
      this.loadMagicLinks();
    }
  },

  renderMagicProjectCheckboxes() {
    const box = document.getElementById('magic-projects-checkboxes');
    if (!box) return;
    box.innerHTML = this.allProjects.map((p) => `
      <label class="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
        <input type="checkbox" value="${p.folderId}" class="magic-proj-cb w-4 h-4 accent-amber-500">
        <span class="text-sm font-medium text-slate-800">${p.projectName}</span>
      </label>
    `).join('');
  },

  setQuickExpiryDays(days) {
    this.selectedExpiryDays = days;
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    document.getElementById('magic-expiry-date').value = `${yyyy}-${mm}-${dd}`;
  },

  async createMagicLink() {
    const label = document.getElementById('magic-label-input').value.trim();
    const checked = Array.from(document.querySelectorAll('.magic-proj-cb:checked')).map((el) => el.value);
    const filter = document.getElementById('magic-photo-filter').value;
    const dateVal = document.getElementById('magic-expiry-date').value;

    if (!label || checked.length === 0 || !dateVal) {
      alert('Isi Nama Klien, pilih minimal 1 Proyek, dan tentukan Batas Waktu.');
      return;
    }

    const [y, m, d] = dateVal.split('-');
    const expiryStr = `${d}-${m}-${y} 23:59`;

    const res = await callGasApi('MANAGE_MAGIC_LINK', {
      subAction: 'CREATE',
      labelPenerima: label,
      allowedProjectIds: checked,
      photoFilter: filter,
      expiryDate: expiryStr
    });

    if (res.status === 'success') {
      document.getElementById('magic-label-input').value = '';
      await this.loadMagicLinks();
      this.switchMagicTab('list');
      if (confirm('Magic Link berhasil dibuat! Langsung kirim ke WhatsApp sekarang?')) {
        ExportEngine.shareToWhatsApp(res.magicLink.whatsappMessageTemplate);
      }
    } else {
      alert(res.message || 'Gagal membuat Magic Link.');
    }
  },

  async loadMagicLinks() {
    const res = await callGasApi('MANAGE_MAGIC_LINK', { subAction: 'LIST' });
    if (res.status !== 'success') return;
    this.magicLinks = res.magicLinks || [];
    const countEl = document.getElementById('magic-active-count');
    if (countEl) {
      countEl.textContent = this.magicLinks.filter((l) => l.status === 'ACTIVE').length;
    }
    this.renderMagicLinksTable();
  },

  renderMagicLinksTable() {
    const tbody = document.getElementById('magic-links-tbody');
    const q = (document.getElementById('magic-search-input')?.value || '').toLowerCase();
    if (!tbody) return;

    const filtered = this.magicLinks.filter((l) =>
      l.labelPenerima.toLowerCase().includes(q) ||
      l.allowedProjectNames.join(' ').toLowerCase().includes(q)
    );

    tbody.innerHTML = filtered.map((l) => {
      const badge = l.status === 'ACTIVE'
        ? '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">🟢 ACTIVE</span>'
        : `<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">🔴 ${l.status}</span>`;

      const actions = l.status === 'ACTIVE'
        ? `
          <button onclick="AdminManager.resendWa('${l.token}')" class="px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">📲 Kirim WA</button>
          <button onclick="AdminManager.copyMagicUrl('${l.token}')" class="px-2.5 py-1.5 text-xs font-semibold bg-slate-700 text-white rounded-lg hover:bg-slate-800">📋 Salin Link</button>
          <button onclick="AdminManager.revokeMagicLink('${l.token}')" class="px-2.5 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">🛑 Matikan</button>
        `
        : `<button onclick="AdminManager.deleteMagicLog('${l.token}')" class="px-2.5 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300">🗑️ Hapus Log</button>`;

      return `
        <tr class="border-b border-slate-200">
          <td class="p-3 align-top">
            <div class="font-bold text-slate-900">${l.labelPenerima}</div>
            <div class="text-xs text-slate-500">Filter: ${l.photoFilter === 'STARRED_ONLY' ? '⭐ Favorit' : 'Semua Foto'} • 👁️ ${l.viewCount}x</div>
          </td>
          <td class="p-3 align-top text-xs text-slate-700">
            ${l.allowedProjectNames.map((n) => `<div>• ${n}</div>`).join('')}
          </td>
          <td class="p-3 align-top text-xs">
            <div class="font-mono-code text-slate-800">${l.expiryDate}</div>
            <div class="mt-1">${badge}</div>
          </td>
          <td class="p-3 align-top flex flex-wrap gap-1.5">${actions}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" class="p-6 text-center text-slate-400">Belum ada Magic Link.</td></tr>';
  },

  resendWa(token) {
    const item = this.magicLinks.find((l) => l.token === token);
    if (item) ExportEngine.shareToWhatsApp(item.whatsappMessageTemplate);
  },

  async copyMagicUrl(token) {
    const item = this.magicLinks.find((l) => l.token === token);
    if (!item) return;
    await navigator.clipboard.writeText(item.fullUrl);
    alert('Tautan Magic Link berhasil disalin!');
  },

  async revokeMagicLink(token) {
    if (!confirm('Matikan akses Magic Link ini sekarang?')) return;
    await callGasApi('MANAGE_MAGIC_LINK', { subAction: 'REVOKE', token });
    await this.loadMagicLinks();
  },

  async deleteMagicLog(token) {
    await callGasApi('MANAGE_MAGIC_LINK', { subAction: 'DELETE_LOG', token });
    await this.loadMagicLinks();
  },

  // ========================
  // 2. USER & APK AUTH MODAL
  // ========================
  async openUsersModal() {
    document.getElementById('users-modal').classList.remove('hidden');
    await this.loadUsers();
  },

  closeUsersModal() {
    document.getElementById('users-modal').classList.add('hidden');
  },

  async loadUsers() {
    const res = await callGasApi('MANAGE_USERS', { subAction: 'LIST' });
    if (res.status !== 'success') return;
    this.usersList = res.users || [];
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.usersList.map((u) => {
      const badge = u.status === 'ACTIVE'
        ? '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">🟢 ACTIVE</span>'
        : '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">🔒 REVOKED</span>';

      const toggleBtn = u.status === 'ACTIVE'
        ? `<button onclick="AdminManager.revokeUserAuth('${u.userId}', '${u.username}')" class="px-2.5 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">🛑 Cabut Akses</button>`
        : `<button onclick="AdminManager.activateUserAuth('${u.userId}')" class="px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">✅ Aktifkan</button>`;

      return `
        <tr class="border-b border-slate-200">
          <td class="p-3 font-bold text-slate-900">${u.username}</td>
          <td class="p-3 text-xs font-semibold text-slate-600">${u.role}</td>
          <td class="p-3">${badge}</td>
          <td class="p-3 flex flex-wrap gap-1.5">
            ${toggleBtn}
            <button onclick="AdminManager.resetUserPin('${u.userId}', '${u.username}')" class="px-2.5 py-1.5 text-xs font-semibold bg-amber-500 text-slate-900 rounded-lg hover:bg-amber-600">🔑 Reset PIN</button>
            <button onclick="AdminManager.deleteUser('${u.userId}', '${u.username}')" class="px-2.5 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async createUser() {
    const username = document.getElementById('new-user-username').value.trim();
    const password = document.getElementById('new-user-pin').value.trim();
    const role = document.getElementById('new-user-role').value;

    if (!username || !/^\d{6}$/.test(password)) {
      alert('Username wajib diisi dan PIN harus tepat 6 digit angka.');
      return;
    }

    const res = await callGasApi('MANAGE_USERS', {
      subAction: 'CREATE',
      username,
      password,
      role,
      allowedProjects: 'ALL'
    });

    if (res.status === 'success') {
      document.getElementById('new-user-username').value = '';
      document.getElementById('new-user-pin').value = '';
      await this.loadUsers();
    } else {
      alert(res.message || 'Gagal membuat akun.');
    }
  },

  async revokeUserAuth(userId, username) {
    if (!confirm(`Cabut otentikasi ${username}? HP mandor tersebut tidak akan bisa upload lagi.`)) return;
    await callGasApi('MANAGE_USERS', { subAction: 'REVOKE_AUTH', targetUserId: userId });
    await this.loadUsers();
  },

  async activateUserAuth(userId) {
    await callGasApi('MANAGE_USERS', { subAction: 'ACTIVATE_AUTH', targetUserId: userId });
    await this.loadUsers();
  },

  async resetUserPin(userId, username) {
    const newPin = prompt(`Masukkan PIN 6 digit baru untuk ${username}:`);
    if (!newPin || !/^\d{6}$/.test(newPin.trim())) {
      alert('PIN harus tepat 6 digit angka.');
      return;
    }
    await callGasApi('MANAGE_USERS', { subAction: 'RESET_PASSWORD', targetUserId: userId, password: newPin.trim() });
    alert('PIN berhasil direset. Perangkat lama otomatis keluar.');
    await this.loadUsers();
  },

  async deleteUser(userId, username) {
    if (!confirm(`Hapus permanen akun ${username}?`)) return;
    const res = await callGasApi('MANAGE_USERS', { subAction: 'DELETE_USER', targetUserId: userId });
    if (res.status !== 'success') alert(res.message);
    await this.loadUsers();
  },

  // ========================
  // 3. FILE & FOLDER ADMIN OPS
  // ========================
  async toggleStar(fileId, currentStar) {
    const res = await callGasApi('ADMIN_FILE_OPS', {
      operation: 'SET_STAR',
      fileIds: [fileId],
      starState: !currentStar
    });
    return res.status === 'success';
  },

  async editCaption(fileId, currentCaption) {
    const text = prompt('Catatan / Revisi Foto:', currentCaption || '');
    if (text === null) return false;
    const res = await callGasApi('ADMIN_FILE_OPS', {
      operation: 'SET_CAPTION',
      fileIds: [fileId],
      captionText: text
    });
    return res.status === 'success';
  },

  async renameFolder(folderId, currentName) {
    const newName = prompt('Ubah nama folder:', currentName || '');
    if (!newName || !newName.trim()) return false;
    const res = await callGasApi('ADMIN_FILE_OPS', {
      operation: 'RENAME_FOLDER',
      targetFolderId: folderId,
      newName: newName.trim()
    });
    return res.status === 'success';
  },

  async toggleArchiveProject(projectId, currentStatus) {
    const nextStatus = currentStatus === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    if (!confirm(`Ubah status proyek menjadi ${nextStatus}?`)) return false;
    const res = await callGasApi('ADMIN_FILE_OPS', {
      operation: 'SET_ARCHIVE_STATUS',
      targetProjectId: projectId,
      archiveStatus: nextStatus
    });
    return res.status === 'success';
  },

  async softDeleteFiles(fileIds) {
    if (!fileIds.length) return false;
    if (!confirm(`Pindahkan ${fileIds.length} foto ke Trash (dapat dipulihkan 30 hari)?`)) return false;
    const res = await callGasApi('ADMIN_FILE_OPS', {
      operation: 'SOFT_DELETE_TRASH',
      fileIds
    });
    return res.status === 'success';
  },

  async moveFilesPrompt(fileIds, projects) {
    if (!fileIds.length || !projects.length) return false;
    const listText = projects.map((p, i) => `${i + 1}. ${p.projectName}`).join('\n');
    const pick = prompt(`Pilih nomor proyek tujuan:\n${listText}`);
    const idx = parseInt(pick, 10) - 1;
    if (isNaN(idx) || !projects[idx]) return false;

    const targetSub = prompt('Masukkan nama sub-folder tanggal tujuan (contoh: 15-08-2026 progress 10%):');
    if (!targetSub || !targetSub.trim()) return false;

    const res = await callGasApi('ADMIN_FILE_OPS', {
      operation: 'MOVE_FILES',
      fileIds,
      targetProjectId: projects[idx].folderId,
      targetSubFolderName: targetSub.trim()
    });
    if (res.status === 'success') alert(res.message);
    return res.status === 'success';
  },

  async emptyTrashPermanent() {
    if (!confirm('Hapus permanen semua foto yang ada di Sampah (Trash) untuk membebaskan kapasitas penyimpanan? Tindakan ini tidak bisa dibatalkan.')) return;
    const res = await callGasApi('ADMIN_FILE_OPS', { operation: 'EMPTY_TRASH_PERMANENT' });
    alert(res.message || 'Sampah berhasil dikosongkan.');
    if (res.status === 'success') {
      await App.loadStorageStatus();
    }
  }
};
