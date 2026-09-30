// ══════════════════════════════════════════════════════
// ZEN ACCOUNT — Registrazione
// POST /.netlify/functions/auth-register
// body: { username, password, name, avatar }
// ══════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const { getStore, connectLambda } = require('@netlify/blobs');
const { createToken, jsonResponse } = require('./_session');
const { normalizeUsername, validateUsername, validatePassword } = require('./_validate');

exports.handler = async (event) => {
  connectLambda(event); // richiesto in Lambda compatibility mode prima di usare getStore()
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo non permesso.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return jsonResponse(400, { error: 'JSON non valido.' }); }

  const username = normalizeUsername(body.username);
  const { password, name, avatar } = body;

  const usernameErr = validateUsername(username);
  if (usernameErr) return jsonResponse(400, { error: usernameErr });

  const passwordErr = validatePassword(password);
  if (passwordErr) return jsonResponse(400, { error: passwordErr });

  const store = getStore('zen-accounts');
  const key = `user:${username}`;

  const existing = await store.get(key, { type: 'json' });
  if (existing?.passwordHash) return jsonResponse(409, { error: 'Questo username è già registrato.' });

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
  return jsonResponse(201, { token, account: safeAccount });
};
