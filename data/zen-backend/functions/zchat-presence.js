// Z-CHAT — Presenza online/offline
const { getStore } = require('@netlify/blobs');
const { requireAuth, normalizeHandle, getHandleIndex, setHandleIndex, jsonResponse, connectLambda } = require('./_zchat');

const ONLINE_TTL_MS = 45000;

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});

  if (event.httpMethod === 'POST') {
    const auth = await requireAuth(event);
    if (auth.error) return auth.error;
    const { account } = auth;
    if (!account.zchatHandle) return jsonResponse(400, { error: 'Handle mancante.' });

    const store = getStore('zchat-presence');
    const handle = normalizeHandle(account.zchatHandle);
    await store.setJSON(`presence:${handle}`, {
      handle,
      username: account.username,
      online: true,
      lastSeen: new Date().toISOString()
    });

    const entry = await getHandleIndex(handle);
    if (entry) {
      entry.online = true;
      entry.lastSeen = new Date().toISOString();
      await setHandleIndex(handle, entry);
    }

    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod === 'GET') {
    const handles = (event.queryStringParameters?.handles || '').split(',').filter(Boolean);
    const store = getStore('zchat-presence');
    const now = Date.now();
    const result = {};

    for (const h of handles) {
      const handle = normalizeHandle(h);
      const p = await store.get(`presence:${handle}`, { type: 'json' });
      const online = p && p.lastSeen && (now - new Date(p.lastSeen).getTime() < ONLINE_TTL_MS);
      result[handle] = { online: !!online, lastSeen: p?.lastSeen || null };
    }

    return jsonResponse(200, { presence: result });
  }

  return jsonResponse(405, { error: 'Metodo non permesso.' });
};
