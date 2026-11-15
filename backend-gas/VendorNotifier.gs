/**
 * VendorNotifier.gs
 * Mesin Notifikasi Otomatis WhatsApp untuk Alert Kuota >= 90% & Tagihan Bulanan H-3.
 * Mendukung CallMeBot (Gratis ke WA Vendor) maupun Fonnte / Wablas.
 */

function sendWhatsAppMessage(phone, messageText) {
  var apiKey = String(CONFIG.WA_API_KEY || '').trim();
  if (!apiKey || apiKey.indexOf('GANTI_') === 0) {
    Logger.log('WA_API_KEY belum diisi. Pesan dilewati: ' + messageText);
    return false;
  }

  var provider = String(CONFIG.WA_API_PROVIDER || 'CALLMEBOT').toUpperCase();
  var targetPhone = String(phone || CONFIG.VENDOR_WA_NUMBER).replace(/[^\d]/g, '');

  try {
    if (provider === 'CALLMEBOT') {
      var url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(targetPhone)
        + '&text=' + encodeURIComponent(messageText)
        + '&apikey=' + encodeURIComponent(apiKey);
      UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      return true;
    }

    if (provider === 'FONNTE') {
      UrlFetchApp.fetch('https://api.fonnte.com/send', {
        method: 'post',
        headers: { Authorization: apiKey },
        payload: { target: targetPhone, message: messageText },
        muteHttpExceptions: true
      });
      return true;
    }

    if (provider === 'WABLAS') {
      UrlFetchApp.fetch('https://pati.wablas.com/api/send-message', {
        method: 'post',
        headers: { Authorization: apiKey },
        payload: { phone: targetPhone, message: messageText },
        muteHttpExceptions: true
      });
      return true;
    }
  } catch (err) {
    Logger.log('Gagal kirim WA (' + provider + '): ' + err.message);
  }
  return false;
}

function sendQuota90Alert(tenant) {
  var usedStr = Number(tenant.Used_Storage_GB || 0).toFixed(2).replace('.', ',');
  var limitStr = Number(tenant.Quota_Limit_GB || 0).toFixed(2).replace('.', ',');
  var pctStr = (Number(tenant.Used_Storage_GB || 0) / Number(tenant.Quota_Limit_GB || 1) * 100).toFixed(1).replace('.', ',');
  var clientWa = String(tenant.No_WA_Kontraktor || '').replace(/[^\d]/g, '');
  var offerText = 'Halo Bapak/Ibu ' + tenant.Nama_Kontraktor
    + ', info kapasitas penyimpanan Cloud foto proyek sudah mencapai 90% (' + usedStr + ' GB dari ' + limitStr
    + ' GB). Apakah mau sekalian di-upgrade ke 10 GB agar upload di lapangan tidak terhenti?';

  var msg = '⚠️ *PERINGATAN KUOTA 90% — APLIKASI PROYEK*\n'
    + 'Konsumen: *' + tenant.Nama_Kontraktor + '* (' + tenant.Tenant_ID + ')\n'
    + 'Pemakaian: *' + usedStr + ' GB / ' + limitStr + ' GB (' + pctStr + '%)*\n'
    + 'Status: Hampir penuh! Sistem akan otomatis berhenti di ' + limitStr + ' GB.\n\n'
    + '👉 Klik untuk tawarkan upgrade via WA Klien:\n'
    + 'https://wa.me/' + clientWa + '?text=' + encodeURIComponent(offerText);

  return sendWhatsAppMessage(CONFIG.VENDOR_WA_NUMBER, msg);
}

function sendBillingReminderAlert(tenant) {
  var usedStr = Number(tenant.Used_Storage_GB || 0).toFixed(2).replace('.', ',');
  var limitStr = Number(tenant.Quota_Limit_GB || 0).toFixed(2).replace('.', ',');
  var pct = Math.round((Number(tenant.Used_Storage_GB || 0) / Number(tenant.Quota_Limit_GB || 1)) * 100);
  var fee = Number(tenant.Monthly_Fee_IDR || 200000).toLocaleString('id-ID');
  var clientWa = String(tenant.No_WA_Kontraktor || '').replace(/[^\d]/g, '');

  var billText = 'Halo Bapak/Ibu ' + tenant.Nama_Kontraktor
    + ', mengingatkan perpanjangan bulanan Cloud Server Aplikasi Proyek sebesar Rp ' + fee
    + ' (jatuh tempo ' + tenant.Billing_Due_Date + '). Status penyimpanan saat ini: '
    + usedStr + ' GB dari ' + limitStr + ' GB. Terima kasih.';

  var msg = '🧾 *PENGINGAT TAGIHAN BULANAN CLOUD SERVER*\n'
    + 'Konsumen: *' + tenant.Nama_Kontraktor + '* (' + tenant.Tenant_ID + ')\n'
    + 'Jatuh Tempo: *' + tenant.Billing_Due_Date + '*\n'
    + 'Tagihan Cloud Server: *Rp ' + fee + ' / bulan*\n'
    + 'Status Penyimpanan Saat Ini: *' + usedStr + ' GB dari ' + limitStr + ' GB (' + pct + '%)*\n\n'
    + '👉 Klik untuk kirim tagihan ke WA Klien:\n'
    + 'https://wa.me/' + clientWa + '?text=' + encodeURIComponent(billText);

  return sendWhatsAppMessage(CONFIG.VENDOR_WA_NUMBER, msg);
}
