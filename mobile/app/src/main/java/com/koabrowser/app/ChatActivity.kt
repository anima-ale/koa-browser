package com.koabrowser.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

// Chat KOA su Android: /calc /cerca /riassumi /aiuto + AI Pollinations.
class ChatActivity : AppCompatActivity() {

    data class Msg(val who: String, val text: String)

    private val msgs = ArrayList<Msg>()
    private lateinit var adapter: MsgAdapter
    private lateinit var input: EditText
    private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)

        val list = findViewById<RecyclerView>(R.id.msgList)
        list.layoutManager = LinearLayoutManager(this)
        adapter = MsgAdapter()
        list.adapter = adapter
        input = findViewById(R.id.chatInput)

        push("ai", "Ciao, sono KOA. /calc 2+2 · /cerca gatti · /riassumi testo · /aiuto")

        findViewById<ImageButton>(R.id.chatSend).setOnClickListener { send() }
    }

    private fun push(who: String, text: String) {
        msgs.add(Msg(who, text))
        if (msgs.size > 100) msgs.removeAt(0)
        adapter.notifyItemInserted(msgs.size - 1)
        findViewById<RecyclerView>(R.id.msgList).scrollToPosition(msgs.size - 1)
    }

    private fun send() {
        if (busy) return
        val q = input.text.toString().trim()
        if (q.isEmpty()) return
        input.setText("")
        push("user", q)
        when {
            q.startsWith("/aiuto") -> push("ai", "Comandi: /calc espressione · /cerca parole · /riassumi testo · /aiuto")
            q.startsWith("/calc") -> push("ai", calc(q.removePrefix("/calc").trim()))
            q.startsWith("/cerca") -> {
                val query = q.removePrefix("/cerca").trim()
                if (query.isEmpty()) {
                    push("ai", "Scrivi cosa cercare: /cerca gatti")
                } else {
                    push("ai", "Cerco “$query”…")
                    val i = Intent(this, MainActivity::class.java)
                    i.putExtra("koa_url", Prefs.getEngine(this).replace("%s", Uri.encode(query)))
                    startActivity(i)
                }
            }
            q.startsWith("/riassumi") -> {
                val t = q.removePrefix("/riassumi").trim()
                push("ai", if (t.length < 40) "Incolla un testo più lungo dopo /riassumi." else summarize(t))
            }
            else -> askAi(q)
        }
    }

    private fun calc(expr: String): String {
        if (expr.isEmpty()) return "Uso: /calc 2+2*3"
        if (!expr.matches(Regex("[0-9+\\-*/().,%\\s]+"))) return "Solo numeri e + - * / ( ) %"
        return try {
            val v = Expr(expr.replace(" ", "").replace("%", "/100")).parse()
            if (v.isNaN() || v.isInfinite()) "Non calcolabile." else "= $v"
        } catch (e: Exception) {
            "Espressione non valida."
        }
    }

    // Mini parser aritmetico (+ - * / parentesi, decimali).
    private class Expr(private val s: String) {
        var i = 0
        fun parse(): Double {
            val v = sum()
            if (i != s.length) throw RuntimeException("x")
            return v
        }

        private fun sum(): Double {
            var v = prod()
            while (i < s.length) {
                when (s[i]) {
                    '+' -> { i++; v += prod() }
                    '-' -> { i++; v -= prod() }
                    else -> return v
                }
            }
            return v
        }

        private fun prod(): Double {
            var v = atom()
            while (i < s.length) {
                when (s[i]) {
                    '*' -> { i++; v *= atom() }
                    '/' -> { i++; v /= atom() }
                    else -> return v
                }
            }
            return v
        }

        private fun atom(): Double {
            if (i < s.length && s[i] == '(') {
                i++
                val v = sum()
                if (i >= s.length || s[i] != ')') throw RuntimeException("x")
                i++
                return v
            }
            val st = i
            while (i < s.length && (s[i].isDigit() || s[i] == '.')) i++
            if (st == i) throw RuntimeException("x")
            return s.substring(st, i).toDouble()
        }
    }

    private fun summarize(text: String): String {
        val parts = text.split(Regex("(?<=[.!?…])\\s+")).map { it.trim() }
            .filter { it.length in 40..400 }
        if (parts.isEmpty()) return "Testo troppo breve."
        return parts.take(3).joinToString("\n\n")
    }

    private fun askAi(q: String) {
        busy = true
        push("ai", "…")
        val thinking = msgs.size - 1
        Thread {
            try {
                val body = "{\"messages\":[{\"role\":\"user\",\"content\":\"" + Net.esc(q.take(2000)) +
                    "\"}],\"model\":\"openai\"}"
                val res = Net.postJson("https://text.pollinations.ai/", body)
                runOnUiThread {
                    msgs[thinking] = Msg("ai", res.trim().ifEmpty { "Nessuna risposta." })
                    adapter.notifyItemChanged(thinking)
                    busy = false
                }
            } catch (e: Exception) {
                runOnUiThread {
                    msgs[thinking] = Msg("ai", "Rete non disponibile, riprova.")
                    adapter.notifyItemChanged(thinking)
                    busy = false
                }
            }
        }.start()
    }

    inner class MsgAdapter : RecyclerView.Adapter<MsgAdapter.Holder>() {
        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val root: LinearLayout = v.findViewById(R.id.msgRoot)
            val text: TextView = v.findViewById(R.id.msgText)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_msg, parent, false)
            return Holder(v)
        }

        override fun getItemCount(): Int = msgs.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val m = msgs[position]
            h.text.text = m.text
            val p = h.root.layoutParams as? ViewGroup.MarginLayoutParams
            if (m.who == "user") {
                h.root.gravity = Gravity.END
            } else {
                h.root.gravity = Gravity.START
            }
            if (p != null) {
                h.root.layoutParams = p
            }
        }
    }
}
