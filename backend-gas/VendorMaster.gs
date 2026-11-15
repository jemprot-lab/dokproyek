/**
 * VendorMaster.gs
 * Engine SaaS Vendor (1 Akun Google Vendor, Zero-Manual-Setup):
 * - initVendorMaster(): buat sheet Tenants_Master, header, rumus, & trigger harian
 * - Custom Menu Panel Vendor: Auto-Provision Klien Baru, Perpanjang 1 Bulan, Upgrade Kuota
 * - onEditVendorSheet(): otomatis reset Alert_90_Sent & aktifkan status saat kuota/tanggal diubah
 * - checkTenantQuotaAndBilling(): gerbang Hard Stop dengan CacheService
 */

var TENANTS_HEADERS = [
  'Tenant_ID', 'Nama_Kontraktor', 'No_WA_Kontraktor', 'Root_Folder_ID',
  'Quota_Limit_GB', 'Used_Storage_GB', 'Usage_Percent', 'Monthly_Fee_IDR',
  'Billing_Due_Date', 'Subscription_Status', 'Alert_90_Sent', 'Last_Billing_Reminder'
];

var BYTES_PER_GB = 1073741824; // 1024^3

function getMasterSpreadsheet() {
  var id = CONFIG.MASTER_VENDOR_SPREADSHEET_ID;
  if (!id || id.indexOf('GANTI_') === 0) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Jalankan 1x dari Spreadsheet Master Vendor untuk membuat sheet, header,
 * dan mendaftarkan trigger harian (02:00 WIB & 08:00 WIB) serta trigger onEdit.
 */
function initVendorMaster() {
  var ss = getMasterSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.TENANTS_MASTER);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.TENANTS_MASTER);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, TENANTS_HEADERS.length).setValues([TENANTS_HEADERS]);
    sheet.getRange(1, 1, 1, TENANTS_HEADERS.length).setFontWeight('bold').setBackground('#0F172A').setFontColor('#F59E0B');
    sheet.setFrozenRows(1);
  }
  sheet.getRange('E2:F1000').setNumberFormat('0.00');

  // Pasang trigger otomatis (hapus duplikat lama dulu)
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'syncAllTenantsStorageUsage' || fn === 'runDailyBillingAndQuotaCheck' || fn === 'onEditVendorSheet') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('syncAllTenantsStorageUsage').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('runDailyBillingAndQuotaCheck').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('onEditVendorSheet').forSpreadsheet(ss).onEdit().create();

  return { status: 'vendor_master_initialized' };
}

/**
 * Menu otomatis di Google Sheets Master Vendor.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🛠️ Panel Vendor')
    .addItem('➕ Tambah Klien Baru (Auto-Provision)', 'menuAutoProvisionClient')
    .addItem('✅ Perpanjang 1 Bulan (+30 Hari)', 'menuRenewOneMonth')
    .addItem('⬆️ Upgrade Kuota (2.5 / 5 / 10 GB)', 'menuUpgradeQuota')
    .addSeparator()
    .addItem('🔄 Hitung Ulang Penyimpanan Semua Klien', 'syncAllTenantsStorageUsage')
    .addToUi();
}

/**
 * Otomatis reset Alert_90_Sent & aktifkan status jika Vendor edit Kuota / Tanggal Jatuh Tempo.
 */
function onEditVendorSheet(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEETS.TENANTS_MASTER) return;

  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row <= 1) return;

  // Kolom E (5) = Quota_Limit_GB, Kolom I (9) = Billing_Due_Date
  if (col === 5 || col === 9) {
    var quotaGb = Number(sheet.getRange(row, 5).getValue() || 0);
    var usedGb = Number(sheet.getRange(row, 6).getValue() || 0);
    if (col === 5) {
      sheet.getRange(row, 11).setValue(false); // Reset Alert_90_Sent
    }
    if (usedGb < quotaGb) {
      sheet.getRange(row, 10).setValue('ACTIVE');
    }
  }
}

/**
 * Menu: Auto-Provision Klien Baru (buat Folder Root GDrive + Spreadsheet Klien + baris Tenants_Master).
 */
function menuAutoProvisionClient() {
  var ui = SpreadsheetApp.getUi();
  var nameResp = ui.prompt('Nama Kontraktor / Klien:', ui.ButtonSet.OK_CANCEL);
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  var clientName = nameResp.getResponseText().trim();
  if (!clientName) return;

  var waResp = ui.prompt('Nomor WA Kontraktor (contoh: 6281234567890):', ui.ButtonSet.OK_CANCEL);
  var clientWa = waResp.getSelectedButton() === ui.Button.OK ? waResp.getResponseText().trim() : '';

  var quotaResp = ui.prompt('Paket Kuota GB (2.5 / 5 / 10):', ui.ButtonSet.OK_CANCEL);
  var quotaGb = quotaResp.getSelectedButton() === ui.Button.OK ? parseFloat(quotaResp.getResponseText().trim()) || 5 : 5;

  var ss = getMasterSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.TENANTS_MASTER);
  var nextNum = sheet.getLastRow();
  var tenantId = 'KLIEN-' + String(nextNum).padStart(3, '0');

  // Buat Folder Root GDrive & Spreadsheet Database khusus klien di akun Vendor
  var rootFolder = DriveApp.createFolder('DokProyek - ' + clientName + ' (' + tenantId + ')');
  var clientSs = SpreadsheetApp.create('DB DokProyek - ' + clientName + ' (' + tenantId + ')');

  var dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  var dueStr = Utilities.formatDate(dueDate, CONFIG.TIMEZONE, 'dd-MM-yyyy');

  var rowIdx = sheet.getLastRow() + 1;
  sheet.appendRow([
    tenantId,
    clientName,
    clientWa,
    rootFolder.getId(),
    quotaGb,
    0,
    '=IF(E' + rowIdx + '>0, F' + rowIdx + '/E' + rowIdx + ', 0)',
    200000,
    dueStr,
    'ACTIVE',
    false,
    ''
  ]);
  sheet.getRange(rowIdx, 7).setNumberFormat('0.0%');

  ui.alert(
    '✅ Klien ' + tenantId + ' Berhasil Dibuat!\n\n'
    + 'ROOT_FOLDER_ID: ' + rootFolder.getId() + '\n'
    + 'SPREADSHEET_ID: ' + clientSs.getId() + '\n'
    + 'Jatuh Tempo: ' + dueStr
  );
}

function menuRenewOneMonth() {
  var ss = getMasterSpreadsheet();
  var sheet = ss.getActiveSheet();
  var row = sheet.getActiveRange().getRow();
  if (sheet.getName() !== CONFIG.SHEETS.TENANTS_MASTER || row <= 1) {
    SpreadsheetApp.getUi().alert('Pilih baris klien di sheet Tenants_Master terlebih dahulu.');
    return;
  }

  var nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + 30);
  var dueStr = Utilities.formatDate(nextDue, CONFIG.TIMEZONE, 'dd-MM-yyyy');

  sheet.getRange(row, 9).setValue(dueStr);
  sheet.getRange(row, 10).setValue('ACTIVE');
  sheet.getRange(row, 12).setValue('');
  SpreadsheetApp.getUi().alert('✅ Berhasil diperpanjang hingga ' + dueStr);
}

function menuUpgradeQuota() {
  var ss = getMasterSpreadsheet();
  var sheet = ss.getActiveSheet();
  var row = sheet.getActiveRange().getRow();
  if (sheet.getName() !== CONFIG.SHEETS.TENANTS_MASTER || row <= 1) {
    SpreadsheetApp.getUi().alert('Pilih baris klien di sheet Tenants_Master terlebih dahulu.');
    return;
  }
  var resp = SpreadsheetApp.getUi().prompt('Masukkan Kuota Baru (GB), contoh 10:', SpreadsheetApp.getUi().ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== SpreadsheetApp.getUi().Button.OK) return;
  var newGb = parseFloat(resp.getResponseText().trim());
  if (isNaN(newGb) || newGb <= 0) return;

  sheet.getRange(row, 5).setValue(newGb);
  sheet.getRange(row, 10).setValue('ACTIVE');
  sheet.getRange(row, 11).setValue(false);
  SpreadsheetApp.getUi().alert('✅ Kuota di-upgrade ke ' + newGb + ' GB.');
}

function parseSafeGbNumber(val, fallback) {
  if (val instanceof Date) {
    // Jika Google Sheets lokal Indonesia salah mengartikan "2.5" sebagai tanggal 2 Mei
    return parseFloat(val.getDate() + '.' + (val.getMonth() + 1));
  }
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  var cleaned = String(val || '').trim().replace(',', '.');
  var num = parseFloat(cleaned);
  return isNaN(num) ? fallback : num;
}

function formatDueDateDmy(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, CONFIG.TIMEZONE, 'dd-MM-yyyy');
  }
  return String(val).trim();
}

function parseDmyDate(str) {
  var dmy = formatDueDateDmy(str);
  var m = dmy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(m[3] + '-' + m[2] + '-' + m[1] + 'T23:59:59+07:00');
}

function findTenantRow(tenantId) {
  var ss = getMasterSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.TENANTS_MASTER);
  if (!sheet || sheet.getLastRow() <= 1) return null;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, TENANTS_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(tenantId)) {
      var obj = { _rowIndex: i + 2, _sheet: sheet };
      TENANTS_HEADERS.forEach(function (h, idx) { obj[h] = data[i][idx]; });
      return obj;
    }
  }
  return null;
}

/**
 * Gerbang pengecekan kuota & jatuh tempo dengan CacheService (TTL 2 menit).
 */
function checkTenantQuotaAndBilling(additionalBytes) {
  if (!CONFIG.MASTER_VENDOR_SPREADSHEET_ID || CONFIG.MASTER_VENDOR_SPREADSHEET_ID.indexOf('GANTI_') === 0) {
    return { allowed: true, usedGb: 0, limitGb: 999, percent: 0, subscriptionStatus: 'ACTIVE', vendorContactWa: CONFIG.VENDOR_CONTACT_WA };
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'TENANT_STATUS_' + CONFIG.TENANT_ID;
  var cachedRaw = cache.get(cacheKey);
  var t = cachedRaw ? JSON.parse(cachedRaw) : null;

  if (!t) {
    var row = findTenantRow(CONFIG.TENANT_ID);
    if (!row) {
      return { allowed: true, usedGb: 0, limitGb: 999, percent: 0, subscriptionStatus: 'ACTIVE', vendorContactWa: CONFIG.VENDOR_CONTACT_WA };
    }
    t = {
      Quota_Limit_GB: parseSafeGbNumber(row.Quota_Limit_GB, 5),
      Used_Storage_GB: parseSafeGbNumber(row.Used_Storage_GB, 0),
      Billing_Due_Date: formatDueDateDmy(row.Billing_Due_Date),
      Subscription_Status: String(row.Subscription_Status || 'ACTIVE').toUpperCase(),
      Alert_90_Sent: Boolean(row.Alert_90_Sent)
    };
    cache.put(cacheKey, JSON.stringify(t), 120);
  }

  var dueObj = parseDmyDate(t.Billing_Due_Date);
  if (t.Subscription_Status === 'SUSPENDED' || (dueObj && new Date().getTime() > dueObj.getTime())) {
    return {
      allowed: false,
      code: 'SUBSCRIPTION_SUSPENDED',
      message: '🔒 Masa aktif Cloud Server telah berakhir (' + t.Billing_Due_Date + '). Hubungi penyedia aplikasi.',
      usedGb: t.Used_Storage_GB,
      limitGb: t.Quota_Limit_GB,
      percent: Math.round((t.Used_Storage_GB / t.Quota_Limit_GB) * 100),
      billingDueDate: t.Billing_Due_Date,
      subscriptionStatus: 'SUSPENDED',
      vendorContactWa: CONFIG.VENDOR_CONTACT_WA
    };
  }

  var usedBytes = t.Used_Storage_GB * BYTES_PER_GB;
  var limitBytes = t.Quota_Limit_GB * BYTES_PER_GB;
  if (additionalBytes > 0 && (usedBytes + additionalBytes > limitBytes || t.Subscription_Status === 'QUOTA_FULL')) {
    var rowUpdate = findTenantRow(CONFIG.TENANT_ID);
    if (rowUpdate && rowUpdate.Subscription_Status !== 'QUOTA_FULL') {
      rowUpdate._sheet.getRange(rowUpdate._rowIndex, 10).setValue('QUOTA_FULL');
      cache.remove(cacheKey);
    }
    return {
      allowed: false,
      code: 'QUOTA_EXCEEDED',
      message: '🚫 Penyimpanan kantor sudah penuh (' + t.Used_Storage_GB.toFixed(2) + ' GB / ' + t.Quota_Limit_GB + ' GB). Hubungi Admin / Penyedia Aplikasi untuk tambah kapasitas.',
      usedGb: t.Used_Storage_GB,
      limitGb: t.Quota_Limit_GB,
      percent: 100,
      billingDueDate: t.Billing_Due_Date,
      subscriptionStatus: 'QUOTA_FULL',
      vendorContactWa: CONFIG.VENDOR_CONTACT_WA
    };
  }

  var pct = t.Quota_Limit_GB > 0 ? Math.round((t.Used_Storage_GB / t.Quota_Limit_GB) * 100) : 0;
  return {
    allowed: true,
    usedGb: t.Used_Storage_GB,
    limitGb: t.Quota_Limit_GB,
    percent: pct,
    billingDueDate: t.Billing_Due_Date,
    subscriptionStatus: t.Subscription_Status,
    vendorContactWa: CONFIG.VENDOR_CONTACT_WA
  };
}

/**
 * Menambah catatan pemakaian setelah upload berhasil & kirim alert WA jika >= 90%.
 */
function recordTenantUploadBytes(addedBytes) {
  if (!CONFIG.MASTER_VENDOR_SPREADSHEET_ID || CONFIG.MASTER_VENDOR_SPREADSHEET_ID.indexOf('GANTI_') === 0) return;
  var row = findTenantRow(CONFIG.TENANT_ID);
  if (!row) return;

  var newUsedGb = Number(row.Used_Storage_GB || 0) + (addedBytes / BYTES_PER_GB);
  var limitGb = Number(row.Quota_Limit_GB || 5);
  row._sheet.getRange(row._rowIndex, 6).setValue(Number(newUsedGb.toFixed(4)));

  if (limitGb > 0 && (newUsedGb / limitGb) >= 0.90 && !row.Alert_90_Sent) {
    row.Used_Storage_GB = newUsedGb;
    if (sendQuota90Alert(row)) {
      row._sheet.getRange(row._rowIndex, 11).setValue(true);
    }
  }
  CacheService.getScriptCache().remove('TENANT_STATUS_' + CONFIG.TENANT_ID);
}

/**
 * Hitung ukuran folder Google Drive secara cepat menggunakan Drive API v3.
 */
function calculateFolderSizeBytesV3(folderId) {
  var totalBytes = 0;
  var queue = [folderId];

  while (queue.length > 0) {
    var currentId = queue.shift();
    var pageToken = null;
    do {
      var res = Drive.Files.list({
        q: "'" + currentId + "' in parents",
        pageSize: 500,
        pageToken: pageToken,
        fields: 'nextPageToken, files(id, mimeType, size)'
      });
      (res.files || []).forEach(function (f) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          queue.push(f.id);
        } else if (f.size) {
          totalBytes += Number(f.size);
        }
      });
      pageToken = res.nextPageToken;
    } while (pageToken);
  }
  return totalBytes;
}

/**
 * Trigger harian jam 02:00 WIB: sinkronisasi ukuran aktual Google Drive seluruh klien.
 */
function syncAllTenantsStorageUsage() {
  var ss = getMasterSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.TENANTS_MASTER);
  if (!sheet || sheet.getLastRow() <= 1) return;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, TENANTS_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var rootId = String(data[i][3] || '').trim();
    if (!rootId) continue;
    try {
      var bytes = calculateFolderSizeBytesV3(rootId);
      var usedGb = Number((bytes / BYTES_PER_GB).toFixed(4));
      sheet.getRange(i + 2, 6).setValue(usedGb);
    } catch (err) {
      Logger.log('Gagal hitung folder ' + rootId + ': ' + err.message);
    }
  }
}

/**
 * Trigger harian jam 08:00 WIB: cek H-3 jatuh tempo tagihan & kirim WA reminder.
 */
function runDailyBillingAndQuotaCheck() {
  var ss = getMasterSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.TENANTS_MASTER);
  if (!sheet || sheet.getLastRow() <= 1) return;

  var now = new Date();
  var currentMonthKey = Utilities.formatDate(now, CONFIG.TIMEZONE, 'MM-yyyy');
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, TENANTS_HEADERS.length).getValues();

  for (var i = 0; i < data.length; i++) {
    var rowObj = { _rowIndex: i + 2 };
    TENANTS_HEADERS.forEach(function (h, idx) { rowObj[h] = data[i][idx]; });

    var due = parseDmyDate(rowObj.Billing_Due_Date);
    if (!due) continue;

    var diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 3 && diffDays >= 0 && String(rowObj.Last_Billing_Reminder) !== currentMonthKey) {
      if (sendBillingReminderAlert(rowObj)) {
        sheet.getRange(rowObj._rowIndex, 12).setValue(currentMonthKey);
      }
    } else if (diffDays < 0 && String(rowObj.Subscription_Status).toUpperCase() === 'ACTIVE') {
      sheet.getRange(rowObj._rowIndex, 10).setValue('SUSPENDED');
    }
  }
}
