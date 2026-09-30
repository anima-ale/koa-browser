const { getAccount, setAccount, getStore } = require('./_db');
const { verifyToken, getTokenFromReq } = require('./_session');
const { getTierConfig, canAccessFeature } = require('./_tiers');

const CREATOR_HANDLE = 'thez3ncreator';
const CREATOR_USERNAME = '__z3ncreator__';

function normalizeHandle(handle) {
  return (handle || '').trim().toLowerCase().replace(/^@/, '');
}

function validateHandle(handle) {
  const h = normalizeHandle(handle);
  if (h.length < 3) return 'L\'handle deve avere almeno 3 caratteri.';
  if (h.length > 20) return 'L\'handle può avere massimo 20 caratteri.';
  if (!/^[a-z0-9_.]+$/.test(h)) return 'L\'handle può contenere solo lettere, numeri, punto e underscore.';
  return null;
}

function makeConvId(handleA, handleB) {
  return [normalizeHandle(handleA), normalizeHandle(handleB)].sort().join('_');
}

function msgId() {
  return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function ensureCreatorHandle() {
  const store = getStore('zchat-handles');
  const existing = await store.get(`handle:${CREATOR_HANDLE}`, { type: 'json' });
  if (!existing) {
    await store.setJSON(`handle:${CREATOR_HANDLE}`, {
      handle: CREATOR_HANDLE,
      username: CREATOR_USERNAME,
      name: '@theZ3Ncreator',
      isCreator: true,
      avatar: { type: 'initial', content: '@' },
      createdAt: new Date().toISOString()
    });
  }
}

async function ensureCreatorBinding(account) {
  if (!canAccessFeature(account.plan || 'free', 'creatorContact')) {
    return account;
  }
  const contacts = account.zchatContacts || [];
  const accepted = account.zchatAcceptedChats || [];
  const hasCreator = contacts.some(c => normalizeHandle(c.handle) === CREATOR_HANDLE);
  if (!hasCreator) {
    contacts.push({
      handle: CREATOR_HANDLE,
      username: CREATOR_USERNAME,
      name: '@theZ3Ncreator',
      nickname: 'Creatore ZEN',
      labels: ['creator', 'priority'],
      avatar: { type: 'initial', content: '@' },
      addedAt: new Date().toISOString()
    });
    if (!accepted.includes(CREATOR_HANDLE)) {
      accepted.push(CREATOR_HANDLE);
    }
    return { ...account, zchatContacts: contacts, zchatAcceptedChats: accepted };
  }
  return account;
}

async function requireAuth(req, res) {
  const token = getTokenFromReq(req);
  const payload = verifyToken(token);
  if (!payload || !payload.username) {
    res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' });
    return null;
  }
  const account = await getAccount(payload.username);
  if (!account) {
    res.status(404).json({ error: 'Account non trovato.' });
    return null;
  }
  const updatedAccount = await ensureCreatorBinding(account);
  if (updatedAccount !== account) {
    await setAccount(payload.username, updatedAccount);
  }
  await ensureCreatorHandle();
  return { payload, account: updatedAccount };
}

async function getHandleIndex(handle) {
  const store = getStore('zchat-handles');
  return store.get(`handle:${normalizeHandle(handle)}`, { type: 'json' });
}

async function setHandleIndex(handle, data) {
  const store = getStore('zchat-handles');
  await store.setJSON(`handle:${normalizeHandle(handle)}`, data);
}

async function removeHandleIndex(handle) {
  const store = getStore('zchat-handles');
  await store.delete(`handle:${normalizeHandle(handle)}`);
}

async function getConversation(convId) {
  const store = getStore('zchat-conversations');
  return store.get(`conv:${convId}`, { type: 'json' });
}

async function saveConversation(convId, conv) {
  const store = getStore('zchat-conversations');
  conv.updatedAt = new Date().toISOString();
  await store.setJSON(`conv:${convId}`, conv);
  return conv;
}

function publicProfile(entry) {
  if (!entry) return null;
  return {
    handle: entry.handle || normalizeHandle(entry.handle),
    name: entry.name || entry.handle,
    avatar: entry.avatar || { type: 'initial', content: (entry.name || '?')[0].toUpperCase() },
    status: entry.status || null,
    online: entry.online || false,
    lastSeen: entry.lastSeen || null
  };
}

async function getAccountByUsername(username) {
  return getAccount(username);
}

async function saveAccount(username, account) {
  return setAccount(username, account);
}

function isContact(account, handle) {
  const h = normalizeHandle(handle);
  return (account.zchatContacts || []).some(c => normalizeHandle(c.handle) === h);
}

function isAccepted(account, handle) {
  const h = normalizeHandle(handle);
  return (account.zchatAcceptedChats || []).includes(h);
}

function isBlocked(account, handle) {
  const h = normalizeHandle(handle);
  const block = (account.zchatBlocks || {})[h];
  return block && block.permanent;
}

function canReceiveFrom(recipient, senderHandle) {
  const h = normalizeHandle(senderHandle);
  if (isBlocked(recipient, h)) return { ok: false, reason: 'blocked' };
  if (isContact(recipient, h) || isAccepted(recipient, h)) return { ok: true };
  return { ok: false, reason: 'request' };
}

function parseBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  try { return JSON.parse(req.body || '{}'); }
  catch (e) { return null; }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
}

module.exports = {
  normalizeHandle,
  validateHandle,
  makeConvId,
  msgId,
  requireAuth,
  getHandleIndex,
  setHandleIndex,
  removeHandleIndex,
  getConversation,
  saveConversation,
  publicProfile,
  getAccountByUsername,
  saveAccount,
  isContact,
  isAccepted,
  isBlocked,
  canReceiveFrom,
  parseBody,
  cors,
  ensureCreatorBinding,
  CREATOR_HANDLE,
  CREATOR_USERNAME,
};