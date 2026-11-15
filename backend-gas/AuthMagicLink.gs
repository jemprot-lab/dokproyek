/**
 * AuthMagicLink.gs
 * Otentikasi User (Login 1x Seumur Hidup + PIN 6 Digit), Pencabutan Token, & Magic Link.
 */

/**
 * Hash password/PIN dengan SHA-256 + salt CONFIG.ADMIN_SECRET.
 */
function hashSecret(raw) {
  var input = String(raw || '') + ':' + CONFIG.ADMIN_SECRET;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * Membuat token acak dengan prefix tertentu.
 */
function generateRandomToken(prefix) {
  var uuid = Utilities.getUuid().replace(/-/g, '');
  return (prefix || 'tok_') + uuid.substring(0, 20);
}

/**
 * Login untuk APK (Username + PIN 6 digit) dan Web App.
 * Menghasilkan Auth_Token persisten (disimpan di perangkat).
 */
function handleLogin(payload) {
  var username = String(payload.username || '').trim().toLowerCase();
  var password = String(payload.password || '').trim();
  if (!username || !password) {
    return { status: 'error', code: 'INVALID_INPUT', message: 'Username dan PIN wajib diisi.' };
  }

  return withScriptLock(function () {
    var rows = readSheetRows(CONFIG.SHEETS.USERS);
    var targetHash = hashSecret(password);
    var user = null;

    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].Username).trim().toLowerCase() === username) {
        user = rows[i];
        break;
      }
    }

    if (!user || user.Password_Hash !== targetHash) {
      return { status: 'error', code: 'INVALID_CREDENTIALS', message: 'Username atau PIN salah.' };
    }

    if (String(user.Status).toUpperCase() !== 'ACTIVE') {
      return { status: 'error', code: 'TOKEN_REVOKED', message: 'Akses akun ini sudah ditutup Admin.' };
    }

    var token = String(user.Auth_Token || '').trim();
    if (!token) {
      token = generateRandomToken('tok_');
      var sheet = getSheetOrInit(CONFIG.SHEETS.USERS);
      sheet.getRange(user._rowIndex, 6).setValue(token);
    }

    appendAuditLog(user.Username, 'LOGIN', user.User_ID, 'Login berhasil (' + user.Role + ')');

    return {
      status: 'success',
      user: {
        userId: user.User_ID,
        username: user.Username,
        role: user.Role,
        allowedProjects: user.Allowed_Projects,
        authToken: token
      }
    };
  });
}

/**
 * Validasi Auth_Token dari APK atau Web App.
 * Mengembalikan object user jika valid, atau melempar error TOKEN_REVOKED.
 */
function validateAuthToken(token) {
  if (!token) {
    return { valid: false, code: 'UNAUTHORIZED', message: 'Token tidak ditemukan.' };
  }
  var rows = readSheetRows(CONFIG.SHEETS.USERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].Auth_Token) === String(token)) {
      if (String(rows[i].Status).toUpperCase() !== 'ACTIVE') {
        return { valid: false, code: 'TOKEN_REVOKED', message: 'Akses HP ini sudah ditutup Admin.' };
      }
      return { valid: true, user: rows[i] };
    }
  }
  return { valid: false, code: 'TOKEN_REVOKED', message: 'Sesi tidak valid atau akses telah dicabut Admin.' };
}

/**
 * Helper memastikan pemanggil adalah ADMIN aktif.
 */
function requireAdmin(token) {
  var res = validateAuthToken(token);
  if (!res.valid) return res;
  if (String(res.user.Role).toUpperCase() !== 'ADMIN') {
    return { valid: false, code: 'FORBIDDEN', message: 'Aksi ini hanya untuk Admin.' };
  }
  return res;
}

/**
 * Manajemen Akun & Pencabutan Otentikasi (Khusus Admin Web App).
 * subAction: LIST | CREATE | REVOKE_AUTH | ACTIVATE_AUTH | RESET_PASSWORD | DELETE_USER
 */
function handleManageUsers(payload) {
  var auth = requireAdmin(payload.adminToken);
  if (!auth.valid) return { status: 'error', code: auth.code, message: auth.message };

  var subAction = String(payload.subAction || 'LIST').toUpperCase();
  var sheet = getSheetOrInit(CONFIG.SHEETS.USERS);

  return withScriptLock(function () {
    var rows = readSheetRows(CONFIG.SHEETS.USERS);

    if (subAction === 'LIST') {
      var users = rows.map(function (r) {
        return {
          userId: r.User_ID,
          username: r.Username,
          role: r.Role,
          allowedProjects: r.Allowed_Projects,
          hasActiveToken: Boolean(r.Auth_Token),
          status: r.Status,
          createdAt: r.Created_At
        };
      });
      return { status: 'success', users: users };
    }

    if (subAction === 'CREATE') {
      var uname = String(payload.username || '').trim().toLowerCase();
      var pass = String(payload.password || '').trim();
      var role = String(payload.role || 'UPLOADER').toUpperCase();
      var allowed = String(payload.allowedProjects || 'ALL').trim();

      if (!uname || !pass) {
        return { status: 'error', message: 'Username dan PIN wajib diisi.' };
      }
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].Username).trim().toLowerCase() === uname) {
          return { status: 'error', message: 'Username sudah terdaftar.' };
        }
      }

      var newId = 'USR-' + String(rows.length + 1).padStart(3, '0') + '-' + Math.floor(Math.random() * 90 + 10);
      sheet.appendRow([
        newId,
        uname,
        hashSecret(pass),
        role,
        allowed,
        '',
        'ACTIVE',
        new Date().toISOString()
      ]);
      appendAuditLog(auth.user.Username, 'USER_CREATE', uname, 'Role: ' + role);
      return { status: 'success', message: 'Akun berhasil dibuat.', userId: newId };
    }

    // Operasi pada targetUserId
    var target = null;
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].User_ID === payload.targetUserId) {
        target = rows[j];
        break;
      }
    }
    if (!target) {
      return { status: 'error', message: 'User tidak ditemukan.' };
    }

    if (subAction === 'REVOKE_AUTH') {
      sheet.getRange(target._rowIndex, 6, 1, 2).setValues([['', 'REVOKED']]);
      appendAuditLog(auth.user.Username, 'AUTH_REVOKE', target.Username, 'Otentikasi dicabut paksa oleh Admin');
      return { status: 'success', message: 'Otentikasi ' + target.Username + ' telah dicabut.' };
    }

    if (subAction === 'ACTIVATE_AUTH') {
      sheet.getRange(target._rowIndex, 7).setValue('ACTIVE');
      appendAuditLog(auth.user.Username, 'AUTH_ACTIVATE', target.Username, 'Akun diaktifkan kembali');
      return { status: 'success', message: 'Akun ' + target.Username + ' diaktifkan kembali.' };
    }

    if (subAction === 'RESET_PASSWORD') {
      var newPass = String(payload.password || '').trim();
      if (!newPass) return { status: 'error', message: 'PIN baru wajib diisi.' };
      sheet.getRange(target._rowIndex, 3).setValue(hashSecret(newPass));
      sheet.getRange(target._rowIndex, 6).setValue('');
      appendAuditLog(auth.user.Username, 'AUTH_RESET', target.Username, 'PIN direset & token lama dihapus');
      return { status: 'success', message: 'PIN berhasil direset. Perangkat lama harus login ulang.' };
    }

    if (subAction === 'DELETE_USER') {
      if (target.User_ID === auth.user.User_ID) {
        return { status: 'error', message: 'Tidak bisa menghapus akun Admin yang sedang dipakai.' };
      }
      sheet.deleteRow(target._rowIndex);
      appendAuditLog(auth.user.Username, 'AUTH_DELETE', target.Username, 'Akun dihapus permanen');
      return { status: 'success', message: 'Akun ' + target.Username + ' dihapus.' };
    }

    return { status: 'error', message: 'subAction tidak dikenali: ' + subAction };
  });
}

/**
 * Parse tanggal format "DD-MM-YYYY HH:mm" (WIB) menjadi Date object.
 */
function parseWibDateTime(str) {
  var match = String(str || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  var iso = match[3] + '-' + match[2] + '-' + match[1] + 'T' + match[4] + ':' + match[5] + ':00+07:00';
  return new Date(iso);
}

/**
 * Validasi Magic Link Token dan cek Strict Expiry.
 */
function validateMagicToken(token, incrementView) {
  if (!token) return { valid: false, message: 'Token Magic Link kosong.' };

  return withScriptLock(function () {
    var sheet = getSheetOrInit(CONFIG.SHEETS.MAGIC_LINKS);
    var rows = readSheetRows(CONFIG.SHEETS.MAGIC_LINKS);
    var link = null;

    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].Token) === String(token)) {
        link = rows[i];
        break;
      }
    }

    if (!link) return { valid: false, message: 'Tautan tidak ditemukan.' };
    if (String(link.Status).toUpperCase() === 'REVOKED') {
      return { valid: false, message: 'Tautan ini telah dimatikan oleh Admin.' };
    }

    var expDate = parseWibDateTime(link.Expiry_Date);
    if (expDate && new Date().getTime() > expDate.getTime()) {
      sheet.getRange(link._rowIndex, 7).setValue('EXPIRED');
      return { valid: false, message: 'Masa berlaku tautan sudah habis pada ' + link.Expiry_Date + ' WIB.' };
    }

    if (String(link.Status).toUpperCase() !== 'ACTIVE') {
      return { valid: false, message: 'Tautan sudah tidak aktif (' + link.Status + ').' };
    }

    if (incrementView) {
      var nextCount = Number(link.View_Count || 0) + 1;
      sheet.getRange(link._rowIndex, 8).setValue(nextCount);
      link.View_Count = nextCount;
    }

    return { valid: true, magicLink: link };
  });
}

/**
 * Membangun payload Magic Link lengkap dengan template pesan WhatsApp.
 */
function buildMagicLinkResponse(row, projectMap) {
  var ids = String(row.Allowed_Projects || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var names = ids.map(function (id) { return projectMap[id] || id; });
  var fullUrl = CONFIG.WEB_APP_URL.replace(/\/$/, '') + '/?token=' + row.Token;
  var waMsg = 'Halo *' + row.Label_Penerima + '*,\n'
    + 'Berikut adalah tautan aplikasi dokumentasi foto untuk:\n'
    + '📂 *' + names.join(', ') + '*\n\n'
    + 'Silakan klik tautan di bawah ini untuk melihat, memperbesar (zoom), dan mengunduh foto:\n'
    + '🔗 ' + fullUrl + '\n\n'
    + '_Catatan: Tautan ini aktif hingga ' + row.Expiry_Date + ' WIB._';

  return {
    token: row.Token,
    fullUrl: fullUrl,
    labelPenerima: row.Label_Penerima,
    allowedProjectIds: ids,
    allowedProjectNames: names,
    photoFilter: row.Photo_Filter,
    createdDate: row.Created_Date,
    expiryDate: row.Expiry_Date,
    status: row.Status,
    viewCount: Number(row.View_Count || 0),
    whatsappMessageTemplate: waMsg
  };
}

/**
 * Manajemen Magic Link (CREATE | LIST | EDIT | REVOKE | DELETE_LOG).
 */
function handleManageMagicLink(payload) {
  var auth = requireAdmin(payload.adminToken);
  if (!auth.valid) return { status: 'error', code: auth.code, message: auth.message };

  var subAction = String(payload.subAction || 'LIST').toUpperCase();
  var sheet = getSheetOrInit(CONFIG.SHEETS.MAGIC_LINKS);

  return withScriptLock(function () {
    var projectRows = readSheetRows(CONFIG.SHEETS.PROJECT_CACHE);
    var projectMap = {};
    projectRows.forEach(function (p) { projectMap[p.Folder_ID_GDrive] = p.Nama_Proyek; });

    var rows = readSheetRows(CONFIG.SHEETS.MAGIC_LINKS);

    if (subAction === 'LIST') {
      var nowMs = new Date().getTime();
      var list = rows.map(function (r) {
        var exp = parseWibDateTime(r.Expiry_Date);
        if (r.Status === 'ACTIVE' && exp && nowMs > exp.getTime()) {
          sheet.getRange(r._rowIndex, 7).setValue('EXPIRED');
          r.Status = 'EXPIRED';
        }
        return buildMagicLinkResponse(r, projectMap);
      });
      return { status: 'success', magicLinks: list };
    }

    if (subAction === 'CREATE') {
      var token = generateRandomToken('ml_').substring(0, 13);
      var label = String(payload.labelPenerima || 'Klien').trim();
      var allowedIds = (payload.allowedProjectIds || []).join(',');
      var filter = String(payload.photoFilter || 'ALL').toUpperCase();
      var expiry = String(payload.expiryDate || '').trim();
      var created = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd-MM-yyyy HH:mm');

      sheet.appendRow([token, label, allowedIds, filter, created, expiry, 'ACTIVE', 0]);
      appendAuditLog(auth.user.Username, 'LINK_CREATE', label, 'Proyek: ' + allowedIds + ' | Exp: ' + expiry);

      var createdRow = {
        Token: token,
        Label_Penerima: label,
        Allowed_Projects: allowedIds,
        Photo_Filter: filter,
        Created_Date: created,
        Expiry_Date: expiry,
        Status: 'ACTIVE',
        View_Count: 0
      };
      return { status: 'success', magicLink: buildMagicLinkResponse(createdRow, projectMap) };
    }

    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].Token === payload.token) {
        target = rows[i];
        break;
      }
    }
    if (!target) return { status: 'error', message: 'Magic Link tidak ditemukan.' };

    if (subAction === 'EDIT') {
      var updatedIds = (payload.allowedProjectIds || []).join(',');
      sheet.getRange(target._rowIndex, 3).setValue(updatedIds);
      if (payload.photoFilter) {
        sheet.getRange(target._rowIndex, 4).setValue(String(payload.photoFilter).toUpperCase());
      }
      target.Allowed_Projects = updatedIds;
      appendAuditLog(auth.user.Username, 'LINK_EDIT', target.Label_Penerima, 'Proyek diperbarui: ' + updatedIds);
      return { status: 'success', magicLink: buildMagicLinkResponse(target, projectMap) };
    }

    if (subAction === 'REVOKE') {
      sheet.getRange(target._rowIndex, 7).setValue('REVOKED');
      appendAuditLog(auth.user.Username, 'LINK_REVOKE', target.Label_Penerima, 'Token dimatikan: ' + target.Token);
      return { status: 'success', message: 'Magic Link berhasil dimatikan.' };
    }

    if (subAction === 'DELETE_LOG') {
      sheet.deleteRow(target._rowIndex);
      return { status: 'success', message: 'Log Magic Link dihapus.' };
    }

    return { status: 'error', message: 'subAction tidak dikenali.' };
  });
}
