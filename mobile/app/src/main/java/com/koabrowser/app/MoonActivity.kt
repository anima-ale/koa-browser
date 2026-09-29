package com.koabrowser.app

import android.os.Bundle
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

// ZEN Moon in bundle: moon.html dagli asset, con accesso ai CDN.
class MoonActivity : AppCompatActivity() {
    private var wv: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_moon)
        val w = findViewById<WebView>(R.id.moonView)
        wv = w
        try {
            w.settings.javaScriptEnabled = true
            w.settings.domStorageEnabled = true
            w.settings.databaseEnabled = true
            w.settings.mediaPlaybackRequiresUserGesture = false
            w.settings.loadWithOverviewMode = true
            w.settings.useWideViewPort = true
            // moon.html pesca i pesi dai CDN anche partendo da file://.
            w.settings.allowFileAccess = true
            w.settings.allowUniversalAccessFromFileURLs = true
        } catch (e: Exception) {
        }
        w.webViewClient = android.webkit.WebViewClient()
        w.loadUrl("file:///android_asset/moon.html")
    }

    override fun onResume() {
        super.onResume()
        wv?.onResume()
    }

    override fun onPause() {
        wv?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        try {
            wv?.destroy()
        } catch (e: Exception) {
        }
        wv = null
        super.onDestroy()
    }
}
