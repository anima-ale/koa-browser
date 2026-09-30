// ══════════════════════════════════════════════════════
// ZEN ACCOUNT — Login
// POST /.netlify/functions/auth-login
// body: { username, password }
// ══════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const { getStore, connectLambda } = require('@netlify/blobs');
const { createToken, jsonResponse } = require('./_session');
const { normalizeUsername } = require('./_validate');

exports.handler = async (event) => {
  connectLambda(event); // richiesto in Lambda compatibility mode prima di usare getStore()
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

  const username = normalizeUsername(body.username);
  const { password } = body;

  if (!username || !password) return jsonResponse(400, { error: 'Username e password sono obbligatori.' });

  const store = getStore('zen-accounts');
  const key = `user:${username}`;
  const account = await store.get(key, { type: 'json' });

  // Messaggio generico per non rivelare se l'username esiste o no
  if (!account) return jsonResponse(401, { error: 'Credenziali non valide.' });

  const passwordOk = await bcrypt.compare(password, account.passwordHash);
  if (!passwordOk) return jsonResponse(401, { error: 'Credenziali non valide.' });

  const token = createToken({ username });
  const { passwordHash: _omit, ...safeAccount } = account;
  return jsonResponse(200, { token, account: safeAccount });
};
