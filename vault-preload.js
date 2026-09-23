// KOA Vault — cattura credenziali dai form di login.
// Gira DENTRO ogni webview (preload dedicato): intercetta submit e Invio
// sui campi password e li inoltra all'host via ipc-message. Mai in chiaro su disco.
const { ipcRenderer } = require('electron');

function vaultFindUser(scope) {
  try {
    const q = (s) => (scope.querySelector(s) || document.querySelector(s));
    const u = q('input[autocomplete="username"]') || q('input[type="email"]') ||
      q('input[name*="user" i]') || q('input[name*="login" i]') ||
      q('input[name*="email" i]') || q('input[type="text"]');
    return (u && u.value ? String(u.value).slice(0, 160) : '');
  } catch (e) { return ''; }
}

function vaultSend(pwEl) {
  try {
    if (!pwEl || !pwEl.value) return;
    const form = (pwEl.form && pwEl.form.tagName === 'FORM') ? pwEl.form : null;
    const scope = form || document;
    let user = vaultFindUser(scope);
    if (!user) {
      const all = Array.from(document.querySelectorAll('input[type="text"], input[type="email"]'));
      const typed = all.map(i => (i.value || '').trim()).filter(v => v.length > 0);
      user = (typed[0] || '').slice(0, 160);
    }
    ipcRenderer.sendToHost('vault-capture', {
      origin: location.origin,
      user: user,
      pass: String(pwEl.value).slice(0, 512)
    });
  } catch (e) {}
}

document.addEventListener('submit', (e) => {
  try {
    const f = e.target && e.target.tagName === 'FORM' ? e.target : null;
    const pw = f ? f.querySelector('input[type="password"]') : null;
    if (pw) vaultSend(pw);
  } catch (e) {}
}, true);

document.addEventListener('keydown', (e) => {
  try {
    if (e.key === 'Enter' && e.target && e.target.type === 'password') vaultSend(e.target);
  } catch (e) {}
}, true);
