package com.kontraktor.dokproyek.uploader.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import com.kontraktor.dokproyek.uploader.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class UploadForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "dokproyek_upload_channel"
        const val CHANNEL_DONE_ID = "dokproyek_upload_done_channel"
        const val NOTIF_ID = 1001
        const val NOTIF_DONE_ID = 1002
        const val PREFS_UPLOAD_STATE = "dokproyek_upload_state"
        const val KEY_IS_UPLOADING = "is_uploading"
        const val KEY_STATUS_MSG = "status_msg"
        const val KEY_PERCENT = "percent"
        const val KEY_PENDING_DONE_MSG = "pending_done_msg"
        const val KEY_PENDING_DONE_ERR = "pending_done_err"
        const val ACTION_PROGRESS = "com.kontraktor.dokproyek.UPLOAD_PROGRESS"
        const val ACTION_REVOKED = "com.kontraktor.dokproyek.TOKEN_REVOKED"
        const val ACTION_QUOTA_BLOCKED = "com.kontraktor.dokproyek.QUOTA_BLOCKED"
        const val EXTRA_URIS = "extra_uris"
        const val EXTRA_PROJECT = "extra_project"
        const val EXTRA_SUBFOLDER = "extra_subfolder"
        const val EXTRA_TOKEN = "extra_token"
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val uriStrings = intent?.getStringArrayListExtra(EXTRA_URIS) ?: arrayListOf()
        val projectName = intent?.getStringExtra(EXTRA_PROJECT) ?: ""
        val subFolderName = intent?.getStringExtra(EXTRA_SUBFOLDER) ?: ""
        val authToken = intent?.getStringExtra(EXTRA_TOKEN) ?: ""

        if (uriStrings.isEmpty() || projectName.isEmpty() || authToken.isEmpty()) {
            stopSelf()
            return START_NOT_STICKY
        }

        val initialNotif = buildProgressNotif("Menyiapkan ${uriStrings.size} foto...", 0, 100)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, initialNotif.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, initialNotif.build())
        }

        saveActiveState("Menyiapkan ${uriStrings.size} foto...", 0, isUploading = true)

        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DokProyek::UploadWakeLock").apply {
            acquire(30 * 60 * 1000L)
        }

        serviceScope.launch {
            var successCount = 0
            var skippedCount = 0
            var failedCount = 0
            var lastServerError: String? = null
            val total = uriStrings.size

            for (i in uriStrings.indices) {
                val uri = Uri.parse(uriStrings[i])
                val startPct = ((i * 100) / total).coerceIn(1, 99)
                val humanText = "⏳ Foto ${i + 1}/$total ($startPct%) • Layar boleh dikunci"
                updateNotification(humanText, startPct, 100)
                saveActiveState(humanText, startPct, isUploading = true)
                broadcastStatus(humanText, i, total, startPct, isDone = false, hasNetworkError = false)

                var attempt = 0
                var uploaded = false
                while (attempt < 3 && !uploaded) {
                    try {
                        val res = RawFileStreamer.uploadSinglePhoto(
                            applicationContext,
                            authToken,
                            projectName,
                            subFolderName,
                            uri
                        ) { filePct ->
                            val overallPct = ((i * 100 + filePct) / total).coerceIn(1, 99)
                            val pctText = if (filePct >= 90) {
                                "⏳ Foto ${i + 1}/$total ($overallPct%) • Menyimpan ke Cloud..."
                            } else {
                                "⏳ Foto ${i + 1}/$total ($overallPct%) • Mengirim..."
                            }
                            updateNotification(pctText, overallPct, 100)
                            saveActiveState(pctText, overallPct, isUploading = true)
                            broadcastStatus(pctText, i, total, overallPct, isDone = false, hasNetworkError = false)
                        }
                        val status = res.optString("status")
                        val code = res.optString("code")

                        if (code == "TOKEN_REVOKED" || code == "UNAUTHORIZED") {
                            clearActiveState()
                            sendBroadcast(Intent(ACTION_REVOKED))
                            stopForeground(STOP_FOREGROUND_REMOVE)
                            stopSelf()
                            return@launch
                        }

                        if (code == "QUOTA_EXCEEDED" || code == "SUBSCRIPTION_SUSPENDED") {
                            val errMsg = res.optString("message", "🚫 Penyimpanan kantor sudah penuh. Hubungi Admin.")
                            clearActiveState()
                            sendBroadcast(Intent(ACTION_QUOTA_BLOCKED).putExtra("message", errMsg))
                            showResultNotification("⚠️ Upload Dihentikan", errMsg)
                            stopForeground(STOP_FOREGROUND_REMOVE)
                            stopSelf()
                            return@launch
                        }

                        if (status == "success") {
                            successCount++
                            uploaded = true
                        } else if (status == "skipped_duplicate") {
                            skippedCount++
                            uploaded = true
                        } else if (status == "error") {
                            lastServerError = res.optString("message").takeIf { it.isNotBlank() }
                                ?: "Server menolak upload ($code)."
                            break
                        } else {
                            attempt++
                            delay(2000L * attempt)
                        }
                    } catch (e: Exception) {
                        attempt++
                        delay(3000L * attempt)
                    }
                }
                if (!uploaded) failedCount++
            }

            val finalMsg = if (failedCount == 0) {
                "✅ Beres! $successCount foto masuk ke $projectName" +
                    if (skippedCount > 0) " ($skippedCount foto sudah pernah dikirim)" else ""
            } else if (!lastServerError.isNullOrBlank()) {
                "⚠️ Gagal ($failedCount foto): $lastServerError"
            } else {
                "⚠️ Sinyal lemah. $failedCount foto masih menunggu sinyal."
            }

            saveDoneState(finalMsg, hasErr = failedCount > 0)
            broadcastStatus(finalMsg, total, total, 100, isDone = true, hasNetworkError = failedCount > 0)
            vibrateShort()
            stopForeground(STOP_FOREGROUND_REMOVE)
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIF_ID)
            showResultNotification(
                if (failedCount == 0) "✅ Upload Selesai" else "⚠️ Upload Belum Selesai",
                finalMsg
            )
            stopSelf()
        }

        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Progres Upload Foto", NotificationManager.IMPORTANCE_LOW)
            )
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_DONE_ID, "Notifikasi Upload Selesai", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
    }

    private fun buildProgressNotif(text: String, progress: Int, max: Int): NotificationCompat.Builder {
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Kirim Foto Proyek")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentIntent(openIntent)
            .setOngoing(progress < max)
            .setOnlyAlertOnce(true)
            .setProgress(max, progress, false)
    }

    private fun showResultNotification(title: String, msg: String) {
        val openIntent = PendingIntent.getActivity(
            this,
            1,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(this, CHANNEL_DONE_ID)
            .setContentTitle(title)
            .setContentText(msg)
            .setStyle(NotificationCompat.BigTextStyle().bigText(msg))
            .setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setContentIntent(openIntent)
            .setAutoCancel(true)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_DONE_ID, notif)
    }

    private fun updateNotification(text: String, progress: Int, max: Int) {
        val mgr = getSystemService(NotificationManager::class.java)
        mgr.notify(NOTIF_ID, buildProgressNotif(text, progress, max).build())
    }

    private fun saveActiveState(msg: String, percent: Int, isUploading: Boolean) {
        getSharedPreferences(PREFS_UPLOAD_STATE, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_IS_UPLOADING, isUploading)
            .putString(KEY_STATUS_MSG, msg)
            .putInt(KEY_PERCENT, percent)
            .remove(KEY_PENDING_DONE_MSG)
            .apply()
    }

    private fun saveDoneState(msg: String, hasErr: Boolean) {
        getSharedPreferences(PREFS_UPLOAD_STATE, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_IS_UPLOADING, false)
            .putString(KEY_PENDING_DONE_MSG, msg)
            .putBoolean(KEY_PENDING_DONE_ERR, hasErr)
            .apply()
    }

    private fun clearActiveState() {
        getSharedPreferences(PREFS_UPLOAD_STATE, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun broadcastStatus(msg: String, current: Int, total: Int, percent: Int, isDone: Boolean, hasNetworkError: Boolean) {
        val intent = Intent(ACTION_PROGRESS).apply {
            putExtra("message", msg)
            putExtra("current", current)
            putExtra("total", total)
            putExtra("percent", percent)
            putExtra("isDone", isDone)
            putExtra("hasNetworkError", hasNetworkError)
        }
        sendBroadcast(intent)
    }

    @Suppress("DEPRECATION")
    private fun vibrateShort() {
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(250, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            vibrator.vibrate(250)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        wakeLock?.let { if (it.isHeld) it.release() }
        serviceScope.cancel()
    }
}
