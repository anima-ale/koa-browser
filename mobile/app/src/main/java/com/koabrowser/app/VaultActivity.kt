package com.koabrowser.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

// KOA Vault Mobile: PIN, elenco, aggiunta, copia, riempi nella scheda.
class VaultActivity : AppCompatActivity() {

    private lateinit var adapter: VaultAdapter
    private val items = ArrayList<VaultStore.Rec>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_vault)

        val list = findViewById<RecyclerView>(R.id.vaultList)
        list.layoutManager = LinearLayoutManager(this)
        adapter = VaultAdapter()
        list.adapter = adapter

        findViewById<Button>(R.id.vaultUnlock).setOnClickListener {
            val pin = findViewById<EditText>(R.id.vaultPin).text.toString()
            if (!VaultStore.exists(this)) {
                if (VaultStore.setup(this, pin)) {
                    Toast.makeText(this, "PIN creato", Toast.LENGTH_SHORT).show()
                    refresh()
                } else {
                    Toast.makeText(this, "PIN minimo 4 cifre", Toast.LENGTH_SHORT).show()
                }
            } else {
                if (VaultStore.unlock(this, pin)) refresh()
                else Toast.makeText(this, "PIN errato", Toast.LENGTH_SHORT).show()
            }
        }
        findViewById<Button>(R.id.vaultAdd).setOnClickListener { askAdd() }
        findViewById<Button>(R.id.vaultLockBtn).setOnClickListener {
            VaultStore.lock()
            refresh()
        }
        refresh()
    }

    private fun refresh() {
        val open = VaultStore.unlocked()
        findViewById<LinearLayout>(R.id.vaultPinBox).visibility = if (open) View.GONE else View.VISIBLE
        findViewById<LinearLayout>(R.id.vaultOpenBox).visibility = if (open) View.VISIBLE else View.GONE
        if (open) {
            items.clear()
            items.addAll(VaultStore.list(this))
            adapter.notifyDataSetChanged()
        }
    }

    private fun askAdd() {
        val box = LinearLayout(this)
        box.orientation = LinearLayout.VERTICAL
        box.setPadding(48, 24, 48, 24)
        val fSite = EditText(this)
        fSite.hint = "Sito (https://…)"
        val fUser = EditText(this)
        fUser.hint = "Utente"
        val fPass = EditText(this)
        fPass.hint = "Password"
        box.addView(fSite)
        box.addView(fUser)
        box.addView(fPass)
        AlertDialog.Builder(this)
            .setTitle("Nuova password")
            .setView(box)
            .setPositiveButton("Salva") { _, _ ->
                VaultStore.save(
                    this,
                    fSite.text.toString().trim(),
                    fUser.text.toString(),
                    fPass.text.toString()
                )
                refresh()
            }
            .setNegativeButton("Annulla", null)
            .show()
    }

    inner class VaultAdapter : RecyclerView.Adapter<VaultAdapter.Holder>() {
        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val site: TextView = v.findViewById(R.id.vSite)
            val user: TextView = v.findViewById(R.id.vUser)
            val fill: ImageButton = v.findViewById(R.id.vFill)
            val del: ImageButton = v.findViewById(R.id.vDelete)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_vault, parent, false)
            return Holder(v)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val r = items[position]
            h.site.text = r.site
            h.user.text = r.user
            h.fill.setOnClickListener {
                VaultFill.arm(r.site, r.user, VaultStore.reveal(this@VaultActivity, r.id))
                Toast.makeText(this@VaultActivity, "Apri il sito: riempio al resume", Toast.LENGTH_SHORT).show()
                finish()
            }
            h.itemView.setOnLongClickListener {
                val p = VaultStore.reveal(this@VaultActivity, r.id)
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("koa", p))
                Toast.makeText(this@VaultActivity, "Password copiata", Toast.LENGTH_SHORT).show()
                true
            }
            h.del.setOnClickListener {
                VaultStore.delete(this@VaultActivity, r.id)
                refresh()
            }
        }
    }
}
