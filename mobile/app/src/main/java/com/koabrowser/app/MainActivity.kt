package com.koabrowser.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GravityCompat
import androidx.drawerlayout.widget.DrawerLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.activity.OnBackPressedCallback
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

// Browser KOA Mobile: schede WebView, drawer, menu, link esterni.
class MainActivity : AppCompatActivity() {

    data class Tab(val view: WebView, var title: String = "Nuova scheda")

    private val tabs = ArrayList<Tab>()
    private var active = -1

    private lateinit var drawer: DrawerLayout
    private lateinit var holder: android.widget.FrameLayout
    private lateinit var urlBar: EditText
    private lateinit var progress: ProgressBar
    private lateinit var tabCount: TextView
    private lateinit var tabAdapter: TabAdapter
    private lateinit var refresh: SwipeRefreshLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        drawer = findViewById(R.id.drawer)
        holder = findViewById(R.id.viewHolder)
        urlBar = findViewById(R.id.urlBar)
        progress = findViewById(R.id.progress)
        tabCount = findViewById(R.id.tabCount)
        findViewById<TextView>(R.id.drawerVersion).text =
            "v" + packageManager.getPackageInfo(packageName, 0).versionName

        val list = findViewById<RecyclerView>(R.id.tabList)
        list.layoutManager = LinearLayoutManager(this)
        tabAdapter = TabAdapter()
        list.adapter = tabAdapter
        refresh = findViewById(R.id.refresh)
        refresh.setColorSchemeResources(R.color.koa_orange)
        refresh.setOnRefreshListener { current()?.reload() }

        urlBar.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) {
                openFromBar(urlBar.text.toString())
                true
            } else false
        }
        findViewById<ImageButton>(R.id.btnBack).setOnClickListener { current()?.goBack() }
        findViewById<ImageButton>(R.id.btnFwd).setOnClickListener { current()?.goForward() }
        findViewById<ImageButton>(R.id.btnReload).setOnClickListener { current()?.reload() }
        findViewById<ImageButton>(R.id.btnMenu).setOnClickListener { showMenu(it) }

        findViewById<View>(R.id.navTabs).setOnClickListener { drawer.openDrawer(GravityCompat.START) }
        findViewById<ImageButton>(R.id.navNew).setOnClickListener { newTab(Prefs.home(this)); drawer.closeDrawers() }
        findViewById<ImageButton>(R.id.navHome).setOnClickListener { current()?.loadUrl(Prefs.home(this)) }
        findViewById<ImageButton>(R.id.navDl).setOnClickListener {
            startActivity(Intent(this, DownloadsActivity::class.java))
        }
        findViewById<ImageButton>(R.id.navChat).setOnClickListener {
            startActivity(Intent(this, ChatActivity::class.java))
        }

        findViewById<Button>(R.id.drawerNewTab).setOnClickListener {
            newTab(Prefs.home(this)); drawer.closeDrawers()
        }
        findViewById<Button>(R.id.drawerChat).setOnClickListener {
            startActivity(Intent(this, ChatActivity::class.java)); drawer.closeDrawers()
        }
        findViewById<Button>(R.id.drawerMoon).setOnClickListener {
            startActivity(Intent(this, MoonActivity::class.java)); drawer.closeDrawers()
        }
        findViewById<Button>(R.id.drawerDl).setOnClickListener {
            startActivity(Intent(this, DownloadsActivity::class.java)); drawer.closeDrawers()
        }
        findViewById<Button>(R.id.drawerVault).setOnClickListener {
            startActivity(Intent(this, VaultActivity::class.java)); drawer.closeDrawers()
        }
        findViewById<Button>(R.id.drawerSettings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java)); drawer.closeDrawers()
        }
        findViewById<Button>(R.id.drawerExit).setOnClickListener { finishAffinity() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (drawer.isDrawerOpen(GravityCompat.START)) {
                    drawer.closeDrawers()
                    return
                }
                val w = current()
                if (w != null && w.canGoBack()) {
                    w.goBack()
                    return
                }
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        })

        handleIntent(intent)
        if (tabs.isEmpty()) newTab(Prefs.home(this))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        VaultFill.consumeIfMatch(this, current())
        current()?.onResume()
        refreshTabUi()
    }

    override fun onPause() {
        super.onPause()
        current()?.onPause()
    }

    override fun onDestroy() {
        for (t in tabs) {
            try {
                holder.removeView(t.view)
                t.view.destroy()
            } catch (e: Exception) {
            }
        }
        tabs.clear()
        super.onDestroy()
    }

    private fun handleIntent(intent: Intent?) {
        val u = intent?.data?.toString()
        if (intent?.action == Intent.ACTION_VIEW && !u.isNullOrEmpty() &&
            (u.startsWith("http://") || u.startsWith("https://"))
        ) {
            newTab(u)
        } else if (intent?.hasExtra("koa_url") == true) {
            val x = intent.getStringExtra("koa_url")
            if (!x.isNullOrEmpty()) newTab(x)
        }
    }

    private fun current(): WebView? =
        if (active in tabs.indices) tabs[active].view else null

    fun openUrlSmart(raw: String): String {
        val t = raw.trim()
        if (t.isEmpty()) return Prefs.home(this)
        if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("file://")) return t
        if (t.matches(Regex("^[\\w\\-]+(\\.[\\w\\-]+)+(:\\d+)?(/.*)?$"))) return "https://$t"
        return Prefs.getEngine(this).replace("%s", Uri.encode(t))
    }

    private fun openFromBar(raw: String) {
        val url = openUrlSmart(raw)
        val w = current()
        if (w == null) newTab(url) else {
            w.loadUrl(url)
            hideKeyboard()
        }
    }

    private fun hideKeyboard() {
        try {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.hideSoftInputFromWindow(urlBar.windowToken, 0)
            urlBar.clearFocus()
        } catch (e: Exception) {
        }
    }

    fun newTab(url: String) {
        if (tabs.size >= 20) {
            Toast.makeText(this, "Troppe schede (max 20)", Toast.LENGTH_SHORT).show()
            return
        }
        var idx = -1
        val hooks = KoaWebView.Hooks(
            onProgress = { p ->
                if (idx == active) {
                    progress.visibility = if (p in 1..99) View.VISIBLE else View.GONE
                    progress.progress = p
                }
            },
            onTitle = { t ->
                if (!t.isNullOrEmpty() && idx in tabs.indices) {
                    tabs[idx].title = t
                    tabAdapter.notifyItemChanged(idx)
                }
            },
            onUrl = { refreshTabUi() },
            onPageDone = {
                try {
                    refresh.isRefreshing = false
                } catch (e: Exception) {
                }
                refreshTabUi()
            }
        )
        val wv = KoaWebView.create(this, hooks)
        val tab = Tab(wv)
        tabs.add(tab)
        idx = tabs.size - 1
        holder.addView(wv)
        showTab(tabs.size - 1)
        wv.loadUrl(url)
    }

    private fun showTab(i: Int) {
        if (i !in tabs.indices) return
        active = i
        for ((idx, t) in tabs.withIndex()) {
            t.view.visibility = if (idx == i) View.VISIBLE else View.GONE
        }
        refreshTabUi()
    }

    private fun closeTab(i: Int) {
        if (i !in tabs.indices) return
        try {
            holder.removeView(tabs[i].view)
            tabs[i].view.destroy()
        } catch (e: Exception) {
        }
        tabs.removeAt(i)
        tabAdapter.notifyDataSetChanged()
        if (tabs.isEmpty()) {
            newTab(Prefs.home(this))
            return
        }
        showTab(maxOf(0, minOf(active, tabs.size - 1)))
    }

    private fun refreshTabUi() {
        val w = current()
        if (!urlBar.hasFocus()) {
            urlBar.setText(w?.url ?: "")
        }
        tabCount.text = tabs.size.toString()
        tabAdapter.notifyDataSetChanged()
    }

    private fun showMenu(anchor: View) {
        val pm = PopupMenu(this, anchor)
        pm.menu.add(0, 1, 0, "Nuova scheda")
        pm.menu.add(0, 2, 0, "Ricarica")
        pm.menu.add(0, 3, 0, "Trova nella pagina")
        pm.menu.add(0, 4, 0, "Versione desktop")
        pm.menu.add(0, 5, 0, "Chat KOA")
        pm.menu.add(0, 6, 0, "ZEN Moon locale")
        pm.menu.add(0, 7, 0, "Download")
        pm.menu.add(0, 8, 0, "Impostazioni")
        pm.menu.add(0, 9, 0, "Esci")
        pm.menu.findItem(4).isCheckable = true
        pm.menu.findItem(4).isChecked = Prefs.isDesktop(this)
        pm.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> newTab(Prefs.home(this))
                2 -> current()?.reload()
                3 -> askFind()
                4 -> {
                    val v = !Prefs.isDesktop(this)
                    Prefs.setDesktop(this, v)
                    current()?.let { KoaWebView.applyDesktopMode(it, v) }
                }
                5 -> startActivity(Intent(this, ChatActivity::class.java))
                6 -> startActivity(Intent(this, MoonActivity::class.java))
                7 -> startActivity(Intent(this, DownloadsActivity::class.java))
                8 -> startActivity(Intent(this, SettingsActivity::class.java))
                9 -> finishAffinity()
            }
            true
        }
        pm.show()
    }

    private fun askFind() {
        val w = current() ?: return
        val input = EditText(this)
        input.hint = "Trova nella pagina"
        AlertDialog.Builder(this)
            .setTitle("Trova")
            .setView(input)
            .setPositiveButton("Cerca") { _, _ ->
                try {
                    w.findAllAsync(input.text.toString())
                } catch (e: Exception) {
                }
            }
            .setNegativeButton("Chiudi", null)
            .show()
        try {
            w.setFindListener { _, _, _ -> }
        } catch (e: Exception) {
        }
    }

    fun clearAllData() {
        try {
            for (t in tabs) t.view.clearCache(true)
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()
            WebStorage.getInstance().deleteAllData()
            Toast.makeText(this, "Dati cancellati", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
        }
    }

    inner class TabAdapter : RecyclerView.Adapter<TabAdapter.Holder>() {
        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val title: TextView = v.findViewById(R.id.tabTitle)
            val url: TextView = v.findViewById(R.id.tabUrl)
            val close: ImageButton = v.findViewById(R.id.tabClose)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_tab, parent, false)
            return Holder(v)
        }

        override fun getItemCount(): Int = tabs.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val t = tabs[position]
            val liveTitle = try {
                t.view.title
            } catch (e: Exception) {
                null
            }
            h.title.text = if (!liveTitle.isNullOrEmpty()) liveTitle else t.title
            h.title.setTextColor(
                if (position == active) resources.getColor(R.color.koa_amber, theme)
                else resources.getColor(R.color.koa_cream, theme)
            )
            h.url.text = try {
                t.view.url ?: ""
            } catch (e: Exception) {
                ""
            }
            h.itemView.setOnClickListener {
                showTab(position)
                drawer.closeDrawers()
            }
            h.close.setOnClickListener { closeTab(position) }
        }
    }
}
