// Qui puoi esporre in modo sicuro funzioni al renderer tramite contextBridge,
// se in futuro ti serve comunicare con il processo main (es. salvare i preferiti,
// gestire la cronologia su file, ecc.)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
  // ZEN Supervisor: attiva/disattiva anti-tracker + anti-pubblicità
  setSupervisor: (on) => ipcRenderer.invoke('zen:supervisor', !!on),
  // ZEN Supervisor: statistiche live dal main process
  onSupervisorStats: (cb) => ipcRenderer.on('zen:supervisor-stats', (_e, s) => { try { cb(s); } catch (e) {} }),
  // ZENdate MAX: versione, controllo aggiornamenti, stati live
  getVersion: () => ipcRenderer.invoke('zen:get-version'),
  checkUpdate: () => ipcRenderer.invoke('zen:check-update'),
  toggleDevTools: () => ipcRenderer.invoke('zen:toggle-devtools'),
  // Browser predefinito reale
  getDefaultBrowser: () => ipcRenderer.invoke('zen:get-default-browser'),
  setDefaultBrowser: () => ipcRenderer.invoke('zen:set-default-browser'),
  onOpenUrl: (cb) => ipcRenderer.on('zen:open-url', (_e, u) => { try { cb(u); } catch (e) {} }),
  // Download manager
  dlAction: (req) => ipcRenderer.invoke('zen:dl-action', req),
  onDownloadEvent: (cb) => ipcRenderer.on('zen:dl-event', (_e, s) => { try { cb(s); } catch (e) {} }),
  // Menu contestuale + scorciatoie
  copyText: (text) => ipcRenderer.invoke('zen:copy-text', text),
  editAction: (id, action) => ipcRenderer.invoke('zen:edit-action', id, action),
  inspectTab: (id, x, y) => ipcRenderer.invoke('zen:inspect', id, x, y),
  printTab: (id) => ipcRenderer.invoke('zen:print-tab', id),
  zoomTab: (id, mode) => ipcRenderer.invoke('zen:zoom-tab', id, mode),
  toggleFullscreen: () => ipcRenderer.invoke('zen:fullscreen'),
  onUpdateStatus: (cb) => ipcRenderer.on('zen:update-status', (_e, s) => { try { cb(s); } catch (e) {} }),
  // KOA Vault: password cifrate, solo con PIN (chiave mai nel renderer)
  vaultStatus: () => ipcRenderer.invoke('zen:vault-status'),
  vaultSetup: (pin) => ipcRenderer.invoke('zen:vault-setup', pin),
  vaultUnlock: (pin) => ipcRenderer.invoke('zen:vault-unlock', pin),
  vaultLock: () => ipcRenderer.invoke('zen:vault-lock'),
  vaultList: () => ipcRenderer.invoke('zen:vault-list'),
  vaultReveal: (id) => ipcRenderer.invoke('zen:vault-reveal', id),
  vaultFill: (origin) => ipcRenderer.invoke('zen:vault-fill', origin),
  vaultSave: (rec) => ipcRenderer.invoke('zen:vault-save', rec),
  vaultDelete: (id) => ipcRenderer.invoke('zen:vault-delete', id),
  vaultPending: () => ipcRenderer.invoke('zen:vault-pending'),
  vaultSavePending: (idx) => ipcRenderer.invoke('zen:vault-save-pending', idx),
  vaultDiscardPending: (idx) => ipcRenderer.invoke('zen:vault-discard-pending', idx),
  vaultCapture: (rec) => ipcRenderer.invoke('zen:vault-capture', rec)
});
