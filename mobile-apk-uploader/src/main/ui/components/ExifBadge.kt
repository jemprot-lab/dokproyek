package com.kontraktor.dokproyek.uploader.ui.components

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface

data class ExifInspectionResult(
    val hasGps: Boolean,
    val lat: Double?,
    val lng: Double?,
    val dateTimeOriginal: String?,
    val badgeText: String
)

object ExifBadge {
    fun inspect(context: Context, uri: Uri): ExifInspectionResult {
        return try {
            val targetUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.setRequireOriginal(uri)
            } else {
                uri
            }

            context.contentResolver.openInputStream(targetUri)?.use { stream ->
                val exif = ExifInterface(stream)
                val latLong = exif.latLong
                val dateOrig = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
                val hasGps = latLong != null && latLong.size == 2

                ExifInspectionResult(
                    hasGps = hasGps,
                    lat = if (hasGps) latLong!![0] else null,
                    lng = if (hasGps) latLong!![1] else null,
                    dateTimeOriginal = dateOrig,
                    badgeText = if (hasGps) "📍 Lokasi Ada" else "⚠️ Tanpa Lokasi (Tetap Bisa Kirim)"
                )
            } ?: ExifInspectionResult(false, null, null, null, "⚠️ Tanpa Lokasi (Tetap Bisa Kirim)")
        } catch (e: Exception) {
            ExifInspectionResult(false, null, null, null, "⚠️ Tanpa Lokasi (Tetap Bisa Kirim)")
        }
    }
}
