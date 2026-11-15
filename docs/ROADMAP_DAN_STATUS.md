# Roadmap & Status Proyek DokProyek

Dokumen ini dikelola mengikuti prinsip **4 Skill Utama** (`agentic-database-orchestrator`, `dev-architecture-logger`, `omni-platform-ux-architect`, `project-context-scribe`) sebagai acuan kesinambungan pengembangan.

---

## 1. Status Terbaru (Selesai di Kode)

### Backend Google Apps Script (`backend-gas/`)
- [`Code.gs`](../backend-gas/Code.gs) & [`DriveController.gs`](../backend-gas/DriveController.gs):
  - Endpoint ringan `LIST_PROJECT_NAMES` khusus autocomplete APK (tanpa payload `Sub_Folders_JSON`).
  - Aksi admin `DELETE_FOLDER` (memindahkan proyek atau folder keterangan ke Sampah Google Drive + sinkronisasi `Project_Cache`).
  - Proteksi Magic Link bertingkat (izin penuh per proyek atau per sub-folder keterangan tertentu) pada `SEARCH_PROJECTS` & `LIST_PHOTOS`.
- [`AuthMagicLink.gs`](../backend-gas/AuthMagicLink.gs):
  - Mapping nama `Proyek › Sub-Folder` pada tabel daftar Magic Link aktif dan template pesan WhatsApp.
- [`VendorMaster.gs`](../backend-gas/VendorMaster.gs):
  - `parseSafeGbNumber()` & `formatDueDateDmy()` untuk membaca angka desimal dan tanggal jatuh tempo lokal Indonesia secara presisi.

### Web App & PWA (`web-app-viewer/`)
- Pencarian proyek & keterangan lokal instan di sidebar (`app.js`) dan di dalam Modal Magic Link (`admin-manager.js`).
- Alur klik proyek menampilkan kartu **Folder Keterangan** terlebih dahulu sebelum memuat foto.
- Export batch JPG, batch ZIP, laporan PDF, serta Lightbox Zoom/Rotate/Split Compare via proxy `GET_PHOTO_BLOB`.
- Perbaikan UX Mobile & PWA: drawer toggle `📂 Proyek` untuk layar HP (`index.html`), `env(safe-area-inset-*)` (`styles.css`), keselarasan splash `manifest.json`, dan Service Worker `dokproyek-pwa-v5` (`sw.js`).

### Android APK Uploader (`mobile-apk-uploader/`) — Versi `1.0.4` (`versionCode 5`)
- Autocomplete proyek cepat di memori menggunakan endpoint ringan `LIST_PROJECT_NAMES` (`MainActivity.kt`).
- `RawFileStreamer.httpClient` terpusat + `getGasUrl()` dinamis dengan menu **⚙️ Ganti URL Server** di layar Login (`LoginActivity.kt`, `RawFileStreamer.kt`).
- Safe Area `WindowInsetsCompat.Type.systemBars()` & **Sticky Bottom Thumb-Zone** untuk tombol `🚀 KIRIM FOTO` (`MainActivity.kt`).

---

## 2. Wajib Dilakukan (Deploy Manual GAS)
Setiap kali file di `backend-gas/` berubah, salin ke editor Google Apps Script lalu klik **Deploy > Manage deployments > Edit (Pensil) > Version: New version > Deploy**:
- `Code.gs`
- `DriveController.gs`
- `AuthMagicLink.gs`
- `VendorMaster.gs`

*(URL `/exec` tidak berubah selama memakai Edit Deployment yang sama.)*

---

## 3. Backlog / Rencana Berikutnya
1. **WhatsApp Gateway Konsumen:** Menambahkan adapter HTTP (misal Fonnte/Wablas) di `VendorMaster.gs` dengan API key disimpan di `PropertiesService.getScriptProperties()` agar pengiriman Magic Link ke konsumen bisa otomatis dari server.
2. **Otomasi Deploy GAS (`clasp`):** Opsional jika intensitas update backend meningkat, integrasikan `clasp push && clasp deploy` ke GitHub Actions.
