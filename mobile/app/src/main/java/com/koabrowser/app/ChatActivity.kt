package com.koabrowser.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Chat KOA mobile: header, bolle con ora, invio da tastiera, copia alla pressione lunga.
class ChatActivity : AppCompatActivity() {

    data class Msg(val who: String, val text: String, val at: Long = System.currentTimeMillis())

    private val msgs = ArrayList<Msg>()
    private lateinit var adapter: MsgAdapter
    private lateinit var input: EditText
    private lateinit var list: RecyclerView
    private var busy = false
    private val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)

        list = findViewById(R.id.msgList)
        list.layoutManager = LinearLayoutManager(this)
        adapter = MsgAdapter()
        list.adapter = adapter
        input = findViewById(R.id.chatInput)

        push("ai", "Ciao, sono KOA. /calc 2+2 · /cerca gatti · /riassumi testo · /aiuto")

        findViewById<ImageButton>(R.id.chatSend).setOnClickListener { send() }
        findViewById<ImageButton>(R.id.chatBack).setOnClickListener { finish() }
        findViewById<ImageButton>(R.id.chatClear).setOnClickListener {
            msgs.clear()
            adapter.notifyDataSetChanged()
            push("ai", "Chat svuotata. Come posso aiutarti?")
        }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                send()
                true
            } else false
        }
    }

    private fun push(who: String, text: String) {
        msgs.add(Msg(who, text))
        if (msgs.size > 100) msgs.removeAt(0)
        adapter.notifyItemInserted(msgs.size - 1)
        list.scrollToPosition(msgs.size - 1)
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
                    list.scrollToPosition(thinking)
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
            val time: TextView = v.findViewById(R.id.msgTime)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_msg, parent, false)
            return Holder(v)
        }

        override fun getItemCount(): Int = msgs.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val m = msgs[position]
            h.text.text = m.text
            h.time.text = try {
                timeFmt.format(Date(m.at))
            } catch (e: Exception) {
                ""
            }
            if (m.who == "user") {
                h.root.gravity = Gravity.END
                h.text.setBackgroundResource(R.drawable.bubble_user)
                h.time.gravity = Gravity.END
            } else {
                h.root.gravity = Gravity.START
                h.text.setBackgroundResource(R.drawable.field_bg)
                h.time.gravity = Gravity.START
            }
            h.itemView.setOnLongClickListener {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("koa", m.text))
                Toast.makeText(this@ChatActivity, "Copiato", Toast.LENGTH_SHORT).show()
                true
            }
        }
    }
}
