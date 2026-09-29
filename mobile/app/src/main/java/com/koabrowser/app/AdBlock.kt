package com.koabrowser.app

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream

// Supervisor Mobile: blocca pubblicità e tracker per host (lista in assets).
object AdBlock {
    private var hosts: Set<String> = emptySet()
    private var loaded = false

    @Synchronized
    fun load(c: Context) {
        if (loaded) return
        loaded = true
        try {
            val set = HashSet<String>()
            c.assets.open("blocklist.txt").bufferedReader().forEachLine { line ->
                val h = line.trim().lowercase()
                if (h.isNotEmpty() && !h.startsWith("#")) set.add(h)
            }
            hosts = set
        } catch (e: Exception) {
            hosts = emptySet()
        }
    }

    fun blockedHost(url: String?): String? {
        if (url == null || hosts.isEmpty()) return null
        val host = try {
            (Uri.parse(url).host ?: return null).lowercase()
        } catch (e: Exception) {
            return null
        }
        for (h in hosts) {
            if (host == h || host.endsWith(".$h")) return h
        }
        return null
    }

    // Risposta vuota per le richieste bloccate (pagina resta intatta).
    fun empty(): WebResourceResponse {
        return WebResourceResponse(
            "text/plain", "utf-8", 204, "No Content",
            mapOf("Access-Control-Allow-Origin" to "*"),
            ByteArrayInputStream(ByteArray(0))
        )
    }

    @Suppress("unused")
    fun count(c: Context): Int = Prefs.blocked(c)
}
