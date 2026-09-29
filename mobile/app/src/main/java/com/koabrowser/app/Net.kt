package com.koabrowser.app

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL

// Piccoli aiuti di rete senza dipendenze (GET/POST con timeout).
object Net {
    fun get(url: String, timeoutMs: Int = 15000): String {
        val c = (URL(url).openConnection() as HttpURLConnection)
        try {
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            c.setRequestProperty("User-Agent", "KOA-Browser-Mobile")
            val code = c.responseCode
            if (code !in 200..299) throw RuntimeException("HTTP $code")
            return c.inputStream.bufferedReader(Charsets.UTF_8).readText()
        } finally {
            c.disconnect()
        }
    }

    fun postJson(url: String, body: String, timeoutMs: Int = 60000): String {
        val c = (URL(url).openConnection() as HttpURLConnection)
        try {
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("User-Agent", "KOA-Browser-Mobile")
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            val text = stream.bufferedReader(Charsets.UTF_8).readText()
            if (code !in 200..299) throw RuntimeException("HTTP $code: ${text.take(120)}")
            return text
        } finally {
            c.disconnect()
        }
    }

    // Escape minimo per stringhe JSON costruite a mano.
    fun esc(s: String): String {
        val b = StringBuilder(s.length + 8)
        for (ch in s) {
            when (ch) {
                '"' -> b.append("\\\"")
                '\\' -> b.append("\\\\")
                '\n' -> b.append("\\n")
                '\r' -> b.append("\\r")
                '\t' -> b.append("\\t")
                else -> if (ch < ' ') b.append(String.format("\\u%04x", ch.code)) else b.append(ch)
            }
        }
        return b.toString()
    }
}
