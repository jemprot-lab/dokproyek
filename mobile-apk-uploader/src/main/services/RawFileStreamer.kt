package com.kontraktor.dokproyek.uploader.services

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import com.kontraktor.dokproyek.uploader.ui.components.ExifBadge
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object RawFileStreamer {
    // URL Default Deployment Google Apps Script (/exec)
    const val DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwLnNIv3_3vR-1vq0qejIcUlKcEF7xVKW9prFE7_4fyCJd29vyLNS1X8UfqkFd7nCtm/exec"
    private const val PREFS_NAME = "dokproyek_prefs"
    private const val KEY_GAS_URL = "gas_api_url"

    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    fun getGasUrl(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_GAS_URL, null)?.trim()
        return if (!saved.isNullOrEmpty()) saved else DEFAULT_GAS_URL
    }

    fun saveGasUrl(context: Context, url: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val trimmed = url.trim()
        if (trimmed.isEmpty()) {
            prefs.edit().remove(KEY_GAS_URL).apply()
        } else {
            prefs.edit().putString(KEY_GAS_URL, trimmed).apply()
        }
    }

    fun getFileNameAndSize(context: Context, uri: Uri): Pair<String, Long> {
        var name = "IMG_${System.currentTimeMillis()}.jpg"
        var size = 0L
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst()) {
                if (nameIdx >= 0) name = cursor.getString(nameIdx) ?: name
                if (sizeIdx >= 0) size = cursor.getLong(sizeIdx)
            }
        }
        return Pair(name, size)
    }

    fun uploadSinglePhoto(
        context: Context,
        authToken: String,
        projectName: String,
        subFolderName: String,
        uri: Uri
    ): JSONObject {
        val originalUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.setRequireOriginal(uri)
        } else {
            uri
        }

        val (fileName, fileSize) = getFileNameAndSize(context, uri)
        val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
        val exif = ExifBadge.inspect(context, uri)

        val rawBytes = context.contentResolver.openInputStream(originalUri)?.use { it.readBytes() }
            ?: throw IllegalStateException("Gagal membaca file foto asli.")
        val base64Data = Base64.encodeToString(rawBytes, Base64.NO_WRAP)

        val exifJson = JSONObject().apply {
            put("hasGps", exif.hasGps)
            if (exif.lat != null) put("lat", exif.lat)
            if (exif.lng != null) put("lng", exif.lng)
            put("dateTimeOriginal", exif.dateTimeOriginal ?: "")
        }

        val payload = JSONObject().apply {
            put("action", "UPLOAD_PHOTO_RAW")
            put("authToken", authToken)
            put("projectName", projectName)
            put("subFolderName", subFolderName)
            put("fileName", fileName)
            put("fileSize", if (fileSize > 0) fileSize else rawBytes.size.toLong())
            put("mimeType", mimeType)
            put("exifSummary", exifJson)
            put("base64Data", base64Data)
        }

        val body = payload.toString().toRequestBody("text/plain;charset=utf-8".toMediaType())
        val request = Request.Builder().url(getGasUrl(context)).post(body).build()

        httpClient.newCall(request).execute().use { response ->
            val respText = response.body?.string() ?: "{}"
            return JSONObject(respText)
        }
    }
}
