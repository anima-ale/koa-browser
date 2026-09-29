package com.koabrowser.app

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

// Elenco download di sistema: apri, elimina.
class DownloadsActivity : AppCompatActivity() {

    data class Dl(val id: Long, val name: String, val state: String)

    private val items = ArrayList<Dl>()
    private lateinit var adapter: DlAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_downloads)
        val list = findViewById<RecyclerView>(R.id.dlList)
        list.layoutManager = LinearLayoutManager(this)
        adapter = DlAdapter()
        list.adapter = adapter
    }

    override fun onResume() {
        super.onResume()
        reload()
    }

    private fun reload() {
        items.clear()
        try {
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val q = DownloadManager.Query()
            try {
                q.orderBy(
                    DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP,
                    DownloadManager.Query.ORDER_DESCENDING
                )
            } catch (e: Exception) {
            }
            val c: Cursor = dm.query(q)
            while (c.moveToNext()) {
                val id = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_ID))
                val name = try {
                    c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE)) ?: "file"
                } catch (e: Exception) {
                    "file"
                }
                val st = try {
                    c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                } catch (e: Exception) {
                    -1
                }
                val total = try {
                    c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                } catch (e: Exception) {
                    -1L
                }
                val done = try {
                    c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                } catch (e: Exception) {
                    0L
                }
                items.add(Dl(id, name, stateText(st, done, total)))
            }
            c.close()
        } catch (e: Exception) {
        }
        if (items.isEmpty()) {
            Toast.makeText(this, getString(R.string.no_downloads), Toast.LENGTH_SHORT).show()
        }
        adapter.notifyDataSetChanged()
    }

    private fun stateText(st: Int, done: Long, total: Long): String {
        return when (st) {
            DownloadManager.STATUS_SUCCESSFUL -> "Completato" + if (total > 0) " · " + fmt(total) else ""
            DownloadManager.STATUS_RUNNING -> "Download… " + fmt(done) + if (total > 0) " / " + fmt(total) else ""
            DownloadManager.STATUS_PAUSED -> "In pausa"
            DownloadManager.STATUS_PENDING -> "In attesa"
            DownloadManager.STATUS_FAILED -> "Fallito"
            else -> ""
        }
    }

    private fun fmt(b: Long): String {
        if (b < 0) return ""
        if (b < 1024) return "$b B"
        if (b < 1048576) return String.format("%.1f KB", b / 1024.0)
        if (b < 1073741824) return String.format("%.1f MB", b / 1048576.0)
        return String.format("%.2f GB", b / 1073741824.0)
    }

    inner class DlAdapter : RecyclerView.Adapter<DlAdapter.Holder>() {
        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val name: TextView = v.findViewById(R.id.dlName)
            val state: TextView = v.findViewById(R.id.dlState)
            val open: ImageButton = v.findViewById(R.id.dlOpen)
            val del: ImageButton = v.findViewById(R.id.dlDelete)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_download, parent, false)
            return Holder(v)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val d = items[position]
            h.name.text = d.name
            h.state.text = d.state
            h.open.setOnClickListener { openDl(d.id) }
            h.del.setOnClickListener {
                try {
                    (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).remove(d.id)
                } catch (e: Exception) {
                }
                reload()
            }
        }
    }

    private fun openDl(id: Long) {
        try {
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val uri = dm.getUriForDownloadedFile(id)
            val i = Intent(Intent.ACTION_VIEW, uri)
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivity(Intent.createChooser(i, "Apri con"))
        } catch (e: Exception) {
            Toast.makeText(this, "Apertura fallita", Toast.LENGTH_SHORT).show()
        }
    }
}
