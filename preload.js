// Qui puoi esporre in modo sicuro funzioni al renderer tramite contextBridge,
// se in futuro ti serve comunicare con il processo main (es. salvare i preferiti,
// gestire la cronologia su file, ecc.)

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
  // ZEN Supervisor: attiva/disattiva anti-tracker + anti-pubblicità
  setSupervisor: (on) => ipcRenderer.invoke('zen:supervisor', !!on),
  // ZEN Supervisor: statistiche live dal main process
  onSupervisorStats: (cb) => ipcRenderer.on('zen:supervisor-stats', (_e, s) => { try { cb(s); } catch (e) {} }),
  // ZENdate MAX: versione, controllo aggiornamenti, stati live
  getVersion: () => ipcRenderer.invoke('zen:get-version'),
  checkUpdate: () => ipcRenderer.invoke('zen:check-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('zen:update-status', (_e, s) => { try { cb(s); } catch (e) {} })
});
