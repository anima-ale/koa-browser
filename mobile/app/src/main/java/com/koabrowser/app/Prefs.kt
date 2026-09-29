package com.koabrowser.app

import android.content.Context

// Preferenze KOA (motore di ricerca, desktop, supervisor, home).
object Prefs {
    private const val F = "koa-prefs"

    private fun p(c: Context) = c.getSharedPreferences(F, Context.MODE_PRIVATE)

    fun getEngine(c: Context): String =
        p(c).getString("engine", "https://www.google.com/search?q=%s") ?: "https://www.google.com/search?q=%s"

    fun setEngine(c: Context, tpl: String) {
        p(c).edit().putString("engine", tpl).apply()
    }

    fun isDesktop(c: Context): Boolean = p(c).getBoolean("desktop", false)
    fun setDesktop(c: Context, v: Boolean) {
        p(c).edit().putBoolean("desktop", v).apply()
    }

    fun isSupervisor(c: Context): Boolean = p(c).getBoolean("supervisor", true)
    fun setSupervisor(c: Context, v: Boolean) {
        p(c).edit().putBoolean("supervisor", v).apply()
    }

    fun blocked(c: Context): Int = p(c).getInt("blocked", 0)
    fun addBlocked(c: Context, n: Int = 1) {
        p(c).edit().putInt("blocked", blocked(c) + n).apply()
    }

    fun home(c: Context): String = "file:///android_asset/start.html"
}
