# Master Blueprint: Sistem Ekosistem Dokumentasi Proyek Kontraktor (AI-Ready Monorepo Specification)

> **INSTRUKSI KHUSUS UNTUK AI BUILDER (ANTIGRAVITY):**
> Dokumen ini adalah *Single Source of Truth* (Spesifikasi Teknis & Desain Lengkap). Bangun seluruh ekosistem aplikasi dalam **1 Repositori GitHub (Monorepo)** dengan mengikuti struktur direktori, skema database Google Sheets, kontrak API JSON, dan spesifikasi UI/UX yang tertulis secara ketat di dokumen ini.

---

## 1. Ringkasan Eksekutif & Arsitektur Sistem (Project Context Scribe)
Sistem dokumentasi lapangan kontraktor ini terdiri dari **3 komponen utama** dalam satu kesatuan repositori:
1. **`backend-gas/` (Serverless Engine & Database Orchestrator):** Berjalan di atas Google Apps Script yang terhubung langsung ke **Google Drive** (penyimpanan hirarki folder & file foto, menggunakan **Advanced Drive Service** untuk metadata EXIF GPS & status Star) dan **Google Spreadsheet** (database User, Session Token, Magic Link, Cache Proyek, dan Audit Log). Dilengkapi `LockService` untuk mencegah *race condition* saat upload bersamaan.
2. **`mobile-apk-uploader/` (Android APK - Field Uploader):** Aplikasi Android khusus tim lapangan untuk **upload foto**. Menggunakan mekanisme **Login 1x Seumur Hidup (*Persistent Session Token*)**: mandor cukup login sekali saat pertama kali pakai, lalu token tersimpan aman di HP (tidak perlu login ulang setiap hari), namun Admin tetap bisa mencabut/menghapus aksesnya kapan saja dari Web App. Murni mengambil foto dari Galeri HP (tanpa kamera internal & tanpa GPS aplikasi), menjaga 100% keutuhan metadata EXIF/Geotagging (*Direct Binary Stream*), memiliki deteksi anti-duplikat, hanya menampilkan maksimal 5 proyek berstatus `ACTIVE` saat pencarian, dan mendukung pengiriman latar belakang sekuensial dengan *auto-retry* saat layar terkunci (*Lock Screen Foreground Service*).
3. **`web-app-viewer/` (Responsive Web App & PWA - Workstation & Mobile Viewer):** Aplikasi web sekaligus **Progressive Web App (PWA)** (dapat di-install langsung ke layar utama HP/Laptop) untuk Admin (Kontraktor), Pengawas, dan Klien untuk **melihat, mengaudit, dan mengekspor foto hasil upload**. Mendukung *Deep Zoom* 500% di laptop, komparasi *Before/After*, *Batch Download* `.ZIP`, cetak **Laporan PDF 1-Klik**, kirim ke WhatsApp, manajemen **Multi-Project Magic Link** (termasuk **Kirim Ulang WA / Salin Link** jika pesan WA terhapus), **Manajemen Akun & Pencabutan Akses Uploader APK**, serta fitur khusus Admin (Pindah Folder Foto, Rename Folder, Star/Favorit, Catatan Foto, Arsip Proyek, dan Soft-Delete).

---

## 2. Struktur Direktori Monorepo GitHub (Dev Architecture Logger)
Antigravity harus menginisialisasi repositori dengan struktur file dan pembagian tanggung jawab modul berikut:

```text
repo-dokumentasi-proyek/
├── README.md                              # Panduan instalasi & deployment Monorepo
├── docs/
│   └── rencana_aplikasi.md                # Master Blueprint (Dokumen ini)
│
├── backend-gas/                           # [MODUL 1] Google Apps Script Backend (1 Akun Google Vendor)
│   ├── appsscript.json                    # Manifest GAS (OAuth Scopes + Advanced Drive Service v3)
│   ├── Code.gs                            # Entry point: doGet(e), doPost(e), & setupDatabase()
│   ├── Config.gs                          # Konstanta: ROOT_FOLDER_ID, SPREADSHEET_ID, TENANT_ID, MASTER_VENDOR_SPREADSHEET_ID, VENDOR_CONTACT_WA
│   ├── SheetDatabase.gs                   # Inisialisasi otomatis 4 Sheet, LockService, & Indexing Cache
│   ├── AuthMagicLink.gs                   # Login (Admin/Viewer/Uploader), Revoke Token, Generate/Resend/Revoke Magic Link
│   ├── DriveController.gs                 # Upload Binary, Dedup Check, Get Photo Blob Proxy, Move, Rename, Star, Caption, Trash, Empty Trash
│   ├── VendorMaster.gs                    # Engine SaaS Vendor: initVendorMaster(), Auto-Provision Klien, Kuota & Billing, Custom Menu & onEdit
│   └── VendorNotifier.gs                  # Notifikasi WA Otomatis (CallMeBot / Fonnte / Wablas) untuk Alert Kuota 90% & Tagihan H-3
│
├── mobile-apk-uploader/                   # [MODUL 2] Aplikasi Android APK (Kotlin)
│   ├── AndroidManifest.xml                # Permissions: Media, ACCESS_MEDIA_LOCATION, FOREGROUND_SERVICE_DATA_SYNC, WakeLock
│   ├── build.gradle                       # Konfigurasi minSdkVersion 24 (Android 7.0) s/d targetSdkVersion 34+
│   └── src/main/
│       ├── ui/
│       │   ├── LoginActivity.kt           # Layar Login 1x (simpan Auth_Token di EncryptedSharedPreferences / SharedPrefs)
│       │   ├── MainActivity.kt            # Single-Screen UI, Permission Gatekeeper, Search Top 5 Active Projects
│       │   └── components/ExifBadge.kt    # Pembaca tag GPS & Timestamp via ExifInterface sebelum upload
│       └── services/
│           ├── UploadForegroundService.kt # Service latar belakang (dataSync) + WakeLock + Auto-Retry + Lock Screen Notification
│           └── RawFileStreamer.kt         # Pembaca byte asli (setRequireOriginal) & pengirim Base64 1-foto-per-request
│
└── web-app-viewer/                        # [MODUL 3] Web App & PWA Viewer & In-App Admin (HTML5/Tailwind/Vanilla JS)
    ├── index.html                         # Kerangka SPA (Login View, Gallery Grid, Lightbox, Admin Modals)
    ├── manifest.json                      # Konfigurasi PWA (Nama, Ikon, Display Standalone, Theme Color)
    ├── sw.js                              # Service Worker PWA (Caching shell aset agar installable & cepat dibuka)
    ├── css/
    │   └── styles.css                     # Custom Design Tokens, Print/PDF Media Queries, Zoom Canvas
    └── js/
        ├── api-client.js                  # Wrapper fetch() ke URL Deployment GAS + Session State + Auto-Logout jika Revoked
        ├── app.js                         # Controller utama, PWA Install Prompt, Search 5 Proyek, Filter Star, Checkbox Manager
        ├── lightbox-workstation.js        # Deep Zoom 500%, Pan, Rotate 90°, Split Compare, Keyboard Shortcuts
        ├── admin-manager.js               # Modal Magic Link (Create, Copy, Resend WA, Revoke), Modal Kelola User/Uploader, Move, Rename, Delete
        └── export-engine.js               # Integrasi JSZip (via GET_PHOTO_BLOB proxy), jsPDF (Laporan PDF), & Web Share API (WA)
```

---

## 3. Sistem Desain & Panduan UI/UX (Omni-Platform UX Architect)

### A. Design Tokens (Warna, Tipografi, & Ergonomi)
* **Tema Visual:** *High-Contrast Construction Daylight* (Mudah dibaca di bawah matahari lapangan untuk APK, dan nyaman di mata saat mode *Workstation* di laptop).
* **Palet Warna (Hex):**
  * `Primary Accent`: `#F59E0B` (Safety Amber / Kuning Konstruksi) — untuk tombol aksi utama & sorotan aktif.
  * `Primary Dark`: `#0F172A` (Slate 900) — warna latar belakang *Workstation Lightbox* & header.
  * `Surface / Card`: `#FFFFFF` (Putih bersih) dengan border `#E2E8F0` (Slate 200).
  * `Success / GPS OK`: `#10B981` (Emerald 500) — indikator EXIF lengkap & status link `ACTIVE`.
  * `Warning / No GPS`: `#F97316` (Orange 500) — indikator peringatan foto tanpa koordinat GPS.
  * `Danger / Delete / Revoke`: `#EF4444` (Red 500) — tombol hapus foto, matikan Magic Link, & cabut akses APK mandor.
* **Tipografi & Ukuran Sentuh:**
  * Font Utama: `Inter` atau `Plus Jakarta Sans` (Sans-serif modern, angka proporsional).
  * Font Monospace (Koordinat GPS, Tanggal, Token): `JetBrains Mono` atau `Roboto Mono`.
  * **Standar Tombol Lapangan (APK & Mobile Web):** Tinggi minimal `52px`, sudut membulat `12px`, jarak antar elemen minimal `12px` (mencegah salah tekan).

### B. Spesifikasi Layar Aplikasi Upload Foto (Android APK — Ramah Orang Awam IT)
1. **Gerbang Login 1x Seumur Hidup (*First-Time Login* dengan PIN 6 Digit):**
   * Saat pertama kali APK dibuka (belum ada `Auth_Token` tersimpan), muncul layar login sederhana: **Username** + **PIN 6 Digit** (menggunakan *numeric keypad* besar seperti PIN ATM).
   * Setelah login berhasil, `Auth_Token` disimpan permanen di perangkat. Pembukaan aplikasi berikutnya **langsung masuk ke Layar Utama** tanpa login ulang.
   * Jika suatu saat Admin mencabut akses akun tersebut dari Web App dan server mengembalikan `401 / TOKEN_REVOKED`, APK otomatis menghapus token lokal dan mengembalikan layar ke halaman login dengan pesan ramah: *"🔒 Akses HP ini sudah ditutup Admin."*
2. **Gerbang Izin Awal (*Permission Gatekeeper* + Layar Pengantar Ramah):**
   * Sebelum popup izin sistem Android muncul, tampilkan **1 layar pengantar singkat** berbahasa awam: *"Supaya foto bisa diambil dari Galeri dan dikirim otomatis, sebentar lagi tekan tombol **IZINKAN** ya."*
   * Cek izin secara berurutan:
     * Android 13+ (API 33+): `READ_MEDIA_IMAGES` + `ACCESS_MEDIA_LOCATION` + `POST_NOTIFICATIONS`.
     * Android 10–12 (API 29–32): `READ_EXTERNAL_STORAGE` + `ACCESS_MEDIA_LOCATION`.
     * Android <= 9 (API <= 28): `READ_EXTERNAL_STORAGE`.
   * Jika ada izin yang ditolak, tampilkan *Bottom Sheet* edukatif dengan tombol **[Buka Pengaturan Izin HP]**.
3. **Komponen Layar Utama (Single-Screen & Bahasa Sehari-hari):**
   * **Input 1 — Pencarian Proyek Aktif (Dropdown Autocomplete Maks 5 Item):**
     * Hanya mengambil proyek dengan `Project_Status === "ACTIVE"`.
     * Menampilkan maksimal **5 nama proyek** paling relevan saat diketik.
     * Jika tidak ditemukan, tetap tersedia tombol **`[+ Buat Proyek Baru: "{teks_ketikan}"]`**.
   * **Input 2 — Tanggal Indonesia & Keterangan Manual:**
     * Kolom Tanggal otomatis terisi hari ini dengan format `DD-MM-YYYY` (contoh: `15-08-2026`), bisa diubah via *Date Picker*.
     * Kolom Keterangan berupa teks bebas manual (contoh: `progress 10%`).
     * Sistem menggabungkannya menjadi nama sub-folder: `15-08-2026 progress 10%`.
   * **Preview Jalur Folder (*Live Path Banner*):**
     * Menampilkan teks: `📂 Folder Tujuan: {Nama_Proyek} > {DD-MM-YYYY} {Keterangan}`.
   * **Pemilih Galeri & Pemeriksa Lokasi Foto:**
     * Menggunakan pemilih media Android untuk memilih banyak foto sekaligus dari Galeri.
     * Membaca stream asli menggunakan `MediaStore.setRequireOriginal(uri)`.
     * Mengekstrak `TAG_GPS_LATITUDE`, `TAG_GPS_LONGITUDE`, dan `TAG_DATETIME_ORIGINAL` menggunakan `ExifInterface`.
     * Menampilkan *Badge* berbahasa awam di atas tiap *thumbnail* foto:
       * `📍 Lokasi Ada` jika koordinat ditemukan.
       * `⚠️ Tanpa Lokasi (Tetap Bisa Kirim)` jika foto tidak memiliki metadata lokasi.
   * **Eksekusi Upload Latar Belakang (*Lock Screen Mode* & Tahan Sinyal Lemah):**
     * Menekan tombol **`[🚀 KIRIM X FOTO]`** akan menjalankan `UploadForegroundService` (`foregroundServiceType="dataSync"`) dengan `PARTIAL_WAKE_LOCK`.
     * Foto dikirim **secara sekuensial (1 foto per request)** dengan mekanisme *auto-retry*.
     * Jika sinyal hilang/lemah, tidak memunculkan kode error teknis, melainkan kotak kuning tenang: *"Sinyal lemah. Foto masih aman di daftar tunggu, tekan **[Kirim Ulang]** kalau sudah dapat sinyal."*
     * Menampilkan *Progress Bar* di dalam aplikasi **dan** di notifikasi layar kunci Android dengan bahasa awam:
       * Saat berjalan: `⏳ Mengirim foto ke-3 dari 10... (Layar boleh dikunci)`
       * Jika foto sudah pernah dikirim: `ℹ️ Foto ini sudah pernah dikirim sebelumnya`
       * Saat selesai: `✅ Beres! Semua foto sudah masuk kantor` disertai getaran pendek (`VIBRATE`).

---

## 4. Spesifikasi Detail Web App & PWA Viewer & In-App Admin

### A. Dukungan Progressive Web App (PWA)
* Dilengkapi `manifest.json` dan `sw.js` agar Web App dapat di-install ke layar utama Android/iOS/Desktop tanpa perlu menginstal APK tambahan.
* Diperuntukkan khusus untuk **melihat, membandingkan, meninjau EXIF/GPS, mengunduh `.ZIP`/PDF, dan melakukan manajemen Admin**.

### B. Manajemen Akun & Pencabutan Otentikasi APK/User (Khusus Admin)
Di dalam **Modal Manajemen Akun & Akses** pada Web App Admin, Admin dapat mengelola siapa saja yang boleh upload dari APK maupun mengakses Web App:
1. **Tambah Akun Baru:** Input `Username`, `Password/PIN`, `Role` (`ADMIN`, `UPLOADER`, atau `VIEWER`), dan `Allowed_Projects`.
2. **Cabut Otentikasi Seketika (`[🛑 Cabut Akses / Hapus]`):**
   * Menghapus `Auth_Token` milik user/mandor tersebut dan mengubah statusnya menjadi `REVOKED` (atau menghapus akun).
   * Begitu dicabut, APK di HP mandor tersebut otomatis tertolak saat mencoba mencari proyek atau mengupload foto, sehingga aman jika ada karyawan keluar atau HP lapangan hilang.
3. **Reset Password / PIN:** Mengganti kredensial akun dan otomatis mereset `Auth_Token` lama agar perangkat lama keluar.

### C. Manajemen Magic Link & Solusi Jika Link Terhapus di WA (Khusus Admin)
Semua pengaturan akses klien dilakukan di dalam **Modal Manajemen Magic Link** di Web App (tanpa membuka Spreadsheet):
1. **Membuat Magic Link Baru:**
   * Input **Nama Label / Klien** (misal: `Pak Budi - Owner`).
   * **Pilih Banyak Proyek (*Multi-Project Checkbox*):** Admin dapat mencentang 1 atau beberapa proyek sekaligus untuk 1 link yang sama.
   * **Filter Foto:** Pilih `Semua Foto` atau `⭐ Hanya Foto Berbintang`.
   * **Masa Berlaku Ketat (*Strict Expiry*):** Pilih tombol cepat **`1 Hari`**, **`7 Hari`**, **`14 Hari`**, **`30 Hari`**, atau pilih tanggal spesifik dari **Kalender (*Date Picker*)**. Tidak ada perpanjangan otomatis.
2. **Tabel "Daftar Magic Link Aktif" (Solusi Jika Chat WA Terhapus):**
   * Di bagian bawah modal yang sama, terdapat tabel daftar seluruh Magic Link yang pernah dibuat.
   * **Jika pesan WA di HP Admin atau Klien tidak sengaja terhapus**, Admin **TIDAK PERLU** membuat link baru (selama masa aktifnya belum habis). Admin cukup membuka tabel ini dan menekan salah satu dari 4 tombol aksi pada baris link tersebut:
     * **`[📲 Kirim Ulang WA]` (*Resend to WhatsApp*):** Langsung membuka WhatsApp (HP/Web) dengan teks pesan lengkap berisi URL Magic Link yang sama, daftar proyeknya, dan sisa masa aktifnya.
     * **`[📋 Salin Link]` (*Copy URL*):** Menyalin URL Magic Link ke *clipboard* dalam 1 klik untuk ditempel manual ke chat.
     * **`[✏️ Edit Proyek]`:** Menambah atau mengurangi daftar proyek yang diizinkan pada link tersebut tanpa mengubah URL tokennya.
     * **`[🛑 Matikan]` (*Revoke*):** Memutus akses link detik itu juga jika proyek batal atau link bocor.

### D. Wireframe Lengkap Modal Manajemen Magic Link (Buat Baru & Kirim Ulang)
```text
+-----------------------------------------------------------------------------------+
| 🔗 MANAJEMEN MAGIC LINK KLIEN & PENGAWAS (IN-APP ADMIN)                     [ X ] |
+-----------------------------------------------------------------------------------+
| [ TAB 1: ➕ Buat Link Baru ]   [ TAB 2: 📋 Daftar Link Aktif & Kirim Ulang (3) ]   |
+-----------------------------------------------------------------------------------+
| (Tampilan Saat TAB 2 Dibuka - Solusi Jika Link Terhapus di WA):                   |
|                                                                                   |
| 🔍 Cari nama klien / proyek...                                                    |
| +--------------------+-----------------------+----------------+-----------------+ |
| | Klien & Filter     | Proyek Diizinkan      | Batas Waktu    | Aksi Cepat      | |
| +--------------------+-----------------------+----------------+-----------------+ |
| | Pak Budi (Owner)   | • Proyek A            | 22-08-2026     | [📲 Kirim WA]   | |
| | Filter: ⭐ Favorit | • Gudang Logistik     | (Sisa 5 Hari)  | [📋 Salin Link] | |
| | 👁️ Dibuka: 12x     | [✏️ Edit Proyek]      | 🟢 ACTIVE      | [🛑 Matikan]    | |
| +--------------------+-----------------------+----------------+-----------------+ |
| | Pengawas Dinas     | • Proyek Jembatan     | 30-08-2026     | [📲 Kirim WA]   | |
| | Filter: Semua Foto |                       | (Sisa 13 Hari) | [📋 Salin Link] | |
| | 👁️ Dibuka: 3x      | [✏️ Edit Proyek]      | 🟢 ACTIVE      | [🛑 Matikan]    | |
| +--------------------+-----------------------+----------------+-----------------+ |
| | Mandor Lama        | • Proyek Ruko B       | 10-08-2026     | [🗑️ Hapus Log]  | |
| | Filter: Semua Foto |                       | 🔴 EXPIRED     |                 | |
| +--------------------+-----------------------+----------------+-----------------+ |
+-----------------------------------------------------------------------------------+
```

### E. Fitur Khusus Admin Lainnya di Galeri Web App
1. **Pindah Folder Foto (*Move Photo*):** Memindahkan 1 atau banyak foto yang salah upload antar-proyek atau antar-tanggal progres secara instan di sisi server (`file.moveTo()`), menjaga EXIF tetap utuh.
2. **Ubah Nama Folder (*Instant Rename*):** Mengoreksi salah ketik (*typo*) pada nama Proyek maupun Sub-Folder Tanggal langsung dari header galeri.
3. **Bintang / Foto Pilihan (`⭐ Star`):** Menandai foto terbaik agar mudah difilter oleh Admin maupun dikurasi khusus untuk Magic Link klien (menggunakan Advanced Drive Service `starred: true`).
4. **Catatan per Foto (*Photo Caption*):** Menambahkan teks keterangan/revisi pada masing-masing foto yang disimpan di metadata `description` Google Drive.
5. **Status Proyek (`🟢 ACTIVE` vs `📦 ARCHIVED`):** Mengarsipkan proyek yang sudah selesai agar tidak lagi muncul di pencarian APK Uploader mandor, namun tetap tersimpan rapi di Web App Admin.
6. **Hapus Aman (*Soft Delete*):** Memindahkan foto blur/salah ke *Trash* Google Drive (`setTrashed(true)`) dengan masa pemulihan 30 hari.

### F. Fitur Workstation Preview (Laptop) & Export (HP/Laptop)
1. **Canvas Deep Zoom 500% & Pan:** Menggunakan transformasi matriks CSS/Canvas pada gambar beresolusi tinggi saat di-*scroll* dengan roda mouse, dilengkapi tombol putar `🔄 90°`. Grid galeri memuat *thumbnail* terlebih dahulu, lalu memuat resolusi penuh saat Lightbox dibuka.
2. **Mode Split-Screen Compare:** Membagi layar laptop menjadi 2 kolom sejajar saat 2 foto dicentang untuk membandingkan foto *Before* (misal `progress 10%`) dan *After* (misal `progress 80%`).
3. **Batch Download `.ZIP`:** Mengunduh banyak foto yang dicentang sekaligus menjadi 1 bundel `.ZIP` menggunakan `JSZip` (mengambil data biner melalui endpoint proxy `GET_PHOTO_BLOB` GAS agar bebas kendala CORS dan menjaga data EXIF asli).
4. **Cetak Laporan PDF 1-Klik:** Menghasilkan file PDF rapi via `jsPDF` berisi Kop Proyek, Tanggal Progres, Grid Foto (2 atau 4 per halaman), Jam Potret, Koordinat GPS (tautan aktif ke Google Maps), dan Catatan Foto.

---

## 5. Skema Database Google Spreadsheet (Agentic Database Orchestrator)
Script `SheetDatabase.gs` wajib memiliki fungsi `initDatabase()` yang otomatis memeriksa dan membuat 4 *Sheet* (Tab) berikut beserta baris *header*-nya jika belum ada, serta menggunakan `LockService.getScriptLock()` pada setiap operasi tulis:

### Tabel 1: Sheet `Users`
| Kolom | Nama Field | Tipe Data | Contoh Nilai / Keterangan |
| :--- | :--- | :--- | :--- |
| `A` | `User_ID` | String (UUID) | `USR-001` |
| `B` | `Username` | String | `admin_bos` atau `mandor_agus` |
| `C` | `Password_Hash` | String (SHA-256) | Hash dari password / PIN login |
| `D` | `Role` | Enum String | `ADMIN` (Kontrol Penuh), `UPLOADER` (APK Lapangan), atau `VIEWER` (Hanya Lihat & Unduh) |
| `E` | `Allowed_Projects` | CSV String | `ALL` (untuk Admin/Uploader umum) atau `FLD_ID_1,FLD_ID_2` (ID Folder Proyek) |
| `F` | `Auth_Token` | String | Token sesi aktif (disimpan permanen di APK/Browser; dikosongkan jika dicabut) |
| `G` | `Status` | Enum String | `ACTIVE` atau `REVOKED` (Jika `REVOKED`, seluruh request dengan token ini otomatis ditolak) |
| `H` | `Created_At` | ISO Timestamp | `2026-08-15T08:00:00Z` |

### Tabel 2: Sheet `Magic_Links`
| Kolom | Nama Field | Tipe Data | Contoh Nilai / Keterangan |
| :--- | :--- | :--- | :--- |
| `A` | `Token` | String (Unique) | `ml_9f8a7b6c5d` (Digunakan pada parameter URL `?token=...`) |
| `B` | `Label_Penerima` | String | `Pak Budi - Owner Proyek A & Gudang` |
| `C` | `Allowed_Projects` | CSV String | `FLD_ID_1,FLD_ID_2` (Mendukung banyak proyek dalam 1 link) |
| `D` | `Photo_Filter` | Enum String | `ALL` (Semua Foto) atau `STARRED_ONLY` (Hanya Foto Berbintang ⭐) |
| `E` | `Created_Date` | String | `15-08-2026 09:30` |
| `F` | `Expiry_Date` | String | `22-08-2026 23:59` (Format `DD-MM-YYYY HH:mm`, strict expiry) |
| `G` | `Status` | Enum String | `ACTIVE`, `EXPIRED`, atau `REVOKED` |
| `H` | `View_Count` | Integer | `12` (Bertambah otomatis setiap kali token diakses) |

### Tabel 3: Sheet `Project_Cache`
| Kolom | Nama Field | Tipe Data | Contoh Nilai / Keterangan |
| :--- | :--- | :--- | :--- |
| `A` | `Folder_ID_GDrive` | String | ID Folder Google Drive Level 1 (Folder Proyek) |
| `B` | `Nama_Proyek` | String | `Proyek Jembatan Merah` |
| `C` | `Project_Status` | Enum String | `ACTIVE` (Muncul di APK & Web) atau `ARCHIVED` (Hanya di Web) |
| `D` | `Last_Updated` | ISO Timestamp | `2026-08-15T10:15:00Z` |
| `E` | `Sub_Folders_JSON` | JSON String | `[{"id":"SUB_1","name":"15-08-2026 progress 10%","count":12}]` |

### Tabel 4: Sheet `Audit_Logs`
| Kolom | Nama Field | Tipe Data | Contoh Nilai / Keterangan |
| :--- | :--- | :--- | :--- |
| `A` | `Timestamp` | String | `15-08-2026 14:22:10` |
| `B` | `Actor` | String | `admin_bos` atau `mandor_agus` |
| `C` | `Action_Type` | Enum String | `LOGIN`, `UPLOAD`, `SKIP_DUP`, `MOVE`, `RENAME`, `ARCHIVE`, `DELETE`, `LINK_CREATE`, `AUTH_REVOKE` |
| `D` | `Target_Items` | String | Nama file foto, user, atau nama folder |
| `E` | `Details` | String | `Dipindahkan dari Proyek B ke Proyek A > 15-08-2026 progress 10%` |

---

## 6. Spesifikasi Kontrak API JSON (Backend GAS <-> APK & Web/PWA)
Semua komunikasi ke Google Apps Script menggunakan metode `POST` (dengan payload JSON di dalam `postData.contents` dan `Content-Type: text/plain;charset=utf-8` untuk menghindari masalah *CORS preflight* pada GAS) serta metode `GET` untuk pembacaan awal. Setiap endpoint non-publik wajib memvalidasi `authToken` (dari tabel `Users`) atau `magicToken` (dari tabel `Magic_Links`).

### A. Endpoint 1: Login & Validasi Sesi (APK & Web App)
* **Action:** `LOGIN`
* **Request Payload:**
  ```json
  {
    "action": "LOGIN",
    "username": "mandor_agus",
    "password": "******"
  }
  ```
* **Response Payload:**
  ```json
  {
    "status": "success",
    "user": {
      "userId": "USR-002",
      "username": "mandor_agus",
      "role": "UPLOADER",
      "authToken": "tok_a1b2c3d4e5f6..."
    }
  }
  ```

### B. Endpoint 2: Manajemen Akun & Pencabutan Otentikasi (Admin Web App)
* **Action:** `MANAGE_USERS`
* **Request Payload:**
  ```json
  {
    "action": "MANAGE_USERS",
    "subAction": "REVOKE_AUTH",
    "adminToken": "SESSION_TOKEN_ADMIN",
    "targetUserId": "USR-002",
    "username": null,
    "password": null,
    "role": null,
    "allowedProjects": null
  }
  ```
  *(Nilai `subAction` mendukung `"LIST"`, `"CREATE"`, `"REVOKE_AUTH"`, `"ACTIVATE_AUTH"`, `"RESET_PASSWORD"`, dan `"DELETE_USER"`).*

### C. Endpoint 3: Pencarian Proyek Aktif (APK & Web App)
* **Action:** `SEARCH_PROJECTS`
* **Request Payload:**
  ```json
  {
    "action": "SEARCH_PROJECTS",
    "authToken": "tok_a1b2c3d4e5f6...",
    "query": "jembatan",
    "includeArchived": false,
    "limit": 5
  }
  ```
* **Response Payload:**
  ```json
  {
    "status": "success",
    "projects": [
      {
        "folderId": "1A2B3C...",
        "projectName": "Proyek Jembatan Merah",
        "projectStatus": "ACTIVE",
        "subFolders": [
          { "subId": "9X8Y7Z...", "subName": "15-08-2026 progress 10%" }
        ]
      }
    ]
  }
  ```

### D. Endpoint 4: Upload Foto dengan Deteksi Duplikat & Pelestarian EXIF (APK -> GAS)
* **Action:** `UPLOAD_PHOTO_RAW`
* **Logika Server:**
  1. Validasi `authToken` (pastikan user berstatus `ACTIVE` dan role `ADMIN` atau `UPLOADER`). Jika `REVOKED`, kembalikan error `"TOKEN_REVOKED"`.
  2. Gunakan `LockService.getScriptLock()` saat memeriksa/membuat folder agar tidak terjadi duplikasi folder.
  3. Cek apakah folder `projectName` sudah ada di Root Folder GDrive; jika belum, buat folder baru dan catat di `Project_Cache`.
  4. Cek apakah sub-folder `{dateStr} {progressNote}` sudah ada di dalam folder proyek; jika belum, buat sub-folder baru.
  5. **Anti-Double Upload Check:** Cek apakah di dalam sub-folder tersebut sudah ada file dengan `fileName` dan `fileSize` (byte) yang persis sama. Jika ada, kembalikan status `"skipped_duplicate"`.
  6. Jika belum ada, konversi `base64Data` kembali menjadi *Blob* biner murni tanpa mengubah *byte* apa pun, lalu simpan ke sub-folder menggunakan `folder.createFile(blob)` dan catat di `Audit_Logs`.
* **Request Payload:**
  ```json
  {
    "action": "UPLOAD_PHOTO_RAW",
    "authToken": "tok_a1b2c3d4e5f6...",
    "projectName": "Proyek Jembatan Merah",
    "subFolderName": "15-08-2026 progress 10%",
    "fileName": "IMG_20260815_091200.jpg",
    "fileSize": 4192304,
    "mimeType": "image/jpeg",
    "exifSummary": {
      "hasGps": true,
      "lat": -6.200000,
      "lng": 106.816666,
      "dateTimeOriginal": "15-08-2026 09:12:00"
    },
    "base64Data": "/9j/4AAQSkZJRgABAQEASABIAAD..."
  }
  ```

### E. Endpoint 5: Manajemen Magic Link (Create, List/Resend, Edit, Revoke)
* **Action:** `MANAGE_MAGIC_LINK`
* **Request Payload (Create / Edit / Revoke):**
  ```json
  {
    "action": "MANAGE_MAGIC_LINK",
    "subAction": "CREATE",
    "adminToken": "SESSION_TOKEN_ADMIN",
    "labelPenerima": "Pak Budi - Owner",
    "allowedProjectIds": ["FLD_ID_1", "FLD_ID_2"],
    "photoFilter": "STARRED_ONLY",
    "expiryDate": "22-08-2026 23:59"
  }
  ```
* **Response Payload (Termasuk URL untuk Kirim Ulang WA / Salin Link):**
  ```json
  {
    "status": "success",
    "magicLink": {
      "token": "ml_9f8a7b6c5d",
      "fullUrl": "https://web-viewer-url.app/?token=ml_9f8a7b6c5d",
      "labelPenerima": "Pak Budi - Owner",
      "allowedProjectNames": ["Proyek A", "Gudang Logistik"],
      "photoFilter": "STARRED_ONLY",
      "expiryDate": "22-08-2026 23:59",
      "whatsappMessageTemplate": "Halo *Pak Budi - Owner*,\nBerikut adalah tautan aplikasi dokumentasi foto untuk:\n📂 *Proyek A, Gudang Logistik*\n\nSilakan klik tautan di bawah ini untuk melihat, memperbesar (zoom), dan mengunduh foto:\n🔗 https://web-viewer-url.app/?token=ml_9f8a7b6c5d\n\n_Catatan: Tautan ini aktif hingga 22-08-2026 23:59 WIB._"
    }
  }
  ```

### F. Endpoint 6: Aksi Admin pada File & Folder (Move, Rename, Star, Caption, Archive, Delete)
* **Action:** `ADMIN_FILE_OPS`
* **Request Payload:**
  ```json
  {
    "action": "ADMIN_FILE_OPS",
    "adminToken": "SESSION_TOKEN_ADMIN",
    "operation": "MOVE_FILES", 
    "fileIds": ["FILE_ID_1", "FILE_ID_2"],
    "targetProjectId": "FLD_ID_PROYEK_A",
    "targetSubFolderName": "15-08-2026 progress 10%",
    "newName": null,
    "captionText": null,
    "starState": null
  }
  ```
  *(Nilai `operation` mendukung `"MOVE_FILES"`, `"RENAME_FOLDER"`, `"SET_STAR"`, `"SET_CAPTION"`, `"SET_ARCHIVE_STATUS"`, dan `"SOFT_DELETE_TRASH"`).*

### G. Endpoint 7: Proxy Biner Foto untuk Export ZIP & PDF (Web App/PWA -> GAS)
* **Action:** `GET_PHOTO_BLOB`
* **Tujuan:** Menghindari batasan CORS Google Drive saat `JSZip` dan `jsPDF` mengambil data gambar asli di browser.
* **Request Payload:**
  ```json
  {
    "action": "GET_PHOTO_BLOB",
    "authToken": "SESSION_TOKEN_OR_MAGIC_TOKEN",
    "fileId": "FILE_ID_1"
  }
  ```
* **Response Payload:**
  ```json
  {
    "status": "success",
    "fileName": "IMG_20260815_091200.jpg",
    "mimeType": "image/jpeg",
    "base64Data": "/9j/4AAQSkZJRgABAQEASABIAAD..."
  }
  ```

---

## 7. Urutan Eksekusi Pembangunan untuk Antigravity (Implementation Roadmap)
Saat membangun kode dari dokumen ini, ikuti urutan tahapan berikut secara berurutan:

1. **Tahap 1 — Fondasi Backend (`backend-gas/`):**
   * Buat `appsscript.json` (mengaktifkan Advanced Drive Service v3), `Config.gs`, dan `SheetDatabase.gs` (dengan `initDatabase()` + `LockService`).
   * Buat `DriveController.gs` dengan fungsi pembuatan folder berjenjang, pembacaan metadata koordinat GPS foto (`Drive.Files.get` dengan `imageMediaMetadata`), deteksi duplikat (`fileName` + `fileSize`), `GET_PHOTO_BLOB`, `EMPTY_TRASH_PERMANENT` (via `Drive.Files.delete`), `GET_STORAGE_STATUS`, serta operasi *Move*, *Rename*, *Star*, *Caption*, dan *Soft Delete*.
   * Buat `AuthMagicLink.gs` (Login, Persistent Token, Revoke User/Uploader, & Magic Link) dan `Code.gs` (router API JSON + fungsi `setupDatabase()`).
   * Buat `VendorMaster.gs` (`initVendorMaster()`, pengecekan kuota dengan `CacheService`, trigger harian `Drive.Files.list`, Custom Menu, & `onEdit` otomatis) serta `VendorNotifier.gs`.
2. **Tahap 2 — Web App & PWA Viewer + Panel Admin (`web-app-viewer/`):**
   * Bangun `manifest.json` dan `sw.js` agar aplikasi bersifat **PWA (installable)** untuk melihat foto di HP maupun laptop.
   * Bangun antarmuka responsif (*Sidebar* + *Adaptive Grid* + *Floating Action Bar*) beserta **Bar Indikator Kuota Penyimpanan** (Hijau/Kuning/Merah), pita peringatan `>= 85%` & `100%` (dengan tombol kontak `VENDOR_CONTACT_WA`), serta tombol **`[🧹 Kosongkan Sampah Permanen]`**.
   * Bangun *Workstation Lightbox* (Zoom 500% dengan roda mouse, Pan, Rotate 90°, Split-Screen Compare, dan navigasi keyboard).
   * Bangun **Modal Manajemen Akun & Akses Uploader** (Tambah user/mandor, Reset Password/PIN, dan **🛑 Cabut Akses / Hapus Otentikasi** seketika).
   * Bangun **Modal Manajemen Magic Link** dengan 2 Tab: Tab Buat Link Baru (pilihan multi-proyek, filter bintang, 1/7/14/30 hari atau Kalender) dan Tab Daftar Link Aktif (tombol **📲 Kirim Ulang WA**, **📋 Salin Link**, **✏️ Edit Proyek**, dan **🛑 Matikan**).
   * Integrasikan `JSZip` (menggunakan `GET_PHOTO_BLOB`) untuk unduh banyak foto, `jsPDF` untuk laporan PDF 1-klik, dan `navigator.share` / `wa.me` untuk pengiriman WhatsApp.
3. **Tahap 3 — Aplikasi Android Lapangan (`mobile-apk-uploader/`):**
   * Konfigurasi `AndroidManifest.xml` dengan seluruh izin lintas versi Android + `ACCESS_MEDIA_LOCATION` + `FOREGROUND_SERVICE_DATA_SYNC`.
   * Bangun `LoginActivity.kt` untuk **Login 1x Seumur Hidup** (menyimpan `authToken` secara lokal dan otomatis logout jika server mengembalikan `TOKEN_REVOKED`).
   * Bangun layar tunggal ergonomis (`MainActivity.kt`: Pencarian 5 Proyek Aktif, Tanggal `DD-MM-YYYY`, Input Keterangan Manual, Pemilih Galeri dengan *Badge* EXIF GPS, serta pita peringatan/kunci ramah jika server mengembalikan `QUOTA_EXCEEDED` atau `SUBSCRIPTION_SUSPENDED`).
   * Bangun `UploadForegroundService.kt` (`dataSync`) dengan `WakeLock`, pengiriman sekuensial 1 foto per request, dan *auto-retry* agar pengiriman tetap tuntas walaupun layar HP langsung dikunci (*Lock Screen*).

---

## 8. Modul Komersialisasi SaaS: Master Vendor Spreadsheet, Pembatasan Kuota Penyimpanan, & Notifikasi Otomatis WhatsApp

> **INSTRUKSI TAMBAHAN UNTUK ANTIGRAVITY (ZERO-MANUAL-SETUP VENDOR ENGINE):**
> Seluruh **Google Drive** (folder seluruh klien) dan **Google Apps Script (GAS)** berjalan terpusat di **1 Akun Google milik Penjual/Vendor** (Model *Single-Account Multi-Tenant*). Konsumen tidak pernah diberikan akses langsung ke Google Drive maupun Spreadsheet Master Vendor — mereka hanya berinteraksi melalui APK & Web App/PWA, sehingga keamanan data antar-klien terjamin 100%. Vendor cukup menyiapkan **1 Google Spreadsheet kosong** sebagai Master Vendor, lalu menjalankan `initVendorMaster()` sekali — seluruh sheet, kolom, rumus, trigger harian, hingga otomatisasi perpanjangan/upgrade berjalan otomatis.

### A. Arsitektur Master Vendor (1 Spreadsheet Pusat untuk Banyak Konsumen)
1. **Penyimpanan Terpusat di 1 Akun Google Vendor:**
   * Vendor memiliki **1 Google Spreadsheet Pusat (`MASTER_VENDOR_SPREADSHEET_ID`)** di akun Google utama Vendor untuk mengontrol seluruh konsumen kontraktor secara *remote*.
   * Di dalam `Config.gs` milik setiap konsumen, tertanam `TENANT_ID` (misal: `KLIEN-001`), `MASTER_VENDOR_SPREADSHEET_ID`, `VENDOR_WA_NUMBER` (nomor penerima notifikasi bot Vendor), dan `VENDOR_CONTACT_WA` (nomor CS untuk tombol upgrade di Web/APK konsumen).
   * Setiap kali aplikasi konsumen melakukan `UPLOAD_PHOTO_RAW`, `LOGIN`, atau `SEARCH_PROJECTS`, backend konsumen memeriksa status `TENANT_ID` tersebut dengan **caching 2–5 menit (`CacheService`)** agar tidak memperlambat proses upload di lapangan:
     1. Apakah status langganan klien `ACTIVE`?
     2. Apakah tanggal hari ini belum melewati `Billing_Due_Date` (jatuh tempo bulanan)?
     3. Apakah `Used_Storage_Bytes + Ukuran_Foto_Baru <= Quota_Limit_Bytes`?

2. **Skema Tabel Otomatis di Master Vendor Spreadsheet (Sheet: `Tenants_Master`):**
   Antigravity wajib membuat fungsi `initVendorMaster()` yang otomatis membuat Sheet `Tenants_Master` beserta *header* dan formatnya:

| Kolom | Nama Field | Tipe Data | Contoh Nilai / Keterangan |
| :--- | :--- | :--- | :--- |
| `A` | `Tenant_ID` | String (Unique) | `KLIEN-001` |
| `B` | `Nama_Kontraktor` | String | `PT Maju Jaya Konstruksi` |
| `C` | `No_WA_Kontraktor` | String (628...) | `6281234567890` |
| `D` | `Root_Folder_ID` | String | ID Folder GDrive khusus milik kontraktor ini |
| `E` | `Quota_Limit_GB` | Number (Float) | `5` (Bisa diisi `2.5`, `5`, `10`, dst. oleh Vendor) |
| `F` | `Used_Storage_GB` | Number (Float) | `4.52` (Diperbarui otomatis oleh sistem setiap upload & audit harian) |
| `G` | `Usage_Percent` | Formula / Number | `90.4%` (`=F2/E2`) |
| `H` | `Monthly_Fee_IDR` | Number | `200000` (Biaya bulanan Cloud Server & Storage) |
| `I` | `Billing_Due_Date` | String (`DD-MM-YYYY`) | `15-12-2026` (Tanggal jatuh tempo tagihan bulanan) |
| `J` | `Subscription_Status` | Enum String | `ACTIVE`, `QUOTA_FULL`, atau `SUSPENDED` |
| `K` | `Alert_90_Sent` | Boolean | `FALSE` (Otomatis jadi `TRUE` setelah WA warning 90% terkirim; reset ke `FALSE` jika kuota di-upgrade) |
| `L` | `Last_Billing_Reminder` | String (`MM-YYYY`) | `12-2026` (Mencegah pengiriman ganda reminder tagihan di bulan yang sama) |

### B. Sistem Rem Otomatis (*Hard Stop*) & Perubahan Kuota Dinamis (`2.5 GB` ➔ `5 GB` ➔ `10 GB`)
1. **Gerbang Pengecekan Kuota saat Upload (`DriveController.gs`):**
   * Sebelum menyimpan foto baru ke Google Drive, backend menghitung sisa kuota konsumen berdasarkan `Quota_Limit_GB` di `Tenants_Master`.
   * **Jika `Used_Storage + File_Size > Quota_Limit`:**
     * Upload foto **otomatis ditolak (*Hard Stop*)** dengan kode respons `"QUOTA_EXCEEDED"`.
     * Status di `Tenants_Master` diperbarui menjadi `QUOTA_FULL`.
     * **Di Android APK (HP Mandor):** Tombol kirim terkunci dan muncul pesan ramah: *"🚫 Penyimpanan kantor sudah penuh (5 GB / 5 GB). Hubungi Admin / Penyedia Aplikasi untuk tambah kapasitas."*
     * **Di Web App & PWA (Kontraktor):** Muncul banner merah di bagian atas layar yang menginformasikan kapasitas penuh beserta tombol info kontak untuk *upgrade* kapasitas.
2. **Kendali Upgrade & Perpanjangan Otomatis oleh Vendor (100% Tanpa Edit Manual Rumit):**
   * **Auto-Trigger `onEdit(e)`:** Apabila Vendor mengubah angka pada kolom `Quota_Limit_GB` (misal dari `5` ke `10`) atau memperbarui `Billing_Due_Date`, script otomatis mereset `Alert_90_Sent = FALSE` dan mengubah `Subscription_Status = ACTIVE` (selama pemakaian < kuota baru). Detik itu juga (tanpa deploy ulang kode atau update APK), sistem konsumen langsung mengenali batas kuota baru.
   * **Custom Menu `🛠️ Panel Vendor` di Spreadsheet Master:**
     * `➕ Tambah Klien Baru (Auto-Provision)`: Otomatis membuatkan Folder Root Google Drive klien, Spreadsheet Database klien (4 sheet), dan mengisi 1 baris lengkap di `Tenants_Master`.
     * `✅ Perpanjang 1 Bulan (+30 Hari)`: Otomatis menambah `Billing_Due_Date` 1 bulan ke depan, mereset `Last_Billing_Reminder`, dan mengaktifkan status `ACTIVE`.
     * `⬆️ Upgrade Kuota (2.5 / 5 / 10 GB)`: Mengubah kuota, mereset `Alert_90_Sent = FALSE`, dan mengaktifkan status `ACTIVE` dalam 1 klik.
3. **Sinkronisasi Ukuran Asli & Fitur "Kosongkan Sampah Permanen" di Web App Klien:**
   * Karena fitur hapus foto menggunakan metode *Soft Delete* (`setTrashed(true)`) yang masih memakan kuota Google Drive selama 30 hari, Antigravity wajib menambahkan **Bar Indikator Kuota** (Hijau `< 80%`, Kuning `80% - 89%`, Merah `>= 90%`) serta tombol **`[🧹 Kosongkan Sampah Permanen]`** (`EMPTY_TRASH_PERMANENT`) pada panel Admin Web App konsumen. Penghapusan permanen di sisi GAS menggunakan **Advanced Drive Service v3 (`Drive.Files.delete(fileId)`)**.
   * Disediakan pula fungsi *Time-Driven Trigger* harian (`syncAllTenantsStorageUsage()`) menggunakan **`Drive.Files.list` (v3)** agar perhitungan ukuran aktual ribuan foto di Google Drive berjalan cepat dan anti-timeout.

### C. Mesin Notifikasi Otomatis WhatsApp untuk Vendor & Penagihan Bulanan
Antigravity wajib menambahkan modul `VendorNotifier.gs` di `backend-gas/` yang terintegrasi dengan layanan WA API (mendukung **CallMeBot** gratis untuk notifikasi langsung ke nomor WA Vendor, maupun **Fonnte / Wablas** untuk pengiriman ke WA Vendor dan WA Konsumen) dengan konfigurasi `VENDOR_WA_NUMBER` dan `WA_API_KEY` di `Config.gs`:

1. **Warning Otomatis ke WA Vendor Saat Kuota Konsumen Mencapai `>= 90%` (*Real-Time*):**
   * Segera setelah sebuah upload membuat `Usage_Percent >= 90%` dan `Alert_90_Sent === FALSE`:
     * Sistem menembakkan pesan WhatsApp otomatis ke nomor Vendor (`VENDOR_WA_NUMBER`):
       ```text
       ⚠️ *PERINGATAN KUOTA 90% — APLIKASI PROYEK*
       Konsumen: *PT Maju Jaya Konstruksi* (KLIEN-001)
       Pemakaian: *4,52 GB / 5,00 GB (90,4%)*
       Status: Hampir penuh! Sistem akan otomatis berhenti di 5,00 GB.

       👉 Klik untuk tawarkan upgrade ke 10 GB via WA Klien:
       https://wa.me/6281234567890?text=Halo%20Bapak%2FIbu%20PT%20Maju%20Jaya%2C%20info%20kapasitas%20penyimpanan%20Cloud%20foto%20proyek%20sudah%20mencapai%2090%25%20(4%2C52%20GB%20dari%205%20GB).%20Apakah%20mau%20sekalian%20di-upgrade%20ke%2010%20GB%20agar%20upload%20di%20lapangan%20tidak%20terhenti%3F
       ```
     * Sistem langsung mengubah `Alert_90_Sent = TRUE` agar tidak mengirim spam berulang.
   * **Warning di Sisi Konsumen (`>= 85%`):** Di Web App dan APK konsumen, muncul pita peringatan kuning: *"⚠️ Penyimpanan hampir penuh (4,52 GB / 5,00 GB). Segera hubungi penyedia aplikasi sebelum upload terhenti."*

2. **Warning Penagihan Bulanan Cloud Server + Info Pemakaian Kuota (*Daily Scheduled Trigger*):**
   * Antigravity membuat fungsi `runDailyBillingAndQuotaCheck()` yang dijalankan otomatis setiap pagi pukul `08:00 WIB` via Google Apps Script Trigger.
   * Saat tanggal hari ini memasuki **H-3 sebelum `Billing_Due_Date`** (atau tepat pada hari jatuh tempo) dan `Last_Billing_Reminder` belum tercatat untuk bulan berjalan:
     * Sistem mengirim notifikasi WhatsApp otomatis ke **WA Vendor** (dan opsional langsung ke **WA Konsumen** jika menggunakan WA Gateway):
       ```text
       🧾 *PENGINGAT TAGIHAN BULANAN CLOUD SERVER*
       Konsumen: *PT Maju Jaya Konstruksi* (KLIEN-001)
       Jatuh Tempo: *15-12-2026*
       Tagihan Cloud Server: *Rp 200.000 / bulan*
       Status Penyimpanan Saat Ini: *3,40 GB dari 5,00 GB (68%)*

       👉 Klik untuk kirim tagihan ke WA Klien:
       https://wa.me/6281234567890?text=Halo%20Bapak%2FIbu%20PT%20Maju%20Jaya%2C%20mengingatkan%20perpanjangan%20bulanan%20Cloud%20Server%20Aplikasi%20Proyek%20sebesar%20Rp%20200.000%20(jatuh%20tempo%2015-12-2026).%20Status%20penyimpanan%20saat%20ini%3A%203%2C40%20GB%20dari%205%2C00%20GB.%20Terima%20kasih.
       ```
     * Jika `Billing_Due_Date` sudah terlewat (masa tenggang habis) dan belum diperpanjang di Master Spreadsheet, sistem otomatis mengubah `Subscription_Status = SUSPENDED` dan menahan proses upload sampai tanggal jatuh tempo diperbarui oleh Vendor.

### D. Tambahan File & Endpoint pada Struktur Monorepo untuk Antigravity
* **File Baru di `backend-gas/`:**
  * `VendorMaster.gs` — Berisi fungsi `initVendorMaster()` (auto-create sheet `Tenants_Master`, header, formula persentase, dan jadwal trigger harian jam 08:00 WIB & jam 02:00 WIB) serta fungsi `checkTenantQuotaAndBilling()` dan `updateTenantUsage()`.
  * `VendorNotifier.gs` — Modul pengiriman pesan WhatsApp otomatis via `UrlFetchApp.fetch()` (CallMeBot / Fonnte / Wablas) untuk alert kuota 90% dan tagihan bulanan Cloud Server.
* **Tambahan Operasi di `ADMIN_FILE_OPS` (`DriveController.gs`):**
  * `EMPTY_TRASH_PERMANENT`, `GET_STORAGE_STATUS`, dan `DELETE_FOLDER` (hapus folder proyek atau folder keterangan ke Sampah Drive + sinkronisasi `Project_Cache`).

---

## 12. Pembaruan Implementasi & Status Terkini (Sinkronisasi Akhir)

Bagian ini merangkum seluruh penyesuaian dan penyempurnaan dari rencana awal hingga kondisi aplikasi saat ini:

### A. Branding & Aset Visual
* Ikon resmi `DokProyek.png`, `DokProyek512.png`, dan `DokProyek1024.png` sudah terpasang untuk logo Web App, ikon PWA (`icon-192.png`, `icon-512.png`), serta ikon launcher Android APK.

### B. Backend Google Apps Script (`backend-gas/`)
1. **OAuth Scope (`appsscript.json`):** Menambahkan `https://www.googleapis.com/auth/script.send_mail` agar `MailApp.sendEmail()` berjalan tanpa kendala izin.
2. **Notifikasi Multi-Channel Vendor (`Config.gs` & `VendorNotifier.gs`):**
   * Karena layanan gratis CallMeBot WhatsApp sering penuh, notifikasi otomatis untuk Vendor (peringatan kuota `>= 90%` & tagihan H-3 jatuh tempo) dikirim langsung melalui **Telegram Bot** (`TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID`) serta **Email** (`VENDOR_ALERT_EMAIL` via `MailApp`), tetap mempertahankan adapter opsional WhatsApp Gateway (CallMeBot/Fonnte/Wablas).
   * Nomor kontak WhatsApp penyedia/CS (`VENDOR_WA_NUMBER` & `VENDOR_CONTACT_WA`) diset ke `6282135800288`.
   * Tersedia fungsi `testVendorNotification()` untuk tes pengiriman Telegram + Email 1 klik dari editor Apps Script.
3. **Integritas Data & Endpoint Tambahan (`VendorMaster.gs`, `Code.gs`, `DriveController.gs`, `AuthMagicLink.gs`):**
   * `parseSafeGbNumber()` & `formatDueDateDmy()` mengatasi format desimal (misal `2.5`) dan objek `Date` Google Sheets lokal Indonesia, serta mengirim `daysLeft` ke Web App.
   * Endpoint ringan `LIST_PROJECT_NAMES` khusus autocomplete APK lapangan agar startup cepat tanpa payload `Sub_Folders_JSON`.
   * Proxy `GET_PHOTO_BLOB` mendukung mode `preview: true` (mengambil versi ringan `=w1200` ~100–200 KB) sehingga preview Lightbox tampil jauh lebih cepat.
   * Magic Link mendukung hak akses bertingkat (penuh per proyek atau spesifik per sub-folder keterangan), proteksi `LIST_PHOTOS`, serta `formatWibDateTimeStr()` agar format batas waktu pada pesan WhatsApp rapi (`dd-MM-yyyy HH:mm`).

### C. Web App & PWA Viewer (`web-app-viewer/`, Service Worker `dokproyek-pwa-v16`)
1. **Navigasi & Pencarian Instan:**
   * Pencarian proyek/keterangan (termasuk nama pengirim/uploader untuk Admin) berjalan instan di memori (`filterProjectsLocally()`), bebas *race condition* saat mengetik/menghapus teks.
   * Klik nama proyek menampilkan kartu **Folder Keterangan** terlebih dahulu (`renderSubFolderCards()`) sebelum memuat foto; tersedia tombol hapus proyek/folder khusus Admin serta badge pengirim **`👤 username`** khusus Admin per folder keterangan (bersumber dari metadata Drive + fallback `Audit_Logs`, tersembunyi dari tamu Magic Link).
   * Responsif di layar HP dengan tombol drawer **📂 Proyek** (`md:hidden`), bar *pill* geser horizontal **`#mobile-project-switcher`** saat tersedia lebih dari 1 proyek (termasuk Magic Link multi-proyek), `env(safe-area-inset-*)`, splash `manifest.json` selaras `#F8FAFC`, dan format tanggal Indonesia pada `#magic-banner`.
2. **Preview Cepat, Spinner, & Pop-up Modern (`ui-feedback.js` & `lightbox-workstation.js`):**
   * Preview Lightbox memakai `GET_PHOTO_BLOB` mode `preview: true` (`=w1200`), thumbnail instan, spinner `#lightbox-spinner`, serta *prefetch* foto kiri/kanan di background.
   * Spinner loading global otomatis muncul saat menunggu respons server (`callGasApi`).
   * Seluruh `alert()`, `confirm()`, `prompt()` diganti modal dialog & toast modern; tersedia pop-up peringatan kuota `>= 85%` atau masa aktif `<= 7 hari` (klik **OK** untuk lanjut memakai aplikasi).
3. **Magic Link Bertingkat & Modal WhatsApp (`admin-manager.js` & `export-engine.js`):**
   * Modal Magic Link dilengkapi pencarian proyek/keterangan + checkbox bertingkat (Proyek induk ↔ Folder keterangan).
   * Pengiriman ke WhatsApp memakai modal khusus (`showWaShareModal`) dengan input nomor WA tujuan opsional (`wa.me/628xxx?text=...` untuk kompatibilitas **WhatSie Linux**, atau `web.whatsapp.com/send?text=...` jika kosong, plus tombol Salin Pesan).
4. **Export:** Mendukung **Unduh JPG Batch**, **Unduh ZIP**, dan **Cetak Laporan PDF**, serta tombol **☑️ Pilih Semua**.
5. **PWA Install, Login Password, Footer Vendor, & Keamanan Sesi:**
   * Tombol **Install Aplikasi** (`#btn-install-pwa`) otomatis tersembunyi jika sudah berjalan sebagai PWA terpasang (`standalone`) atau setelah `appinstalled`.
   * Fitur **Auto Logout 15 menit** (`initIdleAutoLogout`) jika akun login tidak aktif selama 15 menit (termasuk saat tab/PWA lama di-minimize).
   * Halaman login Web App & PWA memakai **Username & Password** (bebas alfanumerik, tanpa `inputmode="numeric"`) lengkap dengan tombol **ikon mata** (`toggleLoginPassword`) untuk intip/sembunyikan password; manajemen akun di `#users-modal` otomatis membedakan **PIN 6 digit** (`UPLOADER` APK) dan **Password min. 6 karakter** (`ADMIN` / `VIEWER` Web).
   * Footer vendor **JeMPRoT Digital Solution • DokProyek** terpasang di layar login (dengan efek neon cyan) dan bagian bawah workspace (`no-print`).
   * **Auto-Refresh Aman Tanpa Berkedip (`startAutoRefresh` + `CHECK_UPDATES`):** Mengecek `CacheService` RAM server GAS setiap 35 detik (berhenti otomatis saat tab di-minimize atau idle > 5 menit); hanya mengambil data & menyisipkan foto baru ke DOM jika ada upload/perubahan baru tanpa me-reload foto lama, dilengkapi toast `📸 X foto baru masuk`.

### D. Android APK Uploader (`mobile-apk-uploader/`, Versi `1.0.6` / `versionCode 7`)
1. **UI Modern, Tidak Kaku, & Safe Area (`MainActivity.kt`):**
   * Top App Bar `#0F172A` dengan badge akun mandor, kartu form putih bersudut membulat + label jelas, input lembut (`#F8FAFC`), kartu preview foto dengan thumbnail membulat + tombol hapus `[✕]`, *sticky bottom thumb-zone* berbayangan untuk tombol **🚀 KIRIM X FOTO**, dan `WindowInsetsCompat.Type.systemBars()`.
2. **UX Lapangan & Kalender Indonesia:**
   * Keyboard otomatis tertutup & fokus dibersihkan saat menekan **Pilih/Tambah Foto** maupun kembali dari Galeri.
   * Kalender tanggal (`DatePickerDialog`) berbahasa Indonesia (`Locale("id", "ID")`), dan setelah upload selesai (klik **OK**), form + tanggal otomatis reset ke tanggal hari ini waktu Indonesia (`Asia/Jakarta` / WIB).
   * Saat upload berjalan, tampil **spinner lingkaran amber besar** di samping status proses + garis progress animasi yang tetap bergerak hingga selesai, notifikasi background hilang bersih saat sukses.
3. **Performa & Keandalan:** Autocomplete proyek memuat data sekali jalan lewat `LIST_PROJECT_NAMES` (dengan fallback otomatis ke `SEARCH_PROJECTS`), tampilan dropdown ringkas maksimal **5 baris terlihat** dan bisa di-scroll naik-turun, `RawFileStreamer.httpClient` terpusat, serta menu **⚙️ Ganti URL Server** di layar Login.
4. **Rilis Lokal:** Hasil build signed APK terbaru selalu di-download dan dinamai sesuai versi di `apk-release/` (terbaru: `apk-release/dokproyek-uploader-v1.0.6.apk`).

### E. Catatan Deploy & Backlog
* **Deploy Manual GAS:** Setiap perubahan pada `backend-gas/` wajib disalin ke editor Google Apps Script lalu di-deploy sebagai **New version** (*Deploy > Manage deployments > Edit > Version: New version > Deploy*), termasuk menjalankan `initVendorMaster()` 1x untuk mengaktifkan trigger harian.
* **Backlog:**
  * Penambahan WA Gateway berbayar (Fonnte/Wablas) di `Config.gs` bila suatu saat dibutuhkan pengiriman otomatis langsung ke nomor WhatsApp konsumen.