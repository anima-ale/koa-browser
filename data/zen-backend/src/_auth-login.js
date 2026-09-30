const bcrypt = require('bcryptjs');
const { getStore } = require('./_db');
const { createToken } = require('./_session');
const { normalizeUsername } = require('./_validate');
const { cors, parseBody } = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'JSON non valido.' });

  const username = normalizeUsername(body.username);
  const { password } = body;

  if (!username || !password) return res.status(400).json({ error: 'Username e password sono obbligatori.' });

  const store = getStore('zen-accounts');
  const key = `user:${username}`;
  const account = await store.get(key, { type: 'json' });

  if (!account) return res.status(401).json({ error: 'Credenziali non valide.' });

  const passwordOk = await bcrypt.compare(password, account.passwordHash);
  if (!passwordOk) return res.status(401).json({ error: 'Credenziali non valide.' });

  const token = createToken({ username });
  const { passwordHash: _omit, ...safeAccount } = account;
  res.status(200).json({ token, account: safeAccount });
};
