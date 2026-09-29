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

// Aggiornamenti mobile via manifest (niente rate-limit GitHub API):
// zendate/mobile/zendate.json su raw.githubusercontent.com
object UpdateChecker {

    private const val MANIFEST =
        "https://raw.githubusercontent.com/anima-ale/koa-browser/main/zendate/mobile/zendate.json"

    fun check(activity: Activity, silent: Boolean, done: (String) -> Unit) {
        Thread {
            try {
                val j = Net.get(MANIFEST + "?t=" + System.currentTimeMillis())
                val ver = str(j, "version")
                val tag = str(j, "tag").ifEmpty { "v$ver-mobile" }
                val url = str(j, "url")
                val notes = str(j, "notes")
                val current = activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""
                activity.runOnUiThread {
                    if (ver.isEmpty() || url.isEmpty()) {
                        done("Manifest non valido.")
                    } else if (cmpVer(ver, current) <= 0) {
                        done("KOA Mobile è aggiornato ($current).")
                    } else if (silent) {
                        done("Disponibile $ver (apri Impostazioni per scaricarla).")
                    } else {
                        askDownload(activity, tag, url, notes, done)
                    }
                }
            } catch (e: Exception) {
                activity.runOnUiThread { done("Rete non disponibile.") }
            }
        }.start()
    }

    private fun str(j: String, k: String): String {
        return try {
            Regex("\"" + k + "\"\\s*:\\s*\"([^\"]*)\"").find(j)?.groupValues?.get(1) ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    private fun cmpVer(a: String, b: String): Int {
        val pa = a.trimStart('v', 'V').removeSuffix("-mobile").split('.').map { it.toIntOrNull() ?: 0 }
        val pb = b.trimStart('v', 'V').removeSuffix("-mobile").split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return x.compareTo(y)
        }
        return 0
    }

    private fun askDownload(activity: Activity, tag: String, url: String, notes: String, done: (String) -> Unit) {
        AlertDialog.Builder(activity)
            .setTitle("Aggiornamento $tag")
            .setMessage(if (notes.isEmpty()) "Scaricare e installare la nuova versione?" else notes)
            .setPositiveButton("Scarica e installa") { _, _ ->
                downloadAndInstall(activity, tag, url)
                done("Download avviato: completa l'installazione dal pannello.")
            }
            .setNegativeButton("Più tardi", null)
            .show()
    }

    private fun downloadAndInstall(activity: Activity, tag: String, url: String) {
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
            val name = "KOA-Mobile-$tag.apk"
            val req = DownloadManager.Request(Uri.parse(url))
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
