// ══════════════════════════════════════════════════════
// ZEN ACCOUNT — Validazione input
// ══════════════════════════════════════════════════════

function normalizeUsername(username) {
  return (username || '').trim().toLowerCase();
}

function validateUsername(username) {
  const u = normalizeUsername(username);
  if (u.length < 3) return 'Lo username deve avere almeno 3 caratteri.';
  if (u.length > 24) return 'Lo username può avere massimo 24 caratteri.';
  if (!/^[a-z0-9_.]+$/.test(u)) return 'Lo username può contenere solo lettere, numeri, punto e underscore.';
  return null;
}

function validatePassword(password) {
  if (!password || password.length < 6) return 'La password deve avere almeno 6 caratteri.';
  if (password.length > 128) return 'Password troppo lunga.';
  return null;
}

module.exports = { normalizeUsername, validateUsername, validatePassword };
