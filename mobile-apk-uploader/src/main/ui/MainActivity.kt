package com.kontraktor.dokproyek.uploader.ui

import android.Manifest
import android.app.DatePickerDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.kontraktor.dokproyek.uploader.services.RawFileStreamer
import com.kontraktor.dokproyek.uploader.services.UploadForegroundService
import com.kontraktor.dokproyek.uploader.ui.components.ExifBadge
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class MainActivity : AppCompatActivity() {

    private val selectedUris = arrayListOf<Uri>()
    private val allActiveProjects = mutableListOf<String>()
    private val projectSuggestions = mutableListOf<String>()
    private lateinit var projectAdapter: ArrayAdapter<String>
    private lateinit var authToken: String
    private var username: String = ""

    private lateinit var actvProject: AutoCompleteTextView
    private lateinit var btnCreateProject: Button
    private lateinit var etDate: EditText
    private lateinit var etNote: EditText
    private lateinit var tvPathBanner: TextView
    private lateinit var btnPickGallery: Button
    private lateinit var tvPhotoSummary: TextView
    private lateinit var previewContainer: LinearLayout
    private lateinit var uploadStatusRow: LinearLayout
    private lateinit var spinnerUpload: ProgressBar
    private lateinit var progressUpload: ProgressBar
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

    // Cara A: Tambah foto ke daftar yang sudah ada (anti-dobel)
    private val galleryLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        hideKeyboardAndClearFocus()
        if (uris.isNotEmpty()) {
            val existing = selectedUris.map { it.toString() }.toHashSet()
            for (u in uris) {
                if (!existing.contains(u.toString())) {
                    selectedUris.add(u)
                    existing.add(u.toString())
                }
            }
            refreshSelectedPhotosUi()
        }
    }

    private val uploadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                UploadForegroundService.ACTION_PROGRESS -> {
                    val msg = intent.getStringExtra("message") ?: ""
                    val current = intent.getIntExtra("current", 0)
                    val total = intent.getIntExtra("total", 1).coerceAtLeast(1)
                    val isDone = intent.getBooleanExtra("isDone", false)
                    val hasErr = intent.getBooleanExtra("hasNetworkError", false)

                    progressUpload.visibility = if (isDone) View.GONE else View.VISIBLE
                    progressUpload.isIndeterminate = !isDone

                    uploadStatusRow.visibility = View.VISIBLE
                    spinnerUpload.visibility = if (isDone) View.GONE else View.VISIBLE
                    tvUploadStatus.text = msg
                    uploadStatusRow.background = roundedBg(
                        if (hasErr) "#FEF3C7" else if (isDone) "#DCFCE7" else "#EFF6FF",
                        12f
                    )
                    btnRetryBox.visibility = if (hasErr) View.VISIBLE else View.GONE

                    if (isDone) {
                        btnUpload.isEnabled = true
                        if (!hasErr) {
                            showCompletionDialogAndReset(msg)
                        }
                    }
                }
                UploadForegroundService.ACTION_QUOTA_BLOCKED -> {
                    val msg = intent.getStringExtra("message") ?: "🚫 Penyimpanan kantor sudah penuh."
                    progressUpload.visibility = View.GONE
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
        username = prefs.getString(LoginActivity.KEY_USERNAME, "") ?: ""
        if (authToken.isEmpty()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        buildSingleScreenUi()
        checkAndShowFriendlyPermissionIntro()
        loadActiveProjectsOnce()
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

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun roundedBg(fillHex: String, radiusDp: Float, strokeHex: String? = null, strokeDp: Int = 0): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radiusDp * resources.displayMetrics.density
            setColor(Color.parseColor(fillHex))
            if (strokeHex != null && strokeDp > 0) {
                setStroke(dp(strokeDp), Color.parseColor(strokeHex))
            }
        }
    }

    private fun makeFieldLabel(label: String): TextView {
        return TextView(this).apply {
            text = label
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#475569"))
            setPadding(dp(2), dp(10), 0, dp(4))
        }
    }

    private fun getTodayWibString(): String {
        val sdf = SimpleDateFormat("dd-MM-yyyy", Locale("id", "ID"))
        sdf.timeZone = TimeZone.getTimeZone("Asia/Jakarta")
        return sdf.format(Calendar.getInstance(TimeZone.getTimeZone("Asia/Jakarta")).time)
    }

    private fun hideKeyboardAndClearFocus() {
        actvProject.clearFocus()
        etNote.clearFocus()
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        val target = currentFocus ?: window.decorView
        imm?.hideSoftInputFromWindow(target.windowToken, 0)
    }

    private fun buildSingleScreenUi() {
        val shell = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#F1F5F9"))
            isFocusableInTouchMode = true
        }

        // Top App Bar Navy seragam dengan Web App
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(dp(16), dp(12), dp(16), dp(12))
            elevation = dp(4).toFloat()
        }
        val tvTitle = TextView(this).apply {
            text = "📸 DokProyek"
            textSize = 18f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val tvUserPill = TextView(this).apply {
            text = if (username.isNotEmpty()) "👷 $username" else "👷 Lapangan"
            textSize = 12f
            setTextColor(Color.parseColor("#FDE68A"))
            background = roundedBg("#1E293B", 20f)
            setPadding(dp(10), dp(4), dp(10), dp(4))
        }
        topBar.addView(tvTitle)
        topBar.addView(tvUserPill)

        val scroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            setBackgroundColor(Color.parseColor("#F1F5F9"))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(16))
        }

        tvStorageBanner = TextView(this).apply {
            visibility = View.GONE
            textSize = 13f
            setPadding(dp(12), dp(10), dp(12), dp(10))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, dp(10))
            layoutParams = lp
        }

        // Kartu Form Input Modern (tanpa kaku)
        val formCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg("#FFFFFF", 16f, "#E2E8F0", 1)
            elevation = dp(2).toFloat()
            setPadding(dp(16), dp(10), dp(16), dp(16))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, dp(12))
            layoutParams = lp
        }

        actvProject = AutoCompleteTextView(this).apply {
            hint = "Ketik / Pilih Nama Proyek"
            textSize = 15f
            setTextColor(Color.parseColor("#0F172A"))
            setHintTextColor(Color.parseColor("#94A3B8"))
            background = roundedBg("#F8FAFC", 12f, "#CBD5E1", 1)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            minHeight = dp(48)
            threshold = 0
            setDropDownBackgroundDrawable(roundedBg("#FFFFFF", 14f, "#CBD5E1", 1))
            setOnClickListener {
                if (projectSuggestions.isNotEmpty()) showDropDown()
            }
            setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus && projectSuggestions.isNotEmpty()) showDropDown()
            }
        }
        projectAdapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, projectSuggestions)
        actvProject.setAdapter(projectAdapter)

        btnCreateProject = Button(this).apply {
            visibility = View.GONE
            background = roundedBg("#E2E8F0", 12f)
            setTextColor(Color.parseColor("#0F172A"))
            textSize = 13f
            isAllCaps = false
            minHeight = dp(44)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, dp(8), 0, 0)
            layoutParams = lp
        }

        actvProject.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val q = s?.toString()?.trim() ?: ""
                filterProjectsLocally(q)
                updatePathBanner()
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        btnCreateProject.setOnClickListener {
            btnCreateProject.visibility = View.GONE
            updatePathBanner()
        }

        etDate = EditText(this).apply {
            setText(getTodayWibString())
            isFocusable = false
            textSize = 15f
            setTextColor(Color.parseColor("#0F172A"))
            background = roundedBg("#F8FAFC", 12f, "#CBD5E1", 1)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            minHeight = dp(48)
            hint = "Tanggal Foto"
            setOnClickListener {
                hideKeyboardAndClearFocus()
                openDatePicker()
            }
        }

        etNote = EditText(this).apply {
            hint = "Contoh: progress 10%, pasang atap"
            textSize = 15f
            setTextColor(Color.parseColor("#0F172A"))
            setHintTextColor(Color.parseColor("#94A3B8"))
            background = roundedBg("#F8FAFC", 12f, "#CBD5E1", 1)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            minHeight = dp(48)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { updatePathBanner() }
                override fun afterTextChanged(s: Editable?) {}
            })
        }

        tvPathBanner = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.parseColor("#92400E"))
            background = roundedBg("#FEF3C7", 12f, "#FDE68A", 1)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, dp(12), 0, 0)
            layoutParams = lp
        }

        formCard.addView(makeFieldLabel("🏗️ Nama Proyek"))
        formCard.addView(actvProject)
        formCard.addView(btnCreateProject)
        formCard.addView(makeFieldLabel("📅 Tanggal Foto"))
        formCard.addView(etDate)
        formCard.addView(makeFieldLabel("📝 Keterangan Progres"))
        formCard.addView(etNote)
        formCard.addView(tvPathBanner)

        btnPickGallery = Button(this).apply {
            text = "🖼️ PILIH FOTO DARI GALERI"
            textSize = 15f
            setTypeface(null, Typeface.BOLD)
            isAllCaps = false
            minHeight = dp(52)
            background = roundedBg("#0F172A", 14f)
            setTextColor(Color.WHITE)
            setOnClickListener {
                hideKeyboardAndClearFocus()
                galleryLauncher.launch("image/*")
            }
        }

        tvPhotoSummary = TextView(this).apply {
            text = "Belum ada foto dipilih."
            textSize = 13f
            setTextColor(Color.parseColor("#475569"))
            setPadding(dp(4), dp(12), dp(4), dp(8))
        }

        previewContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, dp(8))
        }

        btnUpload = Button(this).apply {
            text = "🚀 KIRIM 0 FOTO"
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            isAllCaps = false
            minHeight = dp(54)
            background = roundedBg("#F59E0B", 14f)
            setTextColor(Color.parseColor("#0F172A"))
            setOnClickListener {
                hideKeyboardAndClearFocus()
                startUploadService()
            }
        }

        spinnerUpload = ProgressBar(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(38), dp(38)).apply {
                setMargins(0, 0, dp(12), 0)
            }
            indeterminateTintList = ColorStateList.valueOf(Color.parseColor("#F59E0B"))
        }

        tvUploadStatus = TextView(this).apply {
            textSize = 13f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#0F172A"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        uploadStatusRow = LinearLayout(this).apply {
            visibility = View.GONE
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundedBg("#EFF6FF", 12f)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, dp(8))
            layoutParams = lp
            addView(spinnerUpload)
            addView(tvUploadStatus)
        }

        progressUpload = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            visibility = View.GONE
            isIndeterminate = true
            indeterminateTintList = ColorStateList.valueOf(Color.parseColor("#F59E0B"))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(8))
            lp.setMargins(0, 0, 0, dp(10))
            layoutParams = lp
        }

        btnRetryBox = Button(this).apply {
            visibility = View.GONE
            text = "🔄 KIRIM ULANG"
            isAllCaps = false
            minHeight = dp(46)
            background = roundedBg("#F97316", 12f)
            setTextColor(Color.WHITE)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, dp(8))
            layoutParams = lp
            setOnClickListener { startUploadService() }
        }

        root.addView(tvStorageBanner)
        root.addView(formCard)
        root.addView(btnPickGallery)
        root.addView(tvPhotoSummary)
        root.addView(previewContainer)

        scroll.addView(root)

        val bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            elevation = dp(8).toFloat()
            setPadding(dp(16), dp(12), dp(16), dp(14))
            addView(uploadStatusRow)
            addView(progressUpload)
            addView(btnRetryBox)
            addView(btnUpload)
        }

        shell.addView(topBar)
        shell.addView(scroll)
        shell.addView(bottomBar)
        ViewCompat.setOnApplyWindowInsetsListener(shell) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(shell)
        updatePathBanner()
    }

    private fun openDatePicker() {
        val idLocale = Locale("id", "ID")
        val config = Configuration(resources.configuration).apply { setLocale(idLocale) }
        val idContext = createConfigurationContext(config)
        val cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Jakarta"))
        DatePickerDialog(idContext, { _, y, m, d ->
            val formatted = String.format(idLocale, "%02d-%02d-%04d", d, m + 1, y)
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

    private fun refreshSelectedPhotosUi() {
        previewContainer.removeAllViews()

        if (selectedUris.isEmpty()) {
            tvPhotoSummary.text = "Belum ada foto dipilih."
            btnPickGallery.text = "🖼️ PILIH FOTO DARI GALERI"
            btnUpload.text = "🚀 KIRIM 0 FOTO"
            return
        }

        var withGps = 0
        var noGps = 0

        for (idx in selectedUris.indices) {
            val uri = selectedUris[idx]
            val info = ExifBadge.inspect(this, uri)
            if (info.hasGps) withGps++ else noGps++

            val (fileName, _) = RawFileStreamer.getFileNameAndSize(this, uri)
            val rowCard = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = roundedBg("#FFFFFF", 14f, "#E2E8F0", 1)
                elevation = dp(1).toFloat()
                setPadding(dp(10), dp(10), dp(10), dp(10))
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.setMargins(0, 0, 0, dp(8))
                layoutParams = lp
            }

            val thumb = ImageView(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(54), dp(54))
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = roundedBg("#E2E8F0", 10f)
                clipToOutline = true
                setImageURI(uri)
            }

            val textCol = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                setPadding(dp(12), 0, dp(8), 0)
            }

            val tvName = TextView(this).apply {
                text = fileName
                textSize = 13f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.parseColor("#0F172A"))
                maxLines = 1
            }

            val tvBadge = TextView(this).apply {
                text = info.badgeText
                textSize = 11f
                setTextColor(
                    if (info.hasGps) Color.parseColor("#047857") else Color.parseColor("#C2410C")
                )
            }

            val btnRemove = Button(this).apply {
                text = "✕"
                textSize = 14f
                background = roundedBg("#FEE2E2", 10f)
                setTextColor(Color.parseColor("#DC2626"))
                layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
                setPadding(0, 0, 0, 0)
                setOnClickListener {
                    selectedUris.removeAt(idx)
                    refreshSelectedPhotosUi()
                }
            }

            textCol.addView(tvName)
            textCol.addView(tvBadge)
            rowCard.addView(thumb)
            rowCard.addView(textCol)
            rowCard.addView(btnRemove)
            previewContainer.addView(rowCard)
        }

        tvPhotoSummary.text = "Dipilih ${selectedUris.size} foto:\n📍 Lokasi Ada: $withGps foto\n⚠️ Tanpa Lokasi (Tetap Bisa Kirim): $noGps foto"
        btnPickGallery.text = "➕ TAMBAH FOTO DARI GALERI"
        btnUpload.text = "🚀 KIRIM ${selectedUris.size} FOTO"
    }

    private fun showCompletionDialogAndReset(msg: String) {
        AlertDialog.Builder(this)
            .setTitle("✅ Pengiriman Selesai")
            .setMessage(msg)
            .setCancelable(false)
            .setPositiveButton("OK") { _, _ ->
                actvProject.setText("")
                etDate.setText(getTodayWibString())
                etNote.setText("")
                selectedUris.clear()
                refreshSelectedPhotosUi()
                updatePathBanner()
                uploadStatusRow.visibility = View.GONE
                progressUpload.visibility = View.GONE
                hideKeyboardAndClearFocus()
            }.show()
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
        progressUpload.visibility = View.VISIBLE
        progressUpload.isIndeterminate = true
        uploadStatusRow.visibility = View.VISIBLE
        uploadStatusRow.background = roundedBg("#EFF6FF", 12f)
        spinnerUpload.visibility = View.VISIBLE
        tvUploadStatus.text = "Memulai pengiriman ${uriStrings.size} foto..."

        val svcIntent = Intent(this, UploadForegroundService::class.java).apply {
            putStringArrayListExtra(UploadForegroundService.EXTRA_URIS, uriStrings)
            putExtra(UploadForegroundService.EXTRA_PROJECT, proj)
            putExtra(UploadForegroundService.EXTRA_SUBFOLDER, subFolder)
            putExtra(UploadForegroundService.EXTRA_TOKEN, authToken)
        }
        ContextCompat.startForegroundService(this, svcIntent)
    }

    private fun loadActiveProjectsOnce() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = RawFileStreamer.getGasUrl(this@MainActivity)
                val names = mutableListOf<String>()

                val payloadLight = JSONObject().apply {
                    put("action", "LIST_PROJECT_NAMES")
                    put("authToken", authToken)
                }
                val reqLight = Request.Builder()
                    .url(url)
                    .post(payloadLight.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                    .build()
                val respLight = RawFileStreamer.httpClient.newCall(reqLight).execute().body?.string() ?: "{}"
                val jsonLight = JSONObject(respLight)

                if (jsonLight.optString("status") == "success" && jsonLight.has("projectNames")) {
                    val arr = jsonLight.getJSONArray("projectNames")
                    for (i in 0 until arr.length()) {
                        names.add(arr.getString(i))
                    }
                } else {
                    // Fallback jika backend GAS belum update ke LIST_PROJECT_NAMES
                    val payloadFallback = JSONObject().apply {
                        put("action", "SEARCH_PROJECTS")
                        put("authToken", authToken)
                        put("query", "")
                        put("includeArchived", false)
                        put("limit", 200)
                    }
                    val reqFallback = Request.Builder()
                        .url(url)
                        .post(payloadFallback.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                        .build()
                    val respFallback = RawFileStreamer.httpClient.newCall(reqFallback).execute().body?.string() ?: "{}"
                    val jsonFallback = JSONObject(respFallback)
                    if (jsonFallback.optString("status") == "success" && jsonFallback.has("projects")) {
                        val arr = jsonFallback.getJSONArray("projects")
                        for (i in 0 until arr.length()) {
                            names.add(arr.getJSONObject(i).getString("projectName"))
                        }
                    }
                }

                withContext(Dispatchers.Main) {
                    allActiveProjects.clear()
                    allActiveProjects.addAll(names.distinct())
                    filterProjectsLocally(actvProject.text.toString().trim())
                }
            } catch (_: Exception) {}
        }
    }

    private fun filterProjectsLocally(query: String) {
        val matches = if (query.isEmpty()) {
            allActiveProjects.toList()
        } else {
            allActiveProjects.filter { it.contains(query, ignoreCase = true) }
        }
        projectSuggestions.clear()
        projectSuggestions.addAll(matches)

        // Baris dropdown lebih ringkas (tidak terlalu renggang) & maksimal 5 terlihat (scrollable)
        projectAdapter = object : ArrayAdapter<String>(this, android.R.layout.simple_dropdown_item_1line, ArrayList(matches)) {
            override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
                val tv = (convertView as? TextView) ?: TextView(context).apply {
                    textSize = 15f
                    setTextColor(Color.parseColor("#0F172A"))
                    setPadding(dp(16), dp(11), dp(16), dp(11))
                }
                tv.text = getItem(position) ?: ""
                return tv
            }
        }
        actvProject.setAdapter(projectAdapter)
        actvProject.dropDownHeight = if (matches.size > 5) dp(235) else ViewGroup.LayoutParams.WRAP_CONTENT
        if (actvProject.hasFocus() && matches.isNotEmpty()) {
            actvProject.showDropDown()
        }

        val exactMatch = allActiveProjects.any { it.equals(query, ignoreCase = true) }
        if (query.isNotEmpty() && !exactMatch) {
            btnCreateProject.visibility = View.VISIBLE
            btnCreateProject.text = "[+ Buat Proyek Baru: \"$query\"]"
        } else {
            btnCreateProject.visibility = View.GONE
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
                    .url(RawFileStreamer.getGasUrl(this@MainActivity))
                    .post(payload.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                    .build()
                val respStr = RawFileStreamer.httpClient.newCall(req).execute().body?.string() ?: "{}"
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
