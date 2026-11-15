/**
 * Config.gs
 * Konstanta konfigurasi utama backend Google Apps Script.
 * Seluruh GDrive & GAS berjalan terpusat di 1 Akun Google Vendor.
 */

var CONFIG = {
  // Konfigurasi Tenant (Konsumen) - Akun rakun5441@gmail.com
  TENANT_ID: 'KLIEN-001',
  ROOT_FOLDER_ID: '1AvZkFVfyU1cJiPpwHlfBN7xVcDqnCOFO',
  SPREADSHEET_ID: '15PjsbuMcLTmEBytXVtINoZnUwHa-rEKK7pGed8A4PaM',
  ADMIN_SECRET: 'GANTI_DENGAN_SECRET_SALT_ACAK_32_KARAKTER',
  WEB_APP_URL: 'https://jemprot-lab.github.io/dokproyek',
  TIMEZONE: 'Asia/Jakarta',

  // Konfigurasi Master Vendor (SaaS) - Akun rakun5441@gmail.com
  MASTER_VENDOR_SPREADSHEET_ID: '1Bc84Xcycj25GGJsvx1cNhjSicoY51hEaaPUAMOLTvGY',
  VENDOR_WA_NUMBER: '6281234567890',       // Nomor WA Vendor penerima alert bot
  VENDOR_CONTACT_WA: '6281234567890',      // Nomor WA CS untuk tombol Upgrade di Web/APK
  WA_API_PROVIDER: 'CALLMEBOT',            // CALLMEBOT | FONNTE | WABLAS
  WA_API_KEY: 'GANTI_DENGAN_API_KEY_WA',

  // Kredensial Admin bawaan saat pertama kali setupDatabase() dijalankan
  DEFAULT_ADMIN_USERNAME: 'admin',
  DEFAULT_ADMIN_PIN: '123456',

  SHEETS: {
    USERS: 'Users',
    MAGIC_LINKS: 'Magic_Links',
    PROJECT_CACHE: 'Project_Cache',
    AUDIT_LOGS: 'Audit_Logs',
    TENANTS_MASTER: 'Tenants_Master'
  }
};
