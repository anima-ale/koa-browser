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
  getDefaultBrowser: () => ipcRenderer.invoke('zen:get-default-browser'),
  setDefaultBrowser: () => ipcRenderer.invoke('zen:set-default-browser'),
  toggleDevTools: () => ipcRenderer.invoke('zen:toggle-devtools'),
  // Menu contestuale + scorciatoie
  copyText: (text) => ipcRenderer.invoke('zen:copy-text', text),
  editAction: (id, action) => ipcRenderer.invoke('zen:edit-action', id, action),
  inspectTab: (id, x, y) => ipcRenderer.invoke('zen:inspect', id, x, y),
  printTab: (id) => ipcRenderer.invoke('zen:print-tab', id),
  zoomTab: (id, mode) => ipcRenderer.invoke('zen:zoom-tab', id, mode),
  toggleFullscreen: () => ipcRenderer.invoke('zen:fullscreen'),
  // Controlli finestra custom (frame:false)
  winMin: () => ipcRenderer.invoke('zen:win-min'),
  winMaxToggle: () => ipcRenderer.invoke('zen:win-max-toggle'),
  winClose: () => ipcRenderer.invoke('zen:win-close'),
  winIsMax: () => ipcRenderer.invoke('zen:win-is-max'),
  onWinMaxChanged: (cb) => ipcRenderer.on('zen:win-max-changed', (_e, m) => { try { cb(m); } catch (e) {} }),
  onUpdateStatus: (cb) => ipcRenderer.on('zen:update-status', (_e, s) => { try { cb(s); } catch (e) {} })
});
