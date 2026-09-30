const bcrypt = require('bcryptjs');
const { getStore } = require('./_db');
const { createToken } = require('./_session');
const { normalizeUsername, validateUsername, validatePassword } = require('./_validate');
const { cors, parseBody } = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non permesso.' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'JSON non valido.' });

  const username = normalizeUsername(body.username);
  const { password, name, avatar } = body;

  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ error: usernameErr });

  const passwordErr = validatePassword(password);
  if (passwordErr) return res.status(400).json({ error: passwordErr });

  const store = getStore('zen-accounts');
  const key = `user:${username}`;

  const existing = await store.get(key, { type: 'json' });
  if (existing?.passwordHash) return res.status(409).json({ error: 'Questo username è già registrato.' });

  const passwordHash = await bcrypt.hash(password, 10);

  const account = {
    username,
    passwordHash,
    name: (name || username).toString().slice(0, 30),
    avatar: avatar || { type: 'svg', content: '' },
    plan: 'free',
    createdAt: new Date().toISOString(),
    chats: [],
    usage: { date: new Date().toDateString(), month: new Date().getMonth(), counts: {}, monthlyCounts: {} },
    zchatHandle: null,
    zchatContacts: [],
    zchatAiChat: [],
    zchatSettings: {},
    zchatE2ePublicKey: null,
    zchatAcceptedChats: [],
    zchatBlocks: {},
    zchatIncomingRequests: [],
    zchatStatus: null,
    zchatCallHistory: []
  };

  await store.setJSON(key, account);

  const token = createToken({ username });
  const { passwordHash: _omit, ...safeAccount } = account;
  res.status(201).json({ token, account: safeAccount });
};
