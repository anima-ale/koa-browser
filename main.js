const { app, BrowserWindow, Menu, Tray, ipcMain, session } = require('electron');
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
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'KOA Browser v' + app.getVersion(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true, // abilita il tag <webview> nell'interfaccia
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');

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

  app.whenReady().then(() => {
    setupTray();
    setupSupervisor();
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
