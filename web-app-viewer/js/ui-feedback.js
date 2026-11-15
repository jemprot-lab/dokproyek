/**
 * ui-feedback.js
 * Spinner loading global, Toast notifikasi, Modal Alert/Confirm/Prompt modern,
 * serta Modal Kirim WhatsApp (kompatibel dengan WhatSie Linux & WhatsApp Web).
 */

const UiFeedback = {
  _loadingCount: 0,
  _loadingTimer: null,

  _ensureNodes() {
    if (!document.getElementById('ui-loading-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'ui-loading-overlay';
      overlay.className = 'hidden fixed inset-0 z-[100] bg-slate-900/45 backdrop-blur-[1px] flex items-center justify-center p-4 no-print';
      overlay.innerHTML = `
        <div class="bg-white rounded-2xl px-6 py-4 shadow-2xl border border-slate-200 flex items-center gap-3.5">
          <div class="w-6 h-6 border-[3px] border-amber-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
          <span id="ui-loading-text" class="text-sm font-semibold text-slate-800">Memproses...</span>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    if (!document.getElementById('ui-toast-container')) {
      const container = document.createElement('div');
      container.id = 'ui-toast-container';
      container.className = 'fixed top-4 right-4 z-[110] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none no-print';
      document.body.appendChild(container);
    }

    if (!document.getElementById('ui-dialog-modal')) {
      const modal = document.createElement('div');
      modal.id = 'ui-dialog-modal';
      modal.className = 'hidden fixed inset-0 z-[120] bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4 no-print';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200">
          <div class="px-5 py-3.5 bg-slate-900 text-white font-bold text-sm flex items-center justify-between">
            <span id="ui-dialog-title">Informasi</span>
          </div>
          <div class="p-5 space-y-3">
            <p id="ui-dialog-message" class="text-sm text-slate-700 leading-relaxed whitespace-pre-line"></p>
            <input id="ui-dialog-input" type="text" class="hidden w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          </div>
          <div id="ui-dialog-actions" class="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
  },

  showLoading(label = 'Memproses...') {
    this._ensureNodes();
    this._loadingCount++;
    const textEl = document.getElementById('ui-loading-text');
    if (textEl) textEl.textContent = label;
    if (this._loadingTimer) clearTimeout(this._loadingTimer);
    this._loadingTimer = setTimeout(() => {
      if (this._loadingCount > 0) {
        document.getElementById('ui-loading-overlay')?.classList.remove('hidden');
      }
    }, 180);
  },

  hideLoading() {
    this._loadingCount = Math.max(0, this._loadingCount - 1);
    if (this._loadingCount === 0) {
      if (this._loadingTimer) {
        clearTimeout(this._loadingTimer);
        this._loadingTimer = null;
      }
      document.getElementById('ui-loading-overlay')?.classList.add('hidden');
    }
  },

  toast(message, type = 'info') {
    this._ensureNodes();
    const container = document.getElementById('ui-toast-container');
    if (!container) return;

    const styles = {
      success: 'bg-emerald-600 text-white border-emerald-700',
      error: 'bg-red-600 text-white border-red-700',
      warning: 'bg-amber-500 text-slate-900 border-amber-600',
      info: 'bg-slate-900 text-white border-slate-700'
    };
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    const el = document.createElement('div');
    el.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold flex items-center gap-2.5 transition-all ${styles[type] || styles.info}`;
    el.innerHTML = `<span class="text-sm shrink-0">${icons[type] || icons.info}</span><span class="flex-1">${this._escapeHtml(message)}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(() => el.remove(), 220);
    }, 3200);
  },

  alert(message, title = 'Informasi') {
    this._ensureNodes();
    return new Promise((resolve) => {
      const modal = document.getElementById('ui-dialog-modal');
      const titleEl = document.getElementById('ui-dialog-title');
      const msgEl = document.getElementById('ui-dialog-message');
      const inputEl = document.getElementById('ui-dialog-input');
      const actionsEl = document.getElementById('ui-dialog-actions');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputEl.classList.add('hidden');
      actionsEl.innerHTML = '<button id="ui-dlg-ok" class="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold">OK</button>';

      modal.classList.remove('hidden');
      const close = () => {
        modal.classList.add('hidden');
        resolve();
      };
      document.getElementById('ui-dlg-ok').onclick = close;
    });
  },

  confirm(message, title = 'Konfirmasi') {
    this._ensureNodes();
    return new Promise((resolve) => {
      const modal = document.getElementById('ui-dialog-modal');
      const titleEl = document.getElementById('ui-dialog-title');
      const msgEl = document.getElementById('ui-dialog-message');
      const inputEl = document.getElementById('ui-dialog-input');
      const actionsEl = document.getElementById('ui-dialog-actions');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputEl.classList.add('hidden');
      actionsEl.innerHTML = `
        <button id="ui-dlg-cancel" class="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold">Batal</button>
        <button id="ui-dlg-ok" class="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold">Ya, Lanjutkan</button>
      `;

      modal.classList.remove('hidden');
      document.getElementById('ui-dlg-cancel').onclick = () => {
        modal.classList.add('hidden');
        resolve(false);
      };
      document.getElementById('ui-dlg-ok').onclick = () => {
        modal.classList.add('hidden');
        resolve(true);
      };
    });
  },

  prompt(message, defaultValue = '', title = 'Masukkan Data') {
    this._ensureNodes();
    return new Promise((resolve) => {
      const modal = document.getElementById('ui-dialog-modal');
      const titleEl = document.getElementById('ui-dialog-title');
      const msgEl = document.getElementById('ui-dialog-message');
      const inputEl = document.getElementById('ui-dialog-input');
      const actionsEl = document.getElementById('ui-dialog-actions');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputEl.classList.remove('hidden');
      inputEl.value = defaultValue || '';
      actionsEl.innerHTML = `
        <button id="ui-dlg-cancel" class="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold">Batal</button>
        <button id="ui-dlg-ok" class="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold">Simpan</button>
      `;

      modal.classList.remove('hidden');
      setTimeout(() => inputEl.focus(), 50);

      const finish = (val) => {
        modal.classList.add('hidden');
        resolve(val);
      };
      document.getElementById('ui-dlg-cancel').onclick = () => finish(null);
      document.getElementById('ui-dlg-ok').onclick = () => finish(inputEl.value);
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') finish(inputEl.value);
      };
    });
  },

  showWaShareModal(messageText) {
    let modal = document.getElementById('ui-wa-share-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ui-wa-share-modal';
      modal.className = 'hidden fixed inset-0 z-[125] bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4 no-print';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200">
          <div class="px-5 py-3.5 bg-emerald-700 text-white font-bold text-sm flex items-center justify-between">
            <span>📲 Kirim Magic Link ke WhatsApp</span>
            <button id="ui-wa-close" class="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-xs">✕</button>
          </div>
          <div class="p-5 space-y-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Nomor WA Tujuan (Opsional — disarankan untuk WhatSie Linux)</label>
              <input id="ui-wa-phone" type="tel" placeholder="Contoh: 081234567890 (kosongkan untuk buka WhatsApp Web)" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Isi Pesan</label>
              <textarea id="ui-wa-text" rows="6" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono-code bg-slate-50 focus:outline-none"></textarea>
            </div>
          </div>
          <div class="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
            <button id="ui-wa-copy" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold">📋 Salin Pesan</button>
            <button id="ui-wa-open" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">🌐 Buka WhatsApp</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const phoneEl = document.getElementById('ui-wa-phone');
    const textEl = document.getElementById('ui-wa-text');
    phoneEl.value = '';
    textEl.value = messageText || '';
    modal.classList.remove('hidden');

    document.getElementById('ui-wa-close').onclick = () => modal.classList.add('hidden');
    document.getElementById('ui-wa-copy').onclick = () => {
      navigator.clipboard.writeText(textEl.value);
      this.toast('Pesan Magic Link disalin! Tinggal tempel di WhatsApp/WhatSie.', 'success');
    };
    document.getElementById('ui-wa-open').onclick = () => {
      let phone = phoneEl.value.replace(/[^\d]/g, '');
      if (phone.startsWith('0')) phone = '62' + phone.slice(1);
      const msg = encodeURIComponent(textEl.value);
      const url = phone
        ? `https://wa.me/${phone}?text=${msg}`
        : `https://web.whatsapp.com/send?text=${msg}`;
      window.open(url, '_blank');
      modal.classList.add('hidden');
    };
  },

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};
