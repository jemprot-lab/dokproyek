# Sistem Ekosistem Dokumentasi Proyek Kontraktor

Monorepo lengkap untuk dokumentasi foto proyek lapangan:
1. **`backend-gas/`** — Google Apps Script API + Google Drive + Google Sheets Database.
2. **`web-app-viewer/`** — Web App & PWA Viewer + Panel Admin (Magic Link WA, Kelola Akun/Cabut Akses APK, Deep Zoom, Split Compare, Export `.ZIP` & Laporan PDF).
3. **`mobile-apk-uploader/`** — Aplikasi Android APK untuk pekerja lapangan (Login 1x PIN 6 digit, EXIF/GPS utuh, anti-duplikat, Lock Screen Foreground Upload).

---

## Cara Instalasi & Deployment

### 1. Setup Master Vendor (1x Seumur Hidup di Akun Google Vendor)
1. Buat **1 Google Spreadsheet kosong** sebagai Master Vendor (salin **Spreadsheet ID**-nya).
2. Buka **Extensions > Apps Script** dari Spreadsheet tersebut, salin `Config.gs`, `VendorMaster.gs`, dan `VendorNotifier.gs`, lalu isi `MASTER_VENDOR_SPREADSHEET_ID`, `VENDOR_WA_NUMBER`, `VENDOR_CONTACT_WA`, dan `WA_API_KEY`.
3. Jalankan fungsi `initVendorMaster()` satu kali dari editor Apps Script. Otomatis sheet `Tenants_Master`, rumus kuota, trigger harian (02:00 & 08:00 WIB), trigger `onEdit`, serta menu **`🛠️ Panel Vendor`** langsung aktif.
4. Untuk menambah konsumen baru, cukup klik menu **`🛠️ Panel Vendor > ➕ Tambah Klien Baru (Auto-Provision)`** di Spreadsheet Master — sistem otomatis membuatkan Folder Root GDrive & Spreadsheet Database klien!

### 2. Backend per Konsumen (`backend-gas/`)
1. Buka [script.google.com](https://script.google.com) di akun Google Vendor, buat project baru untuk konsumen, lalu salin semua file di `backend-gas/` (`appsscript.json`, `Config.gs`, `SheetDatabase.gs`, `AuthMagicLink.gs`, `DriveController.gs`, `VendorMaster.gs`, `VendorNotifier.gs`, `Code.gs`).
2. Edit `Config.gs`: isi `TENANT_ID`, `ROOT_FOLDER_ID`, `SPREADSHEET_ID` (dari hasil Auto-Provision), `MASTER_VENDOR_SPREADSHEET_ID`, `ADMIN_SECRET`, dan `WEB_APP_URL`.
3. Jalankan fungsi `setupDatabase()` satu kali dari editor Apps Script untuk membuat 4 sheet (`Users`, `Magic_Links`, `Project_Cache`, `Audit_Logs`) dan akun default (`admin` / PIN `123456`).
4. Klik **Deploy > New deployment > Web app** (`Execute as: Me`, `Who has access: Anyone`), lalu salin **URL Web App (`/exec`)**.

### 2. Web App & PWA (`web-app-viewer/`)
1. Edit `web-app-viewer/js/api-client.js`, ganti `GAS_WEB_APP_URL` dengan URL `/exec` dari langkah 1 (atau atur langsung dari tombol *⚙️ Atur URL Server GAS* di halaman login).
2. Host folder `web-app-viewer/` di GitHub Pages, Netlify, Vercel, atau Firebase Hosting (wajib HTTPS agar fitur PWA Install & Clipboard berfungsi).
3. Buka di Chrome/Safari HP lalu pilih **Install Aplikasi** untuk menggunakannya sebagai PWA.

### 3. Android APK (`mobile-apk-uploader/`)
1. Buka folder `mobile-apk-uploader/` di Android Studio.
2. Edit `RawFileStreamer.kt` -> ganti `GAS_URL` dengan URL `/exec` dari langkah 1.
3. Build APK (`Build > Build Bundle(s) / APK(s) > Build APK(s)`).
4. Bagikan file `.apk` ke HP mandor. Mandor login **1 kali** pakai username + PIN 6 digit yang dibuat Admin di Web App.
