// ══════════════════════════════════════════════════════
// ZEN ACCOUNT — Cambio password
// POST /.netlify/functions/auth-change-password
// header: Authorization: Bearer <token>
// body: { oldPassword, newPassword }
// ══════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const { getStore, connectLambda } = require('@netlify/blobs');
const { verifyToken, getTokenFromEvent, jsonResponse } = require('./_session');
const { validatePassword } = require('./_validate');

exports.handler = async (event) => {
  connectLambda(event); // richiesto in Lambda compatibility mode prima di usare getStore()
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const token = getTokenFromEvent(event);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return jsonResponse(401, { error: 'Sessione non valida. Accedi di nuovo.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

  const { oldPassword, newPassword } = body;
  const passwordErr = validatePassword(newPassword);
  if (passwordErr) return jsonResponse(400, { error: passwordErr });

  const store = getStore('zen-accounts');
  const key = `user:${payload.username}`;
  const account = await store.get(key, { type: 'json' });
  if (!account) return jsonResponse(404, { error: 'Account non trovato.' });

  const oldOk = await bcrypt.compare(oldPassword || '', account.passwordHash);
  if (!oldOk) return jsonResponse(401, { error: 'La password attuale non è corretta.' });

  account.passwordHash = await bcrypt.hash(newPassword, 10);
  await store.setJSON(key, account);

  return jsonResponse(200, { success: true });
};
