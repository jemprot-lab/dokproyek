/**
 * DriveController.gs
 * Operasi Google Drive: Search Proyek, Upload Binary (EXIF Utuh + Anti-Duplikat),
 * List Foto + Metadata GPS, Proxy Blob (Anti-CORS), dan Operasi Admin.
 */

/**
 * Helper mencari atau membuat sub-folder berdasarkan nama di dalam parentFolder.
 */
function findOrCreateSubFolder(parentFolder, folderName) {
  var iter = parentFolder.getFoldersByName(folderName);
  while (iter.hasNext()) {
    var f = iter.next();
    if (!f.isTrashed()) return f;
  }
  return parentFolder.createFolder(folderName);
}

/**
 * Helper memvalidasi akses baik via authToken (User) maupun magicToken (Klien).
 */
function resolveViewerOrUploaderAccess(payload) {
  if (payload.magicToken) {
    var mRes = validateMagicToken(payload.magicToken, Boolean(payload.incrementView));
    if (!mRes.valid) return { valid: false, code: 'MAGIC_INVALID', message: mRes.message };
    var ml = mRes.magicLink;
    return {
      valid: true,
      mode: 'MAGIC_LINK',
      actor: ml.Label_Penerima,
      role: 'VIEWER',
      allowedProjects: String(ml.Allowed_Projects || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      photoFilter: String(ml.Photo_Filter || 'ALL').toUpperCase(),
      magicLinkInfo: {
        labelPenerima: ml.Label_Penerima,
        expiryDate: ml.Expiry_Date,
        photoFilter: ml.Photo_Filter
      }
    };
  }

  var uRes = validateAuthToken(payload.authToken || payload.adminToken);
  if (!uRes.valid) return uRes;
  var u = uRes.user;
  var allowed = String(u.Allowed_Projects || 'ALL').trim();
  return {
    valid: true,
    mode: 'USER',
    actor: u.Username,
    role: String(u.Role).toUpperCase(),
    allowedProjects: allowed === 'ALL' ? 'ALL' : allowed.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    photoFilter: 'ALL'
  };
}

/**
 * Pencarian Proyek (dipanggil APK Uploader & Web App/PWA).
 * Action: SEARCH_PROJECTS
 */
function handleSearchProjects(payload) {
  var access = resolveViewerOrUploaderAccess(payload);
  if (!access.valid) return { status: 'error', code: access.code, message: access.message };

  var query = String(payload.query || '').trim().toLowerCase();
  var includeArchived = Boolean(payload.includeArchived) && access.role === 'ADMIN';
  var limit = Number(payload.limit || 5);

  var rows = readSheetRows(CONFIG.SHEETS.PROJECT_CACHE);

  // Jika cache masih kosong, sinkronkan dari Root Folder GDrive
  if (rows.length === 0) {
    var root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
    var folders = root.getFolders();
    while (folders.hasNext()) {
      var pf = folders.next();
      if (!pf.isTrashed()) syncProjectCacheFromDrive(pf);
    }
    rows = readSheetRows(CONFIG.SHEETS.PROJECT_CACHE);
  }

  rows.sort(function (a, b) {
    return String(b.Last_Updated || '').localeCompare(String(a.Last_Updated || ''));
  });

  var results = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var pStatus = String(r.Project_Status || 'ACTIVE').toUpperCase();
    if (!includeArchived && pStatus !== 'ACTIVE') continue;

    var subs = [];
    try {
      subs = JSON.parse(r.Sub_Folders_JSON || '[]');
    } catch (e) {
      subs = [];
    }

    if (access.allowedProjects !== 'ALL') {
      var projectAllowed = access.allowedProjects.indexOf(r.Folder_ID_GDrive) !== -1;
      if (!projectAllowed) {
        subs = subs.filter(function (s) {
          return access.allowedProjects.indexOf(s.id) !== -1;
        });
        if (subs.length === 0) continue;
      }
    }

    if (query) {
      var matchProj = String(r.Nama_Proyek).toLowerCase().indexOf(query) !== -1;
      var matchSub = subs.some(function (s) {
        return String(s.name || '').toLowerCase().indexOf(query) !== -1;
      });
      if (!matchProj && !matchSub) continue;
    }

    results.push({
      folderId: r.Folder_ID_GDrive,
      projectName: r.Nama_Proyek,
      projectStatus: pStatus,
      lastUpdated: r.Last_Updated,
      subFolders: subs.map(function (s) {
        return { subId: s.id, subName: s.name, count: s.count || 0 };
      })
    });

    if (limit > 0 && results.length >= limit) break;
  }

  return {
    status: 'success',
    projects: results,
    magicLinkInfo: access.magicLinkInfo || null
  };
}

/**
 * Daftar ringan hanya nama proyek aktif untuk autocomplete APK lapangan.
 * Action: LIST_PROJECT_NAMES
 */
function handleListProjectNames(payload) {
  var access = resolveViewerOrUploaderAccess(payload);
  if (!access.valid) return { status: 'error', code: access.code, message: access.message };

  var rows = readSheetRows(CONFIG.SHEETS.PROJECT_CACHE);
  rows.sort(function (a, b) {
    return String(b.Last_Updated || '').localeCompare(String(a.Last_Updated || ''));
  });

  var names = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.Project_Status || 'ACTIVE').toUpperCase() !== 'ACTIVE') continue;
    if (r.Nama_Proyek) names.push(String(r.Nama_Proyek));
  }
  return { status: 'success', projectNames: names };
}

/**
 * Upload Foto Biner Murni dari APK Lapangan (EXIF 100% Utuh + Anti-Duplikat).
 * Action: UPLOAD_PHOTO_RAW
 */
function handleUploadPhotoRaw(payload) {
  var access = resolveViewerOrUploaderAccess(payload);
  if (!access.valid) return { status: 'error', code: access.code, message: access.message };

  if (access.role !== 'ADMIN' && access.role !== 'UPLOADER') {
    return { status: 'error', code: 'FORBIDDEN', message: 'Akun ini tidak memiliki izin upload.' };
  }

  var projectName = String(payload.projectName || '').trim();
  var subFolderName = String(payload.subFolderName || '').trim();
  var fileName = String(payload.fileName || '').trim();
  var fileSize = Number(payload.fileSize || 0);
  var mimeType = String(payload.mimeType || 'image/jpeg');
  var base64Data = String(payload.base64Data || '');

  if (!projectName || !subFolderName || !fileName || !base64Data) {
    return { status: 'error', code: 'INVALID_PAYLOAD', message: 'Data foto tidak lengkap.' };
  }

  // Cek kuota & status langganan (Hard Stop)
  var estimatedBytes = fileSize > 0 ? fileSize : Math.floor(base64Data.length * 0.75);
  var quotaCheck = checkTenantQuotaAndBilling(estimatedBytes);
  if (!quotaCheck.allowed) {
    return {
      status: 'error',
      code: quotaCheck.code,
      message: quotaCheck.message,
      storage: quotaCheck
    };
  }

  return withScriptLock(function () {
    var rootFolder = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
    var projectFolder = findOrCreateSubFolder(rootFolder, projectName);
    var subFolder = findOrCreateSubFolder(projectFolder, subFolderName);

    // Anti-Double Upload Check: fileName + fileSize (bytes)
    var existingIter = subFolder.getFilesByName(fileName);
    while (existingIter.hasNext()) {
      var existingFile = existingIter.next();
      if (!existingFile.isTrashed() && existingFile.getSize() === fileSize) {
        appendAuditLog(access.actor, 'SKIP_DUP', fileName, 'Dilewati karena duplikat di ' + projectName + ' > ' + subFolderName);
        return {
          status: 'skipped_duplicate',
          fileId: existingFile.getId(),
          message: 'Foto ini sudah pernah dikirim sebelumnya.'
        };
      }
    }

    // Dekode Base64 ke byte array murni tanpa re-encoding gambar (EXIF utuh)
    var rawBytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(rawBytes, mimeType, fileName);
    var savedFile = subFolder.createFile(blob);

    syncProjectCacheFromDrive(projectFolder);
    recordTenantUploadBytes(savedFile.getSize());
    appendAuditLog(access.actor, 'UPLOAD', fileName, 'Tersimpan ke ' + projectName + ' > ' + subFolderName);

    return {
      status: 'success',
      fileId: savedFile.getId(),
      folderId: projectFolder.getId(),
      subFolderId: subFolder.getId(),
      message: 'Foto berhasil tersimpan.'
    };
  });
}

/**
 * Mengambil daftar foto dalam sub-folder beserta metadata EXIF GPS (via Drive v3).
 * Action: LIST_PHOTOS
 */
function handleListPhotos(payload) {
  var access = resolveViewerOrUploaderAccess(payload);
  if (!access.valid) return { status: 'error', code: access.code, message: access.message };

  var subFolderId = String(payload.subFolderId || '').trim();
  if (!subFolderId) return { status: 'error', message: 'subFolderId wajib diisi.' };

  if (access.allowedProjects !== 'ALL') {
    var directAllowed = access.allowedProjects.indexOf(subFolderId) !== -1;
    if (!directAllowed) {
      var parents = DriveApp.getFolderById(subFolderId).getParents();
      var parentAllowed = false;
      while (parents.hasNext()) {
        if (access.allowedProjects.indexOf(parents.next().getId()) !== -1) {
          parentAllowed = true;
          break;
        }
      }
      if (!parentAllowed) {
        return { status: 'error', code: 'FORBIDDEN', message: 'Anda tidak memiliki izin membuka folder ini.' };
      }
    }
  }

  var onlyStarred = Boolean(payload.onlyStarred) || access.photoFilter === 'STARRED_ONLY';
  var q = "'" + subFolderId + "' in parents and trashed = false and mimeType contains 'image/'";
  if (onlyStarred) {
    q += ' and starred = true';
  }

  var response = Drive.Files.list({
    q: q,
    pageSize: 200,
    orderBy: 'name',
    fields: 'files(id,name,size,mimeType,description,starred,thumbnailLink,webContentLink,createdTime,imageMediaMetadata(time,location(latitude,longitude)))'
  });

  var files = (response.files || []).map(function (f) {
    var meta = f.imageMediaMetadata || {};
    var loc = meta.location || {};
    return {
      id: f.id,
      name: f.name,
      size: Number(f.size || 0),
      mimeType: f.mimeType,
      caption: f.description || '',
      starred: Boolean(f.starred),
      thumbnailUrl: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s600') : '',
      previewUrl: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w1600',
      takenTime: meta.time || f.createdTime || '',
      gps: (loc.latitude !== undefined && loc.longitude !== undefined) ? {
        lat: loc.latitude,
        lng: loc.longitude
      } : null
    };
  });

  return {
    status: 'success',
    photos: files,
    role: access.role,
    photoFilter: access.photoFilter
  };
}

/**
 * Proxy biner foto untuk kebutuhan JSZip (Batch ZIP) & jsPDF (Laporan PDF)
 * agar bebas dari kendala CORS Google Drive di browser.
 * Action: GET_PHOTO_BLOB
 */
function handleGetPhotoBlob(payload) {
  var access = resolveViewerOrUploaderAccess(payload);
  if (!access.valid) return { status: 'error', code: access.code, message: access.message };

  var fileId = String(payload.fileId || '').trim();
  if (!fileId) return { status: 'error', message: 'fileId wajib diisi.' };

  var file = DriveApp.getFileById(fileId);
  if (file.isTrashed()) return { status: 'error', message: 'Foto sudah dihapus.' };

  var blob = null;
  if (payload.preview) {
    try {
      var thumbResp = UrlFetchApp.fetch('https://lh3.googleusercontent.com/d/' + encodeURIComponent(fileId) + '=w1200', {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (thumbResp.getResponseCode() === 200) {
        blob = thumbResp.getBlob();
      }
    } catch (e) {}
  }
  if (!blob) {
    blob = file.getBlob();
  }

  return {
    status: 'success',
    fileId: fileId,
    fileName: file.getName(),
    mimeType: blob.getContentType(),
    base64Data: Utilities.base64Encode(blob.getBytes())
  };
}

/**
 * Aksi Admin pada File & Folder:
 * MOVE_FILES | RENAME_FOLDER | SET_STAR | SET_CAPTION | SET_ARCHIVE_STATUS | SOFT_DELETE_TRASH
 * Action: ADMIN_FILE_OPS
 */
function handleAdminFileOps(payload) {
  var auth = requireAdmin(payload.adminToken || payload.authToken);
  if (!auth.valid) return { status: 'error', code: auth.code, message: auth.message };

  var op = String(payload.operation || '').toUpperCase();
  var fileIds = payload.fileIds || [];

  return withScriptLock(function () {
    if (op === 'MOVE_FILES') {
      var targetProject = DriveApp.getFolderById(payload.targetProjectId);
      var targetSub = findOrCreateSubFolder(targetProject, String(payload.targetSubFolderName).trim());
      var movedNames = [];

      fileIds.forEach(function (fid) {
        var file = DriveApp.getFileById(fid);
        movedNames.push(file.getName());
        var parents = file.getParents();
        while (parents.hasNext()) {
          var p = parents.next();
          syncProjectCacheFromDrive(p.getParents().hasNext() ? p.getParents().next() : targetProject);
        }
        file.moveTo(targetSub);
      });

      syncProjectCacheFromDrive(targetProject);
      appendAuditLog(auth.user.Username, 'MOVE', movedNames.join(', '), 'Dipindahkan ke ' + targetProject.getName() + ' > ' + targetSub.getName());
      return { status: 'success', message: movedNames.length + ' foto berhasil dipindahkan.' };
    }

    if (op === 'RENAME_FOLDER') {
      var folder = DriveApp.getFolderById(payload.targetFolderId);
      var oldName = folder.getName();
      var newName = String(payload.newName || '').trim();
      if (!newName) return { status: 'error', message: 'Nama baru wajib diisi.' };

      folder.setName(newName);
      var parents = folder.getParents();
      var parent = parents.hasNext() ? parents.next() : null;
      if (parent && parent.getId() === CONFIG.ROOT_FOLDER_ID) {
        syncProjectCacheFromDrive(folder);
      } else if (parent) {
        syncProjectCacheFromDrive(parent);
      }
      appendAuditLog(auth.user.Username, 'RENAME', oldName, 'Diubah menjadi: ' + newName);
      return { status: 'success', message: 'Folder diubah menjadi ' + newName };
    }

    if (op === 'SET_STAR') {
      var starVal = Boolean(payload.starState);
      fileIds.forEach(function (fid) {
        Drive.Files.update({ starred: starVal }, fid);
      });
      appendAuditLog(auth.user.Username, 'STAR', fileIds.join(','), 'Starred = ' + starVal);
      return { status: 'success', starred: starVal };
    }

    if (op === 'SET_CAPTION') {
      var caption = String(payload.captionText || '');
      fileIds.forEach(function (fid) {
        DriveApp.getFileById(fid).setDescription(caption);
      });
      appendAuditLog(auth.user.Username, 'CAPTION', fileIds.join(','), caption);
      return { status: 'success', caption: caption };
    }

    if (op === 'SET_ARCHIVE_STATUS') {
      var newStatus = String(payload.archiveStatus || 'ARCHIVED').toUpperCase();
      var sheet = getSheetOrInit(CONFIG.SHEETS.PROJECT_CACHE);
      var rows = readSheetRows(CONFIG.SHEETS.PROJECT_CACHE);
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].Folder_ID_GDrive === payload.targetProjectId) {
          sheet.getRange(rows[i]._rowIndex, 3).setValue(newStatus);
          appendAuditLog(auth.user.Username, 'ARCHIVE', rows[i].Nama_Proyek, 'Status diubah ke ' + newStatus);
          return { status: 'success', projectStatus: newStatus };
        }
      }
      return { status: 'error', message: 'Proyek tidak ditemukan di cache.' };
    }

    if (op === 'SOFT_DELETE_TRASH') {
      var deletedNames = [];
      var touchedProjects = {};
      fileIds.forEach(function (fid) {
        var f = DriveApp.getFileById(fid);
        deletedNames.push(f.getName());
        var parents = f.getParents();
        if (parents.hasNext()) {
          var sub = parents.next();
          var grand = sub.getParents();
          if (grand.hasNext()) touchedProjects[grand.next().getId()] = true;
        }
        f.setTrashed(true);
      });

      Object.keys(touchedProjects).forEach(function (pid) {
        syncProjectCacheFromDrive(DriveApp.getFolderById(pid));
      });
      appendAuditLog(auth.user.Username, 'DELETE', deletedNames.join(', '), 'Dipindahkan ke Trash (Soft Delete)');
      return { status: 'success', message: deletedNames.length + ' foto dipindahkan ke Trash.' };
    }

    if (op === 'EMPTY_TRASH_PERMANENT') {
      var purgedCount = 0;
      var queue = [CONFIG.ROOT_FOLDER_ID];
      while (queue.length > 0) {
        var parentId = queue.shift();
        var pageToken = null;
        do {
          var res = Drive.Files.list({
            q: "'" + parentId + "' in parents",
            pageSize: 500,
            pageToken: pageToken,
            fields: 'nextPageToken, files(id, mimeType, trashed)'
          });
          (res.files || []).forEach(function (f) {
            if (f.trashed) {
              Drive.Files.delete(f.id);
              purgedCount++;
            } else if (f.mimeType === 'application/vnd.google-apps.folder') {
              queue.push(f.id);
            }
          });
          pageToken = res.nextPageToken;
        } while (pageToken);
      }

      // Hitung ulang ukuran penyimpanan aktual setelah sampah dikosongkan
      if (CONFIG.MASTER_VENDOR_SPREADSHEET_ID && CONFIG.MASTER_VENDOR_SPREADSHEET_ID.indexOf('GANTI_') !== 0) {
        var row = findTenantRow(CONFIG.TENANT_ID);
        if (row) {
          var actualBytes = calculateFolderSizeBytesV3(CONFIG.ROOT_FOLDER_ID);
          var actualGb = Number((actualBytes / BYTES_PER_GB).toFixed(4));
          row._sheet.getRange(row._rowIndex, 6).setValue(actualGb);
          if (actualGb < Number(row.Quota_Limit_GB || 5)) {
            row._sheet.getRange(row._rowIndex, 10).setValue('ACTIVE');
            row._sheet.getRange(row._rowIndex, 11).setValue(false);
          }
          CacheService.getScriptCache().remove('TENANT_STATUS_' + CONFIG.TENANT_ID);
        }
      }

      appendAuditLog(auth.user.Username, 'EMPTY_TRASH', purgedCount + ' item', 'Sampah dikosongkan permanen');
      return { status: 'success', purgedCount: purgedCount, message: purgedCount + ' item di Trash berhasil dihapus permanen.' };
    }

    if (op === 'GET_STORAGE_STATUS') {
      var statusInfo = checkTenantQuotaAndBilling(0);
      return { status: 'success', storage: statusInfo };
    }

    if (op === 'DELETE_FOLDER') {
      var targetFolder = DriveApp.getFolderById(payload.targetFolderId);
      var folderName = targetFolder.getName();
      var parents = targetFolder.getParents();
      var parent = parents.hasNext() ? parents.next() : null;
      targetFolder.setTrashed(true);

      if (parent && parent.getId() === CONFIG.ROOT_FOLDER_ID) {
        var cacheSheet = getSheetOrInit(CONFIG.SHEETS.PROJECT_CACHE);
        var rows = cacheSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (String(rows[i][0]) === String(payload.targetFolderId)) {
            cacheSheet.deleteRow(i + 1);
            break;
          }
        }
      } else if (parent) {
        syncProjectCacheFromDrive(parent);
      }

      appendAuditLog(
        auth.user.Username,
        'ADMIN_DELETE_FOLDER',
        folderName,
        'ID: ' + payload.targetFolderId
      );
      return { status: 'success', message: 'Folder "' + folderName + '" dipindahkan ke Sampah.' };
    }

    return { status: 'error', message: 'Operasi admin tidak dikenali: ' + op };
  });
}

/**
 * Mengambil status kuota penyimpanan & jatuh tempo untuk Web App & APK.
 * Action: GET_STORAGE_STATUS
 */
function handleGetStorageStatus(payload) {
  var access = resolveViewerOrUploaderAccess(payload);
  if (!access.valid) return { status: 'error', code: access.code, message: access.message };
  var statusInfo = checkTenantQuotaAndBilling(0);
  return { status: 'success', storage: statusInfo };
}
