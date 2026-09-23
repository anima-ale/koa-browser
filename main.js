const { app, BrowserWindow, Menu, Tray, ipcMain, session, shell, webContents, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Niente barra dei menu File/Edit/View: finestra pulita stile browser.
Menu.setApplicationMenu(null);

const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');

// Evita gli errori "Unable to move the cache: Accesso negato" che compaiono
// su Windows quando Chromium non riesce a scrivere la cache disco/GPU
// (dovuto ad antivirus, permessi della cartella, o cartelle sincronizzate
// come OneDrive). Va messo PRIMA di app.whenReady().
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.disableHardwareAcceleration();

function createWindow() {
  // UI istantanea: se esiste un bundle UI verificato pari o più nuovo dell'exe, usalo.
  const customUi = effectiveUiPath();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false, // niente barra di Windows: controlli integrati nella UI
    show: false, // paint solo a finestra pronta: avvio percepito istantaneo
    title: 'KOA Browser v' + app.getVersion(),
    webPreferences: {
      preload: customUi ? path.join(customUi, 'preload.js') : path.join(__dirname, 'preload.js'),
      webviewTag: true, // abilita il tag <webview> nell'interfaccia
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(customUi ? path.join(customUi, 'index.html') : 'index.html');
  win.once('ready-to-show', () => { try { win.show(); } catch (e) {} });
  setTimeout(() => { try { if (!win.isVisible()) win.show(); } catch (e) {} }, 4000);

  // Stato massimizzata → renderer (per l'icona ripristina/massimizza).
  const sendMax = () => { try { win.webContents.send('zen:win-max-changed', win.isMaximized()); } catch (e) {} };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);

  // In background via tray invece di chiudere (Chromium iberna da solo le pagine nascoste).
  win.on('close', (e) => {
    if (!willQuit) { e.preventDefault(); win.hide(); }
  });

  // Decommenta per aprire subito i DevTools della UI del browser
  // win.webContents.openDevTools();
}

// ---- ZEN Supervisor: vero anti-tracker + anti-pubblicità (EasyList + EasyPrivacy) ----
let supervisorBlocker = null;
let supervisorOn = true;
const supervisorStats = { total: 0, last: '' };

function broadcastSupervisor() {
  const payload = { on: supervisorOn, ready: !!supervisorBlocker, total: supervisorStats.total, last: supervisorStats.last };
  BrowserWindow.getAllWindows().forEach(w => {
    try { w.webContents.send('zen:supervisor-stats', payload); } catch (e) {}
  });
}

async function setupSupervisor() {
  try {
    supervisorBlocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: path.join(app.getPath('userData'), 'supervisor-lists'),
      loadCosmeticFilters: true
    });
    supervisorBlocker.on('request-blocked', (req) => {
      try {
        supervisorStats.total++;
        const u = (req && req.url) || '';
        const m = u.match(/^https?:\/\/([^/]+)/i);
        supervisorStats.last = m ? m[1] : u.slice(0, 60);
      } catch (e) {}
      broadcastSupervisor();
    });
    if (supervisorOn) {
      try { supervisorBlocker.enableBlockingInSession(session.defaultSession); } catch (e) {}
    }
    broadcastSupervisor();
  } catch (e) { console.error('[supervisor]', e.message); }
}

ipcMain.handle('zen:supervisor', (_e, on) => {
  supervisorOn = !!on;
  try {
    if (supervisorBlocker) {
      if (supervisorOn) supervisorBlocker.enableBlockingInSession(session.defaultSession);
      else supervisorBlocker.disableBlockingInSession(session.defaultSession);
    }
  } catch (e) {}
  broadcastSupervisor();
  return { on: supervisorOn, ready: !!supervisorBlocker };
});

// ================= ZENdate MAX — aggiornamento automatico del portable =================
// Canale di distribuzione: pubblica ogni release (exe + note) e punta qui il file
// zendate.json. Formato: { "version": "1.0.1", "notes": "...", "url": "https://...exe", "sha256": "..." }
// Esempio gratis: GitHub Releases + https://raw.githubusercontent.com/<UTENTE>/<REPO>/main/zendate.json
const ZENDATE_URL = 'https://raw.githubusercontent.com/anima-ale/koa-browser/main/zendate/zendate.json';

let willQuit = false;
let tray = null;
let updateChecking = false;
let updateWatchdog = 0;

function sendUpdate(payload) {
  BrowserWindow.getAllWindows().forEach(w => {
    try { w.webContents.send('zen:update-status', payload); } catch (e) {}
  });
}

function zendateNewer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function downloadFile(url, dest, onPct) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error('download HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const out = fs.createWriteStream(dest);
  let done = 0;
  await new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    (async () => {
      try {
        for await (const chunk of res.body) {
          if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
          done += chunk.length;
          if (total > 0 && onPct) onPct(Math.min(99, Math.round((done / total) * 100)));
        }
        out.end();
      } catch (e) { try { out.destroy(e); } catch (_) {} reject(e); }
    })();
  });
  if (onPct) onPct(100);
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', d => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

async function checkForUpdates(source) {
  if (updateChecking) {
    sendUpdate({ state: 'checking', source: source || 'manual' });
    return { state: 'busy' };
  }
  updateChecking = true;
  // Watchdog: mai bloccato oltre 90s, in nessun caso di rete.
  clearTimeout(updateWatchdog);
  updateWatchdog = setTimeout(() => {
    if (updateChecking) {
      updateChecking = false;
      sendUpdate({ state: 'error', message: 'timeout di sicurezza (90s): riavvia e riprova' });
    }
  }, 90000);
  sendUpdate({ state: 'checking', source: source || 'manual' });
  try {
    if (!ZENDATE_URL || ZENDATE_URL.includes('<UTENTE>')) {
      sendUpdate({ state: 'no-channel' });
      return { state: 'no-channel' };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    let man;
    try {
      // Cache-buster: salta anche la cache del CDN per vedere subito le nuove release.
      const url = ZENDATE_URL + (ZENDATE_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('canale HTTP ' + res.status);
      man = await res.json();
    } finally { clearTimeout(timer); }
    const current = app.getVersion();
    // Update istantaneo dell'interfaccia (senza riavvio) se il manifest lo prevede
    // e l'exe corrente lo supporta (minExe). Non sostituisce l'update exe.
    const ui = man && man.ui;
    if (ui && ui.version && ui.files && (!ui.minExe || !zendateNewer(ui.minExe, current))) {
      const local = localUiVersion();
      if (!local || zendateNewer(ui.version, local)) {
        sendUpdate({ state: 'ui-found', version: ui.version });
        try {
          await applyUiUpdate(ui);
          sendUpdate({ state: 'ui-updated', version: ui.version });
        } catch (e) {
          sendUpdate({ state: 'ui-error', message: (e && e.message) || 'errore UI' });
        }
      }
    }
    if (!man || !man.version || !man.url || !zendateNewer(man.version, current)) {
      sendUpdate({ state: 'up-to-date', version: current });
      return { state: 'up-to-date', version: current };
    }
    sendUpdate({ state: 'found', version: man.version, notes: man.notes || '' });
    if (process.execPath.toLowerCase().includes('win-unpacked')) {
      sendUpdate({ state: 'error', message: 'Stai girando da win-unpacked: avvia il portable per auto-aggiornarti.' });
      return { state: 'error' };
    }
    const tmpFile = path.join(os.tmpdir(), 'koa-zendate', 'KOA-Browser-' + man.version + '.exe');
    await downloadFile(man.url, tmpFile, (pct) => sendUpdate({ state: 'downloading', version: man.version, percent: pct }));
    if (man.sha256) {
      const digest = await sha256File(tmpFile);
      if (digest.toLowerCase() !== String(man.sha256).toLowerCase()) throw new Error('hash di sicurezza non corrispondente');
    }
    sendUpdate({ state: 'ready', version: man.version });
    await installUpdate(tmpFile);
    return { state: 'ready', version: man.version };
  } catch (e) {
    sendUpdate({ state: 'error', message: (e && e.message) || 'errore di rete' });
    return { state: 'error' };
  } finally { clearTimeout(updateWatchdog); updateChecking = false; }
}

// Swap atomico: un helper .bat attende l'uscita, sostituisce l'exe e rilancia.
async function installUpdate(filePath) {
  const cur = process.execPath;
  const bat = path.join(os.tmpdir(), 'koa-zendate-' + Date.now() + '.bat');
  const lines = [
    '@echo off',
    'set "ZPID=%~1"',
    'set "ZCUR=%~2"',
    'set "ZNEW=%~3"',
    ':zendate_wait',
    'tasklist /FI "PID eq %ZPID%" 2>nul | find /I "%ZPID%" >nul',
    'if not errorlevel 1 (',
    '  timeout /t 1 /nobreak >nul',
    '  goto zendate_wait',
    ')',
    'move /y "%ZNEW%" "%ZCUR%" >nul',
    'start "" "%ZCUR%" --zendate-updated',
    '(goto) 2>nul & del "%~f0"'
  ];
  fs.writeFileSync(bat, lines.join('\r\n'));
  sendUpdate({ state: 'installing' });
  willQuit = true;
  try {
    spawn('cmd.exe', ['/c', 'start', '/min', '', bat, String(process.pid), cur, filePath],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch (e) {}
  setTimeout(() => { try { app.quit(); } catch (e) {} }, 900);
}

ipcMain.handle('zen:get-version', () => app.getVersion());
ipcMain.handle('zen:check-update', () => checkForUpdates('manual'));
ipcMain.handle('zen:toggle-devtools', () => {
  const w = BrowserWindow.getFocusedWindow();
  if (w) { try { w.webContents.toggleDevTools(); } catch (e) {} }
});

// ================= Browser predefinito VERO (Windows lo tratta da browser) =================
// Registra client StartMenuInternet + Capabilities + protocolli + tipi file sotto HKCU
// (niente admin). Poi Windows elenca KOA tra i browser e lo si imposta di default.
function koaRegContent() {
  const exe = process.execPath.replace(/\\/g, '\\\\');
  const openCmd = '\\"' + exe + '\\" \\"%1\\"';
  const L = [];
  L.push('Windows Registry Editor Version 5.00', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\KOA Browser]');
  L.push('@="KOA Browser"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\KOA Browser\\DefaultIcon]');
  L.push('@="\\"' + exe + '\\",0"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\KOA Browser\\shell\\open\\command]');
  L.push('@="' + openCmd + '"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\KOA Browser\\InstallInfo]');
  L.push('@="KOA Browser"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\KOA Browser\\Capabilities]');
  L.push('"ApplicationName"="KOA Browser"');
  L.push('"ApplicationIcon"="\\"' + exe + '\\",0"');
  L.push('"ApplicationDescription"="KOA Browser - legno e arancione"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\KOA Browser\\Capabilities\\URLAssociations]');
  L.push('"http"="KOABrowserURL"');
  L.push('"https"="KOABrowserURL"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\KOA Browser\\Capabilities\\FileAssociations]');
  L.push('".htm"="KOABrowserHTML"');
  L.push('".html"="KOABrowserHTML"');
  L.push('".shtml"="KOABrowserHTML"');
  L.push('".xhtml"="KOABrowserHTML"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet\\KOA Browser\\Capabilities\\StartMenu]');
  L.push('"StartMenuInternet"="KOA Browser"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\RegisteredApplications]');
  L.push('"KOA Browser"="Software\\\\Clients\\\\StartMenuInternet\\\\KOA Browser\\\\Capabilities"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Classes\\KOABrowserURL]');
  L.push('@="KOA Browser URL"');
  L.push('"URL Protocol"=""', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Classes\\KOABrowserURL\\DefaultIcon]');
  L.push('@="\\"' + exe + '\\",0"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Classes\\KOABrowserURL\\shell\\open\\command]');
  L.push('@="' + openCmd + '"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Classes\\KOABrowserHTML]');
  L.push('@="KOA Browser HTML document"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Classes\\KOABrowserHTML\\DefaultIcon]');
  L.push('@="\\"' + exe + '\\",0"', '');
  L.push('[HKEY_CURRENT_USER\\Software\\Classes\\KOABrowserHTML\\shell\\open\\command]');
  L.push('@="' + openCmd + '"', '');
  return L.join('\r\n') + '\r\n';
}

function regImport(content) {
  return new Promise((resolve) => {
    try {
      const f = path.join(os.tmpdir(), 'koa-reg-' + Date.now() + '.reg');
      fs.writeFileSync(f, content);
      const p = spawn('reg.exe', ['import', f], { windowsHide: true });
      p.on('error', () => { try { fs.unlinkSync(f); } catch (e) {} resolve(false); });
      p.on('close', (code) => { try { fs.unlinkSync(f); } catch (e) {} resolve(code === 0); });
    } catch (e) { resolve(false); }
  });
}

function isBrowserRegistered() {
  return new Promise((resolve) => {
    try {
      const p = spawn('reg.exe', ['query', 'HKCU\\Software\\Clients\\StartMenuInternet\\KOA Browser', '/ve'], { windowsHide: true });
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
    } catch (e) { resolve(false); }
  });
}

async function registerAsBrowser() {
  try { return await regImport(koaRegContent()); }
  catch (e) { return false; }
}

function defaultBrowserStatus() {
  try {
    return { http: app.isDefaultProtocolClient('http'), https: app.isDefaultProtocolClient('https') };
  } catch (e) { return { http: false, https: false }; }
}

ipcMain.handle('zen:get-default-browser', async () => {
  const registered = await isBrowserRegistered();
  return { registered, ...defaultBrowserStatus() };
});

ipcMain.handle('zen:set-default-browser', async () => {
  await registerAsBrowser();
  let status = defaultBrowserStatus();
  try {
    if (!status.http) app.setAsDefaultProtocolClient('http');
    if (!status.https) app.setAsDefaultProtocolClient('https');
  } catch (e) {}
  status = defaultBrowserStatus();
  const registered = await isBrowserRegistered();
  if (!status.http || !status.https) {
    try { shell.openExternal('ms-settings:defaultapps'); } catch (e) {}
  }
  return { registered, ...status };
});

// Apri link/file passati all'exe (doppio clic con KOA predefinito) nella finestra esistente.
function externalUrlFromArg(a) {
  if (!a || typeof a !== 'string') return null;
  if (/^https?:\/\//i.test(a)) return a;
  if (/^[a-zA-Z]:\\/.test(a) && /\.(html?|xhtml?|shtml)$/i.test(a)) {
    return 'file:///' + a.replace(/\\/g, '/');
  }
  return null;
}

function openExternalInWindow(u) {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w || !u) return;
  if (!w.isVisible()) w.show();
  w.focus();
  try { w.webContents.send('zen:open-url', u); } catch (e) {}
}
// Menu contestuale e scorciatoie: opera sul webview cliccato
function guestContents(id) {
  try {
    const c = webContents.fromId(Number(id));
    return (c && !c.isDestroyed()) ? c : null;
  } catch (e) { return null; }
}
ipcMain.handle('zen:copy-text', (_e, text) => {
  try { clipboard.writeText(String(text ?? '')); } catch (e) {}
});
ipcMain.handle('zen:edit-action', (_e, id, action) => {
  const c = guestContents(id);
  if (!c) return;
  try {
    if (action === 'cut') c.cut();
    else if (action === 'copy') c.copy();
    else if (action === 'paste') c.paste();
    else if (action === 'selectAll') c.selectAll();
  } catch (e) {}
});
ipcMain.handle('zen:inspect', (_e, id, x, y) => {
  const c = guestContents(id);
  if (!c) return;
  try { c.inspectElement(Math.round(x || 0), Math.round(y || 0)); } catch (e) {}
});
ipcMain.handle('zen:print-tab', (_e, id) => {
  const c = guestContents(id);
  if (c) { try { c.print({ silent: false }); } catch (e) {} }
});
ipcMain.handle('zen:zoom-tab', (_e, id, mode) => {
  const c = guestContents(id);
  if (!c) return 1;
  try {
    let f = c.getZoomFactor() || 1;
    if (mode === 'in') f = Math.min(3, +(f + 0.1).toFixed(2));
    else if (mode === 'out') f = Math.max(0.3, +(f - 0.1).toFixed(2));
    else f = 1;
    c.setZoomFactor(f);
    return f;
  } catch (e) { return 1; }
});
ipcMain.handle('zen:fullscreen', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) return false;
  try { w.setFullScreen(!w.isFullScreen()); return w.isFullScreen(); } catch (e) { return false; }
});

ipcMain.handle('zen:fullscreen', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) return false;
  try { w.setFullScreen(!w.isFullScreen()); return w.isFullScreen(); } catch (e) { return false; }
});

// ================= Estensioni Chrome (motore GPL-3.0, vedi LICENSE) =================
let chromeExts = null;
const EXT_DIR = path.join(app.getPath('userData'), 'koa-extensions');
const EXT_STATE_FILE = path.join(app.getPath('userData'), 'koa-extensions.json');
const extKnownTabs = new Set();

function loadExtState() {
  try {
    const v = JSON.parse(fs.readFileSync(EXT_STATE_FILE, 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

function saveExtState(s) {
  try { fs.writeFileSync(EXT_STATE_FILE, JSON.stringify(s, null, 2)); } catch (e) {}
}

function extListPayload() {
  let loaded = [];
  try { loaded = session.defaultSession.getAllExtensions(); } catch (e) {}
  const st = loadExtState();
  const rows = loaded.map(x => {
    const rec = st.find(r => r.id === x.id);
    return { id: x.id, name: x.name, version: x.version, path: (rec && rec.path) || x.path || '', enabled: true };
  });
  st.filter(r => !loaded.some(x => x.id === r.id)).forEach(r => {
    rows.push({ id: r.id || null, name: r.name || path.basename(r.path || ''), version: '', path: r.path || '', enabled: false });
  });
  return rows;
}

function sendExtList() {
  let overrides = {};
  try { if (chromeExts) overrides = chromeExts.getURLOverrides() || {}; } catch (e) {}
  const payload = { extensions: extListPayload(), newtab: overrides.newtab || null };
  BrowserWindow.getAllWindows().forEach(w => {
    try { w.webContents.send('zen:ext-list', payload); } catch (e) {}
  });
}

function extEnsureTab(contentsId) {
  try {
    if (!contentsId || !chromeExts) return null;
    if (!extKnownTabs.has(contentsId)) {
      const c0 = webContents.fromId(Number(contentsId));
      if (!c0 || c0.isDestroyed()) return null;
      const w = BrowserWindow.getAllWindows()[0];
      if (w) chromeExts.addTab(c0, w);
      extKnownTabs.add(contentsId);
    }
    const c = webContents.fromId(Number(contentsId));
    return (c && !c.isDestroyed()) ? c : null;
  } catch (e) { return null; }
}

function setupChromeExtensions() {
  try {
    ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
    chromeExts = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session: session.defaultSession,
      createTab: async (details) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (!w) return [null, null];
        const url = (details && details.url) || '';
        const res = await new Promise((resolve) => {
          const token = 'et' + Date.now() + Math.floor(Math.random() * 1e6);
          const to = setTimeout(() => { ipcMain.removeListener('zen:ext-tab-created', h); resolve(null); }, 10000);
          const h = (_e, r) => {
            if (r && r.token === token) { clearTimeout(to); ipcMain.removeListener('zen:ext-tab-created', h); resolve(r); }
          };
          ipcMain.on('zen:ext-tab-created', h);
          try { w.webContents.send('zen:ext-create-tab', { token, url }); }
          catch (e) { clearTimeout(to); ipcMain.removeListener('zen:ext-tab-created', h); resolve(null); }
        });
        if (!res || !res.contentsId) return [null, null];
        return [extEnsureTab(Number(res.contentsId)), w];
      },
      selectTab: (contents) => {
        try {
          const w = BrowserWindow.getAllWindows()[0];
          if (w && contents) w.webContents.send('zen:ext-select-tab', contents.id);
        } catch (e) {}
      },
      removeTab: (contents) => {
        try {
          const w = BrowserWindow.getAllWindows()[0];
          if (w && contents) w.webContents.send('zen:ext-remove-tab', contents.id);
        } catch (e) {}
      }
    });
    chromeExts.on('browser-action-popup-created', (popup) => {
      try {
        popup.whenReady().then(() => {
          const bw = popup.browserWindow;
          if (bw && !bw.isDestroyed()) {
            try { bw.setAlwaysOnTop(true, 'pop-up-menu'); } catch (e) {}
            bw.on('blur', () => { try { popup.destroy(); } catch (e) {} });
          }
        }).catch(() => {});
      } catch (e) {}
    });
  } catch (e) { console.error('[ext]', e.message); }
}

async function loadPersistedExtensions() {
  const st = loadExtState();
  let changed = false;
  for (const rec of st) {
    if (!rec || rec.enabled === false) continue;
    try {
      if (rec.path && fs.existsSync(rec.path)) {
        const ext = await session.defaultSession.loadExtension(rec.path, { allowFileAccess: true });
        if (ext && ext.id && rec.id !== ext.id) { rec.id = ext.id; rec.name = ext.name; changed = true; }
      }
    } catch (e) { console.error('[ext] load fail:', rec.path, '-', e.message); }
  }
  if (changed) saveExtState(st);
  sendExtList();
}

ipcMain.on('zen:ext-tab', (_e, msg = {}) => {
  try {
    if (!chromeExts) return;
    const cid = Number((msg && msg.contentsId) || 0) || 0;
    if (msg.type === 'created' || msg.type === 'selected') {
      const c = extEnsureTab(cid);
      if (c && msg.type === 'selected') chromeExts.selectTab(c);
    } else if (msg.type === 'removed') {
      extKnownTabs.delete(cid);
      try {
        const c = webContents.fromId(cid);
        if (c) chromeExts.removeTab(c);
      } catch (e) {}
    }
  } catch (e) {}
});

ipcMain.handle('zen:ext-list', () => {
  let overrides = {};
  try { if (chromeExts) overrides = chromeExts.getURLOverrides() || {}; } catch (e) {}
  return { extensions: extListPayload(), newtab: overrides.newtab || null };
});

ipcMain.handle('zen:ext-load-folder', async () => {
  const w = BrowserWindow.getAllWindows()[0];
  const r = await dialog.showOpenDialog(w, {
    title: 'Seleziona cartella estensione (unpacked)',
    properties: ['openDirectory']
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const src = r.filePaths[0];
  if (!fs.existsSync(path.join(src, 'manifest.json'))) {
    return { ok: false, error: 'manifest.json non trovato: serve una cartella unpacked (MV2 consigliato).' };
  }
  try { fs.mkdirSync(EXT_DIR, { recursive: true }); } catch (e) {}
  const dest = path.join(EXT_DIR, path.basename(src));
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    const ext = await session.defaultSession.loadExtension(dest, { allowFileAccess: true });
    const st = loadExtState().filter(x => x.id !== ext.id);
    st.push({ id: ext.id, name: ext.name, path: dest, enabled: true });
    saveExtState(st);
    sendExtList();
    return { ok: true, id: ext.id, name: ext.name };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('zen:ext-toggle', async (_e, id, on) => {
  const st = loadExtState();
  const rec = st.find(x => x.id === id);
  if (!rec) return { ok: false, error: 'estensione non trovata' };
  rec.enabled = !!on;
  try {
    if (on) {
      if (rec.path && fs.existsSync(rec.path)) {
        const ext = await session.defaultSession.loadExtension(rec.path, { allowFileAccess: true });
        if (ext && ext.id) { rec.id = ext.id; rec.name = ext.name; }
      }
    } else {
      extKnownTabs.clear();
      session.defaultSession.removeExtension(id);
    }
  } catch (e) { saveExtState(st); sendExtList(); return { ok: false, error: e.message }; }
  saveExtState(st);
  sendExtList();
  return { ok: true };
});

ipcMain.handle('zen:ext-remove', async (_e, id) => {
  try { session.defaultSession.removeExtension(id); } catch (e) {}
  extKnownTabs.clear();
  saveExtState(loadExtState().filter(x => x.id !== id));
  sendExtList();
  return { ok: true };
});

// ================= Gestore download stile Chrome + turbo multi-connessione =================
// Intercetta will-download: niente dialog, salva in ~/KOA Downloads, traccia tutto.
// Se il server supporta i Range e il file supera 2MB → 8 connessioni parallele.
const DL_DIR = path.join(app.getPath('downloads'), 'KOA Downloads');
const dlActive = new Map();
let dlSeq = 0;

function dlSend(payload) {
  BrowserWindow.getAllWindows().forEach(w => {
    try { w.webContents.send('zen:dl-event', payload); } catch (e) {}
  });
}

function safeFileName(name) {
  const clean = String(name || 'download').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 120);
  return clean || 'download';
}

function uniquePath(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(name), base = path.basename(name, ext);
  let i = 1;
  while (fs.existsSync(p = path.join(dir, base + ' (' + i + ')' + ext))) i++;
  return p;
}

async function sessionCookies(url) {
  try {
    const list = await session.defaultSession.cookies.get({ url });
    return list.map(c => c.name + '=' + c.value).join('; ');
  } catch (e) { return ''; }
}

function trackNativeDownload(item, savePath, name) {
  const id = 'dl' + (++dlSeq) + Date.now().toString(36);
  const rec = { kind: 'native', item, path: savePath, name, lastT: Date.now(), lastB: 0, speed: 0 };
  dlActive.set(id, rec);
  dlSend({ id, name, state: 'active', received: 0, total: item.getTotalBytes() || 0, speed: 0, path: savePath });
  item.on('updated', () => {
    try {
      const now = Date.now();
      const b = item.getReceivedBytes();
      const dt = (now - rec.lastT) / 1000;
      if (dt > 0.25) {
        const inst = (b - rec.lastB) / dt;
        rec.speed = rec.speed ? rec.speed * 0.7 + inst * 0.3 : inst;
        rec.lastT = now; rec.lastB = b;
      }
      dlSend({ id, name, state: 'active', received: b, total: item.getTotalBytes() || 0, speed: Math.round(rec.speed), path: savePath });
    } catch (e) {}
  });
  item.on('done', (_e, state) => {
    dlActive.delete(id);
    try {
      if (state === 'completed') dlSend({ id, name, state: 'done', received: item.getReceivedBytes(), total: item.getTotalBytes() || 0, speed: 0, path: savePath });
      else if (state === 'cancelled') dlSend({ id, name, state: 'cancelled' });
      else dlSend({ id, name, state: 'error', message: 'Download interrotto' });
    } catch (e) {}
  });
}

async function singleFetch(url, headers, dest, tick, abort, rec) {
  const res = await fetch(url, { headers, signal: abort.signal });
  if (!res.ok || !res.body) throw new Error('download HTTP ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(dest);
  let done = 0;
  await new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    (async () => {
      try {
        for await (const chunk of res.body) {
          if (rec.cancelled) { out.destroy(); reject(new Error('cancelled')); return; }
          if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
          done += chunk.length;
          tick(done, total);
        }
        out.end();
      } catch (e) { try { out.destroy(e); } catch (_) {} reject(e); }
    })();
  });
}

async function multiFetch(url, headers, dest, total, tick, abort) {
  const N = 8;
  const partSize = Math.ceil(total / N);
  const parts = [];
  for (let i = 0; i < N; i++) {
    const start = i * partSize;
    const end = Math.min(total - 1, start + partSize - 1);
    if (start > end) break;
    parts.push(dest + '.part' + i);
  }
  let done = 0;
  await Promise.all(parts.map((part, i) => (async () => {
    const start = i * partSize;
    const end = Math.min(total - 1, start + partSize - 1);
    const res = await fetch(url, { headers: { ...headers, Range: 'bytes=' + start + '-' + end }, signal: abort.signal });
    if (res.status !== 206 || !res.body) throw new Error('range non supportato');
    const out = fs.createWriteStream(part);
    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
      (async () => {
        try {
          for await (const chunk of res.body) {
            if (abort.signal.aborted) { out.destroy(); reject(new Error('cancelled')); return; }
            if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
            done += chunk.length;
            tick(done, total);
          }
          out.end();
        } catch (e) { try { out.destroy(e); } catch (_) {} reject(e); }
      })();
    });
  })()));
  const out = fs.createWriteStream(dest);
  for (const part of parts) {
    await new Promise((resolve, reject) => {
      const s = fs.createReadStream(part);
      s.on('error', reject);
      s.on('end', resolve);
      s.pipe(out, { end: false });
    });
    try { fs.unlinkSync(part); } catch (e) {}
  }
  out.end();
  await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
}

async function turboDownload(url, destPath, name, id) {
  const cookie = await sessionCookies(url);
  const headers = { 'User-Agent': session.defaultSession.getUserAgent(), ...(cookie ? { Cookie: cookie } : {}) };
  const abort = new AbortController();
  const rec = { kind: 'fetch', controller: abort, path: destPath, name, cancelled: false, received: 0, total: 0, speed: 0, lastT: Date.now(), lastB: 0 };
  dlActive.set(id, rec);
  const tick = (b, total) => {
    rec.received = b; rec.total = total;
    const now = Date.now();
    const dt = (now - rec.lastT) / 1000;
    if (dt > 0.25) {
      const inst = (b - rec.lastB) / dt;
      rec.speed = rec.speed ? rec.speed * 0.7 + inst * 0.3 : inst;
      rec.lastT = now; rec.lastB = b;
    }
    dlSend({ id, name, state: 'active', received: b, total, speed: Math.round(rec.speed), path: destPath });
  };
  let total = 0, ranged = false;
  try {
    const h = await fetch(url, { method: 'HEAD', headers, signal: abort.signal });
    const len = Number(h.headers.get('content-length')) || 0;
    const acc = (h.headers.get('accept-ranges') || '').toLowerCase();
    if (h.ok && acc.includes('bytes') && len > 2 * 1048576) { total = len; ranged = true; }
  } catch (e) {}
  if (ranged) {
    try { await multiFetch(url, headers, destPath, total, tick, abort); }
    catch (e) {
      if (rec.cancelled) throw new Error('cancelled');
      await singleFetch(url, headers, destPath, tick, abort, rec);
    }
  } else {
    await singleFetch(url, headers, destPath, tick, abort, rec);
  }
  dlActive.delete(id);
  const st = fs.statSync(destPath);
  dlSend({ id, name, state: 'done', received: st.size, total: total || st.size, speed: 0, path: destPath });
}

session.defaultSession.on('will-download', (event, item) => {
  try {
    const url = item.getURL() || '';
    const name = safeFileName(item.getFilename() || 'download');
    const dest = uniquePath(DL_DIR, name);
    if (/^https?:\/\//i.test(url)) {
      // Turbo nostro: niente dialog, multi-connessione quando conviene.
      const id = 'dl' + (++dlSeq) + Date.now().toString(36);
      dlSend({ id, name, state: 'active', received: 0, total: item.getTotalBytes() || 0, speed: 0, path: dest });
      try { item.cancel(); } catch (e) {}
      turboDownload(url, dest, name, id).catch((e) => {
        dlActive.delete(id);
        const msg = String((e && e.message) || e);
        if (msg === 'cancelled') dlSend({ id, name, state: 'cancelled' });
        else dlSend({ id, name, state: 'error', message: msg });
      });
    } else {
      // blob:/data: e simili: download nativo Chromium, solo tracciato.
      try { item.setSavePath(dest); } catch (e) {}
      trackNativeDownload(item, dest, name);
    }
  } catch (e) {}
});

ipcMain.handle('zen:dl-action', (_e, req = {}) => {
  const { id, action, path: p } = req;
  const rec = id ? dlActive.get(id) : null;
  try {
    if (action === 'cancel') {
      if (!rec) return false;
      if (rec.kind === 'native') { try { rec.item.cancel(); } catch (e) {} }
      else { rec.cancelled = true; try { rec.controller.abort(); } catch (e) {} }
      return true;
    }
    if (action === 'open') {
      const target = (rec && rec.path) || p;
      if (target && fs.existsSync(target)) shell.openPath(target);
      return true;
    }
    if (action === 'folder') {
      const target = (rec && rec.path) || p;
      if (target && fs.existsSync(target)) shell.showItemInFolder(target);
      else shell.openPath(DL_DIR);
      return true;
    }
  } catch (e) {}
  return false;
});
// Controlli finestra custom (frame:false)
ipcMain.handle('zen:win-min', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize(); });
ipcMain.handle('zen:win-max-toggle', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) { if (w.isMaximized()) w.unmaximize(); else w.maximize(); }
});
ipcMain.handle('zen:win-close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close(); });
ipcMain.handle('zen:win-is-max', (e) => { const w = BrowserWindow.fromWebContents(e.sender); return !!(w && w.isMaximized()); });

function setupTray() {
  try {
    tray = new Tray(path.join(__dirname, 'assets', 'icon.ico'));
    tray.setToolTip('KOA Browser');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Mostra KOA Browser', click: () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus(); } } },
      { label: 'Controlla ZENdate', click: () => checkForUpdates('tray') },
      { type: 'separator' },
      { label: 'Esci', click: () => { willQuit = true; app.quit(); } }
    ]));
    tray.on('click', () => {
      const w = BrowserWindow.getAllWindows()[0];
      if (!w) return;
      if (w.isVisible()) w.hide(); else { w.show(); w.focus(); }
    });
  } catch (e) { console.error('[tray]', e.message); }
}

// ================= KOA Vault — password cifrate, solo con PIN =================
// PIN mai salvato: PBKDF2 → chiave AES-256-GCM. In memoria solo a sblocco avvenuto,
// con autoblocco dopo 5 minuti di inutilizzo. Tentativi limitati anti-forza bruta.
const VAULT_FILE = path.join(app.getPath('userData'), 'koa-vault.json');
const VAULT_PBKDF2_ITER = 250000;
const VAULT_LOCK_MS = 5 * 60 * 1000;
let vaultKey = null;
let vaultLockTimer = 0;
let vaultAttempts = 0;
let vaultLockoutUntil = 0;
const vaultPending = []; // catture arrivate a vault bloccato (solo memoria)

function vaultReadFile() {
  try { return JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8')); }
  catch (e) { return null; }
}

function vaultWriteFile(obj) {
  fs.writeFileSync(VAULT_FILE, JSON.stringify(obj));
}

function vaultTouch() {
  clearTimeout(vaultLockTimer);
  vaultLockTimer = setTimeout(() => { vaultKey = null; }, VAULT_LOCK_MS);
}

function vaultDecrypt() {
  const f = vaultReadFile();
  if (!f || !f.iv || !f.data || !vaultKey) return [];
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey, Buffer.from(f.iv, 'hex'));
    const auth = f.auth || '';
    if (auth) decipher.setAuthTag(Buffer.from(auth, 'hex'));
    const plain = Buffer.concat([decipher.update(Buffer.from(f.data, 'hex')), decipher.final()]).toString('utf8');
    const arr = JSON.parse(plain);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function vaultEncrypt(list) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(list), 'utf8'), cipher.final()]);
  const f = vaultReadFile() || {};
  f.iv = iv.toString('hex');
  f.auth = cipher.getAuthTag().toString('hex');
  f.data = enc.toString('hex');
  f.updatedAt = Date.now();
  vaultWriteFile(f);
}

ipcMain.handle('zen:vault-status', () => {
  return {
    exists: !!vaultReadFile(),
    unlocked: !!vaultKey,
    pending: vaultPending.length,
    lockout: Math.max(0, vaultLockoutUntil - Date.now())
  };
});

ipcMain.handle('zen:vault-setup', (_e, pin) => {
  if (vaultReadFile()) return { ok: false, error: 'esiste già' };
  pin = String(pin || '');
  if (pin.length < 4) return { ok: false, error: 'PIN troppo corto (min 4)' };
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(pin, salt, VAULT_PBKDF2_ITER, 32, 'sha256');
  vaultWriteFile({
    salt: salt.toString('hex'),
    verifier: crypto.createHash('sha256').update(key).digest('hex'),
    iv: '', auth: '', data: '', updatedAt: Date.now()
  });
  vaultKey = key;
  vaultAttempts = 0;
  vaultTouch();
  return { ok: true };
});

ipcMain.handle('zen:vault-unlock', (_e, pin) => {
  if (Date.now() < vaultLockoutUntil) {
    return { ok: false, error: 'troppi tentativi: riprova tra poco', lockout: vaultLockoutUntil - Date.now() };
  }
  const f = vaultReadFile();
  if (!f || !f.salt) return { ok: false, error: 'nessun vault' };
  const key = crypto.pbkdf2Sync(String(pin || ''), Buffer.from(f.salt, 'hex'), VAULT_PBKDF2_ITER, 32, 'sha256');
  const good = (() => {
    try {
      return crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(key).digest('hex')), Buffer.from(f.verifier || '', 'utf8'));
    } catch (e) { return false; }
  })();
  if (!good) {
    vaultAttempts++;
    if (vaultAttempts >= 5) {
      vaultLockoutUntil = Date.now() + 30000;
      vaultAttempts = 0;
      return { ok: false, error: 'troppi tentativi: attesa 30s', lockout: 30000 };
    }
    return { ok: false, error: 'PIN errato' };
  }
  vaultKey = key;
  vaultAttempts = 0;
  vaultTouch();
  return { ok: true, pending: vaultPending.length };
});

ipcMain.handle('zen:vault-lock', () => {
  vaultKey = null;
  clearTimeout(vaultLockTimer);
  return { ok: true };
});

function vaultNeedUnlock() {
  if (!vaultKey) throw new Error('vault bloccato');
  vaultTouch();
}

ipcMain.handle('zen:vault-list', () => {
  try {
    vaultNeedUnlock();
    return { ok: true, items: vaultDecrypt().map(x => ({ id: x.id, origin: x.origin, user: x.user, updatedAt: x.updatedAt || 0 })) };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('zen:vault-reveal', (_e, id) => {
  try {
    vaultNeedUnlock();
    const it = vaultDecrypt().find(x => x.id === id);
    return it ? { ok: true, pass: it.pass } : { ok: false, error: 'non trovata' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('zen:vault-fill', (_e, origin) => {
  try {
    vaultNeedUnlock();
    const it = vaultDecrypt().filter(x => x.origin === origin).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    return it ? { ok: true, user: it.user, pass: it.pass } : { ok: false };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('zen:vault-save', (_e, rec = {}) => {
  try {
    vaultNeedUnlock();
    const origin = String(rec.origin || '').slice(0, 200);
    const user = String(rec.user || '').slice(0, 160);
    const pass = String(rec.pass || '').slice(0, 512);
    if (!origin || !pass) return { ok: false, error: 'mancano dati' };
    const list = vaultDecrypt();
    const ix = list.findIndex(x => x.origin === origin && x.user === user);
    const row = { id: 'v' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), origin, user, pass, updatedAt: Date.now() };
    if (ix === -1) list.unshift(row);
    else list[ix] = { ...list[ix], pass, updatedAt: Date.now() };
    vaultEncrypt(list.slice(0, 200));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('zen:vault-delete', (_e, id) => {
  try {
    vaultNeedUnlock();
    vaultEncrypt(vaultDecrypt().filter(x => x.id !== id));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('zen:vault-pending', () => {
  try {
    vaultNeedUnlock();
    return { ok: true, items: vaultPending.map((p, i) => ({ idx: i, origin: p.origin, user: p.user, t: p.t })) };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('zen:vault-discard-pending', (_e, idx) => {
  try {
    vaultNeedUnlock();
    vaultPending.splice(Number(idx), 1);
    return { ok: true, pending: vaultPending.length };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('zen:vault-save-pending', (_e, idx) => {
  try {
    vaultNeedUnlock();
    const p = vaultPending[Number(idx)];
    if (!p) return { ok: false };
    const list = vaultDecrypt();
    const ix = list.findIndex(x => x.origin === p.origin && x.user === p.user);
    if (ix === -1) {
      list.unshift({ id: 'v' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), origin: p.origin, user: p.user, pass: p.pass, updatedAt: Date.now() });
    } else {
      list[ix] = { ...list[ix], pass: p.pass, updatedAt: Date.now() };
    }
    vaultEncrypt(list.slice(0, 200));
    vaultPending.splice(Number(idx), 1);
    return { ok: true, pending: vaultPending.length };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Catture dai webview: se sbloccato salva/aggiorna da solo, se no va in coda.
ipcMain.handle('zen:vault-capture', (_e, rec = {}) => {
  try {
    const origin = String(rec.origin || '').slice(0, 200);
    const user = String(rec.user || '').slice(0, 160);
    const pass = String(rec.pass || '').slice(0, 512);
    if (!origin || !origin.startsWith('http') || !pass) return { ok: false };
    if (!vaultKey) {
      const same = vaultPending.findIndex(p => p.origin === origin && p.user === user);
      const row = { origin, user, pass, t: Date.now() };
      if (same === -1) { vaultPending.unshift(row); if (vaultPending.length > 20) vaultPending.pop(); }
      else vaultPending[same] = row;
      return { ok: true, queued: true, pending: vaultPending.length };
    }
    vaultTouch();
    const list = vaultDecrypt();
    const ix = list.findIndex(x => x.origin === origin && x.user === user);
    if (ix === -1) {
      list.unshift({ id: 'v' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), origin, user, pass, updatedAt: Date.now() });
      vaultEncrypt(list.slice(0, 200));
      return { ok: true, saved: true };
    }
    if (list[ix].pass !== pass) {
      list[ix] = { ...list[ix], pass, updatedAt: Date.now() };
      vaultEncrypt(list);
      return { ok: true, updated: true };
    }
    return { ok: true };
  } catch (e) { return { ok: false }; }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const u = (argv || []).slice(1).map(externalUrlFromArg).find(Boolean);
    if (u) openExternalInWindow(u);
    else {
      const w = BrowserWindow.getAllWindows()[0];
      if (w) { w.show(); w.focus(); }
    }
  });

  // ================= ZENdate ISTANTANEO — interfaccia senza riavvio =================
// Bundle UI verificato in userData: gli update solo-interfaccia si applicano
// con un semplice reload, senza toccare l'exe né i percorsi.
const UI_FILES = {
  'index.html': 'index.html',
  'preload.js': 'preload.js',
  'vault-preload.js': 'vault-preload.js',
  'logo.svg': 'assets/logo.svg',
  'start.html': 'start.html'
};

function uiDir() {
  return path.join(app.getPath('userData'), 'koa-ui');
}

function localUiVersion() {
  try { return fs.readFileSync(path.join(uiDir(), 'ui-version.txt'), 'utf8').trim() || null; }
  catch (e) { return null; }
}

function uiFilesPresent() {
  try {
    return Object.values(UI_FILES).every(rel => fs.existsSync(path.join(uiDir(), rel)));
  } catch (e) { return false; }
}

// Usa la UI locale solo se pari o più nuova dell'exe; altrimenti quella integrata
// (e pulisce bundle vecchi che ombreggiano release exe più nuove).
function effectiveUiPath() {
  try {
    const local = localUiVersion();
    if (!local || !uiFilesPresent()) return null;
    const exe = app.getVersion();
    if (zendateNewer(exe, local)) {
      try { fs.rmSync(uiDir(), { recursive: true, force: true }); } catch (e) {}
      return null;
    }
    return uiDir();
  } catch (e) { return null; }
}

async function applyUiUpdate(ui) {
  const files = (ui && ui.files) || {};
  const base = String(ui.base || '');
  const sep = base.endsWith('/') ? '' : '/';
  const dir = uiDir();
  const tmp = dir + '.tmp';
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  for (const flat of Object.keys(files)) {
    const rel = UI_FILES[flat];
    if (!rel) continue;
    const res = await fetch(base + sep + flat, { cache: 'no-store' });
    if (!res.ok) throw new Error('UI HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const digest = crypto.createHash('sha256').update(buf).digest('hex');
    if (digest.toLowerCase() !== String(files[flat]).toLowerCase()) {
      throw new Error('hash UI non corrispondente (' + flat + ')');
    }
    const dest = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  fs.writeFileSync(path.join(dir, 'ui-version.txt'), String(ui.version));
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { try { w.loadFile(path.join(dir, 'index.html')); } catch (e) {} }
}

app.whenReady().then(() => {
    setupTray();
    setupChromeExtensions();
    loadPersistedExtensions();
    // Supervisor differito: la finestra nasce subito, le liste si caricano dopo.
    setTimeout(setupSupervisor, 3000);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Registrazione silenziosa come browser (idempotente): così Windows elenca KOA.
    // Il pulsante nelle Impostazioni la forza + imposta il default.
    setTimeout(() => { registerAsBrowser().catch(() => {}); }, 8000);
    // Controllo automatico all'entrata: se trova update, scarica e installa da solo.
    setTimeout(() => checkForUpdates('auto'), 5000);
    // Link/file aperti con KOA predefinito all'avvio.
    setTimeout(() => {
      const u = (process.argv || []).slice(1).map(externalUrlFromArg).find(Boolean);
      if (u) openExternalInWindow(u);
    }, 1200);
    if (process.argv.includes('--zendate-updated')) {
      setTimeout(() => sendUpdate({ state: 'installed', version: app.getVersion() }), 1500);
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
