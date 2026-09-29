package com.koabrowser.app

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

// Fabbrica WebView KOA: impostazioni, client, download, supervisor.
object KoaWebView {
    const val DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

    class Hooks(
        var onProgress: ((Int) -> Unit)? = null,
        var onTitle: ((String?) -> Unit)? = null,
        var onUrl: ((String?) -> Unit)? = null,
        var onPageDone: (() -> Unit)? = null
    )

    fun create(ctx: Context, hooks: Hooks = Hooks()): WebView {
        AdBlock.load(ctx)
        val wv = WebView(ctx)
        val s = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        if (Prefs.isDesktop(ctx)) {
            s.userAgentString = DESKTOP_UA
        }
        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url.toString()
                if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("file://")) return false
                try {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
                } catch (e: Exception) {
                    Toast.makeText(ctx, "Link non apribile", Toast.LENGTH_SHORT).show()
                }
                return true
            }

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (request.isForMainFrame || !Prefs.isSupervisor(ctx)) return null
                val hit = AdBlock.blockedHost(request.url.toString())
                if (hit != null) {
                    Prefs.addBlocked(ctx)
                    return AdBlock.empty()
                }
                return null
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                hooks.onUrl?.invoke(url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                hooks.onUrl?.invoke(view.url)
                hooks.onTitle?.invoke(view.title)
                hooks.onPageDone?.invoke()
            }
        }
        wv.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, p: Int) {
                hooks.onProgress?.invoke(p)
            }

            override fun onReceivedTitle(view: WebView, title: String?) {
                hooks.onTitle?.invoke(title)
            }
        }
        wv.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mime, _ ->
            try {
                val name = URLUtil.guessFileName(url, contentDisposition, mime)
                val req = DownloadManager.Request(Uri.parse(url))
                    .setTitle(name)
                    .setDescription("KOA Browser")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)
                try {
                    val cookie = CookieManager.getInstance().getCookie(url)
                    if (!cookie.isNullOrEmpty()) req.addRequestHeader("Cookie", cookie)
                } catch (e: Exception) {
                }
                req.addRequestHeader("User-Agent", userAgent)
                val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                dm.enqueue(req)
                Toast.makeText(ctx, "Download avviato: $name", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(ctx, "Download fallito", Toast.LENGTH_SHORT).show()
            }
        })
        return wv
    }

    fun applyDesktopMode(wv: WebView, desktop: Boolean) {
        try {
            wv.settings.userAgentString = if (desktop) DESKTOP_UA else null
            // null ripristina lo UA di default del WebView.
            wv.reload()
        } catch (e: Exception) {
        }
    }
}
