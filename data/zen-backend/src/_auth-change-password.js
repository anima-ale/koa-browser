const bcrypt = require('bcryptjs');
const { getStore } = require('./_db');
const { verifyToken, getTokenFromReq } = require('./_session');
const { validatePassword } = require('./_validate');
const { cors, parseBody } = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  if (!payload || !payload.username) return res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'JSON non valido.' });

  const { oldPassword, newPassword } = body;
  const passwordErr = validatePassword(newPassword);
  if (passwordErr) return res.status(400).json({ error: passwordErr });

  const store = getStore('zen-accounts');
  const key = `user:${payload.username}`;
  const account = await store.get(key, { type: 'json' });
  if (!account) return res.status(404).json({ error: 'Account non trovato.' });

  const oldOk = await bcrypt.compare(oldPassword || '', account.passwordHash);
  if (!oldOk) return res.status(401).json({ error: 'La password attuale non è corretta.' });

  account.passwordHash = await bcrypt.hash(newPassword, 10);
  await store.setJSON(key, account);

  res.status(200).json({ success: true });
};
