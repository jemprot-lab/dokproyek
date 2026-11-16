package com.kontraktor.dokproyek.uploader.ui

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.kontraktor.dokproyek.uploader.services.RawFileStreamer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class LoginActivity : AppCompatActivity() {

    companion object {
        const val PREFS_NAME = "dokproyek_prefs"
        const val KEY_AUTH_TOKEN = "auth_token"
        const val KEY_USERNAME = "username"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedToken = prefs.getString(KEY_AUTH_TOKEN, null)
        if (!savedToken.isNullOrEmpty()) {
            goToMain()
            return
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(48, 48, 48, 48)
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            setPadding(48, 56, 48, 56)
        }

        val title = TextView(this).apply {
            text = "🏗️ Masuk Aplikasi Proyek"
            textSize = 22f
            setTextColor(Color.parseColor("#0F172A"))
            gravity = Gravity.CENTER
        }

        val subtitle = TextView(this).apply {
            text = "Cukup masuk 1 kali saja.\nMasukkan nama akun dan PIN 6 angka dari Admin."
            textSize = 14f
            setTextColor(Color.parseColor("#64748B"))
            gravity = Gravity.CENTER
            setPadding(0, 12, 0, 32)
        }

        val etUsername = EditText(this).apply {
            hint = "Nama Akun (contoh: mandor_agus)"
            textSize = 16f
            minHeight = 140
        }

        val etPin = EditText(this).apply {
            hint = "PIN 6 Angka"
            textSize = 20f
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            filters = arrayOf(InputFilter.LengthFilter(6))
            minHeight = 140
        }

        val tvError = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#EF4444"))
            visibility = View.GONE
            setPadding(0, 12, 0, 12)
        }

        val btnLogin = Button(this).apply {
            text = "MASUK SEKARANG"
            textSize = 16f
            setBackgroundColor(Color.parseColor("#F59E0B"))
            setTextColor(Color.parseColor("#0F172A"))
            minHeight = 148
        }

        btnLogin.setOnClickListener {
            val uname = etUsername.text.toString().trim()
            val pin = etPin.text.toString().trim()
            if (uname.isEmpty() || pin.length != 6) {
                tvError.text = "Isi nama akun dan PIN 6 angka dengan benar."
                tvError.visibility = View.VISIBLE
                return@setOnClickListener
            }

            btnLogin.isEnabled = false
            btnLogin.text = "⏳ Sedang memeriksa..."
            tvError.visibility = View.GONE

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() }
                        ?: "android-${Build.MODEL}-${Build.ID}"
                    val payload = JSONObject().apply {
                        put("action", "LOGIN")
                        put("username", uname)
                        put("password", pin)
                        put("deviceId", deviceId)
                    }
                    val req = Request.Builder()
                        .url(RawFileStreamer.getGasUrl(this@LoginActivity))
                        .post(payload.toString().toRequestBody("text/plain;charset=utf-8".toMediaType()))
                        .build()

                    val respStr = RawFileStreamer.httpClient.newCall(req).execute().body?.string() ?: "{}"
                    val json = JSONObject(respStr)

                    withContext(Dispatchers.Main) {
                        if (json.optString("status") == "success") {
                            val userObj = json.getJSONObject("user")
                            prefs.edit()
                                .putString(KEY_AUTH_TOKEN, userObj.getString("authToken"))
                                .putString(KEY_USERNAME, userObj.getString("username"))
                                .apply()
                            goToMain()
                        } else {
                            tvError.text = json.optString("message", "Nama akun atau PIN salah.")
                            tvError.visibility = View.VISIBLE
                            btnLogin.isEnabled = true
                            btnLogin.text = "MASUK SEKARANG"
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        tvError.text = "Sinyal lemah atau tidak ada internet. Coba lagi."
                        tvError.visibility = View.VISIBLE
                        btnLogin.isEnabled = true
                        btnLogin.text = "MASUK SEKARANG"
                    }
                }
            }
        }

        card.addView(title)
        card.addView(subtitle)
        card.addView(etUsername)
        card.addView(etPin)
        card.addView(tvError)
        card.addView(btnLogin)
        root.addView(card)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(48 + bars.left, 48 + bars.top, 48 + bars.right, 48 + bars.bottom)
            insets
        }
        setContentView(root)
    }

    private fun goToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
