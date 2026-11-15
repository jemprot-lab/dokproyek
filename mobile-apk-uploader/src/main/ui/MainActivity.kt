package com.kontraktor.dokproyek.uploader.ui

import android.Manifest
import android.app.DatePickerDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.kontraktor.dokproyek.uploader.services.RawFileStreamer
import com.kontraktor.dokproyek.uploader.services.UploadForegroundService
import com.kontraktor.dokproyek.uploader.ui.components.ExifBadge
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private val selectedUris = arrayListOf<Uri>()
    private val projectSuggestions = mutableListOf<String>()
    private lateinit var projectAdapter: ArrayAdapter<String>
    private lateinit var authToken: String

    private lateinit var actvProject: AutoCompleteTextView
    private lateinit var btnCreateProject: Button
    private lateinit var etDate: EditText
    private lateinit var etNote: EditText
    private lateinit var tvPathBanner: TextView
    private lateinit var tvPhotoSummary: TextView
    private lateinit var tvUploadStatus: TextView
    private lateinit var tvStorageBanner: TextView
    private lateinit var btnRetryBox: Button
    private lateinit var btnUpload: Button

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        if (results.values.any { !it }) {
            showPermissionSettingsDialog()
        }
    }

    private val galleryLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isNotEmpty()) {
            selectedUris.clear()
            selectedUris.addAll(uris)
            inspectSelectedPhotos()
        }
    }

    private val uploadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                UploadForegroundService.ACTION_PROGRESS -> {
                    val msg = intent.getStringExtra("message") ?: ""
                    val isDone = intent.getBooleanExtra("isDone", false)
                    val hasErr = intent.getBooleanExtra("hasNetworkError", false)
                    tvUploadStatus.visibility = View.VISIBLE
                    tvUploadStatus.text = msg
                    tvUploadStatus.setBackgroundColor(
                        if (hasErr) Color.parseColor("#FEF3C7") else Color.parseColor("#DCFCE7")
                    )
                    btnRetryBox.visibility = if (hasErr) View.VISIBLE else View.GONE
                    if (isDone) btnUpload.isEnabled = true
                }
                UploadForegroundService.ACTION_QUOTA_BLOCKED -> {
                    val msg = intent.getStringExtra("message") ?: "🚫 Penyimpanan kantor sudah penuh."
                    tvStorageBanner.visibility = View.VISIBLE
                    tvStorageBanner.text = msg
                    tvStorageBanner.setBackgroundColor(Color.parseColor("#FEE2E2"))
                    tvStorageBanner.setTextColor(Color.parseColor("#991B1B"))
                    btnUpload.isEnabled = false
                    btnUpload.text = "🔒 PENYIMPANAN PENUH"
                }
                UploadForegroundService.ACTION_REVOKED -> {
                    getSharedPreferences(LoginActivity.PREFS_NAME, Context.MODE_PRIVATE)
                        .edit().clear().apply()
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("🔒 Akses Ditutup")
                        .setMessage("Akses HP ini sudah ditutup Admin.")
                        .setCancelable(false)
                        .setPositiveButton("OK") { _, _ ->
                            startActivity(Intent(this@MainActivity, LoginActivity::class.java))
                            finish()
                        }.show()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences(LoginActivity.PREFS_NAME, Context.MODE_PRIVATE)
        authToken = prefs.getString(LoginActivity.KEY_AUTH_TOKEN, "") ?: ""
        if (authToken.isEmpty()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        buildSingleScreenUi()
        checkAndShowFriendlyPermissionIntro()
        searchActiveProjects("")
        checkStorageQuotaStatus()
    }

    override fun onStart() {
        super.onStart()
        val filter = IntentFilter().apply {
            addAction(UploadForegroundService.ACTION_PROGRESS)
            addAction(UploadForegroundService.ACTION_REVOKED)
            addAction(UploadForegroundService.ACTION_QUOTA_BLOCKED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(uploadReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(uploadReceiver, filter)
        }
    }

    override fun onStop() {
        super.onStop()
        unregisterReceiver(uploadReceiver)
    }

    private fun buildSingleScreenUi() {
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.parseColor("#F8FAFC")) }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 48, 40, 64)
        }

        val header = TextView(this).apply {
            text = "📸 Kirim Foto Proyek"
            textSize = 22f
            setTextColor(Color.parseColor("#0F172A"))
            setPadding(0, 0, 0, 16)
        }

        tvStorageBanner = TextView(this).apply {
            visibility = View.GONE
            textSize = 13f
            setPadding(24, 20, 24, 20)
        }

        // Input 1: Cari Proyek Aktif
        actvProject = AutoCompleteTextView(this).apply {
            hint = "1. Ketik / Pilih Nama Proyek"
            minHeight = 140
            threshold = 1
        }
        projectAdapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, projectSuggestions)
        actvProject.setAdapter(projectAdapter)

        btnCreateProject = Button(this).apply {
            visibility = View.GONE
            setBackgroundColor(Color.parseColor("#E2E8F0"))
            setTextColor(Color.parseColor("#0F172A"))
            minHeight = 132
        }

        actvProject.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val q = s?.toString()?.trim() ?: ""
                searchActiveProjects(q)
                updatePathBanner()
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        btnCreateProject.setOnClickListener {
            btnCreateProject.visibility = View.GONE
            updatePathBanner()
        }

        // Input 2: Tanggal Indonesia + Keterangan Manual
        val today = SimpleDateFormat("dd-MM-yyyy", Locale.getDefault()).format(Calendar.getInstance().time)
        etDate = EditText(this).apply {
            setText(today)
            isFocusable = false
            minHeight = 140
            hint = "2. Tanggal Foto"
            setOnClickListener { openDatePicker() }
        }

        etNote = EditText(this).apply {
            hint = "3. Keterangan (contoh: progress 10%)"
            minHeight = 140
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { updatePathBanner() }
                override fun afterTextChanged(s: Editable?) {}
            })
        }

        tvPathBanner = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#0F172A"))
            setBackgroundColor(Color.parseColor("#FEF3C7"))
            setPadding(24, 24, 24, 24)
        }

        val btnPickGallery = Button(this).apply {
            text = "🖼️ PILIH FOTO DARI GALERI"
            textSize = 16f
            minHeight = 148
            setBackgroundColor(Color.parseColor("#0F172A"))
            setTextColor(Color.WHITE)
            setOnClickListener { galleryLauncher.launch("image/*") }
        }

        tvPhotoSummary = TextView(this).apply {
            text = "Belum ada foto dipilih."
            textSize = 14f
            setPadding(0, 16, 0, 24)
        }

        btnUpload = Button(this).apply {
            text = "🚀 KIRIM 0 FOTO"
            textSize = 18f
            minHeight = 156
            setBackgroundColor(Color.parseColor("#F59E0B"))
            setTextColor(Color.parseColor("#0F172A"))
            setOnClickListener { startUploadService() }
        }

        tvUploadStatus = TextView(this).apply {
            visibility = View.GONE
            textSize = 14f
            setPadding(24, 24, 24, 24)
        }

        btnRetryBox = Button(this).apply {
            visibility = View.GONE
            text = "🔄 KIRIM ULANG"
            minHeight = 140
            setBackgroundColor(Color.parseColor("#F97316"))
            setTextColor(Color.WHITE)
            setOnClickListener { startUploadService() }
        }

        root.addView(header)
        root.addView(tvStorageBanner)
        root.addView(actvProject)
        root.addView(btnCreateProject)
        root.addView(etDate)
        root.addView(etNote)
        root.addView(tvPathBanner)
        root.addView(btnPickGallery)
        root.addView(tvPhotoSummary)
        root.addView(btnUpload)
        root.addView(tvUploadStatus)
        root.addView(btnRetryBox)

        scroll.addView(root)
        setContentView(scroll)
        updatePathBanner()
    }

    private fun openDatePicker() {
        val cal = Calendar.getInstance()
        DatePickerDialog(this, { _, y, m, d ->
            val formatted = String.format(Locale.getDefault(), "%02d-%02d-%04d", d, m + 1, y)
            etDate.setText(formatted)
            updatePathBanner()
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
    }

    private fun updatePathBanner() {
        val proj = actvProject.text.toString().trim().ifEmpty { "{Nama Proyek}" }
        val date = etDate.text.toString().trim()
        val note = etNote.text.toString().trim()
        val sub = if (note.isEmpty()) date else "$date $note"
        tvPathBanner.text = "📂 Folder Tujuan: $proj > $sub"
    }

    private fun inspectSelectedPhotos() {
        var withGps = 0
        var noGps = 0
        for (uri in selectedUris) {
            val info = ExifBadge.inspect(this, uri)
            if (info.hasGps) withGps++ else noGps++
        }
        tvPhotoSummary.text = "Dipilih ${selectedUris.size} foto:\n📍 Lokasi Ada: $withGps foto\n⚠️ Tanpa Lokasi (Tetap Bisa Kirim): $noGps foto"
        btnUpload.text = "🚀 KIRIM ${selectedUris.size} FOTO"
    }

    private fun startUploadService() {
        val proj = actvProject.text.toString().trim()
        val date = etDate.text.toString().trim()
        val note = etNote.text.toString().trim()
        if (proj.isEmpty() || selectedUris.isEmpty()) {
            AlertDialog.Builder(this)
                .setMessage("Pilih nama proyek dan minimal 1 foto dari Galeri dulu ya.")
                .setPositiveButton("OK", null).show()
            return
        }
        val subFolder = if (note.isEmpty()) date else "$date $note"
        val uriStrings = ArrayList(selectedUris.map { it.toString() })

        btnUpload.isEnabled = false
        btnRetryBox.visibility = View.GONE
        val svcIntent = Intent(this, UploadForegroundService::class.java).apply {
            putStringArrayListExtra(UploadForegroundService.EXTRA_URIS, uriStrings)
            putExtra(UploadForegroundService.EXTRA_PROJECT, proj)
            putExtra(UploadForegroundService.EXTRA_SUBFOLDER, subFolder)
            putExtra(UploadForegroundService.EXTRA_TOKEN, authToken)
        }
        ContextCompat.startForegroundService(this, svcIntent)
    }

    private fun searchActiveProjects(query: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val payload = JSONObject().apply {
                    put("action", "SEARCH_PROJECTS")
                    put("authToken", authToken)
                    put("query", query)
                    put("includeArchived", false)
                    put("limit", 5)
                }
                val req = Request.Builder()
                    .url(RawFileStreamer.GAS_URL)
                    .post(payload.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                    .build()
                val respStr = OkHttpClient().newCall(req).execute().body?.string() ?: "{}"
                val json = JSONObject(respStr)
                if (json.optString("status") == "success") {
                    val arr = json.getJSONArray("projects")
                    val names = mutableListOf<String>()
                    for (i in 0 until arr.length()) {
                        names.add(arr.getJSONObject(i).getString("projectName"))
                    }
                    withContext(Dispatchers.Main) {
                        projectSuggestions.clear()
                        projectSuggestions.addAll(names)
                        projectAdapter.notifyDataSetChanged()
                        val exactMatch = names.any { it.equals(query, ignoreCase = true) }
                        if (query.isNotEmpty() && !exactMatch) {
                            btnCreateProject.visibility = View.VISIBLE
                            btnCreateProject.text = "[+ Buat Proyek Baru: \"$query\"]"
                        } else {
                            btnCreateProject.visibility = View.GONE
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }

    private fun getRequiredPermissions(): Array<String> {
        return when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> arrayOf(
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.ACCESS_MEDIA_LOCATION,
                Manifest.permission.POST_NOTIFICATIONS
            )
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> arrayOf(
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.ACCESS_MEDIA_LOCATION
            )
            else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    private fun checkAndShowFriendlyPermissionIntro() {
        val missing = getRequiredPermissions().filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) return

        AlertDialog.Builder(this)
            .setTitle("Izin Buka Galeri")
            .setMessage("Supaya foto bisa diambil dari Galeri dan dikirim otomatis, sebentar lagi tekan tombol IZINKAN ya.")
            .setCancelable(false)
            .setPositiveButton("Lanjut") { _, _ ->
                permissionLauncher.launch(missing.toTypedArray())
            }.show()
    }

    private fun showPermissionSettingsDialog() {
        AlertDialog.Builder(this)
            .setTitle("Izin Belum Aktif")
            .setMessage("Aplikasi perlu izin Galeri agar bisa mengambil foto. Buka pengaturan HP untuk mengaktifkan?")
            .setPositiveButton("Buka Pengaturan Izin HP") { _, _ ->
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", packageName, null)
                }
                startActivity(intent)
            }
            .setNegativeButton("Tutup", null).show()
    }

    private fun checkStorageQuotaStatus() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val payload = JSONObject().apply {
                    put("action", "GET_STORAGE_STATUS")
                    put("authToken", authToken)
                }
                val req = Request.Builder()
                    .url(RawFileStreamer.GAS_URL)
                    .post(payload.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                    .build()
                val respStr = OkHttpClient().newCall(req).execute().body?.string() ?: "{}"
                val json = JSONObject(respStr)
                if (json.optString("status") == "success" && json.has("storage")) {
                    val st = json.getJSONObject("storage")
                    val allowed = st.optBoolean("allowed", true)
                    val pct = st.optInt("percent", 0)
                    val usedGb = st.optDouble("usedGb", 0.0)
                    val limitGb = st.optDouble("limitGb", 5.0)
                    val msg = st.optString("message", "")

                    withContext(Dispatchers.Main) {
                        if (!allowed || pct >= 100) {
                            tvStorageBanner.visibility = View.VISIBLE
                            tvStorageBanner.text = msg.ifEmpty { "🚫 Penyimpanan kantor sudah penuh (${String.format("%.2f", usedGb)} GB / $limitGb GB). Hubungi Admin." }
                            tvStorageBanner.setBackgroundColor(Color.parseColor("#FEE2E2"))
                            tvStorageBanner.setTextColor(Color.parseColor("#991B1B"))
                            btnUpload.isEnabled = false
                            btnUpload.text = "🔒 PENYIMPANAN PENUH"
                        } else if (pct >= 85) {
                            tvStorageBanner.visibility = View.VISIBLE
                            tvStorageBanner.text = "⚠️ Penyimpanan hampir penuh (${String.format("%.2f", usedGb)} GB / $limitGb GB). Beritahu Admin kantor."
                            tvStorageBanner.setBackgroundColor(Color.parseColor("#FEF3C7"))
                            tvStorageBanner.setTextColor(Color.parseColor("#92400E"))
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }
}
