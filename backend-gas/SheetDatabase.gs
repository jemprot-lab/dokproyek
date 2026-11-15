/**
 * SheetDatabase.gs
 * Inisialisasi otomatis 4 Sheet Database, LockService wrapper, dan helper CRUD.
 */

var SHEET_HEADERS = {
  Users: [
    'User_ID', 'Username', 'Password_Hash', 'Role',
    'Allowed_Projects', 'Auth_Token', 'Status', 'Created_At'
  ],
  Magic_Links: [
    'Token', 'Label_Penerima', 'Allowed_Projects', 'Photo_Filter',
    'Created_Date', 'Expiry_Date', 'Status', 'View_Count'
  ],
  Project_Cache: [
    'Folder_ID_GDrive', 'Nama_Proyek', 'Project_Status',
    'Last_Updated', 'Sub_Folders_JSON'
  ],
  Audit_Logs: [
    'Timestamp', 'Actor', 'Action_Type', 'Target_Items', 'Details'
  ]
};

/**
 * Menjalankan callback di dalam ScriptLock untuk mencegah race condition
 * (folder ganda atau tabrakan tulis Sheet saat upload bersamaan).
 */
function withScriptLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Mengambil Spreadsheet utama.
 */
function getDbSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/**
 * Inisialisasi otomatis ke-4 sheet beserta header dan admin bawaan jika belum ada.
 * Dapat dijalankan manual sekali atau otomatis saat API pertama kali dipanggil.
 */
function initDatabase() {
  return withScriptLock(function () {
    var ss = getDbSpreadsheet();
    Object.keys(SHEET_HEADERS).forEach(function (sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }
      if (sheet.getLastRow() === 0) {
        var headers = SHEET_HEADERS[sheetName];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
    });

    // Seed akun admin default jika sheet Users masih kosong
    var usersSheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
    if (usersSheet.getLastRow() <= 1) {
      usersSheet.appendRow([
        'USR-001',
        CONFIG.DEFAULT_ADMIN_USERNAME,
        hashSecret(CONFIG.DEFAULT_ADMIN_PIN),
        'ADMIN',
        'ALL',
        '',
        'ACTIVE',
        new Date().toISOString()
      ]);
    }
    return { status: 'initialized' };
  });
}

/**
 * Mengambil sheet tertentu dan memastikan header sudah ada.
 */
function getSheetOrInit(sheetName) {
  var ss = getDbSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() === 0) {
    initDatabase();
    sheet = ss.getSheetByName(sheetName);
  }
  return sheet;
}

/**
 * Membaca seluruh baris data pada sheet sebagai array of objects + _rowIndex (1-based).
 */
function readSheetRows(sheetName) {
  var sheet = getSheetOrInit(sheetName);
  var lastRow = sheet.getLastRow();
  var headers = SHEET_HEADERS[sheetName];
  if (lastRow <= 1) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row, idx) {
    var obj = { _rowIndex: idx + 2 };
    headers.forEach(function (h, colIdx) {
      obj[h] = row[colIdx];
    });
    return obj;
  });
}

/**
 * Format tanggal saat ini ke DD-MM-YYYY HH:mm:ss WIB.
 */
function formatDateTimeWib(dateObj) {
  return Utilities.formatDate(dateObj || new Date(), CONFIG.TIMEZONE, 'dd-MM-yyyy HH:mm:ss');
}

/**
 * Mencatat aktivitas ke sheet Audit_Logs.
 */
function appendAuditLog(actor, actionType, targetItems, details) {
  var sheet = getSheetOrInit(CONFIG.SHEETS.AUDIT_LOGS);
  sheet.appendRow([
    formatDateTimeWib(new Date()),
    actor || 'SYSTEM',
    actionType,
    targetItems || '',
    details || ''
  ]);
}

/**
 * Membaca daftar username pengirim (uploader) dari deskripsi folder Drive.
 */
function parseSubFolderUploaders(descriptionText) {
  var raw = String(descriptionText || '').trim();
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.uploaders)) {
      return parsed.uploaders.filter(function (u) {
        return typeof u === 'string' && u.trim() !== '';
      });
    }
  } catch (e) {}
  return [];
}

/**
 * Menyimpan username pengirim ke deskripsi sub-folder Drive (tanpa duplikasi).
 */
function recordSubFolderUploader(subFolder, actorName) {
  var actor = String(actorName || '').trim();
  if (!actor || !subFolder) return;
  var list = parseSubFolderUploaders(subFolder.getDescription());
  if (list.indexOf(actor) === -1) {
    list.push(actor);
    subFolder.setDescription(JSON.stringify({ uploaders: list }));
  }
}

/**
 * Menyinkronkan cache folder proyek & sub-folder dari Google Drive ke Project_Cache.
 */
function syncProjectCacheFromDrive(projectFolder) {
  var folderId = projectFolder.getId();
  var folderName = projectFolder.getName();
  var subFolders = [];
  var subIter = projectFolder.getFolders();

  while (subIter.hasNext()) {
    var sub = subIter.next();
    if (sub.isTrashed()) continue;
    var count = 0;
    var filesIter = sub.getFiles();
    while (filesIter.hasNext()) {
      var f = filesIter.next();
      if (!f.isTrashed()) count++;
    }
    subFolders.push({
      id: sub.getId(),
      name: sub.getName(),
      count: count,
      uploaders: parseSubFolderUploaders(sub.getDescription())
    });
  }

  subFolders.sort(function (a, b) {
    return b.name.localeCompare(a.name);
  });

  var sheet = getSheetOrInit(CONFIG.SHEETS.PROJECT_CACHE);
  var rows = readSheetRows(CONFIG.SHEETS.PROJECT_CACHE);
  var existing = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Folder_ID_GDrive === folderId) {
      existing = rows[i];
      break;
    }
  }

  var nowIso = new Date().toISOString();
  var subJson = JSON.stringify(subFolders);

  if (existing) {
    sheet.getRange(existing._rowIndex, 2, 1, 4).setValues([[
      folderName,
      existing.Project_Status || 'ACTIVE',
      nowIso,
      subJson
    ]]);
  } else {
    sheet.appendRow([
      folderId,
      folderName,
      'ACTIVE',
      nowIso,
      subJson
    ]);
  }
}
