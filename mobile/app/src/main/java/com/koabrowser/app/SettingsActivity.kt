package com.koabrowser.app

import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.Button
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

// Impostazioni KOA Mobile: predefinito, motore, supervisor, desktop, update, pulizia.
class SettingsActivity : AppCompatActivity() {

    private lateinit var defStatus: TextView
    private lateinit var defBtn: Button
    private lateinit var updateStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        findViewById<TextView>(R.id.setVersion).text =
            "v" + packageManager.getPackageInfo(packageName, 0).versionName

        defStatus = findViewById(R.id.defStatus)
        defBtn = findViewById(R.id.defBtn)
        updateStatus = findViewById(R.id.updateStatus)

        defBtn.setOnClickListener {
            defBtn.isEnabled = false
            DefaultBrowser.request(this) { granted ->
                refreshDefault(granted)
                defBtn.isEnabled = true
                if (!granted && !DefaultBrowser.isDefault(this)) {
                    Toast.makeText(this, "Completa la scelta nelle Impostazioni di sistema", Toast.LENGTH_LONG).show()
                }
            }
        }

        val engines = linkedMapOf(
            "Google" to "https://www.google.com/search?q=%s",
            "DuckDuckGo" to "https://duckduckgo.com/?q=%s",
            "Bing" to "https://www.bing.com/search?q=%s",
            "Ecosia" to "https://www.ecosia.org/search?q=%s"
        )
        val engineBtn = findViewById<Button>(R.id.engineBtn)
        fun paintEngine() {
            val cur = Prefs.getEngine(this)
            engineBtn.text = engines.entries.firstOrNull { it.value == cur }?.key ?: "Google"
        }
        paintEngine()
        engineBtn.setOnClickListener {
            val names = engines.keys.toTypedArray()
            AlertDialog.Builder(this)
                .setTitle("Motore di ricerca")
                .setItems(names) { _, which ->
                    Prefs.setEngine(this, engines[names[which]] ?: engines["Google"]!!)
                    paintEngine()
                }
                .show()
        }

        val sup = findViewById<Switch>(R.id.supSwitch)
        sup.isChecked = Prefs.isSupervisor(this)
        sup.setOnCheckedChangeListener { _, v -> Prefs.setSupervisor(this, v) }

        val desk = findViewById<Switch>(R.id.desktopSwitch)
        desk.isChecked = Prefs.isDesktop(this)
        desk.setOnCheckedChangeListener { _, v ->
            Prefs.setDesktop(this, v)
            Toast.makeText(this, "Si applica alle nuove pagine", Toast.LENGTH_SHORT).show()
        }

        findViewById<Button>(R.id.updateBtn).setOnClickListener {
            updateStatus.text = "Controllo…"
            UpdateChecker.check(this, false) { msg -> updateStatus.text = msg }
        }

        findViewById<Button>(R.id.clearBtn).setOnClickListener {
            try {
                WebView(this).clearCache(true)
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
                WebStorage.getInstance().deleteAllData()
                Toast.makeText(this, "Dati cancellati", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshDefault(null)
        findViewById<TextView>(R.id.supCount).text =
            Prefs.blocked(this).toString() + " minacce bloccate"
    }

    private fun refreshDefault(granted: Boolean?) {
        val d = granted ?: DefaultBrowser.isDefault(this)
        defStatus.text = if (d) getString(R.string.is_default) else getString(R.string.not_default)
        defBtn.isEnabled = !d
    }
}
