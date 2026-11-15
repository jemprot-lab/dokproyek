package com.kontraktor.dokproyek.uploader.services

import android.app.NotificationChannel
import android.app.NotificationManager
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class UploadForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "dokproyek_upload_channel"
        const val NOTIF_ID = 1001
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

        val initialNotif = buildProgressNotif("Menyiapkan ${uriStrings.size} foto...", 0, uriStrings.size)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, initialNotif.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, initialNotif.build())
        }

        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DokProyek::UploadWakeLock").apply {
            acquire(30 * 60 * 1000L)
        }

        serviceScope.launch {
            var successCount = 0
            var skippedCount = 0
            var failedCount = 0
            val total = uriStrings.size

            for (i in uriStrings.indices) {
                val uri = Uri.parse(uriStrings[i])
                val humanText = "⏳ Mengirim foto ke-${i + 1} dari $total... (Layar boleh dikunci)"
                updateNotification(humanText, i, total)
                broadcastStatus(humanText, i, total, isDone = false, hasNetworkError = false)

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
                        )
                        val status = res.optString("status")
                        val code = res.optString("code")

                        if (code == "TOKEN_REVOKED" || code == "UNAUTHORIZED") {
                            sendBroadcast(Intent(ACTION_REVOKED))
                            stopForeground(STOP_FOREGROUND_REMOVE)
                            stopSelf()
                            return@launch
                        }

                        if (code == "QUOTA_EXCEEDED" || code == "SUBSCRIPTION_SUSPENDED") {
                            val errMsg = res.optString("message", "🚫 Penyimpanan kantor sudah penuh. Hubungi Admin.")
                            sendBroadcast(Intent(ACTION_QUOTA_BLOCKED).putExtra("message", errMsg))
                            updateNotification(errMsg, total, total)
                            stopForeground(STOP_FOREGROUND_DETACH)
                            stopSelf()
                            return@launch
                        }

                        if (status == "success") {
                            successCount++
                            uploaded = true
                        } else if (status == "skipped_duplicate") {
                            skippedCount++
                            uploaded = true
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
                "✅ Beres! $successCount foto masuk kantor" +
                    if (skippedCount > 0) " ($skippedCount foto sudah pernah dikirim)" else ""
            } else {
                "⚠️ Sinyal lemah. $failedCount foto masih menunggu sinyal."
            }

            broadcastStatus(finalMsg, total, total, isDone = true, hasNetworkError = failedCount > 0)
            vibrateShort()
            if (failedCount == 0) {
                stopForeground(STOP_FOREGROUND_REMOVE)
                (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIF_ID)
            } else {
                updateNotification(finalMsg, total, total)
                stopForeground(STOP_FOREGROUND_DETACH)
            }
            stopSelf()
        }

        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Pengiriman Foto Proyek",
                NotificationManager.IMPORTANCE_LOW
            )
            val mgr = getSystemService(NotificationManager::class.java)
            mgr.createNotificationChannel(channel)
        }
    }

    private fun buildProgressNotif(text: String, progress: Int, max: Int): NotificationCompat.Builder {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Kirim Foto Proyek")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setOngoing(progress < max)
            .setProgress(max, progress, false)
    }

    private fun updateNotification(text: String, progress: Int, max: Int) {
        val mgr = getSystemService(NotificationManager::class.java)
        mgr.notify(NOTIF_ID, buildProgressNotif(text, progress, max).build())
    }

    private fun broadcastStatus(msg: String, current: Int, total: Int, isDone: Boolean, hasNetworkError: Boolean) {
        val intent = Intent(ACTION_PROGRESS).apply {
            putExtra("message", msg)
            putExtra("current", current)
            putExtra("total", total)
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
