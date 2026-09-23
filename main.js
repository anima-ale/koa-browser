const { app, BrowserWindow, Menu, Tray, ipcMain, session, shell, webContents, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Niente barra dei menu File/Edit/View: finestra pulita stile browser.
Menu.setApplicationMenu(null);

const { ElectronBlocker } = require('@ghostery/adblocker-electron');

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

// ---- Browser predefinito (http/https). Su Windows 11 la scelta manuale
// nelle Impostazioni è obbligatoria: se il set programmatico fallisce, le apriamo.
function defaultBrowserStatus() {
  try {
    return { http: app.isDefaultProtocolClient('http'), https: app.isDefaultProtocolClient('https') };
  } catch (e) { return { http: false, https: false }; }
}

ipcMain.handle('zen:get-default-browser', () => defaultBrowserStatus());
ipcMain.handle('zen:set-default-browser', () => {
  let status = defaultBrowserStatus();
  try {
    if (!status.http) app.setAsDefaultProtocolClient('http');
    if (!status.https) app.setAsDefaultProtocolClient('https');
  } catch (e) {}
  status = defaultBrowserStatus();
  if (!status.http || !status.https) {
    try { shell.openExternal('ms-settings:defaultapps'); } catch (e) {}
  }
  return status;
});
ipcMain.handle('zen:toggle-devtools', () => {
  const w = BrowserWindow.getFocusedWindow();
  if (w) { try { w.webContents.toggleDevTools(); } catch (e) {} }
});
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { w.show(); w.focus(); }
  });

  // ================= ZENdate ISTANTANEO — interfaccia senza riavvio =================
// Bundle UI verificato in userData: gli update solo-interfaccia si applicano
// con un semplice reload, senza toccare l'exe né i percorsi.
const UI_FILES = {
  'index.html': 'index.html',
  'preload.js': 'preload.js',
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
    // Supervisor differito: la finestra nasce subito, le liste si caricano dopo.
    setTimeout(setupSupervisor, 3000);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Controllo automatico all'entrata: se trova update, scarica e installa da solo.
    setTimeout(() => checkForUpdates('auto'), 5000);
    if (process.argv.includes('--zendate-updated')) {
      setTimeout(() => sendUpdate({ state: 'installed', version: app.getVersion() }), 1500);
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
