/**
 * Code.gs
 * Entry point API Router untuk Google Apps Script (doGet & doPost).
 */

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Health check & pembacaan awal via GET.
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = String(params.action || 'PING').toUpperCase();

    if (action === 'PING') {
      return jsonResponse({
        status: 'success',
        service: 'Dokumentasi Proyek Kontraktor GAS API',
        timestamp: formatDateTimeWib(new Date())
      });
    }

    if (action === 'INIT_DB') {
      return jsonResponse(initDatabase());
    }

    return jsonResponse(routeAction(action, params));
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message || String(err) });
  }
}

/**
 * Endpoint utama POST (Content-Type: text/plain;charset=utf-8 untuk menghindari CORS preflight).
 */
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);
    var action = String(payload.action || '').toUpperCase();
    return jsonResponse(routeAction(action, payload));
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message || String(err) });
  }
}

/**
 * Router terpusat untuk seluruh action API.
 */
function routeAction(action, payload) {
  switch (action) {
    case 'LOGIN':
      return handleLogin(payload);
    case 'MANAGE_USERS':
      return handleManageUsers(payload);
    case 'SEARCH_PROJECTS':
      return handleSearchProjects(payload);
    case 'LIST_PROJECT_NAMES':
      return handleListProjectNames(payload);
    case 'UPLOAD_PHOTO_RAW':
      return handleUploadPhotoRaw(payload);
    case 'LIST_PHOTOS':
      return handleListPhotos(payload);
    case 'GET_PHOTO_BLOB':
      return handleGetPhotoBlob(payload);
    case 'MANAGE_MAGIC_LINK':
      return handleManageMagicLink(payload);
    case 'ADMIN_FILE_OPS':
      return handleAdminFileOps(payload);
    case 'GET_STORAGE_STATUS':
      return handleGetStorageStatus(payload);
    case 'CHECK_UPDATES':
      return handleCheckUpdates(payload);
    default:
      return { status: 'error', code: 'UNKNOWN_ACTION', message: 'Action tidak dikenali: ' + action };
  }
}

/**
 * Jalankan fungsi ini satu kali langsung dari editor Google Apps Script
 * (Pilih "setupDatabase" -> klik Run) untuk membuat 4 sheet database
 * beserta header dan akun Admin bawaan (admin / PIN 123456).
 */
function setupDatabase() {
  var result = initDatabase();
  Logger.log('Setup database selesai: ' + JSON.stringify(result));
  return result;
}
