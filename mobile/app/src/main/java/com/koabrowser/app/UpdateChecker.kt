package com.koabrowser.app

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.appcompat.app.AlertDialog

// Aggiornamenti mobile: cerca release con tag -mobile o APK, scarica e installa.
object UpdateChecker {

    data class Found(val tag: String, val url: String)

    fun check(activity: Activity, silent: Boolean, done: (String) -> Unit) {
        Thread {
            try {
                val current = activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""
                val api = Net.get("https://api.github.com/repos/anima-ale/koa-browser/releases?per_page=20")
                val found = pickMobile(api)
                activity.runOnUiThread {
                    if (found == null) {
                        done("Nessuna release mobile trovata.")
                    } else if (sameOrOlder(found.tag, current)) {
                        done("KOA Mobile è aggiornato ($current).")
                    } else if (silent) {
                        done("Disponibile " + found.tag + " (apri Impostazioni per scaricarla).")
                    } else {
                        askDownload(activity, found, done)
                    }
                }
            } catch (e: Exception) {
                activity.runOnUiThread { done("Rete non disponibile.") }
            }
        }.start()
    }

    // Sceglie la release mobile più recente con allegato APK (prima i tag -mobile).
    private fun pickMobile(api: String): Found? {
        val blocks = api.split("\"tag_name\"")
        var fallback: Found? = null
        for (i in 1 until blocks.size) {
            val seg = blocks[i]
            val tag = Regex("\"\\s*:\\s*\"([^\"]+)\"").find(seg)?.groupValues?.get(1) ?: continue
            val apk = Regex("\"browser_download_url\"\\s*:\\s*\"([^\"]+?\\.apk)\"")
                .find(seg)?.groupValues?.get(1) ?: continue
            if (tag.endsWith("-mobile", true)) return Found(tag, apk)
            if (fallback == null) fallback = Found(tag, apk)
        }
        return fallback
    }

    private fun sameOrOlder(tag: String, current: String): Boolean {
        val t = tag.trimStart('v', 'V').removeSuffix("-mobile")
        val c = current.trimStart('v', 'V')
        return cmpVer(t, c) <= 0
    }

    private fun cmpVer(a: String, b: String): Int {
        val pa = a.split('.').map { it.toIntOrNull() ?: 0 }
        val pb = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return x.compareTo(y)
        }
        return 0
    }

    private fun askDownload(activity: Activity, found: Found, done: (String) -> Unit) {
        AlertDialog.Builder(activity)
            .setTitle("Aggiornamento " + found.tag)
            .setMessage("Scaricare e installare la nuova versione?")
            .setPositiveButton("Scarica e installa") { _, _ ->
                downloadAndInstall(activity, found)
                done("Download avviato: completa l'installazione dal pannello.")
            }
            .setNegativeButton("Più tardi", null)
            .show()
    }

    private fun downloadAndInstall(activity: Activity, found: Found) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!activity.packageManager.canRequestPackageInstalls()) {
                    activity.startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.packageName)
                        )
                    )
                }
            }
            val name = "KOA-Mobile-" + found.tag + ".apk"
            val req = DownloadManager.Request(Uri.parse(found.url))
                .setTitle(name)
                .setDescription("KOA Browser Mobile")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                .setMimeType("application/vnd.android.package-archive")
            val dm = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(req)
        } catch (e: Exception) {
        }
    }
}
