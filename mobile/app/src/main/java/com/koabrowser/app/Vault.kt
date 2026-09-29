package com.koabrowser.app

import android.content.Context
import android.webkit.WebView
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.MessageDigest

// KOA Vault Mobile: PIN + password cifrate (Android Keystore).
object VaultStore {
    data class Rec(val id: String, val site: String, val user: String, val pass: String)

    private const val PREF = "koa-vault-meta"
    private const val FILE = "koa-vault"

    private fun meta(c: Context) = c.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    fun exists(c: Context): Boolean = meta(c).contains("salt")

    fun unlocked(): Boolean = VaultSession.key

    private fun sha(pin: String, salt: String): String {
        val d = MessageDigest.getInstance("SHA-256")
        val h = d.digest((salt + pin).toByteArray(Charsets.UTF_8))
        return h.joinToString("") { "%02x".format(it) }
    }

    // Primo avvio: crea PIN (min 4). Ritorna false se PIN troppo corto.
    fun setup(c: Context, pin: String): Boolean {
        if (pin.length < 4 || exists(c)) return false
        val salt = java.util.UUID.randomUUID().toString()
        meta(c).edit()
            .putString("salt", salt)
            .putString("hash", sha(pin, salt))
            .apply()
        VaultSession.key = true
        return true
    }

    fun unlock(c: Context, pin: String): Boolean {
        val m = meta(c)
        val salt = m.getString("salt", null) ?: return false
        if (sha(pin, salt) != m.getString("hash", "")) return false
        VaultSession.key = true
        return true
    }

    fun lock() {
        VaultSession.key = false
    }

    private fun enc(c: Context): android.content.SharedPreferences {
        val mk = MasterKey.Builder(c).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(
            c, FILE, mk,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun list(c: Context): List<Rec> {
        if (!unlocked()) return emptyList()
        return try {
            val raw = enc(c).getString("records", "[]") ?: "[]"
            JsonArr.parse(raw)
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun save(c: Context, site: String, user: String, pass: String) {
        if (!unlocked()) return
        val all = list(c).toMutableList()
        all.add(0, Rec(java.util.UUID.randomUUID().toString(), site, user, pass))
        enc(c).edit().putString("records", JsonArr.write(all.take(200))).apply()
    }

    fun delete(c: Context, id: String) {
        if (!unlocked()) return
        val all = list(c).filter { it.id != id }
        enc(c).edit().putString("records", JsonArr.write(all)).apply()
    }

    fun reveal(c: Context, id: String): String {
        if (!unlocked()) return ""
        return list(c).firstOrNull { it.id == id }?.pass ?: ""
    }
}

// Flag di sessione (la chiave vera resta nel Keystore).
object VaultSession {
    var key: Boolean = false
}

// Riempimento al prossimo resume del browser, se l'origine coincide.
object VaultFill {
    var origin: String? = null
    var user: String? = null
    var pass: String? = null

    fun arm(site: String, user: String, pass: String) {
        origin = try {
            val u = android.net.Uri.parse(site)
            (u.scheme ?: "https") + "://" + (u.host ?: site)
        } catch (e: Exception) {
            site
        }
        this.user = user
        this.pass = pass
    }

    fun consumeIfMatch(ctx: Context, wv: WebView?) {
        val o = origin ?: return
        val u = user ?: return
        val p = pass ?: return
        origin = null
        this.user = null
        this.pass = null
        if (wv == null) return
        try {
            val cur = wv.url ?: return
            if (!cur.startsWith(o)) return
            val js = "(function(){try{" +
                "var u=" + jsStr(u) + ",p=" + jsStr(p) + ";" +
                "var pw=document.querySelector('input[type=password]');" +
                "if(!pw)return 'no-pw';" +
                "var f=pw.form||document;" +
                "var un=f.querySelector('input[type=email],input[type=text][name*=user i],input[type=text][name*=login i],input[type=text]');" +
                "function set(el,v){if(!el)return;el.focus();el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}" +
                "set(un,u);set(pw,p);return 'ok';" +
                "}catch(e){return 'err'}})()"
            wv.evaluateJavascript(js, null)
        } catch (e: Exception) {
        }
    }

    private fun jsStr(s: String): String {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"
    }
}

// JSON minimo per i record (niente dipendenze).
object JsonArr {
    fun parse(raw: String): List<VaultStore.Rec> {
        val out = ArrayList<VaultStore.Rec>()
        try {
            val t = raw.trim()
            if (!t.startsWith("[") || !t.endsWith("]")) return out
            var i = 1
            while (i < t.length) {
                val o = readObj(t, i) ?: break
                i = o.second
                val m = o.first
                out.add(
                    VaultStore.Rec(
                        m["id"] ?: java.util.UUID.randomUUID().toString(),
                        m["site"] ?: "",
                        m["user"] ?: "",
                        m["pass"] ?: ""
                    )
                )
                while (i < t.length && (t[i] == ',' || t[i].isWhitespace())) i++
            }
        } catch (e: Exception) {
        }
        return out
    }

    private fun readObj(t: String, start: Int): Pair<Map<String, String>, Int>? {
        var i = start
        while (i < t.length && t[i] != '{') {
            if (t[i] == ']') return null
            i++
        }
        if (i >= t.length) return null
        i++
        val m = HashMap<String, String>()
        while (i < t.length) {
            while (i < t.length && (t[i].isWhitespace() || t[i] == ',')) i++
            if (i < t.length && t[i] == '}') return Pair(m, i + 1)
            if (i >= t.length || t[i] != '"') return null
            val k = readStr(t, i) ?: return null
            i = k.second
            while (i < t.length && (t[i].isWhitespace() || t[i] == ':')) i++
            val v = readStr(t, i) ?: return null
            i = v.second
            m[k.first] = v.first
        }
        return null
    }

    private fun readStr(t: String, start: Int): Pair<String, Int>? {
        if (start >= t.length || t[start] != '"') return null
        val b = StringBuilder()
        var i = start + 1
        while (i < t.length) {
            val ch = t[i]
            if (ch == '\\' && i + 1 < t.length) {
                when (t[i + 1]) {
                    '"', '\\', '/' -> { b.append(t[i + 1]); i += 2 }
                    'n' -> { b.append('\n'); i += 2 }
                    'r' -> { b.append('\r'); i += 2 }
                    't' -> { b.append('\t'); i += 2 }
                    'u' -> {
                        if (i + 5 >= t.length) return null
                        b.append(t.substring(i + 2, i + 6).toInt(16).toChar())
                        i += 6
                    }
                    else -> { b.append(ch); i++ }
                }
            } else if (ch == '"') {
                return Pair(b.toString(), i + 1)
            } else {
                b.append(ch)
                i++
            }
        }
        return null
    }

    fun write(list: List<VaultStore.Rec>): String {
        return "[" + list.joinToString(",") {
            "{\"id\":\"" + Net.esc(it.id) + "\",\"site\":\"" + Net.esc(it.site) +
                "\",\"user\":\"" + Net.esc(it.user) + "\",\"pass\":\"" + Net.esc(it.pass) + "\"}"
        } + "]"
    }
}
